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
/** Что ответил каждый источник (для разбора сбоев): код ответа или 0, если не удалось соединиться. */
export type Attempt = { source: CandleSource; status: number };

async function getJson(fetchFn: Fetch, url: string): Promise<{ status: number; body: unknown | null }> {
  try {
    const res = await fetchFn(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      ...({ cf: { cacheTtl: 120, cacheEverything: true } } as object),
    });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch {
    return { status: 0, body: null };
  }
}

/** OKX отдаёт за запрос не больше 100 свечей, поэтому для окна в 120 свечей нужно две страницы (идём от конца к началу). */
async function fromOkx(pair: Pair, tf: Timeframe, start: number, end: number, fetchFn: Fetch, attempts: Attempt[]): Promise<Candle[] | null> {
  const all = new Map<number, Candle>();
  let cursor = end + TIMEFRAMES[tf];
  for (let page = 0; page < 4; page++) {
    const { status, body } = await getJson(fetchFn, `https://www.okx.com/api/v5/market/history-candles?instId=${pair.base}-${pair.quote}&bar=${OKX_BAR[tf]}&after=${cursor}&limit=100`);
    attempts.push({ source: "okx", status });
    if (!body || (body as { code?: string }).code !== "0") return page === 0 ? null : [...all.values()].sort((a, b) => a.t - b.t);
    const got = parseOkx(body);
    if (got.length === 0) break;
    for (const c of got) if (c.t >= start && c.t <= end) all.set(c.t, c);
    const oldest = got[0].t;
    if (oldest <= start || got.length < 100) break;
    cursor = oldest;
  }
  return [...all.values()].sort((a, b) => a.t - b.t);
}

/**
 * Свечи за окно. Сначала OKX (доступен из большинства регионов, в том числе с серверов Cloudflare), при сбое Binance.
 * candles = null — оба источника недоступны, [] — пара есть, но свечей за это время нет.
 */
export async function fetchCandles(pair: Pair, tf: Timeframe, start: number, end: number, fetchFn: Fetch = fetch): Promise<{ candles: Candle[] | null; source: CandleSource | null; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  const okx = await fromOkx(pair, tf, start, end, fetchFn, attempts);
  if (okx && okx.length > 0) return { candles: okx, source: "okx", attempts };

  const limit = Math.min(1000, Math.ceil((end - start) / TIMEFRAMES[tf]) + 2);
  const bin = await getJson(fetchFn, `https://data-api.binance.vision/api/v3/klines?symbol=${pair.symbol}&interval=${tf}&startTime=${start}&endTime=${end}&limit=${limit}`);
  attempts.push({ source: "binance", status: bin.status });
  if (Array.isArray(bin.body)) {
    const candles = parseBinance(bin.body);
    if (candles.length > 0 || okx !== null) return { candles, source: "binance", attempts };
  }
  // OKX ответил, но свечей нет, и Binance не помог: данных действительно нет
  if (okx !== null && okx.length === 0 && (bin.status === 200 || bin.status === 400)) return { candles: [], source: "okx", attempts };
  return { candles: null, source: null, attempts };
}
