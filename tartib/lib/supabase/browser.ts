import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/** Клиент Supabase для браузера (мессенджер): сессия берётся из тех же cookie, права проверяет база (RLS). Один на вкладку. */
export function getBrowserClient(): SupabaseClient {
  if (client) return client;
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase is not configured");
  client = createBrowserClient(env.url, env.anonKey) as unknown as SupabaseClient;
  return client;
}
