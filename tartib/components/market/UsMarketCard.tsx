"use client";

import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dateFormat } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { zonedTime } from "@/lib/time";
import { NY, nextChange, nyDate, phaseAt, sessionMinutes, upcomingClosures, isTradingDay, type Phase } from "@/lib/us-market";

// Снимок = текущая минута, обновляется раз в 30 секунд; на сервере 0, чтобы не было расхождений при загрузке.
function subscribe(cb: () => void) {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

const PHASE_STYLE: Record<Phase, string> = {
  regular: "bg-success-soft text-success",
  pre: "bg-primary-soft text-primary",
  after: "bg-primary-soft text-primary",
  closed: "bg-surface-muted text-muted",
};

/** Часы американской биржи: фаза, отсчёт до смены, расписание в часовом поясе пользователя и ближайшие выходные. */
export function UsMarketCard({ timeZone }: { timeZone?: string }) {
  const { t, locale } = useI18n();
  const minute = useSyncExternalStore(subscribe, minuteNow, () => 0);
  if (minute === 0) return <Card className="h-56 animate-pulse" aria-hidden />;

  const now = new Date(minute * 60_000);
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const phase = phaseAt(now);
  const next = nextChange(now);
  const left = Math.max(0, Math.round((next.at.getTime() - now.getTime()) / 60_000));
  const dur = [left >= 1440 ? t("tools.sessions.d", { d: Math.floor(left / 1440) }) : "", Math.floor((left % 1440) / 60) ? t("tools.sessions.h", { h: Math.floor((left % 1440) / 60) }) : "", left < 1440 && (left % 60 || left < 60) ? t("tools.sessions.m", { m: left % 60 }) : ""].filter(Boolean).join(" ");

  // Расписание ближайшего торгового дня (сегодня, если ещё не закончился)
  const today = nyDate(now);
  let day = { y: today.y, m: today.m, d: today.d };
  for (let i = 0; i < 10; i++) {
    const s = sessionMinutes(day);
    if (isTradingDay(day) && (i > 0 || today.minutes < s.end)) break;
    const n = new Date(Date.UTC(day.y, day.m - 1, day.d + 1));
    day = { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() };
  }
  const s = sessionMinutes(day);
  const at = (min: number) => zonedTime(NY, day.y, day.m, day.d, Math.floor(min / 60), min % 60);
  const hm = dateFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const rows: { id: string; from: number; to: number }[] = [
    { id: "pre", from: s.pre, to: s.open },
    { id: "regular", from: s.open, to: s.close },
    { id: "after", from: s.close, to: s.end },
  ];
  const closures = upcomingClosures(today, 3);
  const dayFmt = dateFormat(locale, { timeZone: "UTC", day: "numeric", month: "long" });

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("usmarket.title")}</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PHASE_STYLE[phase])}>{t(`usmarket.phase.${phase}`)}</span>
      </div>
      <p className="text-sm">{t(`usmarket.next.${next.to}`, { t: dur })}</p>
      <ul className="divide-y divide-border text-sm">
        {rows.map((r) => (
          <li key={r.id} className={cn("flex items-center justify-between gap-3 py-2", ((phase === "pre" && r.id === "pre") || (phase === "regular" && r.id === "regular") || (phase === "after" && r.id === "after")) && "font-semibold")}>
            <span>{t(`usmarket.phase.${r.id}`)}</span>
            <span className="tabular-nums text-muted">{hm.format(at(r.from))}–{hm.format(at(r.to))}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("usmarket.tz", { tz, day: dayFmt.format(new Date(Date.UTC(day.y, day.m - 1, day.d))) })}</p>
      {closures.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{t("usmarket.closures")}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {closures.map((c) => {
              const [y, m, d] = c.date.split("-").map(Number);
              return (
                <li key={c.date} className="flex justify-between gap-3">
                  <span>{t(`usmarket.holiday.${c.key}`)}</span>
                  <span className="tabular-nums text-muted">{dayFmt.format(new Date(Date.UTC(y, m - 1, d)))}{c.early ? ` · ${t("usmarket.early")}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted">{t("usmarket.note")}</p>
    </Card>
  );
}
