import test from "node:test";
import assert from "node:assert/strict";
import { parseNums } from "../supabase/functions/telegram-bot/parse.ts";
import { bestScreen, mainMenu, rrScreen, sessionsScreen, sizeScreen, statsMenu, tiltScreen, toolsMenu, type TradeRow } from "../supabase/functions/telegram-bot/ui.ts";

const plain = (s: string) => s.replace(/<[^>]+>/g, "");
const LANGS = ["ru", "en", "uz"] as const;

test("бот: числа из команды, запятая как десятичный знак", () => {
  assert.deepEqual(parseNums("5000 1 100 98"), [5000, 1, 100, 98]);
  assert.deepEqual(parseNums("1,5 100,25"), [1.5, 100.25]);
  assert.equal(parseNums("abc 1"), null);
  assert.equal(parseNums("   "), null);
});

test("бот /size: полный и короткий формат, ошибки", () => {
  for (const l of LANGS) {
    const full = sizeScreen(l, [5000, 1, 100, 98], null);
    assert.match(plain(full.text), /25/);
    assert.match(plain(full.text), /2[\s ,.]?500/);
    const short = sizeScreen(l, [1, 100, 98], { value: 5000, cur: "USD" });
    assert.match(plain(short.text), /USD/);
    assert.equal(sizeScreen(l, [1, 100, 98], null).text.length > 10, true);
    assert.notEqual(sizeScreen(l, [5000, 1, 100, 100], null).text, full.text); // стоп равен входу
    assert.match(sizeScreen(l, null, null).text, /\/size/);
  }
});

test("бот /rr: соотношение, безубыточность, ожидание", () => {
  const s = plain(rrScreen("en", [100, 98, 104, 40]).text);
  assert.match(s, /1 : 2/);
  assert.match(s, /33\.3%/);
  assert.match(s, /0\.2 R/);
  assert.doesNotMatch(plain(rrScreen("en", [100, 98, 104]).text), /Expectancy/);
  assert.match(rrScreen("en", [100, 98, 99]).text, /Couldn't calculate/);
  assert.match(rrScreen("ru", []).text, /\/rr/);
});

test("бот /sessions: статус сессий в среду и в субботу", () => {
  const wed = plain(sessionsScreen("en", new Date("2026-10-07T10:00:00Z"), "Asia/Tashkent").text);
  assert.match(wed, /London: open, closes in 6 h/);
  assert.match(wed, /New York: closed, opens in 2 h/);
  assert.match(wed, /15:00/); // Ташкент UTC+5
  const sat = plain(sessionsScreen("en", new Date("2026-10-10T12:00:00Z"), "UTC").text);
  assert.doesNotMatch(sat, /open, closes/);
  assert.match(sessionsScreen("ru", new Date("2026-10-07T14:00:00Z"), "UTC").text, /Лондон и|Лондон \+|Нью-Йорк/);
});

const row = (i: number, min: number, pnl: number, ok: boolean): TradeRow => ({
  id: String(i), instrument: "BTC<>", direction: "long", entry: 1, exit: 1, stop: null, tp: null, size: 1, leverage: 1, fees: 0, pnl, emotion: "calm", strategy: "", comment: "",
  followed: ok, at: new Date(Date.UTC(2026, 9, 1, 10, min)).toISOString(), violations: [],
});

test("бот /tilt и /best: мало данных, предупреждение, экранирование", () => {
  assert.match(plain(tiltScreen("en", [row(1, 0, -1, true)], "USD").text), /at least 6/);
  const rows = [row(1, 0, -10, true), row(2, 20, 5, false), row(3, 40, -3, true), row(4, 50, 8, false), row(5, 70, -2, true), row(6, 80, 4, false), row(7, 100, -1, true), row(8, 110, 2, false), row(9, 300, 9, true), row(10, 400, 3, true), row(11, 500, 1, true), row(12, 600, 2, true)];
  const t = plain(tiltScreen("en", rows, "USD").text);
  assert.match(t, /pause rule/);
  const b = bestScreen("en", rows, "USD", "UTC").text;
  assert.match(b, /BTC&lt;&gt;/); // инструмент экранирован
  assert.match(plain(b), /\+9/);
  assert.match(bestScreen("ru", [], "USD", "UTC").text, /Лучшие|нет/);
});

test("бот: кнопки инструментов в меню, длина callback_data", () => {
  for (const l of LANGS) {
    const all = [...mainMenu(l).kb!.inline_keyboard.flat(), ...statsMenu(l).kb!.inline_keyboard.flat(), ...toolsMenu(l).kb!.inline_keyboard.flat()];
    for (const data of ["m:tools", "s:tilt", "s:best", "m:sess"]) assert.ok(all.some((b) => b.callback_data === data), `${l} ${data}`);
    assert.ok(all.every((b) => !b.callback_data || new TextEncoder().encode(b.callback_data).length <= 64));
  }
});
