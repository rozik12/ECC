// Telegram-бот Tartib. Работает как функция Supabase рядом с базой данных.
// Бот действует с правами сервиса, поэтому все запросы к данным ограничены владельцем чата (см. db.ts).
import {
  activeAccount, closeTrade, countTrades, createTrade, db, deleteTrade, fetchTrades, getLinked, getTrade, listAccounts, listRules, loadState, periodStart,
  recentInstruments, recentStrategies, saveState, toggleRule, toggleViolation, updateTradeFields, type Linked, type NewTrade, type State,
} from "./db.ts";
import { parseTradeMessage } from "./parse.ts";
import { dayBounds, safeTimeZone } from "./time.ts";
import { Tg } from "./tg.ts";
import { emotionKeys, emotionLabel, langOf, menuAction, tr, type Lang } from "./text.ts";
import * as ui from "./ui.ts";
import { disciplineStreak, summarize, topViolations } from "./stats.ts";

// ---------- настройки бота ----------
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

// ---------- контекст запроса ----------
type Ctx = { tg: Tg; chatId: number; u: Linked; st: State; lang: Lang; msgId?: number; cur?: string };

const show = (c: Ctx, s: ui.Screen) => (c.msgId ? c.tg.edit(c.chatId, c.msgId, s.text, s.kb) : c.tg.send(c.chatId, s.text, s.kb));
const say = (c: Ctx, s: ui.Screen) => c.tg.send(c.chatId, s.text, s.kb);
const menuKb = (lang: Lang) => ui.mainMenu(lang).kb;

async function currency(c: Ctx): Promise<string> {
  if (c.cur) return c.cur;
  const accs = await listAccounts(c.u.userId);
  c.cur = activeAccount(c.u, accs)?.currency ?? "USD";
  return c.cur;
}

