"use server";

import { revalidatePath } from "next/cache";
import { calculatePnl, tradeMetrics } from "@/lib/calculations/trade";
import { evaluateRules } from "@/lib/calculations/rules";
import { requireUser } from "@/lib/auth";
import { countTradesBetween, getPlan, getRules } from "@/lib/data";
import { PLAN_LIMITS } from "@/lib/plans";
import { dayBounds, safeTimeZone } from "@/lib/time";
import { tradeSchema } from "@/lib/validations/trades";
import type { ActionResult } from "./auth";

const SAVE_FAILED: ActionResult = { ok: false, error: "trades.saveFailed" };
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

/** Создаёт (tradeId = null) или обновляет сделку. Нарушения правил по цифрам определяются на сервере. */
export async function saveTradeAction(tradeId: string | null, input: unknown): Promise<ActionResult> {
  const parsed = tradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const t = parsed.data;

  try {
    const { supabase, user, profile } = await requireUser();

    // Счёт должен принадлежать пользователю
    const { data: account } = await supabase
      .from("trading_accounts")
      .select("id")
      .eq("id", t.accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account) return { ok: false, error: "trades.noAccount" };

    if (tradeId) {
      const { data: existing } = await supabase.from("trades").select("id").eq("id", tradeId).eq("user_id", user.id).maybeSingle();
      if (!existing) return { ok: false, error: "trades.notFound" };
    } else {
      const plan = await getPlan(supabase, user.id);
      const { count } = await supabase.from("trades").select("id", { count: "exact", head: true });
      if ((count ?? 0) >= PLAN_LIMITS[plan].trades) return { ok: false, error: "errors.limitTrades" };
    }

    // Правила, которые пользователь отметил, должны быть его собственными
    const allRules = await getRules(supabase);
    const ownIds = new Set(allRules.map((r) => r.id));
    const manualIds = t.violatedRuleIds.filter((id) => ownIds.has(id));

    // Показатели сделки
    const metrics = tradeMetrics({ entry: t.entryPrice, stop: t.stopLoss, takeProfit: t.takeProfit, size: t.positionSize });
    let riskPercent = t.riskPercent;
    if (riskPercent === null && metrics.riskAmount !== null) {
      const { data: bal } = await supabase.from("account_balances").select("balance").eq("account_id", t.accountId).maybeSingle();
      const balance = Number(bal?.balance ?? 0);
      if (balance > 0) riskPercent = round((metrics.riskAmount / balance) * 100, 4);
    }

    const tz = safeTimeZone(profile?.timezone);
    const { start, end } = dayBounds(tz, new Date(t.tradedAt));
    const othersToday = await countTradesBetween(supabase, start, end, tradeId ?? undefined);

    const checks = evaluateRules(allRules, {
      riskPercent,
      riskReward: metrics.riskReward,
      leverage: t.leverage,
      hasStopLoss: t.stopLoss !== null,
      tradesToday: othersToday + 1,
    });
    const autoIds = checks.filter((c) => c.status === "violated").map((c) => c.rule.id);
    const violationIds = [...new Set([...manualIds, ...autoIds])];

    const pnl =
      t.pnl !== null ? t.pnl : t.exitPrice !== null ? calculatePnl(t.direction, t.entryPrice, t.exitPrice, t.positionSize) : 0;

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
      emotion: t.emotion,
      // Вычисляется, а не вводится: так данные не могут противоречить друг другу
      rules_followed: violationIds.length === 0,
      reason: t.reason,
      plan: t.plan,
      comment: t.comment,
      traded_at: t.tradedAt,
    };

    let id = tradeId;
    if (tradeId) {
      const { error } = await supabase.from("trades").update(row).eq("id", tradeId).eq("user_id", user.id);
      if (error) return SAVE_FAILED;
      const { error: delError } = await supabase.from("trade_rule_violations").delete().eq("trade_id", tradeId);
      if (delError) return SAVE_FAILED;
    } else {
      const { data, error } = await supabase.from("trades").insert({ ...row, user_id: user.id }).select("id").single();
      if (error || !data) return SAVE_FAILED;
      id = data.id as string;
    }

    if (violationIds.length > 0) {
      const { error } = await supabase
        .from("trade_rule_violations")
        .insert(violationIds.map((rule_id) => ({ trade_id: id, rule_id })));
      if (error) {
        if (!tradeId && id) await supabase.from("trades").delete().eq("id", id).eq("user_id", user.id);
        return SAVE_FAILED;
      }
    }

    revalidatePath("/trades");
    revalidatePath("/dashboard");
    revalidatePath("/statistics");
    return { ok: true, id: id ?? undefined };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return SAVE_FAILED;
  }
}

export async function deleteTradeAction(tradeId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("trades").delete().eq("id", tradeId).eq("user_id", user.id);
    if (error) return { ok: false, error: "trades.deleteFailed" };
    revalidatePath("/trades");
    revalidatePath("/dashboard");
    revalidatePath("/statistics");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "trades.deleteFailed" };
  }
}
