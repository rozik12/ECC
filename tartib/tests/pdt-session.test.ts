import test from "node:test";
import assert from "node:assert/strict";
import { isDayTrade, pdtApplies, pdtState } from "../lib/pdt.ts";
import { byUsBucket } from "../lib/us-session-stats.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

let n = 0;
const mk = (over: Partial<StatTrade> & { tradedAt: string }): StatTrade => ({
  id: String(++n), instrument: "AAPL", market: "stocks", direction: "long", entryPrice: 1, exitPrice: 1, pnl: 0, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [], closedAt: null, ...over,
});

test("дей-трейд: акция открыта и закрыта в один день по Нью-Йорку", () => {
  assert.equal(isDayTrade(mk({ tradedAt: "2026-10-13T14:00:00Z", closedAt: "2026-10-13T18:00:00Z" })), true);
  assert.equal(isDayTrade(mk({ tradedAt: "2026-10-13T14:00:00Z", closedAt: "2026-10-14T14:00:00Z" })), false); // на следующий день
  assert.equal(isDayTrade(mk({ tradedAt: "2026-10-13T14:00:00Z", closedAt: null })), false); // ещё открыта
  assert.equal(isDayTrade(mk({ market: "crypto", tradedAt: "2026-10-13T14:00:00Z", closedAt: "2026-10-13T18:00:00Z" })), false);
  // 03:30 UTC уже следующий календарный день по UTC, но ещё тот же день по Нью-Йорку (23:30)
  assert.equal(isDayTrade(mk({ tradedAt: "2026-10-13T21:00:00Z", closedAt: "2026-10-14T03:30:00Z" })), true);
});

test("счётчик PDT: окно из пяти торговых дней, пороги", () => {
  const now = new Date("2026-10-15T15:00:00Z"); // четверг
  const dt = (day: string) => mk({ tradedAt: `${day}T14:00:00Z`, closedAt: `${day}T17:00:00Z` });
  const base = [dt("2026-10-15"), dt("2026-10-14"), dt("2026-10-13")];
  const s3 = pdtState(base, now);
  assert.deepEqual([s3.count, s3.left, s3.level], [3, 0, "warn"]);
  const s4 = pdtState([...base, dt("2026-10-12")], now);
  assert.deepEqual([s4.count, s4.left, s4.level], [4, 0, "flag"]);
  // 9 октября (пятница) ещё в окне (15, 14, 13, 12, 9), а 8 октября уже нет
  assert.equal(pdtState([...base, dt("2026-10-09")], now).count, 4);
  assert.equal(pdtState([...base, dt("2026-10-08")], now).count, 3);
  assert.deepEqual(pdtState([], now), { count: 0, left: 3, level: "ok", days: ["2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12", "2026-10-09"].map((date) => ({ date, count: 0 })) });
});

test("правило касается только счетов меньше 25 000", () => {
  assert.equal(pdtApplies(24999.99), true);
  assert.equal(pdtApplies(25000), false);
  assert.equal(pdtApplies(null), false);
});

test("части торгового дня: только акции и фьючерсы, пустые части пропускаются", () => {
  const ts = [
    mk({ tradedAt: "2026-10-13T13:45:00Z", pnl: -20, rulesFollowed: false }), // 09:45 ET, открытие
    mk({ tradedAt: "2026-10-13T13:50:00Z", pnl: 10 }),
    mk({ tradedAt: "2026-10-13T19:45:00Z", pnl: 30, market: "futures" }), // 15:45 ET
    mk({ tradedAt: "2026-10-13T13:45:00Z", pnl: 999, market: "crypto" }), // не учитывается
  ];
  const rows = byUsBucket(ts);
  assert.deepEqual(rows.map((r) => [r.bucket, r.count, r.pnl]), [["open", 2, -10], ["power", 1, 30]]);
  assert.equal(rows[0].winRate, 50);
  assert.equal(rows[0].violationRate, 50);
  assert.deepEqual(byUsBucket([mk({ market: "forex", tradedAt: "2026-10-13T13:45:00Z" })]), []);
});
