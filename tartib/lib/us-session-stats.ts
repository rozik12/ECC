// Разбор результатов по частям торгового дня США (время сделки по Нью-Йорку). Для сделок по акциям и фьючерсам.
import { BUCKETS, bucketOf, type Bucket } from "./us-market.ts";
import type { StatTrade } from "./statistics/index.ts";

export type BucketRow = { bucket: Bucket; count: number; winRate: number; pnl: number; avgPnl: number; violationRate: number };

export const isUsMarket = (t: Pick<StatTrade, "market">) => t.market === "stocks" || t.market === "futures" || t.market === "options";

/** Результат по частям дня. Части без сделок пропускаются. */
export function byUsBucket(trades: StatTrade[]): BucketRow[] {
  const groups = new Map<Bucket, StatTrade[]>();
  for (const t of trades) {
    if (!isUsMarket(t)) continue;
    const b = bucketOf(new Date(t.tradedAt));
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  return BUCKETS.flatMap((bucket) => {
    const xs = groups.get(bucket);
    if (!xs || xs.length === 0) return [];
    const pnl = xs.reduce((a, t) => a + t.pnl, 0);
    return [{
      bucket,
      count: xs.length,
      winRate: (xs.filter((t) => t.pnl > 0).length / xs.length) * 100,
      pnl,
      avgPnl: pnl / xs.length,
      violationRate: (xs.filter((t) => !t.rulesFollowed).length / xs.length) * 100,
    }];
  });
}
