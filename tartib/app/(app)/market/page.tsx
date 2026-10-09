import type { Metadata } from "next";
import { AlertsCard, type AlertView } from "@/components/market/AlertsCard";
import { CalendarCard } from "@/components/market/CalendarCard";
import { FearGreedCard } from "@/components/market/FearGreedCard";
import { MoversCard } from "@/components/market/MoversCard";
import { WatchlistCard } from "@/components/market/WatchlistCard";
import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { getCalendar, getDominance, getFearGreed, getTickers, topMovers } from "@/lib/market-feed";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("market.title") };
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ events?: string }> }) {
  const sp = await searchParams;
  const { t } = await getTranslator();
  const { supabase, user, profile } = await requireUser();

  const [fear, tickers, calendar, dominance, watch, alerts] = await Promise.all([
    getFearGreed(),
    getTickers(),
    getCalendar(),
    getDominance(),
    supabase.from("watchlist").select("symbol").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("price_alerts").select("id, symbol, direction, price, note, active, triggered_at, triggered_price").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60),
  ]);
  const movers = topMovers(tickers);
  const alertViews: AlertView[] = (alerts.data ?? []).map((a) => ({
    id: String(a.id), symbol: String(a.symbol), direction: a.direction === "below" ? "below" : "above", price: Number(a.price), note: String(a.note ?? ""),
    active: !!a.active, triggeredAt: a.triggered_at ? String(a.triggered_at) : null, triggeredPrice: a.triggered_price === null ? null : Number(a.triggered_price),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("market.title")}</h1>
        <p className="mt-1 text-muted">{t("market.subtitle")}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <FearGreedCard data={fear} dominance={dominance} />
        <WatchlistCard symbols={(watch.data ?? []).map((r) => String(r.symbol))} />
      </div>
      <AlertsCard alerts={alertViews} />
      <MoversCard gainers={movers.gainers} losers={movers.losers} />
      <CalendarCard events={calendar} timeZone={safeTimeZone(profile?.timezone)} all={sp.events === "all"} now={new Date().getTime()} />
      <p className="text-xs text-muted">{t("market.sources")} {t("common.disclaimer")}</p>
    </div>
  );
}
