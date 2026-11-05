"use client";

// Обёртки для 3D. До загрузки (и всегда, если устройство слабое или 3D не нужен) показывается обычная картинка из `fallback`.
// Тяжёлый код three.js скачивается только когда блок оказался на экране.
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { detectDevice, shouldRun3D } from "@/lib/three-support";
import type { SceneDay } from "./DisciplineScene";

type SceneProps = { onError?: () => void };

function useLazyScene<P extends SceneProps>(load: () => Promise<{ default: ComponentType<P> }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [Scene, setScene] = useState<ComponentType<P> | null>(null);
  const [failed, setFailed] = useState(false);
  const loadRef = useRef(load);

  useEffect(() => {
    const el = ref.current;
    if (!el || !shouldRun3D(detectDevice())) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const go = () => loadRef.current().then((m) => { if (!cancelled) setScene(() => m.default); }).catch(() => { if (!cancelled) setFailed(true); });
      if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 1500 });
      else setTimeout(go, 200);
    }, { rootMargin: "150px" });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, []);

  const onError = useCallback(() => setFailed(true), []);
  return { ref, Scene: failed ? null : Scene, onError };
}

/** Золотой слиток. */
export function Ingot3D({ fallback, label, className }: { fallback: ReactNode; label: string; className?: string }) {
  const { ref, Scene, onError } = useLazyScene<SceneProps>(() => import("./IngotScene"));
  return (
    <div ref={ref} className={className} role="img" aria-label={label}>
      {Scene ? <Scene onError={onError} /> : fallback}
    </div>
  );
}

/** Объёмный график дисциплины по дням. */
export function Discipline3D({ days, fallback, label, className }: { days: SceneDay[]; fallback: ReactNode; label: string; className?: string }) {
  const { ref, Scene, onError } = useLazyScene<SceneProps & { days: SceneDay[] }>(() => import("./DisciplineScene"));
  return (
    <div ref={ref} className={className} role="img" aria-label={label}>
      {Scene ? <Scene days={days} onError={onError} /> : fallback}
    </div>
  );
}
