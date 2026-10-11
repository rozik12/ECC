"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { saveMistakeAction } from "@/app/actions/mistakes";
import { removeScreenshotAction, uploadScreenshotAction } from "@/app/actions/screenshots";
import { Alert, Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { MISTAKES } from "@/lib/journal";

type Props = { tradeId: string; mistakes: string[]; note: string; url: string | null };

/** Разбор ошибки в одной сделке: что за ошибка, из-за чего она случилась и снимок экрана (можно вставить из буфера обмена или перетащить). */
export function MistakeEditor({ tradeId, mistakes: initialMistakes, note: initialNote, url }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [mistakes, setMistakes] = useState(initialMistakes);
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = note !== initialNote || mistakes.join() !== initialMistakes.join();

  function toggle(m: string) {
    setSaved(false);
    setMistakes((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  function upload(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) return setError("screenshot.tooBig");
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const r = await uploadScreenshotAction(tradeId, form);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  function onPaste(e: React.ClipboardEvent) {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); upload(file); }
  }

  function onDrop(e: React.DragEvent) {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); upload(file); }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveMistakeAction({ tradeId, mistakes, note });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("journal.mistakes")}>
        {MISTAKES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mistakes.includes(m)}
            onClick={() => toggle(m)}
            className={cn("min-h-10 rounded-xl border px-3 text-sm", mistakes.includes(m) ? "border-warning bg-warning-soft font-medium" : "border-border text-muted hover:text-foreground")}
          >
            {t(`journal.mistakeNames.${m}`)}
          </button>
        ))}
      </div>
      <Textarea
        id={`why-${tradeId}`}
        label={t("journal.mistakeNote")}
        hint={t("journal.mistakeNoteHint")}
        value={note}
        maxLength={2000}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !dirty} onClick={save}>{t("mistakes.save")}</Button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t("screenshot.choose")} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <ImagePlus className="h-4 w-4" aria-hidden /> {url ? t("screenshot.replace") : t("screenshot.add")}
        </Button>
        {url && (
          <Button variant="ghost" size="sm" disabled={pending} aria-label={t("common.delete")} onClick={() => startTransition(async () => { const r = await removeScreenshotAction(tradeId); if (!r.ok) return setError(r.error); router.refresh(); })}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {saved && <span className="text-sm text-success" role="status">{t("mistakes.saved")}</span>}
      </div>
      <p className="text-xs text-muted">{t("mistakes.pasteHint")}</p>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={t("screenshot.title")} className="max-h-72 w-full rounded-xl border border-border object-contain" />
      )}
    </div>
  );
}
