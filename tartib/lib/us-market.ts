// Часы работы американских бирж (NYSE и Nasdaq): пре-маркет, основная сессия, пост-маркет, праздники и сокращённые дни.
// Чистые функции без зависимостей от браузера и базы. Время биржи всегда по Нью-Йорку (America/New_York) с учётом перехода на летнее время.
import { zonedTime } from "./time.ts";
import { dtf } from "./intl-cache.ts";

export const NY = "America/New_York";

/** Полные выходные биржи (справочно; точные даты всегда сверяй с календарём биржи). */
export const US_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "newYear", "2026-01-19": "mlk", "2026-02-16": "presidents", "2026-04-03": "goodFriday", "2026-05-25": "memorial",
  "2026-06-19": "juneteenth", "2026-07-03": "independence", "2026-09-07": "labor", "2026-11-26": "thanksgiving", "2026-12-25": "christmas",
  "2027-01-01": "newYear", "2027-01-18": "mlk", "2027-02-15": "presidents", "2027-03-26": "goodFriday", "2027-05-31": "memorial",
  "2027-06-18": "juneteenth", "2027-07-05": "independence", "2027-09-06": "labor", "2027-11-25": "thanksgiving", "2027-12-24": "christmas",
};
/** Дни, когда основная сессия заканчивается в 13:00 по Нью-Йорку. */
export const US_EARLY_CLOSE: Record<string, string> = { "2026-11-27": "afterThanksgiving", "2026-12-24": "christmasEve", "2027-11-26": "afterThanksgiving" };

export type Phase = "closed" | "pre" | "regular" | "after";

type Ymd = { y: number; m: number; d: number };
const pad = (n: number) => String(n).padStart(2, "0");
export const ymdString = ({ y, m, d }: Ymd) => `${y}-${pad(m)}-${pad(d)}`;

/** Календарная дата и день недели (0 — воскресенье) в Нью-Йорке. */
export function nyDate(date: Date): Ymd & { dow: number; minutes: number } {
  const p = Object.fromEntries(
    dtf("en-US", { timeZone: NY, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, dow, minutes: (+p.hour % 24) * 60 + +p.minute };
}

const addDays = ({ y, m, d }: Ymd, n: number): Ymd => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const dowOf = ({ y, m, d }: Ymd) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

export function isTradingDay(day: Ymd): boolean {
  const dow = dowOf(day);
  return dow !== 0 && dow !== 6 && !US_HOLIDAYS[ymdString(day)];
}

/** Границы сессий дня в минутах от полуночи по Нью-Йорку: пре-маркет, открытие, закрытие, конец пост-маркета. */
export function sessionMinutes(day: Ymd): { pre: number; open: number; close: number; end: number } {
  const early = !!US_EARLY_CLOSE[ymdString(day)];
  return early ? { pre: 240, open: 570, close: 780, end: 1020 } : { pre: 240, open: 570, close: 960, end: 1200 };
}

export function phaseAt(date: Date): Phase {
  const n = nyDate(date);
  if (!isTradingDay(n)) return "closed";
  const s = sessionMinutes(n);
  if (n.minutes < s.pre) return "closed";
  if (n.minutes < s.open) return "pre";
  if (n.minutes < s.close) return "regular";
  if (n.minutes < s.end) return "after";
  return "closed";
}

/** Ближайшая смена фазы после момента date: когда и во что переходит рынок. */
export function nextChange(date: Date): { at: Date; to: Phase } {
  const n = nyDate(date);
  for (let i = 0; i < 12; i++) {
    const day = addDays(n, i);
    if (!isTradingDay(day)) continue;
    const s = sessionMinutes(day);
    const points: [number, Phase][] = [[s.pre, "pre"], [s.open, "regular"], [s.close, "after"], [s.end, "closed"]];
    for (const [min, to] of points) {
      const at = zonedTime(NY, day.y, day.m, day.d, Math.floor(min / 60), min % 60);
      if (at.getTime() > date.getTime()) return { at, to };
    }
  }
  return { at: new Date(date.getTime() + 86400000), to: "closed" }; // недостижимо при корректных данных
}

/** Последние n торговых дней, считая с дня day включительно (самый свежий первым). */
export function lastTradingDays(day: Ymd, n: number): string[] {
  const out: string[] = [];
  let cur = day;
  for (let i = 0; i < 40 && out.length < n; i++) {
    if (isTradingDay(cur)) out.push(ymdString(cur));
    cur = addDays(cur, -1);
  }
  return out;
}

/** Ближайшие праздники и сокращённые дни, начиная с даты day. */
export function upcomingClosures(day: Ymd, limit = 4): { date: string; key: string; early: boolean }[] {
  const from = ymdString(day);
  return [
    ...Object.entries(US_HOLIDAYS).map(([date, key]) => ({ date, key, early: false })),
    ...Object.entries(US_EARLY_CLOSE).map(([date, key]) => ({ date, key, early: true })),
  ].filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

/** Часть основной сессии для разбора сделок: по времени сделки в Нью-Йорке. */
export type Bucket = "pre" | "open" | "morning" | "midday" | "afternoon" | "power" | "after" | "off";
export const BUCKETS: Bucket[] = ["pre", "open", "morning", "midday", "afternoon", "power", "after", "off"];

export function bucketOf(date: Date): Bucket {
  const n = nyDate(date);
  const weekday = n.dow !== 0 && n.dow !== 6;
  if (!weekday) return "off";
  const m = n.minutes;
  if (m >= 240 && m < 570) return "pre";
  if (m >= 570 && m < 600) return "open"; // первые 30 минут
  if (m >= 600 && m < 720) return "morning";
  if (m >= 720 && m < 840) return "midday";
  if (m >= 840 && m < 930) return "afternoon";
  if (m >= 930 && m < 960) return "power"; // последние 30 минут
  if (m >= 960 && m < 1200) return "after";
  return "off";
}
