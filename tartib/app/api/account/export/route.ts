import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Все данные пользователя одним JSON-файлом: профиль, счета, правила, сделки, пополнения и выводы, отчёты. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await createClient();
  const user = await getApiUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const all = async (table: string, select: string, order: string) => {
    const rows: unknown[] = [];
    for (let from = 0; from < 100000; from += 1000) {
      const { data, error } = await supabase.from(table).select(select).order(order).range(from, from + 999);
      if (error) throw new Error(`Failed to read ${table}`);
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    return rows;
  };

  try {
    const [profile, accounts, rules, trades, transactions, reports] = await Promise.all([
      supabase.from("profiles").select("name, language, timezone, currency, created_at").eq("id", user.id).maybeSingle(),
      all("trading_accounts", "id, name, starting_balance, currency, created_at", "created_at"),
      all("rules", "id, name, description, rule_type, value, is_active, created_at", "created_at"),
      all("trades", "*, trade_rule_violations(rule:rules(name))", "traded_at"),
      all("account_transactions", "id, account_id, kind, amount, occurred_at, note", "occurred_at"),
      all("weekly_reports", "period_start, period_end, content, created_at", "period_start"),
    ]);

    const body = {
      exportedAt: new Date().toISOString(),
      format: "tartib-export-v1",
      account: { email: user.email, ...(profile.data ?? {}) },
      tradingAccounts: accounts,
      rules,
      trades,
      transactions,
      weeklyReports: reports,
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tartib-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
