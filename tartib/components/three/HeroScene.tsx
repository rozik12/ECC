"use client";

// Главная сцена: плитка с логотипом Tartib, золотые монеты и слитки, золотая пыль. Реагирует на движение указателя.
import { useEffect, useRef } from "react";
import { Group } from "three";
import { createStage } from "./kit";
import { makeCoin, makeDust, makeIngot, makeLogoTile, makeShadow } from "./parts";

export default function HeroScene({ onError }: { onError?: () => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const coins: { g: Group; base: [number, number, number]; spin: number; phase: number }[] = [];
    const stage = createStage(el, {
      fov: 30, narrowFov: 40, exposure: 1.05, onError,
      onFrame: (dt, now, p, aspect) => {
        const k = Math.min(1, aspect * 0.9);
        world.scale.setScalar(0.88 * (0.66 + 0.34 * k));
        tile.rotation.y += ((p.x * 0.55 + Math.sin(now / 2400) * 0.18) - tile.rotation.y) * Math.min(1, dt * 5);
        tile.rotation.x += ((p.y * 0.3 + Math.cos(now / 3100) * 0.06) - tile.rotation.x) * Math.min(1, dt * 5);
        tile.position.y = 0.2 + Math.sin(now / 1500) * 0.08;
        coins.forEach((c, i) => {
          c.g.rotation.y += dt * c.spin;
          c.g.position.set(c.base[0] + p.x * (0.12 + i * 0.04), c.base[1] + Math.sin(now / 1300 + c.phase) * 0.12, c.base[2]);
        });
        ingotA.rotation.y += ((0.9 + p.x * 0.35) - ingotA.rotation.y) * Math.min(1, dt * 4);
        ingotB.rotation.y += ((-0.6 + p.x * 0.35) - ingotB.rotation.y) * Math.min(1, dt * 4);
        dust.rotation.y += dt * 0.03;
        dust.position.y = Math.sin(now / 4000) * 0.1;
      },
    });
    if (!stage) return;
    const { scene, camera, track } = stage;
    camera.position.set(0, 0.1, 9.6);
    camera.lookAt(0, -0.1, 0);

    const world = new Group();
    scene.add(world);
    const tile = makeLogoTile(track);
    tile.scale.setScalar(1.25);
    tile.position.set(0, 0.2, 0);
    world.add(tile);

    ([[-2.7, 1.1, 0.8, 0.8, 0.9, 0], [2.8, 1.6, -0.6, 0.65, 0.7, 1.7], [2.2, -1.2, 1.2, 0.75, -0.8, 3.1], [-2.0, -1.4, -0.4, 0.55, 1.1, 4.4]] as const).forEach(([x, y, z, s, spin, phase]) => {
      const g = makeCoin(track);
      g.scale.setScalar(s);
      g.rotation.x = 0.25;
      world.add(g);
      coins.push({ g, base: [x, y, z], spin, phase });
    });

    const ingotA = makeIngot(track);
    ingotA.scale.setScalar(0.62);
    ingotA.position.set(-2.55, -2.05, 0.9);
    ingotA.rotation.set(0.12, 0.9, 0.04);
    const ingotB = makeIngot(track);
    ingotB.scale.setScalar(0.5);
    ingotB.position.set(2.6, -2.2, 0.5);
    ingotB.rotation.set(0.1, -0.6, -0.03);
    world.add(ingotA, ingotB);

    const shadow = makeShadow(track, 2.4, 0.3);
    shadow.position.set(0, -2.45, 0);
    shadow.scale.set(1.8, 0.7, 1);
    world.add(shadow);

    const dust = makeDust(track, 90, [8, 5, 3]);
    world.add(dust);

    return () => stage.dispose();
  }, [onError]);

  return <div ref={host} className="h-full w-full" />;
}
