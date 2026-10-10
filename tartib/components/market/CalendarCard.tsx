import { dateFormat } from "@/lib/format";
import Link from "next/link";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getTranslator } from "@/lib/i18n/server";
import { upcomingEvents, type CalendarEvent } from "@/lib/market-feed";


/** Экономический календарь недели: ближайшие важные события в часовом поясе пользователя. Данные: ForexFactory. */
export async function CalendarCard({ events, timeZone, all, now }: { events: CalendarEvent[]; timeZone: string; all: boolean; now: number }) {
  const { t, locale } = await getTranslator();
  const shown = upcomingEvents(events, now, { impacts: all ? ["high", "medium", "low"] : ["high"], limit: 14 });
  const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ms));
  const dayLabel = (ms: number) => {
    if (dayKey(ms) === dayKey(now)) return t("market.calendar.today");
    if (dayKey(ms) === dayKey(now + 86_400_000)) return t("market.calendar.tomorrow");
    return dateFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(ms));
  };
  const time = (ms: number) => dateFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(ms));
  const groups: { key: string; label: string; items: CalendarEvent[] }[] = [];
  for (const e of shown) {
    const key = dayKey(e.at);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(e);
    else groups.push({ key, label: dayLabel(e.at), items: [e] });
  }
  const chip = (active: boolean) => cn("rounded-lg border px-3 py-1 text-xs font-medium", active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-foreground");

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("market.calendar.title")}</h2>
          <p className="mt-1 text-xs text-muted">{t("market.calendar.subtitle", { tz: timeZone })}</p>
        </div>
        <nav className="flex gap-2" aria-label={t("market.calendar.title")}>
          <Link href="/market" className={chip(!all)} aria-current={!all ? "page" : undefined}>{t("market.calendar.important")}</Link>
          <Link href="/market?events=all" className={chip(all)} aria-current={all ? "page" : undefined}>{t("market.calendar.allEvents")}</Link>
        </nav>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted">{events.length === 0 ? t("market.unavailable") : t("market.calendar.none")}</p>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <h3 className="mb-1 text-sm font-medium capitalize text-muted">{g.label}</h3>
            <ul className="divide-y divide-border">
              {g.items.map((e) => (
                <li key={`${e.at}-${e.title}-${e.country}`} className="flex items-start gap-3 py-2">
                  <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-muted">{time(e.at)}</span>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", e.impact === "high" ? "bg-danger" : e.impact === "medium" ? "bg-warning" : "bg-muted")} title={t(`market.calendar.impact.${e.impact}`)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm"><span className="mr-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-xs font-semibold">{e.country}</span>{e.title}</span>
                    {(e.forecast || e.previous) && (
                      <span className="mt-0.5 block text-xs text-muted">
                        {e.forecast && `${t("market.calendar.forecast")}: ${e.forecast}`}{e.forecast && e.previous && " · "}{e.previous && `${t("market.calendar.previous")}: ${e.previous}`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Card>
  );
}
