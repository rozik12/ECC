import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TradeForm, type TradeFormValues } from "@/components/trades/TradeForm";
import { requireUser } from "@/lib/auth";
import { calculatePnl } from "@/lib/calculations/trade";
import { countTradesBetween, dayLossBefore, getAccounts, getDayContext, getRules, getStrategies } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { dayBounds, safeTimeZone } from "@/lib/time";
import type { Trade } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("trades.form.editTitle") };
}

const str = (v: number | null) => (v === null ? "" : String(Number(v)));

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireUser();

  const { data } = await supabase
    .from("trades")
    .select("*, trade_rule_violations(rule_id)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const trade = data as unknown as Trade & { trade_rule_violations: { rule_id: string }[] };

  const { start, end } = dayBounds(safeTimeZone(profile?.timezone), new Date(trade.traded_at));
  const [accounts, rules, others, day, strategies] = await Promise.all([
    getAccounts(supabase),
    getRules(supabase),
    countTradesBetween(supabase, start, end, id),
    getDayContext(supabase, start, end),
    getStrategies(supabase),
  ]);

  // Если сохранённый P&L отличается от расчётного, значит он правился вручную
  const entry = Number(trade.entry_price);
  const size = Number(trade.position_size);
  const autoPnl =
    trade.exit_price === null ? 0 : Math.round(calculatePnl(trade.direction, entry, Number(trade.exit_price), size) * 100) / 100;
  const pnl = Number(trade.pnl);

  const initial: TradeFormValues = {
    accountId: trade.account_id,
    instrument: trade.instrument,
    market: trade.market,
    direction: trade.direction,
    entry: str(entry),
    exit: str(trade.exit_price),
    stop: str(trade.stop_loss),
    takeProfit: str(trade.take_profit),
    size: str(size),
    leverage: str(trade.leverage),
    risk: str(trade.risk_percent),
    pnl: String(pnl),
    emotion: trade.emotion,
    strategy: trade.strategy ?? "",
    reason: trade.reason,
    plan: trade.plan,
    comment: trade.comment,
    tradedAt: trade.traded_at,
  };

  return (
    <TradeForm
      tradeId={id}
      accounts={accounts}
      rules={rules}
      tradesOthersToday={others}
      dayLossPercent={dayLossBefore(day, new Date(trade.traded_at), id)}
      strategies={strategies}
      initial={initial}
      pnlIsManual={Math.abs(autoPnl - pnl) > 0.005}
      initialViolationIds={trade.trade_rule_violations.map((x) => x.rule_id)}
    />
  );
}
