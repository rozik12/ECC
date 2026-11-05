"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { clearNotificationsAction, markAllNotificationsReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

const noop = () => () => {};

/** Кнопки над списком: прочитать всё, очистить, включить уведомления браузера. */
export function NotificationActions({ unread, total }: { unread: number; total: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asked, setAsked] = useState(0);
  // Состояние разрешения читаем из браузера, на сервере его нет
  const perm = useSyncExternalStore(
    noop,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission) + asked,
    () => "unsupported",
  ).replace(/\d+$/, "");

  const run = (fn: () => Promise<{ ok: boolean }>) => startTransition(async () => { await fn(); router.refresh(); });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={pending || unread === 0} onClick={() => run(markAllNotificationsReadAction)}>{t("notifications.markAll")}</Button>
      <Button variant="ghost" size="sm" disabled={pending || total === 0} onClick={() => run(clearNotificationsAction)}>{t("notifications.clear")}</Button>
      {perm === "default" && (
        <Button variant="ghost" size="sm" onClick={() => void Notification.requestPermission().then(() => setAsked((n) => n + 1))}>
          <BellRing className="h-4 w-4" aria-hidden /> {t("notifications.enableBrowser")}
        </Button>
      )}
      {perm === "granted" && <span className="text-xs text-muted">{t("notifications.browserOn")}</span>}
      {perm === "denied" && <span className="text-xs text-muted">{t("notifications.browserDenied")}</span>}
    </div>
  );
}
