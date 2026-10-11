import { getTranslator } from "@/lib/i18n/server";
import { fetchQuotes } from "@/lib/stock-data";
import { ALL_WORLD_SYMBOLS, NEUTRAL_SYMBOLS, WORLD_GROUPS } from "@/lib/world-markets";
import { WorldMarketsLive } from "./WorldMarketsLive";

/** Рынки мира: золото и металлы, нефть и газ, валюты, индексы, облигации, крипто. Первая отрисовка с сервера, дальше цены обновляются в браузере. */
export async function WorldMarketsCard() {
  const { t } = await getTranslator();
  const initial = await fetchQuotes(ALL_WORLD_SYMBOLS);
  const groups = WORLD_GROUPS.map((g) => ({
    id: g.id,
    title: t(`worldmarkets.groups.${g.id}`),
    items: g.items.map((i) => ({ symbol: i.symbol, name: t(`worldmarkets.names.${i.key}`), neutral: NEUTRAL_SYMBOLS.has(i.symbol) })),
  }));
  return (
    <section aria-labelledby="world-title" className="space-y-3">
      <div>
        <h2 id="world-title" className="text-lg font-semibold">{t("worldmarkets.title")}</h2>
        <p className="text-sm text-muted">{t("worldmarkets.subtitle")}</p>
      </div>
      <WorldMarketsLive groups={groups} initial={initial.map((q) => ({ symbol: q.symbol, price: q.price, changePct: q.changePct }))} />
      <p className="text-xs leading-relaxed text-muted">{t("worldmarkets.note")}</p>
    </section>
  );
}
