// Копии расчётов статистики и достижений с сайта (lib/statistics, lib/achievements).
// Совпадение с оригиналом проверяет tests/telegram-bot-sync.test.ts.

export type Violation = { id: string; name: string };
export type StatTrade = {
  id: string;
  tradedAt: string;
  instrument: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  pnl: number;
  emotion: string;
  rulesFollowed: boolean;
  riskAmount: number | null;
  strategy: string;
  violations: Violation[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const byTime = (a: { tradedAt: string }, b: { tradedAt: string }) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime();
const DAY_MS = 24 * 3600 * 1000;

export type Summary = {
  totalTrades: number; totalPnl: number; wins: number; losses: number; winRate: number | null;
  profitFactor: number | null; grossProfit: number; grossLoss: number; avgWin: number | null; avgLoss: number | null;
};

export function summarize(trades: StatTrade[]): Summary {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = sum(wins.map((t) => t.pnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t.pnl)));
  return {
    totalTrades: trades.length,
    totalPnl: sum(trades.map((t) => t.pnl)),
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    grossProfit,
    grossLoss,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
  };
}

export type Bucket = { key: string; pnl: number; count: number };

export function groupBy(trades: StatTrade[], keyOf: (t: StatTrade) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const t of trades) {
    const key = keyOf(t);
    const b = map.get(key) ?? { key, pnl: 0, count: 0 };
    b.pnl += t.pnl;
    b.count += 1;
    map.set(key, b);
  }
  return [...map.values()];
}

export const pnlByInstrument = (trades: StatTrade[]): Bucket[] => groupBy(trades, (t) => t.instrument).sort((a, b) => b.pnl - a.pnl);

export type EmotionStat = { emotion: string; count: number; total: number; average: number };
export function byEmotion(trades: StatTrade[]): EmotionStat[] {
  return groupBy(trades, (t) => t.emotion)
    .map((b) => ({ emotion: b.key, count: b.count, total: b.pnl, average: b.pnl / b.count }))
    .sort((a, b) => a.average - b.average);
}

export type DisciplineCost = { followedPnl: number; violatedPnl: number; followedCount: number; violatedCount: number; cost: number; difference: number };
export function disciplineCost(trades: StatTrade[]): DisciplineCost {
  const followed = trades.filter((t) => t.rulesFollowed);
  const violated = trades.filter((t) => !t.rulesFollowed);
  const followedPnl = sum(followed.map((t) => t.pnl));
  const violatedPnl = sum(violated.map((t) => t.pnl));
  return {
    followedPnl, violatedPnl, followedCount: followed.length, violatedCount: violated.length,
    cost: violatedPnl < 0 ? Math.abs(violatedPnl) : 0,
    difference: followedPnl - violatedPnl,
  };
}

