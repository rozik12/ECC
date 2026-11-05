import test from "node:test";
import assert from "node:assert/strict";
import { parseTradeMessage } from "../supabase/functions/telegram-bot/parse.ts";

const ok = (text: string) => {
  const r = parseTradeMessage(text);
  assert.equal(r.ok, true, text);
  return r.ok ? r.trade : (null as never);
};

test("полная запись с русскими словами", () => {
  const t = ok("BTCUSDT long 65000 0.1 стоп 64500 тейк 67000");
  assert.deepEqual(t, { instrument: "BTCUSDT", direction: "long", entry: 65000, size: 0.1, stop: 64500, takeProfit: 67000, exit: null, leverage: null, emotion: null });
});

test("английские слова, выход, эмоция, плечо", () => {
  const t = ok("eth short entry 2000 size 1 sl 2050 exit 1950 fomo x5");
  assert.equal(t.instrument, "ETH");
  assert.equal(t.direction, "short");
  assert.equal(t.entry, 2000);
  assert.equal(t.size, 1);
  assert.equal(t.stop, 2050);
  assert.equal(t.exit, 1950);
  assert.equal(t.emotion, "fomo");
  assert.equal(t.leverage, 5);
});

test("запятая как десятичный разделитель и знак равно", () => {
  const t = ok("EURUSD buy 1,0850 10000 стоп=1,0800");
  assert.equal(t.entry, 1.085);
  assert.equal(t.size, 10000);
  assert.equal(t.stop, 1.08);
});

test("лонг в начале и косая черта в инструменте", () => {
  const t = ok("лонг sol/usdt 150 10");
  assert.equal(t.instrument, "SOLUSDT");
  assert.equal(t.direction, "long");
  assert.equal(t.entry, 150);
  assert.equal(t.size, 10);
});

test("не хватает данных — говорим чего именно", () => {
  assert.deepEqual(parseTradeMessage("long 65000 0.1"), { ok: false, missing: "instrument" });
  assert.deepEqual(parseTradeMessage("BTCUSDT 65000 0.1"), { ok: false, missing: "direction" });
  assert.deepEqual(parseTradeMessage("BTCUSDT long"), { ok: false, missing: "entry" });
  assert.deepEqual(parseTradeMessage("BTCUSDT long 65000"), { ok: false, missing: "size" });
});

test("отрицательные и нулевые числа не принимаются", () => {
  assert.deepEqual(parseTradeMessage("BTCUSDT long -5 0"), { ok: false, missing: "entry" });
});

test("болтовня не превращается в сделку", () => {
  assert.equal(parseTradeMessage("привет как дела").ok, false);
});
