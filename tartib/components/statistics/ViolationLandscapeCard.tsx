import { Scene3D } from "@/components/three/Lazy3D";
import { Card } from "@/components/ui";
import { dtf } from "@/lib/intl-cache";
import { getTranslator } from "@/lib/i18n/server";
import { weekdayHourGrid, type StatTrade } from "@/lib/statistics";

const BLOCK = 3;
const MIN_TRADES = 10;
const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

/** «Ландшафт нарушений»: когда (день недели и время суток) вы чаще всего нарушаете правила. */
export async function ViolationLandscapeCard({ trades, timeZone }: { trades: StatTrade[]; timeZone: string }) {
  const { t, locale } = await getTranslator();
  const cells = weekdayHourGrid(trades, timeZone, BLOCK);
  const total = cells.reduce((s, c) => s + c.count, 0);
  const dayName = (i: number) => dtf(locale, { timeZone: "UTC", weekday: "long" }).format(new Date(Date.UTC(2024, 0, 1 + i)));
  const risky = cells.filter((c) => c.violations > 0 && c.count >= 2).sort((a, b) => b.violations / b.count - a.violations / a.count || b.violations - a.violations).slice(0, 3);
  const legend = [{ c: "#d9534f", k: "riskHigh" }, { c: "#e0a526", k: "riskMid" }, { c: "#2f9e6b", k: "riskLow" }] as const;
  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("scene3d.landscapeTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("scene3d.landscapeHint")}</p>
      {total < MIN_TRADES ? (
        <p className="mt-4 text-sm text-muted">{t("scene3d.landscapeNone")}</p>
      ) : (
        <>
          <Scene3D
            name="landscape"
            props={{ cells: cells.map((c) => ({ count: c.count, violations: c.violations })) }}
            fallback={<div className="flex h-full items-center justify-center text-sm text-muted">{t("scene3d.landscapeTop")}</div>}
            label={t("scene3d.landscapeAlt")}
            className="mt-4 h-72 w-full overflow-hidden rounded-xl bg-surface-muted sm:h-80"
          />
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            {legend.map(({ c, k }) => (
              <li key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} aria-hidden />{t(`scene3d.${k}`)}</li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-medium">{t("scene3d.landscapeTop")}</h3>
          {risky.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t("scene3d.noViolations")}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {risky.map((c) => (
                <li key={`${c.weekday}-${c.block}`}>{t("scene3d.landscapeSlot", { day: dayName(c.weekday), from: hh(c.block * BLOCK), to: hh((c.block + 1) * BLOCK), v: c.violations, n: c.count })}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
