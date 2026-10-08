import { Target } from "lucide-react";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import type { MonthGoal } from "@/lib/achievements";
import { GoalSetter } from "./GoalSetter";

/** Цель месяца: какую долю сделок ты хочешь делать по своим правилам. */
export async function GoalCard({ data }: { data: MonthGoal }) {
  const { t } = await getTranslator();
  const percent = data.percent ?? 0;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-semibold">{t("goal.title")}</h2>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-4xl font-bold tabular-nums">{data.percent === null ? "—" : `${data.percent}%`}</p>
        <p className="text-sm text-muted">{t("goal.target", { n: data.goal })}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-surface-muted" aria-hidden>
        <div className={`h-2 rounded-full ${data.reached ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {data.percent === null
          ? t("goal.noTrades")
          : data.reached
            ? t("goal.reached", { followed: data.followed, total: data.total })
            : data.needed !== null
              ? t("goal.left", { followed: data.followed, total: data.total, n: data.needed })
              : t("goal.progress", { followed: data.followed, total: data.total })}
      </p>
      <div className="mt-3"><GoalSetter goal={data.goal} /></div>
    </Card>
  );
}
