"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateChecklistAction } from "@/app/actions/settings";
import { Alert, Button, Card, Switch, Textarea } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function ChecklistSettings({ enabled, items }: { enabled: boolean; items: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [text, setText] = useState(items.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const list = text.split("\n").map((s) => s.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await updateChecklistAction({ enabled: on, items: list });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("checklist.settingsTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("checklist.settingsText")}</p>
      </div>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {saved && <Alert tone="success">{t("settings.saved")}</Alert>}
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={on} onChange={setOn} label={t("checklist.enable")} />
        {t("checklist.enable")}
      </label>
      <Textarea id="checklist-items" rows={6} label={t("checklist.itemsLabel")} hint={t("checklist.itemsHint")} value={text} onChange={(e) => setText(e.target.value)} />
      <Button onClick={save} disabled={pending}>{t("common.save")}</Button>
    </Card>
  );
}
