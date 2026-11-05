// Копия inferMarket из lib/import-map.ts: рынок по названию инструмента.
const FIAT = "(EUR|USD|GBP|JPY|CHF|AUD|NZD|CAD|SEK|NOK|PLN|TRY|ZAR|MXN|CNH|CNY)";

export function inferMarket(instrument: string): "crypto" | "forex" | "stocks" | "futures" {
  const s = instrument.toUpperCase().replace(/[\s/_-]/g, "");
  if (new RegExp(`^(XAU|XAG|${FIAT.slice(1, -1)})${FIAT}$`).test(s)) return "forex";
  if (/(USDT|USDC|BUSD|BTC|ETH|PERP)$/.test(s)) return "crypto";
  if (/^(NQ|ES|YM|RTY|CL|GC|SI|ZB|ZN)[A-Z]?\d{0,2}$/.test(s)) return "futures";
  if (/^[A-Z]{1,5}$/.test(s)) return "stocks";
  return "crypto";
}
