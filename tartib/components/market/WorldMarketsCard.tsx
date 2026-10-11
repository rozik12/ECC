import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { fetchQuotes } from "@/lib/stock-data";
import { ALL_WORLD_SYMBOLS, NEUTRAL_SYMBOLS, WORLD_GROUPS } from "@/lib/world-markets";

/** Рынки мира: золото и металлы, нефть и газ, валюты, индексы, облигации, крипто. Данные неофициальные; если источник не ответил, строка честно пишет «нет данных». */
export async function WorldMarketsCard() {
  const { t, locale } = await getTranslator();
  const quotes = new Map((await fetchQuotes(ALL_WORLD_SYMBOLS)).map((q) => [q.symbol, q]));
  const digits = (v: number) => (v >= 1000 ? 2 : v >= 10 ? 2 : 4);
  return (
    <section aria-labelledby="world-title" className="space-y-3">
      <div>
        <h2 id="world-title" className="text-lg font-semibold">{t("worldmarkets.title")}</h2>
        <p className="text-sm text-muted">{t("worldmarkets.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {WORLD_GROUPS.map((g) => (
          <Card key={g.id} className="min-w-0 space-y-1 p-4 sm:p-5">
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted">{t(`worldmarkets.groups.${g.id}`)}</h3>
            <ul className="divide-y divide-border">
              {g.items.map((it) => {
                const q = quotes.get(it.symbol);
                return (
                  <li key={it.symbol} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/charts?pair=${encodeURIComponent(it.symbol)}`} className="min-w-0 truncate hover:underline">{t(`worldmarkets.names.${it.key}`)}</Link>
                    {q ? (
                      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                        <span>{formatNumber(q.price, locale, digits(q.price))}</span>
                        <span className={cn("w-16 text-right font-medium", !NEUTRAL_SYMBOLS.has(it.symbol) && pnlTone(q.changePct))}>{q.changePct > 0 ? "+" : ""}{formatNumber(q.changePct, locale, 2)}%</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-muted">{t("worldmarkets.none")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted">{t("worldmarkets.note")}</p>
    </section>
  );
}
