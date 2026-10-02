import type { Metadata } from "next";
import { Calculator } from "@/components/calculator/Calculator";
import { requireUser } from "@/lib/auth";
import { countTradesBetween, getAccounts, getRules } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { dayBounds, safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.calculator") };
}

export default async function CalculatorPage() {
  const { supabase, profile } = await requireUser();
  const { start, end } = dayBounds(safeTimeZone(profile?.timezone));
  const [accounts, rules, tradesToday] = await Promise.all([
    getAccounts(supabase),
    getRules(supabase),
    countTradesBetween(supabase, start, end),
  ]);
  return <Calculator accounts={accounts} rules={rules} tradesToday={tradesToday} />;
}
