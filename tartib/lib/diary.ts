// Дневник дня: чистая логика (дни, серия, связь настроения с результатом). Без зависимостей от браузера и базы.
import type { StatTrade } from "./statistics/index.ts";

export type DiaryEntry = { day: string; mood: number | null; energy: number | null; plan: string; review: string; lesson: string; followedPlan: boolean | null };

/** Календарный день «ГГГГ-ММ-ДД» в часовом поясе пользователя. */
export function localDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Строка дня, сдвинутая на n дней (n может быть отрицательным). Работает по календарю, поэтому не зависит от часовых поясов. */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Запись считается заполненной, если в ней есть хотя бы план, итог или урок. Одно лишь настроение дневником не считается. */
export const isFilled = (e: Pick<DiaryEntry, "plan" | "review" | "lesson">) => !!(e.plan.trim() || e.review.trim() || e.lesson.trim());

/**
 * Серия заполненных дней подряд. Если сегодня ещё не заполнено, серия не обрывается: считаем от вчера.
 * Возвращает текущую серию и самую длинную.
 */
export function diaryStreak(filledDays: string[], today: string): { current: number; longest: number } {
  const set = new Set(filledDays);
  let current = 0;
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && shiftDay(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

export type MoodRow = { mood: number; days: number; avgPnl: number; winDays: number };

/** Средний результат дня по настроению (1–5). Учитываются только дни, где были сделки и указано настроение. */
export function moodVsResult(entries: DiaryEntry[], trades: StatTrade[], tz: string): MoodRow[] {
  const pnlByDay = new Map<string, number>();
  for (const t of trades) {
    const d = localDay(new Date(t.tradedAt), tz);
    pnlByDay.set(d, (pnlByDay.get(d) ?? 0) + t.pnl);
  }
  const rows = new Map<number, number[]>();
  for (const e of entries) {
    if (e.mood === null || !pnlByDay.has(e.day)) continue;
    rows.set(e.mood, [...(rows.get(e.mood) ?? []), pnlByDay.get(e.day) as number]);
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mood, xs]) => ({ mood, days: xs.length, avgPnl: xs.reduce((a, b) => a + b, 0) / xs.length, winDays: xs.filter((x) => x > 0).length }));
}

/** Средний результат дня: когда план соблюдён и когда нет (по отметке в итоге дня). */
export function planVsResult(entries: DiaryEntry[], trades: StatTrade[], tz: string): { followed: { days: number; avgPnl: number } | null; broken: { days: number; avgPnl: number } | null } {
  const pnlByDay = new Map<string, number>();
  for (const t of trades) {
    const d = localDay(new Date(t.tradedAt), tz);
    pnlByDay.set(d, (pnlByDay.get(d) ?? 0) + t.pnl);
  }
  const acc = (flag: boolean) => {
    const xs = entries.filter((e) => e.followedPlan === flag && pnlByDay.has(e.day)).map((e) => pnlByDay.get(e.day) as number);
    return xs.length ? { days: xs.length, avgPnl: xs.reduce((a, b) => a + b, 0) / xs.length } : null;
  };
  return { followed: acc(true), broken: acc(false) };
}
