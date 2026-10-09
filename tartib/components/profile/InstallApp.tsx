"use client";

import { useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Браузер присылает событие «можно установить» один раз за загрузку страницы: сохраняем его и оповещаем подписчиков.
let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

type Mode = "unknown" | "standalone" | "can-install" | "ios" | "manual";

function snapshot(): Mode {
  if (installed || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return "standalone";
  if (deferred) return "can-install";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  return "manual";
}

/** Установка на экран телефона. Показывает то, что реально доступно в этом браузере. */
export function InstallApp() {
  const { t } = useI18n();
  const mode = useSyncExternalStore(subscribe, snapshot, () => "unknown" as Mode);
  if (mode === "unknown") return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-semibold">{t("pwa.title")}</h2>
      </div>
      <p className="text-sm text-muted">{t("pwa.text")}</p>
      {mode === "standalone" && <p className="text-sm font-medium text-success">{t("pwa.installed")}</p>}
      {mode === "can-install" && <Button type="button" onClick={() => void deferred?.prompt().then(() => deferred?.userChoice).then(() => { deferred = null; emit(); })}>{t("pwa.install")}</Button>}
      {mode === "ios" && <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">{t("pwa.ios")}</p>}
      {mode === "manual" && <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">{t("pwa.manual")}</p>}
    </Card>
  );
}
