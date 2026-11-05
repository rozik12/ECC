import type { Metadata } from "next";
import { TransactionsManager } from "@/components/settings/TransactionsManager";
import { ChecklistSettings } from "@/components/settings/ChecklistSettings";
import { AccountsManager } from "@/components/settings/AccountsManager";
import { ApiTokensCard } from "@/components/settings/ApiTokensCard";
import { TraderProfileSettings } from "@/components/settings/TraderProfileSettings";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireUser } from "@/lib/auth";
import { getAccounts, getTransactions } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { DEFAULT_CHECKLIST_KEYS } from "@/lib/constants";
import { safeTimeZone } from "@/lib/time";
import { isHorizon, isTraderMarket } from "@/lib/trader-profile";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.settings") };
}

export default async function SettingsPage() {
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const [accounts, transactions, { data: tokenRows }] = await Promise.all([getAccounts(supabase), getTransactions(supabase, 30), supabase.from("api_tokens").select("id, name, prefix, created_at, last_used_at").order("created_at", { ascending: false })]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("pages.settings")}</h1>
      <SettingsForm language={locale} currency={profile?.currency ?? "USD"} timezone={safeTimeZone(profile?.timezone)} />
      <div id="trader-profile" className="scroll-mt-24">
        <TraderProfileSettings horizon={isHorizon(profile?.trader_horizon) ? profile.trader_horizon : null} markets={(profile?.trader_markets ?? []).filter(isTraderMarket)} />
      </div>
      <AccountsManager accounts={accounts} />
      <TransactionsManager
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        transactions={transactions}
        timeZone={safeTimeZone(profile?.timezone)}
      />
      <ApiTokensCard tokens={(tokenRows ?? []).map((r) => ({ id: String(r.id), name: String(r.name), prefix: String(r.prefix), createdAt: String(r.created_at), lastUsedAt: r.last_used_at ? String(r.last_used_at) : null }))} timeZone={safeTimeZone(profile?.timezone)} />
      <ChecklistSettings
        enabled={profile?.checklist_enabled !== false}
        items={profile?.checklist?.length ? profile.checklist : DEFAULT_CHECKLIST_KEYS.map((k) => t(`checklist.defaults.${k}`))}
      />
    </div>
  );
}
