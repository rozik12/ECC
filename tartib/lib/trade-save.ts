import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateRules } from "@/lib/calculations/rules";
import { calculatePnl, tradeMetrics } from "@/lib/calculations/trade";
import { dayBounds } from "@/lib/time";
import { dayLossBefore, getDayContext, getRules } from "@/lib/data";
import type { TradeInput } from "@/lib/validations/trades";
import type { Rule } from "@/types";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

const SAVE_FAILED: SaveResult = { ok: false, error: "trades.saveFailed" };
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

type Ctx = {
  supabase: SupabaseClient;
  userId: string;
  timeZone: string;
  /** Правила можно передать готовыми (при импорте), чтобы не загружать их для каждой сделки */
  rules?: Rule[];
};

type ParsedTrade = Omit<TradeInput, "reason" | "plan" | "comment" | "strategy" | "fees"> & {
  fees?: number;
  reason: string;
  plan: string;
  comment: string;
  strategy: string;
};

/**
 * Создаёт (tradeId = null) или обновляет сделку.
 * Нарушения правил по цифрам определяются здесь, на сервере; rules_followed вычисляется из списка нарушений.
 * Лимиты тарифа проверяет сама база (триггер), поэтому обойти их нельзя.
 */
export async function saveTradeCore(ctx: Ctx, tradeId: string | null, t: ParsedTrade): Promise<SaveResult> {
  const { supabase, userId, timeZone } = ctx;

  const { data: account } = await supabase
    .from("trading_accounts")
    .select("id")
    .eq("id", t.accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) return { ok: false, error: "trades.noAccount" };

  if (tradeId) {
    const { data: existing } = await supabase.from("trades").select("id").eq("id", tradeId).eq("user_id", userId).maybeSingle();
    if (!existing) return { ok: false, error: "trades.notFound" };
  }

  const allRules = ctx.rules ?? (await getRules(supabase));
  const ownIds = new Set(allRules.map((r) => r.id));
  const manualIds = t.violatedRuleIds.filter((id) => ownIds.has(id));

  const metrics = tradeMetrics({ entry: t.entryPrice, stop: t.stopLoss, takeProfit: t.takeProfit, size: t.positionSize });
  let riskPercent = t.riskPercent;
  if (riskPercent === null && metrics.riskAmount !== null) {
    const { data: bal } = await supabase.from("account_balances").select("balance").eq("account_id", t.accountId).maybeSingle();
    const balance = Number(bal?.balance ?? 0);
    if (balance > 0) riskPercent = round((metrics.riskAmount / balance) * 100, 4);
  }

  const tradedAt = new Date(t.tradedAt);
  const { start, end } = dayBounds(timeZone, tradedAt);
  const day = await getDayContext(supabase, start, end);
  const othersToday = day.rows.filter((r) => r.id !== tradeId).length;

  const checks = evaluateRules(allRules, {
    riskPercent,
    riskReward: metrics.riskReward,
    leverage: t.leverage,
    hasStopLoss: t.stopLoss !== null,
    tradesToday: othersToday + 1,
    dayLossPercent: dayLossBefore(day, tradedAt, tradeId ?? undefined),
  });
  const autoIds = checks.filter((c) => c.status === "violated").map((c) => c.rule.id);
  const violationIds = [...new Set([...manualIds, ...autoIds])];

  // P&L хранится чистым (после комиссий). Если пользователь не ввёл его сам, считаем: результат по ценам минус комиссии.
  const fees = t.fees ?? 0;
  const pnl =
    t.pnl !== null
      ? t.pnl
      : t.exitPrice !== null
        ? calculatePnl(t.direction, t.entryPrice, t.exitPrice, t.positionSize) - fees
        : -fees;

  const row = {
    account_id: t.accountId,
    instrument: t.instrument.toUpperCase(),
    market: t.market,
    direction: t.direction,
    entry_price: t.entryPrice,
    exit_price: t.exitPrice,
    stop_loss: t.stopLoss,
    take_profit: t.takeProfit,
    position_size: t.positionSize,
    leverage: t.leverage,
    risk_percent: riskPercent,
    risk_amount: metrics.riskAmount === null ? null : round(metrics.riskAmount),
    potential_profit: metrics.potentialProfit === null ? null : round(metrics.potentialProfit),
    potential_loss: metrics.potentialLoss === null ? null : round(metrics.potentialLoss),
    pnl: round(pnl),
    fees: round(fees),
    emotion: t.emotion,
    strategy: t.strategy,
    rules_followed: violationIds.length === 0,
    reason: t.reason,
    plan: t.plan,
    comment: t.comment,
    traded_at: t.tradedAt,
  };

  let id = tradeId;
  if (tradeId) {
    const { error } = await supabase.from("trades").update(row).eq("id", tradeId).eq("user_id", userId);
    if (error) return SAVE_FAILED;
    const { error: delError } = await supabase.from("trade_rule_violations").delete().eq("trade_id", tradeId);
    if (delError) return SAVE_FAILED;
  } else {
    const { data, error } = await supabase.from("trades").insert({ ...row, user_id: userId }).select("id").single();
    if (error?.message?.includes("plan_limit_trades")) return { ok: false, error: "errors.limitTrades" };
    if (error || !data) return SAVE_FAILED;
    id = data.id as string;
  }

  if (violationIds.length > 0) {
    const { error } = await supabase
      .from("trade_rule_violations")
      .insert(violationIds.map((rule_id) => ({ trade_id: id, rule_id })));
    if (error) {
      if (!tradeId && id) await supabase.from("trades").delete().eq("id", id).eq("user_id", userId);
      return SAVE_FAILED;
    }
  }
  return { ok: true, id: id as string };
}
