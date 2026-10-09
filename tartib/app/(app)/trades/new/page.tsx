import type { Metadata } from "next";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Alert } from "@/components/ui";
import { TradeForm, type TemplateView, type TradeFormValues } from "@/components/trades/TradeForm";
import { requireUser } from "@/lib/auth";
import { countTradesBetween, dayLossBefore, getAccounts, getDayContext, getKnownTags, getLastTrade, getRules, getStrategies } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { lossCooldown } from "@/lib/statistics";
import { dayBounds, safeTimeZone } from "@/lib/time";
import { directions, emotions, markets, type DirectionKey, type EmotionKey, type MarketKey } from "@/lib/trading";
import { templateDataSchema } from "@/lib/validations/templates";

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
  const cloneId = /^[0-9a-f-]{36}$/i.test(one(sp.clone)) ? one(sp.clone) : null;
  const [accounts, rules, tradesToday, day, strategies, last, knownTags, tpl, cloned] = await Promise.all([
    getAccounts(supabase),
    getRules(supabase),
    countTradesBetween(supabase, start, end),
    getDayContext(supabase, start, end),
    getStrategies(supabase),
    getLastTrade(supabase),
    getKnownTags(supabase),
    supabase.from("trade_templates").select("id, name, data").order("created_at", { ascending: false }).limit(20),
    cloneId ? supabase.from("trades").select("*").eq("id", cloneId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const templates: TemplateView[] = (tpl.data ?? []).flatMap((r) => {
    const parsed = templateDataSchema.safeParse(r.data);
    return parsed.success ? [{ id: String(r.id), name: String(r.name), data: parsed.data }] : [];
  });

  if (accounts.length === 0) return <Alert tone="warning">{t("trades.noAccount")}</Alert>;

  const account = accounts.find((a) => a.id === one(sp.account)) ?? accounts[0];
  const market = (markets as readonly string[]).includes(one(sp.market)) ? (one(sp.market) as MarketKey) : "crypto";
  const direction = (directions as readonly string[]).includes(one(sp.direction)) ? (one(sp.direction) as DirectionKey) : "long";

  const cooldown = lossCooldown(last, new Date());

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
    tags: "",
    grade: "",
    mistakes: [],
    closedAt: "",
  };

  // «Клонировать»: берём настройки сделки как основу новой (без результата, выхода, времени и заметок)
  const src = cloned.data as Record<string, unknown> | null;
  if (src) {
    const s = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
    initial.accountId = accounts.some((a) => a.id === src.account_id) ? String(src.account_id) : initial.accountId;
    initial.instrument = String(src.instrument ?? "");
    if ((markets as readonly string[]).includes(String(src.market))) initial.market = src.market as MarketKey;
    if ((directions as readonly string[]).includes(String(src.direction))) initial.direction = src.direction as DirectionKey;
    if ((emotions as readonly string[]).includes(String(src.emotion))) initial.emotion = src.emotion as EmotionKey;
    initial.entry = s(src.entry_price);
    initial.stop = s(src.stop_loss);
    initial.takeProfit = s(src.take_profit);
    initial.size = s(src.position_size);
    initial.leverage = s(src.leverage) || "1";
    initial.risk = s(src.risk_percent);
    initial.strategy = String(src.strategy ?? "");
    initial.reason = String(src.reason ?? "");
    initial.plan = String(src.plan ?? "");
    initial.tags = ((src.tags as string[] | null) ?? []).join(", ");
  }

  return (
    <>
    {cooldown && <Alert tone="warning" className="mb-4">{t("trades.cooldown", { m: cooldown.minutesAgo })}</Alert>}
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
      templates={templates}
      knownTags={knownTags}
      initial={initial}
      fromCalculator={!!one(sp.entry)}
      fromClone={!!src}
    />
    </>
  );
}
