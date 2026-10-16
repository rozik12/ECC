"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSupportReplyAction, sendSupportMessageAction } from "@/app/actions/support";
import { Alert, Button, Card, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

export type ThreadMessage = { id: string; fromAdmin: boolean; body: string; when: string };

/** Переписка с владельцем. mode="user" — пишет пользователь, mode="admin" — владелец отвечает пользователю userId.
 *  Страница сама подтягивает новые сообщения раз в 20 секунд, пока вкладка открыта. */
export function SupportThread({ messages, mode, userId }: { messages: ThreadMessage[]; mode: "user" | "admin"; userId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  const send = () => {
    setError(null);
    startTransition(async () => {
      const r = mode === "admin" && userId ? await adminSupportReplyAction(userId, text) : await sendSupportMessageAction(text);
      if (!r.ok) return setError(r.error);
      setText("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card className="max-h-[55vh] min-h-40 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 ? <p className="text-sm text-muted">{t(mode === "admin" ? "support.adminEmpty" : "support.empty")}</p> : null}
        {messages.map((m) => {
          const mine = mode === "admin" ? m.fromAdmin : !m.fromAdmin;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-primary text-white" : "bg-surface-muted")}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-muted")}>{m.fromAdmin ? t("support.owner") : t("support.you")} · {m.when}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </Card>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <Textarea
        id="support-text"
        label={t(mode === "admin" ? "support.replyLabel" : "support.writeLabel")}
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && text.trim() && !pending) send(); }}
      />
      <Button disabled={pending || text.trim().length === 0} onClick={send}>{t("support.send")}</Button>
    </div>
  );
}
