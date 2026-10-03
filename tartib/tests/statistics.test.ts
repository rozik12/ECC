import assert from "node:assert/strict";
import { test } from "node:test";
import {
  byEmotion, disciplineCost, equityCurve, filterByPeriod, maxDrawdown, pnlByDay, summarize, topViolations,
  type StatTrade,
} from "../lib/statistics/index.ts";

let n = 0;
const trade = (pnl: number, extra: Partial<StatTrade> = {}): StatTrade => ({
  id: String(++n), tradedAt: `2026-09-${String(10 + n).padStart(2, "0")}T10:00:00Z`, instrument: "BTC/USDT",
  direction: "long", entryPrice: 1, exitPrice: 1, pnl, emotion: "calm", rulesFollowed: true, riskAmount: 10, strategy: "", violations: [], ...extra,
});

test("сводка: win rate, profit factor, средние, средний R", () => {
  const s = summarize([trade(30), trade(-10), trade(20), trade(-20)]);
  assert.equal(s.totalPnl, 20);
  assert.equal(s.winRate, 50);
  assert.equal(s.profitFactor, 50 / 30);
  assert.equal(s.avgWin, 25);
  assert.equal(s.avgLoss, 15);
  assert.equal(s.avgR, (3 - 1 + 2 - 2) / 4);
});

test("пустой список и отсутствие убытков не ломают сводку", () => {
  const empty = summarize([]);
  assert.equal(empty.winRate, null);
  assert.equal(empty.profitFactor, null);
  assert.equal(summarize([trade(5)]).profitFactor, null);
});

test("кривая депозита и максимальная просадка", () => {
  const curve = equityCurve([trade(50), trade(-30), trade(-40), trade(100)], 1000);
  assert.deepEqual(curve.map((p) => p.balance), [1000, 1050, 1020, 980, 1080]);
  const dd = maxDrawdown(curve);
  assert.equal(dd.amount, 70);
  assert.ok(Math.abs(dd.percent - (70 / 1050) * 100) < 1e-9);
});

test("цена дисциплины", () => {
  const d = disciplineCost([trade(100), trade(84), trade(-127, { rulesFollowed: false }), trade(20, { rulesFollowed: false }), trade(-20, { rulesFollowed: false })]);
  assert.equal(d.followedPnl, 184);
  assert.equal(d.violatedPnl, -127);
  assert.equal(d.cost, 127);
  assert.equal(d.followedCount, 2);
  assert.equal(d.violatedCount, 3);
  assert.equal(d.difference, 311);
  assert.equal(disciplineCost([trade(10, { rulesFollowed: false })]).cost, 0);
});

test("эмоции: сумма и среднее", () => {
  const stats = byEmotion([trade(-20, { emotion: "fomo" }), trade(-18, { emotion: "fomo" }), trade(-19, { emotion: "fomo" }), trade(30)]);
  const fomo = stats.find((s) => s.emotion === "fomo")!;
  assert.equal(fomo.count, 3);
  assert.equal(fomo.total, -57);
  assert.equal(fomo.average, -19);
  assert.equal(stats[0].emotion, "fomo");
});

test("P&L по дням в часовом поясе и топ нарушений", () => {
  const a = trade(10, { tradedAt: "2026-09-01T20:00:00Z" }); // в Ташкенте уже 2 сентября
  const b = trade(5, { tradedAt: "2026-09-02T01:00:00Z" });
  assert.deepEqual(pnlByDay([a, b], "Asia/Tashkent"), [{ key: "2026-09-02", pnl: 15, count: 2 }]);
  const v = (id: string, name: string) => ({ id, name });
  const top = topViolations([trade(1, { violations: [v("1", "A"), v("2", "B")] }), trade(1, { violations: [v("2", "B")] })]);
  assert.deepEqual(top, [{ id: "2", name: "B", count: 2 }, { id: "1", name: "A", count: 1 }]);
});

test("фильтр периода", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const old = trade(1, { tradedAt: "2026-08-01T00:00:00Z" });
  const recent = trade(1, { tradedAt: "2026-09-28T00:00:00Z" });
  assert.equal(filterByPeriod([old, recent], "7d", now).length, 1);
  assert.equal(filterByPeriod([old, recent], "30d", now).length, 1);
  assert.equal(filterByPeriod([old, recent], "all", now).length, 2);
});

import { disciplineStreak, pnlByStrategy } from "../lib/statistics/index.ts";
import { evaluateRules as evalRules } from "../lib/calculations/rules.ts";

test("серия дисциплины", () => {
  const seq = [true, true, false, true, true, true].map((ok, i) => trade(1, { rulesFollowed: ok, tradedAt: `2026-09-${10 + i}T10:00:00Z` }));
  const s = disciplineStreak(seq, new Date("2026-09-20T10:00:00Z"));
  assert.equal(s.current, 3);
  assert.equal(s.best, 3);
  assert.equal(s.daysSinceViolation, 8); // нарушение было 12 сентября
  assert.equal(disciplineStreak([trade(1)]).daysSinceViolation, null);
});

test("результат по стратегиям без пустых", () => {
  const b = pnlByStrategy([trade(10, { strategy: "Пробой" }), trade(-4, { strategy: "Пробой" }), trade(5), trade(7, { strategy: "Откат" })]);
  assert.deepEqual(b, [{ key: "Откат", pnl: 7, count: 1 }, { key: "Пробой", pnl: 6, count: 2 }]);
});

test("правило дневного лимита убытка", () => {
  const rule = { id: "d", name: "d", rule_type: "max_daily_loss_percent" as const, value: 3, is_active: true };
  const facts = (p: number | null) => ({ riskPercent: 1, riskReward: 2, leverage: 1, hasStopLoss: true, tradesToday: 1, dayLossPercent: p });
  assert.equal(evalRules([rule], facts(2.9))[0].status, "ok");
  assert.equal(evalRules([rule], facts(3))[0].status, "violated");
  assert.equal(evalRules([rule], facts(null))[0].status, "unknown");
});
