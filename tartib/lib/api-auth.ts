import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Быстрая проверка «пользователь вошёл» для открытых рыночных данных (цены, котировки).
 * Подпись токена проверяется на месте, без обращения к Supabase: такие адреса опрашиваются часто, и два запроса к базе на каждый опрос были бы лишними.
 * Для личных данных (экспорт, уведомления) используется getApiUser с полной проверкой, включая двухфакторную защиту.
 */
export async function isSignedIn(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  return !!data?.claims?.sub;
}

/** Вошедший пользователь для API-маршрутов. Если включена двухфакторная защита и код не вводили, доступа нет. */
export async function getApiUser(supabase: SupabaseClient): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return null;
  return data.user;
}
