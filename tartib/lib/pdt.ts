// Счётчик дей-трейдов по акциям США. Дей-трейд — сделка по акции, открытая и закрытая в один и тот же торговый день (по Нью-Йорку).
// Правило FINRA для маржинальных счетов с капиталом меньше 25 000 долларов: 4 и более дей-трейда за 5 торговых дней = статус «шаблонного дей-трейдера».
// Правило и порог могут меняться и зависят от брокера: счётчик справочный, окончательно уточняй у брокера.
import { lastTradingDays, nyDate, ymdString } from "./us-market.ts";
import type { StatTrade } from "./statistics/index.ts";

export const PDT_EQUITY_LIMIT = 25000;
export const PDT_WINDOW_DAYS = 5;
/** Сколько дей-трейдов можно сделать в окне, не получив статус: больше трёх нельзя. */
export const PDT_MAX_FREE = 3;

export type PdtLevel = "ok" | "warn" | "flag";

export type PdtState = {
  count: number;
  /** Сколько дей-трейдов осталось до статуса (0 — следующий уже будет четвёртым) */
  left: number;
  level: PdtLevel;
  days: { date: string; count: number }[];
};

export const isDayTrade = (t: Pick<StatTrade, "market" | "tradedAt" | "closedAt">): boolean => {
  if (t.market !== "stocks" || !t.closedAt) return false;
  const a = nyDate(new Date(t.tradedAt));
  const b = nyDate(new Date(t.closedAt));
  return ymdString(a) === ymdString(b);
};

/** Дей-трейды в окне из пяти последних торговых дней, считая с сегодняшнего (или ближайшего прошедшего) дня по Нью-Йорку. */
export function pdtState(trades: StatTrade[], now: Date): PdtState {
  const today = nyDate(now);
  const window = lastTradingDays(today, PDT_WINDOW_DAYS);
  const set = new Set(window);
  const perDay = new Map<string, number>();
  for (const t of trades) {
    if (!isDayTrade(t)) continue;
    const day = ymdString(nyDate(new Date(t.closedAt as string)));
    if (set.has(day)) perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const count = [...perDay.values()].reduce((a, b) => a + b, 0);
  return {
    count,
    left: Math.max(0, PDT_MAX_FREE - count),
    level: count > PDT_MAX_FREE ? "flag" : count === PDT_MAX_FREE ? "warn" : "ok",
    days: window.map((date) => ({ date, count: perDay.get(date) ?? 0 })),
  };
}

/** Правило касается счёта, если капитал меньше порога. Для значения null (капитал неизвестен) правило не применяем. */
export const pdtApplies = (equity: number | null): boolean => equity !== null && equity < PDT_EQUITY_LIMIT;
