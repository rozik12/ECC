// Общая основа для 3D-сцен: рендерер, отражения, размеры, пауза вне экрана, потеря контекста, аккуратная уборка.
import { ACESFilmicToneMapping, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type Pointer = { x: number; y: number };
export type StageOptions = {
  fov?: number;
  /** Угол обзора, когда блок уже, чем выше (телефон) */
  narrowFov?: number;
  exposure?: number;
  /** Кадр: время с прошлого кадра, абсолютное время, положение указателя (−1…1) */
  onFrame: (dt: number, now: number, pointer: Pointer, aspect: number) => void;
  onError?: () => void;
};
export type Stage = { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; track: (cleanup: () => void) => void; dispose: () => void };

export function createStage(el: HTMLElement, o: StageOptions): Stage | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    o.onError?.();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  const canvas = renderer.domElement;
  canvas.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity .6s ease;touch-action:pan-y";
  canvas.setAttribute("aria-hidden", "true");
  el.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  const camera = new PerspectiveCamera(o.fov ?? 30, 1, 0.1, 80);

  const cleanups: (() => void)[] = [];
  const pointer: Pointer = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
    pointer.y = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
  };
  const onLeave = () => { pointer.x = 0; pointer.y = 0; };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerleave", onLeave);

  let aspect = 1;
  const resize = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < 1.2 && o.narrowFov ? o.narrowFov : (o.fov ?? 30);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let visible = true, raf = 0, first = true, last = performance.now();
  const frame = (now: number) => {
    raf = 0;
    if (!visible || document.visibilityState !== "visible") return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    o.onFrame(dt, now, pointer, aspect);
    renderer.render(scene, camera);
    if (first) { first = false; canvas.style.opacity = "1"; }
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); if (visible) start(); }, { threshold: 0.03 });
  io.observe(el);
  document.addEventListener("visibilitychange", start);
  const onLost = (e: Event) => { e.preventDefault(); o.onError?.(); };
  canvas.addEventListener("webglcontextlost", onLost);
  start();

  return {
    scene, camera, renderer,
    track: (fn) => void cleanups.push(fn),
    dispose: () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", start);
      canvas.removeEventListener("webglcontextlost", onLost);
      cleanups.forEach((fn) => fn());
      envRT.dispose(); pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
