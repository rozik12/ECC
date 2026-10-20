"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { dayKey, previewText } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Avatar } from "./Avatar";
import { ChatPane } from "./ChatPane";
import { formatListTime } from "./format";
import { HandleSetup } from "./HandleSetup";
import { NewChat } from "./NewChat";

export type ChatRow = {
  chat_id: string; kind: string; title: string | null; last_at: string; last_body: string | null; last_sender: string | null; last_deleted: boolean | null;
  unread: number; muted: boolean; other_id: string | null; other_name: string | null; other_handle: string | null; members: number;
};

const rowTitle = (c: ChatRow) => (c.kind === "group" ? c.title ?? "" : c.other_name || (c.other_handle ? `@${c.other_handle}` : "—"));

/** Мессенджер: слева список чатов, справа переписка. На телефоне показывается что-то одно. */
export function Messenger({ me, initialChat }: { me: { id: string; handle: string | null; timeZone: string; banned: boolean }; initialChat: string | null }) {
  const { t, locale } = useI18n();
  const [handle, setHandle] = useState(me.handle);
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialChat);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState("");
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getBrowserClient().rpc("chat_list");
    if (error) return setLoadError(true);
    setLoadError(false);
    const rows = (data ?? []) as ChatRow[];
    setChats(rows);
    window.dispatchEvent(new CustomEvent("tartib-chat-unread", { detail: rows.filter((r) => !r.muted).reduce((s, r) => s + r.unread, 0) }));
  }, []);
  useEffect(() => {
    if (!handle) return;
    const first = setTimeout(load, 0);
    // Один общий поток на все чаты не нужен: открытый чат слушает себя сам, список обновляется раз в 40 секунд (так базе легче при тысячах людей)
    const poll = setInterval(() => { if (document.visibilityState === "visible") load(); }, 40_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(first); clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [handle, load]);

  const open = useCallback((id: string | null) => {
    setActiveId(id);
    window.history.replaceState(null, "", id ? `/messages?c=${id}` : "/messages");
  }, []);

  const active = chats?.find((c) => c.chat_id === activeId) ?? null;

  const todayKey = dayKey(new Date().toISOString(), me.timeZone);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (chats ?? []).filter((c) => !q || rowTitle(c).toLowerCase().includes(q) || (c.other_handle ?? "").includes(q.replace(/^@/, "")));
  }, [chats, filter]);

  if (!handle) return <HandleSetup onDone={setHandle} />;

  return (
    <div className="relative flex h-[calc(100dvh-15rem)] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-surface lg:h-[calc(100dvh-9rem)]">
      <div className={cn("flex w-full flex-col border-border lg:w-80 lg:shrink-0 lg:border-r", active && "max-lg:hidden")}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("chat.search")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("chat.search")} className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </label>
          <Button size="sm" onClick={() => setShowNew(true)} aria-label={t("chat.newChat")} title={t("chat.newChat")} className="h-10 w-10 shrink-0 px-0"><MessageSquarePlus className="h-5 w-5" aria-hidden /></Button>
        </div>
        <ul className="flex-1 overflow-y-auto" aria-label={t("chat.chats")}>
          {chats === null && !loadError && <li className="p-6 text-center text-sm text-muted">{t("common.loading")}</li>}
          {loadError && <li className="p-6 text-center text-sm text-danger">{t("chat.errors.generic")}</li>}
          {chats && chats.length === 0 && (
            <li className="space-y-3 p-6 text-center">
              <p className="font-medium">{t("chat.noChats")}</p>
              <p className="text-sm text-muted">{t("chat.noChatsHint")}</p>
              <Button size="sm" onClick={() => setShowNew(true)}>{t("chat.newChat")}</Button>
            </li>
          )}
          {visible.map((c) => (
            <li key={c.chat_id}>
              <button type="button" onClick={() => open(c.chat_id)} aria-current={c.chat_id === activeId ? "true" : undefined}
                className={cn("flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted", c.chat_id === activeId && "bg-primary-soft/60")}>
                <Avatar name={c.kind === "group" ? c.title : c.other_name} handle={c.other_handle} seed={c.other_id ?? c.chat_id} group={c.kind === "group"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate", c.unread > 0 ? "font-semibold" : "font-medium")}>{rowTitle(c)}</span>
                    <span className="shrink-0 text-[11px] text-muted">{c.last_body !== null || c.last_deleted ? formatListTime(c.last_at, locale, me.timeZone, todayKey, dayKey) : ""}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread > 0 ? "text-foreground" : "text-muted")}>
                      {c.last_body === null && !c.last_deleted ? t("chat.noMessagesYet") : `${c.last_sender === me.id ? `${t("chat.you")}: ` : ""}${previewText(c.last_body, !!c.last_deleted, t("chat.deleted"))}`}
                    </span>
                    {c.unread > 0 && <span className={cn("min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5", c.muted ? "bg-surface-muted text-muted" : "bg-primary text-white dark:text-[#06101f]")} aria-label={t("chat.unreadCount", { n: c.unread })}>{c.unread > 99 ? "99+" : c.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {chats && chats.length > 0 && visible.length === 0 && <li className="p-6 text-center text-sm text-muted">{t("chat.noResults")}</li>}
        </ul>
      </div>

      <div className={cn("relative min-w-0 flex-1", !active && "max-lg:hidden")}>
        {active ? (
          <ChatPane key={active.chat_id} chat={active} meId={me.id} timeZone={me.timeZone} onBack={() => open(null)} onChanged={load} onLeft={() => { open(null); load(); }} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted">
            <MessageSquarePlus className="h-10 w-10 opacity-40" aria-hidden />
            <p>{t("chat.selectChat")}</p>
          </div>
        )}
      </div>

      <NewChat open={showNew} onClose={() => setShowNew(false)} onOpenChat={(id) => { setShowNew(false); load().then(() => open(id)); }} />
    </div>
  );
}
