import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { NotificationActions } from "@/components/notifications/NotificationActions";
import { NotificationItem, type ItemData } from "@/components/notifications/NotificationItem";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { describeNotification } from "@/lib/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("notifications.title") };
}

const LOCALES = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" } as const;

function ago(at: number, now: number, locale: keyof typeof LOCALES): string {
  const sec = Math.max(1, Math.round((now - at) / 1000));
  const rtf = new Intl.RelativeTimeFormat(LOCALES[locale], { numeric: "auto" });
  if (sec < 3600) return rtf.format(-Math.max(1, Math.round(sec / 60)), "minute");
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), "hour");
  return rtf.format(-Math.round(sec / 86400), "day");
}

export default async function NotificationsPage() {
  const { t, locale } = await getTranslator();
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("notifications").select("id, kind, params, created_at, read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);

  const now = new Date().getTime();
  const items: ItemData[] = [];
  for (const r of data ?? []) {
    const d = describeNotification(String(r.kind), r.params, t);
    if (!d) continue;
    const at = new Date(String(r.created_at)).getTime();
    items.push({ id: String(r.id), kind: String(r.kind), ...d, ago: ago(at, now, locale), iso: new Date(at).toISOString(), unread: r.read_at === null });
  }
  const unread = items.filter((i) => i.unread).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("notifications.title")}</h1>
        <p className="mt-1 text-muted">{t("notifications.subtitle")}</p>
      </div>
      <NotificationActions unread={unread} total={items.length} />
      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center text-muted">
          <Bell className="h-8 w-8" aria-hidden />
          <p>{t("notifications.empty")}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}><NotificationItem n={n} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
