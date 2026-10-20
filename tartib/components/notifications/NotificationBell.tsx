"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";

const POLL_MS = 120_000;

/** Колокольчик с числом непрочитанных. Раз в две минуты (и при возврате на вкладку) спрашивает сервер; если разрешено, показывает системное уведомление браузера. */
export function NotificationBell({ initial }: { initial: number }) {
  const { t } = useI18n();
  const [count, setCount] = useState(initial);
  const last = useRef(initial);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        if (document.visibilityState !== "visible") return;
        // Запрос идёт прямо в базу (политики доступа показывают только свои уведомления) и не нагружает сервер сайта
        const { count, error } = await getBrowserClient().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
        if (error || stopped || typeof count !== "number") return;
        const unread = count;
        if (unread > last.current && document.hidden && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Tartib", { body: t("notifications.browserNew", { n: unread - last.current }), icon: "/logo/tartib-mark-512.png", tag: "tartib-unread" });
          } catch {
            // некоторые браузеры (мобильные) не разрешают создавать уведомления из страницы
          }
        }
        last.current = unread;
        setCount(unread);
      } catch {
        // нет сети: попробуем в следующий раз
      }
    }
    const id = setInterval(poll, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [t]);

  const label = count > 0 ? t("notifications.bellUnread", { n: count }) : t("notifications.title");
  return (
    <Link href="/notifications" aria-label={label} title={label} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground">
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
