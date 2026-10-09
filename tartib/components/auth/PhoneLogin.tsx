"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Phone, Send } from "lucide-react";
import { checkPhoneLoginAction, startPhoneLoginAction } from "@/app/actions/phone-login";
import { Alert, Button, buttonStyles } from "@/components/ui";
import { TELEGRAM_BOT_USERNAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";

const POLL_MS = 2500;
const MAX_MS = 10 * 60 * 1000;

/** Вход и регистрация по номеру телефона: номер подтверждает Telegram-бот, SMS не нужны. */
export function PhoneLogin() {
  const { t } = useI18n();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  function start() {
    setError(null);
    startTransition(async () => {
      const r = await startPhoneLoginAction();
      if (!r.ok) return setError(r.error);
      setToken(r.token);
    });
  }

  useEffect(() => {
    if (!token) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (busy.current) return;
      if (Date.now() - startedAt > MAX_MS) {
        clearInterval(timer);
        setToken(null);
        setError("auth.phone.expired");
        return;
      }
      busy.current = true;
      try {
        const r = await checkPhoneLoginAction(token);
        if (!r.ok) {
          clearInterval(timer);
          setToken(null);
          setError(r.error);
        } else if (r.status === "expired") {
          clearInterval(timer);
          setToken(null);
          setError("auth.phone.expired");
        } else if (r.status === "approved") {
          clearInterval(timer);
          router.replace("/dashboard");
          router.refresh();
        }
      } finally {
        busy.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [token, router]);

  if (token) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm">{t("auth.phone.hint")}</p>
        <a
          href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=login_${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonStyles({ size: "lg", className: "w-full" })}
        >
          <Send className="h-4 w-4" aria-hidden /> {t("auth.phone.open")}
        </a>
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("auth.phone.waiting")}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setToken(null)}>{t("common.cancel")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <Button type="button" variant="secondary" size="lg" className="w-full" disabled={pending} onClick={start}>
        <Phone className="h-5 w-5" aria-hidden /> {t("auth.phone.button")}
      </Button>
    </div>
  );
}
