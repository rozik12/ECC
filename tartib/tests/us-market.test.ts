import test from "node:test";
import assert from "node:assert/strict";
import { bucketOf, isTradingDay, lastTradingDays, nextChange, nyDate, phaseAt, upcomingClosures } from "../lib/us-market.ts";

const at = (iso: string) => new Date(iso);

test("фазы рынка в обычный вторник (летнее время, UTC−4)", () => {
  assert.equal(phaseAt(at("2026-10-13T07:59:00Z")), "closed"); // 03:59
  assert.equal(phaseAt(at("2026-10-13T08:00:00Z")), "pre"); // 04:00
  assert.equal(phaseAt(at("2026-10-13T13:29:00Z")), "pre");
  assert.equal(phaseAt(at("2026-10-13T13:30:00Z")), "regular"); // 09:30
  assert.equal(phaseAt(at("2026-10-13T19:59:00Z")), "regular");
  assert.equal(phaseAt(at("2026-10-13T20:00:00Z")), "after"); // 16:00
  assert.equal(phaseAt(at("2026-10-14T00:00:00Z")), "closed"); // 20:00
});

test("после перехода на зимнее время (с 1 ноября 2026) открытие в 14:30 UTC", () => {
  assert.equal(phaseAt(at("2026-11-02T14:29:00Z")), "pre");
  assert.equal(phaseAt(at("2026-11-02T14:30:00Z")), "regular");
  assert.equal(phaseAt(at("2026-03-09T13:30:00Z")), "regular"); // после весеннего перехода (9 марта) снова UTC−4
  assert.equal(phaseAt(at("2026-03-06T14:30:00Z")), "regular"); // до него (UTC−5)
});

test("выходные и праздники: закрыто весь день; сокращённый день до 13:00", () => {
  assert.equal(phaseAt(at("2026-10-10T15:00:00Z")), "closed"); // суббота
  assert.equal(phaseAt(at("2026-11-26T15:00:00Z")), "closed"); // День благодарения
  assert.equal(isTradingDay({ y: 2026, m: 7, d: 3 }), false); // выходной вместо 4 июля
  assert.equal(phaseAt(at("2026-11-27T17:59:00Z")), "regular"); // 12:59 EST
  assert.equal(phaseAt(at("2026-11-27T18:00:00Z")), "after"); // 13:00 EST, сессия закончилась раньше
  assert.equal(phaseAt(at("2026-11-27T22:00:00Z")), "closed"); // 17:00 EST, пост-маркет тоже короче
});

test("ближайшая смена фазы: с пятницы вечером на понедельник, через праздник", () => {
  const fri = nextChange(at("2026-10-09T23:30:00Z")); // пт 19:30 ET, идёт пост-маркет
  assert.equal(fri.to, "closed");
  assert.equal(fri.at.toISOString(), "2026-10-10T00:00:00.000Z");
  const closed = nextChange(at("2026-10-10T10:00:00Z")); // суббота
  assert.equal(closed.to, "pre");
  assert.equal(closed.at.toISOString(), "2026-10-12T08:00:00.000Z"); // понедельник 04:00 ET
  const beforeHoliday = nextChange(at("2026-11-26T02:00:00Z")); // среда 21:00 ET, биржа закрыта, дальше праздник
  assert.equal(beforeHoliday.to, "pre");
  assert.equal(beforeHoliday.at.toISOString(), "2026-11-27T09:00:00.000Z"); // пятница 04:00 EST
  const reg = nextChange(at("2026-10-13T15:00:00Z"));
  assert.deepEqual([reg.to, reg.at.toISOString()], ["after", "2026-10-13T20:00:00.000Z"]);
});

test("последние торговые дни пропускают выходные и праздники", () => {
  assert.deepEqual(lastTradingDays({ y: 2026, m: 11, d: 30 }, 5), ["2026-11-30", "2026-11-27", "2026-11-25", "2026-11-24", "2026-11-23"]);
  assert.deepEqual(lastTradingDays({ y: 2026, m: 10, d: 11 }, 3), ["2026-10-09", "2026-10-08", "2026-10-07"]); // воскресенье → с пятницы
});

test("части торгового дня по времени Нью-Йорка", () => {
  const b = (iso: string) => bucketOf(at(iso));
  assert.equal(b("2026-10-13T09:00:00Z"), "pre"); // 05:00
  assert.equal(b("2026-10-13T13:45:00Z"), "open"); // 09:45
  assert.equal(b("2026-10-13T15:00:00Z"), "morning"); // 11:00
  assert.equal(b("2026-10-13T17:00:00Z"), "midday"); // 13:00
  assert.equal(b("2026-10-13T18:30:00Z"), "afternoon"); // 14:30
  assert.equal(b("2026-10-13T19:45:00Z"), "power"); // 15:45
  assert.equal(b("2026-10-13T21:00:00Z"), "after"); // 17:00
  assert.equal(b("2026-10-13T02:00:00Z"), "off");
  assert.equal(b("2026-10-10T15:00:00Z"), "off"); // суббота
});

test("ближайшие праздники и дата в Нью-Йорке", () => {
  const u = upcomingClosures({ y: 2026, m: 11, d: 1 }, 3);
  assert.deepEqual(u.map((x) => [x.date, x.early]), [["2026-11-26", false], ["2026-11-27", true], ["2026-12-24", true]]);
  assert.deepEqual(nyDate(at("2026-10-13T02:30:00Z")), { y: 2026, m: 10, d: 12, dow: 1, minutes: 22 * 60 + 30 });
});
