import test from "node:test";
import assert from "node:assert/strict";
import { chatErrorKey, dayKey, groupMessages, handleProblem, initials, normalizeHandle, previewText, upsertMessage, type ChatMessage } from "../lib/chat.ts";

const msg = (id: string, sender: string, at: string, body = "hi"): ChatMessage => ({ id, chat_id: "c", sender_id: sender, body, created_at: at, edited_at: null, deleted_at: null });

test("ник: правила как в базе", () => {
  assert.equal(handleProblem("trader_01"), null);
  assert.equal(handleProblem("@Trader_01"), null);
  assert.equal(handleProblem("ab"), "handle_invalid");
  assert.equal(handleProblem("1abc"), "handle_invalid");
  assert.equal(handleProblem("has space"), "handle_invalid");
  assert.equal(handleProblem("a".repeat(21)), "handle_invalid");
  assert.equal(handleProblem("admin"), "handle_reserved");
  assert.equal(handleProblem("@Tartib"), "handle_reserved");
  assert.equal(normalizeHandle("  @Nick "), "nick");
});

test("ключи ошибок базы", () => {
  assert.equal(chatErrorKey({ message: "handle_taken" }), "handle_taken");
  assert.equal(chatErrorKey({ message: "ERROR: rate_limit CONTEXT: ..." }), "rate_limit");
  assert.equal(chatErrorKey({ message: "new row violates row-level security policy", code: "42501" }), "blocked");
  assert.equal(chatErrorKey({ message: "что-то другое" }), "generic");
  assert.equal(chatErrorKey(null), "generic");
});

test("сообщения: вставка по времени без дублей", () => {
  let l: ChatMessage[] = [];
  l = upsertMessage(l, msg("b", "u1", "2026-10-20T10:02:00Z"));
  l = upsertMessage(l, msg("a", "u1", "2026-10-20T10:01:00Z"));
  l = upsertMessage(l, msg("b", "u1", "2026-10-20T10:02:00Z", "edited"));
  assert.deepEqual(l.map((m) => m.id), ["a", "b"]);
  assert.equal(l[1].body, "edited");
});

test("сообщения: группировка по автору, времени и дню", () => {
  const list = [
    msg("1", "u1", "2026-10-20T10:00:00Z"), msg("2", "u1", "2026-10-20T10:03:00Z"), // одна группа
    msg("3", "u1", "2026-10-20T10:20:00Z"), // слишком поздно, новая группа
    msg("4", "u2", "2026-10-20T10:21:00Z"), // другой автор
    msg("5", "u2", "2026-10-21T10:22:00Z"), // другой день
  ];
  const g = groupMessages(list, "UTC");
  assert.deepEqual(g.map((x) => x.items.length), [2, 1, 1, 1]);
  assert.equal(g[3].day, "2026-10-21");
});

test("день учитывает часовой пояс", () => {
  assert.equal(dayKey("2026-10-20T20:30:00Z", "UTC"), "2026-10-20");
  assert.equal(dayKey("2026-10-20T20:30:00Z", "Asia/Tashkent"), "2026-10-21");
  assert.match(dayKey("2026-10-20T20:30:00Z", "Not/AZone"), /^2026-10-20/);
});

test("предпросмотр и инициалы", () => {
  assert.equal(previewText("  hello\n\n world ", false, "удалено"), "hello world");
  assert.equal(previewText("x", true, "удалено"), "удалено");
  assert.equal(previewText("a".repeat(100), false, "", 10).length, 10);
  assert.equal(initials("Ali Valiyev", "ali"), "AV");
  assert.equal(initials("", "trader"), "TR");
  assert.equal(initials(null, null), "?");
});
