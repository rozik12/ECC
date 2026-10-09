import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { QuickTradeForm } from "@/components/trades/QuickTradeForm";
import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("quick.title") };
}

export default async function QuickTradePage() {
  const { t } = await getTranslator();
  const { supabase } = await requireUser();
  const accounts = await getAccounts(supabase);
  if (accounts.length === 0) return <Alert tone="warning">{t("trades.noAccount")}</Alert>;
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("quick.title")}</h1>
        <Link href="/trades/new" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">{t("quick.full")}</Link>
      </div>
      <QuickTradeForm accounts={accounts} />
    </div>
  );
}
