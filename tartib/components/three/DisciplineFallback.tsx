import type { DisciplineDay } from "@/lib/statistics";

export const disciplineColor = (p: number | null) => (p === null ? "#8d97a8" : p >= 80 ? "#2f9e6b" : p >= 50 ? "#e0a526" : "#d9534f");

/** Плоский вариант графика дисциплины: те же 28 столбиков без 3D. */
export function DisciplineFallback({ days }: { days: DisciplineDay[] }) {
  return (
    <div className="flex h-full items-end gap-1 px-2 pb-2" aria-hidden>
      {days.map((d) => (
        <div key={d.day} className="flex-1 rounded-t" style={{ height: `${d.percent === null ? 4 : 10 + d.percent * 0.85}%`, background: disciplineColor(d.percent) }} />
      ))}
    </div>
  );
}
