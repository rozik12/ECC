// Недельный разбор: итоги последних 7 дней, сравнение с предыдущими 7 днями и один вывод.
// Чистые функции. Вывод формируется по понятным правилам (без ИИ), поэтому его можно проверить тестами.
import { mistakeCost, ruleCost } from "./analytics.ts";
import { localDay } from "./diary.ts";
import type { StatTrade } from "./statistics/index.ts";

const DAY = 86400000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export type DayResult = { day: string; pnl: number; count: number };
export type WeekStats = { count: number; pnl: number; winRate: number | null; disciplinePct: number | null; days: DayResult[] };

export function weekStats(trades: StatTrade[], tz: string, from: Date, to: Date): WeekStats {
  const inRange = trades.filter((t) => {
    const ts = new Date(t.tradedAt).getTime();
    return ts >= from.getTime() && ts < to.getTime();
  });
  const byDay = new Map<string, DayResult>();
  for (const t of inRange) {
    const day = localDay(new Date(t.tradedAt), tz);
    const cur = byDay.get(day) ?? { day, pnl: 0, count: 0 };
    cur.pnl += t.pnl;
    cur.count++;
    byDay.set(day, cur);
  }
  return {
    count: inRange.length,
    pnl: sum(inRange.map((t) => t.pnl)),
    winRate: inRange.length ? (inRange.filter((t) => t.pnl > 0).length / inRange.length) * 100 : null,
    disciplinePct: inRange.length ? (inRange.filter((t) => t.rulesFollowed).length / inRange.length) * 100 : null,
    days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export type Takeaway =
  | { kind: "none" }
  | { kind: "rule"; name: string; count: number; pnl: number }
  | { kind: "mistake"; key: string; count: number; pnl: number }
  | { kind: "discipline"; pct: number; goal: number }
  | { kind: "steady" };

export type WeekReview = {
  current: WeekStats;
  previous: WeekStats;
  best: DayResult | null;
  worst: DayResult | null;
  takeaway: Takeaway;
};

/** Последние 7 суток (от «сейчас» назад) против предыдущих 7 суток. */
export function weekReview(trades: StatTrade[], tz: string, now: Date, goal: number): WeekReview {
  const to = new Date(now.getTime() + 1000);
  const mid = new Date(now.getTime() - 7 * DAY);
  const start = new Date(now.getTime() - 14 * DAY);
  const current = weekStats(trades, tz, mid, to);
  const previous = weekStats(trades, tz, start, mid);
  const days = current.days;
  const best = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
  const worst = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;

  const week = trades.filter((t) => {
    const ts = new Date(t.tradedAt).getTime();
    return ts >= mid.getTime() && ts < to.getTime();
  });
  let takeaway: Takeaway = { kind: "none" };
  if (current.count > 0) {
    const rule = ruleCost(week).find((r) => r.pnl < 0);
    const mistake = mistakeCost(week).find((m) => m.pnl < 0 && m.count >= 2);
    if (rule && rule.count >= 2) takeaway = { kind: "rule", name: rule.name, count: rule.count, pnl: rule.pnl };
    else if (mistake) takeaway = { kind: "mistake", key: mistake.key, count: mistake.count, pnl: mistake.pnl };
    else if (current.disciplinePct !== null && current.disciplinePct < goal) takeaway = { kind: "discipline", pct: current.disciplinePct, goal };
    else takeaway = { kind: "steady" };
  }
  return { current, previous, best, worst, takeaway };
}
