import Link from "next/link";
import { cn } from "@/lib/cn";
import { periods, type Period } from "@/lib/statistics";
import { getTranslator } from "@/lib/i18n/server";

export async function PeriodTabs({ current }: { current: Period }) {
  const { t } = await getTranslator();
  return (
    <nav className="inline-flex rounded-xl border border-border bg-surface p-1" aria-label={t("stats.title")}>
      {periods.map((p) => (
        <Link
          key={p}
          href={p === "30d" ? "/statistics" : `/statistics?period=${p}`}
          aria-current={p === current ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            p === current ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground",
          )}
        >
          {t(`stats.period.${p}`)}
        </Link>
      ))}
    </nav>
  );
}
