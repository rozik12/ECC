import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  name: string;
  language: "ru" | "uz" | "en";
  currency: string;
  timezone: string;
  onboarded: boolean;
};

/** Возвращает пользователя и его профиль или отправляет на страницу входа. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, language, currency, timezone, onboarded")
    .eq("id", data.user.id)
    .single<Profile>();

  return { supabase, user: data.user, profile };
}
