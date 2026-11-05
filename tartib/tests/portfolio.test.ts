import test from "node:test";
import assert from "node:assert/strict";
import { isStable, positions, valuate, type Lot } from "../lib/portfolio.ts";

const lot = (symbol: string, side: "buy" | "sell", amount: number, price: number, at: string, fee = 0): Lot => ({ symbol, side, amount, price, fee, occurredAt: at });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("докупки усредняют цену", () => {
  const [p] = positions([lot("BTC", "buy", 1, 100, "2026-01-01"), lot("BTC", "buy", 1, 200, "2026-01-02")]);
  near(p.amount, 2); near(p.avgPrice, 150); near(p.cost, 300); near(p.realized, 0);
});

test("продажа фиксирует результат по средней цене, средняя остаётся", () => {
  const [p] = positions([lot("ETH", "buy", 2, 100, "2026-01-01"), lot("ETH", "sell", 1, 150, "2026-01-05")]);
  near(p.amount, 1); near(p.avgPrice, 100); near(p.realized, 50); near(p.cost, 100);
});

test("комиссии входят в стоимость и в результат; порядок записей по времени", () => {
  const ps = positions([lot("SOL", "sell", 1, 30, "2026-02-01", 1), lot("SOL", "buy", 2, 20, "2026-01-01", 2)]);
  const p = ps[0];
  // стоимость 2*20+2 = 42, средняя 21; продажа 1 по 30: (30-21)*1 - 1 = 8
  near(p.realized, 8); near(p.amount, 1); near(p.avgPrice, 21); near(p.fees, 3);
});

test("полная продажа обнуляет позицию, продажа больше купленного помечается", () => {
  const [p] = positions([lot("XRP", "buy", 10, 1, "2026-01-01"), lot("XRP", "sell", 10, 2, "2026-01-02")]);
  near(p.amount, 0); near(p.cost, 0); near(p.realized, 10);
  const [o] = positions([lot("ADA", "buy", 1, 1, "2026-01-01"), lot("ADA", "sell", 5, 2, "2026-01-02")]);
  assert.equal(o.oversold, true); near(o.amount, 0);
});

test("оценка по ценам, стейблкоины и монеты без цены", () => {
  const ps = positions([lot("BTC", "buy", 1, 100, "2026-01-01"), lot("USDT", "buy", 50, 1, "2026-01-01"), lot("FOO", "buy", 5, 2, "2026-01-01")]);
  const v = valuate(ps, { BTC: 150 });
  const btc = v.rows.find((r) => r.symbol === "BTC")!;
  near(btc.value!, 150); near(btc.unrealized!, 50); near(btc.unrealizedPct!, 50);
  const foo = v.rows.find((r) => r.symbol === "FOO")!;
  assert.equal(foo.value, null); assert.equal(foo.share, null);
  near(v.totalValue, 200); near(v.totalCost, 150); near(v.totalUnrealized, 50);
  near(btc.share!, 75);
  assert.ok(isStable("USDT") && !isStable("BTC"));
});

import { classify } from "../lib/portfolio.ts";
import { normalizeTicker } from "../lib/stock-data.ts";

test("источник цены: OKX, Yahoo или нет цены", () => {
  const okx = new Set(["BTC", "ETH", "ARB"]);
  const toTicker = (s: string) => normalizeTicker(s, "auto");
  assert.deepEqual(classify("BTC", okx, toTicker), { kind: "okx", pair: "BTCUSDT" });
  assert.deepEqual(classify("AAPL", okx, toTicker), { kind: "yahoo", ticker: "AAPL" });
  assert.deepEqual(classify("GOLD", okx, toTicker), { kind: "yahoo", ticker: "GC=F" });
  assert.deepEqual(classify("ARB", okx, toTicker), { kind: "okx", pair: "ARBUSDT" }); // монета важнее одноимённой акции
  assert.deepEqual(classify("USDT", okx, toTicker), { kind: "none" });
  assert.deepEqual(classify("???", okx, toTicker), { kind: "none" });
});
