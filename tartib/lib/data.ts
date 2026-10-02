import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans";
import type { StatTrade } from "@/lib/statistics";
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

type StatRow = {
  id: string;
  traded_at: string;
  instrument: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number | null;
  pnl: number;
  emotion: string;
  rules_followed: boolean;
  risk_amount: number | null;
  trade_rule_violations: { rule: { id: string; name: string } | null }[];
};

/** Все сделки пользователя для статистики (по 1000 за запрос, как отдаёт Supabase). */
export async function fetchStatTrades(supabase: SupabaseClient): Promise<StatTrade[]> {
  const PAGE = 1000;
  const MAX = 20000;
  const all: StatTrade[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await supabase
      .from("trades")
      .select(
        "id, traded_at, instrument, direction, entry_price, exit_price, pnl, emotion, rules_followed, risk_amount, trade_rule_violations(rule:rules(id, name))",
      )
      .order("traded_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Failed to load trades");
    const rows = (data ?? []) as unknown as StatRow[];
    for (const r of rows) {
      all.push({
        id: r.id,
        tradedAt: r.traded_at,
        instrument: r.instrument,
        direction: r.direction,
        entryPrice: Number(r.entry_price),
        exitPrice: r.exit_price === null ? null : Number(r.exit_price),
        pnl: Number(r.pnl),
        emotion: r.emotion,
        rulesFollowed: r.rules_followed,
        riskAmount: r.risk_amount === null ? null : Number(r.risk_amount),
        violations: r.trade_rule_violations.flatMap((v) => (v.rule ? [v.rule] : [])),
      });
    }
    if (rows.length < PAGE) break;
  }
  return all;
}
