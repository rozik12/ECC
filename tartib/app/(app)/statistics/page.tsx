import type { Metadata } from "next";
import Link from "next/link";
import { WeeklyReportCard } from "@/components/reports/WeeklyReportCard";
import { DisciplineCostCard } from "@/components/statistics/DisciplineCostCard";
import { TimeAnalysis } from "@/components/statistics/TimeAnalysis";
import { EmotionAnalysis } from "@/components/statistics/EmotionAnalysis";
import { PnlCalendar } from "@/components/statistics/PnlCalendar";
import { PeriodTabs } from "@/components/statistics/PeriodTabs";
import { EquityChart, PnlBars } from "@/components/statistics/charts";
import { Badge, buttonStyles, Card } from "@/components/ui";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts, getPlan, getTransactions } from "@/lib/data";
import { getLatestWeeklyReport } from "@/services/reports";
import { formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import {
  byEmotion, disciplineCost, equityCurve, filterByPeriod, maxDrawdown, periods, periodStart, pnlByDay, pnlByInstrument,
  pnlByStrategy, summarize, type Period,
} from "@/lib/statistics";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.statistics") };
}

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ period?: string; month?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const { supabase, user, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);

  const [accounts, all, plan, latest, txs] = await Promise.all([
    getAccounts(supabase),
    fetchStatTrades(supabase),
    getPlan(supabase, user.id),
    getLatestWeeklyReport(supabase),
    getTransactions(supabase),
  ]);
  // «Всё время» — функция PRO
  const requested: Period = periods.includes(sp.period as Period) ? (sp.period as Period) : "30d";
  const period: Period = requested === "all" && plan !== "pro" ? "30d" : requested;
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);

  const trades = filterByPeriod(all, period);
  const inPeriod = new Set(trades.map((x) => x.id));
  const startingTotal = accounts.reduce((s, a) => s + a.starting_balance, 0);
  const pnlBefore = all.filter((x) => !inPeriod.has(x.id)).reduce((s, x) => s + x.pnl, 0);
  // Пополнения и выводы меняют баланс, но не должны выглядеть как прибыль, убыток или просадка
  const flows = txs.map((x) => ({ ts: new Date(x.occurredAt).getTime(), amount: x.kind === "deposit" ? x.amount : -x.amount }));
  const cut = periodStart(period)?.getTime() ?? null;
  const flowsBefore = cut === null ? 0 : flows.filter((f) => f.ts < cut).reduce((s, f) => s + f.amount, 0);
  const flowsInPeriod = cut === null ? flows : flows.filter((f) => f.ts >= cut);
  const startBalance = startingTotal + pnlBefore + flowsBefore;
  const curve = equityCurve(trades, startBalance, flowsInPeriod);
  const performanceCurve = equityCurve(trades, startBalance);

  const summary = summarize(trades);
  const drawdown = maxDrawdown(performanceCurve);
  const discipline = disciplineCost(trades);
  const emotions = byEmotion(trades);
  const none = t("stats.none");

  const kpis: { label: string; value: string; tone?: string }[] = [
    { label: t("stats.kpi.totalPnl"), value: trades.length ? money(summary.totalPnl, true) : none, tone: trades.length ? pnlTone(summary.totalPnl) : "" },
    { label: t("stats.kpi.winRate"), value: summary.winRate === null ? none : `${formatNumber(summary.winRate, locale, 1)}%` },
    { label: t("stats.kpi.profitFactor"), value: summary.profitFactor === null ? none : formatNumber(summary.profitFactor, locale, 2) },
    { label: t("stats.kpi.avgWin"), value: summary.avgWin === null ? none : money(summary.avgWin), tone: summary.avgWin ? "text-success" : "" },
    { label: t("stats.kpi.avgLoss"), value: summary.avgLoss === null ? none : money(-summary.avgLoss), tone: summary.avgLoss ? "text-danger" : "" },
    { label: t("stats.kpi.maxDrawdown"), value: trades.length ? `${money(-drawdown.amount)} (${formatNumber(drawdown.percent, locale, 1)}%)` : none },
    { label: t("stats.kpi.totalTrades"), value: String(summary.totalTrades) },
    { label: t("stats.kpi.avgR"), value: summary.avgR === null ? none : `${formatNumber(summary.avgR, locale, 2)} R` },
  ];

  const nowParts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date()).split("-");
  const curYear = Number(nowParts[0]);
  const curMonth = Number(nowParts[1]);
  const m = /^(\d{4})-(\d{2})$/.exec(sp.month ?? "");
  let year = m ? Number(m[1]) : curYear;
  let month = m ? Number(m[2]) : curMonth;
  if (month < 1 || month > 12 || year * 12 + month > curYear * 12 + curMonth || year < 2000) {
    year = curYear;
    month = curMonth;
  }
  const monthHref = (y: number, mo: number) => {
    const qs = new URLSearchParams();
    if (requested !== "30d") qs.set("period", requested);
    qs.set("month", `${y}-${String(mo).padStart(2, "0")}`);
    return `/statistics?${qs.toString()}`;
  };
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nxt = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const hasNext = nxt.y * 12 + nxt.m <= curYear * 12 + curMonth;
  const strategies = pnlByStrategy(trades);

  const rulesData = [
    { name: t("trades.rulesFollowed"), value: discipline.followedPnl, count: discipline.followedCount },
    { name: t("trades.rulesViolated"), value: discipline.violatedPnl, count: discipline.violatedCount },
  ].filter((d) => d.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("stats.title")}</h1>
          <p className="mt-1 text-muted">{t("stats.subtitle")}</p>
        </div>
        <PeriodTabs current={period} plan={plan} />
      </div>

      {all.length === 0 ? (
        <Card className="flex flex-col items-center gap-5 py-12 text-center">
          <p className="max-w-md text-lg">{t("trades.empty.title")}</p>
          <Link href="/trades/new" className={buttonStyles({ size: "lg" })}>{t("trades.empty.cta")}</Link>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label} className="p-4 sm:p-4">
                <p className="text-sm text-muted">{k.label}</p>
                <p className={cn("mt-1 text-xl font-bold tabular-nums", k.tone)}>{k.value}</p>
              </Card>
            ))}
          </div>

          <DisciplineCostCard data={discipline} currency={currency} />

          <Card>
            <h2 className="mb-3 font-semibold">{t("stats.charts.equity")}</h2>
            <EquityChart data={curve} currency={currency} />
          </Card>

          <PnlCalendar days={pnlByDay(all, tz)} year={year} month={month} currency={currency}
            prevHref={monthHref(prev.y, prev.m)} nextHref={hasNext ? monthHref(nxt.y, nxt.m) : null} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">{t("stats.charts.byDay")}</h2>
              <PnlBars
                label={t("stats.charts.byDay")}
                currency={currency}
                data={pnlByDay(trades, tz).map((b) => ({ name: b.key.slice(8) + "." + b.key.slice(5, 7), value: Math.round(b.pnl * 100) / 100, count: b.count }))}
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">{t("stats.charts.byRules")}</h2>
              <PnlBars label={t("stats.charts.byRules")} currency={currency} layout="rows" data={rulesData} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">{t("stats.charts.byInstrument")}</h2>
              <PnlBars
                label={t("stats.charts.byInstrument")}
                currency={currency}
                layout="rows"
                data={pnlByInstrument(trades).map((b) => ({ name: b.key, value: Math.round(b.pnl * 100) / 100, count: b.count }))}
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">{t("stats.charts.byEmotion")}</h2>
              <PnlBars
                label={t("stats.charts.byEmotion")}
                currency={currency}
                layout="rows"
                data={emotions.map((e) => ({ name: t(`emotions.${e.emotion}`), value: Math.round(e.total * 100) / 100, count: e.count }))}
              />
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">{t("stats.charts.byStrategy")}</h2>
              {plan !== "pro" && <Badge tone="primary">PRO</Badge>}
            </div>
            {plan !== "pro" ? (
              <p className="flex items-start gap-2 text-sm text-muted"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("stats.proOnly")}</p>
            ) : strategies.length === 0 ? (
              <p className="text-sm text-muted">{t("stats.charts.noStrategy")}</p>
            ) : (
              <PnlBars label={t("stats.charts.byStrategy")} currency={currency} layout="rows"
                data={strategies.map((b) => ({ name: b.key, value: Math.round(b.pnl * 100) / 100, count: b.count }))} />
            )}
          </Card>

          <EmotionAnalysis stats={emotions} currency={currency} />
          <TimeAnalysis trades={trades} timeZone={tz} currency={currency} />
          <WeeklyReportCard plan={plan} report={latest?.content ?? null} currency={currency} />
        </>
      )}
    </div>
  );
}
