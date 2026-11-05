// Готовые форматы импорта: отчёты MetaTrader 4 и 5 (HTML или CSV). Чистые функции без зависимостей от интерфейса.
//
// Что известно о форматах (из описания самих платформ): в MT4 таблица закрытых сделок «Ticket, Open Time, Type, Size, Item, Price, S / L, T / P,
// Close Time, Price, Commission, Taxes, Swap, Profit», в MT5 таблица позиций «Time, Position, Symbol, Type, Volume, Price, S / L, T / P, Time, Price,
// [Commission, Swap,] Profit». Названия «Price» и «Time» повторяются: первое — открытие, второе — закрытие.
import { parseLooseNumber } from "./import-map.ts";

// ---------- чтение файла ----------
/** Декодирует файл. MT5 сохраняет HTML-отчёты в UTF-16, поэтому смотрим на метку порядка байт и на «нулевые» байты. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  // Без метки: если каждый второй байт нулевой, это UTF-16 без метки
  const sample = bytes.subarray(0, Math.min(bytes.length, 400));
  let zerosOdd = 0;
  let zerosEven = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) continue;
    if (i % 2) zerosOdd++;
    else zerosEven++;
  }
  if (sample.length > 20 && zerosOdd > sample.length / 4 && zerosEven === 0) return new TextDecoder("utf-16le").decode(bytes);
  if (sample.length > 20 && zerosEven > sample.length / 4 && zerosOdd === 0) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Строки всех таблиц HTML-файла по порядку: каждая строка — список текстов ячеек. */
export function parseHtmlTables(html: string): string[][] {
  const clean = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const rows: string[][] = [];
  for (const tr of clean.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<\/tr>|<tr\b|$)/gi)) {
    const cells: string[] = [];
    for (const td of tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|$)/gi)) {
      const text = td[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
          if (e[0] === "#") {
            const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
          }
          return ENTITIES[e.toLowerCase()] ?? m;
        })
        .replace(/[\s ]+/g, " ")
        .trim();
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// ---------- MetaTrader ----------
export type MtPlatform = "mt4" | "mt5";
export type MtResult = { platform: MtPlatform; header: string[]; rows: string[][]; used: number; skipped: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const indexesOf = (names: string[], key: string) => names.flatMap((n, i) => (n === key ? [i] : []));
const num = (cell: string | undefined) => (cell === undefined ? null : parseLooseNumber(cell));

const FIAT = ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "SEK", "NOK", "PLN", "TRY", "ZAR", "MXN", "CNH", "CNY"];
const isFxPair = (s: string) => s.length === 6 && FIAT.includes(s.slice(0, 3)) && FIAT.includes(s.slice(3));
const isMetal = (s: string) => /^(XAU|XAG)(USD|EUR|GBP|CHF|JPY|AUD)$/.test(s);

