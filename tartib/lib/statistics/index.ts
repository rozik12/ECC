// Расчёт статистики. Чистые функции без зависимостей, чтобы их можно было тестировать.

export type Violation = { id: string; name: string };

export type StatTrade = {
  id: string;
  tradedAt: string; // ISO
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

export type Period = "7d" | "30d" | "all";
export const periods: Period[] = ["7d", "30d", "all"];
const DAY_MS = 24 * 3600 * 1000;

export function periodStart(period: Period, now: Date = new Date()): Date | null {
  if (period === "all") return null;
  return new Date(now.getTime() - (period === "7d" ? 7 : 30) * DAY_MS);
}

export function filterByPeriod(trades: StatTrade[], period: Period, now: Date = new Date()): StatTrade[] {
  const start = periodStart(period, now);
  if (!start) return trades;
  return trades.filter((t) => new Date(t.tradedAt) >= start);
}

const byTime = (a: StatTrade, b: StatTrade) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export type Summary = {
  totalTrades: number;
  totalPnl: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** null — если убытков нет (деление на ноль) */
  profitFactor: number | null;
  grossProfit: number;
  grossLoss: number;
  avgWin: number | null;
  /** положительное число — модуль среднего убытка */
  avgLoss: number | null;
  avgR: number | null;
};

export function summarize(trades: StatTrade[]): Summary {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = sum(wins.map((t) => t.pnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t.pnl)));
  const withRisk = trades.filter((t) => t.riskAmount !== null && t.riskAmount > 0);
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
    avgR: withRisk.length ? sum(withRisk.map((t) => t.pnl / (t.riskAmount as number))) / withRisk.length : null,
  };
}

export type EquityPoint = { ts: number; balance: number };

/** Движение средств (пополнение +, вывод −) для кривой баланса. */
export type Flow = { ts: number; amount: number };

/**
 * Кривая баланса: значение после каждой сделки и каждого пополнения или вывода.
 * startBalance — баланс перед первым событием периода.
 */
export function equityCurve(trades: StatTrade[], startBalance: number, flows: Flow[] = []): EquityPoint[] {
  const events = [
    ...trades.map((t) => ({ ts: new Date(t.tradedAt).getTime(), delta: t.pnl })),
    ...flows.map((f) => ({ ts: f.ts, delta: f.amount })),
  ].sort((a, b) => a.ts - b.ts);
  if (events.length === 0) return [];
  const points: EquityPoint[] = [{ ts: events[0].ts - 3600 * 1000, balance: startBalance }];
  let balance = startBalance;
  for (const e of events) {
    balance += e.delta;
    points.push({ ts: e.ts, balance });
  }
  return points;
}

