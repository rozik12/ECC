import type { Metadata } from "next";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Alert } from "@/components/ui";
import { TradeForm, type TradeFormValues } from "@/components/trades/TradeForm";
import { requireUser } from "@/lib/auth";
import { countTradesBetween, dayLossBefore, getAccounts, getDayContext, getRules, getStrategies } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { dayBounds, safeTimeZone } from "@/lib/time";
import { directions, markets, type DirectionKey, type MarketKey } from "@/lib/trading";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("trades.form.newTitle") };
}

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 40) : "");

export default async function NewTradePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const { start, end } = dayBounds(safeTimeZone(profile?.timezone));
  const [accounts, rules, tradesToday, day, strategies] = await Promise.all([
    getAccounts(supabase),
    getRules(supabase),
    countTradesBetween(supabase, start, end),
    getDayContext(supabase, start, end),
    getStrategies(supabase),
  ]);

  if (accounts.length === 0) return <Alert tone="warning">{t("trades.noAccount")}</Alert>;

  const account = accounts.find((a) => a.id === one(sp.account)) ?? accounts[0];
  const market = (markets as readonly string[]).includes(one(sp.market)) ? (one(sp.market) as MarketKey) : "crypto";
  const direction = (directions as readonly string[]).includes(one(sp.direction)) ? (one(sp.direction) as DirectionKey) : "long";

  const initial: TradeFormValues = {
    accountId: account.id,
    instrument: one(sp.instrument),
    market,
    direction,
    entry: one(sp.entry),
    exit: "",
    stop: one(sp.stop),
    takeProfit: one(sp.tp),
    size: one(sp.size),
    leverage: one(sp.leverage) || "1",
    risk: one(sp.risk),
    fees: "",
    pnl: "",
    emotion: "calm",
    strategy: "",
    reason: "",
    plan: "",
    comment: "",
    tradedAt: "",
  };

  return (
    <>
    <div className="mb-4 flex justify-end">
      <Link href="/trades/quick" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <Zap className="h-4 w-4" aria-hidden /> {t("quick.button")}
      </Link>
    </div>
    <TradeForm
      accounts={accounts}
      rules={rules}
      tradesOthersToday={tradesToday}
      dayLossPercent={dayLossBefore(day, new Date())}
      strategies={strategies}
      initial={initial}
      fromCalculator={!!one(sp.entry)}
    />
    </>
  );
}
