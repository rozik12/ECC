import test from "node:test";
import assert from "node:assert/strict";
import { dateToZonedInput, dayBounds, safeTimeZone, zonedInputToDate } from "../lib/time.ts";

test("ввод времени в поясе профиля: Ташкент (UTC+5, без перехода)", () => {
  const d = zonedInputToDate("Asia/Tashkent", "2026-10-09T14:30")!;
  assert.equal(d.toISOString(), "2026-10-09T09:30:00.000Z");
  assert.equal(dateToZonedInput("Asia/Tashkent", d), "2026-10-09T14:30");
});

test("ввод времени: Нью-Йорк, лето и зима", () => {
  assert.equal(zonedInputToDate("America/New_York", "2026-07-01T10:00")!.toISOString(), "2026-07-01T14:00:00.000Z"); // UTC−4
  assert.equal(zonedInputToDate("America/New_York", "2026-12-01T10:00")!.toISOString(), "2026-12-01T15:00:00.000Z"); // UTC−5
});

test("круговой обмен без сдвигов в разных поясах и в дни перехода", () => {
  const zones = ["Asia/Tashkent", "Europe/Moscow", "America/New_York", "Europe/London", "Asia/Kolkata", "Pacific/Auckland", "UTC"];
  for (const tz of zones) {
    for (const v of ["2026-01-15T00:00", "2026-03-29T12:00", "2026-07-04T23:59", "2026-10-25T12:00", "2026-11-01T12:00", "2026-12-31T23:30"]) {
      assert.equal(dateToZonedInput(tz, zonedInputToDate(tz, v)!), v, `${tz} ${v}`);
    }
  }
});

test("время, которого не бывает (пропущенный час) и повторяющийся час не ломают расчёт", () => {
  // 2026-03-08 02:30 в Нью-Йорке не существует: берётся ближайший корректный момент, без ошибки и NaN
  const gap = zonedInputToDate("America/New_York", "2026-03-08T02:30")!;
  assert.ok(!Number.isNaN(gap.getTime()));
  assert.ok(["2026-03-08T01:30", "2026-03-08T03:30"].includes(dateToZonedInput("America/New_York", gap)));
  // 2026-11-01 01:30 повторяется дважды; любой из двух моментов допустим и обратимо превращается в то же значение
  const dup = zonedInputToDate("America/New_York", "2026-11-01T01:30")!;
  assert.equal(dateToZonedInput("America/New_York", dup), "2026-11-01T01:30");
});

test("неверные значения и неизвестный пояс", () => {
  assert.equal(zonedInputToDate("Asia/Tashkent", ""), null);
  assert.equal(zonedInputToDate("Asia/Tashkent", "2026-10-09"), null);
  assert.equal(zonedInputToDate("Asia/Tashkent", "не дата"), null);
  assert.equal(safeTimeZone("Mars/Olympus"), "UTC");
  assert.equal(zonedInputToDate("Mars/Olympus", "2026-10-09T10:00")!.toISOString(), "2026-10-09T10:00:00.000Z");
});

test("границы дня в поясе профиля и в день перехода на зимнее время", () => {
  const b = dayBounds("Asia/Tashkent", new Date("2026-10-09T20:00:00Z")); // в Ташкенте уже 10 октября 01:00
  assert.equal(b.start.toISOString(), "2026-10-09T19:00:00.000Z");
  assert.equal(b.end.toISOString(), "2026-10-10T19:00:00.000Z");
  const ny = dayBounds("America/New_York", new Date("2026-11-01T12:00:00Z")); // день из 25 часов
  assert.equal((ny.end.getTime() - ny.start.getTime()) / 3600000, 25);
  const spring = dayBounds("America/New_York", new Date("2026-03-08T12:00:00Z")); // день из 23 часов
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3600000, 23);
});
