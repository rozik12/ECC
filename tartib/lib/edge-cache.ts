// Общий кэш для всех пользователей: один запрос к источнику цен на всех, а не по запросу на каждого.
// На Cloudflare это кэш дата-центра (caches.default), вне Cloudflare и в тестах — память процесса.
// Файл без зависимостей, чтобы его можно было тестировать.

type CacheLike = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

const mem = new Map<string, { at: number; value: unknown }>();
const STALE_MS = 10 * 60_000;

const defaultCache = (): CacheLike | undefined => (globalThis as { caches?: { default?: CacheLike } }).caches?.default;

/**
 * Значение по ключу из общего кэша; если его нет или оно старше ttlSec, вызывается compute и результат кладётся в кэш.
 * Пустой результат (null) не кэшируется. При сбое источника отдаётся последнее известное значение не старше 10 минут.
 */
export async function sharedJson<T>(key: string, ttlSec: number, compute: () => Promise<T | null>, cache: CacheLike | undefined = defaultCache(), now = Date.now()): Promise<T | null> {
  const req = new Request(`https://cache.tartib.internal/${encodeURIComponent(key)}`);
  const local = mem.get(key);
  if (local && now - local.at < ttlSec * 1000) return local.value as T;
  if (cache) {
    try {
      const hit = await cache.match(req);
      if (hit) {
        const value = (await hit.json()) as T;
        mem.set(key, { at: now, value });
        return value;
      }
    } catch { /* кэш недоступен: идём к источнику */ }
  }
  const value = await compute();
  if (value === null) return local && now - local.at < STALE_MS ? (local.value as T) : null;
  mem.set(key, { at: now, value });
  if (mem.size > 200) mem.delete(mem.keys().next().value as string);
  if (cache) {
    try { await cache.put(req, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSec}` } })); } catch { /* не страшно */ }
  }
  return value;
}

export const clearEdgeCache = () => mem.clear();
