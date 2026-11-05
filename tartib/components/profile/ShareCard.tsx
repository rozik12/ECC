"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Share2 } from "lucide-react";
import { setShareAction } from "@/app/actions/settings";
import { Alert, Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function ShareCard({ token }: { token: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const url = token ? `${origin}/u/${token}` : "";

  function run(mode: "on" | "off" | "renew") {
    setError(null);
    startTransition(async () => {
      const result = await setShareAction(mode);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("errors.generic");
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Share2 className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-semibold">{t("share.cardTitle")}</h2>
      </div>
      <p className="text-sm text-muted">{t("share.cardText")}</p>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {token ? (
        <>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t("share.link")} className="w-full rounded-xl border bg-surface-muted px-3 h-11 text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={copy}><Copy className="h-4 w-4" aria-hidden /> {copied ? t("share.copied") : t("share.copy")}</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run("renew")}>{t("share.renew")}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run("off")}>{t("share.off")}</Button>
          </div>
        </>
      ) : (
        <Button type="button" disabled={pending} onClick={() => run("on")}>{t("share.on")}</Button>
      )}
    </Card>
  );
}
