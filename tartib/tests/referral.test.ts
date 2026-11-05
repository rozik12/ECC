import test from "node:test";
import assert from "node:assert/strict";
import { parseRefCode, parseSource, refLink, telegramShareUrl, whatsappShareUrl } from "../lib/referral.ts";

test("код приглашения: только 6–12 латинских букв и цифр", () => {
  assert.equal(parseRefCode("abcd1234"), "ABCD1234");
  assert.equal(parseRefCode(" AB12CD "), "AB12CD");
  for (const bad of ["", "abc", "a".repeat(13), "ab cd12", "<script>", "ab-cd123", null, undefined, 12345678]) assert.equal(parseRefCode(bad), null);
});

test("ссылки: приглашение и «поделиться»", () => {
  assert.equal(refLink("https://tartib.uk/", "ABCD1234"), "https://tartib.uk/r/ABCD1234");
  const t = telegramShareUrl("https://tartib.uk/r/A1B2C3D4", "Привет & пока");
  assert.ok(t.startsWith("https://t.me/share/url?url=https%3A%2F%2Ftartib.uk%2Fr%2FA1B2C3D4&text="));
  assert.ok(t.includes("%D0%9F") && t.includes("%26"));
  assert.ok(whatsappShareUrl("https://tartib.uk/r/X", "Hi").startsWith("https://wa.me/?text="));
});

test("источник ссылки в канал: запасной вариант site", () => {
  assert.equal(parseSource("Blog"), "blog");
  assert.equal(parseSource("friends-2"), "friends-2");
  for (const bad of ["", "a b", "../x", "x".repeat(40), null, 5]) assert.equal(parseSource(bad), "site");
});
