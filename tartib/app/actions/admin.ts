"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

/** Выдаёт или снимает PRO вручную (пока нет онлайн-оплаты). Доступно только владельцу, проверка в базе. */
export async function adminSetPlanAction(email: string, plan: string): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireUser();
    if (!profile?.is_admin) return { ok: false, error: "errors.generic" };
    if (plan !== "free" && plan !== "pro") return { ok: false, error: "errors.generic" };
    const { error } = await supabase.rpc("admin_set_plan", { target_email: String(email).trim(), new_plan: plan });
    if (error) return { ok: false, error: /user_not_found/.test(error.message) ? "admin.notFound" : "errors.generic" };
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

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
