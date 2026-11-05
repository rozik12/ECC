import test from "node:test";
import assert from "node:assert/strict";
import { parseQuickLine, quickToQuery } from "../lib/quick-parse.ts";
import { dailyLimit, losingRun } from "../lib/risk-stats.ts";
import { weekReview } from "../lib/weekly.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

test("быстрый ввод: полная строка на русском и английском", () => {
  const a = parseQuickLine("BTCUSDT лонг 65000 стоп 64500 тп 66000 размер 0,1 плечо 5");
  assert.deepEqual(a, { instrument: "BTCUSDT", direction: "long", entry: "65000", stop: "64500", tp: "66000", size: "0.1", leverage: "5", risk: "" });
  const b = parseQuickLine("eth short 3200 sl=3260 tp:3050 qty 2 10x 1%");
  assert.deepEqual(b, { instrument: "ETH", direction: "short", entry: "3200", stop: "3260", tp: "3050", size: "2", leverage: "10", risk: "1" });
  const c = parseQuickLine("sell eurusd 1.0850 stop 1.0900");
  assert.equal(c.instrument, "EURUSD"); assert.equal(c.direction, "short"); assert.equal(c.entry, "1.0850"); assert.equal(c.stop, "1.0900");
});

test("быстрый ввод: порядок слов не важен, лишнее не угадывается", () => {
  const p = parseQuickLine("65000 buy btc");
  assert.equal(p.entry, "65000"); assert.equal(p.direction, "long"); assert.equal(p.instrument, "BTC");
  const e = parseQuickLine("   ");
  assert.deepEqual(e, { instrument: "", direction: null, entry: "", stop: "", tp: "", size: "", leverage: "", risk: "" });
  const noEntry = parseQuickLine("xau long стоп 2300");
  assert.equal(noEntry.entry, ""); assert.equal(noEntry.stop, "2300");
  assert.equal(parseQuickLine("<script>alert(1)</script>").instrument, "");
});

test("быстрый ввод: адрес формы без пустых полей и с безопасным кодированием", () => {
  assert.equal(quickToQuery(parseQuickLine("btc long 100 sl 90")), "/trades/new?instrument=BTC&direction=long&entry=100&stop=90");
  assert.equal(quickToQuery(parseQuickLine("")), "/trades/new");
});

test("дневной лимит: уровни и защита от неверных данных", () => {
  assert.deepEqual(dailyLimit(-50, 1000, 5), { lossPct: 5, usedPct: 100, level: "hit" });
  const w = dailyLimit(-36, 1000, 5)!; assert.equal(w.level, "warn"); assert.ok(Math.abs(w.usedPct - 72) < 1e-9);
  assert.equal(dailyLimit(-10, 1000, 5)!.level, "ok");
  assert.deepEqual(dailyLimit(+40, 1000, 5), { lossPct: 0, usedPct: 0, level: "ok" });
  assert.equal(dailyLimit(-10, 0, 5), null); assert.equal(dailyLimit(-10, 1000, 0), null); assert.equal(dailyLimit(NaN, 1000, 5), null);
  assert.equal(dailyLimit(-500, 1000, 5)!.usedPct, 100);
});

test("серия убытков: только свежие, прерывается прибылью", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const t = (h: number, pnl: number) => ({ tradedAt: new Date(now.getTime() - h * 3600000).toISOString(), pnl });
  assert.deepEqual(losingRun([t(1, -5), t(2, -3), t(3, -1), t(4, +9)], now), { count: 3, minutesSince: 60 });
  assert.equal(losingRun([t(1, +5), t(2, -3), t(3, -1)], now).count, 0);
  assert.equal(losingRun([t(10, -5), t(11, -3)], now).count, 0); // старше 8 часов
  assert.equal(losingRun([], now).count, 0);
  assert.equal(losingRun([t(1, -5), t(2, 0), t(3, -1)], now).count, 1); // нулевая сделка прерывает серию
});

let n = 0;
const mk = (iso: string, pnl: number, over: Partial<StatTrade> = {}): StatTrade => ({
  id: String(++n), tradedAt: iso, instrument: "X", direction: "long", entryPrice: 1, exitPrice: 1, pnl, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [], ...over,
});

test("недельный разбор: сравнение недель, лучший и худший день", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const trades = [
    mk("2026-10-08T10:00:00Z", 30), mk("2026-10-08T11:00:00Z", -10), mk("2026-10-07T10:00:00Z", -25), mk("2026-10-05T10:00:00Z", 15),
    mk("2026-09-30T10:00:00Z", -40), mk("2026-09-29T10:00:00Z", 10), mk("2026-09-01T10:00:00Z", 999),
  ];
  const r = weekReview(trades, "UTC", now, 80);
  assert.equal(r.current.count, 4); assert.equal(r.current.pnl, 10);
  assert.equal(r.previous.count, 2); assert.equal(r.previous.pnl, -30);
  assert.equal(r.best!.day, "2026-10-08"); assert.equal(r.best!.pnl, 20);
  assert.equal(r.worst!.day, "2026-10-07"); assert.equal(r.worst!.pnl, -25);
  assert.equal(r.takeaway.kind, "steady");
  assert.equal(weekReview([], "UTC", now, 80).takeaway.kind, "none");
});

test("недельный вывод: нарушенное правило важнее ошибки, затем дисциплина", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const viol = (name: string) => [{ id: name, name }];
  const withRule = [mk("2026-10-08T10:00:00Z", -20, { rulesFollowed: false, violations: viol("Не двигать стоп") }), mk("2026-10-07T10:00:00Z", -10, { rulesFollowed: false, violations: viol("Не двигать стоп") }), mk("2026-10-06T10:00:00Z", 5)];
  const a = weekReview(withRule, "UTC", now, 80).takeaway;
  assert.equal(a.kind, "rule"); if (a.kind === "rule") { assert.equal(a.name, "Не двигать стоп"); assert.equal(a.count, 2); assert.equal(a.pnl, -30); }
  const lowDisc = [mk("2026-10-08T10:00:00Z", 5, { rulesFollowed: false }), mk("2026-10-07T10:00:00Z", 5)];
  const b = weekReview(lowDisc, "UTC", now, 80).takeaway;
  assert.equal(b.kind, "discipline"); if (b.kind === "discipline") assert.equal(b.pct, 50);
});
