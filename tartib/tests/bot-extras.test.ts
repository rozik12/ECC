import test from "node:test";
import assert from "node:assert/strict";
import { METALS, messagesScreen, metalsScreen, parseMeta, siteScreen, supportDone, supportUsage, withHelpExtra, xt } from "../supabase/functions/telegram-bot/extras.ts";

const LANGS = ["ru", "uz", "en"] as const;

test("parseMeta берёт цену и вчерашнее закрытие, остальное отбрасывает", () => {
  assert.deepEqual(parseMeta({ chart: { result: [{ meta: { regularMarketPrice: 4200.5, chartPreviousClose: 4180 } }] } }), { price: 4200.5, prev: 4180 });
  assert.deepEqual(parseMeta({ chart: { result: [{ meta: { regularMarketPrice: 10 } }] } }), { price: 10, prev: null });
  assert.equal(parseMeta({ chart: { result: [{ meta: { regularMarketPrice: -1 } }] } }), null);
  assert.equal(parseMeta({}), null);
  assert.equal(parseMeta(null), null);
});

test("металлы: все пять строк, знак изменения и пометка про справочные данные", () => {
  const rows = METALS.map((m, i) => ({ key: m.key, icon: m.icon, price: 1000 + i, changePct: i === 0 ? 0.5 : -0.25 }));
  for (const lang of LANGS) {
    const s = metalsScreen(lang, rows);
    assert.equal((s.text.match(/\$/g) ?? []).length >= 5, true);
    assert.match(s.text, /\+0[.,]5%/);
    assert.match(s.text, /-0[.,]25%/);
    assert.ok(s.kb?.inline_keyboard[0][0].url?.endsWith("/metals"));
  }
  assert.match(metalsScreen("ru", []).text, /недоступны/);
});

test("все тексты есть на трёх языках и без забытых подстановок", () => {
  const keys = ["metalsTitle", "gold", "silver", "platinum", "palladium", "copper", "metalsNote", "metalsNone", "supportUsage", "supportSent", "supportLimit", "supportErr", "msgNone", "msgNoHandle", "siteTitle", "helpExtra"];
  for (const lang of LANGS) for (const k of keys) {
    const t = xt(lang, k);
    assert.notEqual(t, k, `${lang}.${k} отсутствует`);
    assert.doesNotMatch(t, /\{\w+\}/, `${lang}.${k} с неразобранной подстановкой`);
  }
  assert.match(xt("uz", "supportLong", { n: 2000 }), /2000/);
});

test("письмо владельцу: подсказка, ответы и ссылки на сайт", () => {
  for (const lang of LANGS) {
    assert.match(supportUsage(lang).text, /\/support/);
    for (const k of ["supportSent", "supportLimit", "supportErr", "supportLong"] as const) assert.ok(supportDone(lang, k).text.length > 5);
  }
});

test("мессенджер: без ника, без сообщений и с сообщениями", () => {
  assert.match(messagesScreen("ru", false, 0, 0).text, /ник/);
  assert.match(messagesScreen("ru", true, 0, 0).text, /Новых сообщений нет/);
  assert.match(messagesScreen("en", true, 5, 2).text, /5/);
  assert.match(messagesScreen("en", true, 99, 3).text, /99\+/);
});

test("ссылки и справка", () => {
  const urls = siteScreen("ru").kb!.inline_keyboard.flat().map((b) => b.url);
  assert.ok(urls.includes("https://t.me/tartibuk"));
  assert.ok(urls.includes("https://tartib.uk/tools"));
  assert.match(withHelpExtra("en", { text: "Help" }).text, /\/metals/);
});

import { readFileSync } from "node:fs";
test("копия extras.ts у маршрутизатора совпадает с файлом бота", () => {
  const a = readFileSync(new URL("../supabase/functions/telegram-bot/extras.ts", import.meta.url), "utf8");
  const b = readFileSync(new URL("../supabase/functions/telegram-router/extras.ts", import.meta.url), "utf8");
  assert.equal(a, b);
});
