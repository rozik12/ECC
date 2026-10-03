import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePnl, calculatePosition, type CalcInput } from "../lib/calculations/trade.ts";
import { evaluateRules, scoreChecks, type RuleLike } from "../lib/calculations/rules.ts";
import { dayBounds } from "../lib/time.ts";

const base: CalcInput = {
  balance: 10000, riskPercent: 1, entry: 100, stop: 95, takeProfit: 110,
  leverage: 1, direction: "long", market: "crypto",
};

test("формулы калькулятора для LONG", () => {
  const out = calculatePosition(base);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.result.riskAmount, 100);
  assert.equal(out.result.positionSize, 20);
  assert.equal(out.result.potentialLoss, 100);
  assert.equal(out.result.potentialProfit, 200);
  assert.equal(out.result.riskReward, 2);
  assert.equal(out.result.positionValue, 2000);
  assert.equal(out.result.margin, 2000);
});

test("плечо делит маржу", () => {
  const out = calculatePosition({ ...base, leverage: 10 });
  assert.ok(out.ok && out.result.margin === 200);
});

test("SHORT: стоп выше входа, тейк ниже", () => {
  const out = calculatePosition({ ...base, direction: "short", stop: 105, takeProfit: 90 });
  assert.ok(out.ok && out.result.riskReward === 2);
});

test("валидация направления", () => {
  assert.deepEqual(calculatePosition({ ...base, stop: 105 }), { ok: false, error: "longStop" });
  assert.deepEqual(calculatePosition({ ...base, takeProfit: 90 }), { ok: false, error: "longTp" });
  assert.deepEqual(calculatePosition({ ...base, direction: "short" }), { ok: false, error: "shortStop" });
  assert.deepEqual(calculatePosition({ ...base, direction: "short", stop: 105, takeProfit: 110 }), { ok: false, error: "shortTp" });
  assert.deepEqual(calculatePosition({ ...base, stop: 100 }), { ok: false, error: "stopSame" });
  assert.deepEqual(calculatePosition({ ...base, riskPercent: 0 }), { ok: false, error: "invalidNumbers" });
});

test("Forex показывает лоты, акции — целые штуки", () => {
  const fx = calculatePosition({ ...base, market: "forex", entry: 1.1, stop: 1.099, takeProfit: null, balance: 1000 });
  assert.ok(fx.ok && fx.result.lots !== null && Math.abs(fx.result.lots - 0.1) < 1e-9 && fx.result.riskReward === null);
  const st = calculatePosition({ ...base, market: "stocks", entry: 100, stop: 97 });
  assert.ok(st.ok && st.result.positionSize === 33 && st.result.potentialLoss === 99);
  assert.deepEqual(calculatePosition({ ...base, market: "stocks", balance: 100, entry: 200, stop: 100, takeProfit: 300 }), { ok: false, error: "sizeZero" });
});

test("P&L", () => {
  assert.equal(calculatePnl("long", 100, 110, 2), 20);
  assert.equal(calculatePnl("short", 100, 110, 2), -20);
});

const rule = (rule_type: RuleLike["rule_type"], value: number | null, id: string = rule_type): RuleLike =>
  ({ id, name: id, rule_type, value, is_active: true });

test("проверка правил и оценка", () => {
  const rules = [
    rule("max_risk_percent", 1), rule("min_risk_reward", 2), rule("max_leverage", 10),
    rule("require_stop_loss", null), rule("max_trades_per_day", 3), rule("custom", null),
    { ...rule("max_leverage", 5, "off"), is_active: false },
  ];
  const checks = evaluateRules(rules, { riskPercent: 4.2, riskReward: 1.5, leverage: 5, hasStopLoss: true, tradesToday: 4 });
  const by = Object.fromEntries(checks.map((c) => [c.rule.id, c.status]));
  assert.equal(checks.length, 6);
  assert.deepEqual(by, {
    max_risk_percent: "violated", min_risk_reward: "violated", max_leverage: "ok",
    require_stop_loss: "ok", max_trades_per_day: "violated", custom: "manual",
  });
  assert.deepEqual(scoreChecks(checks), { score: 4, passed: 2, total: 5 });
  assert.equal(scoreChecks([]).score, null);
});

test("граница правила — не нарушение", () => {
  const checks = evaluateRules([rule("max_risk_percent", 1)], { riskPercent: 1, riskReward: null, leverage: 1, hasStopLoss: true, tradesToday: 1 });
  assert.equal(checks[0].status, "ok");
});

test("границы дня в часовом поясе", () => {
  const { start, end } = dayBounds("Asia/Tashkent", new Date("2026-10-02T20:00:00Z"));
  assert.equal(start.toISOString(), "2026-10-02T19:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-03T19:00:00.000Z");
});

import { parseCsv, safeText, toCsv, unsafeText } from "../lib/csv.ts";

test("CSV: кавычки, запятые, переносы и разные разделители", () => {
  const rows = [["a", 'b,"c"', "line1\nline2"], ["1", "2", "3"]];
  assert.deepEqual(parseCsv(toCsv(rows, ",")), rows);
  assert.deepEqual(parseCsv(toCsv(rows, ";")), rows);
  assert.deepEqual(parseCsv("﻿a;b\r\n1,5;2\r\n"), [["a", "b"], ["1,5", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a,b\n\n1,2\n"), [["a", "b"], ["1", "2"]]);
});

test("CSV: защита от формул", () => {
  assert.equal(safeText("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(safeText("BTC/USDT"), "BTC/USDT");
  assert.equal(unsafeText(safeText("@cmd")), "@cmd");
  assert.equal(unsafeText("'quoted"), "'quoted");
});
