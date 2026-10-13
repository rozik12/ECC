// Свечи и котировки американских акций, индексов и фьючерсов через публичный график Yahoo Finance (без ключа).
// Источник неофициальный и данные могут идти с задержкой: показываем это пользователю и при сбое ничего не придумываем.
// Файл без зависимостей, чтобы его можно было тестировать.
import { TIMEFRAMES, type Candle, type Timeframe } from "./market-data.ts";

const FUTURES_ROOTS: Record<string, string> = {
  NQ: "NQ", MNQ: "NQ", ES: "ES", MES: "ES", YM: "YM", MYM: "YM", RTY: "RTY", M2K: "RTY",
  CL: "CL", MCL: "CL", GC: "GC", MGC: "GC", SI: "SI", SIL: "SI", HG: "HG", NG: "NG", PL: "PL", PA: "PA", BZ: "BZ",
};
const FUTURES_RE = /^(MNQ|MES|MYM|M2K|MCL|MGC|SIL|NQ|ES|YM|RTY|CL|GC|SI|HG|NG|PL|PA|BZ)(=F|1!|[FGHJKMNQUVXZ]\d{1,2})?$/;

/** Названия, которыми трейдеры и брокеры называют популярные инструменты → символ Yahoo. Золото и серебро берутся по фьючерсу COMEX: спотовых цен у источника нет. */
const ALIASES: Record<string, string> = {
  XAUUSD: "GC=F", XAU: "GC=F", GOLD: "GC=F", XAGUSD: "SI=F", XAG: "SI=F", SILVER: "SI=F", XPTUSD: "PL=F", PLATINUM: "PL=F", XPDUSD: "PA=F", XPD: "PA=F", XPT: "PL=F", PALLADIUM: "PA=F", COPPER: "HG=F",
  USOIL: "CL=F", WTI: "CL=F", XTIUSD: "CL=F", OIL: "CL=F", UKOIL: "BZ=F", BRENT: "BZ=F", XBRUSD: "BZ=F", NATGAS: "NG=F", XNGUSD: "NG=F",
  DXY: "DX-Y.NYB", USDX: "DX-Y.NYB", US100: "^NDX", NAS100: "^NDX", USTEC: "^NDX", NDX: "^NDX", US500: "^GSPC", SPX: "^GSPC", SPX500: "^GSPC", SP500: "^GSPC",
  US30: "^DJI", DJI: "^DJI", DOW: "^DJI", US2000: "^RUT", RUT: "^RUT", GER40: "^GDAXI", DE40: "^GDAXI", DAX: "^GDAXI", UK100: "^FTSE", FTSE: "^FTSE",
  JP225: "^N225", NIKKEI: "^N225", HK50: "^HSI", FRA40: "^FCHI", VIX: "^VIX", US10Y: "^TNX",
};
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "UZS", "RUB", "TRY", "CNY", "KZT", "SEK", "NOK", "PLN", "MXN", "ZAR", "SGD", "HKD", "INR", "BRL"];

/** Название инструмента из журнала → символ Yahoo, либо null, если не акция, индекс, фьючерс, металл, нефть или валютная пара. market: рынок сделки; "auto" — угадать (график без сделки). */
export function normalizeTicker(instrument: string, market: string): string | null {
  if (market === "crypto") return null;
  const raw = instrument.toUpperCase().trim().replace(/\s+/g, "");
  if (!raw || raw.length > 14) return null;
  const s = raw.replace(/[/_]/g, "");
  if (ALIASES[s]) return ALIASES[s];
  // Символы Yahoo, уже понятные источнику: GC=F, EURUSD=X, ^GSPC
  if (/^\^[A-Z0-9]{2,8}$/.test(s)) return s;
  if (/^[A-Z]{2,4}=F$/.test(s) && FUTURES_RE.test(s)) return `${FUTURES_ROOTS[s.slice(0, -2)] ?? s.slice(0, -2)}=F`;
  if (/^[A-Z]{6}=X$/.test(s) && CURRENCIES.includes(s.slice(0, 3)) && CURRENCIES.includes(s.slice(3, 6))) return s;
  if (market === "metals") {
    const m = FUTURES_RE.exec(s);
    return m && ["GC", "SI", "PL", "PA", "HG"].includes(FUTURES_ROOTS[m[1]]) ? `${FUTURES_ROOTS[m[1]]}=F` : null;
  }
  if (market === "futures") {
    const m = FUTURES_RE.exec(s);
    return m ? `${FUTURES_ROOTS[m[1]]}=F` : null;
  }
  if (market === "forex" || market === "auto") {
    if (/^[A-Z]{6}$/.test(s) && CURRENCIES.includes(s.slice(0, 3)) && CURRENCIES.includes(s.slice(3)) && s.slice(0, 3) !== s.slice(3)) return `${s}=X`;
    if (market === "forex") return null;
  }
  if (market === "stocks" || market === "auto") {
    if (/^[A-Z]{1,5}([.-][A-Z])?$/.test(s)) return s.replace(".", "-"); // BRK.B → BRK-B
  }
  return null;
}

const INTERVAL: Record<Timeframe, string> = { "5m": "5m", "15m": "15m", "1h": "60m", "4h": "60m", "1d": "1d", "1w": "1wk" };
/** Насколько далеко назад Yahoo отдаёт данные такого масштаба, в днях. */
const HISTORY_DAYS: Record<Timeframe, number> = { "5m": 59, "15m": 59, "1h": 729, "4h": 729, "1d": 36500, "1w": 36500 };

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

type SparkItem = { close?: (number | null)[]; fulldayPrice?: number | null; fulldayChange?: number | null; fulldayChangePercent?: number | null; chartPreviousClose?: number | null };

/** Ответ spark Yahoo (много символов за один запрос) → котировки. Символ без данных пропускается, ничего не придумываем. */
export function parseSpark(body: unknown): Quote[] {
  if (!body || typeof body !== "object") return [];
  const out: Quote[] = [];
  for (const [symbol, raw] of Object.entries(body as Record<string, SparkItem>)) {
    if (!raw || typeof raw !== "object") continue;
    const closes = (raw.close ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const price = Number(raw.fulldayPrice ?? closes[closes.length - 1]);
    // Изменение за день: из ответа, иначе по двум последним закрытиям (а не по началу окна: оно давнее)
    const change = raw.fulldayChange ?? (closes.length >= 2 ? closes[closes.length - 1] - closes[closes.length - 2] : null);
    if (!Number.isFinite(price) || price <= 0 || change === null || !Number.isFinite(Number(change))) continue;
    const prev = price - Number(change);
    if (prev <= 0) continue;
    out.push({ symbol, price, prev, changePct: (Number(change) / prev) * 100 });
  }
  return out;
}

/** Котировки списка символов. Yahoo принимает не больше 20 символов за запрос, поэтому список режется на части. Если источник не ответил, часть пропускается. */
export async function fetchQuotes(symbols: string[], fetchFn: Fetch = fetch, ttl = 120): Promise<Quote[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  const parts = await Promise.all(chunks.map(async (chunk) => {
    try {
      const res = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${chunk.map(encodeURIComponent).join(",")}&range=5d&interval=1d`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        ...({ cf: { cacheTtl: ttl, cacheEverything: true } } as object),
      });
      return res.ok ? parseSpark(await res.json()) : [];
    } catch {
      return [];
    }
  }));
  return parts.flat();
}

export async function fetchQuote(symbol: string, fetchFn: Fetch = fetch): Promise<Quote | null> {
  return (await fetchQuotes([symbol], fetchFn))[0] ?? null;
}
