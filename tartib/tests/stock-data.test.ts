import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, fetchQuote, fetchStockCandles, normalizeTicker, parseQuote, parseYahoo } from "../lib/stock-data.ts";

test("тикеры: акции, индексы, фьючерсы", () => {
  assert.equal(normalizeTicker("aapl", "stocks"), "AAPL");
  assert.equal(normalizeTicker("BRK.B", "stocks"), "BRK-B");
  assert.equal(normalizeTicker("^ndx", "stocks"), "^NDX");
  assert.equal(normalizeTicker("MNQ", "futures"), "NQ=F");
  assert.equal(normalizeTicker("NQZ5", "futures"), "NQ=F");
  assert.equal(normalizeTicker("ES1!", "futures"), "ES=F");
  assert.equal(normalizeTicker("BTC/USDT", "stocks"), null);
  assert.equal(normalizeTicker("AAPL", "crypto"), null);
  assert.equal(normalizeTicker("AAPL; DROP", "stocks"), null);
  assert.equal(normalizeTicker("XYZ", "futures"), null);
});

const body = { chart: { result: [{ timestamp: [1000, 2000, 3000], meta: { regularMarketPrice: 110, chartPreviousClose: 100 }, indicators: { quote: [{ open: [1, null, 3], high: [2, null, 4], low: [0.5, null, 2], close: [1.5, null, 3.5], volume: [10, null, 5] }] } }] } };

test("parseYahoo пропускает пустые строки", () => {
  const c = parseYahoo(body);
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { t: 1_000_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });
  assert.deepEqual(parseYahoo({}), []);
});

test("aggregate: 1ч → 4ч", () => {
  const H = 3_600_000;
  const a = aggregate([{ t: 0, o: 1, h: 3, l: 1, c: 2, v: 1 }, { t: H, o: 2, h: 5, l: 2, c: 4, v: 1 }, { t: 5 * H, o: 9, h: 9, l: 8, c: 8, v: 1 }], 4 * H);
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { t: 0, o: 1, h: 5, l: 1, c: 4, v: 2 });
});

test("котировка и сбои", async () => {
  const q = parseQuote("QQQ", body);
  assert.ok(q && Math.abs(q.changePct - 10) < 1e-9);
  assert.equal(parseQuote("X", {}), null);
  const ok = async () => new Response(JSON.stringify(body));
  const bad = async () => new Response("no", { status: 500 });
  const boom = async () => { throw new Error("net"); };
  assert.ok((await fetchQuote("QQQ", ok as never)) !== null);
  assert.equal(await fetchQuote("QQQ", bad as never), null);
  assert.equal(await fetchQuote("QQQ", boom as never), null);
  const now = Date.now();
  assert.equal((await fetchStockCandles("AAPL", "5m", now - 400 * 86_400_000, now - 399 * 86_400_000, ok as never, now)).candles?.length, 0); // слишком давно
  assert.equal((await fetchStockCandles("AAPL", "1h", now - 86_400_000, now, bad as never, now)).candles, null);
  assert.equal((await fetchStockCandles("AAPL", "1h", now - 86_400_000, now, ok as never, now)).candles?.length, 2);
});
