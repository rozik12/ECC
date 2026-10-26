// Маршрутизатор Telegram: стоит перед основным ботом (telegram-bot). Команды сайта (/metals, /support, /messages, /site, /channel)
// обрабатывает сам, всё остальное один в один передаёт основному боту. Если что-то пошло не так, передаёт основному боту и их.
// Чтобы вернуть прежнюю схему, достаточно снова направить webhook Telegram на функцию telegram-bot.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchMetals, messagesScreen, metalsScreen, siteScreen, SUPPORT_MAX, supportDone, supportUsage, type Lang, type Screen } from "./extras.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const BOT_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-bot`;
const TEST_CHAT_MIN = 900_000_000_000;
const MINE = new Set(["/metals", "/support", "/messages", "/site", "/channel"]);

type Cfg = { token: string; secret: string };
let cfg: Cfg | null = null;
async function config(): Promise<Cfg> {
  if (cfg) return cfg;
  const { data, error } = await db.from("bot_config").select("key, value");
  if (error || !data) throw new Error("config unavailable");
  const m = Object.fromEntries(data.map((r) => [r.key as string, r.value as string]));
  if (!m.telegram_token || !m.webhook_secret) throw new Error("config incomplete");
  cfg = { token: m.telegram_token, secret: m.webhook_secret };
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

async function forward(raw: string, secret: string): Promise<Response> {
  const r = await fetch(BOT_URL, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: raw });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "text/plain" } });
}

async function reply(token: string, chatId: number, s: Screen, out: unknown[]) {
  if (chatId >= TEST_CHAT_MIN) return void out.push({ op: "send", chat_id: chatId, text: s.text, markup: s.kb });
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: s.text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: s.kb }),
  });
  if (!r.ok) console.error("[router] sendMessage failed", r.status);
}

/** Возвращает true, если команду обработали здесь. */
async function handle(msg: Msg, cmd: string, rest: string, token: string, out: unknown[]): Promise<boolean> {
  const chatId = msg.chat.id;
  const { data: link } = await db.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!link) return false; // не подключён: основной бот ответит про подключение
  const userId = link.user_id as string;
  const { data: prof } = await db.from("profiles").select("language, handle").eq("id", userId).maybeSingle();
  const lang = langOf(prof?.language ?? msg.from?.language_code);

  if (cmd === "/metals") return await reply(token, chatId, metalsScreen(lang, await fetchMetals()), out), true;
  if (cmd === "/site" || cmd === "/channel") return await reply(token, chatId, siteScreen(lang), out), true;
  if (cmd === "/messages") {
    if (!prof?.handle) return await reply(token, chatId, messagesScreen(lang, false, 0, 0), out), true;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  let c: Cfg;
  try { c = await config(); } catch { return new Response("config", { status: 500 }); }
  if (!same(req.headers.get("x-telegram-bot-api-secret-token"), c.secret)) return new Response("forbidden", { status: 403 });

  const raw = await req.text();
  try {
    const up = JSON.parse(raw) as { message?: Msg };
    const msg = up.message;
    const text = msg?.text?.trim().slice(0, 2500) ?? "";
    if (msg && msg.chat.type === "private" && text.startsWith("/")) {
      const [first, ...words] = text.split(/\s+/);
      const cmd = first.split("@")[0].toLowerCase();
      if (MINE.has(cmd)) {
        const out: unknown[] = [];
        if (await handle(msg, cmd, words.join(" "), c.token, out)) return new Response(JSON.stringify({ ok: true, out }), { headers: { "content-type": "application/json" } });
      }
    }
  } catch (e) {
    console.error("[router] fallback to bot:", e instanceof Error ? e.message : e);
  }
  return forward(raw, c.secret);
});
