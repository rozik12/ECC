import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/** Клиент Supabase для серверного кода. Работает от имени вошедшего пользователя (с учётом RLS). */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase is not configured");
  const store = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Вызов из серверного компонента — куки там менять нельзя. Сессию обновляет proxy.ts.
        }
      },
    },
  });
}