/** Название инструмента у брокера бывает с суффиксом («EURUSD.m», «EURUSDpro», «XAUUSD#»): оставляем основу, если это пара. */
export function cleanSymbol(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, "").replace(/^#/, "");
  const m = /^([A-Z]{6})(?:[._#\-]?[A-Z]{0,6})?#?$/.exec(s);
  if (m && (isFxPair(m[1]) || isMetal(m[1]))) return m[1];
  return s.replace(/#$/, "");
}

/** Лоты MetaTrader в единицы актива (в Tartib размер хранится в единицах): валютная пара — 100 000, золото — 100 унций, серебро — 5 000. Остальное без изменений. */
export function lotsToUnits(symbol: string, lots: number): number {
  const mult = isFxPair(symbol) ? 100_000 : symbol.startsWith("XAU") && isMetal(symbol) ? 100 : symbol.startsWith("XAG") && isMetal(symbol) ? 5_000 : 1;
  return Math.round(lots * mult * 1e8) / 1e8;
}

export const MT_HEADER = ["date_time", "instrument", "direction", "entry", "exit", "stop_loss", "take_profit", "size", "fees", "pnl", "comment"];

type Layout = { platform: MtPlatform; header: number; cols: Record<string, number | null> };

function detectLayout(rows: string[][]): Layout | null {
  for (let i = 0; i < Math.min(rows.length, 5000); i++) {
    const names = rows[i].map(norm);
    const has = (k: string) => names.includes(k);
    const prices = indexesOf(names, "price");
    if (has("ticket") && has("opentime") && has("closetime") && has("item") && has("type") && has("size") && has("profit") && prices.length >= 2) {
      const at = (k: string) => (has(k) ? names.indexOf(k) : null);
      return { platform: "mt4", header: i, cols: { id: at("ticket"), open: at("opentime"), close: at("closetime"), symbol: at("item"), type: at("type"), size: at("size"), openPrice: prices[0], closePrice: prices[1], sl: at("sl"), tp: at("tp"), commission: at("commission"), taxes: at("taxes"), swap: at("swap"), fee: null, profit: at("profit") } };
    }
    const times = indexesOf(names, "time");
    if (has("position") && has("symbol") && has("type") && has("volume") && has("profit") && times.length >= 2 && prices.length >= 2) {
      const at = (k: string) => (has(k) ? names.indexOf(k) : null);
      return { platform: "mt5", header: i, cols: { id: at("position"), open: times[0], close: times[1], symbol: at("symbol"), type: at("type"), size: at("volume"), openPrice: prices[0], closePrice: prices[1], sl: at("sl"), tp: at("tp"), commission: at("commission"), taxes: null, swap: at("swap"), fee: at("fee"), profit: at("profit") } };
    }
  }
  return null;
}

/**
 * Превращает таблицу отчёта MetaTrader в строки формата Tartib. Берутся только закрытые сделки buy и sell;
 * пополнения, выводы, отложенные ордера и ещё не закрытые позиции пропускаются.
 * Итог сделки = прибыль + комиссия + налоги + своп (то есть чистый результат); «комиссии» = комиссия + налоги.
 * Время сделки — время открытия по часам сервера брокера (часовой пояс сервера в отчёте не указан).
 */
export function convertMetaTrader(rows: string[][]): MtResult | null {
  const layout = detectLayout(rows);
  if (!layout) return null;
  const { cols } = layout;
  const out: string[][] = [];
  let skipped = 0;
  const get = (r: string[], key: string) => (cols[key] === null || cols[key] === undefined ? undefined : r[cols[key] as number]);

  for (const r of rows.slice(layout.header + 1)) {
    const type = (get(r, "type") ?? "").trim().toLowerCase();
    if (type !== "buy" && type !== "sell") {
      // строки итогов, заголовки следующих таблиц и тому подобное не считаем пропущенными сделками
      if (/^(balance|credit|deposit|withdrawal|correction|bonus|charge|buy |sell )/.test(type)) skipped++;
      continue;
    }
    const closeTime = (get(r, "close") ?? "").trim();
    const openPrice = num(get(r, "openPrice"));
    const closePrice = num(get(r, "closePrice"));
    const lots = num(get(r, "size"));
    const profit = num(get(r, "profit"));
    if (!closeTime || openPrice === null || closePrice === null || lots === null || lots <= 0 || profit === null) {
      skipped++;
      continue;
    }
    const symbol = cleanSymbol(get(r, "symbol") ?? "");
    if (!symbol) {
      skipped++;
      continue;
    }
    const commission = (num(get(r, "commission")) ?? 0) + (num(get(r, "taxes")) ?? 0) + (num(get(r, "fee")) ?? 0);
    const swap = num(get(r, "swap")) ?? 0;
    const sl = num(get(r, "sl"));
    const tp = num(get(r, "tp"));
    const round = (n: number) => String(Math.round(n * 1e8) / 1e8);
    out.push([
      (get(r, "open") ?? "").trim(),
      symbol,
      type,
      round(openPrice),
      round(closePrice),
      sl !== null && sl > 0 ? round(sl) : "",
      tp !== null && tp > 0 ? round(tp) : "",
      round(lotsToUnits(symbol, lots)),
      round(Math.max(0, -commission)),
      round(profit + commission + swap),
      `${layout.platform.toUpperCase()} #${(get(r, "id") ?? "").trim()}`.trim(),
    ]);
  }
  return { platform: layout.platform, header: MT_HEADER, rows: out, used: out.length, skipped };
}
