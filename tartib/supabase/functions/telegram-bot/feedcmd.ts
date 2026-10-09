// Разбор команд про рынок: названия пар и аргументы /alert. Чистые функции.
import type { AlertDirection } from "./feed.ts";
import { normalizePair } from "./marketdata.ts";

/** «BTC», «btc/usdt», «ETHUSDT» → BTCUSDT; без указанной валюты котировки берётся USDT. */
export function toSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{2,12}$/.test(s) && !normalizePair(s)) return normalizePair(`${s}USDT`)?.symbol ?? null;
  return normalizePair(s)?.symbol ?? null;
}

const ABOVE = new Set(["above", "up", ">", ">=", "≥", "выше", "вверх", "yuqori", "yuqorida", "ustida"]);
const BELOW = new Set(["below", "down", "<", "<=", "≤", "ниже", "вниз", "past", "pastda", "ostida"]);

/** `/alert BTC 70000` или `/alert BTCUSDT 70000 выше`. Направление необязательно (null — определить по текущей цене). */
export function parseAlertArgs(arg: string): { symbol: string; price: number; direction: AlertDirection | null } | null {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  const symbol = toSymbol(parts[0]);
  const price = Number(parts[1].replace(",", "."));
  if (!symbol || !Number.isFinite(price) || price <= 0 || price > 1e12) return null;
  if (parts.length === 2) return { symbol, price, direction: null };
  const word = parts[2].toLowerCase();
  return ABOVE.has(word) ? { symbol, price, direction: "above" } : BELOW.has(word) ? { symbol, price, direction: "below" } : null;
}
