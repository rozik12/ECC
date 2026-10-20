import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatReportActions } from "@/components/admin/ChatReportActions";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };

type Report = { id: string; created_at: string; reason: string; body: string; sender_handle: string | null; sender_email: string | null; reporter_email: string | null; sender_banned: boolean };

/** Владелец: жалобы пользователей на сообщения в мессенджере. */
export default async function AdminReportsPage() {
  const { supabase, profile } = await requireUser();
  if (!profile?.is_admin) notFound();
  const { t, locale } = await getTranslator();
  const { data } = await supabase.rpc("admin_chat_reports");
  const reports = (data ?? []) as Report[];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin" className="text-sm text-muted hover:text-foreground">{t("admin.title")}</Link>
      <h1 className="text-2xl font-bold sm:text-3xl">{t("admin.reportsTitle")}</h1>
      {reports.length === 0 ? <p className="text-muted">{t("admin.reportsNone")}</p> : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Card className="space-y-3 p-4">
                <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 text-sm [overflow-wrap:anywhere]">{r.body || "—"}</p>
                <dl className="grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
                  <div><dt className="inline">{t("admin.reportAuthor")}: </dt><dd className="inline break-all text-foreground">@{r.sender_handle ?? "?"} · {r.sender_email ?? "—"}{r.sender_banned ? ` · ${t("admin.reportBanned")}` : ""}</dd></div>
                  <div><dt className="inline">{t("admin.reportFrom")}: </dt><dd className="inline break-all text-foreground">{r.reporter_email ?? "—"}</dd></div>
                  <div><dt className="inline">{t("admin.reportReason")}: </dt><dd className="inline text-foreground">{r.reason || "—"}</dd></div>
                  <div><dd>{formatDateTime(r.created_at, locale, "UTC")}</dd></div>
                </dl>
                <ChatReportActions id={r.id} canBan={!r.sender_banned} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
