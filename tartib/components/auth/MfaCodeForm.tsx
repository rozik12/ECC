"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { verifyLoginMfaAction } from "@/app/actions/mfa";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/** Второй шаг входа: код из приложения-аутентификатора. */
export function MfaCodeForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await verifyLoginMfaAction(code.trim());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("auth.mfa.title")}</h1>
      <p className="mb-6 mt-2 text-muted">{t("auth.mfa.text")}</p>
      <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Alert tone="danger">{t(error)}</Alert>}
        <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} label={t("auth.mfa.code")} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
        <Button type="submit" size="lg" disabled={busy || code.length !== 6}>{t("auth.mfa.verify")}</Button>
      </form>
      <form action={logoutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-muted hover:text-foreground hover:underline">{t("auth.mfa.cancel")}</button>
      </form>
    </div>
  );
}
