import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Zap } from "lucide-react";
import { AchievementsCard } from "@/components/statistics/AchievementsCard";
import { GoalCard } from "@/components/statistics/GoalCard";
import { StreakCard } from "@/components/statistics/StreakCard";
import { DisciplineCostCard } from "@/components/statistics/DisciplineCostCard";
import { EmotionBadge } from "@/components/trades/EmotionBadge";
import { Alert, Badge, buttonStyles, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { computeAchievements, daysSinceLastTrade, monthDiscipline } from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts } from "@/lib/data";
import { formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { disciplineCost, disciplineStreak, filterByPeriod, summarize, topViolations } from "@/lib/statistics";
import { dayBounds, safeTimeZone } from "@/lib/time";
import type { EmotionKey } from "@/lib/trading";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.dashboard") };
}

export default async function DashboardPage() {
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const [accounts, all] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase)]);

  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);

  const { start, end } = dayBounds(safeTimeZone(profile?.timezone));
  const today = all.filter((x) => {
    const at = new Date(x.tradedAt);
    return at >= start && at < end;
  });
  const todaySummary = summarize(today);
  const balance = accounts.reduce((s, a) => s + a.balance, 0);

  const last30 = filterByPeriod(all, "30d");
  const discipline = disciplineCost(last30);
  const violations = topViolations(last30);
  const recent = all.slice(0, 5);
  const streak = disciplineStreak(all);
  const goal = monthDiscipline(all, profile?.discipline_goal ?? 80, safeTimeZone(profile?.timezone));
  const achievements = computeAchievements(all);
  const daysSinceLast = daysSinceLastTrade(all);

  const stat = (label: string, value: string, tone = "") => (
    <Card className="p-4 sm:p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", tone)}>{value}</p>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {profile?.name ? t("dashboard.greeting", { name: profile.name }) : t("pages.dashboard")}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/trades/quick" className={buttonStyles({ variant: "secondary" })}>
            <Zap className="h-4 w-4" aria-hidden /> {t("quick.button")}
          </Link>
          <Link href="/trades/new" className={buttonStyles()}>
            <Plus className="h-4 w-4" aria-hidden /> {t("trades.add")}
          </Link>
        </div>
      </div>

      {daysSinceLast !== null && daysSinceLast >= 3 && (
        <Alert tone="info" title={t("reminder.title", { n: daysSinceLast })}>
          {t("reminder.text")} <Link href="/trades/quick" className="font-medium text-primary hover:underline">{t("quick.button")}</Link>
        </Alert>
      )}

      <section aria-labelledby="today-title">
        <h2 id="today-title" className="mb-3 font-semibold">{t("dashboard.today.title")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat(t("dashboard.today.balance"), money(balance))}
          {stat(t("dashboard.today.pnl"), today.length ? money(todaySummary.totalPnl, true) : money(0), today.length ? pnlTone(todaySummary.totalPnl) : "text-muted")}
          {stat(t("dashboard.today.trades"), String(today.length))}
          {stat(t("dashboard.today.winRate"), todaySummary.winRate === null ? t("stats.none") : `${formatNumber(todaySummary.winRate, locale, 0)}%`)}
        </div>
      </section>

      <DisciplineCostCard data={discipline} currency={currency} subtitle={t("dashboard.discipline.period")} moreHref="/statistics" />

      {all.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <StreakCard streak={streak} />
          <GoalCard data={goal} />
        </div>
      )}
      {all.length > 0 && <AchievementsCard items={achievements} />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t("dashboard.recent.title")}</h2>
          {recent.length > 0 && (
            <Link href="/trades" className="text-sm font-medium text-primary hover:underline">{t("dashboard.recent.all")} →</Link>
          )}
        </div>
        {recent.length === 0 ? (
          <Card className="flex flex-col items-center gap-5 py-10 text-center">
            <p className="max-w-md">{t("trades.empty.title")}</p>
            <Link href="/trades/new" className={buttonStyles({ size: "lg" })}>{t("trades.empty.cta")}</Link>
          </Card>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{t("trades.cols.instrument")}</Th><Th>{t("trades.cols.direction")}</Th><Th>{t("trades.cols.entry")}</Th>
                <Th>{t("trades.cols.exit")}</Th><Th>{t("trades.cols.pnl")}</Th><Th>{t("trades.cols.emotion")}</Th><Th>{t("trades.cols.rules")}</Th>
              </Tr>
            </THead>
            <TBody>
              {recent.map((r) => (
                <Tr key={r.id}>
                  <Td label={t("trades.cols.instrument")}>
                    <Link href={`/trades/${r.id}`} className="font-semibold text-primary hover:underline">{r.instrument}</Link>
                  </Td>
                  <Td label={t("trades.cols.direction")}><Badge tone={r.direction === "long" ? "success" : "danger"}>{t(`directions.${r.direction}`)}</Badge></Td>
                  <Td label={t("trades.cols.entry")} className="tabular-nums">{formatNumber(r.entryPrice, locale, 8)}</Td>
                  <Td label={t("trades.cols.exit")} className="tabular-nums">{r.exitPrice === null ? "—" : formatNumber(r.exitPrice, locale, 8)}</Td>
                  <Td label={t("trades.cols.pnl")} className={cn("font-semibold tabular-nums", pnlTone(r.pnl))}>{money(r.pnl, true)}</Td>
                  <Td label={t("trades.cols.emotion")}><EmotionBadge emotion={r.emotion as EmotionKey} label={t(`emotions.${r.emotion}`)} /></Td>
                  <Td label={t("trades.cols.rules")}>
                    {r.rulesFollowed ? <Badge tone="success">✓ {t("trades.rulesFollowed")}</Badge> : <Badge tone="warning">⚠ {t("trades.rulesViolated")}</Badge>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t("dashboard.violations.title")}</h2>
          <p className="text-sm text-muted">{t("dashboard.violations.period")}</p>
        </div>
        {violations.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("dashboard.violations.none")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {violations.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{v.name}</span>
                <Badge tone="warning">{t("dashboard.violations.times", { n: v.count })}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
