import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney, formatNumber, dateFormat } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import type { Bucket } from "@/lib/statistics";


/** Календарь месяца: каждый день окрашен по результату. Чем больше |P&L|, тем насыщеннее цвет. */
export async function PnlCalendar({
  days,
  year,
  month,
  currency,
  prevHref,
  nextHref,
}: {
  days: Bucket[];
  year: number;
  month: number; // 1..12
  currency: string;
  prevHref: string;
  nextHref: string | null;
}) {
  const { t, locale } = await getTranslator();
  const key = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const byDay = new Map(days.map((d) => [d.key, d]));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // неделя с понедельника
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => byDay.get(key(i + 1)));
  const maxAbs = Math.max(1, ...monthDays.map((d) => Math.abs(d?.pnl ?? 0)));
  const total = monthDays.reduce((s, d) => s + (d?.pnl ?? 0), 0);
  const tradesTotal = monthDays.reduce((s, d) => s + (d?.count ?? 0), 0);

  const weekday = dateFormat(locale, { weekday: "short", timeZone: "UTC" });
  const heads = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(Date.UTC(2024, 0, 1 + i))));
  const title = dateFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("calendar.title")}</h2>
        <div className="flex items-center gap-1">
          <Link href={prevHref} aria-label={t("calendar.prev")} className="rounded-lg p-2 text-muted hover:bg-surface-muted"><ChevronLeft className="h-5 w-5" /></Link>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{title}</span>
          {nextHref ? (
            <Link href={nextHref} aria-label={t("calendar.next")} className="rounded-lg p-2 text-muted hover:bg-surface-muted"><ChevronRight className="h-5 w-5" /></Link>
          ) : (
            <span className="p-2 text-border"><ChevronRight className="h-5 w-5" /></span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {heads.map((h) => <div key={h} className="capitalize">{h}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {monthDays.map((d, i) => {
          const pct = d ? Math.round(15 + (45 * Math.abs(d.pnl)) / maxAbs) : 0;
          const tone = !d || d.pnl === 0 ? undefined : `color-mix(in srgb, var(${d.pnl > 0 ? "--success" : "--danger"}) ${pct}%, transparent)`;
          return (
            <div
              key={i}
              title={d ? `${formatMoney(d.pnl, currency, locale, true)} · ${t("calendar.trades", { n: d.count })}` : undefined}
              className={cn("flex aspect-square min-h-11 flex-col items-center justify-center rounded-lg border border-border text-xs", !d && "bg-surface-muted/40")}
              style={tone ? { backgroundColor: tone } : undefined}
            >
              <span className="font-medium">{i + 1}</span>
              {d && <span className="text-[10px] tabular-nums sm:text-xs">{formatNumber(Math.round(d.pnl), locale, 0)}</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted">
        {t("calendar.total", { pnl: formatMoney(total, currency, locale, true), n: tradesTotal })}
      </p>
    </Card>
  );
}
