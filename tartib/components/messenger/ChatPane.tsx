"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flag, Info, Pencil, SendHorizontal, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { chatErrorKey, dayKey, groupMessages, MAX_MESSAGE, upsertMessage, type ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Avatar } from "./Avatar";
import { formatClock, formatDayLabel } from "./format";
import { SidePanel, type ChatInfo, type Member } from "./SidePanel";

const PAGE = 50;
const COLS = "id, chat_id, sender_id, body, created_at, edited_at, deleted_at";

/** Переписка: сообщения приходят сразу (реальное время), при сбое связи подтягиваются раз в 15 секунд. */
export function ChatPane({ chat, meId, timeZone, onBack, onChanged, onLeft }: { chat: ChatInfo & { members: number }; meId: string; timeZone: string; onBack: () => void; onChanged: () => void; onLeft: () => void }) {
  const { t, locale } = useI18n();
  const supabase = getBrowserClient();
  const chatId = chat.chat_id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [panel, setPanel] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastChat = useRef<string | null>(null);

  const people = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const nameOf = (id: string | null) => { const p = id ? people.get(id) : undefined; return p?.name || (p?.handle ? `@${p.handle}` : "—"); };

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    supabase.rpc("chat_mark_read", { p_chat: chatId }).then(() => { window.dispatchEvent(new Event("tartib-chat-read")); onChanged(); });
  }, [supabase, chatId, onChanged]);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.rpc("chat_members_info", { p_chat: chatId });
    setMembers((data ?? []) as Member[]);
  }, [supabase, chatId]);

  // Открытие чата: последние сообщения, участники
  useEffect(() => {
    let cancelled = false;
    stick.current = true; // у каждого чата своя копия панели (key), поэтому состояние начинается с нуля
    supabase.from("chat_messages").select(COLS).eq("chat_id", chatId).order("created_at", { ascending: false }).limit(PAGE).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError(chatErrorKey(e));
      const rows = ((data ?? []) as ChatMessage[]).reverse();
      setMessages(rows); setHasMore((data ?? []).length === PAGE); setLoading(false);
      markRead();
      loadMembers();
    });
    return () => { cancelled = true; };
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Реальное время и запасной опрос
  useEffect(() => {
    const channel = supabase.channel(`chat-${chatId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      const row = payload.new as ChatMessage | undefined;
      if (!row || !row.id) return;
      setMessages((list) => upsertMessage(list, row));
      if (payload.eventType === "INSERT" && row.sender_id !== meId) markRead();
    }).subscribe();
    const poll = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.from("chat_messages").select(COLS).eq("chat_id", chatId).order("created_at", { ascending: false }).limit(20);
      if (data) setMessages((list) => (data as ChatMessage[]).reduce((acc, m) => upsertMessage(acc, m), list));
    }, 15_000);
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [chatId, meId, supabase, markRead]);

  // Прокрутка вниз, если пользователь и так внизу
  useEffect(() => {
    const el = scroller.current;
    if (el && (stick.current || lastChat.current !== chatId)) el.scrollTop = el.scrollHeight;
    lastChat.current = chatId;
  }, [messages, chatId, loading]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = scroller.current; const before = el?.scrollHeight ?? 0;
    const { data } = await supabase.from("chat_messages").select(COLS).eq("chat_id", chatId).lt("created_at", first.created_at).order("created_at", { ascending: false }).limit(PAGE);
    const rows = ((data ?? []) as ChatMessage[]).reverse();
    stick.current = false;
    setMessages((list) => rows.reduce((acc, m) => upsertMessage(acc, m), list));
    setHasMore((data ?? []).length === PAGE);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > MAX_MESSAGE) return setError("title_invalid");
    setSending(true); setError(null);
    const { data, error: e } = await supabase.from("chat_messages").insert({ chat_id: chatId, body }).select(COLS).single();
    setSending(false);
    if (e || !data) return setError(chatErrorKey(e));
    stick.current = true;
    setText("");
    setMessages((list) => upsertMessage(list, data as ChatMessage));
    onChanged();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.text.trim();
    if (!body) return;
    const { data, error: e } = await supabase.from("chat_messages").update({ body }).eq("id", editing.id).select(COLS).single();
    if (e || !data) return setError(chatErrorKey(e));
    setMessages((list) => upsertMessage(list, data as ChatMessage));
    setEditing(null);
    onChanged();
  };

  const remove = async (m: ChatMessage) => {
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    const { data, error: e } = await supabase.from("chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id).select(COLS).single();
    if (e || !data) return setError(chatErrorKey(e));
    setMessages((list) => upsertMessage(list, data as ChatMessage));
    onChanged();
  };

  const report = async (m: ChatMessage) => {
    const reason = window.prompt(t("chat.reportPrompt"));
    if (reason === null) return;
    const { error: e } = await supabase.rpc("chat_report", { p_message: m.id, p_reason: reason.slice(0, 200) });
    if (e) return setError(chatErrorKey(e));
    setNotice(t("chat.reportDone"));
    setTimeout(() => setNotice(null), 4000);
  };

  const now = new Date();
  const todayKey = dayKey(now.toISOString(), timeZone);
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone);
  const groups = groupMessages(messages, timeZone);
  const isGroup = chat.kind === "group";
  const title = isGroup ? chat.title ?? "" : chat.other_name || (chat.other_handle ? `@${chat.other_handle}` : "—");
  const subtitle = isGroup ? t("chat.membersCount", { n: chat.members }) : chat.other_handle ? `@${chat.other_handle}` : t("chat.left");

  return (
    <div className="flex h-full min-w-0 flex-1">
      <section className="flex h-full min-w-0 flex-1 flex-col" aria-label={title}>
        <header className="flex items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          <button type="button" onClick={onBack} aria-label={t("chat.back")} className="rounded-lg p-1.5 text-muted hover:bg-surface-muted lg:hidden"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          <Avatar name={isGroup ? chat.title : chat.other_name} handle={chat.other_handle} seed={chat.other_id ?? chatId} group={isGroup} />
          <div className="min-w-0 flex-1"><h2 className="truncate font-semibold leading-tight">{title}</h2><p className="truncate text-xs text-muted">{subtitle}</p></div>
          <button type="button" onClick={() => setPanel((v) => !v)} aria-label={t("chat.info")} aria-pressed={panel} className={cn("rounded-lg p-2 hover:bg-surface-muted", panel ? "text-primary" : "text-muted")}><Info className="h-5 w-5" aria-hidden /></button>
        </header>

        <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }} className="flex-1 space-y-1 overflow-y-auto px-3 py-3 sm:px-4" role="log" aria-live="polite" aria-label={t("chat.messages")}>
          {hasMore && <div className="pb-2 text-center"><button type="button" onClick={loadOlder} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground">{t("chat.loadOlder")}</button></div>}
          {loading && <p className="py-10 text-center text-sm text-muted">{t("common.loading")}</p>}
          {!loading && messages.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("chat.emptyChat")}</p>}
          {groups.map((g, gi) => {
            const mine = g.senderId === meId;
            const showDay = gi === 0 || groups[gi - 1].day !== g.day;
            return (
              <div key={g.key}>
                {showDay && <p className="my-3 text-center text-xs font-medium text-muted">{formatDayLabel(g.day, g.items[0].created_at, locale, timeZone, todayKey, yesterdayKey, t("chat.today"), t("chat.yesterday"))}</p>}
                <div className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}>
                  {!mine && isGroup && <span className="px-1 text-xs font-medium text-primary">{nameOf(g.senderId)}</span>}
                  {g.items.map((m) => (
                    <div key={m.id} className={cn("group flex max-w-[88%] items-end gap-1 sm:max-w-[75%]", mine ? "flex-row-reverse" : "flex-row")}>
                      {editing?.id === m.id ? (
                        <div className="w-full min-w-[220px] space-y-1">
                          <textarea autoFocus value={editing.text} maxLength={MAX_MESSAGE} rows={2} onChange={(e) => setEditing({ id: m.id, text: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditing(null); }} aria-label={t("chat.edit")} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
                          <div className="flex justify-end gap-2 text-xs"><button type="button" onClick={() => setEditing(null)} className="text-muted hover:text-foreground">{t("chat.cancel")}</button><button type="button" onClick={saveEdit} className="font-semibold text-primary">{t("chat.save")}</button></div>
                        </div>
                      ) : (
                        <>
                          <div className={cn("rounded-2xl px-3 py-1.5 text-sm leading-snug", mine ? "rounded-br-md bg-primary text-white dark:text-[#06101f]" : "rounded-bl-md bg-surface-muted", m.deleted_at && "italic opacity-70")}>
                            {m.deleted_at ? <span>{t("chat.deleted")}</span> : <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>}
                            <span className={cn("mt-0.5 block text-right text-[10px]", mine ? "opacity-75" : "text-muted")}>{formatClock(m.created_at, locale, timeZone)}{m.edited_at && !m.deleted_at ? ` · ${t("chat.edited")}` : ""}</span>
                          </div>
                          {!m.deleted_at && (
                            <span className="flex shrink-0 gap-0.5 pb-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-60">
                              {mine ? (
                                <>
                                  <button type="button" onClick={() => setEditing({ id: m.id, text: m.body })} aria-label={t("chat.edit")} title={t("chat.edit")} className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                                  <button type="button" onClick={() => remove(m)} aria-label={t("chat.delete")} title={t("chat.delete")} className="rounded p-1 text-muted hover:bg-surface-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                                </>
                              ) : (
                                <button type="button" onClick={() => report(m)} aria-label={t("chat.report")} title={t("chat.report")} className="rounded p-1 text-muted hover:bg-surface-muted hover:text-danger"><Flag className="h-3.5 w-3.5" aria-hidden /></button>
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="px-3 pb-1 sm:px-4"><Alert tone="danger">{t(`chat.errors.${error}`)}</Alert></div>}
        {notice && <div className="px-3 pb-1 sm:px-4"><Alert tone="success">{notice}</Alert></div>}
        <form className="flex items-end gap-2 border-t border-border p-3 sm:px-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            value={text}
            rows={1}
            maxLength={MAX_MESSAGE}
            aria-label={t("chat.writeMessage")}
            placeholder={t("chat.writeMessage")}
            onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button type="submit" disabled={sending || text.trim().length === 0} aria-label={t("chat.send")} title={t("chat.send")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40 dark:text-[#06101f]"><SendHorizontal className="h-5 w-5" aria-hidden /></button>
        </form>
      </section>
      {panel && (
        <div className="absolute inset-y-0 right-0 z-10 w-full sm:w-80 lg:static lg:z-auto">
          <SidePanel chat={chat} members={members} meId={meId} onClose={() => setPanel(false)} onChanged={() => { loadMembers(); onChanged(); }} onLeft={onLeft} />
        </div>
      )}
    </div>
  );
}
