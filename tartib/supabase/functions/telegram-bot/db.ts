// Доступ к данным. Бот работает с правами сервиса, поэтому КАЖДЫЙ запрос явно ограничен user_id.
import { createClient } from "npm:@supabase/supabase-js@2";
import { calculatePnl, tradeMetrics } from "./calc.ts";
import { inferMarket } from "./market.ts";
import { buildTradeNotifications, type Draft } from "./notify.ts";
import { evaluateRules, type RuleLike } from "./rules.ts";
import { computeAchievements, disciplineStreak, monthDiscipline, type StatTrade } from "./stats.ts";
import { dayBounds, safeTimeZone, startOfLocalDay } from "./time.ts";
import { langOf, type Lang } from "./text.ts";
import type { AccountRow, RuleRow, TradeRow } from "./ui.ts";
import { toStat } from "./ui.ts";

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export type Linked = {
  userId: string; chatId: number; lang: Lang; tz: string; goal: number; checklist: string[]; activeAccountId: string | null;
  reminders: boolean; daily: boolean; weekly: boolean; notify: boolean;
};

export async function getLinked(chatId: number): Promise<Linked | null> {
  const { data: l } = await db.from("telegram_links").select("user_id, reminders, daily_summary, weekly_report, notify, active_account_id").eq("chat_id", chatId).maybeSingle();
  if (!l) return null;
  const { data: p } = await db.from("profiles").select("language, timezone, discipline_goal, checklist, checklist_enabled").eq("id", l.user_id).maybeSingle();
  const checklist = Array.isArray(p?.checklist) && p.checklist.length > 0 ? (p.checklist as string[]) : ["plan", "stop", "risk", "calm", "revenge"];
  return {
    userId: l.user_id as string, chatId, lang: langOf(p?.language), tz: safeTimeZone(p?.timezone), goal: Number(p?.discipline_goal ?? 80), checklist,
    activeAccountId: (l.active_account_id as string | null) ?? null, reminders: !!l.reminders, daily: !!l.daily_summary, weekly: !!l.weekly_report, notify: l.notify !== false,
  };
}

// ---------- состояние диалога ----------
export type State = {
  w?: { step: string; d: Record<string, unknown>; edit?: boolean; rep?: boolean };
  p?: { kind: "close" | "comment" | "strategy"; id: string };
  login?: string;
  chk?: number[];
  rl?: { ws: number; n: number };
  recent?: string[];
  strategies?: string[];
  customRules?: string[];
  rules?: string[];
  accounts?: string[];
  alerts?: string[];
};

export async function loadState(chatId: number): Promise<State> {
  const { data } = await db.from("telegram_state").select("state").eq("chat_id", chatId).maybeSingle();
  return (data?.state as State) ?? {};
}
export async function saveState(chatId: number, state: State) {
  await db.from("telegram_state").upsert({ chat_id: chatId, state, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
}

// ---------- счета ----------
export async function listAccounts(userId: string): Promise<AccountRow[]> {
  const { data: accs } = await db.from("trading_accounts").select("id, name, currency, starting_balance").eq("user_id", userId).order("created_at");
  const ids = (accs ?? []).map((a) => a.id as string);
  const { data: bal } = ids.length ? await db.from("account_balances").select("account_id, balance").eq("user_id", userId).in("account_id", ids) : { data: [] };
  const byId = new Map((bal ?? []).map((b) => [b.account_id as string, Number(b.balance)]));
  return (accs ?? []).map((a) => ({ id: a.id as string, name: a.name as string, currency: a.currency as string, balance: byId.get(a.id as string) ?? Number(a.starting_balance) }));
}

export const activeAccount = (u: Linked, accs: AccountRow[]) => accs.find((a) => a.id === u.activeAccountId) ?? accs[0] ?? null;

// ---------- сделки ----------
const TRADE_SELECT = "id, instrument, direction, entry_price, exit_price, stop_loss, take_profit, position_size, leverage, fees, pnl, emotion, strategy, comment, rules_followed, traded_at, trade_rule_violations(rule:rules(id, name))";

// deno-lint-ignore no-explicit-any
function mapTrade(r: any): TradeRow {
  return {
    id: r.id, instrument: r.instrument, direction: r.direction, entry: Number(r.entry_price), exit: r.exit_price === null ? null : Number(r.exit_price),
    stop: r.stop_loss === null ? null : Number(r.stop_loss), tp: r.take_profit === null ? null : Number(r.take_profit), size: Number(r.position_size),
    leverage: Number(r.leverage), fees: Number(r.fees ?? 0), pnl: Number(r.pnl), emotion: r.emotion, strategy: r.strategy ?? "", comment: r.comment ?? "",
    followed: !!r.rules_followed, at: r.traded_at,
    // deno-lint-ignore no-explicit-any
    violations: (r.trade_rule_violations ?? []).filter((v: any) => v.rule).map((v: any) => ({ id: v.rule.id, name: v.rule.name })),
  };
}

export async function fetchTrades(userId: string, o: { from?: Date; limit?: number; offset?: number; openOnly?: boolean } = {}): Promise<TradeRow[]> {
  let q = db.from("trades").select(TRADE_SELECT).eq("user_id", userId).order("traded_at", { ascending: false });
  if (o.from) q = q.gte("traded_at", o.from.toISOString());
  if (o.openOnly) q = q.is("exit_price", null);
  const limit = o.limit ?? 2000;
  const offset = o.offset ?? 0;
  const { data } = await q.range(offset, offset + limit - 1);
  return (data ?? []).map(mapTrade);
}

export async function countTrades(userId: string, openOnly = false): Promise<number> {
  let q = db.from("trades").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (openOnly) q = q.is("exit_price", null);
  const { count } = await q;
  return count ?? 0;
}

export async function getTrade(userId: string, id: string): Promise<TradeRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("trades").select(TRADE_SELECT).eq("user_id", userId).eq("id", id).maybeSingle();
  return data ? mapTrade(data) : null;
}

export async function deleteTrade(userId: string, id: string): Promise<boolean> {
  const { data: t } = await db.from("trades").select("screenshot_path").eq("user_id", userId).eq("id", id).maybeSingle();
  const { error } = await db.from("trades").delete().eq("user_id", userId).eq("id", id);
  if (!error && t?.screenshot_path) await db.storage.from("trade-screenshots").remove([t.screenshot_path as string]);
  return !error;
}

export async function updateTradeFields(userId: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error } = await db.from("trades").update(patch).eq("user_id", userId).eq("id", id);
  return !error;
}

