import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/ResetForm";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.reset.title") };
}

export default async function ResetPasswordPage() {
  const { t } = await getTranslator();
  return (
    <>
      <h1 className="text-2xl font-bold">{t("auth.reset.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("auth.reset.subtitle")}</p>
      <ResetForm />
    </>
  );
}
