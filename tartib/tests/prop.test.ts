import test from "node:test";
import assert from "node:assert/strict";
import { propState, type Challenge } from "../lib/prop.ts";

const ch: Challenge = { id: "c", name: "FTMO 10k", accountId: "A", startBalance: 10000, profitTargetPct: 10, maxDailyLossPct: 5, maxTotalLossPct: 10, trailing: false, minTradingDays: 4, startDate: "2026-10-01", endDate: "2026-10-30" };
const tr = (at: string, pnl: number, accountId = "A") => ({ tradedAt: at, pnl, accountId });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("прогресс к цели и дневной лимит", () => {
  const s = propState([tr("2026-10-02T10:00:00Z", 300), tr("2026-10-03T10:00:00Z", 200), tr("2026-10-05T10:00:00Z", -100), tr("2026-10-05T12:00:00Z", -150)], ch, "UTC", "2026-10-05");
  assert.equal(s.status, "active");
  near(s.pnl, 250); near(s.profitPct, 2.5); near(s.targetProgress, 25);
  near(s.todayPnl, -250); near(s.dailyLimit, 500); near(s.dailyUsedPct, 50);
  assert.equal(s.tradingDays, 3); assert.equal(s.trades, 4); assert.equal(s.daysLeft, 25);
  near(s.floor, 9000); near(s.buffer, 1250);
});

test("нарушение дневного лимита и общей просадки", () => {
  const daily = propState([tr("2026-10-02T10:00:00Z", -300), tr("2026-10-02T15:00:00Z", -250)], ch, "UTC", "2026-10-10");
  assert.equal(daily.status, "breached"); assert.equal(daily.breachReason, "daily"); assert.equal(daily.breachDay, "2026-10-02");
  const total = propState(Array.from({ length: 4 }, (_, i) => tr(`2026-10-0${i + 2}T10:00:00Z`, -260)), ch, "UTC", "2026-10-10");
  assert.equal(total.breachReason, "total"); // −1040 ≥ 10%
});

test("скользящая просадка считается от максимума, цель выполнена только при минимуме дней", () => {
  const trailing = { ...ch, trailing: true };
  const s = propState([tr("2026-10-02T10:00:00Z", 800), tr("2026-10-03T10:00:00Z", -450), tr("2026-10-04T10:00:00Z", -450)], trailing, "UTC", "2026-10-05");
  near(s.peak, 10800); near(s.floor, 9800); // 10800 − 1000
  assert.equal(s.status, "active"); // баланс 9900 выше границы 9800
  near(s.totalUsedPct, 90);
  const worse = propState([tr("2026-10-02T10:00:00Z", 800), tr("2026-10-03T10:00:00Z", -450), tr("2026-10-04T10:00:00Z", -450), tr("2026-10-05T10:00:00Z", -150)], trailing, "UTC", "2026-10-06");
  assert.equal(worse.status, "breached"); assert.equal(worse.breachReason, "total");
});

test("цель выполнена: нужен минимум торговых дней; чужой счёт и даты не считаются", () => {
  const few = propState([tr("2026-10-02T10:00:00Z", 1100)], ch, "UTC", "2026-10-03");
  assert.equal(few.status, "active"); // прибыль есть, но торговых дней меньше четырёх
  const days = ["02", "05", "06", "07"].map((d, i) => tr(`2026-10-${d}T10:00:00Z`, i === 0 ? 700 : 150));
  const ok = propState([...days, tr("2026-10-08T10:00:00Z", -999, "B"), tr("2026-09-30T10:00:00Z", -999)], ch, "UTC", "2026-10-08");
  assert.equal(ok.status, "passed"); near(ok.pnl, 1150); assert.equal(ok.tradingDays, 4); assert.equal(ok.trades, 4);
});
