import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Вошедший пользователь для API-маршрутов. Если включена двухфакторная защита и код не вводили, доступа нет. */
export async function getApiUser(supabase: SupabaseClient): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return null;
  return data.user;
}
