import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportTrades } from "@/components/trades/ImportTrades";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("import.title") };
}

export default async function ImportPage() {
  const { t } = await getTranslator();
  const { supabase } = await requireUser();
  const accounts = await getAccounts(supabase);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/trades" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("trades.detail.back")}
      </Link>
      <h1 className="text-2xl font-bold sm:text-3xl">{t("import.title")}</h1>
      {accounts.length === 0 ? <Alert tone="warning">{t("trades.noAccount")}</Alert> : <ImportTrades accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />}
    </div>
  );
}
