"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteChallengeAction } from "@/app/actions/prop";
import { useI18n } from "@/lib/i18n/provider";

export function DeleteChallenge({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-label={t("common.delete")} title={t("common.delete")} onClick={() => start(async () => { await deleteChallengeAction(id); router.refresh(); })} className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-danger">
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
