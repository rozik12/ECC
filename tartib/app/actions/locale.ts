"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Если пользователь вошёл — запоминаем язык в его профиле.
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from("profiles").update({ language: locale }).eq("id", data.user.id);
  } catch {
    /* язык уже сохранён в браузере — этого достаточно */
  }
}
