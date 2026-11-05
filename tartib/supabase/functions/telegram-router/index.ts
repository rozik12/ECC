// Маршрутизатор Telegram: стоит перед основным ботом (telegram-bot). Команды сайта (/metals, /support, /messages, /invite, /site, /channel)
// и проверку подписки на канал обрабатывает сам, всё остальное один в один передаёт основному боту. Если что-то пошло не так, передаёт основному боту.
// Сразу после привязки аккаунта предлагает подписаться на канал (по желанию человека, ссылка источника «bot»).
// Чтобы вернуть прежнюю схему, достаточно снова направить webhook Telegram на функцию telegram-bot.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  channelCheckScreen, channelInviteScreen, CHANNEL_URL, fetchMetals, inviteScreen, isMemberStatus, messagesScreen, metalsScreen, siteScreen,
  SUPPORT_MAX, supportDone, supportUsage, type Lang, type Screen,
} from "./extras.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const BOT_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-bot`;
const TEST_CHAT_MIN = 900_000_000_000;
const SITE = "https://tartib.uk";
const MINE = new Set(["/metals", "/support", "/messages", "/invite", "/site", "/channel"]);

type Cfg = { token: string; secret: string; channelId: string | null };
let cfg: Cfg | null = null;
async function config(): Promise<Cfg> {
  if (cfg) return cfg;
  const { data, error } = await db.from("bot_config").select("key, value");
  if (error || !data) throw new Error("config unavailable");
  const m = Object.fromEntries(data.map((r) => [r.key as string, r.value as string]));
  if (!m.telegram_token || !m.webhook_secret) throw new Error("config incomplete");
  cfg = { token: m.telegram_token, secret: m.webhook_secret, channelId: m.channel_id ?? null };
  return cfg;
}

function same(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const langOf = (code: unknown): Lang => (code === "ru" || code === "uz" ? code : "en");

type Msg = { chat: { id: number; type: string }; text?: string; from?: { language_code?: string } };
type Callback = { id: string; data?: string; from?: { id?: number; language_code?: string }; message?: { chat: { id: number; type: string } } };

async function forward(raw: string, secret: string): Promise<Response> {
  const r = await fetch(BOT_URL, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: raw });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "text/plain" } });
}

async function tgCall(token: string, method: string, body: unknown): Promise<{ ok?: boolean; result?: unknown } | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch {
    return null;
  }
}

async function reply(token: string, chatId: number, s: Screen, out: unknown[]) {
  if (chatId >= TEST_CHAT_MIN) return void out.push({ op: "send", chat_id: chatId, text: s.text, markup: s.kb });
  const r = await tgCall(token, "sendMessage", { chat_id: chatId, text: s.text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: s.kb });
  if (!r?.ok) console.error("[router] sendMessage failed");
}

async function userLang(chatId: number, fallback?: string): Promise<{ userId: string | null; lang: Lang; handle: string | null; code: string | null }> {
  const { data: link } = await db.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!link) return { userId: null, lang: langOf(fallback), handle: null, code: null };
  const userId = link.user_id as string;
  const { data: prof } = await db.from("profiles").select("language, handle, referral_code").eq("id", userId).maybeSingle();
  return { userId, lang: langOf(prof?.language ?? fallback), handle: (prof?.handle as string | null) ?? null, code: (prof?.referral_code as string | null) ?? null };
}

const sourceUrl = async (src: string) => {
  const { data } = await db.from("channel_links").select("url").eq("source", src).maybeSingle();
  return typeof data?.url === "string" ? data.url : CHANNEL_URL;
};