export async function closeTrade(userId: string, t: TradeRow, exit: number): Promise<TradeRow | null> {
  const pnl = round(calculatePnl(t.direction, t.entry, exit, t.size) - t.fees);
  const ok = await updateTradeFields(userId, t.id, { exit_price: exit, pnl, closed_at: new Date().toISOString() });
  return ok ? { ...t, exit, pnl } : null;
}

/** Ставит или снимает отметку нарушения пользовательского правила и пересчитывает «правила соблюдены». */
export async function toggleViolation(userId: string, tradeId: string, ruleId: string): Promise<void> {
  const trade = await getTrade(userId, tradeId);
  if (!trade) return;
  const { data: rule } = await db.from("rules").select("id").eq("user_id", userId).eq("id", ruleId).maybeSingle();
  if (!rule) return;
  const has = trade.violations.some((v) => v.id === ruleId);
  if (has) await db.from("trade_rule_violations").delete().eq("trade_id", tradeId).eq("rule_id", ruleId);
  else await db.from("trade_rule_violations").insert({ trade_id: tradeId, rule_id: ruleId });
  const left = has ? trade.violations.length - 1 : trade.violations.length + 1;
  await updateTradeFields(userId, tradeId, { rules_followed: left === 0 });
}

export async function listRules(userId: string): Promise<RuleRow[]> {
  const { data } = await db.from("rules").select("id, name, rule_type, value, is_active").eq("user_id", userId).order("created_at");
  return (data ?? []) as RuleRow[];
}
export async function toggleRule(userId: string, id: string): Promise<void> {
  const { data } = await db.from("rules").select("is_active").eq("user_id", userId).eq("id", id).maybeSingle();
  if (data) await db.from("rules").update({ is_active: !data.is_active }).eq("user_id", userId).eq("id", id);
}

export async function recentInstruments(userId: string): Promise<string[]> {
  const { data } = await db.from("trades").select("instrument").eq("user_id", userId).order("traded_at", { ascending: false }).limit(80);
  return [...new Set((data ?? []).map((r) => r.instrument as string))].slice(0, 6);
}
export async function recentStrategies(userId: string): Promise<string[]> {
  const { data } = await db.from("trades").select("strategy").eq("user_id", userId).neq("strategy", "").order("traded_at", { ascending: false }).limit(200);
  return [...new Set((data ?? []).map((r) => r.strategy as string))].slice(0, 6);
}

// ---------- границы периодов ----------
export function periodStart(kind: "today" | "week" | "month" | "30d", tz: string, now = new Date()): Date {
  if (kind === "today") return dayBounds(tz, now).start;
  if (kind === "week") return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  if (kind === "30d") return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]));
  return startOfLocalDay(tz, +parts.year, +parts.month, 1);
}

