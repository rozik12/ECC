"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus } from "lucide-react";
import { saveTemplateAction } from "@/app/actions/templates";
import { Alert, Button, Input, Modal } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/** «Сохранить как шаблон»: настройки сделки без цен и времени, чтобы быстро открывать похожие. */
export function SaveTemplateButton({ tradeId, defaultName }: { tradeId: string; defaultName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName.slice(0, 40));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { setDone(false); setOpen(true); }}>
        <BookmarkPlus className="h-4 w-4" aria-hidden /> {t("journal.saveTemplate")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("journal.saveTemplate")}
        footer={
          done ? (
            <Button onClick={() => setOpen(false)}>{t("common.close")}</Button>
          ) : (
            <><Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button disabled={pending || !name.trim()} onClick={() => { setError(null); startTransition(async () => { const r = await saveTemplateAction(tradeId, name); if (!r.ok) return setError(r.error); setDone(true); }); }}>{t("common.save")}</Button></>
          )
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{t(error)}</Alert>}
          {done ? <Alert tone="success">{t("journal.templateSaved")}</Alert> : (
            <>
              <p className="text-muted">{t("journal.templateText")}</p>
              <Input id="tpl-name" label={t("journal.templateName")} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
