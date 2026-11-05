import test from "node:test";
import assert from "node:assert/strict";
import { detectBehavior, detectMarket, detectStyle, TRADER_GROUPS, TRADER_TYPE_COUNT } from "../lib/trader-types.ts";

const at = "2026-10-01T10:00:00Z";
const closeAfter = (min: number) => new Date(Date.parse(at) + min * 60000).toISOString();
const mk = (min: number, n = 6) => Array.from({ length: n }, () => ({ tradedAt: at, closedAt: closeAfter(min) }));

test("группы и число видов", () => {
  assert.equal(TRADER_GROUPS.length, 6);
  assert.equal(TRADER_TYPE_COUNT, 30);
  const ids = TRADER_GROUPS.flatMap((g) => g.types);
  assert.equal(new Set(ids).size, ids.length);
});

test("стиль по длительности", () => {
  assert.equal(detectStyle(mk(3))?.style, "scalper");
  assert.equal(detectStyle(mk(120))?.style, "day");
  assert.equal(detectStyle(mk(3000))?.style, "swing");
  assert.equal(detectStyle(mk(60000))?.style, "position");
  assert.equal(detectStyle(mk(3, 4)), null); // мало сделок
  assert.equal(detectStyle(Array.from({ length: 8 }, () => ({ tradedAt: at, closedAt: null }))), null); // нет времени закрытия
});

test("рынок и поведение", () => {
  assert.deepEqual(detectMarket([...Array(4).fill({ market: "stocks" }), { market: "crypto" }, { market: "crypto" }]), { market: "stocks", share: 4 / 6 });
  assert.equal(detectMarket([{ market: "stocks" }]), null);
  const base = { emotion: "calm", mistakes: [] as string[], rulesFollowed: true };
  assert.equal(detectBehavior(Array(6).fill(base))?.behavior, "systematic");
  assert.equal(detectBehavior([...Array(3).fill({ ...base, mistakes: ["revenge"], rulesFollowed: false }), ...Array(3).fill(base)])?.behavior, "revenge");
  assert.equal(detectBehavior([...Array(3).fill({ ...base, emotion: "fomo" }), ...Array(3).fill(base)])?.behavior, "impulsive");
  assert.equal(detectBehavior([...Array(2).fill({ ...base, rulesFollowed: false }), ...Array(4).fill(base)]), null); // 67% правил, выраженной модели нет
  assert.equal(detectBehavior(Array(3).fill(base)), null);
});
