"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber, pnlTone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { Ticker } from "@/lib/market-feed";
import { LiveBadge } from "./LiveBadge";
import { useLiveCrypto } from "./useLive";

const digits = (v: number) => (v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 6);

/** Лидеры роста и падения за 24 часа среди ликвидных пар к USDT. Порядок строк остаётся прежним, а цена и процент меняются в реальном времени. */
export function MoversCard({ gainers, losers }: { gainers: Ticker[]; losers: Ticker[] }) {
  const { t, locale } = useI18n();
  const all = [...gainers, ...losers];
  const { prices, mode } = useLiveCrypto(all.map((r) => r.symbol), Object.fromEntries(all.map((r) => [r.symbol, { last: r.last, change: r.change }])));
  const list = (title: string, rows: Ticker[]) => (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const p = prices[r.symbol] ?? { last: r.last, change: r.change, dir: 0 as const };
          return (
            <li key={r.symbol}>
              <Link href={`/charts?pair=${r.symbol}`} className="flex items-baseline justify-between gap-3 py-2 hover:text-primary">
                <span className="text-sm font-medium">{r.base}<span className="text-xs text-muted">/{r.quote}</span></span>
                <span className="flex items-baseline gap-3 tabular-nums">
                  <span key={p.last} className={cn("text-sm text-muted", p.dir > 0 ? "tick-up" : p.dir < 0 ? "tick-down" : "")}>{formatNumber(p.last, locale, digits(p.last))}</span>
                  <span className={cn("w-16 text-right text-sm font-semibold", pnlTone(p.change))}>{p.change >= 0 ? "+" : ""}{formatNumber(p.change, locale, 2)}%</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("market.movers.title")}</h2>
          <p className="mt-1 text-xs text-muted">{t("market.movers.hint")}</p>
        </div>
        {gainers.length > 0 && <LiveBadge mode={mode} />}
      </div>
      {gainers.length === 0 ? <p className="text-sm text-muted">{t("market.unavailable")}</p> : (
        <div className="grid gap-6 sm:grid-cols-2">
          {list(t("market.movers.gainers"), gainers)}
          {list(t("market.movers.losers"), losers)}
        </div>
      )}
    </Card>
  );
}
