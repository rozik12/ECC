import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LoginSwitch } from "@/components/auth/LoginSwitch";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.login.title") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mfa?: string }> }) {
  const { t } = await getTranslator();
  const { error, mfa } = await searchParams;
  return (
    <LoginSwitch
      mfaPending={mfa === "1"}
      before={
        <>
          <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>
          <p className="mb-6 mt-2 text-muted">{t("auth.login.subtitle")}</p>
          {error === "oauth" && <Alert tone="danger" className="mb-4">{t("auth.oauthFailed")}</Alert>}
          {error === "link" && <Alert tone="warning" className="mb-4">{t("auth.linkExpired")}</Alert>}
          <GoogleButton />
        </>
      }
      after={
        <>
          <p className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className="text-muted hover:text-foreground hover:underline">{t("auth.forgot.link")}</Link>
          </p>
          <p className="mt-6 text-center text-sm text-muted">
            {t("auth.login.noAccount")}{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">{t("auth.login.toRegister")}</Link>
          </p>
        </>
      }
    />
  );
}
