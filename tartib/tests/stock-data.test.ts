import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, fetchStockCandles, normalizeTicker, fetchQuotes, parseSpark, parseYahoo } from "../lib/stock-data.ts";

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

const spark = { "GC=F": { close: [4100, 4157, 4216.3], fulldayPrice: 4216.3, fulldayChange: 59.3 }, "SI=F": { close: [60, 61, null] }, "BAD": { close: [] } };

test("золото, металлы, валюты и индексы: символы", () => {
  assert.equal(normalizeTicker("XAUUSD", "forex"), "GC=F");
  assert.equal(normalizeTicker("gold", "auto"), "GC=F");
  assert.equal(normalizeTicker("XAG/USD", "forex"), "SI=F");
  assert.equal(normalizeTicker("GC", "futures"), "GC=F");
  assert.equal(normalizeTicker("MGCZ6", "futures"), "GC=F");
  assert.equal(normalizeTicker("USOIL", "forex"), "CL=F");
  assert.equal(normalizeTicker("EUR/USD", "forex"), "EURUSD=X");
  assert.equal(normalizeTicker("USDUZS", "forex"), "USDUZS=X");
  assert.equal(normalizeTicker("US100", "forex"), "^NDX");
  assert.equal(normalizeTicker("GER40", "forex"), "^GDAXI");
  assert.equal(normalizeTicker("DXY", "forex"), "DX-Y.NYB");
  assert.equal(normalizeTicker("^GSPC", "auto"), "^GSPC");
  assert.equal(normalizeTicker("EURUSD=X", "auto"), "EURUSD=X");
  assert.equal(normalizeTicker("AAPL", "auto"), "AAPL");
  assert.equal(normalizeTicker("XYZABC", "forex"), null);
  assert.equal(normalizeTicker("BTC/USDT", "crypto"), null);
  assert.equal(normalizeTicker("ZZZ", "forex"), null);
});

test("котировки: дневное изменение, пропуск пустых, сбои", async () => {
  const q = parseSpark(spark);
  assert.equal(q.length, 2);
  const gold = q.find((x) => x.symbol === "GC=F");
  assert.ok(gold && Math.abs(gold.changePct - (59.3 / (4216.3 - 59.3)) * 100) < 1e-9);
  const silver = q.find((x) => x.symbol === "SI=F"); // последнее закрытие пустое: берём два последних числовых
  assert.ok(silver && silver.price === 61 && Math.abs(silver.changePct - (1 / 60) * 100) < 1e-9);
  assert.deepEqual(parseSpark(null), []);
  const ok = async () => new Response(JSON.stringify(spark));
  const bad = async () => new Response("no", { status: 500 });
  const boom = async () => { throw new Error("net"); };
  assert.equal((await fetchQuotes(["GC=F"], ok as never)).length, 2);
  assert.deepEqual(await fetchQuotes(["GC=F"], bad as never), []);
  assert.deepEqual(await fetchQuotes(["GC=F"], boom as never), []);
  let calls = 0;
  const count = async () => { calls++; return new Response("{}"); };
  await fetchQuotes(Array.from({ length: 45 }, (_, i) => `S${i}`), count as never);
  assert.equal(calls, 3); // не больше 20 символов за запрос
  const now = Date.now();
  const okc = async () => new Response(JSON.stringify(body));
  assert.equal((await fetchStockCandles("AAPL", "5m", now - 400 * 86_400_000, now - 399 * 86_400_000, okc as never, now)).candles?.length, 0); // слишком давно
  assert.equal((await fetchStockCandles("AAPL", "1h", now - 86_400_000, now, bad as never, now)).candles, null);
  assert.equal((await fetchStockCandles("AAPL", "1h", now - 86_400_000, now, okc as never, now)).candles?.length, 2);
});

test("металлы: рынок «metals» и палладий", () => {
  assert.equal(normalizeTicker("XAUUSD", "metals"), "GC=F");
  assert.equal(normalizeTicker("silver", "metals"), "SI=F");
  assert.equal(normalizeTicker("XPDUSD", "metals"), "PA=F");
  assert.equal(normalizeTicker("PA", "metals"), "PA=F");
  assert.equal(normalizeTicker("MGCZ6", "metals"), "GC=F");
  assert.equal(normalizeTicker("PALLADIUM", "auto"), "PA=F");
  assert.equal(normalizeTicker("NQ", "metals"), null); // индекс — не металл
  assert.equal(normalizeTicker("AAPL", "metals"), null);
});
