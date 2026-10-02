"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { accountSchema, profileSchema, renameAccountSchema, settingsSchema } from "@/lib/validations/settings";
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
