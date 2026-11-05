import type { Metadata } from "next";
import { SupportThread } from "@/components/support/SupportThread";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("support.title"), robots: { index: false, follow: false } };
}

export default async function SupportPage() {
  const { t, locale } = await getTranslator();
  const { supabase, user, profile } = await requireUser();
  const [{ data }] = await Promise.all([
    supabase.from("support_messages").select("id, from_admin, body, created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(200),
    supabase.rpc("support_mark_read"),
  ]);
  const tz = safeTimeZone(profile?.timezone);
  const messages = (data ?? []).map((m) => ({ id: String(m.id), fromAdmin: !!m.from_admin, body: String(m.body), when: formatDateTime(String(m.created_at), locale, tz) }));
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("support.title")}</h1>
        <p className="mt-1 text-muted">{t("support.subtitle")}</p>
      </div>
      <SupportThread messages={messages} mode="user" />
      <p className="text-xs text-muted">{t("support.note")}</p>
    </div>
  );
}
