import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { fetchQuote } from "@/lib/stock-data";

const SYMBOLS = ["QQQ", "SPY", "^NDX", "^VIX", "NQ=F"] as const;

/** Индексы и ETF США. Данные неофициальные и могут идти с задержкой; если источник не ответил, строка честно показывает «нет данных». */
export async function UsIndicesCard() {
  const { t, locale } = await getTranslator();
  const quotes = await Promise.all(SYMBOLS.map((s) => fetchQuote(s)));
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{t("usindices.title")}</h2>
      <ul className="divide-y divide-border">
        {SYMBOLS.map((s, i) => {
          const q = quotes[i];
          return (
            <li key={s} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span><span className="font-medium">{s.replace("=F", "")}</span> <span className="text-muted">{t(`usindices.names.${s.replace("^", "").replace("=F", "")}`)}</span></span>
              {q ? (
                <span className="flex items-baseline gap-3 tabular-nums">
                  <span>{formatNumber(q.price, locale, 2)}</span>
                  <span className={cn("w-16 text-right font-medium", s === "^VIX" ? "" : pnlTone(q.changePct))}>{q.changePct > 0 ? "+" : ""}{formatNumber(q.changePct, locale, 2)}%</span>
                </span>
              ) : (
                <span className="text-muted">{t("usindices.none")}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-muted">{t("usindices.note")}</p>
    </Card>
  );
}
