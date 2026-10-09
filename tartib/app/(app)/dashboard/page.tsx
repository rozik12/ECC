import type { Metadata } from "next";
import Link from "next/link";
import { Info, NotebookText } from "lucide-react";
import { AchievementsCard } from "@/components/statistics/AchievementsCard";
import { GoalCard } from "@/components/statistics/GoalCard";
import { PeriodTabs } from "@/components/statistics/PeriodTabs";
import { DayHero } from "@/components/dashboard/DayHero";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { StreakCard } from "@/components/statistics/StreakCard";
import { DisciplineCostCard } from "@/components/statistics/DisciplineCostCard";
import { EmotionBadge } from "@/components/trades/EmotionBadge";
import { Badge, buttonStyles, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { computeAchievements, daysSinceLastTrade, monthDiscipline } from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts, getPlan, getRules } from "@/lib/data";
import { formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { dailyLimit, losingRun } from "@/lib/risk-stats";
import { disciplineCost, disciplineStreak, filterByPeriod, summarize, topViolations } from "@/lib/statistics";
import { dayBounds, safeTimeZone } from "@/lib/time";
import type { EmotionKey } from "@/lib/trading";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.dashboard") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { t, locale } = await getTranslator();
  const { supabase, user, profile } = await requireUser();
  const sp = await searchParams;
  const period: "7d" | "30d" = sp.period === "7d" ? "7d" : "30d";
  const [accounts, all, plan, rules] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase), getPlan(supabase, user.id), getRules(supabase)]);

  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);

  const { start, end } = dayBounds(safeTimeZone(profile?.timezone));
  const today = all.filter((x) => {
    const at = new Date(x.tradedAt);
    return at >= start && at < end;
  });
  const todaySummary = summarize(today);
  const balance = accounts.reduce((s, a) => s + a.balance, 0);

  const limitRule = rules.find((r) => r.is_active && r.rule_type === "max_daily_loss_percent" && r.value !== null && r.value > 0);
  const limitState = limitRule ? dailyLimit(todaySummary.totalPnl, balance - todaySummary.totalPnl, limitRule.value as number) : null;
  const run = losingRun(all, new Date());

  const inPeriod = filterByPeriod(all, period);
  const discipline = disciplineCost(inPeriod);
  const violations = topViolations(inPeriod);
  const recent = all.slice(0, 5);
  const streak = disciplineStreak(all);
  const goal = monthDiscipline(all, profile?.discipline_goal ?? 80, safeTimeZone(profile?.timezone));
  const achievements = computeAchievements(all);
  const daysSinceLast = daysSinceLastTrade(all);

  const [{ count: diaryCount }, { data: tgLink }] = await Promise.all([
    supabase.from("diary_entries").select("id", { count: "exact", head: true }),
    supabase.from("telegram_links").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const startSteps = [
    { key: "trade" as const, done: all.length > 0, href: "/trades/new" },
    { key: "journal" as const, done: all.some((x) => (x.tags ?? []).length > 0 || x.grade || (x.mistakes ?? []).length > 0), href: "/trades/new" },
    { key: "diary" as const, done: (diaryCount ?? 0) > 0, href: "/diary" },
    { key: "telegram" as const, done: !!tgLink, href: "/profile" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold sm:text-2xl">
        {profile?.name ? t("dashboard.greeting", { name: profile.name }) : t("pages.dashboard")}
      </h1>

      <DayHero
        pnlText={today.length ? money(todaySummary.totalPnl, true) : money(0)}
        pnlTone={today.length ? pnlTone(todaySummary.totalPnl) : "text-muted"}
        tradesToday={today.length}
        violationsToday={today.filter((x) => !x.rulesFollowed).length}
        winRateText={todaySummary.winRate === null ? t("stats.none") : `${formatNumber(todaySummary.winRate, locale, 0)}%`}
        balanceText={money(balance)}
        monthPercent={goal.percent}
        goal={goal.goal}
        losingDay={today.length > 0 && todaySummary.totalPnl < 0}
        limit={limitState && limitRule ? { pct: limitRule.value as number, lossPct: limitState.lossPct, usedPct: limitState.usedPct, level: limitState.level } : null}
        lossRun={run.count}
      />

      <GettingStarted steps={startSteps} />

      {daysSinceLast !== null && daysSinceLast >= 3 && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{t("reminder.title", { n: daysSinceLast })}</span>
          <Link href="/trades/quick" className="font-medium text-primary hover:underline">{t("quick.button")}</Link>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodTabs current={period} plan={plan} basePath="/dashboard" hideAll />
      </div>
      <DisciplineCostCard data={discipline} currency={currency} subtitle={t(period === "7d" ? "dashboard.discipline.period7d" : "dashboard.discipline.period")} moreHref="/statistics" />

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
            <Link href="/trades" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">{t("dashboard.recent.all")} →</Link>
          )}
        </div>
        {recent.length === 0 ? (
          <Card className="flex flex-col items-center gap-5 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary"><NotebookText className="h-8 w-8" aria-hidden /></span>
            <p className="max-w-md text-lg font-medium">{t("trades.empty.title")}</p>
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
                    <Link href={`/trades/${r.id}`} className="inline-block py-2 font-semibold text-primary hover:underline">{r.instrument}</Link>
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
          <p className="text-sm text-muted">{t(period === "7d" ? "dashboard.violations.period7d" : "dashboard.violations.period")}</p>
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
