"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { applyProfileLanguage } from "@/lib/profile-language";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validations/auth";

/** Результат действия. error — ключ словаря, чтобы показать текст на языке пользователя. */
export type ActionResult = { ok: true; needsEmailConfirmation?: boolean; needsMfa?: boolean; id?: string } | { ok: false; error: string };

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
    // Двухфакторная защита: пароль верный, но нужен ещё код из приложения
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return { ok: true, needsMfa: true };

    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) await applyProfileLanguage(supabase, auth.user.id);
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

/** Отправляет письмо со ссылкой для нового пароля. Всегда отвечает «ок», чтобы нельзя было выяснить, есть ли такая почта. */
export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${proto}://${host}/auth/callback?next=/reset-password`,
    });
    // Лимит писем — это проблема сервиса, а не пользователя; о ней нужно сказать
    if (error && (error.status === 429 || /rate limit/i.test(error.message))) return { ok: false, error: "auth.forgot.rateLimit" };
    return { ok: true };
  } catch {
    return { ok: false, error: "errors.generic" };
  }
}

/** Меняет пароль вошедшего пользователя (после перехода по ссылке из письма). */
export async function updatePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { ok: false, error: "auth.reset.expired" };
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return { ok: false, error: /different|same/i.test(error.message) ? "auth.reset.same" : "errors.generic" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "errors.generic" };
  }
}

/** Полностью удаляет аккаунт пользователя и все его данные (функция в базе delete_my_account). */
export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { ok: false, error: "errors.generic" };
    // Страховка: адрес для подтверждения должен совпасть с адресом аккаунта
    if ((data.user.email ?? "").toLowerCase() !== String(confirmEmail).trim().toLowerCase()) {
      return { ok: false, error: "profile.deleteMismatch" };
    }
    // Сначала удаляем файлы скриншотов: после удаления аккаунта доступа к ним уже не будет
    await removeAllScreenshots(supabase, data.user.id);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return { ok: false, error: "profile.deleteFailed" };
    await supabase.auth.signOut();
    return { ok: true };
  } catch {
    return { ok: false, error: "profile.deleteFailed" };
  }
}

async function removeAllScreenshots(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const bucket = supabase.storage.from("trade-screenshots");
  const { data: tradeDirs } = await bucket.list(userId, { limit: 1000 });
  for (const dir of tradeDirs ?? []) {
    const { data: files } = await bucket.list(`${userId}/${dir.name}`, { limit: 100 });
    const paths = (files ?? []).map((f) => `${userId}/${dir.name}/${f.name}`);
    if (paths.length > 0) await bucket.remove(paths);
  }
}

/** Вход через Google. Работает, только если провайдер Google включён в Supabase и в .env задано NEXT_PUBLIC_GOOGLE_AUTH=true. */
export async function googleSignInAction(): Promise<void> {
  if (!isSupabaseConfigured() || process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "true") redirect("/login?error=oauth");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${proto}://${host}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}
