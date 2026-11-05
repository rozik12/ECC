"use client";

import { useState } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { telegramShareUrl, whatsappShareUrl } from "@/lib/referral";

export type ReferralTexts = {
  title: string; text: string; copy: string; copied: string; share: string; telegram: string; whatsapp: string; invited: string; shareText: string; note: string;
};

/** Ссылка-приглашение: копировать, отправить в Telegram или WhatsApp, системное «поделиться». Награды деньгами нет: считаем только приглашённых. */
export function ReferralCard({ link, invited, texts }: { link: string; invited: number; texts: ReferralTexts }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* буфер обмена недоступен: ссылку можно выделить вручную */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Tartib", text: texts.shareText, url: link });
    } catch {
      /* человек закрыл окно «поделиться» */
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{texts.title}</h2>
        <p className="mt-1 text-sm text-muted">{texts.text}</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-sm">{link}</code>
        <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label={texts.copy}>
          {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <span className="ml-1.5">{done ? texts.copied : texts.copy}</span>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={telegramShareUrl(link, texts.shareText)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted">
          <Send className="h-4 w-4" aria-hidden /> {texts.telegram}
        </a>
        <a href={whatsappShareUrl(link, texts.shareText)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted">
          {texts.whatsapp}
        </a>
        {canShare && (
          <Button type="button" variant="secondary" size="sm" onClick={share}>
            <Share2 className="mr-1.5 h-4 w-4" aria-hidden /> {texts.share}
          </Button>
        )}
      </div>
      <p className="text-sm"><span className="text-muted">{texts.invited}: </span><span className="font-semibold tabular-nums">{invited}</span></p>
      <p className="text-xs text-muted">{texts.note}</p>
    </Card>
  );
}
