// Виды трейдеров по группам и определение своего профиля по журналу. Классификация справочная: разные источники делят по-разному.
import { durationMinutes } from "./journal.ts";
import type { StatTrade } from "./statistics/index.ts";

export type GroupId = "horizon" | "market" | "analysis" | "strategy" | "status" | "behavior";

export const TRADER_GROUPS: { id: GroupId; types: string[] }[] = [
  { id: "horizon", types: ["scalper", "day", "swing", "position", "hft"] },
  { id: "market", types: ["crypto", "forex", "stocks", "futures", "commodities", "options"] },
  { id: "analysis", types: ["technical", "fundamental", "news", "algo", "discretionary"] },
  { id: "strategy", types: ["trend", "countertrend", "breakout", "arbitrage", "orderflow"] },
  { id: "status", types: ["retail", "prop", "institutional", "manager"] },
  { id: "behavior", types: ["systematic", "impulsive", "revenge", "overtrader", "cautious"] },
];

export const TRADER_TYPE_COUNT = TRADER_GROUPS.reduce((n, g) => n + g.types.length, 0);

export type Style = "scalper" | "day" | "swing" | "position";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const MIN_TRADES_FOR_PROFILE = 5;

/** Стиль по медианной длительности закрытых сделок: до 15 минут — скальпер, до 12 часов — дей-трейдер, до 14 дней — свинг, дольше — позиционный. Нужно не меньше 5 сделок со временем закрытия. */
export function detectStyle(trades: Pick<StatTrade, "tradedAt" | "closedAt">[]): { style: Style; medianMinutes: number; count: number } | null {
  const mins = trades.map((t) => durationMinutes(t.tradedAt, t.closedAt)).filter((m): m is number => m !== null);
  if (mins.length < MIN_TRADES_FOR_PROFILE) return null;
  const m = median(mins);
  return { style: m < 15 ? "scalper" : m < 720 ? "day" : m < 20160 ? "swing" : "position", medianMinutes: m, count: mins.length };
}

/** Рынок, на котором больше всего сделок (если есть хотя бы 5 сделок с известным рынком). */
export function detectMarket(trades: Pick<StatTrade, "market">[]): { market: string; share: number } | null {
  const counts = new Map<string, number>();
  for (const t of trades) if (t.market) counts.set(t.market, (counts.get(t.market) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < MIN_TRADES_FOR_PROFILE) return null;
  const [market, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { market, share: n / total };
}

export type Behavior = "systematic" | "impulsive" | "revenge" | "overtrader" | "cautious";

/**
 * Поведение по отметкам в журнале: какая модель встречается чаще всего (не меньше 20% сделок).
 * Если выраженной нет, а правила соблюдены в 85% сделок и больше, то «системный». Иначе профиль не определяется.
 * Это подсказка по вашим же записям, а не диагноз.
 */
export function detectBehavior(trades: Pick<StatTrade, "emotion" | "mistakes" | "rulesFollowed">[]): { behavior: Behavior; share: number; count: number } | null {
  if (trades.length < MIN_TRADES_FOR_PROFILE) return null;
  const has = (t: (typeof trades)[number], m: string[]) => (t.mistakes ?? []).some((x) => m.includes(x));
  const score: Record<Exclude<Behavior, "systematic">, number> = {
    impulsive: trades.filter((t) => has(t, ["fomo_entry", "chased"]) || t.emotion === "fomo" || t.emotion === "greed").length,
    revenge: trades.filter((t) => has(t, ["revenge"]) || t.emotion === "revenge").length,
    overtrader: trades.filter((t) => has(t, ["overtrading"])).length,
    cautious: trades.filter((t) => has(t, ["early_exit"]) || t.emotion === "fear" || t.emotion === "uncertain").length,
  };
  const [top, n] = (Object.entries(score) as [Exclude<Behavior, "systematic">, number][]).sort((a, b) => b[1] - a[1])[0];
  if (n / trades.length >= 0.2) return { behavior: top, share: n / trades.length, count: trades.length };
  const followed = trades.filter((t) => t.rulesFollowed).length / trades.length;
  return followed >= 0.85 ? { behavior: "systematic", share: followed, count: trades.length } : null;
}

/** Куда ведёт совет по типу поведения. */
export const BEHAVIOR_LINK: Record<Behavior, string> = {
  systematic: "/statistics/week",
  impulsive: "/settings",
  revenge: "/rules",
  overtrader: "/statistics/pnl",
  cautious: "/statistics/mistakes",
};
