"use client";

import { useState, useTransition } from "react";
import { setDisciplineGoalAction } from "@/app/actions/settings";
import { useI18n } from "@/lib/i18n/provider";

const GOALS = [60, 70, 80, 90, 100];

export function GoalSetter({ goal }: { goal: number }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = GOALS.includes(goal) ? GOALS : [...GOALS, goal].sort((a, b) => a - b);

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="goal-select" className="text-muted">{t("goal.change")}</label>
      <select
        id="goal-select"
        value={goal}
        disabled={pending}
        onChange={(e) => {
          setError(null);
          const value = Number(e.target.value);
          startTransition(async () => {
            const result = await setDisciplineGoalAction(value);
            if (!result.ok) setError(result.error);
          });
        }}
        className="h-9 rounded-lg border bg-surface px-2 text-sm"
      >
        {options.map((g) => (
          <option key={g} value={g}>{g}%</option>
        ))}
      </select>
      {error && <span role="alert" className="text-danger">{t(error)}</span>}
    </div>
  );
}
