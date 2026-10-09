import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PeriodTabs } from "@/components/statistics/PeriodTabs";
import { PrintButton } from "@/components/statistics/PrintButton";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts, getPlan } from "@/lib/data";
import { formatDateTime, formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { coreStats, instrumentTable, mistakeCost, ruleCost } from "@/lib/analytics";
import { equityCurve, filterByPeriod, maxDrawdown, periods, type Period } from "@/lib/statistics";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("report.title") };
}

/** Страница-отчёт для печати или сохранения в PDF: итоги периода, цена нарушений, инструменты и последние сделки. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const { supabase, user, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);
  const [accounts, all, plan] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase), getPlan(supabase, user.id)]);
  const requested: Period = periods.includes(sp.period as Period) ? (sp.period as Period) : "30d";
  const period: Period = requested === "all" && plan !== "pro" ? "30d" : requested;
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);
  const none = t("stats.none");
  const trades = filterByPeriod(all, period);

  const core = coreStats(trades);
  const net = trades.reduce((s, x) => s + x.pnl, 0);
  const followed = trades.filter((x) => x.rulesFollowed).length;
  const startTotal = accounts.reduce((s, a) => s + a.starting_balance, 0);
  const dd = maxDrawdown(equityCurve(trades, startTotal + all.filter((x) => !trades.includes(x)).reduce((s, x) => s + x.pnl, 0)));
  const rules = ruleCost(trades).slice(0, 5);
  const mistakes = mistakeCost(trades).slice(0, 5);
  const instruments = instrumentTable(trades).slice(0, 5);
  const last = [...trades].sort((a, b) => b.tradedAt.localeCompare(a.tradedAt)).slice(0, 15);
  const now = formatDateTime(new Date().toISOString(), locale, tz);

  const kpis: [string, string, string?][] = [
    [t("report.trades"), String(core.count)],
    [t("report.net"), money(net, true), pnlTone(net)],
    [t("report.winRate"), core.winRate === null ? none : `${formatNumber(core.winRate, locale, 1)}%`],
    [t("report.profitFactor"), core.profitFactor === null ? none : formatNumber(core.profitFactor, locale, 2)],
    [t("report.expectancy"), core.expectancy === null ? none : money(core.expectancy, true), core.expectancy === null ? undefined : pnlTone(core.expectancy)],
    [t("report.maxDd"), dd.amount > 0 ? `${money(dd.amount)} (${formatNumber(dd.percent, locale, 1)}%)` : none],
    [t("report.discipline"), trades.length ? `${formatNumber((followed / trades.length) * 100, locale, 0)}%` : none],
  ];

  const table = (title: string, head: string[], rows: (string | { v: string; tone?: string })[][]) => rows.length === 0 ? null : (
    <section className="break-inside-avoid space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-muted">{head.map((h, i) => <th key={i} className={cn("py-1.5 pr-3 font-medium", i > 0 && "text-right")}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              {r.map((c, j) => {
                const cell = typeof c === "string" ? { v: c } : c;
                return <td key={j} className={cn("py-1.5 pr-3 tabular-nums", j === 0 ? "break-words" : "whitespace-nowrap text-right", cell.tone)}>{cell.v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 print:hidden">
        <Link href="/statistics" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t("adv.back")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PeriodTabs current={period} plan={plan} basePath="/statistics/report" />
          <PrintButton />
        </div>
        <p className="text-sm text-muted">{t("report.hint")}</p>
      </div>

      <header className="border-b border-border pb-3">
        <h1 className="text-2xl font-bold">{t("report.title")}</h1>
        <p className="mt-1 text-sm text-muted">{profile?.name ? `${profile.name} · ` : ""}{t(`stats.period.${period}`)} · {t("report.generated", { date: now })}</p>
      </header>

      {trades.length === 0 ? (
        <p className="text-muted">{t("report.empty")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {kpis.map(([label, value, tone]) => (
              <div key={label} className="break-inside-avoid"><dt className="text-xs text-muted">{label}</dt><dd className={cn("text-lg font-bold tabular-nums", tone)}>{value}</dd></div>
            ))}
          </dl>
          {table(t("report.rulesCost"), [t("adv.rules.rule"), t("adv.rules.count"), t("adv.rules.pnl")], rules.map((r) => [r.name, String(r.count), { v: money(r.pnl, true), tone: pnlTone(r.pnl) }]))}
          {table(t("journal.an.mistakes"), [t("journal.mistake"), t("journal.an.trades"), t("journal.an.pnl")], mistakes.map((r) => [t(`journal.mistakeNames.${r.key}`), String(r.count), { v: money(r.pnl, true), tone: pnlTone(r.pnl) }]))}
          {table(t("adv.instruments.title"), [t("adv.instruments.instrument"), t("adv.instruments.trades"), t("adv.instruments.pnl")], instruments.map((r) => [r.instrument, String(r.count), { v: money(r.pnl, true), tone: pnlTone(r.pnl) }]))}
          {table(t("report.lastTrades"), [t("trades.cols.date"), t("trades.cols.instrument"), t("trades.cols.direction"), t("trades.cols.pnl")], last.map((x) => [formatDateTime(x.tradedAt, locale, tz), x.instrument, t(`directions.${x.direction}`), { v: money(x.pnl, true), tone: pnlTone(x.pnl) }]))}
        </>
      )}
    </div>
  );
}
