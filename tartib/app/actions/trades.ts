"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { safeTimeZone } from "@/lib/time";
import { saveTradeCore } from "@/lib/trade-save";
import { tradeSchema } from "@/lib/validations/trades";
import type { ActionResult } from "./auth";

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

function revalidateTradePages() {
  revalidatePath("/trades");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
}

export async function saveTradeAction(tradeId: string | null, input: unknown): Promise<ActionResult> {
  const parsed = tradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user, profile } = await requireUser();
    const result = await saveTradeCore(
      { supabase, userId: user.id, timeZone: safeTimeZone(profile?.timezone), notify: { goal: profile?.discipline_goal ?? 80 } },
      tradeId,
      parsed.data,
    );
    if (!result.ok) return result;
    revalidateTradePages();
    return { ok: true, id: result.id };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "trades.saveFailed" };
  }
}

export async function deleteTradeAction(tradeId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { data: trade } = await supabase.from("trades").select("screenshot_path").eq("id", tradeId).eq("user_id", user.id).maybeSingle();
    const { error } = await supabase.from("trades").delete().eq("id", tradeId).eq("user_id", user.id);
    if (error) return { ok: false, error: "trades.deleteFailed" };
    // Файл скриншота удаляем вместе со сделкой, чтобы не оставалось «осиротевших» файлов
    if (trade?.screenshot_path) await supabase.storage.from("trade-screenshots").remove([trade.screenshot_path]);
    revalidateTradePages();
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "trades.deleteFailed" };
  }
}