/** Возвращает true, если команду обработали здесь. */
async function handle(msg: Msg, cmd: string, rest: string, token: string, out: unknown[]): Promise<boolean> {
  const chatId = msg.chat.id;
  const u = await userLang(chatId, msg.from?.language_code);
  if (!u.userId) return false; // не подключён: основной бот ответит про подключение
  const { userId, lang } = u;

  if (cmd === "/metals") return await reply(token, chatId, metalsScreen(lang, await fetchMetals()), out), true;
  if (cmd === "/site" || cmd === "/channel") return await reply(token, chatId, siteScreen(lang), out), true;
  if (cmd === "/invite") {
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId);
    return await reply(token, chatId, inviteScreen(lang, u.code ? `${SITE}/r/${u.code}` : null, count ?? 0), out), true;
  }
  if (cmd === "/messages") {
    if (!u.handle) return await reply(token, chatId, messagesScreen(lang, false, 0, 0), out), true;
    const { data } = await db.rpc("bot_chat_unread", { p_user: userId });
    const row = Array.isArray(data) ? data[0] : data;
    return await reply(token, chatId, messagesScreen(lang, true, Number(row?.total ?? 0), Number(row?.chats ?? 0)), out), true;
  }
  if (cmd === "/support") {
    const body = rest.trim();
    if (!body) return await reply(token, chatId, supportUsage(lang), out), true;
    if (body.length > SUPPORT_MAX) return await reply(token, chatId, supportDone(lang, "supportLong"), out), true;
    const { error } = await db.from("support_messages").insert({ user_id: userId, from_admin: false, body });
    const key = !error ? "supportSent" : /limit|too many|rate/i.test(error.message) ? "supportLimit" : "supportErr";
    return await reply(token, chatId, supportDone(lang, key), out), true;
  }
  return false;
}

/** Кнопка «Я подписался»: проверяем участие в канале и отвечаем. */
async function checkSubscription(cb: Callback, c: Cfg): Promise<void> {
  const chatId = cb.message?.chat.id;
  const userId = cb.from?.id;
  if (!chatId || !userId) return;
  const { lang } = await userLang(chatId, cb.from?.language_code);
  let result: "ok" | "no" | "unknown" = "unknown";
  if (c.channelId) {
    const r = await tgCall(c.token, "getChatMember", { chat_id: c.channelId, user_id: userId });
    result = r?.ok ? (isMemberStatus((r.result as { status?: string } | undefined)?.status) ? "ok" : "no") : "unknown";
  }
  await tgCall(c.token, "answerCallbackQuery", { callback_query_id: cb.id });
  await reply(c.token, chatId, channelCheckScreen(lang, result, await sourceUrl("bot")), []);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  let c: Cfg;
  try { c = await config(); } catch { return new Response("config", { status: 500 }); }
  if (!same(req.headers.get("x-telegram-bot-api-secret-token"), c.secret)) return new Response("forbidden", { status: 403 });

  const raw = await req.text();
  let linkedBefore: boolean | null = null;
  let startChat = 0;
  let startLang: string | undefined;
  try {
    const up = JSON.parse(raw) as { message?: Msg; callback_query?: Callback };
    const cb = up.callback_query;
    if (cb?.data === "ch:check" && cb.message?.chat.type === "private" && cb.message.chat.id < TEST_CHAT_MIN) {
      await checkSubscription(cb, c);
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }
    const msg = up.message;
    const text = msg?.text?.trim().slice(0, 2500) ?? "";
    if (msg && msg.chat.type === "private" && text.startsWith("/")) {
      const [first, ...words] = text.split(/\s+/);
      const cmd = first.split("@")[0].toLowerCase();
      if (MINE.has(cmd)) {
        const out: unknown[] = [];
        if (await handle(msg, cmd, words.join(" "), c.token, out)) return new Response(JSON.stringify({ ok: true, out }), { headers: { "content-type": "application/json" } });
      }
      // «/start КОД»: возможно, человек сейчас привяжет аккаунт; запоминаем, был ли он привязан до этого
      if (cmd === "/start" && words.length > 0 && msg.chat.id < TEST_CHAT_MIN) {
        const { data } = await db.from("telegram_links").select("user_id").eq("chat_id", msg.chat.id).maybeSingle();
        linkedBefore = !!data;
        startChat = msg.chat.id;
        startLang = msg.from?.language_code;
      }
    }
  } catch (e) {
    console.error("[router] fallback to bot:", e instanceof Error ? e.message : e);
  }

  const res = await forward(raw, c.secret);
  // Если аккаунт только что привязан, один раз предлагаем канал (человек сам решает, подписываться ли)
  if (linkedBefore === false) {
    try {
      const u = await userLang(startChat, startLang);
      if (u.userId) await reply(c.token, startChat, channelInviteScreen(u.lang, await sourceUrl("bot")), []);
    } catch (e) {
      console.error("[router] channel invite failed:", e instanceof Error ? e.message : e);
    }
  }
  return res;
});
