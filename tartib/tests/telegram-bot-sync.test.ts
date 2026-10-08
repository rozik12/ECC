import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRules as siteEval } from "../lib/calculations/rules.ts";
import { calculatePnl as sitePnl, tradeMetrics as siteMetrics } from "../lib/calculations/trade.ts";
import { dayBounds as siteDay } from "../lib/time.ts";
import { inferMarket as siteMarket } from "../lib/import-map.ts";
import { evaluateRules as botEval } from "../supabase/functions/telegram-bot/rules.ts";
import { calculatePnl as botPnl, tradeMetrics as botMetrics } from "../supabase/functions/telegram-bot/calc.ts";
import { dayBounds as botDay } from "../supabase/functions/telegram-bot/time.ts";
import { inferMarket as botMarket } from "../supabase/functions/telegram-bot/market.ts";

// Бот живёт отдельно от сайта и держит копии формул. Этот тест не даст им разойтись.

test("проверка правил совпадает с сайтом", () => {
  const rules = [
    { id: "1", name: "a", rule_type: "max_risk_percent", value: 1, is_active: true },
    { id: "2", name: "b", rule_type: "min_risk_reward", value: 2, is_active: true },
    { id: "3", name: "c", rule_type: "max_leverage", value: 10, is_active: true },
    { id: "4", name: "d", rule_type: "require_stop_loss", value: null, is_active: true },
    { id: "5", name: "e", rule_type: "max_trades_per_day", value: 3, is_active: true },
    { id: "6", name: "f", rule_type: "max_daily_loss_percent", value: 3, is_active: true },
    { id: "7", name: "g", rule_type: "custom", value: null, is_active: true },
    { id: "8", name: "h", rule_type: "max_leverage", value: 1, is_active: false },
  ] as const;
  const cases = [
    { riskPercent: 0.5, riskReward: 3, leverage: 5, hasStopLoss: true, tradesToday: 1, dayLossPercent: 0 },
    { riskPercent: 2, riskReward: 1, leverage: 20, hasStopLoss: false, tradesToday: 4, dayLossPercent: 3 },
    { riskPercent: null, riskReward: null, leverage: null, hasStopLoss: true, tradesToday: 3, dayLossPercent: null },
  ];
  for (const facts of cases) assert.deepEqual(botEval([...rules], facts), siteEval([...rules], facts));
});

test("формулы сделки совпадают с сайтом", () => {
  assert.equal(botPnl("long", 100, 110, 2), sitePnl("long", 100, 110, 2));
  assert.equal(botPnl("short", 100, 110, 2), sitePnl("short", 100, 110, 2));
  const a = { entry: 100, stop: 95, takeProfit: 110, size: 3 };
  assert.deepEqual(botMetrics(a), siteMetrics(a));
  assert.deepEqual(botMetrics({ ...a, stop: null }), siteMetrics({ ...a, stop: null }));
});

test("границы дня и определение рынка совпадают с сайтом", () => {
  const d = new Date("2026-10-08T21:30:00Z");
  for (const tz of ["UTC", "Asia/Tashkent", "America/New_York"]) {
    assert.deepEqual(botDay(tz, d), siteDay(tz, d));
  }
  for (const s of ["BTCUSDT", "EURUSD", "AAPL", "NQ", "ETH", "что-то"]) assert.equal(botMarket(s), siteMarket(s));
});
