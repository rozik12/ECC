"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { getBrowserClient } from "@/lib/supabase/browser";

/** Кнопки модерации одной жалобы: удалить сообщение, удалить и заблокировать автора, закрыть жалобу. */
export function ChatReportActions({ id, canBan }: { id: string; canBan: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const act = (del: boolean, ban: boolean) => startTransition(async () => {
    const { error: e } = await getBrowserClient().rpc("admin_chat_handle_report", { p_id: id, p_delete: del, p_ban: ban });
    if (e) return setError(true);
    router.refresh();
  });
  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{t("errors.generic")}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(false, false)}>{t("admin.reportDismiss")}</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(true, false)}>{t("admin.reportDelete")}</Button>
        {canBan && <Button size="sm" variant="danger" disabled={pending} onClick={() => { if (window.confirm(t("admin.reportBanConfirm"))) act(true, true); }}>{t("admin.reportBan")}</Button>}
      </div>
    </div>
  );
}
