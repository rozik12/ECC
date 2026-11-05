"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { chatErrorKey, handleProblem, normalizeHandle } from "@/lib/chat";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";

/** Первый вход в мессенджер: выбор ника, по которому находят друг друга. Почта и имя без ника другим не видны. */
export function HandleSetup({ onDone }: { onDone: (handle: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const problem = handleProblem(value);
    if (problem) return setError(problem);
    setError(null);
    startTransition(async () => {
      const { data, error: e } = await getBrowserClient().rpc("chat_set_handle", { p_handle: normalizeHandle(value) });
      if (e) return setError(chatErrorKey(e));
      onDone(String(data ?? normalizeHandle(value)));
    });
  };

  return (
    <Card className="mx-auto mt-6 max-w-md space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("chat.handleTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("chat.handleText")}</p>
      </div>
      {error && <Alert tone="danger">{t(`chat.errors.${error}`)}</Alert>}
      <Input
        id="chat-handle"
        label={t("chat.handleLabel")}
        hint={t("chat.handleRules")}
        value={value}
        maxLength={21}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="trader_01"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim() && !pending) save(); }}
      />
      <Button disabled={pending || value.trim().length < 3} onClick={save}>{t("chat.handleSave")}</Button>
    </Card>
  );
}
