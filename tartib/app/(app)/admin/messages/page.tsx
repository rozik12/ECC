import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

type Thread = { user_id: string; email: string; last_body: string; last_at: string; last_from_admin: boolean; unread: number };

/** Владелец: все переписки с пользователями, непрочитанные выделены. */
export default async function AdminMessagesPage() {
  const { supabase, profile } = await requireUser();
  if (!profile?.is_admin) notFound();
  const { t, locale } = await getTranslator();
  const { data } = await supabase.rpc("admin_support_threads");
  const threads = (data ?? []) as Thread[];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("support.adminTitle")}</h1>
      {threads.length === 0 ? <p className="text-muted">{t("support.adminNone")}</p> : (
        <ul className="space-y-2">
          {threads.map((th) => (
            <li key={th.user_id}>
              <Link href={`/admin/messages/${th.user_id}`} className="block">
                <Card className="space-y-1 p-4 transition hover:border-primary">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{th.email}</span>
                    {th.unread > 0 ? <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">{th.unread}</span> : null}
                  </div>
                  <p className="truncate text-sm text-muted">{th.last_from_admin ? `${t("support.owner")}: ` : ""}{th.last_body}</p>
                  <p className="text-xs text-muted">{formatDateTime(th.last_at, locale, "UTC")}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
