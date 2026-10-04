import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  name: string;
  language: "ru" | "uz" | "en";
  currency: string;
  timezone: string;
  onboarded: boolean;
  is_admin: boolean;
  checklist_enabled: boolean;
  checklist: string[] | null;
};

/**
 * Возвращает пользователя и его профиль или отправляет на страницу входа.
 * Личность проверяется по подписи токена на месте (без запроса в базу), результат один на запрос.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const user = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };

  // Если включена двухфакторная защита, а код в этой сессии не вводили, пускаем только на ввод кода
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login?mfa=1");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, language, currency, timezone, onboarded, is_admin, checklist_enabled, checklist")
    .eq("id", user.id)
    .single<Profile>();

  return { supabase, user, profile };
});
