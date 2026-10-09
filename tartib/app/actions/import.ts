"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getRules } from "@/lib/data";
import { safeTimeZone } from "@/lib/time";
import { saveTradeCore } from "@/lib/trade-save";
import { tradeSchema } from "@/lib/validations/trades";

const tradeKey = (p: Record<string, unknown>) => `${new Date(String(p.tradedAt)).getTime()}|${String(p.instrument).toUpperCase()}|${Number(p.entryPrice)}`;

/** Сделки, которые уже есть в журнале (то же время, инструмент и цена входа). Повторная загрузка того же файла не создаст дубликатов. */
async function existingKeys(supabase: SupabaseClient, items: { payload: Record<string, unknown> }[]): Promise<Set<string>> {
  const times = items.map((i) => new Date(String(i.payload.tradedAt)).getTime()).filter(Number.isFinite);
  if (times.length === 0) return new Set();
  const { data } = await supabase
    .from("trades")
    .select("traded_at, instrument, entry_price")
    .gte("traded_at", new Date(Math.min(...times)).toISOString())
    .lte("traded_at", new Date(Math.max(...times)).toISOString());
  return new Set((data ?? []).map((r) => `${new Date(String(r.traded_at)).getTime()}|${String(r.instrument).toUpperCase()}|${Number(r.entry_price)}`));
}

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

    const duplicates = await existingKeys(supabase, items);
    const results: ImportRowResult[] = [];
    let limitReached = false;
    for (const item of items) {
      if (duplicates.has(tradeKey(item.payload))) {
        results.push({ line: item.line, ok: false, error: "import.duplicate" });
        continue;
      }
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
