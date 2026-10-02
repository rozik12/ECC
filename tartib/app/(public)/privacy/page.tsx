import type { Metadata } from "next";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("legal.privacyTitle") };
}

/** Черновик. Полный текст будет добавлен на этапе 5. */
export default async function Page() {
  const { t } = await getTranslator();
  return (
    <section className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold">{t("legal.privacyTitle")}</h1>
      <p className="mt-4 text-muted">{t("legal.draft")}</p>
      <Disclaimer className="mt-8" />
    </section>
  );
}
