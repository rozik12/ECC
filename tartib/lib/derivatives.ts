// Данные по бессрочным контрактам с OKX (публичные, без ключа): ставка фандинга, открытый интерес, соотношение лонгов и шортов.
// Файл без зависимостей от интерфейса, чтобы его можно было тестировать.

export const DERIV_COINS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB"] as const;
export const LS_COINS = ["BTC", "ETH", "SOL"] as const;

export type Funding = { rate: number; perHours: number | null; nextAt: number | null; annualPct: number | null };
export type DerivRow = { coin: string; funding: Funding | null; oiUsd: number | null; longShort: number | null };

const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));

/** Ответ funding-rate OKX → ставка за период, длина периода (часы), время следующей выплаты и ставка в пересчёте на год (простая, без сложных процентов). */
export function parseFunding(body: unknown): Funding | null {
  const d = (body as { code?: string; data?: Record<string, string>[] } | null)?.data?.[0];
  if (!d || (body as { code?: string }).code !== "0") return null;
  const rate = num(d.fundingRate);
  if (!Number.isFinite(rate) || Math.abs(rate) > 0.1) return null;
  const at = num(d.fundingTime);
  const next = num(d.nextFundingTime);
  const perHours = Number.isFinite(at) && Number.isFinite(next) && next > at ? Math.round((next - at) / 3_600_000) : null;
  return { rate: rate * 100, perHours, nextAt: Number.isFinite(next) ? next : null, annualPct: perHours ? rate * 100 * (24 / perHours) * 365 : null };
}

/** Ответ open-interest OKX → открытый интерес в долларах. */
export function parseOpenInterest(body: unknown): number | null {
  const d = (body as { code?: string; data?: Record<string, string>[] } | null)?.data?.[0];
  if (!d || (body as { code?: string }).code !== "0") return null;
  const v = num(d.oiUsd);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** Ответ long-short-account-ratio OKX → последнее значение: число счетов с длинными позициями на один счёт с короткими. */
export function parseLongShort(body: unknown): number | null {
  const d = (body as { code?: string; data?: unknown[][] } | null)?.data?.[0];
  if (!d || (body as { code?: string }).code !== "0") return null;
  const v = num(d[1]);
  return Number.isFinite(v) && v > 0 && v < 1000 ? v : null;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(f: Fetch, url: string, ttl: number): Promise<unknown | null> {
  try {
    const res = await f(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tartib/1.0; +https://tartib.uk)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      ...({ cf: { cacheTtl: ttl, cacheEverything: true } } as object),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Таблица по главным монетам. Если часть данных не пришла, на её месте null (ничего не придумываем). Пусто полностью — null. */
export async function fetchDerivatives(f: Fetch = fetch, ttl = 30): Promise<DerivRow[] | null> {
  const base = "https://www.okx.com/api/v5";
  const rows = await Promise.all(DERIV_COINS.map(async (coin): Promise<DerivRow> => {
    const inst = `${coin}-USDT-SWAP`;
    const [fr, oi, ls] = await Promise.all([
      getJson(f, `${base}/public/funding-rate?instId=${inst}`, ttl),
      getJson(f, `${base}/public/open-interest?instType=SWAP&instId=${inst}`, ttl),
      (LS_COINS as readonly string[]).includes(coin) ? getJson(f, `${base}/rubik/stat/contracts/long-short-account-ratio?ccy=${coin}&period=1H`, ttl * 5) : Promise.resolve(null),
    ]);
    return { coin, funding: parseFunding(fr), oiUsd: parseOpenInterest(oi), longShort: parseLongShort(ls) };
  }));
  return rows.some((r) => r.funding || r.oiUsd !== null) ? rows : null;
}
