import { Lock } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import type { Plan } from "@/lib/plans";
import type { WeeklyReportContent } from "@/services/ai";
import { GenerateReportButton } from "./GenerateReportButton";

/** Недельный отчёт: тексты собираются из цифр на языке пользователя. */
export async function WeeklyReportCard({
  plan,
  report,
  currency,
}: {
  plan: Plan;
  report: WeeklyReportContent | null;
  currency: string;
}) {
  const { t, locale } = await getTranslator();
  const money = (v: number) => formatMoney(v, currency, locale, true);

  if (plan !== "pro") {
    return (
      <Card>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("reports.title")}</h2>
          <Badge tone="primary">PRO</Badge>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("reports.proOnly")} {t("reports.proSoon")}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("reports.title")}</h2>
        <GenerateReportButton hasReport={report !== null} />
      </div>

      {report === null ? (
        <p className="mt-4 text-sm text-muted">{t("reports.none")}</p>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-muted">{t("reports.period", { from: report.periodStart, to: report.periodEnd })}</p>
          {report.summary && <p className="whitespace-pre-wrap rounded-xl bg-primary-soft p-4 leading-relaxed">{report.summary}</p>}
          {report.tradesCount === 0 ? (
            <p>{t("reports.noTrades")}</p>
          ) : (
            <ul className="space-y-2">
              <li>{t("reports.trades", { n: report.tradesCount })}</li>
              <li>{t("reports.result", { pnl: money(report.totalPnl) })}</li>
              <li>{t("reports.violationTrades", { n: report.violationTradesCount })}</li>
              <li>
                {report.topViolation
                  ? t("reports.topViolation", { name: report.topViolation.name, count: report.topViolation.count, pnl: money(report.topViolation.pnl) })
                  : t("reports.noViolations")}
              </li>
              {report.bestCategory && (
                <li>
                  {t("reports.best", {
                    kind: t(`reports.kinds.${report.bestCategory.kind}`),
                    key: report.bestCategory.kind === "emotion" ? t(`emotions.${report.bestCategory.key}`) : report.bestCategory.key,
                    pnl: money(report.bestCategory.pnl),
                    n: report.bestCategory.count,
                  })}
                </li>
              )}
            </ul>
          )}
          <p className="pt-1 text-xs text-muted">
            {t(`reports.by.${report.generatedBy}`)} · {t("reports.note")}
          </p>
        </div>
      )}
    </Card>
  );
}