// ---------- запись сделки ----------
export type NewTrade = { instrument: string; direction: "long" | "short"; entry: number; size: number; stop: number | null; tp: number | null; exit: number | null; leverage: number | null; emotion: string | null };
export type CreateResult =
  | { ok: true; trade: TradeRow; violated: string[]; warnings: { key: string; vars: Record<string, string | number> }[]; newAch: string[]; milestone: number | null; currency: string }
  | { ok: false; error: "noAccount" | "limitTrades" | "error" };

export async function createTrade(u: Linked, t: NewTrade): Promise<CreateResult> {
  const accounts = await listAccounts(u.userId);
  const account = activeAccount(u, accounts);
  if (!account) return { ok: false, error: "noAccount" };

  const rules = ((await listRules(u.userId)) as (RuleRow & { value: number | null })[]).map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) })) as unknown as RuleLike[];
  const now = new Date();
  const { start, end } = dayBounds(u.tz, now);
  const { data: dayRows } = await db.from("trades").select("traded_at, pnl").eq("user_id", u.userId).gte("traded_at", start.toISOString());
  const rows = (dayRows ?? []).map((r) => ({ at: new Date(r.traded_at as string), pnl: Number(r.pnl) })).filter((r) => r.at < end);
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const dayStartBalance = totalBalance - (dayRows ?? []).reduce((s, r) => s + Number(r.pnl), 0);
  const lossSoFar = Math.max(0, -rows.filter((r) => r.at < now).reduce((s, r) => s + r.pnl, 0));
  const dayLossPercent = dayStartBalance > 0 ? (lossSoFar / dayStartBalance) * 100 : null;

  const metrics = tradeMetrics({ entry: t.entry, stop: t.stop, takeProfit: t.tp, size: t.size });
  const riskPercent = metrics.riskAmount !== null && account.balance > 0 ? round((metrics.riskAmount / account.balance) * 100, 4) : null;
  const checks = evaluateRules(rules, { riskPercent, riskReward: metrics.riskReward, leverage: t.leverage ?? 1, hasStopLoss: t.stop !== null, tradesToday: rows.length + 1, dayLossPercent });
  const violated = checks.filter((c) => c.status === "violated");
  const pnl = t.exit !== null ? round(calculatePnl(t.direction, t.entry, t.exit, t.size)) : 0;

  const miniBefore = (await fetchAllMini(u.userId)) as { tradedAt: string; rulesFollowed: boolean }[];
  const before = computeAchievements(miniBefore, now).filter((a) => a.unlocked).map((a) => a.id);

  const { data: ins, error } = await db.from("trades").insert({
    user_id: u.userId, account_id: account.id, instrument: t.instrument, market: inferMarket(t.instrument), direction: t.direction, entry_price: t.entry, exit_price: t.exit,
    stop_loss: t.stop, take_profit: t.tp, position_size: t.size, leverage: t.leverage ?? 1, risk_percent: riskPercent,
    risk_amount: metrics.riskAmount === null ? null : round(metrics.riskAmount), potential_profit: metrics.potentialProfit === null ? null : round(metrics.potentialProfit),
    potential_loss: metrics.potentialLoss === null ? null : round(metrics.potentialLoss), pnl, fees: 0, emotion: t.emotion ?? "calm", strategy: "",
    rules_followed: violated.length === 0, reason: "", plan: "", comment: "", traded_at: now.toISOString(),
  }).select("id").single();
  if (error?.message?.includes("plan_limit_trades")) return { ok: false, error: "limitTrades" };
  if (error || !ins) return { ok: false, error: "error" };

  if (violated.length > 0) {
    const { error: vErr } = await db.from("trade_rule_violations").insert(violated.map((c) => ({ trade_id: ins.id, rule_id: c.rule.id })));
    if (vErr) {
      await db.from("trades").delete().eq("id", ins.id).eq("user_id", u.userId);
      return { ok: false, error: "error" };
    }
  }

  const saved = await getTrade(u.userId, ins.id as string);
  if (!saved) return { ok: false, error: "error" };

  const warnings: { key: string; vars: Record<string, string | number> }[] = [];
  const tradesRule = rules.find((r) => r.is_active && r.rule_type === "max_trades_per_day" && r.value !== null);
  if (tradesRule && rows.length + 1 >= (tradesRule.value as number)) warnings.push({ key: "warnTrades", vars: { n: rows.length + 1, limit: tradesRule.value as number } });
  const lossRule = rules.find((r) => r.is_active && r.rule_type === "max_daily_loss_percent" && r.value !== null);
  if (lossRule && dayStartBalance > 0) {
    const after = Math.max(0, -(rows.reduce((s, r) => s + r.pnl, 0) + pnl)) / dayStartBalance * 100;
    if (after >= (lossRule.value as number)) warnings.push({ key: "warnLoss", vars: { p: round(after, 1), limit: lossRule.value as number } });
  }

  const mini = ((await fetchAllMini(u.userId)) as { tradedAt: string; rulesFollowed: boolean }[]);
  const newAch = computeAchievements(mini, now).filter((a) => a.unlocked && !before.includes(a.id)).map((a) => a.id);
  const streak = disciplineStreak(mini.map((m, i) => ({ id: String(i), tradedAt: m.tradedAt, rulesFollowed: m.rulesFollowed, instrument: "", direction: "long", entryPrice: 0, exitPrice: null, pnl: 0, emotion: "", riskAmount: null, strategy: "", violations: [] })) as StatTrade[], now).current;
  const milestone = saved.followed && [5, 10, 20, 50, 100].includes(streak) ? streak : null;

  // Событие уже показано в ответе бота, поэтому в Telegram повторно не отправляется (pushed_at заполнен); на сайте оно появится в колокольчике
  try {
    const goalBefore = monthDiscipline(miniBefore, u.goal, u.tz, now);
    const goalAfter = monthDiscipline(mini, u.goal, u.tz, now);
    const drafts = buildTradeNotifications({
      achBefore: before, achAfter: computeAchievements(mini, now).filter((a) => a.unlocked).map((a) => a.id), goalBefore: goalBefore.reached, goalAfter: goalAfter.reached,
      goal: u.goal, percent: goalAfter.percent, instrument: t.instrument.toUpperCase(), violated: violated.map((c) => c.rule.name),
    });
    await addNotifications(u.userId, drafts, true);
  } catch (e) {
    console.error("notify", e instanceof Error ? e.message : e);
  }

  return { ok: true, trade: saved, violated: violated.map((c) => c.rule.name), warnings, newAch, milestone, currency: account.currency };
}

