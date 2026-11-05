"use client";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import type { LiveMode } from "./useLive";

/** Маленькая отметка «в реальном времени»: показывает, что цены обновляются сами. */
export function LiveBadge({ mode }: { mode: LiveMode }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
      <span className={cn("inline-block h-2 w-2 rounded-full", mode === "ws" ? "bg-success" : mode === "poll" ? "bg-warning" : "bg-muted")} aria-hidden />
      {mode === "ws" ? t("live.realtime") : mode === "poll" ? t("live.every15") : t("live.connecting")}
    </span>
  );
}
