import { PoweredBy } from "@/components/layout/PoweredBy";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { LogOut } from "lucide-react";
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
      <div className="mb-8 flex items-center justify-between">
        <Logo href="/" />
        <form action={logoutAction}>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-foreground">
            <LogOut className="h-4 w-4" aria-hidden /> {t("auth.logout")}
          </button>
        </form>
      </div>
      <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("onboarding.subtitle")}</p>
      <OnboardingForm defaultName={profile?.name ?? ""} />
      <PoweredBy className="mt-8 text-center" />
    </main>
  );
}
