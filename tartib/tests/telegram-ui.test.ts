import test from "node:test";
import assert from "node:assert/strict";
import * as ui from "../supabase/functions/telegram-bot/ui.ts";
import { tr } from "../supabase/functions/telegram-bot/text.ts";

const mk = (i: number, over: Partial<ui.TradeRow> = {}): ui.TradeRow => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, instrument: "BTCUSDT", direction: "long", entry: 65000, exit: 66000, stop: 64500, tp: null,
  size: 0.1, leverage: 1, fees: 0, pnl: 100, emotion: "calm", strategy: "", comment: "", followed: true, at: new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString(), violations: [], ...over,
});
const rows = [mk(1), mk(2, { pnl: -40, followed: false, exit: null, violations: [{ id: "r1", name: "Стоп <обязателен>" }], emotion: "fomo", comment: "<b>x</b>" }), mk(3)];

function allScreens(lang: "ru" | "uz" | "en"): ui.Screen[] {
  const accs = [{ id: "a1", name: "Основной", currency: "USD", balance: 1000 }];
  const rules = [{ id: "u1", name: "Правило", rule_type: "custom", is_active: true }];
  return [
    ui.mainMenu(lang), ui.statsMenu(lang), ui.periodReport(lang, "s:today", "T", rows, "USD"), ui.periodReport(lang, "s:today", "T", [], "USD"),
    ui.disciplineScreen(lang, rows, "USD"), ui.streakScreen(lang, rows), ui.goalScreen(lang, rows, 80, "UTC"), ui.violationsScreen(lang, rows), ui.emotionsScreen(lang, rows, "USD"),
    ui.instrumentsScreen(lang, rows, "USD"), ui.achievementsScreen(lang, rows), ui.tradesList(lang, rows, 0, 12, "USD", "l"), ui.tradesList(lang, [], 0, 0, "USD", "o"),
    { text: ui.tradeCard(lang, rows[1], "USD", "UTC"), kb: ui.tradeActions(lang, rows[1]) }, { text: "x", kb: ui.savedActions(lang, rows[1]) }, ui.deleteAsk(lang, rows[1]),
    ui.rulesMark(lang, rows[1].id, rules, new Set(["u1"])), ui.rulesMark(lang, rows[1].id, [], new Set()),
    ui.wizardScreen(lang, "instrument", ["BTCUSDT", "ETHUSDT", "SOLUSDT"]), ui.wizardScreen(lang, "direction", []), ui.wizardScreen(lang, "stop", []), ui.wizardScreen(lang, "emotion", []),
    ui.wizardConfirm(lang, { instrument: "BTCUSDT", direction: "long", entry: 1, size: 2, stop: null, exit: null, emotion: "calm" }), ui.wizardEdit(lang),
    ui.accountsScreen(lang, accs, null), ui.rulesScreen(lang, rules), ui.rulesScreen(lang, []), ui.settingsScreen(lang, { reminders: true, daily: false, weekly: true, notify: true }, "Основной"),
    ui.languagePicker(lang), ui.unlinkAsk(lang), ui.checklistScreen(lang, ["plan", "stop", "custom-item"], [0]), ui.helpMenu(lang), ui.helpTopic(lang, "fmt"), ui.helpTopic(lang, "cmds"), ui.unknownScreen(lang),
  ];
}

test("данные всех кнопок не длиннее 64 байт, текст не длиннее лимита Telegram", () => {
  for (const lang of ["ru", "uz", "en"] as const) {
    for (const s of allScreens(lang)) {
      assert.ok(s.text.length > 0 && s.text.length < 4000, s.text.slice(0, 40));
      for (const row of s.kb?.inline_keyboard ?? []) for (const btn of row) {
        assert.ok(btn.text.length > 0 && btn.text.length <= 64, `текст кнопки: ${btn.text}`);
        assert.equal(Boolean(btn.callback_data) !== Boolean(btn.url), true, `кнопка должна иметь либо данные, либо ссылку: ${btn.text}`);
        if (btn.callback_data) assert.ok(new TextEncoder().encode(btn.callback_data).length <= 64, btn.callback_data);
      }
    }
  }
});

test("пользовательский текст экранируется в HTML", () => {
  const card = ui.tradeCard("ru", rows[1], "USD", "UTC");
  assert.ok(card.includes("Стоп &lt;обязателен&gt;"));
  assert.ok(card.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(!card.includes("<b>x</b>"));
  assert.equal(ui.esc("a&b<c>"), "a&amp;b&lt;c&gt;");
});

test("отчёт за период считает так же, как сайт", () => {
  const s = ui.periodReport("ru", "s:x", "Период", rows, "USD");
  assert.ok(s.text.includes("Сделок: 3"));
  assert.ok(s.text.includes("по правилам: 2 (67%)"));
  assert.ok(s.text.includes("Win rate: 67%"));
});

test("CSV: защита от формул, кавычки и BOM", () => {
  const csv = ui.tradesCsv([mk(1, { instrument: "=HYPERLINK(1)", comment: 'он сказал "да"', strategy: "+cmd" })]);
  assert.ok(csv.startsWith("﻿date,instrument"));
  assert.ok(csv.includes('"\'=HYPERLINK(1)"'));
  assert.ok(csv.includes('"он сказал ""да"""'));
  assert.ok(csv.includes('"\'+cmd"'));
});

test("страницы списка: стрелки только там, где есть куда идти", () => {
  const first = ui.tradesList("ru", rows, 0, 12, "USD", "l").kb!.inline_keyboard;
  const nav = first[first.length - 2];
  assert.deepEqual(nav.map((x) => x.callback_data), ["l:0", "l:1"]);
  const mid = ui.tradesList("ru", rows, 1, 12, "USD", "l").kb!.inline_keyboard;
  assert.deepEqual(mid[mid.length - 2].map((x) => x.callback_data), ["l:0", "l:1", "l:2"]);
});

test("кнопка «Закрыть» есть только у открытой сделки", () => {
  const has = (t: ui.TradeRow) => ui.tradeActions("ru", t).inline_keyboard.flat().some((b) => b.callback_data?.startsWith("tc:"));
  assert.equal(has(rows[1]), true);
  assert.equal(has(rows[0]), false);
});

test("мастер: подписи шагов есть на всех языках", () => {
  for (const l of ["ru", "uz", "en"] as const) assert.ok(tr(l, "wizEntry").length > 5);
});
