import type { Metadata } from "next";
import { RulesManager } from "@/components/rules/RulesManager";
import { requireUser } from "@/lib/auth";
import { getRules } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.rules") };
}

export default async function RulesPage() {
  const { supabase } = await requireUser();
  const rules = await getRules(supabase);
  return <RulesManager rules={rules} />;
}
