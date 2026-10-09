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
const KRAKEN_INTERVAL: Record<Timeframe, number> = { "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };
const COINBASE_GRANULARITY: Partial<Record<Timeframe, number>> = { "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 }; // 4 часов у Coinbase нет

export type CandleSource = "okx" | "kraken" | "coinbase" | "binance";
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
/** Что ответил каждый источник (для разбора сбоев): код ответа или 0, если не удалось соединиться. */
export type Attempt = { source: CandleSource; status: number };
export type FetchOptions = { /** Пауза перед повтором после «слишком много запросов», мс */ retryMs?: number; now?: number };

export function parseKraken(body: unknown): Candle[] {
  const result = (body as { result?: Record<string, unknown> } | null)?.result;
  if (!result) return [];
  const rows = Object.entries(result).find(([k, v]) => k !== "last" && Array.isArray(v))?.[1] as unknown[][] | undefined;
  return (rows ?? []).map((r) => ({ t: num(r[0]) * 1000, o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[6]) })).filter(valid).sort((a, b) => a.t - b.t);
}

/** Coinbase: [время в секундах, минимум, максимум, открытие, закрытие, объём], новые первыми. */
export function parseCoinbase(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({ t: num(r[0]) * 1000, o: num(r[3]), h: num(r[2]), l: num(r[1]), c: num(r[4]), v: num(r[5]) })).filter(valid).sort((a, b) => a.t - b.t);
}

async function getJson(fetchFn: Fetch, url: string, cacheTtl: number): Promise<{ status: number; body: unknown | null }> {
  try {
    const res = await fetchFn(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      ...({ cf: { cacheTtl, cacheEverything: true } } as object),
    });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch {
    return { status: 0, body: null };
  }
}

type Ctx = { fetchFn: Fetch; attempts: Attempt[]; ttl: number; retryMs: number };

/** Запрос с одним повтором, если биржа ответила «слишком много запросов» (общие адреса серверов быстро упираются в лимит). */
async function call(ctx: Ctx, source: CandleSource, url: string) {
  let r = await getJson(ctx.fetchFn, url, ctx.ttl);
  ctx.attempts.push({ source, status: r.status });
  if (r.status === 429 || r.status === 0) {
    await new Promise((res) => setTimeout(res, ctx.retryMs));
    r = await getJson(ctx.fetchFn, url, ctx.ttl);
    ctx.attempts.push({ source, status: r.status });
  }
  return r;
}

/** OKX отдаёт за запрос не больше 100 свечей, поэтому для окна в 120 свечей нужно две страницы (идём от конца к началу). */
async function fromOkx(ctx: Ctx, pair: Pair, tf: Timeframe, start: number, end: number): Promise<Candle[] | null> {
  const all = new Map<number, Candle>();
  let cursor = end + TIMEFRAMES[tf];
  for (let page = 0; page < 4; page++) {
    const { body } = await call(ctx, "okx", `https://www.okx.com/api/v5/market/history-candles?instId=${pair.base}-${pair.quote}&bar=${OKX_BAR[tf]}&after=${cursor}&limit=100`);
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

async function fromKraken(ctx: Ctx, pair: Pair, tf: Timeframe, start: number, end: number): Promise<Candle[] | null> {
  const alias: Record<string, string> = { BTC: "XBT", DOGE: "XDG" };
  const { body } = await call(ctx, "kraken", `https://api.kraken.com/0/public/OHLC?pair=${alias[pair.base] ?? pair.base}${pair.quote}&interval=${KRAKEN_INTERVAL[tf]}&since=${Math.floor(start / 1000) - 1}`);
  if (!body || Array.isArray((body as { error?: unknown[] }).error) && (body as { error: unknown[] }).error.length > 0) return null;
  return parseKraken(body).filter((c) => c.t >= start && c.t <= end);
}

async function fromCoinbase(ctx: Ctx, pair: Pair, tf: Timeframe, start: number, end: number): Promise<Candle[] | null> {
  const granularity = COINBASE_GRANULARITY[tf];
  if (!granularity) return null;
  const { body } = await call(ctx, "coinbase", `https://api.exchange.coinbase.com/products/${pair.base}-${pair.quote}/candles?granularity=${granularity}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`);
  return body ? parseCoinbase(body).filter((c) => c.t >= start && c.t <= end) : null;
}

async function fromBinance(ctx: Ctx, pair: Pair, tf: Timeframe, start: number, end: number): Promise<Candle[] | null> {
  const limit = Math.min(1000, Math.ceil((end - start) / TIMEFRAMES[tf]) + 2);
  const { body } = await call(ctx, "binance", `https://data-api.binance.vision/api/v3/klines?symbol=${pair.symbol}&interval=${tf}&startTime=${start}&endTime=${end}&limit=${limit}`);
  return Array.isArray(body) ? parseBinance(body) : null;
}

/**
 * Свечи за окно. Источники по очереди: OKX, Kraken, Coinbase, Binance (с серверов Cloudflare Binance закрыт, поэтому он последний).
 * candles = null: ни один источник не ответил; []: источники ответили, но свечей за это время нет.
 */
export async function fetchCandles(pair: Pair, tf: Timeframe, start: number, end: number, fetchFn: Fetch = fetch, opts: FetchOptions = {}): Promise<{ candles: Candle[] | null; source: CandleSource | null; attempts: Attempt[] }> {
  const now = opts.now ?? Date.now();
  // Давно закрытые свечи не меняются, их можно держать в кэше дольше
  const ctx: Ctx = { fetchFn, attempts: [], ttl: end < now - 2 * TIMEFRAMES[tf] ? 3600 : 60, retryMs: opts.retryMs ?? 300 };
  const sources: [CandleSource, () => Promise<Candle[] | null>][] = [
    ["okx", () => fromOkx(ctx, pair, tf, start, end)],
    ["kraken", () => fromKraken(ctx, pair, tf, start, end)],
    ["coinbase", () => fromCoinbase(ctx, pair, tf, start, end)],
    ["binance", () => fromBinance(ctx, pair, tf, start, end)],
  ];
  let answeredEmpty = false;
  for (const [source, run] of sources) {
    const candles = await run();
    if (candles && candles.length > 0) return { candles, source, attempts: ctx.attempts };
    if (candles) answeredEmpty = true;
  }
  return { candles: answeredEmpty ? [] : null, source: null, attempts: ctx.attempts };
}
