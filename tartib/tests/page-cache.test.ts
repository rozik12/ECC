import test from "node:test";
import assert from "node:assert/strict";
import { pageCacheKey, withPageCache } from "../lib/page-cache.ts";

const u = (p: string) => new URL(`https://tartib.uk${p}`);

test("кэш страниц: какие адреса кэшируются", () => {
  for (const p of ["/", "/tools", "/tools/position-size", "/blog", "/blog/gold-trading-risk", "/pricing", "/news", "/terms"]) assert.ok(pageCacheKey("GET", u(p), "", "v1"), p);
  for (const p of ["/dashboard", "/tools/sessions", "/login", "/api/market/quotes", "/metals", "/u/abc", "/tools/a/b"]) assert.equal(pageCacheKey("GET", u(p), "", "v1"), null, p);
  assert.equal(pageCacheKey("POST", u("/"), "", "v1"), null);
  assert.equal(pageCacheKey("GET", u("/?x=1"), "", "v1"), null);
});

test("кэш страниц: вошедшие пользователи не кэшируются, язык и версия входят в ключ", () => {
  assert.equal(pageCacheKey("GET", u("/"), "sb-abc-auth-token=1; tartib_locale=ru", "v1"), null);
  const ru = pageCacheKey("GET", u("/"), "tartib_locale=ru", "v1");
  const uz = pageCacheKey("GET", u("/"), "a=1; tartib_locale=uz", "v1");
  const none = pageCacheKey("GET", u("/"), "", "v1");
  assert.equal(new Set([ru, uz, none]).size, 3);
  assert.notEqual(pageCacheKey("GET", u("/"), "", "v2"), none);
});

function fakeCache() {
  const store = new Map<string, Response>();
  return { store, match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => { store.set(r.url, res); } };
}

test("кэш страниц: промах собирает страницу и сохраняет, повторный запрос берётся из кэша", async () => {
  const cache = fakeCache();
  let calls = 0;
  const inner = async () => { calls++; return new Response("<html>hi</html>", { headers: { "content-type": "text/html", "cache-control": "private, no-store" } }); };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
  const req = () => new Request("https://tartib.uk/tools", { headers: { cookie: "tartib_locale=en" } });
  const a = await withPageCache(req(), "v1", cache, ctx, inner);
  await Promise.all(pending);
  assert.equal(a.headers.get("x-tartib-cache"), "MISS");
  assert.equal(await a.text(), "<html>hi</html>");
  const b = await withPageCache(req(), "v1", cache, ctx, inner);
  assert.equal(b.headers.get("x-tartib-cache"), "HIT");
  assert.equal(await b.text(), "<html>hi</html>");
  assert.equal(calls, 1);
  await withPageCache(req(), "v2", cache, ctx, inner); // новая версия сайта собирает заново
  assert.equal(calls, 2);
});

test("кэш страниц: ответы с cookie, ошибки и не-HTML не сохраняются", async () => {
  const cache = fakeCache();
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
  const mk = (res: () => Response) => withPageCache(new Request("https://tartib.uk/blog"), "v1", cache, ctx, async () => res());
  await mk(() => new Response("x", { headers: { "content-type": "text/html", "set-cookie": "a=b" } }));
  await mk(() => new Response("x", { status: 500, headers: { "content-type": "text/html" } }));
  await mk(() => new Response("{}", { headers: { "content-type": "application/json" } }));
  await Promise.all(pending);
  assert.equal(cache.store.size, 0);
});
