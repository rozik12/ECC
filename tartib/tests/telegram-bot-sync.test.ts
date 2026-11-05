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
import * as siteStats from "../lib/statistics/index.ts";
import * as siteAch from "../lib/achievements.ts";
import * as botStats from "../supabase/functions/telegram-bot/stats.ts";

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

test("статистика и достижения совпадают с сайтом", () => {
  const mk = (i: number, pnl: number, ok: boolean, emotion = "calm", instrument = "BTCUSDT") => ({
    id: `t${i}`, tradedAt: new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString(), instrument, direction: "long" as const,
    entryPrice: 100, exitPrice: 101, pnl, emotion, rulesFollowed: ok, riskAmount: 10, strategy: "",
    violations: ok ? [] : [{ id: "r1", name: "Стоп" }],
  });
  const trades = [mk(1, 50, true), mk(2, -30, false, "fomo", "ETHUSDT"), mk(3, 20, true), mk(4, -10, false, "fomo"), mk(5, 40, true, "calm", "ETHUSDT"), mk(6, 15, true)];
  const now = new Date("2026-10-12T12:00:00Z");
  const summary = botStats.summarize(trades);
  const siteSummary = siteStats.summarize(trades);
  for (const k of Object.keys(summary) as (keyof typeof summary)[]) assert.equal(summary[k], siteSummary[k], String(k));
  assert.deepEqual(botStats.disciplineCost(trades), siteStats.disciplineCost(trades));
  assert.deepEqual(botStats.topViolations(trades), siteStats.topViolations(trades));
  assert.deepEqual(botStats.byEmotion(trades), siteStats.byEmotion(trades));
  assert.deepEqual(botStats.pnlByInstrument(trades), siteStats.pnlByInstrument(trades));
  assert.deepEqual(botStats.disciplineStreak(trades, now), siteStats.disciplineStreak(trades, now));
  assert.deepEqual(botStats.computeAchievements(trades, now), siteAch.computeAchievements(trades, now));
  assert.deepEqual(botStats.monthDiscipline(trades, 80, "UTC", now), siteAch.monthDiscipline(trades, 80, "UTC", now));
});

test("тильт, лучшие и худшие сделки, перерыв после убытка совпадают с сайтом", () => {
  const mk = (i: number, min: number, pnl: number, ok: boolean) => ({
    id: String(i), tradedAt: new Date(Date.UTC(2026, 9, 1, 10, min)).toISOString(), instrument: "X", direction: "long" as const, entryPrice: 1, exitPrice: 1,
    pnl, emotion: "calm", rulesFollowed: ok, riskAmount: null, strategy: "", violations: [],
  });
  const trades = [mk(1, 0, -10, true), mk(2, 20, 5, false), mk(3, 40, -3, true), mk(4, 50, 8, false), mk(5, 70, -2, true), mk(6, 80, 4, false), mk(7, 100, -1, true), mk(8, 110, 2, false), mk(9, 300, 9, true), mk(10, 400, 3, true), mk(11, 500, 1, true), mk(12, 600, 2, true)];
  assert.deepEqual(botStats.tiltAnalysis(trades), siteStats.tiltAnalysis(trades));
  assert.equal(siteStats.tiltAnalysis(trades).tilt, true);
  assert.deepEqual(botStats.bestWorst(trades, 2), siteStats.bestWorst(trades, 2));
  const now = new Date(Date.UTC(2026, 9, 1, 11, 0));
  const last = { tradedAt: new Date(Date.UTC(2026, 9, 1, 10, 45)).toISOString(), pnl: -5 };
  assert.deepEqual(botStats.lossCooldown(last, now), siteStats.lossCooldown(last, now));
  assert.deepEqual(siteStats.lossCooldown(last, now), { minutesAgo: 15 });
  assert.equal(siteStats.lossCooldown({ ...last, pnl: 5 }, now), null);
  assert.equal(siteStats.lossCooldown(last, new Date(Date.UTC(2026, 9, 1, 12, 0))), null);
  assert.equal(siteStats.lossCooldown(null, now), null);
});
