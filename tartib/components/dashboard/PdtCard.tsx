import { Card } from "@/components/ui";
import { dateFormat } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getTranslator } from "@/lib/i18n/server";
import { PDT_EQUITY_LIMIT, PDT_MAX_FREE, PDT_WINDOW_DAYS, type PdtState } from "@/lib/pdt";

/** Счётчик дей-трейдов по акциям США за 5 торговых дней. Справочный: правило зависит от брокера и типа счёта. */
export async function PdtCard({ state, applies }: { state: PdtState; applies: boolean | null }) {
  const { t, locale } = await getTranslator();
  const weekday = dateFormat(locale, { weekday: "short", timeZone: "UTC" });
  const tone = state.level === "flag" ? "text-danger" : state.level === "warn" ? "text-warning" : "text-foreground";
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{t("pdt.title")}</h2>
        <span className={cn("text-2xl font-bold tabular-nums", tone)}>{state.count}<span className="text-base font-medium text-muted"> / {PDT_MAX_FREE}</span></span>
      </div>
      <p className="text-sm text-muted">{t("pdt.window", { n: PDT_WINDOW_DAYS })}</p>
      <ol className="flex gap-1.5">
        {[...state.days].reverse().map((d) => (
          <li key={d.date} className="flex-1 text-center" title={d.date}>
            <div className={cn("flex h-9 items-center justify-center rounded-lg text-sm font-medium", d.count > 0 ? "bg-primary-soft text-primary" : "bg-surface-muted text-muted")}>{d.count}</div>
            <div className="mt-1 text-[11px] uppercase text-muted">{weekday.format(new Date(`${d.date}T12:00:00Z`))}</div>
          </li>
        ))}
      </ol>
      <p className={cn("text-sm", tone)}>
        {state.level === "flag" ? t("pdt.flag") : state.level === "warn" ? t("pdt.warn") : t("pdt.ok", { n: state.left })}
      </p>
      <p className="text-xs leading-relaxed text-muted">
        {applies === false ? t("pdt.notApplies", { limit: PDT_EQUITY_LIMIT.toLocaleString("en-US") }) : t("pdt.rule", { limit: PDT_EQUITY_LIMIT.toLocaleString("en-US") })} {t("pdt.note")}
      </p>
    </Card>
  );
}
