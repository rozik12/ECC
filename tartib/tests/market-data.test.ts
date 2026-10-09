import test from "node:test";
import assert from "node:assert/strict";
import { candleWindow, CANDLES_AFTER, CANDLES_BEFORE, fetchCandles, isTimeframe, normalizePair, parseBinance, parseOkx, TIMEFRAMES } from "../lib/market-data.ts";

test("график: название пары приводится к виду биржи", () => {
  for (const [input, symbol, base, quote] of [["BTCUSDT", "BTCUSDT", "BTC", "USDT"], ["btc/usdt", "BTCUSDT", "BTC", "USDT"], ["ETH-USDT", "ETHUSDT", "ETH", "USDT"], ["SOLUSDT.P", "SOLUSDT", "SOL", "USDT"], ["BTCUSDT PERP", "BTCUSDT", "BTC", "USDT"], ["ethbtc", "ETHBTC", "ETH", "BTC"], [" 1000PEPEUSDT ", "1000PEPEUSDT", "1000PEPE", "USDT"]]) {
    const p = normalizePair(input);
    assert.deepEqual(p && [p.symbol, p.base, p.quote], [symbol, base, quote], input);
  }
  for (const bad of ["EURUSD", "AAPL", "NQ", "", "USDT", "BTC", "что-то", "BTCUSD", "../etc", "BTCUSDT;DROP"]) assert.equal(normalizePair(bad), null, bad);
});

test("график: окно свечей вокруг сделки и ограничение «сейчас»", () => {
  const at = Date.UTC(2026, 9, 1, 10, 7);
  const w = candleWindow(at, "1h", Date.UTC(2026, 11, 1));
  assert.equal(w.start, Date.UTC(2026, 9, 1, 10) - CANDLES_BEFORE * TIMEFRAMES["1h"]);
  assert.equal(w.end, Date.UTC(2026, 9, 1, 10) + CANDLES_AFTER * TIMEFRAMES["1h"]);
  const recent = candleWindow(at, "1h", at + 3600_000);
  assert.equal(recent.end, at + 3600_000);
  assert.ok(isTimeframe("15m") && !isTimeframe("2m") && !isTimeframe(undefined) && !isTimeframe("constructor"));
});

test("график: разбор ответов Binance и OKX, мусор отбрасывается", () => {
  const b = parseBinance([[1000, "10", "12", "9", "11", "5", 0], [2000, "x", "1", "1", "1", "1"], [3000, "11", "8", "9", "10", "1"], "bad"]);
  assert.deepEqual(b, [{ t: 1000, o: 10, h: 12, l: 9, c: 11, v: 5 }]); // у второй цена не число, у третьей high < low
  assert.deepEqual(parseBinance({ code: -1 }), []);
  const o = parseOkx({ code: "0", data: [["3000", "3", "4", "2", "3.5", "1"], ["2000", "2", "3", "1", "2.5", "1"]] });
  assert.deepEqual(o.map((c) => c.t), [2000, 3000]); // по возрастанию времени
  assert.deepEqual(parseOkx(null), []);
});

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

test("график: запасной источник при сбое Binance", async () => {
  const pair = normalizePair("BTCUSDT")!;
  const urls: string[] = [];
  const okxBody = { code: "0", data: [["5000", "1", "2", "0.5", "1.5", "1"], ["1000", "1", "2", "0.5", "1.5", "1"]] };
  const r1 = await fetchCandles(pair, "1h", 1000, 6000, (u) => { urls.push(u); return u.includes("binance") ? json({ code: 0 }, 451) : json(okxBody); });
  assert.equal(r1?.source, "okx");
  assert.deepEqual(r1?.candles.map((c) => c.t), [1000, 5000]);
  assert.ok(urls[0].includes("symbol=BTCUSDT") && urls[0].includes("interval=1h") && urls[1].includes("instId=BTC-USDT") && urls[1].includes("bar=1H"));
  const r2 = await fetchCandles(pair, "1h", 1000, 6000, () => json([[1000, "1", "2", "0.5", "1.5", "1"]]));
  assert.equal(r2?.source, "binance");
  assert.equal(r2?.candles.length, 1);
  assert.equal(await fetchCandles(pair, "1h", 1000, 6000, () => json({}, 500)), null);
  assert.equal(await fetchCandles(pair, "1h", 1000, 6000, () => Promise.reject(new Error("network"))), null);
  const empty = await fetchCandles(pair, "1h", 1000, 6000, () => json([])); // у Binance пара есть, свечей нет
  assert.deepEqual(empty, { candles: [], source: "binance" });
});
