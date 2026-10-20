"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Alert, Button, Input, Modal } from "@/components/ui";
import { chatErrorKey, MAX_GROUP_MEMBERS, MAX_TITLE } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Avatar } from "./Avatar";

export type FoundUser = { user_id: string; name: string | null; handle: string };
type Tab = "dm" | "group" | "blocked";

/** Окно «Новый чат»: личный чат по нику, группа и список заблокированных. */
export function NewChat({ open, onClose, onOpenChat }: { open: boolean; onClose: () => void; onOpenChat: (chatId: string) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("dm");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<FoundUser[]>([]);
  const [blocked, setBlocked] = useState<FoundUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Поиск по нику с небольшой паузой, чтобы не слать запрос на каждую букву
  useEffect(() => {
    const query = q.trim().replace(/^@/, "");
    if (!open || tab === "blocked" || query.length < 3) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      const { data } = await getBrowserClient().rpc("chat_search_users", { p_q: query });
      if (!cancelled) {
        setResults((data ?? []) as FoundUser[]);
        setSearched(true);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [q, open, tab]);

  useEffect(() => {
    if (!open || tab !== "blocked") return;
    getBrowserClient().rpc("chat_blocks").then(({ data }) => setBlocked((data ?? []) as FoundUser[]));
  }, [open, tab]);

  const queryOk = q.trim().replace(/^@/, "").length >= 3 && tab !== "blocked";
  const shownResults = queryOk ? results : [];
  const reset = () => { setQ(""); setResults([]); setSearched(false); setTitle(""); setPicked([]); setError(null); };
  const close = () => { reset(); onClose(); };

  const startDm = (u: FoundUser) => {
    setError(null);
    startTransition(async () => {
      const { data, error: e } = await getBrowserClient().rpc("chat_start_dm", { p_user: u.user_id });
      if (e) return setError(chatErrorKey(e));
      reset();
      onOpenChat(String(data));
    });
  };

  const createGroup = () => {
    setError(null);
    startTransition(async () => {
      const { data, error: e } = await getBrowserClient().rpc("chat_create_group", { p_title: title.trim(), p_members: picked.map((p) => p.user_id) });
      if (e) return setError(chatErrorKey(e));
      reset();
      onOpenChat(String(data));
    });
  };

  const unblock = (u: FoundUser) => {
    startTransition(async () => {
      await getBrowserClient().from("user_blocks").delete().eq("blocked_id", u.user_id);
      setBlocked((list) => list.filter((x) => x.user_id !== u.user_id));
    });
  };

  const tabs: [Tab, string][] = [["dm", t("chat.newDm")], ["group", t("chat.newGroup")], ["blocked", t("chat.blockedTab")]];

  return (
    <Modal open={open} onClose={close} title={t("chat.newChat")}>
      <div className="space-y-4">
        <div role="tablist" className="flex gap-1 rounded-xl bg-surface-muted p-1">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setError(null); }}
              className={cn("min-h-9 flex-1 rounded-lg px-2 text-sm font-medium", tab === id ? "bg-surface shadow-sm" : "text-muted hover:text-foreground")}>{label}</button>
          ))}
        </div>
        {error && <Alert tone="danger">{t(`chat.errors.${error}`)}</Alert>}

        {tab !== "blocked" && (
          <>
            {tab === "group" && (
              <Input id="group-title" label={t("chat.groupName")} maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("chat.groupNamePlaceholder")} />
            )}
            {tab === "group" && picked.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t("chat.selected")}>
                {picked.map((p) => (
                  <li key={p.user_id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-1 text-xs text-primary">
                    @{p.handle}
                    <button type="button" aria-label={t("chat.removeMember")} onClick={() => setPicked((l) => l.filter((x) => x.user_id !== p.user_id))} className="rounded-full p-0.5 hover:bg-primary/20"><X className="h-3.5 w-3.5" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
            <Input id="chat-search" label={tab === "dm" ? t("chat.searchLabel") : t("chat.addMembers", { max: MAX_GROUP_MEMBERS - 1 })} value={q} placeholder="@trader_01" autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setQ(e.target.value)} hint={t("chat.searchHint")} />
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {shownResults.map((u) => {
                const isPicked = picked.some((p) => p.user_id === u.user_id);
                return (
                  <li key={u.user_id}>
                    <button type="button" disabled={pending} onClick={() => (tab === "dm" ? startDm(u) : setPicked((l) => (isPicked || l.length >= MAX_GROUP_MEMBERS - 1 ? l : [...l, u])))}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-muted disabled:opacity-60">
                      <Avatar name={u.name} handle={u.handle} seed={u.user_id} />
                      <span className="min-w-0"><span className="block truncate font-medium">{u.name || `@${u.handle}`}</span><span className="block truncate text-xs text-muted">@{u.handle}</span></span>
                      {tab === "group" && isPicked && <span className="ml-auto text-xs text-primary">✓</span>}
                    </button>
                  </li>
                );
              })}
              {queryOk && searched && results.length === 0 && <li className="px-2 py-3 text-sm text-muted">{t("chat.noResults")}</li>}
            </ul>
            {tab === "group" && <Button disabled={pending || title.trim().length < 1} onClick={createGroup} className="w-full">{t("chat.create")}{picked.length > 0 ? ` (${picked.length + 1})` : ""}</Button>}
          </>
        )}

        {tab === "blocked" && (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {blocked.length === 0 && <li className="px-2 py-3 text-sm text-muted">{t("chat.noBlocked")}</li>}
            {blocked.map((u) => (
              <li key={u.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={u.name} handle={u.handle} seed={u.user_id} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.name || `@${u.handle}`}</span><span className="block truncate text-xs text-muted">@{u.handle}</span></span>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => unblock(u)}>{t("chat.unblock")}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
