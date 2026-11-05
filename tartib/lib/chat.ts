// Мессенджер: общие правила и чистые функции (без обращений к базе), чтобы их можно было проверить тестами.

export const HANDLE_RE = /^[a-z][a-z0-9_]{2,19}$/;
export const RESERVED_HANDLES = ["admin", "administrator", "tartib", "support", "owner", "system", "moderator", "root", "help", "staff", "official", "telegram", "bot"];
export const MAX_MESSAGE = 2000;
export const MAX_GROUP_MEMBERS = 50;
export const MAX_TITLE = 60;

/** Приводит ввод к виду «ник без @ маленькими буквами». */
export const normalizeHandle = (v: string) => v.trim().replace(/^@/, "").toLowerCase();

/** Ключ ошибки ника в словаре chat.errors или null, если ник годится. Те же правила, что в базе. */
export function handleProblem(raw: string): "handle_invalid" | "handle_reserved" | null {
  const h = normalizeHandle(raw);
  if (!HANDLE_RE.test(h)) return "handle_invalid";
  if (RESERVED_HANDLES.includes(h)) return "handle_reserved";
  return null;
}

const KNOWN_ERRORS = ["handle_invalid", "handle_taken", "handle_reserved", "need_handle", "cannot_contact", "too_many_chats", "too_many_groups", "too_many_members", "title_invalid", "rate_limit", "forbidden", "empty", "deleted", "invalid", "unauthorized"];

/** Из текста ошибки базы получает ключ для словаря chat.errors.<ключ>. */
export function chatErrorKey(error: { message?: string; code?: string } | null | undefined): string {
  const m = error?.message ?? "";
  for (const k of KNOWN_ERRORS) if (m.includes(k)) return k;
  if (error?.code === "42501") return "blocked";
  return "generic";
}

export type ChatMessage = { id: string; chat_id: string; sender_id: string | null; body: string; created_at: string; edited_at: string | null; deleted_at: string | null };

/** Добавляет или заменяет сообщение (по id) и держит список по времени; нужен и для ответа на отправку, и для событий реального времени. */
export function upsertMessage(list: ChatMessage[], m: ChatMessage): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = m;
    return next;
  }
  const next = [...list, m];
  next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  return next;
}

export type MessageGroup = { key: string; day: string; senderId: string | null; items: ChatMessage[] };

/** Календарный день сообщения в часовом поясе пользователя, вида 2026-10-20. */
export function dayKey(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Склеивает подряд идущие сообщения одного автора (в пределах 5 минут и одного дня) для компактного показа. */
export function groupMessages(list: ChatMessage[], timeZone: string): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of list) {
    const day = dayKey(m.created_at, timeZone);
    const last = groups[groups.length - 1];
    const lastItem = last?.items[last.items.length - 1];
    if (last && last.day === day && last.senderId === m.sender_id && lastItem && Date.parse(m.created_at) - Date.parse(lastItem.created_at) < 5 * 60_000) last.items.push(m);
    else groups.push({ key: m.id, day, senderId: m.sender_id, items: [m] });
  }
  return groups;
}

/** Короткий текст для списка чатов. */
export function previewText(body: string | null, deleted: boolean, deletedLabel: string, max = 60): string {
  if (deleted) return deletedLabel;
  const one = (body ?? "").replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** Первые буквы для круглой «аватарки». */
export function initials(name: string | null | undefined, handle: string | null | undefined): string {
  const src = (name ?? "").trim() || (handle ?? "").trim() || "?";
  const parts = src.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}
