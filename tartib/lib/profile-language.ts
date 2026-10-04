import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/** Язык из профиля действует на любом устройстве, где пользователь вошёл. */
export async function applyProfileLanguage(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: profile } = await supabase.from("profiles").select("language").eq("id", userId).maybeSingle();
  if (profile && isLocale(profile.language)) {
    (await cookies()).set(LOCALE_COOKIE, profile.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
}
