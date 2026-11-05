// Общий кэш готовых публичных страниц для посетителей без входа.
// Зачем: каждая такая страница иначе собирается на сервере заново, а процессорное время на бесплатном тарифе Cloudflare ограничено.
// Файл без зависимостей, чтобы его можно было тестировать. Подключается в cf-worker.js.

type CacheLike = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };
type Inner = (request: Request) => Promise<Response>;
type Ctx = { waitUntil(p: Promise<unknown>): void };

/** Публичные страницы, которые у всех посетителей на одном языке выглядят одинаково. */
const CACHEABLE = /^\/(?:|pricing|terms|privacy|news|tools(?:\/(?!sessions$)[a-z-]+)?|blog(?:\/[a-z0-9-]+)?)$/;
const TTL_SEC = 300;

/** Ключ кэша или null, если страницу кэшировать нельзя (вошедший пользователь, параметры адреса, не GET). */
export function pageCacheKey(method: string, url: URL, cookie: string, version: string): string | null {
  if (method !== "GET" || url.search || !CACHEABLE.test(url.pathname)) return null;
  if (/(?:^|;\s*)sb-/.test(cookie)) return null; // есть сессия: страница может отличаться
  const locale = /(?:^|;\s*)tartib_locale=(ru|uz|en)\b/.exec(cookie)?.[1] ?? "def";
  return `https://cache.tartib.internal/page/${encodeURIComponent(version)}/${locale}${url.pathname}`;
}

/** Отдаёт страницу из кэша, а при промахе собирает её, отдаёт и кладёт в кэш (на 5 минут, отдельно для каждой версии сайта). */
export async function withPageCache(request: Request, version: string, cache: CacheLike | undefined, ctx: Ctx, inner: Inner): Promise<Response> {
  const key = cache ? pageCacheKey(request.method, new URL(request.url), request.headers.get("cookie") ?? "", version) : null;
  if (!cache || !key) return inner(request);
  const req = new Request(key);
  try {
    const hit = await cache.match(req);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("cache-control", "private, no-cache");
      headers.set("x-tartib-cache", "HIT");
      return new Response(hit.body, { status: hit.status, headers });
    }
  } catch { /* кэш недоступен: собираем страницу как обычно */ }
  const res = await inner(request);
  if (res.status === 200 && !res.headers.has("set-cookie") && /text\/html/.test(res.headers.get("content-type") ?? "")) {
    const copy = new Response(res.clone().body, { status: 200, headers: new Headers(res.headers) });
    copy.headers.set("cache-control", `public, max-age=${TTL_SEC}`);
    ctx.waitUntil(cache.put(req, copy).catch(() => {}));
  }
  const out = new Response(res.body, res);
  out.headers.set("x-tartib-cache", "MISS");
  return out;
}
