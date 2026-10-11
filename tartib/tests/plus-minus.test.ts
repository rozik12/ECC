import test from "node:test";
import assert from "node:assert/strict";
import { byDay, byMonth, inPeriod, plusMinus } from "../lib/plus-minus.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

const tr = (tradedAt: string, pnl: number) => ({ id: tradedAt + pnl, tradedAt, pnl, instrument: "X", direction: "long", entryPrice: 1, exitPrice: 1, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [] }) as StatTrade;

test("плюс, минус и итог", () => {
  const r = plusMinus([{ pnl: 100 }, { pnl: -40 }, { pnl: -10 }, { pnl: 0 }]);
  assert.deepEqual(r, { plus: 100, minus: -50, net: 50, wins: 1, losses: 2, flat: 1, count: 4 });
  assert.equal(plusMinus([]).net, 0);
});

test("периоды и группировки по часовому поясу", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  const xs = [tr("2026-10-11T08:00:00Z", 10), tr("2026-10-08T08:00:00Z", -5), tr("2026-10-01T08:00:00Z", 20), tr("2026-09-30T23:30:00Z", 7)];
  assert.equal(inPeriod(xs, "today", "UTC", now).length, 1);
  assert.equal(inPeriod(xs, "week", "UTC", now).length, 2);
  assert.equal(inPeriod(xs, "month", "UTC", now).length, 3);
  assert.equal(inPeriod(xs, "all", "UTC", now).length, 4);
  // 23:30 UTC 30 сентября в Ташкенте (UTC+5) уже 1 октября
  assert.equal(inPeriod(xs, "month", "Asia/Tashkent", now).length, 4);
  assert.deepEqual(byDay(xs, "UTC").map((d) => d.day), ["2026-10-11", "2026-10-08", "2026-10-01", "2026-09-30"]);
  const m = byMonth(xs, "UTC");
  assert.deepEqual(m.map((x) => [x.month, x.net]), [["2026-10", 25], ["2026-09", 7]]);
});
