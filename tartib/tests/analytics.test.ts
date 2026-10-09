import test from "node:test";
import assert from "node:assert/strict";
import {
  bySession, bySide, coreStats, drawdownSeries, heatmap, instrumentTable, monthly, rHistogram, riskConsistency, rMultiples, ruleCost, sessionOf, winLossStreaks,
} from "../lib/analytics.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

let n = 0;
const mk = (over: Partial<StatTrade> & { at: string }): StatTrade => ({
  id: String(++n), tradedAt: over.at, instrument: "BTCUSDT", direction: "long", entryPrice: 1, exitPrice: 1, pnl: 0, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [], ...over,
});
const close = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("аналитика: ожидание, payoff, profit factor и R", () => {
  const t = [mk({ at: "2026-10-01T10:00:00Z", pnl: 100, riskAmount: 50 }), mk({ at: "2026-10-01T11:00:00Z", pnl: -50, riskAmount: 50 }), mk({ at: "2026-10-01T12:00:00Z", pnl: -50 }), mk({ at: "2026-10-01T13:00:00Z", pnl: 200, riskAmount: 100 })];
  const c = coreStats(t);
  assert.equal(c.count, 4);
  close(c.winRate, 50);
  close(c.expectancy, 50);
  close(c.avgWin, 150);
  close(c.avgLoss, 50);
  close(c.payoff, 3);
  close(c.profitFactor, 3);
  assert.deepEqual(rMultiples(t), [2, -1, 2]);
  close(c.avgR, 1);
  assert.equal(c.rCount, 3);
  const empty = coreStats([]);
  assert.equal(empty.winRate, null);
  assert.equal(empty.expectancy, null);
  assert.equal(coreStats([mk({ at: "2026-10-01T10:00:00Z", pnl: 5 })]).profitFactor, null); // убытков нет
});

test("аналитика: гистограмма R покрывает все значения, границы вверх", () => {
  const h = rHistogram([-3, -2, -1.5, -1, -0.5, 0, 0.9, 1, 2.5, 3, 7]);
  assert.deepEqual(h.map((b) => b.count), [1, 2, 2, 2, 1, 1, 2]);
  assert.equal(h.reduce((a, b) => a + b.count, 0), 11);
});

test("аналитика: лонг и шорт", () => {
  const s = bySide([mk({ at: "2026-10-01T10:00:00Z", pnl: 10 }), mk({ at: "2026-10-01T11:00:00Z", pnl: -4 }), mk({ at: "2026-10-01T12:00:00Z", direction: "short", pnl: 6 })]);
  assert.equal(s.long.count, 2);
  close(s.long.winRate, 50);
  close(s.long.pnl, 6);
  close(s.short.avgPnl, 6);
  assert.equal(bySide([]).long.winRate, null);
});

test("аналитика: сессии по UTC и доля нарушений", () => {
  assert.equal(sessionOf("2026-10-01T03:00:00Z"), "asia");
  assert.equal(sessionOf("2026-10-01T07:00:00Z"), "europe");
  assert.equal(sessionOf("2026-10-01T13:00:00Z"), "overlap");
  assert.equal(sessionOf("2026-10-01T17:00:00Z"), "us");
  assert.equal(sessionOf("2026-10-01T23:30:00Z"), "late");
  const r = bySession([mk({ at: "2026-10-01T14:00:00Z", pnl: 5, rulesFollowed: false }), mk({ at: "2026-10-01T15:00:00Z", pnl: -2 })]);
  const overlap = r.find((x) => x.id === "overlap")!;
  assert.equal(overlap.count, 2);
  close(overlap.violationRate, 50);
  assert.equal(r.find((x) => x.id === "asia")!.winRate, null);
});

test("аналитика: тепловая карта по часовому поясу", () => {
  // Четверг 2026-10-01 20:30 UTC = пятница 01:30 в Ташкенте (UTC+5): день 4 (пт), блок 0
  const cells = heatmap([mk({ at: "2026-10-01T20:30:00Z", pnl: 7 })], "Asia/Tashkent");
  assert.equal(cells.length, 42);
  const hit = cells.find((c) => c.count > 0)!;
  assert.deepEqual([hit.weekday, hit.block, hit.pnl], [4, 0, 7]);
  const utc = heatmap([mk({ at: "2026-10-01T20:30:00Z", pnl: 7 })], "UTC").find((c) => c.count > 0)!;
  assert.deepEqual([utc.weekday, utc.block], [3, 5]);
});

