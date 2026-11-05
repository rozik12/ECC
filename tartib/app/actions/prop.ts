"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

const pct = (max: number) => z.number().gt(0).lte(max);
const schema = z.object({
  name: z.string().trim().min(1).max(40),
  accountId: z.uuid().nullable(),
  startBalance: z.number().gt(0).lt(1e12),
  profitTargetPct: pct(1000),
  maxDailyLossPct: pct(100),
  maxTotalLossPct: pct(100),
  trailing: z.boolean(),
  minTradingDays: z.number().int().min(0).max(365),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"] });

/** Создаёт проп-челлендж. Только в свой аккаунт, остальное проверяет база. */
export async function addChallengeAction(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "prop.invalid" };
  try {
    const { supabase, user } = await requireUser();
    const c = parsed.data;
    const { error } = await supabase.from("prop_challenges").insert({
      user_id: user.id, account_id: c.accountId, name: c.name, start_balance: c.startBalance, profit_target_pct: c.profitTargetPct,
      max_daily_loss_pct: c.maxDailyLossPct, max_total_loss_pct: c.maxTotalLossPct, trailing_dd: c.trailing, min_trading_days: c.minTradingDays, start_date: c.startDate, end_date: c.endDate,
    });
    if (error) return { ok: false, error: /limit_prop/.test(error.message) ? "prop.limit" : "errors.generic" };
    revalidatePath("/prop");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

export async function deleteChallengeAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("prop_challenges").delete().eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: "errors.generic" };
    revalidatePath("/prop");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}
