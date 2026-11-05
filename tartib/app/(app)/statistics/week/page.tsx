import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, ListChecks } from "lucide-react";
import { buttonStyles, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts } from "@/lib/data";
import { formatMoney, formatNumber, pnlTone, dateFormat } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { safeTimeZone } from "@/lib/time";
import { weekReview, type DayResult } from "@/lib/weekly";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("week.title") };
}

/** Недельный разбор на одном экране: итог, сравнение с прошлой неделей, лучший и худший день и один вывод. */
export default async function WeekPage() {
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);
  const [accounts, all] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase)]);
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);
  const goal = profile?.discipline_goal ?? 80;
  const r = weekReview(all, tz, new Date(), goal);
  const none = t("stats.none");
  const pct = (v: number | null) => (v === null ? none : `${formatNumber(v, locale, 0)}%`);
  const dayText = (d: DayResult) =>
    `${dateFormat(locale, { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(`${d.day}T00:00:00Z`))} · ${money(d.pnl, true)}`;

  const delta = (cur: number | null, prev: number | null, fmt: (v: number) => string) =>
    cur === null || prev === null ? null : cur - prev === 0 ? t("week.same") : `${cur - prev > 0 ? "+" : "−"}${fmt(Math.abs(cur - prev))} ${t("week.vsPrev")}`;

  const tk = r.takeaway;
  const takeawayText =
    tk.kind === "rule" ? t("week.takeRule", { name: tk.name, n: tk.count, amount: money(tk.pnl, true) })
    : tk.kind === "mistake" ? t("week.takeMistake", { name: t(`journal.mistakeNames.${tk.key}`), n: tk.count, amount: money(tk.pnl, true) })
    : tk.kind === "discipline" ? t("week.takeDiscipline", { pct: formatNumber(tk.pct, locale, 0), goal: tk.goal })
    : tk.kind === "steady" ? t("week.takeSteady")
    : t("week.takeNone");

  const kpi = (label: string, value: string, sub: string | null, tone = "") => (
    <Card className="p-4 sm:p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/statistics" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("adv.back")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("week.title")}</h1>
        <p className="mt-1 text-muted">{t("week.subtitle")}</p>
      </div>

      {r.current.count === 0 ? (
        <Card className="space-y-4 py-10 text-center">
          <p className="text-lg">{t("week.empty")}</p>
          <div className="flex justify-center"><Link href="/trades/new" className={buttonStyles({ size: "lg" })}>{t("trades.add")}</Link></div>
        </Card>
      ) : (
        <>
          <Card className="space-y-2 border-primary/40">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted">{t("week.takeaway")}</h2>
            <p className="text-lg leading-snug">{takeawayText}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/rules" className={buttonStyles({ variant: "secondary", size: "sm" })}><ListChecks className="h-4 w-4" aria-hidden /> {t("nav.rules")}</Link>
              <Link href="/diary" className={buttonStyles({ variant: "secondary", size: "sm" })}><BookOpen className="h-4 w-4" aria-hidden /> {t("nav.diary")}</Link>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi(t("week.result"), money(r.current.pnl, true), delta(r.current.pnl, r.previous.count ? r.previous.pnl : null, (v) => money(v)), pnlTone(r.current.pnl))}
            {kpi(t("week.trades"), String(r.current.count), r.previous.count ? `${t("week.was")} ${r.previous.count}` : null)}
            {kpi(t("week.winRate"), pct(r.current.winRate), delta(r.current.winRate, r.previous.winRate, (v) => `${formatNumber(v, locale, 0)}%`))}
            {kpi(t("week.discipline"), pct(r.current.disciplinePct), delta(r.current.disciplinePct, r.previous.disciplinePct, (v) => `${formatNumber(v, locale, 0)}%`), r.current.disciplinePct !== null && r.current.disciplinePct >= goal ? "text-success" : "")}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {r.best && <Card className="p-4 sm:p-4"><p className="text-sm text-muted">{t("week.best")}</p><p className={cn("mt-1 font-semibold", pnlTone(r.best.pnl))}>{dayText(r.best)}</p></Card>}
            {r.worst && r.worst.day !== r.best?.day && <Card className="p-4 sm:p-4"><p className="text-sm text-muted">{t("week.worst")}</p><p className={cn("mt-1 font-semibold", pnlTone(r.worst.pnl))}>{dayText(r.worst)}</p></Card>}
          </div>
        </>
      )}
      <p className="text-xs text-muted">{t("week.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
