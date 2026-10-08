import test from "node:test";
import assert from "node:assert/strict";
import { isWeakPassword } from "../lib/password.ts";

test("частые и простые пароли отклоняются", () => {
  for (const p of ["12345678", "Password1", "qwertyui", "aaaaaaaa", "12121212", "abcdefgh", "87654321", "Tartib123"]) {
    assert.equal(isWeakPassword(p), true, p);
  }
});

test("пароль, повторяющий почту, отклоняется", () => {
  assert.equal(isWeakPassword("rozik12345", "rozik@gmail.com"), true);
});

test("нормальные пароли проходят", () => {
  for (const p of ["blue-Horse-42-lamp", "Kx9#mT2vQ", "моя-длинная-фраза-77"]) {
    assert.equal(isWeakPassword(p, "someone@example.com"), false, p);
  }
});
