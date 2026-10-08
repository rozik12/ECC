import type { Metadata } from "next";
import Link from "next/link";
import { Download, LogOut, Shield } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { MfaCard } from "@/components/profile/MfaCard";
import { ShareCard } from "@/components/profile/ShareCard";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Badge, Button, buttonStyles, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/data";
import { getTranslator } from "@/lib/i18n/server";
import { PLAN_LIMITS } from "@/lib/plans";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.profile") };
}

export default async function ProfilePage() {
  const { t } = await getTranslator();
  const { supabase, user, profile } = await requireUser();
  const plan = await getPlan(supabase, user.id);
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const mfaEnabled = (factors?.totp ?? []).length > 0;
  const [{ count: trades }, { count: rules }] = await Promise.all([
    supabase.from("trades").select("id", { count: "exact", head: true }),
    supabase.from("rules").select("id", { count: "exact", head: true }),
  ]);
  const limits = PLAN_LIMITS[plan];
  const usage = (n: number | null, max: number) => `${n ?? 0} / ${Number.isFinite(max) ? max : "∞"}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("pages.profile")}</h1>

      <Card className="space-y-4">
        <div>
          <p className="text-sm text-muted">{t("auth.email")}</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <ProfileForm name={profile?.name ?? ""} />
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{t("profile.plan")}</h2>
          <Badge tone={plan === "pro" ? "primary" : "neutral"}>{plan.toUpperCase()}</Badge>
        </div>
        <dl className="mt-3 divide-y divide-border text-sm">
          <div className="flex justify-between py-2"><dt className="text-muted">{t("pages.trades")}</dt><dd className="font-medium tabular-nums">{usage(trades, limits.trades)}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-muted">{t("nav.rules")}</dt><dd className="font-medium tabular-nums">{usage(rules, limits.rules)}</dd></div>
        </dl>
      </Card>

      <ShareCard token={profile?.share_token ?? null} />

      <MfaCard enabled={mfaEnabled} />

      <Card>
        <h2 className="font-semibold">{t("profile.dataTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("profile.dataText")}</p>
        <a href="/api/account/export" className={buttonStyles({ variant: "secondary", className: "mt-4" })}>
          <Download className="h-4 w-4" aria-hidden /> {t("profile.dataDownload")}
        </a>
      </Card>

      {profile?.is_admin && (
        <Link href="/admin" className={buttonStyles({ variant: "secondary" })}>
          <Shield className="h-4 w-4" aria-hidden /> {t("admin.title")}
        </Link>
      )}

      <form action={logoutAction}>
        <Button type="submit" variant="secondary"><LogOut className="h-4 w-4" aria-hidden /> {t("auth.logout")}</Button>
      </form>

      <DeleteAccount email={user.email ?? ""} />
    </div>
  );
}
