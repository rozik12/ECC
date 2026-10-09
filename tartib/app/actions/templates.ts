"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { templateNameSchema, type TemplateData } from "@/lib/validations/templates";
import type { ActionResult } from "./auth";

const FAIL = { ok: false, error: "errors.generic" } as const;
const isNextControlFlow = (e: unknown) => !!e && typeof e === "object" && "digest" in e;

/** Сохраняет настройки сделки (без цен и времени) как шаблон для новых сделок. */
export async function saveTemplateAction(tradeId: unknown, name: unknown): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(tradeId);
  const nm = templateNameSchema.safeParse(name);
  if (!id.success || !nm.success) return { ok: false, error: nm.success ? "errors.generic" : nm.error.issues[0].message };
  try {
    const { supabase, user } = await requireUser();
    const { data: t } = await supabase
      .from("trades")
      .select("instrument, market, direction, leverage, risk_percent, strategy, emotion, tags")
      .eq("id", id.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!t) return { ok: false, error: "trades.notFound" };
    const data: TemplateData = {
      instrument: t.instrument,
      market: t.market,
      direction: t.direction,
      leverage: String(Number(t.leverage)),
      risk: t.risk_percent === null ? "" : String(Number(t.risk_percent)),
      strategy: t.strategy ?? "",
      emotion: t.emotion,
      tags: ((t.tags as string[] | null) ?? []).join(", "),
    };
    const { error } = await supabase.from("trade_templates").insert({ user_id: user.id, name: nm.data, data });
    if (error) return { ok: false, error: error.message.includes("limit_templates") ? "journal.limitTemplates" : "errors.generic" };
    revalidatePath("/trades/new");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function deleteTemplateAction(id: unknown): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return FAIL;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("trade_templates").delete().eq("id", parsed.data).eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/trades/new");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

const closeSchema = z.object({ tradeId: z.string().uuid(), exitPrice: z.number().positive().max(1e12), closedAt: z.iso.datetime({ offset: true }).nullable() });

/** Закрывает открытую сделку: записывает цену выхода и время, пересчитывает результат (разница цен минус комиссии). */
export async function closeTradeAction(input: unknown): Promise<ActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.number" };
  try {
    const { supabase, user } = await requireUser();
    const { data: t } = await supabase.from("trades").select("direction, entry_price, position_size, fees, exit_price, traded_at").eq("id", parsed.data.tradeId).eq("user_id", user.id).maybeSingle();
    if (!t) return { ok: false, error: "trades.notFound" };
    if (t.exit_price !== null) return { ok: false, error: "journal.alreadyClosed" };
    const closedAt = parsed.data.closedAt ?? new Date().toISOString();
    if (Date.parse(closedAt) < Date.parse(String(t.traded_at))) return { ok: false, error: "journal.errClosedBefore" };
    const diff = (t.direction === "long" ? 1 : -1) * (parsed.data.exitPrice - Number(t.entry_price)) * Number(t.position_size);
    const pnl = Math.round((diff - Number(t.fees ?? 0)) * 100) / 100;
    const { error } = await supabase.from("trades").update({ exit_price: parsed.data.exitPrice, pnl, closed_at: closedAt }).eq("id", parsed.data.tradeId).eq("user_id", user.id);
    if (error) return FAIL;
    for (const p of ["/trades", "/dashboard", "/statistics", `/trades/${parsed.data.tradeId}`]) revalidatePath(p);
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}
