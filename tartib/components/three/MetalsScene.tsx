"use client";

// Сцена для раздела «Золото и металлы»: стопка слитков и монета.
import { useEffect, useRef } from "react";
import { Group } from "three";
import { createStage } from "./kit";
import { makeCoin, makeDust, makeIngot, makeShadow } from "./parts";

export default function MetalsScene({ onError }: { onError?: () => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const stage = createStage(el, {
      fov: 28, narrowFov: 38, exposure: 0.95, onError,
      onFrame: (dt, now, p, aspect) => {
        pile.scale.setScalar(0.85 + 0.25 * Math.min(1, aspect * 0.5));
        pile.rotation.y += ((0.55 + Math.sin(now / 2800) * 0.55 + p.x * 0.5) - pile.rotation.y) * Math.min(1, dt * 3);
        pile.rotation.x += ((0.16 + p.y * 0.12) - pile.rotation.x) * Math.min(1, dt * 4);
        coin.rotation.y += dt * 1.1;
        coin.position.y = -0.55 + Math.sin(now / 1200) * 0.06;
        dust.rotation.y += dt * 0.04;
      },
    });
    if (!stage) return;
    const { scene, camera, track } = stage;
    camera.position.set(0, 1.7, 7.4);
    camera.lookAt(0, 0.05, 0);

    const pile = new Group();
    const low1 = makeIngot(track), low2 = makeIngot(track), up = makeIngot(track);
    low1.position.set(0, -0.5, -0.7);
    low2.position.set(0, -0.5, 0.7);
    up.position.set(0, 0.02, 0);
    up.rotation.y = 0.06;
    pile.add(low1, low2, up);
    const coin = makeCoin(track);
    coin.position.set(2.1, -0.55, 1.1);
    coin.rotation.x = 0.2;
    coin.scale.setScalar(0.75);
    pile.add(coin);
    scene.add(pile);

    const shadow = makeShadow(track, 2.8, 0.38);
    shadow.position.set(0, -1.05, 0);
    shadow.scale.set(1.5, 1, 1);
    scene.add(shadow);
    const dust = makeDust(track, 60, [7, 4, 3]);
    scene.add(dust);

    return () => stage.dispose();
  }, [onError]);

  return <div ref={host} className="h-full w-full" />;
}
