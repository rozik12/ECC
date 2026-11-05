import test from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, sma } from "../lib/indicators.ts";

test("SMA: скользящее среднее и начало ряда", () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(sma([5], 3), [null]);
});

test("EMA: первое значение — среднее, дальше сглаживание", () => {
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  assert.equal(e[2], 2); // среднее первых трёх
  assert.equal(e[3], 3); // 4 * 0,5 + 2 * 0,5
  assert.equal(e[4], 4);
});

test("RSI: только рост даёт 100, только падение 0, стоячий ряд 50", () => {
  const up = Array.from({ length: 20 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14)[19], 100);
  const down = Array.from({ length: 20 }, (_, i) => 100 - i);
  assert.equal(rsi(down, 14)[19], 0);
  assert.equal(rsi(new Array(20).fill(100), 14)[19], 50);
  assert.equal(rsi(up.slice(0, 10), 14).every((x) => x === null), true);
  // известный пример (Уайлдер): колебания дают значение внутри диапазона
  const mix = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64];
  const r = rsi(mix, 14);
  assert.ok(Math.abs((r[14] as number) - 70.53) < 0.1, String(r[14]));
});
