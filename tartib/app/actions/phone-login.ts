"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const TOKEN = /^[0-9a-f]{32}$/;

export type StartResult = { ok: true; token: string } | { ok: false; error: string };
export type CheckResult = { ok: true; status: "pending" | "expired" | "approved" } | { ok: false; error: string };

/** Шаг 1: сайт получает одноразовый код входа и показывает человеку ссылку на бота. */
export async function startPhoneLoginAction(): Promise<StartResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_telegram_login");
    if (error || typeof data !== "string" || !TOKEN.test(data)) return { ok: false, error: "auth.phone.error" };
    return { ok: true, token: data };
  } catch {
    return { ok: false, error: "auth.phone.error" };
  }
}

/** Шаг 2: сайт спрашивает, подтвердил ли человек номер в боте. Если да, выполняется вход (ставится сессия). */
export async function checkPhoneLoginAction(token: unknown): Promise<CheckResult> {
  if (typeof token !== "string" || !TOKEN.test(token)) return { ok: false, error: "auth.phone.error" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_telegram_login", { p_token: token });
    if (error || !data || typeof data !== "object") return { ok: false, error: "auth.phone.error" };
    const res = data as { status?: string; token_hash?: string };
    if (res.status === "approved" && typeof res.token_hash === "string") {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: "magiclink" });
      if (verifyError) return { ok: false, error: "auth.phone.error" };
      return { ok: true, status: "approved" };
    }
    return { ok: true, status: res.status === "pending" ? "pending" : "expired" };
  } catch {
    return { ok: false, error: "auth.phone.error" };
  }
}
