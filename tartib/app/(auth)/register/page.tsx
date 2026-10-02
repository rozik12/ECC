import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.register.title") };
}

export default async function RegisterPage() {
  const { t } = await getTranslator();
  return (
    <>
      <h1 className="text-2xl font-bold">{t("auth.register.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("auth.register.subtitle")}</p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">{t("auth.register.toLogin")}</Link>
      </p>
    </>
  );
}
