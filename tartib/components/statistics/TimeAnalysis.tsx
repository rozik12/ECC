import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/format";
import { byHourBlock, byWeekday, worstViolationBucket, type StatTrade } from "@/lib/statistics";
import { PnlBars } from "./charts";

const intl = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" } as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Когда ты торгуешь лучше и когда чаще нарушаешь правила. Только факты из твоего журнала. */
export async function TimeAnalysis({ trades, timeZone, currency }: { trades: StatTrade[]; timeZone: string; currency: string }) {
  const { t, locale } = await getTranslator();
  if (trades.length === 0) return null;

  const weekdayFmt = new Intl.DateTimeFormat(intl[locale], { weekday: "short", timeZone: "UTC" });
  const weekdayName = (i: number) => weekdayFmt.format(new Date(Date.UTC(2024, 0, 1 + i)));
  const hourName = (i: number) => `${pad(i * 3)}–${pad(i * 3 + 3)}`;
  const round = (n: number) => Math.round(n * 100) / 100;

  const days = byWeekday(trades, timeZone);
  const hours = byHourBlock(trades, timeZone);
  const worstDay = worstViolationBucket(days);
  const worstHour = worstViolationBucket(hours);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("stats.time.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("stats.time.subtitle", { tz: timeZone })}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">{t("stats.time.byWeekday")}</h3>
          <PnlBars label={t("stats.time.byWeekday")} currency={currency} data={days.map((d) => ({ name: weekdayName(d.index), value: round(d.pnl), count: d.count }))} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">{t("stats.time.byHour")}</h3>
          <PnlBars label={t("stats.time.byHour")} currency={currency} data={hours.map((h) => ({ name: hourName(h.index), value: round(h.pnl), count: h.count }))} />
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {worstDay ? (
          <li>{t("stats.time.worstDay", { day: weekdayName(worstDay.index), v: worstDay.violations, n: worstDay.count })}</li>
        ) : null}
        {worstHour ? (
          <li>{t("stats.time.worstHour", { hours: hourName(worstHour.index), v: worstHour.violations, n: worstHour.count })}</li>
        ) : null}
        {!worstDay && !worstHour ? <li className="text-muted">{t("stats.time.noPattern")}</li> : null}
      </ul>
      <p className="text-xs text-muted">{t("stats.time.note", { total: formatMoney(trades.reduce((s, x) => s + x.pnl, 0), currency, locale, true) })}</p>
    </Card>
  );
}
