import type { Metadata } from "next";
import { MarketChart } from "@/components/charts/MarketChart";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("charts.title") };
}

export default async function ChartsPage() {
  const { t } = await getTranslator();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("charts.title")}</h1>
        <p className="mt-1 text-muted">{t("charts.subtitle")}</p>
      </div>
      <MarketChart />
    </div>
  );
}
