"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MISTAKES } from "@/lib/journal";
import type { ActionResult } from "./auth";

const schema = z.object({
  tradeId: z.uuid(),
  mistakes: z.array(z.enum(MISTAKES)).max(10),
  note: z.string().trim().max(2000),
});

/** Сохраняет разбор ошибки в сделке: категории и пояснение «из-за чего это случилось». Только своя сделка. */
export async function saveMistakeAction(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("trades")
      .update({ mistakes: [...new Set(parsed.data.mistakes)], mistake_note: parsed.data.note })
      .eq("id", parsed.data.tradeId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: "trades.saveFailed" };
    if (!data) return { ok: false, error: "trades.notFound" };
    revalidatePath("/statistics/mistakes");
    revalidatePath("/statistics/advanced");
    revalidatePath(`/trades/${parsed.data.tradeId}`);
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "trades.saveFailed" };
  }
}
