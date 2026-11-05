"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAccountAction } from "@/app/actions/auth";
import { Alert, Button, Card, Input, Modal } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function DeleteAccount({ email }: { email: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(typed);
      if (!result.ok) return setError(result.error);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <Card className="border-danger/40">
      <h2 className="font-semibold">{t("profile.dangerTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("profile.dangerText")}</p>
      <Button variant="danger" className="mt-4" onClick={() => { setTyped(""); setError(null); setOpen(true); }}>
        <Trash2 className="h-4 w-4" aria-hidden /> {t("profile.deleteAccount")}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("profile.deleteTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()} onClick={confirm}>
              {t("profile.deleteConfirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p>{t("profile.deleteText")}</p>
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <Input id="del-email" autoComplete="off" label={t("profile.deleteType", { email })} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      </Modal>
    </Card>
  );
}
