import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, ShieldCheck } from "lucide-react";
import { buttonStyles, Card } from "@/components/ui";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { getTranslator } from "@/lib/i18n/server";
import { disciplinePercent, getShareStats } from "@/lib/share";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getTranslator();
  const stats = await getShareStats((await params).token);
  return {
    title: stats?.name ? t("share.titleNamed", { name: stats.name }) : t("share.title"),
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const stats = await getShareStats(token);
  if (!stats) notFound();
  const { t } = await getTranslator();
  const percent = disciplinePercent(stats);

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{stats.name ? t("share.titleNamed", { name: stats.name }) : t("share.title")}</h1>
        <p className="mt-1 text-muted">{t("share.subtitle")}</p>
      </div>

      <Card>
        <div className="flex items-center gap-2 text-muted">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <span className="text-sm">{t("share.discipline30")}</span>
        </div>
        <p className="mt-2 text-5xl font-bold tabular-nums">{percent === null ? "—" : `${percent}%`}</p>
        <p className="mt-1 text-sm text-muted">
          {percent === null ? t("share.noTrades") : t("share.ofTrades", { followed: stats.followed30, total: stats.trades30 })}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 sm:p-4">
          <div className="flex items-center gap-2 text-sm text-muted"><Flame className="h-4 w-4 text-warning" aria-hidden />{t("share.streak")}</div>
          <p className="mt-1 text-2xl font-bold tabular-nums">{stats.streak}</p>
        </Card>
        <Card className="p-4 sm:p-4">
          <p className="text-sm text-muted">{t("share.entries")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{stats.trades}</p>
        </Card>
      </div>

      <p className="text-sm text-muted">{t("share.privacy")}</p>
      <Link href="/register" className={buttonStyles()}>{t("share.cta")}</Link>
      <Disclaimer />
    </div>
  );
}
