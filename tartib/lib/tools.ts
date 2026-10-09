// Расчёты для публичных инструментов и команд бота. Файл без зависимостей: точная копия лежит в
// supabase/functions/telegram-bot/tools.ts (совпадение проверяет tests/tools.test.ts).

export type Fail = { ok: false };
const fin = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
const FAIL: Fail = { ok: false };

// ---------- размер позиции ----------
export type SizeResult = { ok: true; direction: "long" | "short"; riskAmount: number; distance: number; units: number; value: number } | Fail;

export function positionSize(i: { balance: number; riskPct: number; entry: number; stop: number }): SizeResult {
  if (!fin(i.balance, i.riskPct, i.entry, i.stop)) return FAIL;
  if (i.balance <= 0 || i.riskPct <= 0 || i.riskPct > 100 || i.entry <= 0 || i.stop <= 0 || i.entry === i.stop) return FAIL;
  const riskAmount = (i.balance * i.riskPct) / 100;
  const distance = Math.abs(i.entry - i.stop);
  const units = riskAmount / distance;
  return { ok: true, direction: i.entry > i.stop ? "long" : "short", riskAmount, distance, units, value: units * i.entry };
}

// ---------- риск к прибыли ----------
export type RrResult = { ok: true; direction: "long" | "short"; risk: number; reward: number; rr: number; breakEvenWinRate: number; expectancyR: number | null } | Fail;

export function riskReward(i: { entry: number; stop: number; target: number; winRate?: number | null }): RrResult {
  if (!fin(i.entry, i.stop, i.target) || i.entry <= 0 || i.stop <= 0 || i.target <= 0 || i.entry === i.stop) return FAIL;
  const long = i.entry > i.stop;
  if (long ? i.target <= i.entry : i.target >= i.entry) return FAIL; // цель должна быть по ту сторону входа, где прибыль
  const risk = Math.abs(i.entry - i.stop);
  const reward = Math.abs(i.target - i.entry);
  const rr = reward / risk;
  const w = i.winRate;
  const expectancyR = w === null || w === undefined || !Number.isFinite(w) || w < 0 || w > 100 ? null : (w / 100) * rr - (1 - w / 100);
  return { ok: true, direction: long ? "long" : "short", risk, reward, rr, breakEvenWinRate: 100 / (1 + rr), expectancyR };
}

// ---------- восстановление после просадки ----------
export function drawdownRecovery(pct: number): number | null {
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
  return (1 / (1 - pct / 100) - 1) * 100;
}

// ---------- серия убытков подряд ----------
export type StreakResult = { ok: true; single: number; atLeastOnce: number; drawdownPct: number; recoveryPct: number } | Fail;

/** Вероятность хотя бы одной серии из `streak` убытков подряд за `trades` сделок при проценте прибыльных `winRate`. */
export function lossStreak(i: { winRate: number; trades: number; streak: number; riskPct: number }): StreakResult {
  if (!fin(i.winRate, i.trades, i.streak, i.riskPct)) return FAIL;
  if (i.winRate < 0 || i.winRate > 100 || !Number.isInteger(i.trades) || !Number.isInteger(i.streak)) return FAIL;
  if (i.trades < 1 || i.trades > 10000 || i.streak < 1 || i.streak > 100 || i.riskPct <= 0 || i.riskPct >= 100) return FAIL;
  const p = i.winRate / 100;
  const q = 1 - p;
  const k = i.streak;
  let dp = new Array<number>(k).fill(0); // dp[j] — вероятность текущей серии убытков длиной j без достижения k
  dp[0] = 1;
  for (let t = 0; t < i.trades; t++) {
    const next = new Array<number>(k).fill(0);
    next[0] = dp.reduce((a, b) => a + b, 0) * p;
    for (let j = 0; j < k - 1; j++) next[j + 1] = dp[j] * q;
    dp = next;
  }
  const atLeastOnce = Math.min(1, Math.max(0, 1 - dp.reduce((a, b) => a + b, 0)));
  const drawdownPct = (1 - Math.pow(1 - i.riskPct / 100, k)) * 100;
  return { ok: true, single: Math.pow(q, k), atLeastOnce, drawdownPct, recoveryPct: drawdownRecovery(drawdownPct) ?? 0 };
}

// ---------- сложный процент ----------
export type CompoundResult = { ok: true; final: number; deposited: number; gain: number } | Fail;

export function compound(i: { start: number; monthlyPct: number; months: number; monthlyDeposit: number }): CompoundResult {
  if (!fin(i.start, i.monthlyPct, i.months, i.monthlyDeposit)) return FAIL;
  if (i.start < 0 || i.monthlyDeposit < 0 || !Number.isInteger(i.months) || i.months < 1 || i.months > 600) return FAIL;
  if (i.monthlyPct <= -100 || i.monthlyPct > 1000) return FAIL;
  let bal = i.start;
  for (let m = 0; m < i.months; m++) bal = bal * (1 + i.monthlyPct / 100) + i.monthlyDeposit;
  const deposited = i.start + i.monthlyDeposit * i.months;
  return { ok: true, final: bal, deposited, gain: bal - deposited };
}

// ---------- торговые сессии ----------
export type SessionDef = { id: "sydney" | "tokyo" | "london" | "newyork"; zone: string; open: number; close: number };

/** Часы по местному времени города (учитывают переход на летнее время). Выходные — суббота и воскресенье. */
export const SESSIONS: SessionDef[] = [
  { id: "sydney", zone: "Australia/Sydney", open: 8, close: 17 },
  { id: "tokyo", zone: "Asia/Tokyo", open: 9, close: 18 },
  { id: "london", zone: "Europe/London", open: 8, close: 17 },
  { id: "newyork", zone: "America/New_York", open: 8, close: 17 },
];

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(now: Date, zone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: WEEKDAY[get("weekday")] ?? 0, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** open — идёт ли сессия; minutes — минут до закрытия (если идёт) или до следующего открытия. */
export function sessionStatus(now: Date, s: SessionDef): { open: boolean; minutes: number } {
  const { weekday, minutes } = localParts(now, s.zone);
  const isWork = (d: number) => d >= 1 && d <= 5;
  if (isWork(weekday) && minutes >= s.open * 60 && minutes < s.close * 60) return { open: true, minutes: s.close * 60 - minutes };
  for (let d = 0; d <= 7; d++) {
    if (!isWork((weekday + d) % 7)) continue;
    if (d === 0 && minutes >= s.open * 60) continue; // сегодня уже закрылась
    return { open: false, minutes: d * 1440 + s.open * 60 - minutes };
  }
  return { open: false, minutes: 0 };
}
