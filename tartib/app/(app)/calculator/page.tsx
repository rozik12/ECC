import type { Metadata } from "next";
import { Calculator } from "@/components/calculator/Calculator";
import { requireUser } from "@/lib/auth";
import { countTradesBetween, dayLossBefore, getAccounts, getDayContext, getRules } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { DEFAULT_CHECKLIST_KEYS } from "@/lib/constants";
import { dayBounds, safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.calculator") };
}

export default async function CalculatorPage() {
  const { supabase, profile } = await requireUser();
  const { start, end } = dayBounds(safeTimeZone(profile?.timezone));
  const [accounts, rules, tradesToday, day, { t }] = await Promise.all([
    getAccounts(supabase),
    getRules(supabase),
    countTradesBetween(supabase, start, end),
    getDayContext(supabase, start, end),
    getTranslator(),
  ]);
  const checklist = profile?.checklist_enabled === false ? [] : profile?.checklist?.length ? profile.checklist : DEFAULT_CHECKLIST_KEYS.map((k) => t(`checklist.defaults.${k}`));
  return <Calculator accounts={accounts} rules={rules} tradesToday={tradesToday} dayLossPercent={dayLossBefore(day, new Date())} checklist={checklist} />;
}
