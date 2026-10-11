import test from "node:test";
import assert from "node:assert/strict";
import { clearEdgeCache, sharedJson } from "../lib/edge-cache.ts";

// Как настоящий кэш: запись живёт ровно max-age секунд (время задаётся вручную)
class FakeCache {
  clock = 0;
  store = new Map<string, { res: Response; at: number; ttl: number }>();
  async match(req: Request) {
    const e = this.store.get(req.url);
    return e && this.clock - e.at < e.ttl * 1000 ? e.res.clone() : undefined;
  }
  async put(req: Request, res: Response) { this.store.set(req.url, { res, at: this.clock, ttl: Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 0) }); }
}

test("один запрос к источнику на всех, пока кэш свеж", async () => {
  clearEdgeCache();
  const cache = new FakeCache();
  let calls = 0;
  const load = async () => { calls++; return { price: 100 + calls }; };
  const t0 = 1_000_000;
  cache.clock = t0;
  const a = await sharedJson("q:GC=F", 10, load, cache, t0);
  cache.clock = t0 + 5_000;
  const b = await sharedJson("q:GC=F", 10, load, cache, t0 + 5_000);
  assert.deepEqual(a, { price: 101 });
  assert.deepEqual(b, { price: 101 });
  assert.equal(calls, 1);
  cache.clock = t0 + 11_000;
  const c = await sharedJson("q:GC=F", 10, load, cache, t0 + 11_000); // кэш устарел
  assert.deepEqual(c, { price: 102 });
  assert.equal(calls, 2);
});

test("кэш другого экземпляра подхватывается, ключи не смешиваются", async () => {
  clearEdgeCache();
  const cache = new FakeCache();
  await sharedJson("a", 10, async () => ({ v: 1 }), cache, 5);
  clearEdgeCache(); // как будто другой экземпляр сервера: память пуста, а общий кэш общий
  let calls = 0;
  const v = await sharedJson("a", 10, async () => { calls++; return { v: 2 }; }, cache, 6);
  assert.deepEqual(v, { v: 1 });
  assert.equal(calls, 0);
  assert.deepEqual(await sharedJson("b", 10, async () => ({ v: 3 }), cache, 7), { v: 3 });
});

test("сбой источника: старое значение вместо ошибки, пустое не кэшируется", async () => {
  clearEdgeCache();
  assert.equal(await sharedJson("x", 10, async () => null, undefined, 1), null);
  assert.deepEqual(await sharedJson("x", 10, async () => ({ n: 1 }), undefined, 2), { n: 1 });
  assert.deepEqual(await sharedJson("x", 10, async () => null, undefined, 20_000), { n: 1 }); // устарело, источник молчит
  assert.equal(await sharedJson("x", 10, async () => null, undefined, 20 * 60_000), null); // слишком старое
});

test("сломанный кэш не мешает", async () => {
  clearEdgeCache();
  const broken = { match: async () => { throw new Error("x"); }, put: async () => { throw new Error("y"); } };
  assert.deepEqual(await sharedJson("z", 10, async () => ({ ok: 1 }), broken as never, 1), { ok: 1 });
});
