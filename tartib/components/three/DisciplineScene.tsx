"use client";

// Объёмный график дисциплины: 28 столбиков (4 недели). Высота и цвет показывают долю сделок по правилам в этот день.
import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping, BoxGeometry, Color, DirectionalLight, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type SceneDay = { percent: number | null };

const COLS = 7;
const CELL = 0.64;
const GAP = 0.14;
const colorFor = (p: number | null) => (p === null ? "#8d97a8" : p >= 80 ? "#2f9e6b" : p >= 50 ? "#e0a526" : "#d9534f");
const heightFor = (p: number | null) => (p === null ? 0.06 : 0.18 + (p / 100) * 1.7);

export default function DisciplineScene({ days, onError }: { days: SceneDay[]; onError?: () => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      onError?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    const canvas = renderer.domElement;
    canvas.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease;touch-action:pan-y";
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    const sun = new DirectionalLight("#ffffff", 0.9);
    sun.position.set(3, 6, 4);
    scene.add(sun);

    const camera = new PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 5.6, 7.4);
    camera.lookAt(0, 0.3, 0);

    const rows = Math.ceil(days.length / COLS);
    const step = CELL + GAP;
    const geo = new BoxGeometry(CELL, 1, CELL);
    const mat = new MeshStandardMaterial({ metalness: 0.1, roughness: 0.5, envMapIntensity: 0.5 });
    const bars = new InstancedMesh(geo, mat, days.length);
    const dummy = new Object3D();
    days.forEach((d, i) => bars.setColorAt(i, new Color(colorFor(d.percent))));
    const plateGeo = new BoxGeometry(COLS * step + 0.3, 0.14, rows * step + 0.3);
    const plateMat = new MeshStandardMaterial({ color: "#1b2740", metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.85 });
    const plate = new Mesh(plateGeo, plateMat);
    plate.position.y = -0.08;
    const group = new Group();
    group.add(plate, bars);
    scene.add(group);

    const place = (k: number) => {
      days.forEach((d, i) => {
        const full = heightFor(d.percent) * k;
        const col = i % COLS, row = Math.floor(i / COLS);
        dummy.position.set((col - (COLS - 1) / 2) * step, full / 2, (row - (rows - 1) / 2) * step);
        dummy.scale.set(1, Math.max(0.001, full), 1);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      });
      bars.instanceMatrix.needsUpdate = true;
    };
    place(0);

    const pointer = { x: 0 };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2; };
    const onLeave = () => { pointer.x = 0; };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w / h < 1.4 ? 42 : 32;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let visible = true, raf = 0, first = true;
    const born = performance.now();
    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.visibilityState !== "visible") return;
      const k = Math.min(1, (now - born) / 1000);
      place(1 - Math.pow(1 - k, 3));
      group.rotation.y += ((Math.sin(now / 2600) * 0.32 + pointer.x * 0.45) - group.rotation.y) * 0.06;
      renderer.render(scene, camera);
      if (first) { first = false; canvas.style.opacity = "1"; }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); if (visible) start(); }, { threshold: 0.05 });
    io.observe(el);
    const onVis = () => start();
    document.addEventListener("visibilitychange", onVis);
    const onLost = (e: Event) => { e.preventDefault(); onError?.(); };
    canvas.addEventListener("webglcontextlost", onLost);
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      geo.dispose(); mat.dispose(); bars.dispose(); plateGeo.dispose(); plateMat.dispose();
      envRT.dispose(); pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [days, onError]);

  return <div ref={host} className="h-full w-full" />;
}
