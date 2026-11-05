import { Award, Lock } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getTranslator } from "@/lib/i18n/server";
import type { Achievement } from "@/lib/achievements";

export async function AchievementsCard({ items }: { items: Achievement[] }) {
  const { t } = await getTranslator();
  const done = items.filter((a) => a.unlocked).length;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-warning" aria-hidden />
          <h2 className="font-semibold">{t("achievements.title")}</h2>
        </div>
        <span className="text-sm text-muted tabular-nums">{done} / {items.length}</span>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((a) => (
          <li key={a.id} className={cn("flex items-center gap-3 rounded-xl border p-3", a.unlocked ? "border-success/40 bg-success-soft" : "border-border opacity-80")}>
            {a.unlocked ? <Award className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Lock className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
            <div className="min-w-0">
              <p className="text-sm font-medium">{t(`achievements.items.${a.id}.name`)}</p>
              <p className="text-xs text-muted">
                {a.unlocked ? t("achievements.done") : `${t(`achievements.items.${a.id}.hint`)} · ${a.current}/${a.target}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
