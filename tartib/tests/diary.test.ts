import test from "node:test";
import assert from "node:assert/strict";
import { diaryStreak, isDay, isFilled, localDay, moodVsResult, planVsResult, shiftDay, type DiaryEntry } from "../lib/diary.ts";
import { diarySchema } from "../lib/validations/diary.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

test("день: часовой пояс, сдвиг, проверка формата", () => {
  assert.equal(localDay(new Date("2026-10-09T22:30:00Z"), "UTC"), "2026-10-09");
  assert.equal(localDay(new Date("2026-10-09T22:30:00Z"), "Asia/Tashkent"), "2026-10-10");
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDay("2024-03-01", -1), "2024-02-29");
  assert.ok(isDay("2026-10-09"));
  for (const bad of ["2026-13-01", "2026-02-30", "26-10-09", "2026-10-9", "", "abc"]) assert.equal(isDay(bad), false, bad);
});

test("заполненность: одно настроение дневником не считается", () => {
  assert.equal(isFilled({ plan: "  ", review: "", lesson: "" }), false);
  assert.equal(isFilled({ plan: "", review: "", lesson: "урок" }), true);
});

test("серия: сегодня пусто — считаем от вчера; разрыв обнуляет; лучшая серия", () => {
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
  assert.deepEqual(diaryStreak(days, "2026-10-09"), { current: 4, longest: 4 });
  assert.deepEqual(diaryStreak([...days, "2026-10-09"], "2026-10-09"), { current: 5, longest: 5 });
  assert.deepEqual(diaryStreak(days, "2026-10-11"), { current: 0, longest: 4 });
  assert.deepEqual(diaryStreak(["2026-09-01", "2026-09-02", "2026-09-03", "2026-10-08"], "2026-10-08"), { current: 1, longest: 3 });
  assert.deepEqual(diaryStreak([], "2026-10-08"), { current: 0, longest: 0 });
  assert.deepEqual(diaryStreak(["2026-02-27", "2026-02-28", "2026-03-01"], "2026-03-01"), { current: 3, longest: 3 }); // через границу месяца
});

let n = 0;
const tr = (at: string, pnl: number): StatTrade => ({ id: String(++n), tradedAt: at, instrument: "X", direction: "long", entryPrice: 1, exitPrice: 1, pnl, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [] });
const en = (day: string, mood: number | null, followed: boolean | null = null): DiaryEntry => ({ day, mood, energy: null, plan: "", review: "", lesson: "", followedPlan: followed });

test("настроение и результат дня: дни без сделок и без настроения не считаются", () => {
  const trades = [tr("2026-10-01T10:00:00Z", 10), tr("2026-10-01T12:00:00Z", -4), tr("2026-10-02T10:00:00Z", -20), tr("2026-10-03T10:00:00Z", 8)];
  const entries = [en("2026-10-01", 4), en("2026-10-02", 2), en("2026-10-03", null), en("2026-10-04", 5)];
  const rows = moodVsResult(entries, trades, "UTC");
  assert.deepEqual(rows, [{ mood: 2, days: 1, avgPnl: -20, winDays: 0 }, { mood: 4, days: 1, avgPnl: 6, winDays: 1 }]);
  // сделка в 23:30 UTC относится к следующему дню в Ташкенте
  const late = [tr("2026-10-01T23:30:00Z", 5)];
  assert.equal(moodVsResult([en("2026-10-02", 3)], late, "Asia/Tashkent").length, 1);
  assert.equal(moodVsResult([en("2026-10-01", 3)], late, "Asia/Tashkent").length, 0);
});

test("план и результат: соблюдён против нарушен", () => {
  const trades = [tr("2026-10-01T10:00:00Z", 10), tr("2026-10-02T10:00:00Z", 6), tr("2026-10-03T10:00:00Z", -30)];
  const r = planVsResult([en("2026-10-01", null, true), en("2026-10-02", null, true), en("2026-10-03", null, false), en("2026-10-04", null, null)], trades, "UTC");
  assert.deepEqual(r.followed, { days: 2, avgPnl: 8 });
  assert.deepEqual(r.broken, { days: 1, avgPnl: -30 });
  assert.deepEqual(planVsResult([], trades, "UTC"), { followed: null, broken: null });
});

test("проверка записи: лимиты и шкалы", () => {
  const ok = { day: "2026-10-09", mood: 3, energy: null, plan: "x", review: "", lesson: "", followedPlan: null };
  assert.ok(diarySchema.safeParse(ok).success);
  for (const bad of [{ mood: 0 }, { mood: 6 }, { mood: 2.5 }, { day: "2026-02-30" }, { plan: "x".repeat(2001) }, { lesson: "x".repeat(501) }, { followedPlan: "yes" }])
    assert.equal(diarySchema.safeParse({ ...ok, ...bad }).success, false, JSON.stringify(bad));
});
