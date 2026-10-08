"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

const FAIL = { ok: false, error: "telegram.failed" } as const;

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

/** Одноразовый код привязки (действует 15 минут). */
export async function createTelegramCodeAction(): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("create_telegram_link_code");
    if (error || typeof data !== "string") return FAIL;
    return { ok: true, code: data };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function unlinkTelegramAction(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("telegram_links").delete().eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/profile");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function setTelegramRemindersAction(on: unknown): Promise<ActionResult> {
  const parsed = z.boolean().safeParse(on);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("telegram_links").update({ reminders: parsed.data }).eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/profile");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}
