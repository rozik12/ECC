import test from "node:test";
import assert from "node:assert/strict";
import { generateToken, hashToken, looksLikeToken, tokenPrefix } from "../lib/api-token.ts";

test("ключ: формат, уникальность, хэш и префикс", async () => {
  const a = generateToken();
  const b = generateToken();
  assert.ok(looksLikeToken(a) && looksLikeToken(b));
  assert.notEqual(a, b);
  assert.equal(a.length, 67);
  assert.equal(tokenPrefix(a), a.slice(0, 9));
  const h = await hashToken("abc");
  assert.equal(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // SHA-256("abc")
  assert.equal((await hashToken(a)).length, 64);
  assert.ok(!looksLikeToken("tt_zz") && !looksLikeToken(5) && !looksLikeToken("xx_" + "a".repeat(64)));
});
