// Свечи цены для графика сделки. Источники без ключа: Binance (зеркало рыночных данных), запасной OKX. Только криптопары.
// Файл без зависимостей, чтобы его можно было тестировать.

export const TIMEFRAMES = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 } as const;
export type Timeframe = keyof typeof TIMEFRAMES;
export const isTimeframe = (v: unknown): v is Timeframe => typeof v === "string" && Object.hasOwn(TIMEFRAMES, v);

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Pair = { symbol: string; base: string; quote: string };

const QUOTES = ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH", "EUR", "TRY"];

/** «BTC/USDT», «btc-usdt», «BTCUSDT.P», «BTCUSDT PERP» → BTCUSDT. Не криптопара → null. */
export function normalizePair(instrument: string): Pair | null {
  const s = instrument.toUpperCase().trim().replace(/\.P$|[\s_-]?PERP(ETUAL)?$/, "").replace(/[\s/_\-:.]/g, "");
  const m = new RegExp(`^([A-Z0-9]{2,12}?)(${QUOTES.join("|")})$`).exec(s);
  return m && /[A-Z]/.test(m[1]) ? { symbol: s, base: m[1], quote: m[2] } : null;
}

export const CANDLES_BEFORE = 40;
export const CANDLES_AFTER = 80;

/** Окно свечей вокруг сделки: сколько-то до входа и после; конец не позже «сейчас». */
export function candleWindow(at: number, tf: Timeframe, now = Date.now()): { start: number; end: number } {
  const ms = TIMEFRAMES[tf];
  const start = Math.floor(at / ms) * ms - CANDLES_BEFORE * ms;
  return { start, end: Math.min(now, Math.floor(at / ms) * ms + CANDLES_AFTER * ms) };
}

const num = (v: unknown) => Number(v);
const valid = (c: Candle) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite) && c.h >= c.l && c.t > 0;

export function parseBinance(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({ t: num(r[0]), o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[5]) })).filter(valid);
}

/** OKX отдаёт новые свечи первыми и числа строками. */
export function parseOkx(body: unknown): Candle[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({ t: num(r[0]), o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[5]) })).filter(valid).sort((a, b) => a.t - b.t);
}

const OKX_BAR: Record<Timeframe, string> = { "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };
export type CandleSource = "binance" | "okx";
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetchFn: Fetch, url: string): Promise<unknown | null> {
  try {
    const res = await fetchFn(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      ...({ cf: { cacheTtl: 120, cacheEverything: true } } as object),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Свечи за окно. Сначала Binance, при сбое OKX. null — источники недоступны, [] — пара есть, но свечей за это время нет. */
export async function fetchCandles(pair: Pair, tf: Timeframe, start: number, end: number, fetchFn: Fetch = fetch): Promise<{ candles: Candle[]; source: CandleSource } | null> {
  const limit = Math.min(1000, Math.ceil((end - start) / TIMEFRAMES[tf]) + 2);
  const bin = await getJson(fetchFn, `https://data-api.binance.vision/api/v3/klines?symbol=${pair.symbol}&interval=${tf}&startTime=${start}&endTime=${end}&limit=${limit}`);
  if (Array.isArray(bin)) return { candles: parseBinance(bin), source: "binance" };

  // OKX: «after» отдаёт свечи старше указанного времени, за раз не больше 100
  const okx = await getJson(fetchFn, `https://www.okx.com/api/v5/market/history-candles?instId=${pair.base}-${pair.quote}&bar=${OKX_BAR[tf]}&after=${end + TIMEFRAMES[tf]}&limit=100`);
  if (okx && (okx as { code?: string }).code === "0") return { candles: parseOkx(okx).filter((c) => c.t >= start && c.t <= end), source: "okx" };
  return null;
}
