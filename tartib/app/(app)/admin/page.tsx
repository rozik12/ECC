import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BroadcastForm } from "@/components/admin/BroadcastForm";
import { ResetMfaForm } from "@/components/admin/ResetMfaForm";
import { Alert, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

type Stats = { users: number; users7d: number; onboarded: number; active7d: number; trades: number; trades7d: number; rules: number };
type UserRow = { email: string; created_at: string; trades: number };

/** Панель владельца. Для всех, кроме пользователей с is_admin, страницы «не существует». */
export default async function AdminPage() {
  const { supabase, profile } = await requireUser();
  if (!profile?.is_admin) notFound();
  const { t, locale } = await getTranslator();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const has2fa = (factors?.totp ?? []).some((f) => f.status === "verified");

  const [{ data: stats }, { data: users }, { data: unread }] = await Promise.all([supabase.rpc("admin_stats"), supabase.rpc("admin_recent_users"), supabase.rpc("admin_support_unread")]);
  const s = (stats ?? {}) as Partial<Stats>;
  const cards: [string, number | undefined][] = [
    [t("admin.users"), s.users], [t("admin.users7d"), s.users7d], [t("admin.onboarded"), s.onboarded], [t("admin.active7d"), s.active7d],
    [t("admin.trades"), s.trades], [t("admin.trades7d"), s.trades7d], [t("admin.rules"), s.rules],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("admin.title")}</h1>
      {!has2fa && (
        <Alert tone="warning">
          {t("admin.no2fa")} <Link href="/profile" className="font-semibold underline">{t("admin.no2faLink")}</Link>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value ?? "—"}</p>
          </Card>
        ))}
      </div>
      <Link href="/admin/messages" className="block">
        <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-primary">
          <span className="font-semibold">{t("support.adminLink")}</span>
          <span className="text-sm text-muted">{t("support.adminUnread", { n: Number(unread) || 0 })}</span>
        </Card>
      </Link>
      <BroadcastForm />
      <ResetMfaForm />
      <section>
        <h2 className="mb-3 font-semibold">{t("admin.recent")}</h2>
        <Table>
          <THead>
            <Tr><Th>{t("auth.email")}</Th><Th>{t("admin.registered")}</Th><Th>{t("pages.trades")}</Th></Tr>
          </THead>
          <TBody>
            {((users ?? []) as UserRow[]).map((u) => (
              <Tr key={u.email}>
                <Td label={t("auth.email")} className="break-all">{u.email}</Td>
                <Td label={t("admin.registered")}>{formatDateTime(u.created_at, locale, "UTC")}</Td>
                <Td label={t("pages.trades")} className="tabular-nums">{u.trades}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