async function fetchAllMini(userId: string) {
  const { data } = await db.from("trades").select("traded_at, rules_followed").eq("user_id", userId).order("traded_at", { ascending: false }).limit(3000);
  return (data ?? []).map((r) => ({ tradedAt: r.traded_at as string, rulesFollowed: !!r.rules_followed }));
}
export { toStat };

// ---------- уведомления ----------
export async function addNotifications(userId: string, drafts: Draft[], alreadyShown: boolean) {
  if (drafts.length === 0) return;
  const pushed_at = alreadyShown ? new Date().toISOString() : null;
  await db.from("notifications").insert(drafts.map((d) => ({ user_id: userId, kind: d.kind, params: d.params, pushed_at })));
}

export type NotificationRow = { id: string; kind: string; params: unknown; unread: boolean };

export async function listNotifications(userId: string, limit = 8): Promise<NotificationRow[]> {
  const { data } = await db.from("notifications").select("id, kind, params, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({ id: r.id as string, kind: r.kind as string, params: r.params, unread: r.read_at === null }));
}

export async function markNotificationsRead(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).in("id", ids).is("read_at", null);
}

export async function clearNotifications(userId: string) {
  await db.from("notifications").delete().eq("user_id", userId);
}

// ---------- рынок: список наблюдения и алерты ----------
export async function listWatch(userId: string): Promise<string[]> {
  const { data } = await db.from("watchlist").select("symbol").eq("user_id", userId).order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.symbol as string);
}

export async function addWatch(userId: string, symbol: string): Promise<"ok" | "limit" | "error"> {
  const { error } = await db.from("watchlist").insert({ user_id: userId, symbol });
  if (!error || error.code === "23505") return "ok";
  return error.message.includes("limit_watchlist") ? "limit" : "error";
}

export async function removeWatch(userId: string, symbol: string) {
  await db.from("watchlist").delete().eq("user_id", userId).eq("symbol", symbol);
}

export type AlertRow = { id: string; symbol: string; direction: "above" | "below"; price: number };

export async function listAlerts(userId: string): Promise<AlertRow[]> {
  const { data } = await db.from("price_alerts").select("id, symbol, direction, price").eq("user_id", userId).eq("active", true).order("created_at", { ascending: false }).limit(20);
  return (data ?? []).map((r) => ({ id: r.id as string, symbol: r.symbol as string, direction: r.direction === "below" ? "below" : "above", price: Number(r.price) }));
}

export async function createAlert(userId: string, symbol: string, direction: "above" | "below", price: number): Promise<"ok" | "limit" | "error"> {
  const { error } = await db.from("price_alerts").insert({ user_id: userId, symbol, direction, price });
  if (!error) return "ok";
  return error.message.includes("limit_alerts") ? "limit" : "error";
}

export async function deleteAlert(userId: string, id: string) {
  await db.from("price_alerts").delete().eq("user_id", userId).eq("id", id);
}
