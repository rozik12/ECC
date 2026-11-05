import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth/ForgotForm";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.forgot.title") };
}

export default async function ForgotPasswordPage() {
  const { t } = await getTranslator();
  return (
    <>
      <h1 className="text-2xl font-bold">{t("auth.forgot.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("auth.forgot.subtitle")}</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-primary hover:underline">{t("auth.forgot.back")}</Link>
      </p>
    </>
  );
}
