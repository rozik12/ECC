import test from "node:test";
import assert from "node:assert/strict";
import { _dicts, menuAction, tr } from "../supabase/functions/telegram-bot/text.ts";

test("у ru, en и uz одинаковый набор ключей", () => {
  const keys = (l: "ru" | "en" | "uz") => Object.keys(_dicts[l]).sort();
  assert.deepEqual(keys("en"), keys("ru"));
  assert.deepEqual(keys("uz"), keys("ru"));
});

test("подстановки {name} совпадают у всех языков", () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const key of Object.keys(_dicts.ru)) {
    assert.equal(vars(_dicts.en[key]), vars(_dicts.ru[key]), `en ${key}`);
    assert.equal(vars(_dicts.uz[key]), vars(_dicts.ru[key]), `uz ${key}`);
  }
});

test("подстановка значений и определение кнопки меню на любом языке", () => {
  assert.equal(tr("ru", "wizConfirm", { summary: "X" }).includes("X"), true);
  assert.equal(menuAction("📊 Today"), "kToday");
  assert.equal(menuAction("📊 Bugun"), "kToday");
  assert.equal(menuAction("привет"), null);
});

test("HTML-теги в текстах парные", () => {
  for (const l of ["ru", "en", "uz"] as const) {
    for (const [k, v] of Object.entries(_dicts[l])) {
      for (const tag of ["b", "code"]) {
        const open = (v.match(new RegExp(`<${tag}>`, "g")) ?? []).length;
        const close = (v.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
        assert.equal(open, close, `${l}.${k} <${tag}>`);
      }
    }
  }
});

test("все ключи текстов, которые использует код бота, существуют", async () => {
  const { readFileSync } = await import("node:fs");
  const dir = new URL("../supabase/functions/telegram-bot/", import.meta.url);
  const src = ["ui.ts", "index.ts"].map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  const literal = [...src.matchAll(/tr\(\s*(?:lang|c\.lang|arg)\s*,\s*"(\w+)"/g)].map((m) => m[1]);
  const ternary = [...src.matchAll(/"(\w+)"\s*:\s*"(\w+)"\)/g)].flatMap((m) => [m[1], m[2]]).filter((k) => /^[a-zA-Z]+$/.test(k));
  assert.ok(literal.length > 80, `нашлось ключей: ${literal.length}`);
  for (const key of new Set(literal)) assert.ok(key in _dicts.ru, `нет ключа ${key}`);
  for (const key of ["wizBad", "missing_instrument", "missing_entry", "missing_size", "missing_direction", "bExport", "discNone", "instrTitle", "violNone"]) assert.ok(key in _dicts.ru, key);
  void ternary;
});
