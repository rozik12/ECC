import { NextResponse } from "next/server";
import { safeText, toCsv } from "@/lib/csv";
import { TRADE_COLUMNS } from "@/lib/import";
import { getLocale } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Row = {
  traded_at: string; instrument: string; market: string; direction: string; entry_price: number; exit_price: number | null;
  stop_loss: number | null; take_profit: number | null; position_size: number; leverage: number; risk_percent: number | null;
  pnl: number; emotion: string; strategy: string; reason: string; plan: string; comment: string;
  account: { name: string } | null; trade_rule_violations: { rule: { name: string } | null }[];
};

/** Скачивание всех сделок пользователя в CSV (открывается в Excel и Google Таблицах). ?template=1 — пустой образец для импорта. */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const locale = await getLocale();
  // В русской и узбекской настройках Excel разделитель — «;», а дробная часть — запятая
  const delimiter = locale === "en" ? "," : ";";
  const decimal = (n: number | null) => (n === null ? "" : String(n).replace(".", delimiter === ";" ? "," : "."));

  const rows: string[][] = [[...TRADE_COLUMNS]];
  const isTemplate = new URL(request.url).searchParams.get("template") === "1";

  if (isTemplate) {
    rows.push(["2026-10-01 10:30", "BTC/USDT", "crypto", "long", decimal(65000), decimal(65500), decimal(64500), decimal(66000), decimal(0.1), "5", "", "", "calm", "Пробой", "", "Причина входа", "", "", ""]);
  } else {
    const PAGE = 1000;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await supabase
        .from("trades")
        .select("*, account:trading_accounts(name), trade_rule_violations(rule:rules(name))")
        .order("traded_at", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
      const page = (data ?? []) as unknown as Row[];
      for (const r of page) {
        rows.push([
          r.traded_at, safeText(r.instrument), r.market, r.direction, decimal(Number(r.entry_price)),
          decimal(r.exit_price === null ? null : Number(r.exit_price)), decimal(r.stop_loss === null ? null : Number(r.stop_loss)),
          decimal(r.take_profit === null ? null : Number(r.take_profit)), decimal(Number(r.position_size)), decimal(Number(r.leverage)),
          decimal(r.risk_percent === null ? null : Number(r.risk_percent)), decimal(Number(r.pnl)), r.emotion, safeText(r.strategy ?? ""),
          r.trade_rule_violations.flatMap((v) => (v.rule ? [safeText(v.rule.name)] : [])).join("|"),
          safeText(r.reason), safeText(r.plan), safeText(r.comment), safeText(r.account?.name ?? ""),
        ]);
      }
      if (page.length < PAGE) break;
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + toCsv(rows, delimiter), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tartib-${isTemplate ? "template" : "trades"}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
