import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResetMfaForm } from "@/components/admin/ResetMfaForm";
import { SetPlanForm } from "@/components/admin/SetPlanForm";
import { Badge, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

type Stats = { users: number; users7d: number; onboarded: number; active7d: number; pro: number; trades: number; trades7d: number; rules: number };
type UserRow = { email: string; created_at: string; plan: string; trades: number };

/** Панель владельца. Для всех, кроме пользователей с is_admin, страницы «не существует». */
export default async function AdminPage() {
  const { supabase, profile } = await requireUser();
  if (!profile?.is_admin) notFound();
  const { t, locale } = await getTranslator();

  const [{ data: stats }, { data: users }] = await Promise.all([supabase.rpc("admin_stats"), supabase.rpc("admin_recent_users")]);
  const s = (stats ?? {}) as Partial<Stats>;
  const cards: [string, number | undefined][] = [
    [t("admin.users"), s.users], [t("admin.users7d"), s.users7d], [t("admin.onboarded"), s.onboarded], [t("admin.active7d"), s.active7d],
    [t("admin.pro"), s.pro], [t("admin.trades"), s.trades], [t("admin.trades7d"), s.trades7d], [t("admin.rules"), s.rules],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("admin.title")}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value ?? "—"}</p>
          </Card>
        ))}
      </div>
      <SetPlanForm />
      <ResetMfaForm />
      <section>
        <h2 className="mb-3 font-semibold">{t("admin.recent")}</h2>
        <Table>
          <THead>
            <Tr><Th>{t("auth.email")}</Th><Th>{t("admin.registered")}</Th><Th>{t("profile.plan")}</Th><Th>{t("pages.trades")}</Th></Tr>
          </THead>
          <TBody>
            {((users ?? []) as UserRow[]).map((u) => (
              <Tr key={u.email}>
                <Td label={t("auth.email")} className="break-all">{u.email}</Td>
                <Td label={t("admin.registered")}>{formatDateTime(u.created_at, locale, "UTC")}</Td>
                <Td label={t("profile.plan")}><Badge tone={u.plan === "pro" ? "primary" : "neutral"}>{u.plan.toUpperCase()}</Badge></Td>
                <Td label={t("pages.trades")} className="tabular-nums">{u.trades}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
