import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import type { Ticker } from "@/lib/market-feed";

const digits = (v: number) => (v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 6);

/** Лидеры роста и падения за 24 часа среди ликвидных пар к USDT. */
export async function MoversCard({ gainers, losers }: { gainers: Ticker[]; losers: Ticker[] }) {
  const { t, locale } = await getTranslator();
  const list = (title: string, rows: Ticker[], tone: string) => (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.symbol}>
            <Link href={`/charts?pair=${r.symbol}`} className="flex items-baseline justify-between gap-3 py-2 hover:text-primary">
              <span className="text-sm font-medium">{r.base}<span className="text-xs text-muted">/{r.quote}</span></span>
              <span className="flex items-baseline gap-3 tabular-nums">
                <span className="text-sm text-muted">{formatNumber(r.last, locale, digits(r.last))}</span>
                <span className={cn("w-16 text-right text-sm font-semibold", tone)}>{r.change >= 0 ? "+" : ""}{formatNumber(r.change, locale, 2)}%</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("market.movers.title")}</h2>
        <p className="mt-1 text-xs text-muted">{t("market.movers.hint")}</p>
      </div>
      {gainers.length === 0 ? <p className="text-sm text-muted">{t("market.unavailable")}</p> : (
        <div className="grid gap-6 sm:grid-cols-2">
          {list(t("market.movers.gainers"), gainers, "text-success")}
          {list(t("market.movers.losers"), losers, "text-danger")}
        </div>
      )}
    </Card>
  );
}
