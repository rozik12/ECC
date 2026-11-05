import test from "node:test";
import assert from "node:assert/strict";
import { shouldRun3D } from "../lib/three-support.ts";
import { disciplineByDay, type StatTrade } from "../lib/statistics/index.ts";

const base = { reducedMotion: false, saveData: false, hasWebGL: true };

test("3D включается только там, где он будет плавным", () => {
  assert.equal(shouldRun3D(base), true);
  assert.equal(shouldRun3D({ ...base, hasWebGL: false }), false);
  assert.equal(shouldRun3D({ ...base, reducedMotion: true }), false);
  assert.equal(shouldRun3D({ ...base, saveData: true }), false);
  assert.equal(shouldRun3D({ ...base, deviceMemory: 1 }), false);
  assert.equal(shouldRun3D({ ...base, deviceMemory: 4, cores: 8 }), true);
  assert.equal(shouldRun3D({ ...base, cores: 1 }), false);
});

const trade = (iso: string, ok: boolean, id: string): StatTrade => ({
  id, tradedAt: iso, instrument: "BTCUSDT", direction: "long", entryPrice: 1, exitPrice: 2, pnl: 1, emotion: "calm",
  rulesFollowed: ok, riskAmount: null, strategy: "", violations: [],
});

test("дисциплина по дням: 28 подряд идущих дней, доля сделок по правилам, пустые дни без процента", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const trades = [
    trade("2026-11-05T08:00:00Z", true, "a"), trade("2026-11-05T09:00:00Z", false, "b"),
    trade("2026-11-03T08:00:00Z", true, "c"),
    trade("2026-09-01T08:00:00Z", true, "old"),
  ];
  const days = disciplineByDay(trades, "UTC", 28, now);
  assert.equal(days.length, 28);
  assert.equal(days[27].day, "2026-11-05");
  assert.equal(days[0].day, "2026-10-09");
  assert.deepEqual({ t: days[27].total, f: days[27].followed, p: days[27].percent }, { t: 2, f: 1, p: 50 });
  assert.equal(days[25].percent, 100);
  assert.equal(days[26].percent, null);
  assert.equal(new Set(days.map((d) => d.day)).size, 28);
  assert.equal(days.filter((d) => d.percent !== null).length, 2);
});

test("дисциплина по дням: переход на летнее время не ломает список дней", () => {
  const days = disciplineByDay([], "America/New_York", 28, new Date("2026-11-02T12:00:00Z"));
  assert.equal(days.length, 28);
  assert.equal(new Set(days.map((d) => d.day)).size, 28);
});
