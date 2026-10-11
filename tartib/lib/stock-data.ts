// Свечи и котировки американских акций, индексов и фьючерсов через публичный график Yahoo Finance (без ключа).
// Источник неофициальный и данные могут идти с задержкой: показываем это пользователю и при сбое ничего не придумываем.
// Файл без зависимостей, чтобы его можно было тестировать.
import { TIMEFRAMES, type Candle, type Timeframe } from "./market-data.ts";

const FUTURES_ROOTS: Record<string, string> = { NQ: "NQ", MNQ: "NQ", ES: "ES", MES: "ES", YM: "YM", MYM: "YM", RTY: "RTY", M2K: "RTY", CL: "CL", MCL: "CL", GC: "GC", MGC: "GC" };
const FUTURES_RE = /^(MNQ|MES|MYM|M2K|MCL|MGC|NQ|ES|YM|RTY|CL|GC)(=F|1!|[FGHJKMNQUVXZ]\d{1,2})?$/;

/** Название инструмента из журнала → тикер для Yahoo, либо null, если это не акция, индекс или фьючерс из поддерживаемых. */
export function normalizeTicker(instrument: string, market: string): string | null {
  const s = instrument.toUpperCase().trim().replace(/\s+/g, "");
  if (market === "futures") {
    const m = FUTURES_RE.exec(s);
    return m ? `${FUTURES_ROOTS[m[1]]}=F` : null;
  }
  if (market === "stocks") {
    if (/^\^[A-Z]{2,6}$/.test(s)) return s; // индексы: ^NDX, ^GSPC, ^VIX
    if (/^[A-Z]{1,5}([.-][A-Z])?$/.test(s)) return s.replace(".", "-"); // BRK.B → BRK-B
  }
  return null;
}

const INTERVAL: Record<Timeframe, string> = { "5m": "5m", "15m": "15m", "1h": "60m", "4h": "60m", "1d": "1d" };
/** Насколько далеко назад Yahoo отдаёт данные такого масштаба, в днях. */
const HISTORY_DAYS: Record<Timeframe, number> = { "5m": 59, "15m": 59, "1h": 729, "4h": 729, "1d": 36500 };

type YahooBody = { chart?: { result?: { timestamp?: number[]; meta?: Record<string, unknown>; indicators?: { quote?: Record<string, (number | null)[]>[] } }[] } };

/** Ответ Yahoo → свечи. Строки с пустыми значениями (бывают в нерабочее время) пропускаются. */
export function parseYahoo(body: unknown): Candle[] {
  const r = (body as YahooBody | null)?.chart?.result?.[0];
  const ts = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!ts || !q) return [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = { t: ts[i] * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] ?? 0 };
    if ([c.o, c.h, c.l, c.c].every((x) => typeof x === "number" && Number.isFinite(x)) && (c.h as number) >= (c.l as number)) out.push(c as Candle);
  }
  return out;
}

/** Часовые свечи → четырёхчасовые (границы по времени UTC; для обзора этого достаточно). */
export function aggregate(candles: Candle[], ms: number): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of candles) {
    const key = Math.floor(c.t / ms) * ms;
    const cur = map.get(key);
    if (!cur) map.set(key, { ...c, t: key });
    else { cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.c = c.c; cur.v += c.v; }
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

export type StockResult = { candles: Candle[] | null; status: number };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchStockCandles(ticker: string, tf: Timeframe, start: number, end: number, fetchFn: Fetch = fetch, now = Date.now()): Promise<StockResult> {
  // Yahoo не отдаёт мелкие свечи старше ~60 дней: это «данных нет», а не сбой
  if (start < now - HISTORY_DAYS[tf] * 86_400_000) return { candles: [], status: 200 };
  const p1 = Math.floor(start / 1000);
  const p2 = Math.floor(end / 1000) + 1;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${INTERVAL[tf]}&period1=${p1}&period2=${p2}&includePrePost=true`;
  try {
    const res = await fetchFn(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      ...({ cf: { cacheTtl: end < now - 2 * TIMEFRAMES[tf] ? 3600 : 60, cacheEverything: true } } as object),
    });
    if (res.status === 404) return { candles: [], status: 404 };
    if (!res.ok) return { candles: null, status: res.status };
    const candles = parseYahoo(await res.json());
    return { candles: tf === "4h" ? aggregate(candles, TIMEFRAMES["4h"]) : candles, status: 200 };
  } catch {
    return { candles: null, status: 0 };
  }
}

export type Quote = { symbol: string; price: number; prev: number; changePct: number };

/** Последняя цена и изменение к прошлому закрытию. null — не удалось получить (ничего не придумываем). */
export async function fetchQuote(symbol: string, fetchFn: Fetch = fetch): Promise<Quote | null> {
  try {
    const res = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      ...({ cf: { cacheTtl: 120, cacheEverything: true } } as object),
    });
    if (!res.ok) return null;
    return parseQuote(symbol, await res.json());
  } catch {
    return null;
  }
}

export function parseQuote(symbol: string, body: unknown): Quote | null {
  const meta = (body as YahooBody | null)?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0 || price <= 0) return null;
  return { symbol, price, prev, changePct: ((price - prev) / prev) * 100 };
}
