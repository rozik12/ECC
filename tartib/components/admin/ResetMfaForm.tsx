"use client";

import { useState, useTransition } from "react";
import { adminResetMfaAction } from "@/app/actions/admin";
import { Alert, Button, Card, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function ResetMfaForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("admin.resetMfa")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.resetMfaText")}</p>
      </div>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {done && <Alert tone="success">{t("settings.saved")}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input id="adm-mfa-email" type="email" label={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button
          variant="secondary"
          disabled={pending || !email.includes("@")}
          onClick={() => {
            setError(null);
            setDone(false);
            startTransition(async () => {
              const result = await adminResetMfaAction(email);
              if (!result.ok) return setError(result.error);
              setDone(true);
            });
          }}
        >
          {t("admin.resetMfaButton")}
        </Button>
      </div>
    </Card>
  );
}
