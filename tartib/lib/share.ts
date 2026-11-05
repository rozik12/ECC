import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type ShareStats = { name: string; trades30: number; followed30: number; streak: number; trades: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Публичная карточка результата по токену. Возвращает только проценты и серию, без денег и сделок. */
export async function getShareStats(token: string): Promise<ShareStats | null> {
  const env = getSupabaseEnv();
  if (!env || !UUID.test(token)) return null;
  const supabase = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("public_share_stats", { p_token: token });
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { name: typeof d.name === "string" ? d.name.slice(0, 60) : "", trades30: num(d.trades30), followed30: num(d.followed30), streak: num(d.streak), trades: num(d.trades) };
}

export const disciplinePercent = (s: ShareStats) => (s.trades30 > 0 ? Math.round((s.followed30 / s.trades30) * 100) : null);
