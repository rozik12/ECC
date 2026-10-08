// Telegram-бот Tartib. Работает как функция Supabase рядом с базой.
// Бот использует права сервиса, поэтому КАЖДЫЙ запрос к данным явно ограничен user_id владельца чата.
import { createClient } from "npm:@supabase/supabase-js@2";
import { calculatePnl, tradeMetrics } from "./calc.ts";
import { inferMarket } from "./market.ts";
import { langOf, T, type Lang } from "./messages.ts";
import { parseTradeMessage } from "./parse.ts";
import { evaluateRules, type RuleLike } from "./rules.ts";
import { dayBounds, safeTimeZone } from "./time.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Config = { telegram_token: string; webhook_secret: string; cron_secret: string };
let cached: Config | null = null;

async function config(): Promise<Config> {
  if (cached) return cached;
  const { data, error } = await db.from("bot_config").select("key, value");
  if (error || !data) throw new Error("config unavailable");
  const map = Object.fromEntries(data.map((r) => [r.key as string, r.value as string]));
  if (!map.telegram_token || !map.webhook_secret || !map.cron_secret) throw new Error("config incomplete");
  cached = map as unknown as Config;
  return cached;
}

function same(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function send(chatId: number, text: string) {
  const { telegram_token } = await config();
  await fetch(`https://api.telegram.org/bot${telegram_token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500), disable_web_page_preview: true }),
  });
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const money = (n: number, cur: string) => `${n >= 0 ? "+" : ""}${round(n)} ${cur}`;

type Linked = { userId: string; chatId: number; lang: Lang; tz: string };

async function getLinked(chatId: number): Promise<Linked | null> {
  const { data: link } = await db.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!link) return null;
  const { data: profile } = await db.from("profiles").select("language, timezone").eq("id", link.user_id).maybeSingle();
  return { userId: link.user_id as string, chatId, lang: langOf(profile?.language), tz: safeTimeZone(profile?.timezone) };
}

async function linkWithCode(chatId: number, payload: string, fallbackLang: Lang) {
  const code = payload.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const { data: row } = code
    ? await db.from("telegram_link_codes").select("user_id, expires_at").eq("code", code).maybeSingle()
    : { data: null };
  if (!row || new Date(row.expires_at as string) < new Date()) return send(chatId, T[fallbackLang].codeInvalid);
  const userId = row.user_id as string;
  await db.from("telegram_link_codes").delete().eq("user_id", userId); // код одноразовый
  await db.from("telegram_links").delete().eq("chat_id", chatId); // этот чат может принадлежать только одному аккаунту
  const { error } = await db
    .from("telegram_links")
    .upsert({ user_id: userId, chat_id: chatId, reminders: true, last_reminder_at: null }, { onConflict: "user_id" });
  if (error) return send(chatId, T[fallbackLang].error);
  const { data: profile } = await db.from("profiles").select("language").eq("id", userId).maybeSingle();
  return send(chatId, T[langOf(profile?.language)].linked);
}

async function saveTrade(u: Linked, t: Extract<ReturnType<typeof parseTradeMessage>, { ok: true }>["trade"]) {
  const m = T[u.lang];
  const { data: accounts } = await db
    .from("trading_accounts")
    .select("id, name, currency, starting_balance")
    .eq("user_id", u.userId)
    .order("created_at");
  const account = accounts?.[0];
  if (!account) return send(u.chatId, m.noAccount);

  const accountIds = (accounts ?? []).map((a) => a.id as string);
  const { data: balances } = await db.from("account_balances").select("account_id, balance").eq("user_id", u.userId).in("account_id", accountIds);
  const balanceOf = new Map((balances ?? []).map((b) => [b.account_id as string, Number(b.balance)]));
  const totalBalance = (accounts ?? []).reduce((s, a) => s + (balanceOf.get(a.id as string) ?? Number(a.starting_balance)), 0);
  const accountBalance = balanceOf.get(account.id as string) ?? Number(account.starting_balance);

  const { data: ruleRows } = await db
    .from("rules")
    .select("id, name, rule_type, value, is_active")
    .eq("user_id", u.userId);
  const rules = (ruleRows ?? []).map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) })) as RuleLike[];

  const now = new Date();
  const { start, end } = dayBounds(u.tz, now);
  const { data: dayRows } = await db
    .from("trades")
    .select("id, traded_at, pnl")
    .eq("user_id", u.userId)
    .gte("traded_at", start.toISOString());
  const rows = (dayRows ?? []).map((r) => ({ at: new Date(r.traded_at as string), pnl: Number(r.pnl) })).filter((r) => r.at < end);
  const dayStartBalance = totalBalance - (dayRows ?? []).reduce((s, r) => s + Number(r.pnl), 0);
  const lossSoFar = Math.max(0, -rows.filter((r) => r.at < now).reduce((s, r) => s + r.pnl, 0));
  const dayLossPercent = dayStartBalance > 0 ? (lossSoFar / dayStartBalance) * 100 : null;

  const metrics = tradeMetrics({ entry: t.entry, stop: t.stop, takeProfit: t.takeProfit, size: t.size });
  const riskPercent = metrics.riskAmount !== null && accountBalance > 0 ? round((metrics.riskAmount / accountBalance) * 100, 4) : null;

  const checks = evaluateRules(rules, {
    riskPercent,
    riskReward: metrics.riskReward,
    leverage: t.leverage ?? 1,
    hasStopLoss: t.stop !== null,
    tradesToday: rows.length + 1,
    dayLossPercent,
  });
  const violated = checks.filter((c) => c.status === "violated");
  const pnl = t.exit !== null ? calculatePnl(t.direction, t.entry, t.exit, t.size) : 0;
  const market = inferMarket(t.instrument);

  const { data: inserted, error } = await db
    .from("trades")
    .insert({
      user_id: u.userId,
      account_id: account.id,
      instrument: t.instrument,
      market,
      direction: t.direction,
      entry_price: t.entry,
      exit_price: t.exit,
      stop_loss: t.stop,
      take_profit: t.takeProfit,
      position_size: t.size,
      leverage: t.leverage ?? 1,
      risk_percent: riskPercent,
      risk_amount: metrics.riskAmount === null ? null : round(metrics.riskAmount),
      potential_profit: metrics.potentialProfit === null ? null : round(metrics.potentialProfit),
      potential_loss: metrics.potentialLoss === null ? null : round(metrics.potentialLoss),
      pnl: round(pnl),
      fees: 0,
      emotion: t.emotion ?? "calm",
      strategy: "",
      rules_followed: violated.length === 0,
      reason: "",
      plan: "",
      comment: "",
      traded_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error?.message?.includes("plan_limit_trades")) return send(u.chatId, m.limitTrades);
  if (error || !inserted) return send(u.chatId, m.error);

  if (violated.length > 0) {
    const { error: vErr } = await db.from("trade_rule_violations").insert(violated.map((c) => ({ trade_id: inserted.id, rule_id: c.rule.id })));
    if (vErr) {
      await db.from("trades").delete().eq("id", inserted.id).eq("user_id", u.userId);
      return send(u.chatId, m.error);
    }
  }

  const line =
    `${t.instrument} ${t.direction.toUpperCase()} · ${t.entry} × ${t.size}` +
    (t.stop !== null ? ` · stop ${t.stop}` : "") +
    (t.exit !== null ? `\nP&L: ${money(pnl, account.currency as string)}` : "");
  const rulesLine = violated.length === 0 ? m.rulesOk : m.rulesBroken(violated.map((c) => c.rule.name).join(", "));
  return send(u.chatId, `${m.saved(line)}\n${rulesLine}\n\n${m.more}`);
}

async function today(u: Linked) {
  const m = T[u.lang];
  const { start } = dayBounds(u.tz);
  const [{ data: rows }, { data: acc }] = await Promise.all([
    db.from("trades").select("pnl, rules_followed").eq("user_id", u.userId).gte("traded_at", start.toISOString()),
    db.from("trading_accounts").select("currency").eq("user_id", u.userId).order("created_at").limit(1),
  ]);
  if (!rows || rows.length === 0) return send(u.chatId, m.noTradesToday);
  const pnl = rows.reduce((s, r) => s + Number(r.pnl), 0);
  const followed = rows.filter((r) => r.rules_followed).length;
  return send(u.chatId, m.today(rows.length, followed, money(pnl, (acc?.[0]?.currency as string) ?? "")));
}

async function handleMessage(msg: { chat: { id: number }; text: string; from?: { language_code?: string } }) {
  const chatId = msg.chat.id;
  const text = msg.text.trim().slice(0, 500);
  const fallback = langOf(msg.from?.language_code);
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith("/") ? cmdRaw.split("@")[0].toLowerCase() : "";

  if (cmd === "/start" && rest[0]) return linkWithCode(chatId, rest[0], fallback);

  const u = await getLinked(chatId);
  if (!u) return send(chatId, cmd === "/start" ? T[fallback].startHelp : T[fallback].needLink);
  const m = T[u.lang];

  switch (cmd) {
    case "/start":
    case "/help":
      return send(chatId, m.help);
    case "/today":
      return today(u);
    case "/unlink":
      await db.from("telegram_links").delete().eq("user_id", u.userId);
      return send(chatId, m.unlinked);
    case "/reminders": {
      const v = rest[0]?.toLowerCase();
      if (v !== "on" && v !== "off") return send(chatId, m.remindersUsage);
      await db.from("telegram_links").update({ reminders: v === "on" }).eq("user_id", u.userId);
      return send(chatId, v === "on" ? m.remindersOn : m.remindersOff);
    }
  }
  if (cmd) return send(chatId, m.help);

  const parsed = parseTradeMessage(text);
  if (!parsed.ok) return send(chatId, `${m.missing[parsed.missing]}\n\n${m.example}`);
  return saveTrade(u, parsed.trade);
}

// Напоминания: раз в час вызывается по расписанию. Пишем только в дневное время пользователя и не чаще раза в 3 дня.
async function runReminders() {
  const DAY = 24 * 3600 * 1000;
  const { data: links } = await db.from("telegram_links").select("user_id, chat_id, last_reminder_at").eq("reminders", true);
  let sent = 0;
  for (const l of links ?? []) {
    const { data: profile } = await db.from("profiles").select("language, timezone").eq("id", l.user_id).maybeSingle();
    const tz = safeTimeZone(profile?.timezone);
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (hour < 10 || hour >= 20) continue;
    if (l.last_reminder_at && Date.now() - new Date(l.last_reminder_at as string).getTime() < 3 * DAY) continue;
    const { data: last } = await db.from("trades").select("traded_at").eq("user_id", l.user_id).order("traded_at", { ascending: false }).limit(1);
    if (!last || last.length === 0) continue;
    const days = Math.floor((Date.now() - new Date(last[0].traded_at as string).getTime()) / DAY);
    if (days < 3) continue;
    await send(l.chat_id as number, T[langOf(profile?.language)].reminder(days));
    await db.from("telegram_links").update({ last_reminder_at: new Date().toISOString() }).eq("user_id", l.user_id);
    sent++;
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const cfg = await config();
    const path = new URL(req.url).pathname;
    if (path.endsWith("/cron")) {
      if (!same(req.headers.get("x-cron-secret"), cfg.cron_secret)) return new Response("forbidden", { status: 403 });
      return Response.json({ sent: await runReminders() });
    }
    if (!same(req.headers.get("x-telegram-bot-api-secret-token"), cfg.webhook_secret)) return new Response("forbidden", { status: 403 });

    const update = await req.json();
    const msg = update?.message;
    if (msg && typeof msg.text === "string" && msg.chat?.type === "private") {
      try {
        await handleMessage(msg);
      } catch (e) {
        console.error("handler error", e instanceof Error ? e.message : e);
        await send(msg.chat.id, T[langOf(msg.from?.language_code)].error).catch(() => {});
      }
    }
  } catch (e) {
    console.error("fatal", e instanceof Error ? e.message : e);
  }
  // Telegram всегда получает 200, иначе он будет повторять доставку
  return new Response("ok");
});
