"use client";

// Объёмный график дисциплины: 28 столбиков (4 недели). Высота и цвет показывают долю сделок по правилам в этот день.
import { useEffect, useRef } from "react";
import { BoxGeometry, Color, DirectionalLight, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from "three";
import { createStage } from "./kit";

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
    const born = performance.now();
    const rows = Math.ceil(days.length / COLS);
    const step = CELL + GAP;
    const dummy = new Object3D();
    const place = (k: number) => {
      days.forEach((d, i) => {
        const full = heightFor(d.percent) * k;
        dummy.position.set(((i % COLS) - (COLS - 1) / 2) * step, full / 2, (Math.floor(i / COLS) - (rows - 1) / 2) * step);
        dummy.scale.set(1, Math.max(0.001, full), 1);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      });
      bars.instanceMatrix.needsUpdate = true;
    };
    const stage = createStage(el, {
      fov: 32, narrowFov: 42, exposure: 0.72, onError,
      onFrame: (dt, now, p) => {
        const k = Math.min(1, (now - born) / 1000);
        if (k < 1 || !settled) { place(1 - Math.pow(1 - k, 3)); if (k >= 1) settled = true; }
        group.rotation.y += ((Math.sin(now / 2600) * 0.32 + p.x * 0.45) - group.rotation.y) * 0.06;
      },
    });
    if (!stage) return;
    let settled = false;
    const { scene, camera, track } = stage;
    camera.position.set(0, 5.6, 7.4);
    camera.lookAt(0, 0.3, 0);
    const sun = new DirectionalLight("#ffffff", 0.9);
    sun.position.set(3, 6, 4);
    scene.add(sun);

    const geo = new BoxGeometry(CELL, 1, CELL);
    const mat = new MeshStandardMaterial({ metalness: 0.1, roughness: 0.5, envMapIntensity: 0.5 });
    const bars = new InstancedMesh(geo, mat, days.length);
    days.forEach((d, i) => bars.setColorAt(i, new Color(colorFor(d.percent))));
    const plateGeo = new BoxGeometry(COLS * step + 0.3, 0.14, rows * step + 0.3);
    const plateMat = new MeshStandardMaterial({ color: "#1b2740", metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.85 });
    const plate = new Mesh(plateGeo, plateMat);
    plate.position.y = -0.08;
    const group = new Group();
    group.add(plate, bars);
    scene.add(group);
    place(0);
    track(() => { geo.dispose(); mat.dispose(); bars.dispose(); plateGeo.dispose(); plateMat.dispose(); });

    return () => stage.dispose();
  }, [days, onError]);

  return <div ref={host} className="h-full w-full" />;
}
