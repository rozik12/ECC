"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

const FAIL = { ok: false, error: "errors.generic" } as const;
const isNextControlFlow = (e: unknown) => !!e && typeof e === "object" && "digest" in e;
const body = z.string().trim().min(1).max(2000);

/** Пользователь пишет владельцу. Не больше 20 сообщений в сутки (проверяет и база). */
export async function sendSupportMessageAction(text: unknown): Promise<ActionResult> {
  const parsed = body.safeParse(text);
  if (!parsed.success) return { ok: false, error: "support.invalid" };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("support_messages").insert({ body: parsed.data });
    if (error) return { ok: false, error: /too many/i.test(error.message) ? "support.tooMany" : "errors.generic" };
    revalidatePath("/support");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

/** Владелец отвечает конкретному пользователю. Проверка владельца и в приложении, и в базе. */
export async function adminSupportReplyAction(userId: unknown, text: unknown): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(userId);
  const parsed = body.safeParse(text);
  if (!id.success || !parsed.success) return { ok: false, error: "support.invalid" };
  try {
    const { supabase, profile } = await requireUser();
    if (!profile?.is_admin) return FAIL;
    const { error } = await supabase.rpc("admin_support_reply", { p_user: id.data, p_body: parsed.data });
    if (error) return FAIL;
    revalidatePath(`/admin/messages/${id.data}`);
    revalidatePath("/admin/messages");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}
