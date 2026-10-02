"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTradeAction } from "@/app/actions/trades";
import { Alert, Button, Modal } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function DeleteTradeButton({ tradeId }: { tradeId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTradeAction(tradeId);
      if (!result.ok) return setError(result.error);
      router.push("/trades");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden /> {t("common.delete")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("trades.detail.deleteTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={pending} onClick={confirm}>{t("common.delete")}</Button>
          </>
        }
      >
        <p>{t("trades.detail.deleteText")}</p>
        {error && <Alert tone="danger" className="mt-3">{t(error)}</Alert>}
      </Modal>
    </>
  );
}
