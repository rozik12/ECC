import test from "node:test";
import assert from "node:assert/strict";
import { EXCHANGES, liquidationCheck, rateFor, roundTripFee } from "../lib/crypto.ts";

test("комиссия туда и обратно", () => {
  // оборот 100*2 + 110*2 = 420, ставка 0,05% = 0,21
  assert.equal(roundTripFee({ entry: 100, exit: 110, size: 2, ratePct: 0.05 }), 0.21);
  // без цены выхода считается по цене входа
  assert.equal(roundTripFee({ entry: 100, exit: null, size: 1, ratePct: 0.1 }), 0.2);
  assert.equal(roundTripFee({ entry: 0, exit: null, size: 1, ratePct: 0.1 }), null);
  assert.equal(roundTripFee({ entry: 1, exit: 1, size: 1, ratePct: 9 }), null); // нереальная ставка
});

test("ставки бирж", () => {
  assert.ok(EXCHANGES.length >= 5);
  assert.equal(rateFor("binance", "perp", "taker"), 0.05);
  assert.equal(rateFor("bybit", "spot", "maker"), 0.1);
  assert.equal(rateFor("unknown", "spot", "maker"), null);
});

test("ликвидация и стоп", () => {
  // плечо 10x, поддерживающая маржа 0,5%: расстояние до ликвидации 9,5%
  const safe = liquidationCheck({ entry: 100, stop: 98, leverage: 10, direction: "long" });
  assert.ok(safe && Math.abs(safe.price - 90.5) < 1e-9 && safe.danger === "none");
  assert.equal(liquidationCheck({ entry: 100, stop: 89, leverage: 10, direction: "long" })?.danger, "before_stop");
  assert.equal(liquidationCheck({ entry: 100, stop: 91.5, leverage: 10, direction: "long" })?.danger, "close");
  const short = liquidationCheck({ entry: 100, stop: 111, leverage: 10, direction: "short" });
  assert.ok(short && Math.abs(short.price - 109.5) < 1e-9 && short.danger === "before_stop");
  assert.equal(liquidationCheck({ entry: 100, stop: 90, leverage: 1, direction: "long" }), null);
  assert.equal(liquidationCheck({ entry: 100, stop: null, leverage: 5, direction: "long" })?.danger, "none");
});
