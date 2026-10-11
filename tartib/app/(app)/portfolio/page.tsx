import type { Metadata } from "next";
import { PortfolioView, type LotView } from "@/components/portfolio/PortfolioView";
import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { getTickers, priceMap } from "@/lib/market-feed";
import { isStable } from "@/lib/portfolio";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("portfolio.title") };
}

/** Портфель монет: что куплено, по какой средней цене, сколько стоит сейчас и сколько зафиксировано продажами. */
export default async function PortfolioPage() {
  const { t } = await getTranslator();
  const { supabase } = await requireUser();
  const { data } = await supabase.from("portfolio_lots").select("id, symbol, side, amount, price, fee, note, occurred_at").order("occurred_at", { ascending: false }).limit(3000);
  const lots: LotView[] = (data ?? []).map((r) => ({
    id: String(r.id), symbol: String(r.symbol), side: r.side === "sell" ? "sell" : "buy", amount: Number(r.amount), price: Number(r.price), fee: Number(r.fee), note: String(r.note ?? ""), occurredAt: String(r.occurred_at),
  }));
  const pairs = [...new Set(lots.filter((l) => !isStable(l.symbol)).map((l) => `${l.symbol}USDT`))].slice(0, 60);
  const initial = pairs.length ? priceMap(await getTickers(fetch, 10), pairs) : {};

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("portfolio.title")}</h1>
        <p className="mt-1 text-muted">{t("portfolio.subtitle")}</p>
      </div>
      <PortfolioView lots={lots} initialPrices={initial} />
      <p className="text-xs text-muted">{t("portfolio.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
