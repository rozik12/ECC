import test from "node:test";
import assert from "node:assert/strict";
import { candleWindow, CANDLES_AFTER, CANDLES_BEFORE, fetchCandles, isTimeframe, normalizePair, parseBinance, parseCoinbase, parseKraken, parseOkx, TIMEFRAMES } from "../lib/market-data.ts";

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
const NOW = Date.UTC(2026, 9, 9);
const FAST = { retryMs: 0, now: NOW };
const host = (u: string) => (["okx", "kraken", "coinbase", "binance"] as const).find((h) => new URL(u).hostname.includes(h)) ?? "other";

test("график: разбор Kraken и Coinbase", () => {
  const k = parseKraken({ error: [], result: { XBTUSDT: [[1000, "10", "12", "9", "11", "10.5", "5", 3], [2000, "x", "1", "1", "1", "1", "1", 1]], last: 2000 } });
  assert.deepEqual(k, [{ t: 1_000_000, o: 10, h: 12, l: 9, c: 11, v: 5 }]);
  assert.deepEqual(parseKraken({ error: ["EQuery:Unknown asset pair"] }), []);
  const c = parseCoinbase([[2000, 9, 12, 10, 11, 5], [1000, 8, 9, 8.5, 8.8, 1], "bad"]);
  assert.deepEqual(c.map((x) => x.t), [1_000_000, 2_000_000]); // по возрастанию
  assert.deepEqual(c[1], { t: 2_000_000, o: 10, h: 12, l: 9, c: 11, v: 5 }); // порядок полей Coinbase: low, high, open, close
  assert.deepEqual(parseCoinbase(null), []);
});

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
  const r = await fetchCandles(pair, "1h", start, end, fake, FAST);
  assert.equal(r.source, "okx");
  assert.equal(r.candles?.length, 120);
  assert.equal(r.candles?.[0].t, start);
  assert.equal(r.candles?.[119].t, end);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.includes("instId=BTC-USDT") && u.includes("bar=1H") && host(u) === "okx"));
  assert.deepEqual(r.attempts, [{ source: "okx", status: 200 }, { source: "okx", status: 200 }]);
});

test("график: один повтор при «слишком много запросов», затем запасные источники по порядку", async () => {
  const pair = normalizePair("BTCUSDT")!;
  const calls: string[] = [];
  // OKX сначала отвечает 429, при повторе всё хорошо
  let first = true;
  const retry = (u: string) => { calls.push(host(u)); if (first) { first = false; return json({}, 429); } return json({ code: "0", data: [okxRow(5000)] }); };
  const r1 = await fetchCandles(pair, "1h", 1000, 6000, retry, FAST);
  assert.equal(r1.source, "okx");
  assert.deepEqual(r1.attempts, [{ source: "okx", status: 429 }, { source: "okx", status: 200 }]);

  // OKX недоступен → Kraken
  const order: string[] = [];
  const fallback = (u: string) => {
    order.push(host(u));
    if (host(u) === "okx") return json({}, 429);
    if (host(u) === "kraken") return json({ error: [], result: { XBTUSDT: [[2, "1", "2", "0.5", "1.5", "1", "3", 1]], last: 2 } });
    return json({}, 500);
  };
  const r2 = await fetchCandles(pair, "1h", 1000, 6000, fallback, FAST);
  assert.equal(r2.source, "kraken");
  assert.deepEqual(order, ["okx", "okx", "kraken"]);
  assert.ok(r2.candles?.[0].t === 2000);

  // OKX и Kraken недоступны → Coinbase (порядок полей другой), потом Binance
  const cb = (u: string) => (host(u) === "coinbase" ? json([[2, 0.5, 2, 1, 1.5, 1]]) : json({}, 503));
  const r3 = await fetchCandles(pair, "1h", 1000, 6000, cb, FAST);
  assert.equal(r3.source, "coinbase");
  assert.deepEqual(r3.candles?.[0], { t: 2000, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 });
  const bin = (u: string) => (host(u) === "binance" ? json([[3000, "1", "2", "0.5", "1.5", "1"]]) : json({}, 403));
  const r4 = await fetchCandles(pair, "1h", 1000, 6000, bin, FAST);
  assert.equal(r4.source, "binance");
  // для 4 часов Coinbase не вызывается (у него нет такого масштаба)
  const seen: string[] = [];
  await fetchCandles(pair, "4h", 1000, 6000, (u) => { seen.push(host(u)); return json({}, 500); }, FAST);
  assert.equal(seen.includes("coinbase"), false);
  assert.equal(seen.includes("binance"), true);
});

test("график: все источники недоступны или свечей нет", async () => {
  const pair = normalizePair("BTCUSDT")!;
  const down = await fetchCandles(pair, "1h", 1000, 6000, () => json({ code: 0 }, 451), FAST);
  assert.equal(down.candles, null);
  assert.equal(down.source, null);
  assert.ok(down.attempts.length >= 4 && down.attempts.every((a) => a.status === 451));
  const offline = await fetchCandles(pair, "1h", 1000, 6000, () => Promise.reject(new Error("network")), FAST);
  assert.equal(offline.candles, null);
  assert.ok(offline.attempts.every((a) => a.status === 0));
  // OKX не знает пару (код 51001), остальные дали пустой список
  const unknown = (u: string) => (host(u) === "okx" ? json({ code: "51001", data: [] }) : host(u) === "binance" ? json([]) : json({}, 404));
  assert.deepEqual((await fetchCandles(pair, "1h", 1000, 6000, unknown, FAST)).candles, []);
});
