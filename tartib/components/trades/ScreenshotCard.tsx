"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { removeScreenshotAction, uploadScreenshotAction } from "@/app/actions/screenshots";
import { Alert, Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function ScreenshotCard({ tradeId, url }: { tradeId: string; url: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) return setError("screenshot.tooBig");
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const result = await uploadScreenshotAction(tradeId, form);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("screenshot.title")}</h2>
        <div className="flex gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} aria-label={t("screenshot.choose")} />
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            <ImagePlus className="h-4 w-4" aria-hidden /> {url ? t("screenshot.replace") : t("screenshot.add")}
          </Button>
          {url && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-label={t("common.delete")}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await removeScreenshotAction(tradeId);
                  if (!result.ok) return setError(result.error);
                  router.refresh();
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {error && <Alert tone="danger" className="mt-3">{t(error)}</Alert>}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={t("screenshot.title")} className="mt-4 max-h-[32rem] w-full rounded-xl border border-border object-contain" />
      ) : (
        <p className="mt-3 text-sm text-muted">{t("screenshot.hint")}</p>
      )}
    </Card>
  );
}
