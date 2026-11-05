"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { setTelegramNotifyAction } from "@/app/actions/notifications";
import { createTelegramCodeAction, setTelegramRemindersAction, unlinkTelegramAction } from "@/app/actions/telegram";
import { Alert, Badge, Button, buttonStyles, Card, Switch } from "@/components/ui";
import { TELEGRAM_BOT_USERNAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/provider";

export function TelegramCard({ linked, reminders, notify }: { linked: boolean; reminders: boolean; notify: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await createTelegramCodeAction();
      if (!result.ok) return setError(result.error);
      setCode(result.code);
    });
  }

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await unlinkTelegramAction();
      if (!result.ok) return setError(result.error);
      setCode(null);
      router.refresh();
    });
  }

  function toggleReminders(on: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setTelegramRemindersAction(on);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function toggleNotify(on: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setTelegramNotifyAction(on);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-semibold">{t("telegram.title")}</h2>
        <Badge tone={linked ? "success" : "neutral"}>{linked ? t("telegram.on") : t("telegram.off")}</Badge>
      </div>
      <p className="text-sm text-muted">{t("telegram.text")}</p>
      {error && <Alert tone="danger">{t(error)}</Alert>}

      {linked ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
            <span>{t("telegram.reminders")}</span>
            <Switch checked={reminders} disabled={pending} label={t("telegram.reminders")} onChange={toggleReminders} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
            <span>{t("telegram.notify")}</span>
            <Switch checked={notify} disabled={pending} label={t("telegram.notify")} onChange={toggleNotify} />
          </div>
          <Button type="button" variant="secondary" disabled={pending} onClick={disconnect}>{t("telegram.disconnect")}</Button>
        </>
      ) : code ? (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{t("telegram.step1")}</li>
            <li>{t("telegram.step2")}</li>
          </ol>
          <a
            href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles({ size: "lg", className: "w-full sm:w-auto" })}
          >
            <Send className="h-4 w-4" aria-hidden /> {t("telegram.open")}
          </a>
          <p className="text-sm text-muted">{t("telegram.manual", { bot: `@${TELEGRAM_BOT_USERNAME}`, code })}</p>
          <Button type="button" variant="ghost" onClick={() => router.refresh()}>{t("telegram.check")}</Button>
        </div>
      ) : (
        <Button type="button" disabled={pending} onClick={connect}>{t("telegram.connect")}</Button>
      )}
    </Card>
  );
}
