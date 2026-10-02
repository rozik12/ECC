import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.login.title") };
}

export default async function LoginPage() {
  const { t } = await getTranslator();
  return (
    <>
      <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("auth.login.subtitle")}</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">{t("auth.login.toRegister")}</Link>
      </p>
    </>
  );
}
