// Вход и регистрация по номеру телефона через бота.
// Сайт даёт одноразовый код, человек делится своим номером (его подтверждает Telegram), бот находит или создаёт аккаунт и разрешает вход.
import { db } from "./db.ts";
import type { Tg } from "./tg.ts";
import { tr, type Lang } from "./text.ts";

export const LOGIN_PREFIX = "login_";
const TOKEN = /^[0-9a-f]{32}$/;

/** Нажали «Отмена» на запросе номера (на любом языке). */
export const isLoginCancel = (text: string) => (["ru", "uz", "en"] as Lang[]).some((l) => tr(l, "loginCancel") === text);

export type Contact = { phone_number: string; user_id?: number; first_name?: string };

/** Нормализует номер до цифр без плюса: «+998 90 123-45-67» → «998901234567». */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

const contactKeyboard = (lang: Lang) => ({
  keyboard: [[{ text: tr(lang, "loginShare"), request_contact: true }], [{ text: tr(lang, "loginCancel") }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

/** Человек открыл бота по ссылке с сайта: просим поделиться номером. */
export async function loginStart(tg: Tg, chatId: number, token: string, lang: Lang): Promise<string | null> {
  if (!TOKEN.test(token)) { await tg.send(chatId, tr(lang, "loginExpired")); return null; }
  const { data } = await db.from("telegram_logins").select("status, expires_at").eq("token", token).maybeSingle();
  if (!data || data.status !== "pending" || new Date(data.expires_at as string) < new Date()) {
    await tg.send(chatId, tr(lang, "loginExpired"));
    return null;
  }
  await tg.send(chatId, tr(lang, "loginAsk"), contactKeyboard(lang));
  return token;
}

export type LoginOutcome = { done: boolean; linkedChat: boolean };

/** Человек поделился номером. Возвращает, завершён ли вход и привязан ли чат к аккаунту. */
export async function loginContact(tg: Tg, chatId: number, fromId: number | undefined, contact: Contact, token: string, lang: Lang): Promise<LoginOutcome> {
  const fail = async (key: string): Promise<LoginOutcome> => { await tg.send(chatId, tr(lang, key), { remove_keyboard: true }); return { done: false, linkedChat: false }; };
  // Только свой номер: Telegram указывает user_id владельца контакта, когда его отправили кнопкой «Поделиться номером»
  if (!fromId || contact.user_id !== fromId) { await tg.send(chatId, tr(lang, "loginWrong"), contactKeyboard(lang)); return { done: false, linkedChat: false }; }
  const phone = normalizePhone(contact.phone_number);
  if (!phone || !TOKEN.test(token)) return fail("loginErr");

  const { data: row } = await db.from("telegram_logins").select("status, expires_at").eq("token", token).maybeSingle();
  if (!row || row.status !== "pending" || new Date(row.expires_at as string) < new Date()) return fail("loginExpired");

  // 1) чат уже привязан к аккаунту; 2) аккаунт с этим номером; 3) новый аккаунт
  let userId: string | null = null;
  let email: string | null = null;
  const { data: link } = await db.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (link) userId = link.user_id as string;
  if (!userId) {
    const { data: found } = await db.rpc("find_user_by_phone", { p_phone: phone });
    const f = Array.isArray(found) ? found[0] : null;
    if (f) { userId = f.id as string; email = f.email as string | null; }
  }
  if (userId && !email) {
    const { data: u } = await db.auth.admin.getUserById(userId);
    email = u.user?.email ?? null;
  }
  if (!userId) {
    const syntheticEmail = `p${phone}@phone.tartib.uk`;
    const meta = { name: (contact.first_name ?? "").slice(0, 60), phone: `+${phone}`, via: "telegram" };
    let created = await db.auth.admin.createUser({ email: syntheticEmail, email_confirm: true, phone: `+${phone}`, phone_confirm: true, user_metadata: meta });
    if (created.error) created = await db.auth.admin.createUser({ email: syntheticEmail, email_confirm: true, user_metadata: meta });
    if (created.error || !created.data.user) { console.error("createUser failed", created.error?.message); return fail("loginErr"); }
    userId = created.data.user.id;
    email = syntheticEmail;
  }
  if (!email) return fail("loginErr");

  const { data: gen, error: genErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hash = gen?.properties?.hashed_token;
  if (genErr || !hash) { console.error("generateLink failed", genErr?.message); return fail("loginErr"); }
  await db.from("telegram_logins").update({ status: "approved", token_hash: hash }).eq("token", token);

  // Привязываем чат к аккаунту, если ни у чата, ни у аккаунта привязки ещё нет: бот сразу работает
  let linkedChat = !!link;
  if (!link) {
    const { data: mine } = await db.from("telegram_links").select("chat_id").eq("user_id", userId).maybeSingle();
    if (!mine) {
      const { error } = await db.from("telegram_links").insert({ user_id: userId, chat_id: chatId, reminders: true });
      linkedChat = !error;
    }
  }
  return { done: true, linkedChat };
}
