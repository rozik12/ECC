"use client";

// «Ландшафт нарушений»: столбики по дням недели и времени суток. Высота — число нарушений, цвет — доля сделок с нарушением.
import { useEffect, useRef } from "react";
import { BoxGeometry, Color, DirectionalLight, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from "three";
import { createStage } from "./kit";

export type LandscapeCell = { count: number; violations: number };

const COLS = 7; // дни недели
const CELL = 0.5;
const GAP = 0.1;
const colorFor = (c: LandscapeCell) => (c.count === 0 ? "#8d97a8" : c.violations / c.count >= 0.5 ? "#d9534f" : c.violations / c.count >= 0.25 ? "#e0a526" : "#2f9e6b");

export default function LandscapeScene({ cells, onError }: { cells: LandscapeCell[]; onError?: () => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const born = performance.now();
    const rows = Math.ceil(cells.length / COLS);
    const step = CELL + GAP;
    const maxV = Math.max(1, ...cells.map((c) => c.violations));
    const target = cells.map((c) => (c.count === 0 ? 0.05 : 0.12 + (c.violations / maxV) * 1.9));
    const dummy = new Object3D();
    let settled = false;
    const place = (k: number) => {
      cells.forEach((_, i) => {
        const h = target[i] * k;
        dummy.position.set(((i % COLS) - (COLS - 1) / 2) * step, h / 2, (Math.floor(i / COLS) - (rows - 1) / 2) * step);
        dummy.scale.set(1, Math.max(0.001, h), 1);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      });
      bars.instanceMatrix.needsUpdate = true;
    };
    const stage = createStage(el, {
      fov: 32, narrowFov: 42, exposure: 0.72, onError,
      onFrame: (_dt, now, p) => {
        const k = Math.min(1, (now - born) / 1100);
        if (!settled) { place(1 - Math.pow(1 - k, 3)); if (k >= 1) settled = true; }
        group.rotation.y += ((Math.sin(now / 3000) * 0.22 + p.x * 0.4) - group.rotation.y) * 0.06;
      },
    });
    if (!stage) return;
    const { scene, camera, track } = stage;
    camera.position.set(0, 6.4, 8.6);
    camera.lookAt(0, 0.2, 0);
    const sun = new DirectionalLight("#ffffff", 0.9);
    sun.position.set(3, 7, 4);
    scene.add(sun);

    const geo = new BoxGeometry(CELL, 1, CELL);
    const mat = new MeshStandardMaterial({ metalness: 0.1, roughness: 0.5, envMapIntensity: 0.5 });
    const bars = new InstancedMesh(geo, mat, cells.length);
    cells.forEach((c, i) => bars.setColorAt(i, new Color(colorFor(c))));
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
  }, [cells, onError]);

  return <div ref={host} className="h-full w-full" />;
}
