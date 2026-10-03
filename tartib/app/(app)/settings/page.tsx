import type { Metadata } from "next";
import { ChecklistSettings } from "@/components/settings/ChecklistSettings";
import { AccountsManager } from "@/components/settings/AccountsManager";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { DEFAULT_CHECKLIST_KEYS } from "@/lib/constants";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.settings") };
}

export default async function SettingsPage() {
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const accounts = await getAccounts(supabase);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("pages.settings")}</h1>
      <SettingsForm language={locale} currency={profile?.currency ?? "USD"} timezone={safeTimeZone(profile?.timezone)} />
      <AccountsManager accounts={accounts} />
      <ChecklistSettings
        enabled={profile?.checklist_enabled !== false}
        items={profile?.checklist?.length ? profile.checklist : DEFAULT_CHECKLIST_KEYS.map((k) => t(`checklist.defaults.${k}`))}
      />
    </div>
  );
}
