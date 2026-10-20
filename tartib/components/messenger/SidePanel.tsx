"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, Bell, Ban, LogOut, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { chatErrorKey, MAX_GROUP_MEMBERS, MAX_TITLE } from "@/lib/chat";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Avatar } from "./Avatar";
import type { FoundUser } from "./NewChat";

export type Member = { user_id: string; name: string | null; handle: string | null; role: string };
export type ChatInfo = { chat_id: string; kind: string; title: string | null; muted: boolean; other_id: string | null; other_name: string | null; other_handle: string | null };

/** Панель справа: участники группы и управление ею, либо сведения о собеседнике (заблокировать, выключить звук, удалить переписку). */
export function SidePanel({ chat, members, meId, onClose, onChanged, onLeft }: { chat: ChatInfo; members: Member[]; meId: string; onClose: () => void; onChanged: () => void; onLeft: () => void }) {
  const { t } = useI18n();
  const supabase = getBrowserClient();
  const isGroup = chat.kind === "group";
  const iAmOwner = members.some((m) => m.user_id === meId && m.role === "owner");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const title = titleDraft ?? chat.title ?? "";
  const setTitle = (v: string) => setTitleDraft(v);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundUser[]>([]);
  const [blockedByMe, setBlockedByMe] = useState(false);

  useEffect(() => {
    if (isGroup || !chat.other_id) return;
    supabase.from("user_blocks").select("blocked_id").eq("blocked_id", chat.other_id).then(({ data }) => setBlockedByMe((data ?? []).length > 0));
  }, [isGroup, chat.other_id, supabase]);
  useEffect(() => {
    const query = q.trim().replace(/^@/, "");
    if (!iAmOwner || query.length < 3) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc("chat_search_users", { p_q: query });
      if (!cancelled) setFound(((data ?? []) as FoundUser[]).filter((u) => !members.some((m) => m.user_id === u.user_id)));
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [q, iAmOwner, members, supabase]);

  const foundShown = iAmOwner && q.trim().replace(/^@/, "").length >= 3 ? found : [];
  const run = (fn: () => Promise<{ error: { message?: string; code?: string } | null }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const { error: e } = await fn();
      if (e) return setError(chatErrorKey(e));
      after?.();
      onChanged();
    });
  };

  const confirmThen = (key: string, fn: () => void) => { if (window.confirm(t(key))) fn(); };

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-surface sm:w-80" aria-label={t("chat.info")}>
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="font-semibold">{t("chat.info")}</h3>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1 text-muted hover:bg-surface-muted"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="space-y-5 p-4">
        {error && <Alert tone="danger">{t(`chat.errors.${error}`)}</Alert>}

        {!isGroup && (
          <div className="flex items-center gap-3">
            <Avatar name={chat.other_name} handle={chat.other_handle} seed={chat.other_id ?? chat.chat_id} size="lg" />
            <div className="min-w-0"><p className="truncate font-semibold">{chat.other_name || (chat.other_handle ? `@${chat.other_handle}` : "—")}</p>{chat.other_handle && <p className="truncate text-sm text-muted">@{chat.other_handle}</p>}</div>
          </div>
        )}

        {isGroup && iAmOwner && (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => supabase.rpc("chat_rename", { p_chat: chat.chat_id, p_title: title.trim() })); }}>
            <Input id="rename-group" label={t("chat.groupName")} maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Button type="submit" size="sm" variant="secondary" disabled={pending || !title.trim() || title.trim() === (chat.title ?? "")}>{t("chat.rename")}</Button>
          </form>
        )}

        {isGroup && (
          <section aria-label={t("chat.members")} className="space-y-2">
            <h4 className="text-sm font-medium text-muted">{t("chat.members")} · {members.length}/{MAX_GROUP_MEMBERS}</h4>
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                  <Avatar name={m.name} handle={m.handle} seed={m.user_id} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{m.name || (m.handle ? `@${m.handle}` : "—")}{m.user_id === meId ? ` (${t("chat.you")})` : ""}{m.handle && m.name ? <span className="text-muted"> @{m.handle}</span> : null}</span>
                  {m.role === "owner" && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">{t("chat.owner")}</span>}
                  {iAmOwner && m.user_id !== meId && (
                    <button type="button" disabled={pending} aria-label={t("chat.removeMember")} title={t("chat.removeMember")} onClick={() => confirmThen("chat.removeConfirm", () => run(async () => supabase.rpc("chat_remove_member", { p_chat: chat.chat_id, p_user: m.user_id })))} className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-danger"><UserMinus className="h-4 w-4" aria-hidden /></button>
                  )}
                </li>
              ))}
            </ul>
            {iAmOwner && members.length < MAX_GROUP_MEMBERS && (
              <div className="space-y-1 pt-2">
                <Input id="add-member" label={t("chat.addMember")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="@trader_01" autoComplete="off" autoCapitalize="none" spellCheck={false} />
                <ul className="space-y-1">
                  {foundShown.map((u) => (
                    <li key={u.user_id}>
                      <button type="button" disabled={pending} onClick={() => run(async () => supabase.rpc("chat_add_member", { p_chat: chat.chat_id, p_user: u.user_id }), () => { setQ(""); setFound([]); })} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-surface-muted">
                        <UserPlus className="h-4 w-4 text-primary" aria-hidden /> <span className="truncate">{u.name || `@${u.handle}`}</span> <span className="text-xs text-muted">@{u.handle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm" className="w-full justify-start" disabled={pending} onClick={() => run(async () => supabase.from("chat_members").update({ muted: !chat.muted }).eq("chat_id", chat.chat_id).eq("user_id", meId))}>
            {chat.muted ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />} {chat.muted ? t("chat.unmute") : t("chat.mute")}
          </Button>
          {!isGroup && chat.other_id && (
            <Button variant="secondary" size="sm" className="w-full justify-start" disabled={pending}
              onClick={() => blockedByMe
                ? run(async () => supabase.from("user_blocks").delete().eq("blocked_id", chat.other_id!), () => setBlockedByMe(false))
                : confirmThen("chat.blockConfirm", () => run(async () => supabase.from("user_blocks").insert({ blocked_id: chat.other_id! }), () => setBlockedByMe(true)))}>
              <Ban className="h-4 w-4" aria-hidden /> {blockedByMe ? t("chat.unblock") : t("chat.block")}
            </Button>
          )}
          <Button variant="secondary" size="sm" className="w-full justify-start" disabled={pending} onClick={() => confirmThen(isGroup ? "chat.leaveConfirm" : "chat.deleteDmConfirm", () => run(async () => supabase.rpc("chat_leave", { p_chat: chat.chat_id }), onLeft))}>
            <LogOut className="h-4 w-4" aria-hidden /> {isGroup ? t("chat.leaveGroup") : t("chat.deleteDm")}
          </Button>
          {isGroup && iAmOwner && (
            <Button variant="danger" size="sm" className="w-full justify-start" disabled={pending} onClick={() => confirmThen("chat.deleteGroupConfirm", () => run(async () => supabase.rpc("chat_delete_group", { p_chat: chat.chat_id }), onLeft))}>
              <Trash2 className="h-4 w-4" aria-hidden /> {t("chat.deleteGroup")}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
