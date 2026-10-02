import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DisciplineCost } from "@/lib/statistics";
import { formatMoney, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

/** Главный блок продукта: сколько заработано по правилам и сколько стоили нарушения. */
export async function DisciplineCostCard({
  data,
  currency,
  subtitle,
  moreHref,
}: {
  data: DisciplineCost;
  currency: string;
  subtitle?: string;
  moreHref?: string;
}) {
  const { t, locale } = await getTranslator();
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);
  const total = data.followedCount + data.violatedCount;
  const maxAbs = Math.max(Math.abs(data.followedPnl), Math.abs(data.violatedPnl), 1);
  const width = (v: number) => `${Math.max(2, (Math.abs(v) / maxAbs) * 100)}%`;

  const message =
    total === 0
      ? t("stats.discipline.empty")
      : data.violatedCount === 0
        ? t("stats.discipline.noViolations")
        : data.cost > 0
          ? t("stats.discipline.costText", { amount: money(data.cost) })
          : t("stats.discipline.noLoss");

  const column = (label: string, pnl: number, count: number) => (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", pnlTone(pnl))}>{money(pnl, true)}</p>
      <p className="text-xs text-muted">{t("stats.discipline.trades", { n: count })}</p>
    </div>
  );

  return (
    <Card className="border-primary/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("stats.discipline.title")}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
        {column(t("stats.discipline.followed"), data.followedPnl, data.followedCount)}
        {column(t("stats.discipline.violated"), data.violatedPnl, data.violatedCount)}
        <div className="col-span-2 sm:col-span-1">
          <p className="text-sm text-muted">{t("stats.discipline.cost")}</p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums", data.cost > 0 ? "text-danger" : "text-muted")}>{money(data.cost)}</p>
          <p className="text-xs text-muted">
            {t("stats.discipline.difference")}: {money(data.difference, true)}
          </p>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-6 space-y-2" aria-hidden>
          <div className="h-3 rounded-full bg-surface-muted">
            <div className={cn("h-3 rounded-full", data.followedPnl >= 0 ? "bg-success" : "bg-danger")} style={{ width: width(data.followedPnl) }} />
          </div>
          <div className="h-3 rounded-full bg-surface-muted">
            <div className={cn("h-3 rounded-full", data.violatedPnl >= 0 ? "bg-success" : "bg-danger")} style={{ width: width(data.violatedPnl) }} />
          </div>
        </div>
      )}

      <p className="mt-5 text-sm">{message}</p>
      {moreHref && (
        <Link href={moreHref} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("dashboard.discipline.more")} →
        </Link>
      )}
    </Card>
  );
}
