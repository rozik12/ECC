// Детали 3D-сцен: золотой слиток, монета, плитка с логотипом, мягкая тень, золотая пыль.
import {
  AdditiveBlending, BufferGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, Points, PointsMaterial, Shape, SRGBColorSpace,
} from "three";

export type Disposer = (fn: () => void) => void;

const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

export const goldMaterial = () => new MeshPhysicalMaterial({ color: "#f3bf47", metalness: 1, roughness: 0.26, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 1.25 });

/** Слиток: трапеция в профиле, вытянутая вдоль оси X, с фасками и надписью на верхней грани. */
export function makeIngot(track: Disposer, material = goldMaterial()): Group {
  const wB = 0.62, wT = 0.42, h = 0.5, len = 2.1;
  const shape = new Shape();
  shape.moveTo(-wB, -h / 2); shape.lineTo(wB, -h / 2); shape.lineTo(wT, h / 2); shape.lineTo(-wT, h / 2); shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 5, curveSegments: 1 });
  geo.rotateY(Math.PI / 2);
  geo.center();
  geo.computeBoundingBox();
  const top = geo.boundingBox!.max.y;
  const label = canvasTexture(1024, 360, (g) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(92,58,6,0.92)"; g.font = "700 190px 'Arial Black', Arial, sans-serif"; g.fillText("TARTIB", 512, 150);
    g.fillStyle = "rgba(92,58,6,0.8)"; g.font = "600 56px Arial, sans-serif"; g.fillText("tartib.uk", 512, 288);
  });
  const labelMat = new MeshStandardMaterial({ map: label, transparent: true, metalness: 0.85, roughness: 0.5, color: "#a97612", polygonOffset: true, polygonOffsetFactor: -2, side: DoubleSide });
  const plane = new Mesh(new PlaneGeometry(1.45, 0.46), labelMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = top + 0.003;
  const g = new Group();
  g.add(new Mesh(geo, material), plane);
  track(() => { geo.dispose(); plane.geometry.dispose(); labelMat.dispose(); label.dispose(); });
  return g;
}

/** Монета с выпуклой буквой T. */
export function makeCoin(track: Disposer): Group {
  const face = canvasTexture(512, 512, (g) => {
    const grad = g.createRadialGradient(256, 220, 20, 256, 256, 256);
    grad.addColorStop(0, "#ffe08a"); grad.addColorStop(1, "#d99a22");
    g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
    g.lineWidth = 16; g.strokeStyle = "rgba(120,78,10,0.55)"; g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(110,70,8,0.9)"; g.font = "700 300px 'Arial Black', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("T", 256, 276);
  });
  const geo = new CylinderGeometry(0.5, 0.5, 0.09, 56);
  const side = goldMaterial();
  const cap = new MeshStandardMaterial({ map: face, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2 });
  const mesh = new Mesh(geo, [side, cap, cap]);
  mesh.rotation.x = Math.PI / 2;
  const g = new Group();
  g.add(mesh);
  track(() => { geo.dispose(); side.dispose(); cap.dispose(); face.dispose(); });
  return g;
}

/** Плитка с логотипом Tartib: скруглённый квадрат бирюзового цвета с буквой T и галочкой. */
export function makeLogoTile(track: Disposer): Group {
  const s = 1.7, r = 0.42, d = 0.32;
  const shape = new Shape();
  const x = -s / 2, y = -s / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + s - r, y); shape.quadraticCurveTo(x + s, y, x + s, y + r); shape.lineTo(x + s, y + s - r);
  shape.quadraticCurveTo(x + s, y + s, x + s - r, y + s); shape.lineTo(x + r, y + s); shape.quadraticCurveTo(x, y + s, x, y + s - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 6, curveSegments: 14 });
  geo.center();
  const mat = new MeshPhysicalMaterial({ color: "#19c2ae", metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1 });
  const mark = canvasTexture(512, 512, (g) => {
    g.scale(8, 8);
    g.fillStyle = "#06201c";
    const rr = (px: number, py: number, w: number, h: number, rad: number) => { g.beginPath(); g.roundRect(px, py, w, h, rad); g.fill(); };
    rr(14, 15, 36, 10, 4); rr(26, 15, 12, 35, 4);
    g.strokeStyle = "#06201c"; g.lineWidth = 4.6; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(41, 43); g.lineTo(46.2, 48.2); g.lineTo(55, 37); g.stroke();
  });
  const markMat = new MeshBasicMaterial({ map: mark, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
  const plane = new Mesh(new PlaneGeometry(s * 0.92, s * 0.92), markMat);
  geo.computeBoundingBox();
  plane.position.z = geo.boundingBox!.max.z + 0.004;
  const g = new Group();
  g.add(new Mesh(geo, mat), plane);
  track(() => { geo.dispose(); mat.dispose(); plane.geometry.dispose(); markMat.dispose(); mark.dispose(); });
  return g;
}

/** Мягкая круглая тень под объектом. */
export function makeShadow(track: Disposer, radius = 1.6, opacity = 0.42): Mesh {
  const tex = canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(0,0,0,${opacity})`); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  });
  const geo = new CircleGeometry(radius, 40);
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  track(() => { geo.dispose(); mat.dispose(); tex.dispose(); });
  return m;
}

/** Золотая пыль: лёгкие светящиеся точки. Положения случайные, но не мешают чтению (почти прозрачные). */
export function makeDust(track: Disposer, count: number, spread: [number, number, number]): Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread[0];
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  const dot = canvasTexture(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,226,140,1)"); grad.addColorStop(1, "rgba(255,226,140,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  });
  const mat = new PointsMaterial({ map: dot, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending, color: "#ffd96b" });
  track(() => { geo.dispose(); mat.dispose(); dot.dispose(); });
  return new Points(geo, mat);
}
