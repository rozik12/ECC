import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { bestWorst, type StatTrade } from "@/lib/statistics";

const intl = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" } as const;

/** Три лучшие и три худшие сделки периода со ссылкой на каждую. */
export async function BestWorstCard({ trades, currency, timeZone }: { trades: StatTrade[]; currency: string; timeZone: string }) {
  const { t, locale } = await getTranslator();
  const { best, worst } = bestWorst(trades, 3);
  if (best.length === 0 && worst.length === 0) return null;
  const date = (iso: string) => new Intl.DateTimeFormat(intl[locale], { day: "2-digit", month: "2-digit", timeZone }).format(new Date(iso));

  const column = (title: string, list: StatTrade[], tone: string) => (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{t("stats.best.none")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((x) => (
            <li key={x.id}>
              <Link href={`/trades/${x.id}`} className="flex items-baseline justify-between gap-3 py-2 hover:text-primary">
                <span className="min-w-0 truncate text-sm">{x.instrument} <span className="text-xs text-muted">{date(x.tradedAt)}</span></span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", tone)}>{formatMoney(x.pnl, currency, locale, true)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">{t("stats.best.title")}</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {column(t("stats.best.best"), best, "text-success")}
        {column(t("stats.best.worst"), worst, "text-danger")}
      </div>
    </Card>
  );
}
