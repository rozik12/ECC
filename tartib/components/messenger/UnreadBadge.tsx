"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/** Число непрочитанных сообщений рядом с пунктом меню. Обновляется раз в 90 секунд и сразу, когда мессенджер сообщает об изменении. */
export function UnreadBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const pull = () => {
      if (document.visibilityState !== "visible") return;
      getBrowserClient().rpc("chat_unread_total").then(({ data }) => { if (alive && typeof data === "number") setN(data); });
    };
    pull();
    const id = setInterval(pull, 90_000);
    const onUnread = (e: Event) => setN(Number((e as CustomEvent).detail) || 0);
    window.addEventListener("tartib-chat-unread", onUnread);
    window.addEventListener("tartib-chat-read", pull);
    document.addEventListener("visibilitychange", pull);
    return () => { alive = false; clearInterval(id); window.removeEventListener("tartib-chat-unread", onUnread); window.removeEventListener("tartib-chat-read", pull); document.removeEventListener("visibilitychange", pull); };
  }, []);
  if (n <= 0) return null;
  return <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-white dark:text-[#06101f]" aria-label={`${n}`}>{n > 99 ? "99+" : n}</span>;
}
