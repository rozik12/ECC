import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeNotifications, describeNotification, NOTIFICATION_KINDS, type TradeNotifyInput } from "../lib/notifications.ts";
import { buildTradeNotifications as botBuild, renderNotification } from "../supabase/functions/telegram-bot/notify.ts";
import { mainMenu, notificationPush, notificationsScreen, settingsScreen } from "../supabase/functions/telegram-bot/ui.ts";
import ru from "../lib/i18n/dictionaries/ru.json" with { type: "json" };
import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import uz from "../lib/i18n/dictionaries/uz.json" with { type: "json" };

const base: TradeNotifyInput = { achBefore: ["first_trade"], achAfter: ["first_trade"], goalBefore: false, goalAfter: false, goal: 80, percent: 70, instrument: "BTCUSDT", violated: [] };

const lookup = (dict: unknown, key: string) => key.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), dict);
const tFor = (dict: unknown) => (key: string, vars?: Record<string, string | number>) => {
  const v = lookup(dict, key);
  return typeof v === "string" ? v.replace(/\{(\w+)\}/g, (_, n: string) => String(vars?.[n] ?? "")) : key;
};

test("уведомления: что создаётся после сделки", () => {
  assert.deepEqual(buildTradeNotifications(base), []);
  assert.deepEqual(buildTradeNotifications({ ...base, achAfter: ["first_trade", "trades_10", "streak_5"] }).map((d) => d.params.id), ["trades_10", "streak_5"]);
  const v = buildTradeNotifications({ ...base, violated: ["Стоп-лосс обязателен", "Риск не более 1%", "a", "b"], instrument: "ETHUSDT" });
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "violation");
  assert.equal(v[0].params.count, 4);
  assert.deepEqual(v[0].params.rules, ["Стоп-лосс обязателен", "Риск не более 1%", "a"]); // в тексте не больше трёх
  assert.deepEqual(buildTradeNotifications({ ...base, goalAfter: true, percent: 85 }), [{ kind: "goal", params: { percent: 85, goal: 80 } }]);
  assert.deepEqual(buildTradeNotifications({ ...base, goalBefore: true, goalAfter: true }), []); // цель уже была достигнута
});

test("уведомления: логика сайта и бота совпадает", () => {
  const cases: TradeNotifyInput[] = [
    base,
    { ...base, achAfter: ["first_trade", "clean_week"], violated: ["x"], goalAfter: true },
    { ...base, goalAfter: true, percent: null },
    { ...base, instrument: "A".repeat(80), violated: ["r".repeat(100)] },
  ];
  for (const c of cases) assert.deepEqual(botBuild(c), buildTradeNotifications(c));
});

test("уведомления: тексты есть на всех языках для каждого вида", () => {
  const params = { id: "first_trade", count: 2, instrument: "BTC", rules: ["Правило"], percent: 85, goal: 80, title: "T", body: "B", symbol: "BTCUSDT", direction: "above", price: 70000, last: 70010 };
  for (const dict of [ru, en, uz]) {
    for (const kind of NOTIFICATION_KINDS) {
      const d = describeNotification(kind, params, tFor(dict));
      assert.ok(d && d.title && !d.title.startsWith("notifications."), kind);
      assert.ok(!d.body.startsWith("notifications.") && !d.body.startsWith("achievements."), kind);
    }
  }
  assert.equal(describeNotification("unknown", {}, tFor(ru)), null);
  for (const lang of ["ru", "en", "uz"] as const) for (const kind of NOTIFICATION_KINDS) assert.ok(renderNotification(lang, kind, params), `${lang} ${kind}`);
  assert.equal(renderNotification("ru", "unknown", {}), null);
});

test("уведомления: подмена параметров не ломает разметку и не подставляет чужие ссылки", () => {
  const evil = { id: "<script>", title: "<b>x</b>", body: '<a href="https://evil">y</a>', instrument: "<i>", rules: ["<u>r</u>", 5, null], count: "NaN" };
  const site = describeNotification("announcement", evil, tFor(ru))!;
  assert.equal(site.href, null);
  assert.equal(describeNotification("achievement", evil, tFor(ru))!.body, ""); // неизвестный id не показывается
  const bot = renderNotification("ru", "announcement", evil)!;
  assert.doesNotMatch(bot, /<a |<script|<u>|<i>x/);
  assert.match(bot, /&lt;b&gt;x&lt;\/b&gt;/);
  const viol = renderNotification("ru", "violation", evil)!;
  assert.doesNotMatch(viol, /<u>|<i>/);
  assert.match(viol, /&lt;i&gt;/);
  assert.doesNotMatch(renderNotification("en", "achievement", evil)!, /<script/);
  // слишком длинное усечено
  assert.ok(describeNotification("announcement", { title: "t".repeat(500), body: "b".repeat(5000) }, tFor(ru))!.body.length <= 500);
});

test("уведомления в боте: экран, пуш, кнопки и настройка", () => {
  const items = [{ kind: "achievement", params: { id: "trades_10" }, unread: true }, { kind: "goal", params: { percent: 90, goal: 80 }, unread: false }, { kind: "bad", params: {}, unread: true }];
  for (const l of ["ru", "en", "uz"] as const) {
    const s = notificationsScreen(l, items);
    assert.match(s.text, /🔵/);
    assert.match(s.text, /▫️/);
    assert.equal(s.kb!.inline_keyboard.flat().some((b) => b.callback_data === "nt:clear"), true);
    assert.match(notificationsScreen(l, []).text, /🔔/);
    assert.equal(notificationPush(l, "bad", {}), null);
    assert.ok(notificationPush(l, "report", {})!.text.length > 5);
    assert.ok(mainMenu(l).kb!.inline_keyboard.flat().some((b) => b.callback_data === "m:notif"));
    assert.ok(settingsScreen(l, { reminders: true, daily: false, weekly: false, notify: true }, "Main").kb!.inline_keyboard.flat().some((b) => b.callback_data === "c:notify"));
  }
});
