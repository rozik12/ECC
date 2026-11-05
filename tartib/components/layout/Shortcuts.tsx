"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

// Одна клавиша без Ctrl/Alt/Cmd. Не срабатывает, пока пользователь печатает в поле или открыто окно.
export const SHORTCUTS = [
  { key: "n", href: "/trades/new", label: "shortcuts.new" },
  { key: "d", href: "/dashboard", label: "shortcuts.dashboard" },
  { key: "t", href: "/trades", label: "shortcuts.trades" },
  { key: "s", href: "/statistics", label: "shortcuts.stats" },
  { key: "r", href: "/rules", label: "shortcuts.rules" },
  { key: "c", href: "/calculator", label: "shortcuts.calc" },
  { key: "o", href: "/tools", label: "shortcuts.tools" },
] as const;

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function Shortcuts() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      const hit = SHORTCUTS.find((s) => s.key === e.key.toLowerCase());
      if (hit) {
        e.preventDefault();
        router.push(hit.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 hidden text-xs text-muted hover:text-foreground lg:block">
        {t("shortcuts.hint")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("shortcuts.title")}>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center justify-between py-2">
              <span>{t(s.label)}</span>
              <kbd className="rounded border border-border bg-surface-muted px-2 py-0.5 font-mono text-xs uppercase">{s.key}</kbd>
            </li>
          ))}
          <li className="flex items-center justify-between py-2">
            <span>{t("shortcuts.help")}</span>
            <kbd className="rounded border border-border bg-surface-muted px-2 py-0.5 font-mono text-xs">?</kbd>
          </li>
        </ul>
      </Modal>
    </>
  );
}