const parseNum = (t: string): number | null => {
  const v = Number(t.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};

// ---------- запись сделки ----------
async function afterSave(c: Ctx, r: Extract<Awaited<ReturnType<typeof createTrade>>, { ok: true }>) {
  const { trade } = r;
  const line = ui.tradeLine(c.lang, trade) + (trade.exit !== null ? `\nP&amp;L: ${ui.money(trade.pnl, r.currency, c.lang, true)}` : "");
  const rules = r.violated.length === 0 ? tr(c.lang, "rulesOk") : tr(c.lang, "rulesBroken", { names: ui.esc(r.violated.join(", ")) });
  const extra = [
    ...r.warnings.map((w) => tr(c.lang, w.key, w.vars)),
    ...(r.milestone ? [tr(c.lang, "streakMilestone", { n: r.milestone })] : []),
    ...r.newAch.map((id) => tr(c.lang, "newAch", { name: tr(c.lang, `ach_${id}`) })),
  ];
  await say(c, { text: [tr(c.lang, "saved", { line, rules }), ...extra].join("\n\n"), kb: ui.savedActions(c.lang, trade) });
}

async function saveAndReport(c: Ctx, t: NewTrade) {
  const r = await createTrade(c.u, t);
  if (!r.ok) return say(c, { text: tr(c.lang, r.error), kb: menuKb(c.lang) });
  return afterSave(c, r);
}

// ---------- мастер новой сделки ----------
const ORDER = ["instrument", "direction", "entry", "size", "stop", "exit", "emotion", "confirm"];

async function wizShow(c: Ctx) {
  const w = c.st.w;
  if (!w) return show(c, ui.mainMenu(c.lang));
  if (w.step === "confirm") return show(c, ui.wizardConfirm(c.lang, w.d as ui.Draft));
  return show(c, ui.wizardScreen(c.lang, w.step, c.st.recent ?? []));
}

async function startWizard(c: Ctx, pre: Record<string, unknown> = {}, step = "instrument", rep = false) {
  c.st.recent = await recentInstruments(c.u.userId);
  c.st.p = undefined;
  c.st.w = { step, d: pre, rep };
  c.msgId = undefined; // мастер всегда в новом сообщении, чтобы не терять историю
  await wizShow(c);
}

function wizAdvance(c: Ctx) {
  const w = c.st.w!;
  if (w.edit || (w.rep && w.step === "entry")) w.step = "confirm";
  else w.step = ORDER[ORDER.indexOf(w.step) + 1] ?? "confirm";
  w.edit = false;
}

async function wizSet(c: Ctx, value: unknown) {
  const w = c.st.w!;
  w.d[w.step === "emotion" ? "emotion" : w.step] = value;
  wizAdvance(c);
  await wizShow(c);
}

async function wizText(c: Ctx, text: string) {
  const w = c.st.w!;
  if (w.step === "instrument") {
    const v = text.trim().toUpperCase().replace(/\//g, "");
    if (!/^[A-Z0-9._-]{2,20}$/.test(v)) return say(c, { text: tr(c.lang, "missing_instrument") });
    return wizSet(c, v);
  }
  if (["entry", "size", "stop", "exit"].includes(w.step)) {
    const n = parseNum(text);
    if (n === null) return say(c, { text: tr(c.lang, "wizBad") });
    return wizSet(c, n);
  }
  return say(c, ui.wizardScreen(c.lang, w.step, c.st.recent ?? []));
}

async function wizCallback(c: Ctx, parts: string[]) {
  const w = c.st.w;
  const [op, arg] = parts;
  if (op === "cancel") {
    c.st.w = undefined;
    return show(c, { text: tr(c.lang, "wizCancelled"), kb: menuKb(c.lang) });
  }
  if (!w) return show(c, ui.mainMenu(c.lang));
  switch (op) {
    case "i": { const v = c.st.recent?.[Number(arg)]; return v ? wizSet(c, v) : wizShow(c); }
    case "d": return arg === "long" || arg === "short" ? wizSet(c, arg) : wizShow(c);
    case "e": return (emotionKeys as readonly string[]).includes(arg) ? wizSet(c, arg) : wizShow(c);
    case "skip": return w.step === "stop" || w.step === "exit" ? wizSet(c, null) : wizShow(c);
    case "edit": return show(c, ui.wizardEdit(c.lang));
    case "review": w.step = "confirm"; return wizShow(c);
    case "f": if (["instrument", "direction", "entry", "size", "stop", "exit", "emotion"].includes(arg)) { w.step = arg; w.edit = true; } return wizShow(c);
    case "save": {
      const d = w.d as ui.Draft;
      if (!d.instrument || !d.direction || d.entry === undefined || d.size === undefined) { w.step = "instrument"; return wizShow(c); }
      c.st.w = undefined;
      await show(c, { text: `✅ ${ui.draftSummary(c.lang, d)}` });
      c.msgId = undefined;
      return saveAndReport(c, { instrument: d.instrument, direction: d.direction, entry: d.entry, size: d.size, stop: d.stop ?? null, tp: null, exit: d.exit ?? null, leverage: null, emotion: d.emotion ?? "calm" });
    }
  }
}

// ---------- карточки и действия над сделкой ----------
async function showCard(c: Ctx, id: string, prefix = "") {
  const t = await getTrade(c.u.userId, id);
  if (!t) return show(c, { text: tr(c.lang, "notFound"), kb: menuKb(c.lang) });
  const cur = await currency(c);
  return show(c, { text: prefix + ui.tradeCard(c.lang, t, cur, c.u.tz), kb: ui.tradeActions(c.lang, t) });
}

async function showList(c: Ctx, kind: "l" | "o", page: number) {
  const open = kind === "o";
  const total = await countTrades(c.u.userId, open);
  const pages = Math.max(1, Math.ceil(total / ui.PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const rows = await fetchTrades(c.u.userId, { limit: ui.PAGE_SIZE, offset: p * ui.PAGE_SIZE, openOnly: open });
  return show(c, ui.tradesList(c.lang, rows, p, total, await currency(c), kind));
}

async function tradeCallback(c: Ctx, k: string, parts: string[]) {
  const id = parts[0];
  const uid = c.u.userId;
  const t = await getTrade(uid, id);
  if (!t) return show(c, { text: tr(c.lang, "notFound"), kb: menuKb(c.lang) });
  switch (k) {
    case "t": c.st.p = undefined; return showCard(c, id);
    case "tc":
      if (t.exit !== null) return show(c, { text: tr(c.lang, "notOpen"), kb: menuKb(c.lang) });
      c.st.p = { kind: "close", id };
      return say(c, { text: tr(c.lang, "closeAsk", { instrument: ui.esc(t.instrument) }), kb: { inline_keyboard: [[{ text: tr(c.lang, "cancel"), callback_data: `t:${id}` }]] } });
    case "td": return show(c, ui.deleteAsk(c.lang, t));
    case "tdy": {
      await deleteTrade(uid, id);
      return show(c, { text: tr(c.lang, "deleted"), kb: { inline_keyboard: [[{ text: tr(c.lang, "mLast"), callback_data: "l:0" }], [{ text: tr(c.lang, "menu"), callback_data: "m:menu" }]] } });
    }
    case "te": return show(c, { text: tr(c.lang, "emotionAsk"), kb: ui.emotionPicker(c.lang, `tes:${id}:`, `t:${id}`) });
    case "tes": {
      const e = parts[1];
      if ((emotionKeys as readonly string[]).includes(e)) await updateTradeFields(uid, id, { emotion: e });
      return showCard(c, id, `${tr(c.lang, "emotionSaved", { name: emotionLabel(c.lang, e) })}\n\n`);
    }
    case "tm":
      c.st.p = { kind: "comment", id };
      return say(c, { text: tr(c.lang, "commentAsk"), kb: { inline_keyboard: [[{ text: tr(c.lang, "cancel"), callback_data: `t:${id}` }]] } });
    case "ts":
      c.st.p = { kind: "strategy", id };
      c.st.strategies = await recentStrategies(uid);
      return say(c, { text: tr(c.lang, "strategyAsk"), kb: ui.strategyPicker(c.lang, c.st.strategies, id) });
    case "tss": {
      const s = c.st.strategies?.[Number(parts[1])];
      c.st.p = undefined;
      if (s) await updateTradeFields(uid, id, { strategy: s.slice(0, 40) });
      return showCard(c, id, s ? `${tr(c.lang, "strategySaved", { name: ui.esc(s) })}\n\n` : "");
    }
    case "tr": {
      const custom = (await listRules(uid)).filter((r) => r.rule_type === "custom");
      c.st.customRules = custom.map((r) => r.id);
      return show(c, ui.rulesMark(c.lang, id, custom, new Set(t.violations.map((v) => v.id))));
    }
    case "trt": {
      const ruleId = c.st.customRules?.[Number(parts[1])];
      if (ruleId) await toggleViolation(uid, id, ruleId);
      const custom = (await listRules(uid)).filter((r) => r.rule_type === "custom");
      c.st.customRules = custom.map((r) => r.id);
      const fresh = await getTrade(uid, id);
      return show(c, ui.rulesMark(c.lang, id, custom, new Set((fresh?.violations ?? []).map((v) => v.id))));
    }
  }
}

/** Ответ пользователя на вопрос бота (цена выхода, комментарий, стратегия). */
async function pendingText(c: Ctx, text: string) {
  const p = c.st.p!;
  const t = await getTrade(c.u.userId, p.id);
  c.st.p = undefined;
  if (!t) return say(c, { text: tr(c.lang, "notFound"), kb: menuKb(c.lang) });
  if (p.kind === "close") {
    const exit = parseNum(text);
    if (exit === null) { c.st.p = p; return say(c, { text: tr(c.lang, "wizBad") }); }
    const closed = await closeTrade(c.u.userId, t, exit);
    if (!closed) return say(c, { text: tr(c.lang, "error"), kb: menuKb(c.lang) });
    const cur = await currency(c);
    return say(c, { text: tr(c.lang, "closed", { instrument: ui.esc(t.instrument), pnl: ui.money(closed.pnl, cur, c.lang, true) }), kb: ui.savedActions(c.lang, closed) });
  }
  if (p.kind === "comment") {
    await updateTradeFields(c.u.userId, p.id, { comment: text.trim().slice(0, 500) });
    return say(c, { text: tr(c.lang, "commentSaved"), kb: ui.savedActions(c.lang, t) });
  }
  const name = text.trim().slice(0, 40);
  await updateTradeFields(c.u.userId, p.id, { strategy: name });
  return say(c, { text: tr(c.lang, "strategySaved", { name: ui.esc(name) }), kb: ui.savedActions(c.lang, t) });
}

// ---------- статистика ----------
async function statsScreen(c: Ctx, kind: string): Promise<ui.Screen> {
  const uid = c.u.userId;
  const cur = await currency(c);
  const lang = c.lang;
  switch (kind) {
    case "today": return ui.periodReport(lang, "s:today", tr(lang, "todayTitle"), await fetchTrades(uid, { from: periodStart("today", c.u.tz) }), cur);
    case "week": return ui.periodReport(lang, "s:week", tr(lang, "weekTitle"), await fetchTrades(uid, { from: periodStart("week", c.u.tz) }), cur);
    case "month": return ui.periodReport(lang, "s:month", tr(lang, "monthTitle"), await fetchTrades(uid, { from: periodStart("month", c.u.tz) }), cur);
    case "all": return ui.periodReport(lang, "s:all", tr(lang, "allTitle"), await fetchTrades(uid), cur);
    case "disc": return ui.disciplineScreen(lang, await fetchTrades(uid, { from: periodStart("30d", c.u.tz) }), cur);
    case "viol": return ui.violationsScreen(lang, await fetchTrades(uid, { from: periodStart("30d", c.u.tz) }));
    case "emo": return ui.emotionsScreen(lang, await fetchTrades(uid, { from: periodStart("30d", c.u.tz) }), cur);
    case "instr": return ui.instrumentsScreen(lang, await fetchTrades(uid, { from: periodStart("30d", c.u.tz) }), cur);
    case "streak": return ui.streakScreen(lang, await fetchTrades(uid));
    case "goal": return ui.goalScreen(lang, await fetchTrades(uid), c.u.goal, c.u.tz);
    default: return ui.statsMenu(lang);
  }
}

// ---------- счета, правила, настройки ----------
async function showAccounts(c: Ctx) {
  const accs = await listAccounts(c.u.userId);
  c.st.accounts = accs.map((a) => a.id);
  if (accs.length === 0) return show(c, { text: tr(c.lang, "noAccount"), kb: menuKb(c.lang) });
  return show(c, ui.accountsScreen(c.lang, accs, activeAccount(c.u, accs)?.id ?? null));
}
async function showRules(c: Ctx) {
  const rules = await listRules(c.u.userId);
  c.st.rules = rules.map((r) => r.id);
  return show(c, ui.rulesScreen(c.lang, rules));
}
async function showSettings(c: Ctx) {
  const accs = await listAccounts(c.u.userId);
  const link = await getLinked(c.chatId);
  const u = link ?? c.u;
  c.u = u;
  return show(c, ui.settingsScreen(c.lang, { reminders: u.reminders, daily: u.daily, weekly: u.weekly }, activeAccount(u, accs)?.name ?? tr(c.lang, "dash")));
}

async function settingsCallback(c: Ctx, parts: string[]) {
  const uid = c.u.userId;
  const [op, arg] = parts;
  const toggle = async (col: string, cur: boolean) => { await db.from("telegram_links").update({ [col]: !cur }).eq("user_id", uid); c.u = (await getLinked(c.chatId)) ?? c.u; return showSettings(c); };
  switch (op) {
    case "rem": return toggle("reminders", c.u.reminders);
    case "daily": return toggle("daily_summary", c.u.daily);
    case "weekly": return toggle("weekly_report", c.u.weekly);
    case "lang":
      if (arg === "ru" || arg === "uz" || arg === "en") {
        await db.from("profiles").update({ language: arg }).eq("id", uid);
        c.lang = arg;
        c.msgId = undefined;
        await c.tg.send(c.chatId, tr(arg, "langChanged"), ui.replyMenu(arg));
        return say(c, ui.mainMenu(arg));
      }
      return show(c, ui.languagePicker(c.lang));
    case "acc": {
      const id = c.st.accounts?.[Number(arg)];
      if (id) await db.from("telegram_links").update({ active_account_id: id }).eq("user_id", uid);
      c.u = (await getLinked(c.chatId)) ?? c.u;
      return showAccounts(c);
    }
    case "unlink": return show(c, ui.unlinkAsk(c.lang));
    case "unlinkok":
      await db.from("telegram_links").delete().eq("user_id", uid);
      await db.from("telegram_state").delete().eq("chat_id", c.chatId);
      c.st = { rl: c.st.rl };
      return c.tg.send(c.chatId, tr(c.lang, "unlinked"), { remove_keyboard: true });
  }
}

async function exportCsv(c: Ctx) {
  await c.tg.action(c.chatId, "upload_document");
  const rows = await fetchTrades(c.u.userId, { limit: 5000 });
  if (rows.length === 0) return say(c, { text: tr(c.lang, "exportEmpty"), kb: menuKb(c.lang) });
  const date = new Date().toISOString().slice(0, 10);
  await c.tg.doc(c.chatId, `tartib-trades-${date}.csv`, ui.tradesCsv(rows), tr(c.lang, "exportCaption", { n: rows.length }).replace(/<[^>]+>/g, ""));
}

// ---------- повтор последней ----------
async function repeatLast(c: Ctx) {
  const [last] = await fetchTrades(c.u.userId, { limit: 1 });
  if (!last) return say(c, { text: tr(c.lang, "repeatNone"), kb: menuKb(c.lang) });
  return startWizard(c, { instrument: last.instrument, direction: last.direction, size: last.size, stop: last.stop, exit: null, emotion: "calm" }, "entry", true);
}

// ---------- кнопки меню ----------
async function menuCallback(c: Ctx, op: string) {
  switch (op) {
    case "menu": c.st.w = undefined; c.st.p = undefined; return show(c, ui.mainMenu(c.lang));
    case "new": return startWizard(c);
    case "repeat": return repeatLast(c);
    case "stats": return show(c, ui.statsMenu(c.lang));
    case "ach": return show(c, ui.achievementsScreen(c.lang, await fetchTrades(c.u.userId)));
    case "check": return show(c, ui.checklistScreen(c.lang, c.u.checklist, c.st.chk ?? []));
    case "rules": return showRules(c);
    case "acc": return showAccounts(c);
    case "set": return showSettings(c);
  }
}

async function onCallback(c: Ctx, data: string) {
  const [k, ...parts] = data.split(":");
  switch (k) {
    case "m": return menuCallback(c, parts[0]);
    case "n": return wizCallback(c, parts);
    case "l": case "o": return showList(c, k, Number(parts[0]) || 0);
    case "t": case "tc": case "td": case "tdy": case "te": case "tes": case "tm": case "ts": case "tss": case "tr": case "trt": return tradeCallback(c, k, parts);
    case "s": return show(c, await statsScreen(c, parts[0]));
    case "c": return settingsCallback(c, parts);
    case "r": {
      const id = c.st.rules?.[Number(parts[0])];
      if (id) await toggleRule(c.u.userId, id);
      return showRules(c);
    }
    case "k": {
      const chk = new Set(c.st.chk ?? []);
      if (parts[0] === "reset") chk.clear();
      else { const i = Number(parts[0]); if (chk.has(i)) chk.delete(i); else chk.add(i); }
      c.st.chk = [...chk];
      return show(c, ui.checklistScreen(c.lang, c.u.checklist, c.st.chk));
    }
    case "h": return show(c, parts[0] === "menu" ? ui.helpMenu(c.lang) : ui.helpTopic(c.lang, parts[0]));
    case "x": return exportCsv(c);
  }
}

// ---------- текстовые сообщения ----------
const COMMANDS: Record<string, (c: Ctx, arg: string) => Promise<unknown>> = {
  "/menu": async (c) => { await c.tg.send(c.chatId, "🏠", ui.replyMenu(c.lang)); return say(c, ui.mainMenu(c.lang)); },
  "/start": async (c) => { await c.tg.send(c.chatId, "🏠", ui.replyMenu(c.lang)); return say(c, ui.mainMenu(c.lang)); },
  "/help": (c) => say(c, ui.helpMenu(c.lang)),
  "/new": (c) => startWizard(c),
  "/repeat": (c) => repeatLast(c),
  "/stats": (c) => say(c, ui.statsMenu(c.lang)),
  "/today": async (c) => say(c, await statsScreen(c, "today")),
  "/week": async (c) => say(c, await statsScreen(c, "week")),
  "/month": async (c) => say(c, await statsScreen(c, "month")),
  "/discipline": async (c) => say(c, await statsScreen(c, "disc")),
  "/streak": async (c) => say(c, await statsScreen(c, "streak")),
  "/goal": async (c) => say(c, await statsScreen(c, "goal")),
  "/violations": async (c) => say(c, await statsScreen(c, "viol")),
  "/emotions": async (c) => say(c, await statsScreen(c, "emo")),
  "/instruments": async (c) => say(c, await statsScreen(c, "instr")),
  "/achievements": async (c) => say(c, ui.achievementsScreen(c.lang, await fetchTrades(c.u.userId))),
  "/checklist": (c) => say(c, ui.checklistScreen(c.lang, c.u.checklist, c.st.chk ?? [])),
  "/last": async (c) => { c.msgId = undefined; return showList(c, "l", 0); },
  "/open": async (c) => { c.msgId = undefined; return showList(c, "o", 0); },
  "/undo": async (c) => {
    const [last] = await fetchTrades(c.u.userId, { limit: 1 });
    if (!last) return say(c, { text: tr(c.lang, "lastEmpty"), kb: menuKb(c.lang) });
    return say(c, ui.deleteAsk(c.lang, last));
  },
  "/rules": async (c) => { c.msgId = undefined; return showRules(c); },
  "/accounts": async (c) => { c.msgId = undefined; return showAccounts(c); },
  "/settings": async (c) => { c.msgId = undefined; return showSettings(c); },
  "/language": (c) => say(c, ui.languagePicker(c.lang)),
  "/unlink": (c) => say(c, ui.unlinkAsk(c.lang)),
  "/export": exportCsv,
  "/reminders": async (c, arg) => {
    const v = arg.toLowerCase();
    if (v !== "on" && v !== "off") { c.msgId = undefined; return showSettings(c); }
    await db.from("telegram_links").update({ reminders: v === "on" }).eq("user_id", c.u.userId);
    c.u.reminders = v === "on";
    return say(c, { text: tr(c.lang, v === "on" ? "setRem" : "setRem") + ": " + tr(c.lang, v === "on" ? "on" : "off"), kb: menuKb(c.lang) });
  },
};

const LABEL_TO_CMD: Record<string, string> = { kNew: "/new", kToday: "/today", kStats: "/stats", kTrades: "/last", kSettings: "/settings", kHelp: "/help" };

async function onText(c: Ctx, text: string) {
  const [first, ...rest] = text.split(/\s+/);
  let cmd = first.startsWith("/") ? first.split("@")[0].toLowerCase() : "";
  const label = menuAction(text);
  if (label) cmd = LABEL_TO_CMD[label];

  if (cmd === "/cancel") {
    c.st.w = undefined; c.st.p = undefined;
    return say(c, { text: tr(c.lang, "wizCancelled"), kb: menuKb(c.lang) });
  }
  if (cmd) {
    c.st.w = undefined; c.st.p = undefined;
    const run = COMMANDS[cmd];
    return run ? run(c, rest.join(" ")) : say(c, ui.unknownScreen(c.lang));
  }
  if (c.st.p) return pendingText(c, text);
  if (c.st.w && c.st.w.step !== "confirm" && !["direction", "emotion"].includes(c.st.w.step)) return wizText(c, text);
  if (c.st.w) return wizShow(c); // ждём нажатия кнопки

  const parsed = parseTradeMessage(text);
  if (!parsed.ok) return say(c, { text: `${tr(c.lang, `missing_${parsed.missing}`)}\n\n${tr(c.lang, "example")}`, kb: menuKb(c.lang) });
  const p = parsed.trade;
  return saveAndReport(c, { instrument: p.instrument, direction: p.direction, entry: p.entry, size: p.size, stop: p.stop, tp: p.takeProfit, exit: p.exit, leverage: p.leverage, emotion: p.emotion });
}

// ---------- привязка аккаунта ----------
async function linkWithCode(tg: Tg, chatId: number, payload: string, fallback: Lang) {
  const code = payload.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const { data: row } = code ? await db.from("telegram_link_codes").select("user_id, expires_at").eq("code", code).maybeSingle() : { data: null };
  if (!row || new Date(row.expires_at as string) < new Date()) return tg.send(chatId, tr(fallback, "codeInvalid"));
  const userId = row.user_id as string;
  await db.from("telegram_link_codes").delete().eq("user_id", userId);
  await db.from("telegram_links").delete().eq("chat_id", chatId);
  const { error } = await db.from("telegram_links").upsert({ user_id: userId, chat_id: chatId, reminders: true, last_reminder_at: null }, { onConflict: "user_id" });
  if (error) return tg.send(chatId, tr(fallback, "error"));
  const { data: p } = await db.from("profiles").select("language").eq("id", userId).maybeSingle();
  const lang = langOf(p?.language);
  await tg.send(chatId, tr(lang, "linked"), ui.replyMenu(lang));
  return tg.send(chatId, ui.mainMenu(lang).text, ui.mainMenu(lang).kb);
}

// ---------- разбор обновления ----------
type Update = {
  message?: { chat: { id: number; type: string }; text?: string; from?: { language_code?: string } };
  callback_query?: { id: string; data?: string; from?: { language_code?: string }; message?: { message_id: number; chat: { id: number; type: string } } };
};

async function handleUpdate(tg: Tg, up: Update) {
  const cb = up.callback_query;
  const msg = up.message;
  const chat = cb ? cb.message?.chat : msg?.chat;
  if (!chat || chat.type !== "private") return;
  const chatId = chat.id;
  const fallback = langOf((cb ?? msg)?.from?.language_code ?? msg?.from?.language_code);
  if (cb) await tg.answer(chatId, cb.id);
  if (!cb && !(msg && typeof msg.text === "string")) return;

  const text = msg?.text?.trim().slice(0, 500) ?? "";
  const [cmd0, arg0] = text.split(/\s+/);
  if (!cb && cmd0.toLowerCase().split("@")[0] === "/start" && arg0) return linkWithCode(tg, chatId, arg0, fallback);

  const u = await getLinked(chatId);
  if (!u) {
    if (cb) return;
    return tg.send(chatId, tr(fallback, cmd0.toLowerCase().startsWith("/start") ? "startHelp" : "needLink"));
  }

  const st = await loadState(chatId);
  const now = Date.now();
  st.rl = !st.rl || now - st.rl.ws > 60_000 ? { ws: now, n: 1 } : { ws: st.rl.ws, n: st.rl.n + 1 };
  const c: Ctx = { tg, chatId, u, st, lang: u.lang, msgId: cb?.message?.message_id };
  try {
    if (st.rl.n > 40) {
      if (st.rl.n === 41) await tg.send(chatId, tr(u.lang, "tooFast"));
    } else if (cb) {
      await onCallback(c, cb.data ?? "");
    } else {
      await onText(c, text);
    }
  } catch (e) {
    console.error("handler error", e instanceof Error ? e.message : e);
    await tg.send(chatId, tr(u.lang, "error"), menuKb(u.lang));
  } finally {
    await saveState(chatId, c.st);
  }
}

// ---------- расписание: напоминания, итоги дня и недели ----------
async function runScheduled(tg: Tg) {
  const DAY = 24 * 3600 * 1000;
  const { data: links } = await db.from("telegram_links").select("user_id, chat_id, reminders, daily_summary, weekly_report, last_reminder_at, last_daily_at, last_weekly_at");
  let sent = 0;
  for (const l of links ?? []) {
    const uid = l.user_id as string;
    const chatId = l.chat_id as number;
    const { data: p } = await db.from("profiles").select("language, timezone").eq("id", uid).maybeSingle();
    const tz = safeTimeZone(p?.timezone);
    const lang = langOf(p?.language);
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
    const accs = await listAccounts(uid);
    const cur = accs[0]?.currency ?? "USD";

    if (l.reminders && hour >= 10 && hour < 20 && !(l.last_reminder_at && now.getTime() - new Date(l.last_reminder_at as string).getTime() < 3 * DAY)) {
      const [last] = await fetchTrades(uid, { limit: 1 });
      if (last) {
        const days = Math.floor((now.getTime() - new Date(last.at).getTime()) / DAY);
        if (days >= 3) {
          await tg.send(chatId, tr(lang, "reminder", { d: days }), ui.mainMenu(lang).kb);
          await db.from("telegram_links").update({ last_reminder_at: now.toISOString() }).eq("user_id", uid);
          sent++;
        }
      }
    }
    if (l.daily_summary && hour === 21 && !(l.last_daily_at && new Date(l.last_daily_at as string) >= dayBounds(tz, now).start)) {
      const rows = await fetchTrades(uid, { from: dayBounds(tz, now).start });
      if (rows.length > 0) {
        const s = summarize(rows.map(ui.toStat));
        await tg.send(chatId, tr(lang, "dailySummary", { n: rows.length, followed: rows.filter((r) => r.followed).length, pnl: ui.money(s.totalPnl, cur, lang, true) }), ui.mainMenu(lang).kb);
        sent++;
      }
      await db.from("telegram_links").update({ last_daily_at: now.toISOString() }).eq("user_id", uid);
    }
    if (l.weekly_report && weekday === "Sun" && hour === 19 && !(l.last_weekly_at && now.getTime() - new Date(l.last_weekly_at as string).getTime() < 6 * DAY)) {
      const rows = await fetchTrades(uid, { from: new Date(now.getTime() - 7 * DAY) });
      if (rows.length > 0) {
        const stat = rows.map(ui.toStat);
        const s = summarize(stat);
        const all = await fetchTrades(uid);
        const top = topViolations(stat, 1)[0];
        const followed = rows.filter((r) => r.followed).length;
        await tg.send(chatId, tr(lang, "weeklySummary", {
          n: rows.length, followed, pct: `${Math.round((followed / rows.length) * 100)}%`, pnl: ui.money(s.totalPnl, cur, lang, true),
          streak: disciplineStreak(all.map(ui.toStat)).current, viol: top ? tr(lang, "weeklyViol", { name: ui.esc(top.name) }) : "",
        }), ui.mainMenu(lang).kb);
        sent++;
      }
      await db.from("telegram_links").update({ last_weekly_at: now.toISOString() }).eq("user_id", uid);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  let authed = false;
  try {
    const cfg = await config();
    const path = new URL(req.url).pathname;
    const tg = new Tg(cfg.telegram_token);
    if (path.endsWith("/cron")) {
      if (!same(req.headers.get("x-cron-secret"), cfg.cron_secret)) return new Response("forbidden", { status: 403 });
      return Response.json({ sent: await runScheduled(tg) });
    }
    if (!same(req.headers.get("x-telegram-bot-api-secret-token"), cfg.webhook_secret)) return new Response("forbidden", { status: 403 });
    authed = true;
    await handleUpdate(tg, (await req.json()) as Update);
    // Для настоящих чатов тела нет; для тестовых чатов возвращаем то, что бот отправил
    return tg.out.length > 0 ? Response.json({ out: tg.out }) : new Response("ok");
  } catch (e) {
    console.error("fatal", e instanceof Error ? e.message : e);
    // Telegram всегда получает 200 (иначе будет повторять). Текст ошибки показываем только тому, кто знает секрет (нам при проверках).
    return authed ? Response.json({ error: e instanceof Error ? e.message : String(e) }) : new Response("ok");
  }
});
