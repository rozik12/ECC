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
  strategy: string;
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
        "id, traded_at, instrument, direction, entry_price, exit_price, pnl, emotion, rules_followed, risk_amount, strategy, trade_rule_violations(rule:rules(id, name))",
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
        strategy: r.strategy ?? "",
        violations: r.trade_rule_violations.flatMap((v) => (v.rule ? [v.rule] : [])),
      });
    }
    if (rows.length < PAGE) break;
  }
  return all;
}

export type DayContext = {
  rows: { id: string; tradedAt: Date; pnl: number }[];
  /** Баланс по всем счетам на начало дня */
  dayStartBalance: number;
};

/** Сделки с начала дня и баланс на начало дня: нужны для правила дневного лимита убытка. */
export async function getDayContext(supabase: SupabaseClient, dayStart: Date, dayEnd: Date): Promise<DayContext> {
  const [accounts, { data }] = await Promise.all([
    getAccounts(supabase),
    supabase.from("trades").select("id, traded_at, pnl").gte("traded_at", dayStart.toISOString()),
  ]);
  const all = (data ?? []).map((r) => ({ id: r.id as string, tradedAt: new Date(r.traded_at as string), pnl: Number(r.pnl) }));
  const dayStartBalance = accounts.reduce((s, a) => s + a.balance, 0) - all.reduce((s, r) => s + r.pnl, 0);
  return { rows: all.filter((r) => r.tradedAt < dayEnd), dayStartBalance };
}

/** Убыток за день в % от баланса на начало дня, накопленный до момента before (кроме сделки excludeId). */
export function dayLossBefore(ctx: DayContext, before: Date, excludeId?: string): number | null {
  if (!(ctx.dayStartBalance > 0)) return null;
  const sum = ctx.rows.filter((r) => r.tradedAt < before && r.id !== excludeId).reduce((s, r) => s + r.pnl, 0);
  return (Math.max(0, -sum) / ctx.dayStartBalance) * 100;
}

/** Стратегии, которые пользователь уже использовал, — для подсказок в форме. */
export async function getStrategies(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("trades").select("strategy").neq("strategy", "").order("traded_at", { ascending: false }).limit(300);
  return [...new Set((data ?? []).map((r) => r.strategy as string))].slice(0, 30);
}

export type Transaction = {
  id: string;
  accountId: string;
  kind: "deposit" | "withdrawal";
  amount: number;
  occurredAt: string;
  note: string;
};

/** Пополнения и выводы (новые сверху). */
export async function getTransactions(supabase: SupabaseClient, limit = 1000): Promise<Transaction[]> {
  const { data } = await supabase
    .from("account_transactions")
    .select("id, account_id, kind, amount, occurred_at, note")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    accountId: r.account_id as string,
    kind: r.kind as "deposit" | "withdrawal",
    amount: Number(r.amount),
    occurredAt: r.occurred_at as string,
    note: (r.note as string) ?? "",
  }));
}

/** Самая поздняя сделка: нужна, чтобы подсказать паузу после недавнего убытка. */
export async function getLastTrade(supabase: SupabaseClient): Promise<{ tradedAt: string; pnl: number } | null> {
  const { data } = await supabase.from("trades").select("traded_at, pnl").order("traded_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { tradedAt: String(data.traded_at), pnl: Number(data.pnl) } : null;
}
