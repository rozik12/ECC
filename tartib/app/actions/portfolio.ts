"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

const lotSchema = z.object({
  symbol: z.string().trim().min(1).max(24).transform((s) => {
    // BTC, btc/usdt, BTC-USDT, BTCUSDT → BTC; акции и золото остаются как есть: AAPL, BRK-B, GC=F
    const u = s.toUpperCase().replace(/\s+/g, "");
    const slash = u.split("/")[0];
    const base = /^[A-Z0-9]+-USDT$/.test(u) ? u.slice(0, -5) : slash;
    return base.length > 5 && base.endsWith("USDT") ? base.slice(0, -4) : base;
  }).pipe(z.string().regex(/^[A-Z0-9.^=-]{1,20}$/)),
  side: z.enum(["buy", "sell"]),
  amount: z.number().positive().lt(1e12),
  price: z.number().min(0).lt(1e12),
  fee: z.number().min(0).lt(1e9).default(0),
  note: z.string().trim().max(200).default(""),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

/** Записывает покупку или продажу монеты в портфель. Только в свой аккаунт, остальное проверяет база. */
export async function addLotAction(input: unknown): Promise<ActionResult> {
  const parsed = lotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "portfolio.invalid" };
  try {
    const { supabase, user } = await requireUser();
    const l = parsed.data;
    const { error } = await supabase.from("portfolio_lots").insert({
      user_id: user.id, symbol: l.symbol, side: l.side, amount: l.amount, price: l.price, fee: l.fee, note: l.note, ...(l.occurredAt ? { occurred_at: l.occurredAt } : {}),
    });
    if (error) return { ok: false, error: /limit_portfolio/.test(error.message) ? "portfolio.limit" : "errors.generic" };
    revalidatePath("/portfolio");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

export async function deleteLotAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("portfolio_lots").delete().eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: "errors.generic" };
    revalidatePath("/portfolio");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}
