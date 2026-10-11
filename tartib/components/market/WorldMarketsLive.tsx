"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber, pnlTone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useLiveQuotes } from "./useLive";

export type WorldGroupView = { id: string; title: string; items: { symbol: string; name: string; neutral: boolean }[] };
export type QuoteView = { symbol: string; price: number; changePct: number };

const digits = (v: number) => (v >= 10 ? 2 : 4);

/** Список рынков мира: цены обновляются сами каждые 5 секунд, пока вкладка открыта. */
export function WorldMarketsLive({ groups, initial }: { groups: WorldGroupView[]; initial: QuoteView[] }) {
  const { t, locale } = useI18n();
  const symbols = groups.flatMap((g) => g.items.map((i) => i.symbol));
  const { quotes, ok } = useLiveQuotes(symbols, Object.fromEntries(initial.map((q) => [q.symbol, q])));
  return (
    <>
      <p className="flex items-center gap-2 text-xs text-muted" role="status">
        <span className={cn("inline-block h-2 w-2 rounded-full", ok ? "bg-success" : "bg-warning")} aria-hidden />
        {ok ? t("live.every5") : t("live.paused")}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id} className="min-w-0 space-y-1 p-4 sm:p-5">
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted">{g.title}</h3>
            <ul className="divide-y divide-border">
              {g.items.map((it) => {
                const q = quotes[it.symbol];
                return (
                  <li key={it.symbol} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/charts?pair=${encodeURIComponent(it.symbol)}`} className="min-w-0 truncate hover:underline">{it.name}</Link>
                    {q ? (
                      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                        <span key={q.price} className={q.dir > 0 ? "tick-up" : q.dir < 0 ? "tick-down" : ""}>{formatNumber(q.price, locale, digits(q.price))}</span>
                        <span className={cn("w-16 text-right font-medium", !it.neutral && pnlTone(q.changePct))}>{q.changePct > 0 ? "+" : ""}{formatNumber(q.changePct, locale, 2)}%</span>
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
    </>
  );
}
