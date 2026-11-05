"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createApiTokenAction, deleteApiTokenAction } from "@/app/actions/api-tokens";
import { Alert, Button, Card, Input } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

export type TokenView = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

const EXAMPLE = (origin: string) => `curl -X POST ${origin}/api/v1/trades \\
  -H "Authorization: Bearer tt_ВАШ_КЛЮЧ" \\
  -H "Content-Type: application/json" \\
  -d '{"instrument":"BTC/USDT","direction":"long","entry_price":65000,"exit_price":66000,"position_size":0.1,"fees":1.3}'`;

/** Личные ключи для роботов: создание, список и удаление. Сам ключ показывается один раз. */
export function ApiTokensCard({ tokens, timeZone }: { tokens: TokenView[]; timeZone: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    setFresh(null);
    startTransition(async () => {
      const r = await createApiTokenAction(name);
      if (!r.ok) return setError(r.error);
      setFresh(r.token);
      setName("");
      router.refresh();
    });
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("apitoken.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("apitoken.text")}</p>
      </div>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {fresh && (
        <Alert tone="warning">
          <p className="font-medium">{t("apitoken.once")}</p>
          <code className="mt-2 block break-all rounded-lg bg-surface-muted px-3 py-2 text-xs" data-testid="new-token">{fresh}</code>
        </Alert>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1"><Input id="api-name" label={t("apitoken.name")} placeholder="my-bot" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button onClick={create} disabled={pending || !name.trim()} className="mb-[1.375rem]">{t("apitoken.create")}</Button>
      </div>
      {tokens.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {tokens.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="font-medium">{k.name}</span> <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                <span className="block text-xs text-muted">{k.lastUsedAt ? t("apitoken.lastUsed", { d: formatDateTime(k.lastUsedAt, locale, timeZone) }) : t("apitoken.never")}</span>
              </span>
              <button type="button" disabled={pending} aria-label={t("common.delete")} title={t("common.delete")} onClick={() => startTransition(async () => { await deleteApiTokenAction(k.id); router.refresh(); })} className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-danger">
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-primary">{t("apitoken.how")}</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs">{EXAMPLE("https://tartib.uk")}</pre>
        <p className="mt-2 text-xs leading-relaxed text-muted">{t("apitoken.fields")}</p>
      </details>
    </Card>
  );
}