export function maxDrawdown(points: EquityPoint[]): { amount: number; percent: number } {
  let peak = -Infinity;
  let amount = 0;
  let percent = 0;
  for (const p of points) {
    if (p.balance > peak) peak = p.balance;
    const dd = peak - p.balance;
    if (dd > amount) {
      amount = dd;
      percent = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }
  return { amount, percent };
}

export type Bucket = { key: string; pnl: number; count: number };

export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

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

export function pnlByDay(trades: StatTrade[], timeZone: string): Bucket[] {
  return groupBy(trades, (t) => localDay(t.tradedAt, timeZone)).sort((a, b) => a.key.localeCompare(b.key));
}

export function pnlByInstrument(trades: StatTrade[]): Bucket[] {
  return groupBy(trades, (t) => t.instrument).sort((a, b) => b.pnl - a.pnl);
}

export type EmotionStat = { emotion: string; count: number; total: number; average: number };

export function byEmotion(trades: StatTrade[]): EmotionStat[] {
  return groupBy(trades, (t) => t.emotion)
    .map((b) => ({ emotion: b.key, count: b.count, total: b.pnl, average: b.pnl / b.count }))
    .sort((a, b) => a.average - b.average);
}

export type DisciplineCost = {
  followedPnl: number;
  violatedPnl: number;
  followedCount: number;
  violatedCount: number;
  /** |violatedPnl|, если сделки с нарушениями в минусе, иначе 0 */
  cost: number;
  difference: number;
};

export function disciplineCost(trades: StatTrade[]): DisciplineCost {
  const followed = trades.filter((t) => t.rulesFollowed);
  const violated = trades.filter((t) => !t.rulesFollowed);
  const followedPnl = sum(followed.map((t) => t.pnl));
  const violatedPnl = sum(violated.map((t) => t.pnl));
  return {
    followedPnl,
    violatedPnl,
    followedCount: followed.length,
    violatedCount: violated.length,
    cost: violatedPnl < 0 ? Math.abs(violatedPnl) : 0,
    difference: followedPnl - violatedPnl,
  };
}

/** Самые частые нарушения правил. */
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

/** Результат по стратегиям. Сделки без стратегии не учитываются. */
export function pnlByStrategy(trades: StatTrade[]): Bucket[] {
  return groupBy(trades.filter((t) => t.strategy !== ""), (t) => t.strategy).sort((a, b) => b.pnl - a.pnl);
}

export type Streak = { current: number; best: number; daysSinceViolation: number | null };

/** Серия дисциплины: сколько сделок подряд (с конца) без нарушений, лучшая серия и дней без нарушений. */
export function disciplineStreak(trades: StatTrade[], now: Date = new Date()): Streak {
  const sorted = [...trades].sort(byTime);
  let current = 0;
  let best = 0;
  let run = 0;
  for (const t of sorted) {
    run = t.rulesFollowed ? run + 1 : 0;
    best = Math.max(best, run);
  }
  current = run;
  const lastViolation = [...sorted].reverse().find((t) => !t.rulesFollowed);
  return {
    current,
    best,
    daysSinceViolation: lastViolation ? Math.max(0, Math.floor((now.getTime() - new Date(lastViolation.tradedAt).getTime()) / DAY_MS)) : null,
  };
}

export type TimeBucket = { index: number; pnl: number; count: number; violations: number };

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function localWeekdayAndHour(iso: string, timeZone: string): { weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { weekday: WEEKDAY_INDEX[parts.weekday] ?? 0, hour: Number(parts.hour) % 24 };
}

function bucketize(trades: StatTrade[], size: number, indexOf: (t: StatTrade) => number): TimeBucket[] {
  const buckets: TimeBucket[] = Array.from({ length: size }, (_, index) => ({ index, pnl: 0, count: 0, violations: 0 }));
  for (const t of trades) {
    const b = buckets[indexOf(t)];
    b.pnl += t.pnl;
    b.count += 1;
    if (!t.rulesFollowed) b.violations += 1;
  }
  return buckets;
}

/** Результат и нарушения по дням недели (0 — понедельник) в часовом поясе пользователя. */
export function byWeekday(trades: StatTrade[], timeZone: string): TimeBucket[] {
  return bucketize(trades, 7, (t) => localWeekdayAndHour(t.tradedAt, timeZone).weekday);
}

/** Результат и нарушения по блокам часов (по умолчанию по 3 часа: 0–3, 3–6 …). */
export function byHourBlock(trades: StatTrade[], timeZone: string, blockHours = 3): TimeBucket[] {
  return bucketize(trades, 24 / blockHours, (t) => Math.floor(localWeekdayAndHour(t.tradedAt, timeZone).hour / blockHours));
}

/** Где нарушений больше всего: корзина с наибольшей долей нарушений, не меньше minTrades сделок и 2 нарушений. */
export function worstViolationBucket(buckets: TimeBucket[], minTrades = 3): TimeBucket | null {
  const candidates = buckets.filter((b) => b.count >= minTrades && b.violations >= 2);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.violations / b.count - a.violations / a.count || b.violations - a.violations)[0];
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
