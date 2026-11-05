// Профиль трейдера (срок удержания и рынки) и ярлыки, которые главная показывает по нему. Чистые функции без зависимостей от интерфейса.

export const HORIZONS = ["scalper", "day", "swing", "position"] as const;
export type Horizon = (typeof HORIZONS)[number];
export const TRADER_MARKETS = ["crypto", "forex", "stocks", "futures", "options", "commodities"] as const;
export type TraderMarket = (typeof TRADER_MARKETS)[number];

export const isHorizon = (v: unknown): v is Horizon => typeof v === "string" && (HORIZONS as readonly string[]).includes(v);
export const isTraderMarket = (v: unknown): v is TraderMarket => typeof v === "string" && (TRADER_MARKETS as readonly string[]).includes(v);

export type Shortcut = { key: string; href: string };

const BY_HORIZON: Record<Horizon, Shortcut[]> = {
  scalper: [{ key: "quick", href: "/trades/quick" }, { key: "feeBreakeven", href: "/tools/fee-breakeven" }, { key: "sessions", href: "/tools/sessions" }],
  day: [{ key: "quick", href: "/trades/quick" }, { key: "sessions", href: "/tools/sessions" }, { key: "advanced", href: "/statistics/advanced" }],
  swing: [{ key: "portfolio", href: "/portfolio" }, { key: "goal", href: "/tools/goal" }, { key: "week", href: "/statistics/week" }],
  position: [{ key: "portfolio", href: "/portfolio" }, { key: "compound", href: "/tools/compound" }, { key: "goal", href: "/tools/goal" }],
};

const BY_MARKET: Record<TraderMarket, Shortcut[]> = {
  crypto: [{ key: "market", href: "/market" }, { key: "liquidation", href: "/tools/liquidation" }, { key: "chartBtc", href: "/charts?pair=BTCUSDT" }],
  forex: [{ key: "forexLot", href: "/tools/forex-lot" }, { key: "sessions", href: "/tools/sessions" }, { key: "chartGold", href: "/charts?pair=XAUUSD" }],
  stocks: [{ key: "stockSize", href: "/tools/stock-size" }, { key: "market", href: "/market" }, { key: "chartAapl", href: "/charts?pair=AAPL" }],
  futures: [{ key: "futuresRisk", href: "/tools/futures-risk" }, { key: "chartNq", href: "/charts?pair=NQ%3DF" }, { key: "market", href: "/market" }],
  options: [{ key: "optionsCalc", href: "/tools/options" }, { key: "sessions", href: "/tools/sessions" }, { key: "chartAapl", href: "/charts?pair=AAPL" }],
  commodities: [{ key: "metalsPage", href: "/metals" }, { key: "chartGold", href: "/charts?pair=XAUUSD" }, { key: "metalsLot", href: "/tools/metals-lot" }, { key: "futuresRisk", href: "/tools/futures-risk" }],
};

/**
 * Ярлыки по профилю: от каждого рынка несколько первых (чем больше рынков, тем меньше от каждого), потом ярлыки срока удержания; без повторов, не больше max.
 * Под срок удержания всегда остаётся место, если он выбран.
 */
export function shortcutsFor(horizon: Horizon | null, markets: TraderMarket[], max = 6): Shortcut[] {
  const horizonItems = horizon ? BY_HORIZON[horizon] : [];
  const reserve = horizon ? Math.min(2, horizonItems.length) : 0;
  const perMarket = Math.max(1, Math.floor((max - reserve) / Math.max(1, markets.length)));
  const out: Shortcut[] = [];
  const seen = new Set<string>();
  const add = (list: Shortcut[]) => {
    for (const s of list) {
      if (seen.has(s.href) || out.length >= max) continue;
      seen.add(s.href);
      out.push(s);
    }
  };
  for (const m of markets) add((BY_MARKET[m] ?? []).filter((s) => !seen.has(s.href)).slice(0, perMarket));
  add(horizonItems);
  return out;
}

/** Рынок для новой сделки по умолчанию: первый из выбранных, который есть в форме; иначе null. */
export function defaultFormMarket(markets: TraderMarket[], formMarkets: readonly string[]): string | null {
  for (const m of markets) {
    const mapped = m === "commodities" ? "metals" : m;
    if (formMarkets.includes(mapped)) return mapped;
  }
  return null;
}
