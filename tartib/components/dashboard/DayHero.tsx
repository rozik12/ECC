import Link from "next/link";
import { BookOpen, Plus, Zap } from "lucide-react";
import { buttonStyles } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getTranslator } from "@/lib/i18n/server";

type Props = {
  /** Результат дня, уже отформатированный в деньгах, и его знак для цвета */
  pnlText: string;
  pnlTone: string;
  tradesToday: number;
  violationsToday: number;
  winRateText: string;
  balanceText: string;
  /** Доля сделок по правилам в этом месяце, % (null — сделок нет) и цель */
  monthPercent: number | null;
  goal: number;
  /** Дневной итог отрицательный (для спокойного напоминания) */
  losingDay: boolean;
};

/** Кольцо дисциплины: доля сделок по правилам за месяц. Цвет зависит от цели, а не от прибыли. */
function Ring({ percent, goal, label }: { percent: number | null; goal: number; label: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const value = percent ?? 0;
  const ok = percent !== null && percent >= goal;
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={`${label}: ${percent === null ? "—" : `${percent}%`}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          stroke={ok ? "var(--success)" : "var(--primary)"}
          strokeDasharray={`${(c * value) / 100} ${c}`}
        />
        {/* Метка цели на кольце */}
        <circle cx={50 + r * Math.cos((goal / 100) * 2 * Math.PI)} cy={50 + r * Math.sin((goal / 100) * 2 * Math.PI)} r="2.6" fill="var(--foreground)" opacity="0.7" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none">{percent === null ? "—" : `${percent}%`}</span>
        <span className="mt-1 max-w-[4.5rem] truncate text-[9px] uppercase tracking-wide text-muted">{label}</span>
      </div>
    </div>
  );
}

/** Верх главной страницы: итог дня, дисциплина месяца и одна понятная подсказка, что делать дальше. */
export async function DayHero(p: Props) {
  const { t } = await getTranslator();
  // Подсказка: одна, спокойная и про процесс, а не про результат
  const hint =
    p.tradesToday === 0
      ? { key: "hero.hintNone", tone: "text-muted" }
      : p.violationsToday > 0
        ? { key: "hero.hintViolated", tone: "text-warning" }
        : p.losingDay
          ? { key: "hero.hintLosing", tone: "text-muted" }
          : { key: "hero.hintOk", tone: "text-success" };

  return (
    <section aria-labelledby="hero-title" className="card-enter surface-card overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="pointer-events-none absolute" aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="hero-title" className="text-xs font-medium uppercase tracking-wider text-muted">{t("hero.today")}</h2>
          <p className={cn("num-xl mt-2", p.pnlTone)}>{p.pnlText}</p>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex gap-1.5"><dt className="text-muted">{t("hero.trades")}</dt><dd className="font-semibold">{p.tradesToday}</dd></div>
            <div className="flex gap-1.5"><dt className="text-muted">{t("hero.winRate")}</dt><dd className="font-semibold">{p.winRateText}</dd></div>
            <div className="flex gap-1.5"><dt className="text-muted">{t("hero.balance")}</dt><dd className="font-semibold">{p.balanceText}</dd></div>
          </dl>
        </div>
        <Ring percent={p.monthPercent} goal={p.goal} label={t("hero.discipline")} />
      </div>

      <p className={cn("mt-5 rounded-xl bg-surface-muted/70 px-4 py-3 text-sm leading-relaxed", hint.tone)}>{t(hint.key)}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link href="/trades/new" className={buttonStyles({ size: "lg", className: "col-span-2" })}>
          <Plus className="h-5 w-5" aria-hidden /> {t("trades.add")}
        </Link>
        <Link href="/trades/quick" className={buttonStyles({ variant: "secondary", size: "md", className: "h-12 px-3" })}>
          <Zap className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{t("hero.quick")}</span>
        </Link>
        <Link href="/diary" className={buttonStyles({ variant: "secondary", size: "md", className: "h-12 px-3" })}>
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{t("hero.diary")}</span>
        </Link>
      </div>
    </section>
  );
}
