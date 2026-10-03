import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { periods, type Period } from "@/lib/statistics";
import { getTranslator } from "@/lib/i18n/server";
import type { Plan } from "@/lib/plans";

export async function PeriodTabs({ current, plan }: { current: Period; plan: Plan }) {
  const { t } = await getTranslator();
  return (
    <nav className="inline-flex rounded-xl border border-border bg-surface p-1" aria-label={t("stats.title")}>
      {periods.map((p) =>
        p === "all" && plan !== "pro" ? (
          <span
            key={p}
            title={t("stats.proOnly")}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-muted/60"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden /> {t(`stats.period.${p}`)} · PRO
          </span>
        ) : (
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
        ),
      )}
    </nav>
  );
}
