"use client";

// Золотой слиток в 3D (three.js). Подключается лениво через Lazy3D, поэтому на остальные страницы не влияет.
// Без внешних файлов: отражения даёт встроенная «комната» RoomEnvironment, надпись рисуется на холсте.
import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping, CanvasTexture, CircleGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, Shape, SRGBColorSpace, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

function engraving(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 360;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(92, 58, 6, 0.92)";
  g.font = "700 190px 'Arial Black', Arial, sans-serif";
  g.fillText("TARTIB", c.width / 2, 150);
  g.font = "600 56px Arial, sans-serif";
  g.fillStyle = "rgba(92, 58, 6, 0.8)";
  g.fillText("tartib.uk", c.width / 2, 288);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shadowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.42)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export default function IngotScene({ onError }: { onError?: () => void }) {
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
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease;touch-action:pan-y";
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.5, 5.4);
    camera.lookAt(0, -0.05, 0);

    // Профиль слитка: трапеция (низ шире верха), вытянутая вдоль оси X
    const wBottom = 0.62, wTop = 0.42, h = 0.5, len = 2.1;
    const shape = new Shape();
    shape.moveTo(-wBottom, -h / 2); shape.lineTo(wBottom, -h / 2); shape.lineTo(wTop, h / 2); shape.lineTo(-wTop, h / 2); shape.closePath();
    const geo = new ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 5, curveSegments: 1 });
    geo.rotateY(Math.PI / 2);
    geo.center();
    geo.computeBoundingBox();
    const top = geo.boundingBox!.max.y;
    const gold = new MeshPhysicalMaterial({ color: "#f3bf47", metalness: 1, roughness: 0.26, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 1.25 });
    const bar = new Mesh(geo, gold);

    const label = engraving();
    const labelMat = new MeshStandardMaterial({ map: label, transparent: true, metalness: 0.85, roughness: 0.5, color: "#a97612", polygonOffset: true, polygonOffsetFactor: -2, side: DoubleSide });
    const plane = new Mesh(new PlaneGeometry(1.45, 0.46), labelMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = top + 0.003;

    const shadowTex = shadowTexture();
    const shadow = new Mesh(new CircleGeometry(1.7, 40), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.25, 0.8, 1);
    shadow.position.y = -0.46;

    const group = new Group();
    group.add(bar, plane);
    const tilt = new Group();
    tilt.add(group);
    tilt.rotation.x = 0.26;
    scene.add(tilt, shadow);
    group.rotation.y = 0.6;

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => { pointer.x = 0; pointer.y = 0; };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const w = Math.max(1, el.clientWidth), hh = Math.max(1, el.clientHeight);
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh;
      camera.fov = w / hh < 1.2 ? 38 : 30;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let visible = true;
    let raf = 0;
    let last = performance.now();
    let spin = group.rotation.y;
    let first = true;
    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.visibilityState !== "visible") return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      spin += dt * 0.42;
      group.rotation.y += (spin + pointer.x * 0.5 - group.rotation.y) * Math.min(1, dt * 6);
      tilt.rotation.x += (0.26 + pointer.y * 0.18 - tilt.rotation.x) * Math.min(1, dt * 4);
      tilt.position.y = Math.sin(now / 1100) * 0.04;
      renderer.render(scene, camera);
      if (first) { first = false; canvas.style.opacity = "1"; }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };
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
      geo.dispose(); gold.dispose(); plane.geometry.dispose(); labelMat.dispose(); label.dispose();
      shadow.geometry.dispose(); (shadow.material as MeshBasicMaterial).dispose(); shadowTex.dispose();
      envRT.dispose(); pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [onError]);

  return <div ref={host} className="h-full w-full" />;
}
