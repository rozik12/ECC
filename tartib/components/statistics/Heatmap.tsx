import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { HEAT_BLOCK_HOURS, type HeatCell } from "@/lib/analytics";

const intl = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" } as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Тепловая карта «день недели × время суток». Цвет — итог в деньгах, число — количество сделок. */
export async function Heatmap({ cells, currency }: { cells: HeatCell[]; currency: string }) {
  const { t, locale } = await getTranslator();
  const blocks = 24 / HEAT_BLOCK_HOURS;
  const weekday = new Intl.DateTimeFormat(intl[locale], { weekday: "short", timeZone: "UTC" });
  const dayName = (i: number) => weekday.format(new Date(Date.UTC(2024, 0, 1 + i)));
  const max = Math.max(0, ...cells.map((c) => Math.abs(c.pnl)));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[22rem]" role="table" aria-label={t("adv.heat.title")}>
        <div className="mb-1 grid items-end gap-1" style={{ gridTemplateColumns: `2.5rem repeat(${blocks}, minmax(0, 1fr))` }} role="row">
          <span />
          {Array.from({ length: blocks }, (_, b) => (
            <span key={b} className="text-center text-[11px] text-muted" role="columnheader">{pad(b * HEAT_BLOCK_HOURS)}–{pad((b + 1) * HEAT_BLOCK_HOURS)}</span>
          ))}
        </div>
        {Array.from({ length: 7 }, (_, d) => (
          <div key={d} className="mb-1 grid gap-1" style={{ gridTemplateColumns: `2.5rem repeat(${blocks}, minmax(0, 1fr))` }} role="row">
            <span className="self-center text-xs capitalize text-muted" role="rowheader">{dayName(d)}</span>
            {cells.slice(d * blocks, (d + 1) * blocks).map((c) => {
              const strength = max > 0 ? Math.abs(c.pnl) / max : 0;
              const color = c.pnl >= 0 ? "--success" : "--danger";
              return (
                <span
                  key={c.block}
                  role="cell"
                  title={c.count === 0 ? t("adv.heat.empty") : `${formatMoney(c.pnl, currency, locale, true)}: ${c.count}`}
                  className={cn("flex h-9 items-center justify-center rounded-md text-xs font-medium tabular-nums", c.count === 0 ? "bg-surface-muted text-muted/50" : "text-foreground")}
                  style={c.count === 0 ? undefined : { backgroundColor: `color-mix(in srgb, var(${color}) ${Math.round(18 + 62 * strength)}%, transparent)` }}
                >
                  {c.count === 0 ? "·" : c.count}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
