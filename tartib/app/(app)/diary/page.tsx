import type { Metadata } from "next";
import Link from "next/link";
import { DiaryForm } from "@/components/diary/DiaryForm";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades } from "@/lib/data";
import { diaryStreak, isDay, isFilled, localDay, moodVsResult, planVsResult, shiftDay, type DiaryEntry } from "@/lib/diary";
import { formatMoney, formatNumber, pnlTone, dateFormat } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("diary.title") };
}

type Row = { day: string; mood: number | null; energy: number | null; plan: string; review: string; lesson: string; followed_plan: boolean | null };
const toEntry = (r: Row): DiaryEntry => ({ day: r.day, mood: r.mood, energy: r.energy, plan: r.plan, review: r.review, lesson: r.lesson, followedPlan: r.followed_plan });

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);
  const today = localDay(new Date(), tz);
  const day = sp.day && isDay(sp.day) && sp.day <= today && sp.day >= shiftDay(today, -400) ? sp.day : today;
  const editable = day >= shiftDay(today, -14);

  const [{ data }, trades] = await Promise.all([
    supabase.from("diary_entries").select("day, mood, energy, plan, review, lesson, followed_plan").order("day", { ascending: false }).limit(400),
    fetchStatTrades(supabase),
  ]);
  const entries = ((data ?? []) as Row[]).map(toEntry);
  const current = entries.find((e) => e.day === day) ?? { day, mood: null, energy: null, plan: "", review: "", lesson: "", followedPlan: null };
  const streak = diaryStreak(entries.filter(isFilled).map((e) => e.day), today);
  const moods = moodVsResult(entries, trades, tz);
  const plans = planVsResult(entries, trades, tz);
  const currency = profile?.currency ?? "USD";
  const money = (v: number) => formatMoney(v, currency, locale, true);
  const dateText = (d: string) => dateFormat(locale, { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const recent = Array.from({ length: 7 }, (_, i) => shiftDay(today, -i));
  const history = entries.filter(isFilled).slice(0, 20);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("diary.title")}</h1>
        <p className="mt-1 text-muted">{t("diary.subtitle")}</p>
      </div>

      <nav aria-label={t("diary.days")} className="flex gap-2 overflow-x-auto pb-1">
        {recent.map((d) => {
          const filled = entries.some((e) => e.day === d && isFilled(e));
          return (
            <Link key={d} href={d === today ? "/diary" : `/diary?day=${d}`} aria-current={d === day ? "page" : undefined}
              className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm", d === day ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border text-muted hover:text-foreground")}>
              {d === today ? t("diary.today") : d.slice(8) + "." + d.slice(5, 7)}
              {filled && <span aria-label={t("diary.filled")} className="h-2 w-2 rounded-full bg-success" />}
            </Link>
          );
        })}
      </nav>

      <h2 className="text-lg font-semibold">{dateText(day)}</h2>
      <DiaryForm key={day} initial={current} readOnly={!editable} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t("diary.streak")}</p>
          <p className="text-2xl font-bold tabular-nums">{streak.current} <span className="text-base font-normal text-muted">{t("diary.daysWord")}</span></p>
          <p className="text-xs text-muted">{t("diary.streakBest", { n: streak.longest })}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t("diary.planEffect")}</p>
          {plans.followed || plans.broken ? (
            <dl className="space-y-1 text-sm">
              {plans.followed && <div className="flex justify-between gap-3"><dt>{t("diary.planYesDays", { n: plans.followed.days })}</dt><dd className={cn("font-semibold tabular-nums", pnlTone(plans.followed.avgPnl))}>{money(plans.followed.avgPnl)}</dd></div>}
              {plans.broken && <div className="flex justify-between gap-3"><dt>{t("diary.planNoDays", { n: plans.broken.days })}</dt><dd className={cn("font-semibold tabular-nums", pnlTone(plans.broken.avgPnl))}>{money(plans.broken.avgPnl)}</dd></div>}
              <p className="text-xs text-muted">{t("diary.avgPerDay")}</p>
            </dl>
          ) : (
            <p className="text-sm text-muted">{t("diary.planEffectNone")}</p>
          )}
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">{t("diary.moodEffect")}</h2>
        {moods.length < 2 ? (
          <p className="text-sm text-muted">{t("diary.moodNone")}</p>
        ) : (
          <>
            <ul className="divide-y divide-border text-sm">
              {moods.map((m) => (
                <li key={m.mood} className="flex items-center justify-between gap-3 py-2">
                  <span>{t("diary.moodLevel", { n: m.mood })} <span className="text-muted">· {t("diary.daysCount", { n: m.days })}</span></span>
                  <span className={cn("font-semibold tabular-nums", pnlTone(m.avgPnl))}>{money(m.avgPnl)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t("diary.moodNote")} {formatNumber(moods.reduce((s, m) => s + m.days, 0), locale, 0)}.</p>
          </>
        )}
      </Card>

      {history.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">{t("diary.history")}</h2>
          <ul className="divide-y divide-border">
            {history.map((e) => (
              <li key={e.day} className="py-3">
                <Link href={e.day === today ? "/diary" : `/diary?day=${e.day}`} className="font-medium text-primary hover:underline">{dateText(e.day)}</Link>
                {e.lesson && <p className="mt-1 text-sm">{e.lesson}</p>}
                {!e.lesson && e.review && <p className="mt-1 line-clamp-2 text-sm text-muted">{e.review}</p>}
                {!e.lesson && !e.review && e.plan && <p className="mt-1 line-clamp-2 text-sm text-muted">{e.plan}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">{t("common.disclaimer")}</p>
    </div>
  );
}
