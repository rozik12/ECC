"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { accountSchema, checklistSchema, profileSchema, renameAccountSchema, settingsSchema, transactionSchema } from "@/lib/validations/settings";
import type { ActionResult } from "./auth";

const FAIL: ActionResult = { ok: false, error: "settings.saveFailed" };
const MAX_ACCOUNTS = 10;

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update({ name: parsed.data.name }).eq("id", user.id);
    if (error) return FAIL;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
    if (error) return FAIL;
    (await cookies()).set(LOCALE_COOKIE, parsed.data.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function createAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { count } = await supabase.from("trading_accounts").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_ACCOUNTS) return { ok: false, error: "settings.accountsLimit" };
    const { error } = await supabase.from("trading_accounts").insert({
      user_id: user.id,
      name: parsed.data.name,
      starting_balance: parsed.data.startingBalance,
      currency: parsed.data.currency,
    });
    if (error) return FAIL;
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function renameAccountAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = renameAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("trading_accounts").update({ name: parsed.data.name }).eq("id", id).eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function updateChecklistAction(input: unknown): Promise<ActionResult> {
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("profiles")
      .update({ checklist_enabled: parsed.data.enabled, checklist: parsed.data.items.length > 0 ? parsed.data.items : null })
      .eq("id", user.id);
    if (error) return FAIL;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

/** Пополнение или вывод средств: меняет баланс счёта, но не считается результатом торговли. */
export async function addTransactionAction(input: unknown): Promise<ActionResult> {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { data: account } = await supabase.from("trading_accounts").select("id").eq("id", parsed.data.accountId).eq("user_id", user.id).maybeSingle();
    if (!account) return { ok: false, error: "trades.noAccount" };
    const { error } = await supabase.from("account_transactions").insert({
      user_id: user.id,
      account_id: parsed.data.accountId,
      kind: parsed.data.kind,
      amount: parsed.data.amount,
      occurred_at: parsed.data.occurredAt,
      note: parsed.data.note,
    });
    if (error) return FAIL;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("account_transactions").delete().eq("id", id).eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function setDisciplineGoalAction(goal: unknown): Promise<ActionResult> {
  const parsed = z.number().int().min(10).max(100).safeParse(goal);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update({ discipline_goal: parsed.data }).eq("id", user.id);
    if (error) return FAIL;
    revalidatePath("/dashboard");
    revalidatePath("/statistics");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

/** Публичная ссылка на карточку результата: включить, выключить или выпустить новую (старая перестаёт работать). */
export async function setShareAction(mode: unknown): Promise<ActionResult> {
  const parsed = z.enum(["on", "off", "renew"]).safeParse(mode);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user, profile } = await requireUser();
    let token: string | null = null;
    if (parsed.data === "renew" || (parsed.data === "on" && !profile?.share_token)) token = crypto.randomUUID();
    else if (parsed.data === "on") token = profile?.share_token ?? null;
    const { error } = await supabase.from("profiles").update({ share_token: token }).eq("id", user.id);
    if (error) return FAIL;
    revalidatePath("/profile");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}
