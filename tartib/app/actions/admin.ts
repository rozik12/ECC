"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

/** Отключает двухфакторную защиту пользователю, потерявшему телефон. Только для владельца. */
export async function adminResetMfaAction(email: string): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireUser();
    if (!profile?.is_admin) return { ok: false, error: "errors.generic" };
    const { error } = await supabase.rpc("admin_reset_mfa", { target_email: String(email).trim() });
    if (error) return { ok: false, error: "errors.generic" };
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}
