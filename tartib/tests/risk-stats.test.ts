import test from "node:test";
import assert from "node:assert/strict";
import { byWeekday, personalRiskMath, recoveryFactor, sqn, underwater } from "../lib/risk-stats.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

let n = 0;
const mk = (over: Partial<StatTrade> & { at: string }): StatTrade => ({
  id: String(++n), tradedAt: over.at, instrument: "BTCUSDT", direction: "long", entryPrice: 1, exitPrice: 1, pnl: 0, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [], ...over,
});

test("дни недели: учитывается часовой пояс, пустые дни пропускаются", () => {
  // 2026-10-05 понедельник; 23:30 UTC в Ташкенте (UTC+5) уже вторник
  const ts = [mk({ at: "2026-10-05T10:00:00Z", pnl: 10 }), mk({ at: "2026-10-05T23:30:00Z", pnl: -4 }), mk({ at: "2026-10-11T12:00:00Z", pnl: 6 })];
  const utc = byWeekday(ts, "UTC");
  assert.deepEqual(utc.map((r) => [r.day, r.count, r.pnl]), [[0, 2, 6], [6, 1, 6]]);
  const tash = byWeekday(ts, "Asia/Tashkent");
  assert.deepEqual(tash.map((r) => [r.day, r.count]), [[0, 1], [1, 1], [6, 1]]);
  assert.equal(utc[0].winRate, 50);
  assert.deepEqual(byWeekday([], "UTC"), []);
});

test("SQN: нужен риск и минимум 10 сделок, значение по формуле", () => {
  const few = Array.from({ length: 9 }, (_, i) => mk({ at: `2026-10-0${i + 1}T10:00:00Z`, pnl: 1, riskAmount: 1 }));
  assert.equal(sqn(few), null);
  const rs = [2, -1, 2, -1, 2, -1, 2, -1, 2, 2];
  const ts = rs.map((r, i) => mk({ at: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`, pnl: r * 10, riskAmount: 10 }));
  const s = sqn(ts)!;
  const m = rs.reduce((a, b) => a + b) / 10;
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r - m) ** 2, 0) / 9);
  assert.ok(Math.abs(s.value - (Math.sqrt(10) * m) / sd) < 1e-9);
  assert.equal(s.n, 10);
  assert.equal(sqn(Array.from({ length: 12 }, (_, i) => mk({ at: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`, pnl: 5, riskAmount: 5 }))), null); // нулевой разброс
});

test("фактор восстановления и время под водой", () => {
  assert.equal(recoveryFactor(500, 100), 5);
  assert.equal(recoveryFactor(500, 0), null);
  const day = 86400000;
  const curve = [{ ts: 0, balance: 100 }, { ts: day, balance: 120 }, { ts: 3 * day, balance: 110 }, { ts: 5 * day, balance: 125 }, { ts: 6 * day, balance: 115 }, { ts: 9 * day, balance: 118 }];
  const u = underwater(curve);
  assert.equal(u.longestDays, 4); // с пика 120 (день 1) до нового пика 125 (день 5)
  assert.equal(u.currentDays, 4); // с пика 125 (день 5) до дня 9, сейчас ниже
  assert.deepEqual(underwater([{ ts: 0, balance: 1 }, { ts: day, balance: 2 }]), { longestDays: 0, currentDays: 0 });
  assert.deepEqual(underwater([]), { longestDays: 0, currentDays: 0 });
});

test("личный Келли и риск разорения: порог 20 сделок и значения", () => {
  const mkSet = (w: number, l: number) => [
    ...Array.from({ length: w }, (_, i) => mk({ at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`, pnl: 20 })),
    ...Array.from({ length: l }, (_, i) => mk({ at: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`, pnl: -10 })),
  ];
  assert.equal(personalRiskMath(mkSet(5, 5)), null);
  assert.equal(personalRiskMath(mkSet(20, 0)), null);
  const r = personalRiskMath(mkSet(10, 10))!; // 50% прибыльных, выигрыш/проигрыш = 2
  assert.equal(r.winRate, 50);
  assert.equal(r.payoff, 2);
  assert.ok(Math.abs(r.kellyPct - 25) < 1e-9); // 0.5 − 0.5/2
  assert.ok(r.ruinPct >= 0 && r.ruinPct < 1); // положительное ожидание, риск 1%, запас ≈ 69 единиц
  const bad = personalRiskMath(mkSet(5, 20))!;
  assert.equal(bad.ruinPct, 100);
  assert.equal(bad.kellyPct, 0);
});
