import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Heatmap } from "@/components/statistics/Heatmap";
import { PeriodTabs } from "@/components/statistics/PeriodTabs";
import { CountBars, DrawdownChart, PnlBars } from "@/components/statistics/charts";
import { buttonStyles, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts, getPlan, getTransactions } from "@/lib/data";
import { formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import {
  avgDuration, byDuration, byGrade, bySession, bySide, byTag, mistakeCost, type GroupRow, coreStats, drawdownSeries, heatmap, instrumentTable, monthly, rHistogram, riskConsistency, rMultiples, ruleCost, SESSION_IDS, winLossStreaks,
} from "@/lib/analytics";
import { equityCurve, filterByPeriod, maxDrawdown, periods, periodStart, type Period } from "@/lib/statistics";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("adv.title") };
}

export default async function AdvancedStatisticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const { supabase, user, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);

  const [accounts, all, plan, txs] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase), getPlan(supabase, user.id), getTransactions(supabase)]);
  const requested: Period = periods.includes(sp.period as Period) ? (sp.period as Period) : "30d";
  const period: Period = requested === "all" && plan !== "pro" ? "30d" : requested;
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);
  const none = t("stats.none");
  const num = (v: number | null, d = 2) => (v === null ? none : formatNumber(v, locale, d));
  const pctText = (v: number | null) => (v === null ? none : `${formatNumber(v, locale, 1)}%`);

  const trades = filterByPeriod(all, period);

  // Кривая баланса за период (как на странице статистики: пополнения и выводы не считаются прибылью или просадкой)
  const inPeriod = new Set(trades.map((x) => x.id));
  const startingTotal = accounts.reduce((s, a) => s + a.starting_balance, 0);
  const pnlBefore = all.filter((x) => !inPeriod.has(x.id)).reduce((s, x) => s + x.pnl, 0);
  const flows = txs.map((x) => ({ ts: new Date(x.occurredAt).getTime(), amount: x.kind === "deposit" ? x.amount : -x.amount }));
  const cut = periodStart(period)?.getTime() ?? null;
  const flowsBefore = cut === null ? 0 : flows.filter((f) => f.ts < cut).reduce((s, f) => s + f.amount, 0);
  const curve = equityCurve(trades, startingTotal + pnlBefore + flowsBefore);
  const dd = maxDrawdown(curve);

  const core = coreStats(trades);
  const rs = rMultiples(trades);
  const streaks = winLossStreaks(trades);
  const side = bySide(trades);
  const sessions = bySession(trades);
  const risk = riskConsistency(trades);
  const rules = ruleCost(trades);
  const instruments = instrumentTable(trades);
  const tagRows = byTag(trades);
  const gradeRows = byGrade(trades);
  const mistakeRows = mistakeCost(trades);
  const durationRows = byDuration(trades);
  const avgDur = avgDuration(trades);
  const minText = (m: number | null) => (m === null ? none : m >= 1440 ? t("journal.units.d", { n: formatNumber(m / 1440, locale, 1) }) : m >= 60 ? t("journal.units.h", { n: formatNumber(m / 60, locale, 1) }) : t("journal.units.m", { n: Math.round(m) }));
  const groupCard = (title: string, rows: (GroupRow & { label: string })[], emptyText: string, subtitle?: string) => (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <Table>
          <THead>
            <Tr><Th /><Th>{t("journal.an.trades")}</Th><Th>{t("journal.an.winRate")}</Th><Th>{t("journal.an.pnl")}</Th><Th>{t("journal.an.avg")}</Th></Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.key}>
                <Td label={title} className="font-medium">{r.label}</Td>
                <Td label={t("journal.an.trades")}>{r.count}</Td>
                <Td label={t("journal.an.winRate")}>{pctText(r.winRate)}</Td>
                <Td label={t("journal.an.pnl")} className={cn("tabular-nums", pnlTone(r.pnl))}>{money(r.pnl, true)}</Td>
                <Td label={t("journal.an.avg")} className="tabular-nums">{money(r.avgPnl, true)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
  const months = monthly(all, tz);
  const monthName = (key: string) => new Intl.DateTimeFormat({ ru: "ru-RU", uz: "uz-UZ", en: "en-US" }[locale], { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));

  const kpis: { label: string; hint?: string; value: string; tone?: string }[] = [
    { label: t("adv.kpi.expectancy"), hint: t("adv.kpiHint.expectancy"), value: core.expectancy === null ? none : money(core.expectancy, true), tone: core.expectancy === null ? "" : pnlTone(core.expectancy) },
    { label: t("adv.kpi.payoff"), hint: t("adv.kpiHint.payoff"), value: num(core.payoff) },
    { label: t("adv.kpi.profitFactor"), value: num(core.profitFactor) },
    { label: t("adv.kpi.winRate"), value: pctText(core.winRate) },
    { label: t("adv.kpi.avgR"), hint: t("adv.kpiHint.avgR"), value: core.avgR === null ? none : `${formatNumber(core.avgR, locale, 2)} R`, tone: core.avgR === null ? "" : pnlTone(core.avgR) },
    { label: t("adv.kpi.longestWin"), value: String(streaks.longestWin) },
    { label: t("adv.kpi.longestLoss"), value: String(streaks.longestLoss) },
  ];

  const rLabel = (from: number, to: number) => (!Number.isFinite(from) ? `< ${to}R` : !Number.isFinite(to) ? `> ${from}R` : `${from}…${to}`);
  const rBins = rHistogram(rs).map((b) => ({ name: rLabel(b.from, b.to), count: b.count, tone: b.to <= 0 ? ("bad" as const) : b.from >= 0 ? ("good" as const) : ("neutral" as const) }));

  const sideRow = (key: "long" | "short") => {
    const s = side[key];
    return (
      <Tr key={key}>
        <Td label={t("adv.side.title")} className="font-medium">{t(`adv.side.${key}`)}</Td>
        <Td label={t("adv.side.trades")}>{s.count}</Td>
        <Td label={t("adv.side.winRate")}>{pctText(s.winRate)}</Td>
        <Td label={t("adv.side.pnl")} className={cn("tabular-nums", pnlTone(s.pnl))}>{s.count ? money(s.pnl, true) : none}</Td>
        <Td label={t("adv.side.avg")} className="tabular-nums">{s.avgPnl === null ? none : money(s.avgPnl, true)}</Td>
      </Tr>
    );
  };

  return (
    <div className="space-y-6">
      <Link href="/statistics" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("adv.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("adv.title")}</h1>
          <p className="mt-1 max-w-2xl text-muted">{t("adv.subtitle")}</p>
        </div>
        <PeriodTabs current={period} plan={plan} basePath="/statistics/advanced" />
      </div>

      {all.length === 0 || trades.length === 0 ? (
        <Card className="flex flex-col items-center gap-5 py-12 text-center">
          <p className="max-w-md text-lg">{t("trades.empty.title")}</p>
          <Link href="/trades/new" className={buttonStyles({ size: "lg" })}>{t("trades.empty.cta")}</Link>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label} className="p-4 sm:p-4" title={k.hint}>
                <p className="text-sm text-muted">{k.label}</p>
                <p className={cn("mt-1 text-xl font-bold tabular-nums", k.tone)}>{k.value}</p>
                {k.hint && <p className="mt-1 text-xs leading-snug text-muted">{k.hint}</p>}
              </Card>
            ))}
          </div>

          <Card className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("adv.r.title")}</h2>
              <p className="mt-1 text-sm text-muted">{rs.length ? t("adv.r.subtitle") : t("adv.r.none")}</p>
            </div>
            {rs.length > 0 && (
              <>
                <CountBars data={rBins} label={t("adv.r.title")} />
                <p className="text-xs text-muted">{t("adv.r.note", { n: rs.length, total: trades.length })}</p>
              </>
            )}
          </Card>

          <Card className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("adv.heat.title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("adv.heat.subtitle", { tz })}</p>
            </div>
            <Heatmap cells={heatmap(trades, tz)} currency={currency} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">{t("adv.side.title")}</h2>
              <Table>
                <THead>
                  <Tr><Th /><Th>{t("adv.side.trades")}</Th><Th>{t("adv.side.winRate")}</Th><Th>{t("adv.side.pnl")}</Th><Th>{t("adv.side.avg")}</Th></Tr>
                </THead>
                <TBody>{sideRow("long")}{sideRow("short")}</TBody>
              </Table>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">{t("adv.risk.title")}</h2>
              {risk.count === 0 ? (
                <p className="text-sm text-muted">{t("adv.risk.none")}</p>
              ) : (
                <>
                  <dl className="divide-y divide-border text-sm">
                    {[
                      [t("adv.risk.avg"), money(risk.avg as number)],
                      [t("adv.risk.min"), money(risk.min as number)],
                      [t("adv.risk.max"), money(risk.max as number)],
                      [t("adv.risk.variation"), pctText(risk.variation)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted">{t("adv.risk.hint")}</p>
                </>
              )}
            </Card>
          </div>

          <Card className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("adv.sessions.title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("adv.sessions.subtitle")}</p>
            </div>
            <Table>
              <THead>
                <Tr><Th /><Th>{t("adv.sessions.trades")}</Th><Th>{t("adv.sessions.winRate")}</Th><Th>{t("adv.sessions.pnl")}</Th><Th>{t("adv.sessions.violations")}</Th></Tr>
              </THead>
              <TBody>
                {SESSION_IDS.map((id) => {
                  const s = sessions.find((x) => x.id === id)!;
                  return (
                    <Tr key={id}>
                      <Td label={t("adv.sessions.title")} className="font-medium">{t(`adv.sessions.${id}`)}</Td>
                      <Td label={t("adv.sessions.trades")}>{s.count}</Td>
                      <Td label={t("adv.sessions.winRate")}>{pctText(s.winRate)}</Td>
                      <Td label={t("adv.sessions.pnl")} className={cn("tabular-nums", pnlTone(s.pnl))}>{s.count ? money(s.pnl, true) : none}</Td>
                      <Td label={t("adv.sessions.violations")}>{pctText(s.violationRate)}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t("adv.dd.title")}</h2>
            {curve.length < 2 ? (
              <p className="text-sm text-muted">{t("adv.dd.none")}</p>
            ) : (
              <>
                <p className="text-sm text-muted">{t("adv.dd.max", { amount: money(dd.amount), percent: `${formatNumber(dd.percent, locale, 1)}%` })}</p>
                <DrawdownChart data={drawdownSeries(curve)} currency={currency} label={t("adv.dd.title")} />
              </>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t("adv.months.title")}</h2>
            <PnlBars label={t("adv.months.title")} currency={currency} data={months.map((m) => ({ name: monthName(m.key), value: Math.round(m.pnl * 100) / 100, count: m.count }))} />
          </Card>

          <Card className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("adv.rules.title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("adv.rules.subtitle")}</p>
            </div>
            {rules.length === 0 ? (
              <p className="text-sm text-muted">{t("adv.rules.none")}</p>
            ) : (
              <Table>
                <THead>
                  <Tr><Th>{t("adv.rules.rule")}</Th><Th>{t("adv.rules.count")}</Th><Th>{t("adv.rules.pnl")}</Th><Th>{t("adv.rules.avg")}</Th></Tr>
                </THead>
                <TBody>
                  {rules.map((r) => (
                    <Tr key={r.id}>
                      <Td label={t("adv.rules.rule")} className="font-medium">{r.name}</Td>
                      <Td label={t("adv.rules.count")}>{r.count}</Td>
                      <Td label={t("adv.rules.pnl")} className={cn("tabular-nums", pnlTone(r.pnl))}>{money(r.pnl, true)}</Td>
                      <Td label={t("adv.rules.avg")} className="tabular-nums">{money(r.avgPnl, true)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {groupCard(t("journal.an.mistakes"), mistakeRows.map((r) => ({ ...r, label: t(`journal.mistakeNames.${r.key}`) })), t("journal.an.noMistakes"), t("journal.an.mistakesHint"))}
          <div className="grid gap-6 lg:grid-cols-2">
            {groupCard(t("journal.an.grades"), gradeRows.map((r) => ({ ...r, label: t("journal.gradeShort", { g: r.key }) })), t("journal.an.noGrades"), t("journal.an.gradesHint"))}
            {groupCard(t("journal.an.tags"), tagRows.slice(0, 12).map((r) => ({ ...r, label: `#${r.key}` })), t("journal.an.noTags"))}
          </div>
          {groupCard(t("journal.an.duration"), durationRows.map((r) => ({ ...r, label: t(`journal.buckets.${r.bucket}`) })), t("journal.an.noDuration"), avgDur.count ? t("journal.an.avgDuration", { win: minText(avgDur.win), loss: minText(avgDur.loss) }) : undefined)}

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t("adv.instruments.title")}</h2>
            <Table>
              <THead>
                <Tr><Th>{t("adv.instruments.instrument")}</Th><Th>{t("adv.instruments.trades")}</Th><Th>{t("adv.instruments.winRate")}</Th><Th>{t("adv.instruments.pnl")}</Th><Th>{t("adv.instruments.avgR")}</Th></Tr>
              </THead>
              <TBody>
                {instruments.map((r) => (
                  <Tr key={r.instrument}>
                    <Td label={t("adv.instruments.instrument")} className="font-medium">{r.instrument}</Td>
                    <Td label={t("adv.instruments.trades")}>{r.count}</Td>
                    <Td label={t("adv.instruments.winRate")}>{pctText(r.winRate)}</Td>
                    <Td label={t("adv.instruments.pnl")} className={cn("tabular-nums", pnlTone(r.pnl))}>{money(r.pnl, true)}</Td>
                    <Td label={t("adv.instruments.avgR")} className="tabular-nums">{r.avgR === null ? none : `${formatNumber(r.avgR, locale, 2)} R`}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
