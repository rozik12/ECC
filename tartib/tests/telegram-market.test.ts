import test from "node:test";
import assert from "node:assert/strict";
import { parseCalendar, parseOkxTickers, topMovers } from "../lib/market-feed.ts";
import { alertsScreen, calendarScreen, fearScreen, mainMenu, marketMenu, moversScreen, watchScreen } from "../supabase/functions/telegram-bot/ui.ts";
import { renderNotification } from "../supabase/functions/telegram-bot/notify.ts";

const plain = (s: string) => s.replace(/<[^>]+>/g, "");
const LANGS = ["ru", "en", "uz"] as const;
const row = (instId: string, last: string, open: string, vol: string) => ({ instId, last, open24h: open, volCcy24h: vol });
const movers = topMovers(parseOkxTickers({ code: "0", data: [row("BTC-USDT", "110", "100", "9000000"), row("ETH-USDT", "90", "100", "8000000"), row("SOL-USDT", "104", "100", "5000000")] }));
const NOW = Date.parse("2026-10-09T11:20:00Z");
const events = parseCalendar([
  { title: "CPI <b>m/m</b>", country: "USD", date: "2026-10-09T08:30:00-04:00", impact: "High", forecast: "0.3%", previous: "0.2%" },
  { title: "Rate decision", country: "GBP", date: "2026-10-09T09:00:00-04:00", impact: "Medium" },
]);

test("бот-рынок: страх и жадность, лидеры, календарь на трёх языках", () => {
  for (const l of LANGS) {
    const f = fearScreen(l, { value: 59, label: "greed", previous: 52, at: 0 }, 58.3);
    assert.match(plain(f.text), /59/);
    assert.match(plain(f.text), /52/);
    assert.match(plain(f.text), /58[,.]3/);
    assert.ok(!f.text.includes("fng_"), "метка категории переведена");
    assert.match(fearScreen(l, null, null).text.toLowerCase(), /.{10}/);
    const m = moversScreen(l, movers.gainers, movers.losers);
    assert.match(plain(m.text), /BTC\/USDT/);
    assert.match(plain(m.text), /\+10(?:[,.]0+)?%/);
    assert.match(plain(m.text), /-10(?:[,.]0+)?%/);
    assert.equal((plain(m.text).match(/-10/g) ?? []).length, 1); // падающая монета только в списке падения
    const c = calendarScreen(l, events, "Asia/Tashkent", NOW);
    assert.match(c.text, /CPI &lt;b&gt;m\/m&lt;\/b&gt;/); // название экранировано
    assert.doesNotMatch(c.text, /Rate decision/); // в боте только важные (высокой важности)
    assert.match(plain(c.text), /0\.3%/);
    assert.match(plain(c.text), /Asia\/Tashkent/);
    assert.ok(c.kb!.inline_keyboard.flat().some((b) => b.callback_data === "mk:cal"));
  }
});

test("бот-рынок: список наблюдения и алерты", () => {
  for (const l of LANGS) {
    const w = watchScreen(l, ["BTCUSDT", "XXXUSDT"], { BTCUSDT: { last: 83000, change: 1.5 } }, "note");
    assert.match(plain(w.text), /BTCUSDT {2}83.000/);
    assert.match(plain(w.text), /XXXUSDT {2}—/);
    assert.match(w.text, /^note/);
    assert.match(watchScreen(l, [], {}).text, /\/watch/);
    const a = alertsScreen(l, [{ symbol: "BTCUSDT", direction: "above", price: 90000 }, { symbol: "ETHUSDT", direction: "below", price: 2500.5 }]);
    const buttons = a.kb!.inline_keyboard.flat().filter((b) => b.callback_data?.startsWith("al:d:"));
    assert.deepEqual(buttons.map((b) => b.callback_data), ["al:d:0", "al:d:1"]);
    assert.match(buttons[0].text, /≥/);
    assert.match(buttons[1].text, /≤/);
    assert.match(alertsScreen(l, []).text, /\/alert/);
  }
});

test("бот-рынок: кнопки, пуш о сработавшем алерте, экранирование", () => {
  for (const l of LANGS) {
    assert.ok(mainMenu(l).kb!.inline_keyboard.flat().some((b) => b.callback_data === "m:market"));
    const data = marketMenu(l).kb!.inline_keyboard.flat().map((b) => b.callback_data);
    for (const d of ["mk:fear", "mk:movers", "mk:cal", "mk:watch", "mk:alerts"]) assert.ok(data.includes(d), `${l} ${d}`);
    assert.ok(mainMenu(l).kb!.inline_keyboard.flat().every((b) => !b.callback_data || new TextEncoder().encode(b.callback_data).length <= 64));
    const up = renderNotification(l, "price_alert", { symbol: "BTCUSDT", direction: "above", price: 70000, last: 70010.5 })!;
    const down = renderNotification(l, "price_alert", { symbol: "BTCUSDT", direction: "below", price: 60000, last: 59990 })!;
    assert.match(up, /BTCUSDT/);
    assert.match(up, /70000/);
    assert.notEqual(up, down);
    assert.doesNotMatch(renderNotification(l, "price_alert", { symbol: "<script>", direction: "above", price: "<i>", last: 1 })!, /<script>|<i>/);
  }
});
