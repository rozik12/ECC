import { Alert, Card } from "@/components/ui";
import { formatMoney, formatNumber } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { tiltAnalysis, type StatTrade, type TiltGroup } from "@/lib/statistics";

/** Как ты торгуешь в течение часа после убытка. Только факты из твоего журнала. */
export async function TiltCard({ trades, currency }: { trades: StatTrade[]; currency: string }) {
  const { t, locale } = await getTranslator();
  const r = tiltAnalysis(trades);
  if (r.afterLoss.count + r.other.count < 6) return null;

  const enough = r.afterLoss.count >= 3 && r.other.count >= 3;
  const line = (g: TiltGroup) => (
    <ul className="mt-2 space-y-1 text-sm">
      <li>{g.count} {t("stats.tilt.trades")}</li>
      <li>{g.violationRate === null ? t("stats.none") : `${formatNumber(g.violationRate, locale, 0)}% ${t("stats.tilt.violations")}`}</li>
      <li>{t("stats.tilt.avg")}: {g.avgPnl === null ? t("stats.none") : formatMoney(g.avgPnl, currency, locale, true)}</li>
    </ul>
  );

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("stats.tilt.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("stats.tilt.subtitle")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <h3 className="text-sm font-medium text-muted">{t("stats.tilt.afterLoss")}</h3>
          {line(r.afterLoss)}
        </div>
        <div className="rounded-lg border border-border p-3">
          <h3 className="text-sm font-medium text-muted">{t("stats.tilt.other")}</h3>
          {line(r.other)}
        </div>
      </div>
      {!enough ? <p className="text-sm text-muted">{t("stats.tilt.notEnough")}</p> : r.tilt ? <Alert tone="warning">{t("stats.tilt.warn")}</Alert> : <Alert tone="success">{t("stats.tilt.ok")}</Alert>}
    </Card>
  );
}
