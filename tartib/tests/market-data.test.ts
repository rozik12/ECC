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
const okxRow = (t: number) => [String(t), "1", "2", "0.5", "1.5", "1"];
const HOUR = TIMEFRAMES["1h"];

test("график: OKX первым, постраничная загрузка по 100 свечей", async () => {
  const pair = normalizePair("BTCUSDT")!;
  const urls: string[] = [];
  const start = 1000 * HOUR;
  const end = start + 119 * HOUR; // 120 свечей: нужно две страницы по 100
  const fake = (u: string) => {
    urls.push(u);
    const after = Number(new URL(u).searchParams.get("after"));
    const ts: number[] = [];
    for (let t = Math.floor((after - 1) / HOUR) * HOUR; ts.length < 100 && t >= start; t -= HOUR) ts.push(t); // новые первыми
    return json({ code: "0", data: ts.map(okxRow) });
  };
  const r = await fetchCandles(pair, "1h", start, end, fake);
  assert.equal(r.source, "okx");
  assert.equal(r.candles?.length, 120);
  assert.equal(r.candles?.[0].t, start);
  assert.equal(r.candles?.[119].t, end);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.includes("instId=BTC-USDT") && u.includes("bar=1H") && !u.includes("binance")));
  assert.deepEqual(r.attempts, [{ source: "okx", status: 200 }, { source: "okx", status: 200 }]);
});

test("график: запасной Binance при сбое OKX, диагностика попыток", async () => {
  const pair = normalizePair("BTCUSDT")!;
  const byHost = (okx: () => Promise<Response>, bin: () => Promise<Response>) => (u: string) => (u.includes("okx.com") ? okx() : bin());
  const r1 = await fetchCandles(pair, "1h", 1000, 6000, byHost(() => json({}, 429), () => json([[1000, "1", "2", "0.5", "1.5", "1"]])));
  assert.equal(r1.source, "binance");
  assert.equal(r1.candles?.length, 1);
  assert.deepEqual(r1.attempts, [{ source: "okx", status: 429 }, { source: "binance", status: 200 }]);
  // обе биржи недоступны
  const r2 = await fetchCandles(pair, "1h", 1000, 6000, byHost(() => json({}, 500), () => json({ code: 0 }, 451)));
  assert.equal(r2.candles, null);
  assert.deepEqual(r2.attempts, [{ source: "okx", status: 500 }, { source: "binance", status: 451 }]);
  // сеть упала
  const r3 = await fetchCandles(pair, "1h", 1000, 6000, () => Promise.reject(new Error("network")));
  assert.equal(r3.candles, null);
  assert.equal(r3.attempts.every((a) => a.status === 0), true);
  // OKX не знает пару (код 51001), Binance знает
  const r4 = await fetchCandles(pair, "1h", 1000, 6000, byHost(() => json({ code: "51001", data: [] }), () => json([[2000, "1", "2", "0.5", "1.5", "1"]])));
  assert.equal(r4.source, "binance");
  assert.equal(r4.candles?.[0].t, 2000);
});

test("график: свечей за это время нет у обеих бирж", async () => {
  const pair = normalizePair("BTCUSDT")!;
  const r = await fetchCandles(pair, "1h", 1000, 6000, (u) => (u.includes("okx.com") ? json({ code: "0", data: [] }) : json([])));
  assert.deepEqual(r.candles, []);
});
