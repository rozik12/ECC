import { Discipline3D } from "@/components/three/Lazy3D";
import { DisciplineFallback, disciplineColor } from "@/components/three/DisciplineFallback";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import type { DisciplineDay } from "@/lib/statistics";

/** Дисциплина по дням за 4 недели: объёмный график (там, где устройство его тянет) и текст для всех остальных. */
export async function Discipline3DCard({ days }: { days: DisciplineDay[] }) {
  const { t } = await getTranslator();
  const withTrades = days.filter((d) => d.percent !== null);
  const sorted = [...withTrades].sort((a, b) => (b.percent! - a.percent!) || b.total - a.total);
  const line = (d: DisciplineDay) => t("scene3d.dayLine", { day: d.day, percent: d.percent ?? 0, n: d.total });
  const legend = [
    { c: disciplineColor(90), k: "legendHigh" },
    { c: disciplineColor(60), k: "legendMid" },
    { c: disciplineColor(10), k: "legendLow" },
    { c: disciplineColor(null), k: "legendNone" },
  ] as const;
  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("scene3d.disciplineTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("scene3d.disciplineHint")}</p>
      {withTrades.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("scene3d.noData")}</p>
      ) : (
        <>
          <Discipline3D
            days={days.map((d) => ({ percent: d.percent }))}
            fallback={<DisciplineFallback days={days} />}
            label={t("scene3d.disciplineAlt")}
            className="mt-4 h-60 w-full overflow-hidden rounded-xl bg-surface-muted sm:h-72"
          />
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            {legend.map(({ c, k }) => (
              <li key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} aria-hidden />{t(`scene3d.${k}`)}</li>
            ))}
          </ul>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t("scene3d.best")}</dt><dd className="font-medium">{line(sorted[0])}</dd></div>
            <div><dt className="text-muted">{t("scene3d.worst")}</dt><dd className="font-medium">{line(sorted[sorted.length - 1])}</dd></div>
          </dl>
        </>
      )}
    </Card>
  );
}
