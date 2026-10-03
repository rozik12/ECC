import { Flame } from "lucide-react";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import type { Streak } from "@/lib/statistics";

const MILESTONES = [5, 10, 20, 50, 100];

/** Серия дисциплины: сколько сделок подряд без нарушений правил. */
export async function StreakCard({ streak }: { streak: Streak }) {
  const { t } = await getTranslator();
  const next = MILESTONES.find((m) => m > streak.current) ?? null;
  const reached = [...MILESTONES].reverse().find((m) => m <= streak.current) ?? null;
  const prev = reached ?? 0;
  const progress = next ? Math.round(((streak.current - prev) / (next - prev)) * 100) : 100;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-warning" aria-hidden />
        <h2 className="font-semibold">{t("streak.title")}</h2>
      </div>
      <div className="mt-3 flex items-end gap-6">
        <div>
          <p className="text-4xl font-bold tabular-nums">{streak.current}</p>
          <p className="text-sm text-muted">{t("streak.current")}</p>
        </div>
        <div className="text-sm text-muted">
          <p>{t("streak.best", { n: streak.best })}</p>
          <p>
            {streak.daysSinceViolation === null
              ? t("streak.neverViolated")
              : t("streak.daysSince", { n: streak.daysSinceViolation })}
          </p>
        </div>
      </div>
      {next ? (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-surface-muted" aria-hidden>
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{t("streak.next", { m: next, left: next - streak.current })}</p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">{t("streak.top")}</p>
      )}
      {reached && <p className="mt-2 text-xs font-medium text-success">{t("streak.milestone", { m: reached })}</p>}
    </Card>
  );
}
