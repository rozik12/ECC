"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDiaryAction, saveDiaryAction } from "@/app/actions/diary";
import { Alert, Button, Card, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DiaryEntry } from "@/lib/diary";
import { useI18n } from "@/lib/i18n/provider";

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex gap-2" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn("h-11 w-11 rounded-xl border text-sm font-semibold transition-colors", value === n ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted hover:bg-surface-muted")}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Запись дневника за один день: настроение, энергия, план утром, итог и урок вечером. */
export function DiaryForm({ initial, readOnly }: { initial: DiaryEntry; readOnly: boolean }) {
  const { t } = useI18n();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const hasData = !!(initial.mood || initial.energy || initial.plan || initial.review || initial.lesson || initial.followedPlan !== null);
  const set = <K extends keyof DiaryEntry>(k: K, val: DiaryEntry[K]) => { setSaved(false); setV((p) => ({ ...p, [k]: val })); };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await saveDiaryAction({ day: v.day, mood: v.mood, energy: v.energy, plan: v.plan, review: v.review, lesson: v.lesson, followedPlan: v.followedPlan });
      if (!r.ok) return setError(r.error);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {saved && <Alert tone="success">{t("diary.saved")}</Alert>}
      {readOnly && <Alert tone="info">{t("diary.readOnly")}</Alert>}
      <Card className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Scale label={t("diary.mood")} value={v.mood} onChange={(x) => set("mood", x)} />
          <Scale label={t("diary.energy")} value={v.energy} onChange={(x) => set("energy", x)} />
        </div>
        <p className="-mt-2 text-xs text-muted">{t("diary.scaleHint")}</p>
        <Textarea id="d-plan" label={t("diary.plan")} hint={t("diary.planHint")} maxLength={2000} disabled={readOnly} value={v.plan} onChange={(e) => set("plan", e.target.value)} />
      </Card>
      <Card className="space-y-5">
        <Textarea id="d-review" label={t("diary.review")} hint={t("diary.reviewHint")} maxLength={2000} disabled={readOnly} value={v.review} onChange={(e) => set("review", e.target.value)} />
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("diary.followed")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("diary.followed")}>
            {([[true, "diary.yes"], [false, "diary.no"]] as const).map(([val, key]) => (
              <button key={key} type="button" disabled={readOnly} aria-pressed={v.followedPlan === val} onClick={() => set("followedPlan", v.followedPlan === val ? null : val)}
                className={cn("h-11 min-w-20 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-50", v.followedPlan === val ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted hover:bg-surface-muted")}>
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        <Textarea id="d-lesson" label={t("diary.lesson")} hint={t("diary.lessonHint")} maxLength={500} disabled={readOnly} value={v.lesson} onChange={(e) => set("lesson", e.target.value)} />
      </Card>
      {!readOnly && (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={pending}>{t("common.save")}</Button>
          {hasData && (
            <Button type="button" variant="secondary" size="lg" disabled={pending} onClick={() => { if (window.confirm(t("diary.deleteConfirm"))) startTransition(async () => { const r = await deleteDiaryAction(v.day); if (!r.ok) return setError(r.error); router.refresh(); }); }}>
              {t("diary.delete")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
