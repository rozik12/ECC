import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("nav.register") };
}

/** Заглушка. Настоящая форма появится на этапе 2 (подключение Supabase). */
export default async function Page() {
  const { t } = await getTranslator();
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">{t("nav.register")}</h1>
      <Alert tone="info" title={t("auth.soonTitle")}>
        {t("auth.soonText")}
      </Alert>
    </section>
  );
}
