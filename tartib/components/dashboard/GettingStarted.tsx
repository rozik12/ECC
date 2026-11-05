"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

const KEY = "tartib.startHidden";
const listeners = new Set<() => void>();
const read = () => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};
const hide = () => {
  try { localStorage.setItem(KEY, "1"); } catch { /* хранилище недоступно */ }
  listeners.forEach((l) => l());
};

export type Step = { key: "trade" | "journal" | "diary" | "telegram"; done: boolean; href: string };

/** Карточка «Первые шаги»: что осталось попробовать. Исчезает, когда всё сделано или пользователь её скрыл. */
export function GettingStarted({ steps }: { steps: Step[] }) {
  const { t } = useI18n();
  const hidden = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, () => true);
  const left = steps.filter((s) => !s.done).length;
  if (hidden || left === 0) return null;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("start.title")}</h2>
          <p className="text-sm text-muted">{t("start.subtitle", { done: steps.length - left, total: steps.length })}</p>
        </div>
        <button type="button" onClick={hide} aria-label={t("start.hide")} title={t("start.hide")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-surface-muted", s.done && "text-muted")}>
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
              <span className={cn(s.done && "line-through")}>{t(`start.steps.${s.key}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
