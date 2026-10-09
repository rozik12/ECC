"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { closeTradeAction } from "@/app/actions/templates";
import { Alert, Button, Input, Modal } from "@/components/ui";
import { parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/** Закрытие открытой сделки: цена выхода и (необязательно) время. Результат считается сам. */
export function CloseTradeButton({ tradeId }: { tradeId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const value = parseNumber(price);

  function submit() {
    if (value === null || value <= 0) return setError("errors.number");
    setError(null);
    const when = time ? new Date(time) : null;
    startTransition(async () => {
      const r = await closeTradeAction({ tradeId, exitPrice: value, closedAt: when && !isNaN(when.getTime()) ? when.toISOString() : null });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Flag className="h-4 w-4" aria-hidden /> {t("journal.close")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("journal.closeTitle")}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button disabled={pending || value === null} onClick={submit}>{t("journal.closeConfirm")}</Button></>}
      >
        <div className="space-y-4">
          <p className="text-muted">{t("journal.closeText")}</p>
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <Input id="close-price" inputMode="decimal" label={t("trades.form.exit")} value={price} autoComplete="off" onChange={(e) => setPrice(e.target.value)} />
          <Input id="close-time" type="datetime-local" label={t("journal.closedAt")} hint={t("journal.closeTimeHint")} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
