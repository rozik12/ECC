"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { confirmMfaAction, disableMfaAction, enrollMfaAction } from "@/app/actions/mfa";
import { Alert, Badge, Button, Card, Input, Modal } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

type Setup = { factorId: string; qr: string; secret: string };

/** Двухфакторная защита: код из приложения-аутентификатора при каждом входе. */
export function MfaCard({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    setCode("");
    startTransition(async () => {
      const result = await enrollMfaAction();
      if (!result.ok) return setError(result.error);
      setSetup({ factorId: result.factorId, qr: result.qr, secret: result.secret });
    });
  }

  function confirm() {
    if (!setup) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmMfaAction(setup.factorId, code.trim());
      if (!result.ok) return setError(result.error);
      setSetup(null);
      router.refresh();
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      const result = await disableMfaAction();
      if (!result.ok) return setError(result.error);
      setConfirmOff(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-semibold">{t("profile.mfa.title")}</h2>
        <Badge tone={enabled ? "success" : "neutral"}>{enabled ? t("profile.mfa.on") : t("profile.mfa.off")}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">{t("profile.mfa.text")}</p>
      {error && !setup && !confirmOff && <Alert tone="danger" className="mt-3">{t(error)}</Alert>}

      {!enabled && !setup && (
        <Button className="mt-4" onClick={start} disabled={pending}>{t("profile.mfa.enable")}</Button>
      )}
      {enabled && (
        <>
          <p className="mt-3 text-sm text-warning">{t("profile.mfa.lostHint")}</p>
          <Button variant="secondary" className="mt-4" onClick={() => { setError(null); setConfirmOff(true); }}>{t("profile.mfa.disable")}</Button>
        </>
      )}

      {setup && (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <p className="text-sm">{t("profile.mfa.scan")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR" className="h-48 w-48 rounded-xl border border-border bg-white p-2" />
          <div>
            <p className="text-sm text-muted">{t("profile.mfa.secret")}</p>
            <code className="mt-1 block break-all rounded-lg bg-surface-muted p-2 text-sm">{setup.secret}</code>
          </div>
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <Input id="mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} label={t("profile.mfa.codeLabel")} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={pending || code.length !== 6}>{t("profile.mfa.confirm")}</Button>
            <Button variant="secondary" onClick={() => setSetup(null)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}

      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={t("profile.mfa.disableTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOff(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={disable} disabled={pending}>{t("profile.mfa.disable")}</Button>
          </>
        }
      >
        <p>{t("profile.mfa.disableText")}</p>
        {error && <Alert tone="danger" className="mt-3">{t(error)}</Alert>}
      </Modal>
    </Card>
  );
}
