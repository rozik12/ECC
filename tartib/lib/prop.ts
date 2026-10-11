// Проп-челлендж: прогресс к цели, дневной лимит убытка и общая просадка по сделкам из журнала. Чистые функции без зависимостей от интерфейса.
import { localDay, type StatTrade } from "./statistics/index.ts";

export type Challenge = {
  id: string;
  name: string;
  accountId: string | null;
  startBalance: number;
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxTotalLossPct: number;
  /** true — просадка считается от максимума баланса, false — от стартового баланса */
  trailing: boolean;
  minTradingDays: number;
  /** ГГГГ-ММ-ДД в часовом поясе пользователя */
  startDate: string;
  endDate: string | null;
};

export type PropState = {
  status: "active" | "passed" | "breached";
  breachReason: "daily" | "total" | null;
  breachDay: string | null;
  equity: number;
  peak: number;
  pnl: number;
  profitPct: number;
  /** Сколько цели выполнено, 0–100+ % */
  targetProgress: number;
  todayPnl: number;
  /** Дневной лимит в деньгах (процент от стартового баланса) и сколько из него уже потрачено сегодня, % */
  dailyLimit: number;
  dailyUsedPct: number;
  /** Нижняя граница баланса: ниже неё челлендж провален */
  floor: number;
  /** Сколько баланса ещё можно потерять до границы и какая доля общего лимита использована, % */
  buffer: number;
  totalUsedPct: number;
  tradingDays: number;
  daysLeft: number | null;
  trades: number;
};

const day = (iso: string, tz: string) => localDay(iso, tz);

/** Расчёт по сделкам счёта челленджа за период. today — дата «сегодня» в часовом поясе пользователя (ГГГГ-ММ-ДД). */
export function propState(trades: Pick<StatTrade, "tradedAt" | "pnl" | "accountId">[], c: Challenge, tz: string, today: string): PropState {
  const own = trades
    .filter((t) => (!c.accountId || t.accountId === c.accountId) && day(t.tradedAt, tz) >= c.startDate && (!c.endDate || day(t.tradedAt, tz) <= c.endDate))
    .sort((a, b) => Date.parse(a.tradedAt) - Date.parse(b.tradedAt));
  const dailyLimit = (c.startBalance * c.maxDailyLossPct) / 100;
  const totalLimit = (c.startBalance * c.maxTotalLossPct) / 100;

  let equity = c.startBalance;
  let peak = c.startBalance;
  let breachReason: PropState["breachReason"] = null;
  let breachDay: string | null = null;
  const perDay = new Map<string, number>();
  for (const t of own) {
    const d = day(t.tradedAt, tz);
    const dayPnl = (perDay.get(d) ?? 0) + t.pnl;
    perDay.set(d, dayPnl);
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const floorNow = c.trailing ? peak - totalLimit : c.startBalance - totalLimit;
    if (!breachReason && dayPnl <= -dailyLimit) { breachReason = "daily"; breachDay = d; }
    if (!breachReason && equity <= floorNow) { breachReason = "total"; breachDay = d; }
  }
  const floor = c.trailing ? peak - totalLimit : c.startBalance - totalLimit;
  const pnl = equity - c.startBalance;
  const profitPct = (pnl / c.startBalance) * 100;
  const todayPnl = perDay.get(today) ?? 0;
  const tradingDays = perDay.size;
  const target = (c.startBalance * c.profitTargetPct) / 100;
  const passed = !breachReason && pnl >= target && tradingDays >= c.minTradingDays;
  const daysLeft = c.endDate ? Math.max(0, Math.round((Date.parse(`${c.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)) : null;
  return {
    status: breachReason ? "breached" : passed ? "passed" : "active",
    breachReason,
    breachDay,
    equity,
    peak,
    pnl,
    profitPct,
    targetProgress: target > 0 ? (pnl / target) * 100 : 0,
    todayPnl,
    dailyLimit,
    dailyUsedPct: dailyLimit > 0 ? Math.max(0, (-todayPnl / dailyLimit) * 100) : 0,
    floor,
    buffer: equity - floor,
    totalUsedPct: totalLimit > 0 ? Math.min(100, Math.max(0, ((c.trailing ? peak : c.startBalance) - equity) / totalLimit * 100)) : 0,
    tradingDays,
    daysLeft,
    trades: own.length,
  };
}
