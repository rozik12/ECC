import type { Metadata } from "next";
import { PricingCards } from "@/components/landing/PricingCards";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pricing.title") };
}

export default async function PricingPage() {
  const { t } = await getTranslator();
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-center text-3xl font-bold sm:text-4xl">{t("pricing.title")}</h1>
      <p className="mt-3 text-center text-muted">{t("pricing.subtitle")}</p>
      <div className="mt-10">
        <PricingCards />
      </div>
    </section>
  );
}
