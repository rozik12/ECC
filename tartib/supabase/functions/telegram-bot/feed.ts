// Данные рынка: индекс страха и жадности, тикеры, календарь событий, доминирование BTC, правила ценовых алертов.
// Файл без зависимостей: точная копия лежит в supabase/functions/telegram-bot/feed.ts (совпадение проверяет tests/market-feed.test.ts).
// Источники бесплатные и без ключей: alternative.me, OKX, faireconomy (календарь ForexFactory), CoinGecko.

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const num = (v: unknown) => Number(v);

// ---------- индекс страха и жадности ----------
export type FngLabel = "extreme_fear" | "fear" | "neutral" | "greed" | "extreme_greed";
export type FearGreed = { value: number; label: FngLabel; previous: number | null; at: number };

export function classifyFng(v: number): FngLabel {
  if (v < 25) return "extreme_fear";
  if (v < 45) return "fear";
  if (v <= 55) return "neutral";
  if (v <= 75) return "greed";
  return "extreme_greed";
}

export function parseFearGreed(body: unknown): FearGreed | null {
  const data = (body as { data?: { value?: unknown; timestamp?: unknown }[] } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const value = num(data[0]?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const prev = data[1] ? num(data[1].value) : NaN;
  return { value, label: classifyFng(value), previous: Number.isFinite(prev) ? prev : null, at: num(data[0].timestamp) * 1000 };
}

// ---------- тикеры ----------
export type Ticker = { symbol: string; base: string; quote: string; last: number; open24h: number; change: number; volumeQuote: number };

/** Тикеры спотового рынка OKX. change — изменение цены за 24 часа в процентах. */
export function parseOkxTickers(body: unknown): Ticker[] {
  const data = (body as { code?: string; data?: Record<string, string>[] } | null)?.data;
  if (!Array.isArray(data) || (body as { code?: string }).code !== "0") return [];
  const out: Ticker[] = [];
  for (const r of data) {
    const [base, quote] = String(r.instId ?? "").split("-");
    const last = num(r.last);
    const open24h = num(r.open24h);
    if (!base || !quote || !(last > 0) || !(open24h > 0)) continue;
    out.push({ symbol: `${base}${quote}`, base, quote, last, open24h, change: ((last - open24h) / open24h) * 100, volumeQuote: num(r.volCcy24h) || 0 });
  }
  return out;
}

/** Лидеры роста и падения среди достаточно ликвидных пар к USDT (мелкие монеты с почти нулевым оборотом сильно «прыгают» и только мешают). */
export function topMovers(tickers: Ticker[], opts: { quote?: string; minVolume?: number; limit?: number } = {}): { gainers: Ticker[]; losers: Ticker[] } {
  const { quote = "USDT", minVolume = 2_000_000, limit = 8 } = opts;
  const pool = tickers.filter((t) => t.quote === quote && t.volumeQuote >= minVolume && !/^(USDC|USDG|DAI|TUSD|FDUSD|PYUSD|USDD|EURT)$/.test(t.base));
  return {
    gainers: pool.filter((t) => t.change > 0).sort((a, b) => b.change - a.change).slice(0, limit),
    losers: pool.filter((t) => t.change < 0).sort((a, b) => a.change - b.change).slice(0, limit),
  };
}

export function priceMap(tickers: Ticker[], symbols: string[]): Record<string, { last: number; change: number }> {
  const want = new Set(symbols);
  const out: Record<string, { last: number; change: number }> = {};
  for (const t of tickers) if (want.has(t.symbol)) out[t.symbol] = { last: t.last, change: t.change };
  return out;
}

// ---------- ценовые алерты ----------
export type AlertDirection = "above" | "below";

/** Сработал ли алерт: цена поднялась до уровня («above») или опустилась до него («below»). */
export function alertTriggered(direction: AlertDirection, level: number, last: number): boolean {
  return direction === "above" ? last >= level : last <= level;
}

/** Направление по умолчанию: уровень выше текущей цены ждём «снизу вверх», ниже — «сверху вниз». */
export function defaultDirection(level: number, current: number): AlertDirection {
  return level >= current ? "above" : "below";
}

// ---------- календарь событий ----------
export type Impact = "high" | "medium" | "low" | "holiday";
export type CalendarEvent = { title: string; country: string; at: number; impact: Impact; forecast: string; previous: string };

const IMPACTS: Record<string, Impact> = { high: "high", medium: "medium", low: "low", holiday: "holiday", "non-economic": "holiday" };

export function parseCalendar(body: unknown): CalendarEvent[] {
  if (!Array.isArray(body)) return [];
  const out: CalendarEvent[] = [];
  for (const r of body as Record<string, unknown>[]) {
    const at = Date.parse(String(r.date ?? ""));
    const impact = IMPACTS[String(r.impact ?? "").toLowerCase()];
    const title = String(r.title ?? "").trim().slice(0, 140);
    if (!Number.isFinite(at) || !impact || !title) continue;
    out.push({ title, country: String(r.country ?? "").slice(0, 8), at, impact, forecast: String(r.forecast ?? "").slice(0, 20), previous: String(r.previous ?? "").slice(0, 20) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** События, которые ещё не прошли (с запасом `graceMs` назад, чтобы только что вышедшие не пропадали сразу). */
export function upcomingEvents(events: CalendarEvent[], now: number, opts: { impacts?: Impact[]; limit?: number; graceMs?: number } = {}): CalendarEvent[] {
  const { impacts = ["high", "medium"], limit = 12, graceMs = 30 * 60_000 } = opts;
  return events.filter((e) => impacts.includes(e.impact) && e.at >= now - graceMs).slice(0, limit);
}

export function parseDominance(body: unknown): number | null {
  const v = (body as { data?: { market_cap_percentage?: { btc?: unknown } } } | null)?.data?.market_cap_percentage?.btc;
  const n = num(v);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

// ---------- загрузка ----------
async function getJson(fetchFn: Fetch, url: string, ttl: number): Promise<unknown | null> {
  try {
    const res = await fetchFn(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      ...({ cf: { cacheTtl: ttl, cacheEverything: true } } as object),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const memo = new Map<string, { at: number; value: unknown }>();
const STALE_MS = 6 * 3600_000;

/** Запоминает последний удачный ответ в памяти сервера. Если источник временно отказал (бесплатные ленты иногда ограничивают частые запросы), отдаётся последний известный ответ не старше 6 часов. */
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, isEmpty: (v: T) => boolean): Promise<T> {
  const hit = memo.get(key);
  const t = Date.now();
  if (hit && t - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  if (!isEmpty(value)) {
    memo.set(key, { at: t, value });
    return value;
  }
  return hit && t - hit.at < STALE_MS ? (hit.value as T) : value;
}

export const clearMarketCache = () => memo.clear();

export const getFearGreed = (f: Fetch = fetch) => cached("fng", 600_000, async () => parseFearGreed(await getJson(f, "https://api.alternative.me/fng/?limit=2", 600)), (v) => v === null);
export const getTickers = (f: Fetch = fetch, ttl = 30) => cached(`tickers`, ttl * 1000, async () => parseOkxTickers(await getJson(f, "https://www.okx.com/api/v5/market/tickers?instType=SPOT", ttl)), (v) => v.length === 0);
export const getDominance = (f: Fetch = fetch) => cached("dominance", 900_000, async () => parseDominance(await getJson(f, "https://api.coingecko.com/api/v3/global", 900)), (v) => v === null);

/** Эта неделя и, когда её уже опубликовали, следующая (до публикации адрес отвечает 404, это нормально). */
export const getCalendar = (f: Fetch = fetch) =>
  cached(
    "calendar",
    900_000,
    async () => {
      const [now, next] = await Promise.all([
        getJson(f, "https://nfs.faireconomy.media/ff_calendar_thisweek.json", 900),
        getJson(f, "https://nfs.faireconomy.media/ff_calendar_nextweek.json", 900),
      ]);
      const seen = new Set<string>();
      return [...parseCalendar(now), ...parseCalendar(next)].filter((e) => !seen.has(`${e.at}|${e.country}|${e.title}`) && !!seen.add(`${e.at}|${e.country}|${e.title}`)).sort((a, b) => a.at - b.at);
    },
    (v) => v.length === 0,
  );
