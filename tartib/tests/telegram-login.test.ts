import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// login.ts импортирует db.ts (Deno), поэтому здесь проверяем только чистую функцию, вынеся её текст из файла.
const src = readFileSync(new URL("../supabase/functions/telegram-bot/login.ts", import.meta.url), "utf8");
const body = src.match(/export function normalizePhone[\s\S]*?\n}\n/)![0].replace("export function", "function").replace(/\(raw: string\): string \| null/, "(raw)");
const normalizePhone = new Function(`${body}; return normalizePhone;`)() as (raw: string) => string | null;

test("номер приводится к цифрам без плюса", () => {
  assert.equal(normalizePhone("+998 90 123-45-67"), "998901234567");
  assert.equal(normalizePhone("998901234567"), "998901234567");
  assert.equal(normalizePhone("+7 (999) 123-45-67"), "79991234567");
});

test("слишком короткие и слишком длинные номера отклоняются", () => {
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone("1234567890123456"), null);
  assert.equal(normalizePhone("abc"), null);
});

test("в боте вход принимает только свой номер и сверяет user_id", () => {
  assert.ok(src.includes("contact.user_id !== fromId"));
  assert.ok(src.includes('"loginWrong"'));
});
