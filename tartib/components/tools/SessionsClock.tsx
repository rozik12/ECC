"use client";

import { dateFormat } from "@/lib/format";
import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { SESSIONS, sessionStatus } from "@/lib/tools";

// Часы обновляются раз в 30 секунд. Снимок = текущая минута; на сервере 0, чтобы не было расхождений при загрузке.
function subscribe(cb: () => void) {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

export function SessionsClock() {
  const { t, locale } = useI18n();
  const minute = useSyncExternalStore(subscribe, minuteNow, () => 0);
  if (minute === 0) return <Card className="h-48 animate-pulse" aria-hidden />;

  const now = new Date(minute * 60_000);
  const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dur = (mins: number) => {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    return [d ? t("tools.sessions.d", { d }) : "", h ? t("tools.sessions.h", { h }) : "", !d && (m || !h) ? t("tools.sessions.m", { m }) : ""].filter(Boolean).join(" ");
  };
  const rows = SESSIONS.map((s) => ({ s, st: sessionStatus(now, s) }));
  const openNames = rows.filter((r) => r.st.open).map((r) => t(`tools.sessions.names.${r.s.id}`));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t("tools.sessions.yourTime", { tz })}: <span className="font-medium text-foreground tabular-nums">{dateFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now)}</span>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ s, st }) => (
          <li key={s.id}>
            <Card className={cn("h-full", st.open && "border-success/50")}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{t(`tools.sessions.names.${s.id}`)}</h2>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.open ? "bg-success-soft text-success" : "bg-surface-muted text-muted")}>
                  {st.open ? t("tools.sessions.open") : t("tools.sessions.closed")}
                </span>
              </div>
              <p className="mt-2 text-sm">{st.open ? t("tools.sessions.closesIn", { t: dur(st.minutes) }) : t("tools.sessions.opensIn", { t: dur(st.minutes) })}</p>
              <p className="mt-1 text-xs text-muted">{t("tools.sessions.hours", { o: s.open, c: s.close })}</p>
            </Card>
          </li>
        ))}
      </ul>
      {openNames.length >= 2 && <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">{t("tools.sessions.overlap", { names: openNames.join(" + ") })}</p>}
      <p className="text-xs leading-relaxed text-muted">{t("tools.sessions.note")}</p>
    </div>
  );
}
