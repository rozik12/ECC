import test from "node:test";
import assert from "node:assert/strict";
import { durationBucket, durationMinutes, MISTAKES, parseTags, sanitizeSearch, splitDuration, tagsToText } from "../lib/journal.ts";
import { avgDuration, byDuration, byGrade, byTag, mistakeCost } from "../lib/analytics.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

let n = 0;
const mk = (over: Partial<StatTrade> & { at: string }): StatTrade => ({
  id: String(++n), tradedAt: over.at, instrument: "BTCUSDT", direction: "long", entryPrice: 1, exitPrice: 1, pnl: 0, emotion: "calm", rulesFollowed: true, riskAmount: null, strategy: "", violations: [], ...over,
});

test("теги: разбор строки, регистр, повторы, лимиты", () => {
  assert.deepEqual(parseTags("#пробой, Новости; пробой\nbreakout  retest"), ["пробой", "новости", "breakout retest"]);
  assert.deepEqual(parseTags("  ,, ;; "), []);
  assert.deepEqual(parseTags("A, a, A "), ["a"]);
  assert.equal(parseTags("x".repeat(80))[0].length, 30);
  assert.equal(parseTags(Array.from({ length: 25 }, (_, i) => `t${i}`).join(",")).length, 10);
  assert.equal(tagsToText(["a", "b"]), "a, b");
  assert.deepEqual(parseTags(tagsToText(["пробой", "ретест 2"])), ["пробой", "ретест 2"]);
});

test("длительность: расчёт, корзины, разбор на части", () => {
  assert.equal(durationMinutes("2026-10-01T10:00:00Z", "2026-10-01T12:15:00Z"), 135);
  assert.equal(durationMinutes("2026-10-01T10:00:00Z", null), null);
  assert.equal(durationMinutes("2026-10-01T10:00:00Z", "2026-10-01T09:00:00Z"), null); // закрытие раньше открытия
  assert.equal(durationMinutes("bad", "2026-10-01T09:00:00Z"), null);
  for (const [m, b] of [[0, "lt5"], [4, "lt5"], [5, "m5_30"], [29, "m5_30"], [30, "m30_120"], [119, "m30_120"], [120, "h2_8"], [479, "h2_8"], [480, "h8_24"], [1439, "h8_24"], [1440, "gt24"]] as const) assert.equal(durationBucket(m), b, String(m));
  assert.deepEqual(splitDuration(1500), { d: 1, h: 1, m: 0 });
  assert.deepEqual(splitDuration(135), { d: 0, h: 2, m: 15 });
});

test("поиск: из строки убираются знаки, меняющие условие запроса", () => {
  assert.equal(sanitizeSearch("btc,instrument.eq.x)"), "btc instrument.eq.x");
  assert.equal(sanitizeSearch(`a%b*c_d(e)f"g'h:i;j\\k`), "a b c d e f g h i j k");
  assert.equal(sanitizeSearch("  много   пробелов "), "много пробелов");
  assert.equal(sanitizeSearch("x".repeat(100)).length, 40);
  assert.equal(MISTAKES.length, 10);
});

test("аналитика журнала: теги, оценка, ошибки, длительность", () => {
  const t = [
    mk({ at: "2026-10-01T10:00:00Z", closedAt: "2026-10-01T10:03:00Z", pnl: 10, tags: ["Пробой", "новости"], grade: "A", mistakes: [] }),
    mk({ at: "2026-10-01T11:00:00Z", closedAt: "2026-10-01T12:30:00Z", pnl: -20, tags: ["пробой"], grade: "C", mistakes: ["moved_stop", "fomo_entry"] }),
    mk({ at: "2026-10-02T11:00:00Z", closedAt: "2026-10-03T13:00:00Z", pnl: 5, tags: [], grade: null, mistakes: ["fomo_entry"] }),
    mk({ at: "2026-10-03T11:00:00Z", pnl: -3 }),
  ];
  const tags = byTag(t);
  assert.deepEqual(tags.map((x) => [x.key, x.count, x.pnl]), [["новости", 1, 10], ["пробой", 2, -10]]); // регистр не важен
  assert.equal(tags[1].winRate, 50);
  assert.deepEqual(byGrade(t).map((x) => [x.key, x.count, x.pnl]), [["A", 1, 10], ["C", 1, -20]]);
  const mc = mistakeCost(t);
  assert.deepEqual(mc.map((x) => [x.key, x.count, x.pnl]), [["moved_stop", 1, -20], ["fomo_entry", 2, -15]].sort((a, b) => (a[2] as number) - (b[2] as number)));
  const d = byDuration(t);
  assert.deepEqual(d.map((x) => [x.bucket, x.count]), [["lt5", 1], ["m30_120", 1], ["gt24", 1]]); // сделка без закрытия не учтена
  const avg = avgDuration(t);
  assert.equal(avg.count, 3);
  assert.equal(avg.win, (3 + 26 * 60) / 2); // прибыльные: 3 минуты и 26 часов
  assert.equal(avg.loss, 90);
  assert.deepEqual(byTag([mk({ at: "2026-10-01T10:00:00Z" })]), []);
});

test("импорт: новые столбцы журнала находятся по названиям (в том числе русским)", async () => {
  const { autoMapColumns } = await import("../lib/import-map.ts");
  const m = autoMapColumns(["date_time", "instrument", "direction", "entry", "size", "tags", "grade", "mistakes", "closed_at"]);
  assert.deepEqual([m.tags, m.grade, m.mistakes, m.closed_at], [5, 6, 7, 8]);
  const ru = autoMapColumns(["Инструмент", "Теги", "Оценка", "Ошибки", "Время закрытия"]);
  assert.deepEqual([ru.tags, ru.grade, ru.mistakes, ru.closed_at], [1, 2, 3, 4]);
});

test("экспорт и импорт используют одни и те же новые столбцы", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("lib/import.ts", "utf8");
  const exp = readFileSync("app/api/trades/export/route.ts", "utf8");
  for (const c of ["tags", "grade", "mistakes", "closed_at"]) {
    assert.ok(src.includes(`"${c}"`), c);
    assert.ok(exp.includes(c), c);
  }
});

test("словари: все ключи журнала есть на трёх языках", async () => {
  const { readFileSync } = await import("node:fs");
  const keys = (o: unknown, p = ""): string[] => (o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
  const sets = ["ru", "uz", "en"].map((l) => new Set(keys(JSON.parse(readFileSync(`lib/i18n/dictionaries/${l}.json`, "utf8")).journal)));
  for (const s of sets) {
    assert.ok(s.size > 60);
    for (const m of MISTAKES) assert.ok(s.has(`mistakeNames.${m}`), m);
  }
  assert.deepEqual([...sets[0]].sort(), [...sets[1]].sort());
  assert.deepEqual([...sets[0]].sort(), [...sets[2]].sort());
});
