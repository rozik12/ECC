import test from "node:test";
import assert from "node:assert/strict";
import { computeAchievements, daysSinceLastTrade, monthDiscipline } from "../lib/achievements.ts";

const NOW = new Date("2026-10-15T12:00:00Z");
const mk = (day: number, ok: boolean) => ({ tradedAt: new Date(Date.UTC(2026, 9, day, 10)).toISOString(), rulesFollowed: ok });

test("достижения: без сделок ничего не открыто", () => {
  const list = computeAchievements([], NOW);
  assert.ok(list.every((a) => !a.unlocked));
});

test("достижения: первая сделка и серия 5", () => {
  const trades = [mk(1, true), mk(2, true), mk(3, true), mk(4, true), mk(5, true)];
  const list = Object.fromEntries(computeAchievements(trades, NOW).map((a) => [a.id, a]));
  assert.equal(list.first_trade.unlocked, true);
  assert.equal(list.streak_5.unlocked, true);
  assert.equal(list.streak_10.unlocked, false);
  assert.equal(list.streak_10.current, 5);
});

test("достижения: нарушение обрывает серию, но лучшая серия сохраняется", () => {
  const trades = [mk(1, true), mk(2, true), mk(3, true), mk(4, true), mk(5, true), mk(6, false), mk(7, true)];
  const list = Object.fromEntries(computeAchievements(trades, NOW).map((a) => [a.id, a]));
  assert.equal(list.streak_5.unlocked, true);
});

test("чистая неделя: нужны 3 сделки по правилам за 7 дней без нарушений", () => {
  const ok = computeAchievements([mk(10, true), mk(12, true), mk(14, true)], NOW).find((a) => a.id === "clean_week");
  assert.equal(ok?.unlocked, true);
  const bad = computeAchievements([mk(10, true), mk(12, false), mk(14, true)], NOW).find((a) => a.id === "clean_week");
  assert.equal(bad?.unlocked, false);
});

test("цель месяца: процент и сколько сделок нужно до цели", () => {
  const trades = [mk(1, true), mk(2, false), mk(3, true), mk(4, false)];
  const g = monthDiscipline(trades, 80, "UTC", NOW);
  assert.equal(g.total, 4);
  assert.equal(g.percent, 50);
  assert.equal(g.reached, false);
  // (2+n)/(4+n) >= 0.8 -> n >= 6
  assert.equal(g.needed, 6);
});

test("цель месяца: достигнута, сделки прошлых месяцев не считаются", () => {
  const old = { tradedAt: "2026-08-01T10:00:00.000Z", rulesFollowed: false };
  const g = monthDiscipline([old, mk(1, true), mk(2, true)], 80, "UTC", NOW);
  assert.equal(g.total, 2);
  assert.equal(g.percent, 100);
  assert.equal(g.reached, true);
  assert.equal(g.needed, null);
});

test("цель месяца: сделок нет", () => {
  const g = monthDiscipline([], 80, "UTC", NOW);
  assert.equal(g.percent, null);
  assert.equal(g.reached, false);
});

test("дней с последней записи", () => {
  assert.equal(daysSinceLastTrade([], NOW), null);
  assert.equal(daysSinceLastTrade([mk(10, true), mk(12, true)], NOW), 3);
});