test("аналитика: просадка от максимума и месяцы", () => {
  const dd = drawdownSeries([{ ts: 1, balance: 100 }, { ts: 2, balance: 120 }, { ts: 3, balance: 90 }, { ts: 4, balance: 130 }]);
  assert.deepEqual(dd.map((d) => Math.round(d.drawdown)), [0, 0, -30, 0]);
  close(dd[2].percent, -25);
  const m = monthly([mk({ at: "2026-08-31T23:00:00Z", pnl: 5 }), mk({ at: "2026-09-10T10:00:00Z", pnl: -2 }), mk({ at: "2026-09-11T10:00:00Z", pnl: 4 })], "UTC");
  assert.deepEqual(m.map((x) => [x.key, x.pnl, x.count]), [["2026-08", 5, 1], ["2026-09", 2, 2]]);
  // 31 августа 23:00 UTC в Ташкенте уже сентябрь
  assert.equal(monthly([mk({ at: "2026-08-31T23:00:00Z", pnl: 1 })], "Asia/Tashkent")[0].key, "2026-09");
  assert.equal(monthly(Array.from({ length: 15 }, (_, i) => mk({ at: new Date(Date.UTC(2025, i, 5)).toISOString(), pnl: 1 })), "UTC", 12).length, 12);
});

test("аналитика: серии, ноль прерывает серию", () => {
  const seq = [5, 3, -1, -2, -3, 0, 4].map((pnl, i) => mk({ at: `2026-10-0${i + 1}T10:00:00Z`, pnl }));
  const s = winLossStreaks(seq);
  assert.equal(s.longestWin, 2);
  assert.equal(s.longestLoss, 3);
  assert.deepEqual(s.current, { type: "win", length: 1 });
  assert.deepEqual(winLossStreaks([]).current, { type: null, length: 0 });
  assert.deepEqual(winLossStreaks([mk({ at: "2026-10-01T10:00:00Z", pnl: 0 })]).current, { type: null, length: 0 });
});

test("аналитика: цена правил, постоянство риска, таблица инструментов", () => {
  const a = { id: "a", name: "Стоп" };
  const b = { id: "b", name: "Риск" };
  const t = [
    mk({ at: "2026-10-01T10:00:00Z", pnl: -30, rulesFollowed: false, violations: [a, b] }),
    mk({ at: "2026-10-02T10:00:00Z", pnl: -10, rulesFollowed: false, violations: [a] }),
    mk({ at: "2026-10-03T10:00:00Z", pnl: 20, rulesFollowed: false, violations: [b] }),
    mk({ at: "2026-10-04T10:00:00Z", pnl: 5 }),
  ];
  const rc = ruleCost(t);
  assert.deepEqual(rc.map((r) => [r.id, r.count, r.pnl]), [["a", 2, -40], ["b", 2, -10]]);
  close(rc[0].avgPnl, -20);
  assert.deepEqual(riskConsistency([]), { count: 0, avg: null, max: null, min: null, variation: null });
  const rk = riskConsistency([mk({ at: "2026-10-01T10:00:00Z", riskAmount: 10 }), mk({ at: "2026-10-01T11:00:00Z", riskAmount: 30 })]);
  assert.deepEqual([rk.avg, rk.max, rk.min], [20, 30, 10]);
  close(rk.variation, 50);
  const table = instrumentTable([mk({ at: "2026-10-01T10:00:00Z", instrument: "ETH", pnl: 4 }), mk({ at: "2026-10-01T11:00:00Z", instrument: "BTC", pnl: -1 }), mk({ at: "2026-10-01T12:00:00Z", instrument: "BTC", pnl: 3 })], 5);
  assert.deepEqual(table.map((r) => [r.instrument, r.count, r.pnl]), [["BTC", 2, 2], ["ETH", 1, 4]]);
});
