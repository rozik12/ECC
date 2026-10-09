"use client";

import { useState, useTransition } from "react";
import { adminBroadcastAction } from "@/app/actions/notifications";
import { Alert, Button, Card, Input, Textarea } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/** Объявление, которое увидят все пользователи в колокольчике (и в Telegram, если он подключён). */
export function BroadcastForm() {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{t("admin.broadcast")}</h2>
      <p className="text-sm text-muted">{t("admin.broadcastText")}</p>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {sent !== null && <Alert tone="success">{t("admin.broadcastDone", { n: sent })}</Alert>}
      <Input id="bc-title" label={t("admin.broadcastTitle")} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea id="bc-body" label={t("admin.broadcastBody")} maxLength={500} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button
        disabled={pending || title.trim().length < 2 || body.trim().length < 2}
        onClick={() => {
          if (!window.confirm(t("admin.broadcastConfirm"))) return;
          setError(null);
          setSent(null);
          startTransition(async () => {
            const result = await adminBroadcastAction(title, body);
            if (!result.ok) return setError(result.error);
            setSent(result.count ?? 0);
            setTitle("");
            setBody("");
          });
        }}
      >
        {t("admin.broadcastSend")}
      </Button>
    </Card>
  );
}
