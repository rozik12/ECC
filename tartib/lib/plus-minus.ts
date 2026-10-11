// «Плюс и минус»: сколько заработано в прибыльных сделках, сколько потеряно в убыточных и что в итоге. Результат сделок уже после комиссий.
import { localDay, type StatTrade } from "./statistics/index.ts";

export type PlusMinus = { plus: number; minus: number; net: number; wins: number; losses: number; flat: number; count: number };

export function plusMinus(trades: Pick<StatTrade, "pnl">[]): PlusMinus {
  let plus = 0, minus = 0, wins = 0, losses = 0, flat = 0;
  for (const t of trades) {
    if (t.pnl > 0) { plus += t.pnl; wins++; }
    else if (t.pnl < 0) { minus += t.pnl; losses++; }
    else flat++;
  }
  return { plus, minus, net: plus + minus, wins, losses, flat, count: trades.length };
}

export type PeriodKey = "today" | "week" | "month" | "all";

/** Границы периодов в часовом поясе пользователя: сегодня, последние 7 дней (включая сегодня), с начала месяца, всё время. */
export function inPeriod(trades: StatTrade[], period: PeriodKey, tz: string, now: Date): StatTrade[] {
  if (period === "all") return trades;
  const today = localDay(now.toISOString(), tz);
  const from = period === "today" ? today : period === "month" ? `${today.slice(0, 7)}-01` : localDay(new Date(now.getTime() - 6 * 86_400_000).toISOString(), tz);
  return trades.filter((t) => localDay(t.tradedAt, tz) >= from);
}

export type DayRow = PlusMinus & { day: string };

/** По дням, новые сверху; только дни со сделками. */
export function byDay(trades: StatTrade[], tz: string, limit = 31): DayRow[] {
  const map = new Map<string, StatTrade[]>();
  for (const t of trades) {
    const k = localDay(t.tradedAt, tz);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, limit).map(([day, xs]) => ({ day, ...plusMinus(xs) }));
}

/** По месяцам (ГГГГ-ММ), новые сверху. */
export function byMonth(trades: StatTrade[], tz: string, limit = 12): (PlusMinus & { month: string })[] {
  const map = new Map<string, StatTrade[]>();
  for (const t of trades) {
    const k = localDay(t.tradedAt, tz).slice(0, 7);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, limit).map(([month, xs]) => ({ month, ...plusMinus(xs) }));
}