export function topViolations(trades: StatTrade[], limit = 5): { id: string; name: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const t of trades) {
    for (const v of t.violations) {
      const item = map.get(v.id) ?? { id: v.id, name: v.name, count: 0 };
      item.count += 1;
      map.set(v.id, item);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export type Streak = { current: number; best: number; daysSinceViolation: number | null };
export function disciplineStreak(trades: StatTrade[], now: Date = new Date()): Streak {
  const sorted = [...trades].sort(byTime);
  let best = 0;
  let run = 0;
  for (const t of sorted) {
    run = t.rulesFollowed ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const lastViolation = [...sorted].reverse().find((t) => !t.rulesFollowed);
  return {
    current: run,
    best,
    daysSinceViolation: lastViolation ? Math.max(0, Math.floor((now.getTime() - new Date(lastViolation.tradedAt).getTime()) / DAY_MS)) : null,
  };
}

// ---- Достижения и цель месяца ----

export type Achievement = { id: string; current: number; target: number; unlocked: boolean };

export function computeAchievements(trades: { tradedAt: string; rulesFollowed: boolean }[], now: Date = new Date()): Achievement[] {
  const sorted = [...trades].sort(byTime);
  let best = 0;
  let run = 0;
  for (const t of sorted) {
    run = t.rulesFollowed ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const week = sorted.filter((t) => new Date(t.tradedAt).getTime() >= weekAgo);
  const cleanWeek = week.length > 0 && week.every((t) => t.rulesFollowed) ? week.length : 0;
  const defs: [string, number, number][] = [
    ["first_trade", sorted.length, 1], ["trades_10", sorted.length, 10], ["trades_50", sorted.length, 50], ["trades_100", sorted.length, 100],
    ["streak_5", best, 5], ["streak_10", best, 10], ["streak_20", best, 20], ["clean_week", cleanWeek, 3],
  ];
  return defs.map(([id, current, target]) => ({ id, current: Math.min(current, target), target, unlocked: current >= target }));
}

export type MonthGoal = { total: number; followed: number; percent: number | null; goal: number; reached: boolean; needed: number | null };

function monthKey(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}`;
}

export function monthDiscipline(trades: { tradedAt: string; rulesFollowed: boolean }[], goal: number, timeZone: string, now: Date = new Date()): MonthGoal {
  const current = monthKey(now, timeZone);
  const month = trades.filter((t) => monthKey(new Date(t.tradedAt), timeZone) === current);
  const followed = month.filter((t) => t.rulesFollowed).length;
  const total = month.length;
  const percent = total === 0 ? null : Math.round((followed / total) * 100);
  const reached = percent !== null && percent >= goal;
  let needed: number | null = null;
  if (total > 0 && !reached && goal < 100) needed = Math.ceil((goal * total - 100 * followed) / (100 - goal));
  return { total, followed, percent, goal, reached, needed };
}

// ---------- поведение после убытка (тильт) ----------
export type TiltGroup = { count: number; violationRate: number | null; avgPnl: number | null };
export type TiltStats = { afterLoss: TiltGroup; other: TiltGroup; tilt: boolean };

const tiltGroup = (xs: StatTrade[]): TiltGroup => ({
  count: xs.length,
  violationRate: xs.length ? (xs.filter((t) => !t.rulesFollowed).length / xs.length) * 100 : null,
  avgPnl: xs.length ? sum(xs.map((t) => t.pnl)) / xs.length : null,
});

/** Сравнивает сделки, открытые вскоре после убыточной, с остальными: чаще ли в них нарушаются правила. */
export function tiltAnalysis(trades: StatTrade[], windowMinutes = 60): TiltStats {
  const sorted = [...trades].sort(byTime);
  const after: StatTrade[] = [];
  const other: StatTrade[] = [];
  sorted.forEach((t, i) => {
    if (i === 0) return;
    const prev = sorted[i - 1];
    const gap = (new Date(t.tradedAt).getTime() - new Date(prev.tradedAt).getTime()) / 60000;
    (prev.pnl < 0 && gap >= 0 && gap <= windowMinutes ? after : other).push(t);
  });
  const a = tiltGroup(after);
  const o = tiltGroup(other);
  const tilt = a.count >= 3 && o.count >= 3 && (a.violationRate ?? 0) - (o.violationRate ?? 0) >= 15;
  return { afterLoss: a, other: o, tilt };
}

/** Лучшие и худшие сделки по результату. */
export function bestWorst(trades: StatTrade[], n = 3): { best: StatTrade[]; worst: StatTrade[] } {
  return {
    best: trades.filter((t) => t.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, n),
    worst: trades.filter((t) => t.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, n),
  };
}

/** Если последняя сделка закрыта в минус совсем недавно — вернёт, сколько минут назад. */
export function lossCooldown(last: { tradedAt: string; pnl: number } | null, now: Date, minutes = 30): { minutesAgo: number } | null {
  if (!last || last.pnl >= 0) return null;
  const ago = Math.floor((now.getTime() - new Date(last.tradedAt).getTime()) / 60000);
  return ago >= 0 && ago < minutes ? { minutesAgo: ago } : null;
}
