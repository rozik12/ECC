import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans";
import type { AccountWithBalance, Rule } from "@/types";

/** Счета пользователя с текущим балансом (начальный баланс + сумма P&L). */
export async function getAccounts(supabase: SupabaseClient): Promise<AccountWithBalance[]> {
  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from("trading_accounts").select("id, name, currency, starting_balance").order("created_at"),
    supabase.from("account_balances").select("account_id, balance"),
  ]);
  const byId = new Map((balances ?? []).map((b) => [b.account_id as string, Number(b.balance)]));
  return (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    starting_balance: Number(a.starting_balance),
    balance: byId.get(a.id) ?? Number(a.starting_balance),
  }));
}

export async function getRules(supabase: SupabaseClient): Promise<Rule[]> {
  const { data } = await supabase
    .from("rules")
    .select("id, name, description, rule_type, value, is_active, created_at")
    .order("created_at");
  return (data ?? []).map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) })) as Rule[];
}

/** Сколько сделок у пользователя за период [start, end). excludeId — не считать эту сделку. */
export async function countTradesBetween(
  supabase: SupabaseClient,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<number> {
  let query = supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .gte("traded_at", start.toISOString())
    .lt("traded_at", end.toISOString());
  if (excludeId) query = query.neq("id", excludeId);
  const { count } = await query;
  return count ?? 0;
}

export async function getPlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.plan !== "pro" || data.status !== "active") return "free";
  if (data.expires_at && new Date(data.expires_at) < new Date()) return "free";
  return "pro";
}
