import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import type { FearGreed } from "@/lib/market-feed";

const TONE: Record<FearGreed["label"], string> = { extreme_fear: "text-danger", fear: "text-warning", neutral: "text-muted", greed: "text-success", extreme_greed: "text-success" };

/** Индекс страха и жадности крипторынка (0 — крайний страх, 100 — крайняя жадность). */
export async function FearGreedCard({ data, dominance }: { data: FearGreed | null; dominance: number | null }) {
  const { t, locale } = await getTranslator();
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{t("market.fear.title")}</h2>
      {data ? (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums">{data.value}</span>
            <span className={cn("font-medium", TONE[data.label])}>{t(`market.fear.labels.${data.label}`)}</span>
          </div>
          <div className="relative h-2.5 rounded-full" style={{ background: "linear-gradient(90deg, var(--danger), var(--warning) 35%, var(--muted) 50%, var(--success) 75%)" }} role="img" aria-label={`${data.value} / 100`}>
            <span className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface bg-foreground" style={{ left: `${data.value}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted"><span>{t("market.fear.fear")}</span><span>{t("market.fear.greed")}</span></div>
          {data.previous !== null && <p className="text-sm text-muted">{t("market.fear.previous", { v: data.previous })}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">{t("market.unavailable")}</p>
      )}
      {dominance !== null && <p className="text-sm">{t("market.fear.dominance", { v: formatNumber(dominance, locale, 1) })}</p>}
      <p className="text-xs text-muted">{t("market.fear.hint")}</p>
    </Card>
  );
}
