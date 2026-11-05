"use server";

import { requireUser } from "@/lib/auth";
import { applyProfileLanguage } from "@/lib/profile-language";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

const CODE = /^\d{6}$/;

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

export type EnrollResult = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };

/** Шаг 1: создаёт ключ для приложения-аутентификатора. Возвращает QR-код и секрет для ручного ввода. */
export async function enrollMfaAction(): Promise<EnrollResult> {
  try {
    const { supabase } = await requireUser();
    // Старые неподтверждённые попытки убираем, чтобы они не копились
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Tartib", friendlyName: `Tartib ${Date.now()}` });
    if (error || !data) return { ok: false, error: "profile.mfa.failed" };
    return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "profile.mfa.failed" };
  }
}

/** Шаг 2: пользователь вводит код из приложения, и защита включается. */
export async function confirmMfaAction(factorId: string, code: string): Promise<ActionResult> {
  if (!CODE.test(code)) return { ok: false, error: "auth.mfa.invalid" };
  try {
    const { supabase } = await requireUser();
    const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error || !challenge) return { ok: false, error: "profile.mfa.failed" };
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyError) return { ok: false, error: "auth.mfa.invalid" };
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "profile.mfa.failed" };
  }
}

/** Вход: после пароля пользователь вводит код. Здесь requireUser нельзя, ведь сессия ещё не полная. */
export async function verifyLoginMfaAction(code: string): Promise<ActionResult> {
  if (!CODE.test(code)) return { ok: false, error: "auth.mfa.invalid" };
  if (!isSupabaseConfigured()) return { ok: false, error: "auth.notConfigured" };
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, error: "auth.mfa.sessionExpired" };
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor) return { ok: false, error: "auth.mfa.sessionExpired" };
    const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (error || !challenge) return { ok: false, error: "errors.generic" };
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
    if (verifyError) return { ok: false, error: "auth.mfa.invalid" };
    await applyProfileLanguage(supabase, auth.user.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "errors.generic" };
  }
}

/** Отключение защиты. Работает только в сессии, где код уже вводили. */
export async function disableMfaAction(): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) return { ok: false, error: "profile.mfa.failed" };
    }
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "profile.mfa.failed" };
  }
}
