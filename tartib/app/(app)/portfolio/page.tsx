import type { Metadata } from "next";
import { PortfolioView, type LotView } from "@/components/portfolio/PortfolioView";
import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { getTickers, priceMap } from "@/lib/market-feed";
import { classify } from "@/lib/portfolio";
import { sharedJson } from "@/lib/edge-cache";
import { fetchQuotes, normalizeTicker } from "@/lib/stock-data";

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
  // Откуда брать цену каждого актива: OKX (монеты) или Yahoo (акции, ETF, золото)
  const symbols = [...new Set(lots.map((l) => l.symbol))].slice(0, 60);
  const tickers = symbols.length ? await getTickers(fetch, 10) : [];
  const okxBases = new Set(tickers.filter((x) => x.quote === "USDT").map((x) => x.base));
  const sources = Object.fromEntries(symbols.map((s) => [s, classify(s, okxBases, (x) => normalizeTicker(x, "auto"))]));
  const okxPairs = Object.values(sources).flatMap((s) => (s.kind === "okx" ? [s.pair] : []));
  const yahooTickers = [...new Set(Object.values(sources).flatMap((s) => (s.kind === "yahoo" ? [s.ticker] : [])))];
  const initial = okxPairs.length ? priceMap(tickers, okxPairs) : {};
  const initialQuotes = yahooTickers.length
    ? ((await sharedJson(`pf:${[...yahooTickers].sort().join(",")}`, 10, async () => {
        const q = await fetchQuotes(yahooTickers, fetch, 10);
        return q.length ? q.map((x) => ({ symbol: x.symbol, price: x.price, changePct: x.changePct })) : null;
      })) ?? [])
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("portfolio.title")}</h1>
        <p className="mt-1 text-muted">{t("portfolio.subtitle")}</p>
      </div>
      <PortfolioView lots={lots} sources={sources} initialPrices={initial} initialQuotes={initialQuotes} />
      <p className="text-xs text-muted">{t("portfolio.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
