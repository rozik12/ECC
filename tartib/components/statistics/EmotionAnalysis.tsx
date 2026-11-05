import { Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import type { EmotionStat } from "@/lib/statistics";

const MIN_TRADES = 3;

/** Выводы только по данным пользователя. Если сделок с эмоцией меньше 3 — честно пишем, что данных мало. */
export async function EmotionAnalysis({ stats, currency }: { stats: EmotionStat[]; currency: string }) {
  const { t, locale } = await getTranslator();
  if (stats.length === 0) return null;
  const money = (v: number) => formatMoney(v, currency, locale, true);
  const label = (e: string) => t(`emotions.${e}`);

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("stats.emotions.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("stats.emotions.subtitle")}</p>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>{t("trades.cols.emotion")}</Th>
              <Th>{t("stats.emotions.count")}</Th>
              <Th>{t("stats.emotions.total")}</Th>
              <Th>{t("stats.emotions.average")}</Th>
            </Tr>
          </THead>
          <TBody>
            {stats.map((s) => (
              <Tr key={s.emotion}>
                <Td label={t("trades.cols.emotion")} className="font-medium">{label(s.emotion)}</Td>
                <Td label={t("stats.emotions.count")} className="tabular-nums">{s.count}</Td>
                <Td label={t("stats.emotions.total")} className={cn("tabular-nums", pnlTone(s.total))}>{money(s.total)}</Td>
                <Td label={t("stats.emotions.average")} className={cn("tabular-nums", s.count >= MIN_TRADES ? pnlTone(s.average) : "text-muted")}>
                  {s.count >= MIN_TRADES ? money(s.average) : "—"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {stats.map((s) => (
          <li key={s.emotion} className={s.count >= MIN_TRADES ? "" : "text-muted"}>
            {s.count >= MIN_TRADES
              ? t("stats.emotions.insight", { emotion: label(s.emotion), avg: money(s.average) })
              : t("stats.emotions.tooFew", { emotion: label(s.emotion), n: s.count })}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">{t("stats.emotions.note")}</p>
    </Card>
  );
}
