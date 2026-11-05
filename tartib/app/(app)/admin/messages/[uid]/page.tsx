import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SupportThread } from "@/components/support/SupportThread";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

type Row = { id: string; from_admin: boolean; body: string; created_at: string; email: string };

/** Владелец: одна переписка. Открытие отмечает сообщения пользователя прочитанными. */
export default async function AdminThreadPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  if (!z.string().uuid().safeParse(uid).success) notFound();
  const { supabase, profile } = await requireUser();
  if (!profile?.is_admin) notFound();
  const { t, locale } = await getTranslator();
  const { data, error } = await supabase.rpc("admin_support_open", { p_user: uid });
  if (error) notFound();
  const rows = (data ?? []) as Row[];
  const messages = rows.map((m) => ({ id: m.id, fromAdmin: m.from_admin, body: m.body, when: formatDateTime(m.created_at, locale, "UTC") }));
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin/messages" className="text-sm text-muted hover:text-foreground">{t("support.back")}</Link>
      <h1 className="break-all text-xl font-bold sm:text-2xl">{rows[0]?.email ?? uid}</h1>
      <SupportThread messages={messages} mode="admin" userId={uid} />
    </div>
  );
}
