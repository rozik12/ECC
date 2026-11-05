"use client";

// Обёртка для 3D. До загрузки (и всегда, если устройство слабое или 3D не нужен) показывается обычная картинка из `fallback`.
// Тяжёлый код three.js скачивается только когда блок оказался на экране.
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { detectDevice, shouldRun3D } from "@/lib/three-support";

type SceneProps = { onError?: () => void } & Record<string, unknown>;
const LOADERS = {
  hero: () => import("./HeroScene"),
  metals: () => import("./MetalsScene"),
  discipline: () => import("./DisciplineScene"),
  landscape: () => import("./LandscapeScene"),
} as const;
export type SceneName = keyof typeof LOADERS;

export function Scene3D({ name, props, fallback, label, className }: { name: SceneName; props?: Record<string, unknown>; fallback: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [Scene, setScene] = useState<ComponentType<SceneProps> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !shouldRun3D(detectDevice())) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const go = () => (LOADERS[name]() as Promise<{ default: ComponentType<SceneProps> }>)
        .then((m) => { if (!cancelled) setScene(() => m.default); })
        .catch(() => { if (!cancelled) setFailed(true); });
      if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 1500 });
      else setTimeout(go, 200);
    }, { rootMargin: "150px" });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [name]);

  const onError = useCallback(() => setFailed(true), []);
  return (
    <div ref={ref} className={className} role="img" aria-label={label}>
      {Scene && !failed ? <Scene {...props} onError={onError} /> : fallback}
    </div>
  );
}
