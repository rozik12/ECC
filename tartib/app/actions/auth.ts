"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

/** Результат действия. error — ключ словаря, чтобы показать текст на языке пользователя. */
export type ActionResult = { ok: true; needsEmailConfirmation?: boolean; id?: string } | { ok: false; error: string };

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      return { ok: false, error: error.status === 400 ? "errors.invalidCredentials" : "errors.generic" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "errors.generic" };
  }
}

export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { name: parsed.data.name },
        emailRedirectTo: `${proto}://${host}/auth/callback`,
      },
    });
    if (error) {
      const taken = error.code === "user_already_exists" || /already/i.test(error.message);
      return { ok: false, error: taken ? "errors.emailTaken" : "errors.generic" };
    }
    // Если в Supabase включено подтверждение почты, сессии пока нет.
    // Повторная регистрация уже существующей почты возвращает пользователя без identities.
    if (data.user && data.user.identities?.length === 0) return { ok: false, error: "errors.emailTaken" };
    return { ok: true, needsEmailConfirmation: !data.session };
  } catch {
    return { ok: false, error: "errors.generic" };
  }
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
