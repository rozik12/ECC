/** Достижения и месячная цель по дисциплине. Всё считается из журнала, ничего не хранится отдельно. */

export type AchievementTrade = { tradedAt: string; rulesFollowed: boolean };

export type Achievement = {
  id: string;
  current: number;
  target: number;
  unlocked: boolean;
};

const DAY_MS = 24 * 3600 * 1000;

const byTime = (a: AchievementTrade, b: AchievementTrade) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime();

function bestRun(sorted: AchievementTrade[]): number {
  let best = 0;
  let run = 0;
  for (const t of sorted) {
    run = t.rulesFollowed ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function computeAchievements(trades: AchievementTrade[], now: Date = new Date()): Achievement[] {
  const sorted = [...trades].sort(byTime);
  const best = bestRun(sorted);
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const week = sorted.filter((t) => new Date(t.tradedAt).getTime() >= weekAgo);
  const cleanWeek = week.length > 0 && week.every((t) => t.rulesFollowed) ? week.length : 0;

  const defs: [string, number, number][] = [
    ["first_trade", sorted.length, 1],
    ["trades_10", sorted.length, 10],
    ["trades_50", sorted.length, 50],
    ["trades_100", sorted.length, 100],
    ["streak_5", best, 5],
    ["streak_10", best, 10],
    ["streak_20", best, 20],
    ["clean_week", cleanWeek, 3],
  ];
  return defs.map(([id, current, target]) => ({ id, current: Math.min(current, target), target, unlocked: current >= target }));
}

export type MonthGoal = {
  total: number;
  followed: number;
  /** null — в этом месяце ещё нет сделок */
  percent: number | null;
  goal: number;
  reached: boolean;
  /** Сколько сделок по правилам подряд нужно, чтобы дотянуть до цели (при условии, что нарушений больше не будет); null — уже достигнута или нет данных */
  needed: number | null;
};

function monthKey(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}`;
}

export function monthDiscipline(trades: AchievementTrade[], goal: number, timeZone: string, now: Date = new Date()): MonthGoal {
  const current = monthKey(now, timeZone);
  const month = trades.filter((t) => monthKey(new Date(t.tradedAt), timeZone) === current);
  const followed = month.filter((t) => t.rulesFollowed).length;
  const total = month.length;
  const percent = total === 0 ? null : Math.round((followed / total) * 100);
  const reached = percent !== null && percent >= goal;

  let needed: number | null = null;
  if (total > 0 && !reached && goal < 100) {
    // (followed + n) / (total + n) >= goal / 100
    needed = Math.ceil((goal * total - 100 * followed) / (100 - goal));
  }
  return { total, followed, percent, goal, reached, needed };
}

/** Сколько полных дней прошло с последней записи; null — записей нет. */
export function daysSinceLastTrade(trades: AchievementTrade[], now: Date = new Date()): number | null {
  if (trades.length === 0) return null;
  const last = trades.reduce((m, t) => Math.max(m, new Date(t.tradedAt).getTime()), 0);
  return Math.max(0, Math.floor((now.getTime() - last) / DAY_MS));
}
