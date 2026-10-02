import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { Logo } from "@/components/layout/Logo";
import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("onboarding.title") };
}

export default async function OnboardingPage() {
  const { profile } = await requireUser();
  if (profile?.onboarded) redirect("/dashboard");
  const { t } = await getTranslator();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <Logo href="/" className="mb-8 block" />
      <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("onboarding.subtitle")}</p>
      <OnboardingForm defaultName={profile?.name ?? ""} />
    </main>
  );
}
