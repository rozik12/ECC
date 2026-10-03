"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getRules } from "@/lib/data";
import { safeTimeZone } from "@/lib/time";
import { saveTradeCore } from "@/lib/trade-save";
import { tradeSchema } from "@/lib/validations/trades";

export type ImportRowResult = { line: number; ok: boolean; error?: string };

const MAX_PER_CALL = 25;

/** Импортирует до 25 сделок за вызов. Каждая проходит ту же проверку и те же правила, что и сделка, введённая вручную. */
export async function importTradesAction(
  accountId: string,
  items: { line: number; payload: Record<string, unknown>; violatedRuleNames: string[] }[],
): Promise<{ ok: true; results: ImportRowResult[] } | { ok: false; error: string }> {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_PER_CALL) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user, profile } = await requireUser();
    const rules = await getRules(supabase);
    const byName = new Map(rules.map((r) => [r.name.trim().toLowerCase(), r.id]));
    const ctx = { supabase, userId: user.id, timeZone: safeTimeZone(profile?.timezone), rules };

    const results: ImportRowResult[] = [];
    let limitReached = false;
    for (const item of items) {
      if (limitReached) {
        results.push({ line: item.line, ok: false, error: "errors.limitTrades" });
        continue;
      }
      const violatedRuleIds = (item.violatedRuleNames ?? []).flatMap((n) => {
        const id = byName.get(String(n).trim().toLowerCase());
        return id ? [id] : [];
      });
      const parsed = tradeSchema.safeParse({ ...item.payload, accountId, violatedRuleIds });
      if (!parsed.success) {
        results.push({ line: item.line, ok: false, error: "import.errValues" });
        continue;
      }
      const saved = await saveTradeCore(ctx, null, parsed.data);
      if (saved.ok) results.push({ line: item.line, ok: true });
      else {
        if (saved.error === "errors.limitTrades") limitReached = true;
        results.push({ line: item.line, ok: false, error: saved.error });
      }
    }
    revalidatePath("/trades");
    revalidatePath("/dashboard");
    revalidatePath("/statistics");
    return { ok: true, results };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "trades.saveFailed" };
  }
}
