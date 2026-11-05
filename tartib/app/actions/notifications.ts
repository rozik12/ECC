"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

const FAIL = { ok: false, error: "errors.generic" } as const;
const isNextControlFlow = (e: unknown) => !!e && typeof e === "object" && "digest" in e;

function refresh() {
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markNotificationReadAction(id: unknown): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return FAIL;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", parsed.data).eq("user_id", user.id).is("read_at", null);
    if (error) return FAIL;
    refresh();
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    if (error) return FAIL;
    refresh();
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function clearNotificationsAction(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) return FAIL;
    refresh();
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function setTelegramNotifyAction(on: unknown): Promise<ActionResult> {
  const parsed = z.boolean().safeParse(on);
  if (!parsed.success) return FAIL;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("telegram_links").update({ notify: parsed.data }).eq("user_id", user.id);
    if (error) return { ok: false, error: "telegram.failed" };
    revalidatePath("/profile");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

/** Объявление всем пользователям. Только владелец; проверка и в приложении, и в базе. */
export async function adminBroadcastAction(title: unknown, body: unknown): Promise<ActionResult & { count?: number }> {
  const parsed = z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(500) }).safeParse({ title, body });
  if (!parsed.success) return { ok: false, error: "admin.broadcastInvalid" };
  try {
    const { supabase, profile } = await requireUser();
    if (!profile?.is_admin) return FAIL;
    const { data, error } = await supabase.rpc("admin_broadcast", { p_title: parsed.data.title, p_body: parsed.data.body });
    if (error) return FAIL;
    refresh();
    return { ok: true, count: Number(data) || 0 };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}
