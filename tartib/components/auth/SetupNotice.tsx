import { Alert } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function SetupNotice() {
  if (isSupabaseConfigured()) return null;
  const { t } = await getTranslator();
  return <Alert tone="warning" className="mb-6">{t("auth.notConfigured")}</Alert>;
}
