import { sharedJson } from "@/lib/edge-cache";
import { getTranslator } from "@/lib/i18n/server";
import { fetchQuotes } from "@/lib/stock-data";
import { ALL_WORLD_SYMBOLS, NEUTRAL_SYMBOLS, WORLD_GROUPS } from "@/lib/world-markets";
import { WorldMarketsLive } from "./WorldMarketsLive";

/** Рынки мира: золото и металлы, нефть и газ, валюты, индексы, облигации, крипто. Первая отрисовка с сервера, дальше цены обновляются в браузере. */
export async function WorldMarketsCard() {
  const { t } = await getTranslator();
  // Первая отрисовка берёт те же общие данные, что и опрос из браузера: один запрос к источнику на всех
  const initial = (await sharedJson(`quotes:${[...ALL_WORLD_SYMBOLS].sort().join(",")}`, 10, async () => {
    const q = await fetchQuotes(ALL_WORLD_SYMBOLS, fetch, 10);
    return q.length > 0 ? q.map((x) => ({ symbol: x.symbol, price: x.price, changePct: x.changePct })) : null;
  })) ?? [];
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
      <WorldMarketsLive groups={groups} initial={initial} />
      <p className="text-xs leading-relaxed text-muted">{t("worldmarkets.note")}</p>
    </section>
  );
}
