import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import type { GarmentId } from './anatomy';
import { HEAD_R, HEAD_SCALE, HEAD_Y, TORSO_Y, type BodyShape } from './body';
import { M, cone, limb, mat, mesh, phys, shade, taperTube, tex, v, type Anim, type Mat } from './kit';

/**
 * Общие части 3D-моделей предметов и вещи, которые герой держит: «в руке» (правая рука —
 * телефон, кофе, гантель, ракетка…) и «сумка» (левая рука — шоппер, спортивная сумка, клатч…).
 * Начало координат такой модели — точка хвата, +Y — вдоль ручки (подробнее — HoldPose).
 * Одежду, обувь и украшения строит wardrobe.ts.
 */

export interface ItemCtx {
  color: string;
  shape: BodyShape;
  /** Сюда предмет добавляет свою анимацию (мерцание, блики). */
  anim: Anim[];
}

/** Какие слои одежды надеты: верх (null — без верха), низ и слои поверх. */
export interface OutfitPlan {
  top?: GarmentId | null;
  bottom?: GarmentId;
  layers?: GarmentId[];
}

/** Одежда героя: план слоёв, их материалы и детали поверх (пояса, юбки, пуговицы). */
export interface Outfit {
  group: THREE.Group;
  plan: OutfitPlan;
  top?: Mat;
  bottom?: Mat;
  layers: Mat[];
}

/** Базовая одежда без предмета: футболка и брюки (у женской фигуры — облегающая футболка и леггинсы). */
export const defaultPlan = (figure: Figure): { top: GarmentId; bottom: GarmentId } =>
  figure === 'female' ? { top: 'tee_fitted', bottom: 'leggings' } : { top: 'tee', bottom: 'pants' };

// ─── Голова: общие построения ───────────────────────────────────────────

export const HS = HEAD_SCALE;

/** Радиус сечения головы на высоте y над её центром. */
export const headR = (y: number): number => Math.sqrt(Math.max(0.001, HEAD_R * HEAD_R - (y / HS.y) ** 2));

/** Повязка-обруч, плотно облегающая голову на высоте y. */
export function headBand(y: number, height: number, off: number, m: Mat): THREE.Mesh {
  const top = headR(y + height / 2) + off;
  const bottom = headR(y - height / 2) + off;
  return mesh(new THREE.CylinderGeometry(top, bottom, height, 48, 1, true), m, [0, HEAD_Y + y, 0], [HS.x, 1, HS.z]);
}

/** Купол по форме головы (тулья шапки) до угла theta от макушки. */
export function dome(r: number, theta: number, m: Mat, y = 0.01): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, theta), m, [0, HEAD_Y + y, -0.01], [HS.x, HS.y, HS.z]);
}

export function star(outer: number, inner: number, depth: number, m: Mat): THREE.Mesh {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.4, bevelSegments: 1 });
  geo.center();
  return new THREE.Mesh(geo, m);
}

/** Объект, повёрнутый «лицом» наружу от центра головы, в точке на сфере. */
export function onHead(o: THREE.Object3D, y: number, angle: number, off = 0.01): THREE.Object3D {
  const r = headR(y) + off;
  o.position.set(Math.sin(angle) * r * HS.x, HEAD_Y + y, Math.cos(angle) * r * HS.z);
  o.rotation.y = angle;
  return o;
}

/** Дуга-ободок через макушку от уха до уха (наушники, ушки на ободке). */
export function headArc(y0: number, off: number, tube: number, m: Mat, tiltBack = 0.08): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    const yy = y0 + (HEAD_R * HS.y + off - y0) * Math.cos(a);
    const r = headR(Math.min(yy, HEAD_R * HS.y * 0.999)) + off;
    pts.push(v(Math.sin(a) * r * HS.x, HEAD_Y + yy, -tiltBack * Math.cos(a)));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, tube, 8), m);
}

// ─── Плечи: накидки ─────────────────────────────────────────────────────

/** Полотно на спине от плеч вниз (куртка на плечах, шуба); length — доля длины. */
export function cape(m: Mat, shape: BodyShape, length = 1): THREE.Mesh {
  const w = shape.figure === 'female' ? 0.92 : 1;
  m.side = THREE.DoubleSide;
  const h = 1.3 * length;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * w, (0.34 + 0.26 * length) * w, h, 32, 6, true, Math.PI * 0.55, Math.PI * 0.9), m);
  // Лёгкие складки: волна по окружности, усиливающаяся книзу.
  const pos = c.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = (h / 2 - y) / h;
    const a = Math.atan2(x, z);
    const f = 1 + Math.sin(a * 9) * 0.05 * k;
    pos.setXYZ(i, x * f, y, z * f);
  }
  c.geometry.computeVertexNormals();
  c.position.set(0, TORSO_Y + 0.59 - h / 2, -0.06);
  c.scale.z = 0.72;
  return c;
}

// ─── Хват: как предмет лежит в руке ────────────────────────────────────

/**
 * Поза предмета в кулаке. Договорённость для всех моделей «в руке» и сумок:
 * начало координат — точка хвата (середина ручки в кулаке), +Y — вдоль ручки,
 * +Z — лицевая сторона наружу от тела (экран, рисунок, дека гитары).
 * - tilt — подъём ручки от оси хвата кулака (она смотрит вперёд) к вертикали, рад;
 *   у предмета в правой руке +X модели смотрит вперёд-вниз (у вертикального — вперёд);
 * - roll — поворот модели вокруг собственной ручки, рад;
 * - bar — ручка поперечная (ручки сумок, дужка гири, ребро скейта): идёт вдоль X
 *   через кулак, а сам предмет стоит вертикально (+Y вверх) и висит под кистью.
 */
export interface HoldPose {
  tilt: number;
  roll?: number;
  bar?: boolean;
}

const HANG: HoldPose = { tilt: 0, bar: true };

export const HOLD: Record<string, HoldPose> = {
  // «В руке» (правая рука): стаканы и бокалы — стоя, телефон — экраном вперёд.
  coffee_cup: { tilt: 1.45 },
  water_bottle: { tilt: 1.4 },
  phone: { tilt: 1.2, roll: Math.PI / 2 },
  dumbbell: { tilt: 0.12 },
  shaker: HANG,
  umbrella: { tilt: -1.25 },
  tennis_racket: { tilt: -0.85 },
  kettlebell: HANG,
  flower_bouquet: { tilt: 1.15 },
  skateboard: HANG,
  acoustic_guitar: { tilt: 1.25 },
  microphone: { tilt: 0.9 },
  champagne_glass: { tilt: 1.45 },
  gold_trophy: { tilt: 1.0 },
  // Сумки (левая рука): висят за ручки, клатч зажат в кулаке.
  grocery_bag: HANG,
  tote_bag: HANG,
  yoga_mat: HANG,
  gym_bag: HANG,
  handbag: HANG,
  briefcase: HANG,
  clutch: { tilt: 0.2 },
  picnic_basket: HANG,
  boutique_bags: HANG,
  designer_bag: HANG,
};

const DEFAULT_HOLD: HoldPose = { tilt: 0.65 };
export const holdPose = (id: string): HoldPose => HOLD[id] ?? DEFAULT_HOLD;

/**
 * Поворот модели в кулаке: axis — ось хвата кулака (от мизинца к указательному, вперёд),
 * outward — направление наружу от тела (±X).
 */
export function holdQuaternion(axis: THREE.Vector3, outward: THREE.Vector3, pose: HoldPose): THREE.Quaternion {
  const up = v(0, 1, 0);
  const a = axis.clone().normalize();
  const y = pose.bar
    ? up.clone().addScaledVector(a, -up.dot(a)).normalize()
    : a.clone().multiplyScalar(Math.cos(pose.tilt)).addScaledVector(up, Math.sin(pose.tilt)).normalize();
  const z = pose.bar ? new THREE.Vector3().crossVectors(y, a).normalize() : outward.clone().addScaledVector(y, -outward.dot(y)).normalize();
  if (z.dot(outward) < 0) z.negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (pose.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(up, pose.roll));
  return q;
}

/** Наклон модели на иконке магазина (рад, по часовой — минус): длинные вещи — по диагонали. */
export const ICON_TILT: Record<string, number> = {
  dumbbell: -Math.PI / 2,
  umbrella: -Math.PI / 4,
  tennis_racket: -Math.PI / 5,
  skateboard: 0.35,
  acoustic_guitar: -0.35,
  microphone: -Math.PI / 5,
  flower_bouquet: -0.25,
  clutch: Math.PI / 2,
};

// ─── Материалы и формы для вещей в руках ───────────────────────────────

const plastic = (c: THREE.ColorRepresentation, rough = 0.4): Mat => phys(c, rough, { clearcoat: 0.4, clearcoatRoughness: 0.3 });
const glass = (c: THREE.ColorRepresentation = '#eef7ff', opacity = 0.28): Mat =>
  phys(c, 0.04, { transparent: true, opacity, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide, envMapIntensity: 1.6 });
const rubber = (c: THREE.ColorRepresentation = '#1d1f24'): Mat => mat(c, 0.92);
const paper = (c: THREE.ColorRepresentation): Mat => M.cloth(c, 3, 0.95);

/** Прямоугольник со скруглёнными углами в плоскости XY, с центром в начале координат. */
function rrect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Плоская плитка (фигура в XY толщиной depth по Z), центрированная по толщине. */
function slab(shape: THREE.Shape, depth: number, bevel = 0.003): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  return geo;
}

/** Мягкая коробка (сумка, пакет): скруглённый брусок w×h×d с центром в (0, cy, cz). */
function softBox(w: number, h: number, d: number, m: Mat, cy: number, cz = 0, r = 0.02): THREE.Mesh {
  return mesh(slab(rrect(w, h, r), d, Math.min(0.012, d * 0.3)), m, [0, cy, cz]);
}

/** Тело вращения по профилю [радиус, высота] снизу вверх. */
const lathe = (pts: Array<[number, number]>, m: Mat, radial = 32): THREE.Mesh => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), radial), m);

/** Ручка-петля сумки: от двух точек на сумке вверх, в кулак (начало координат), вдоль X. */
function strapLoop(a: THREE.Vector3, b: THREE.Vector3, r: number, m: Mat, top = 0): THREE.Mesh {
  const pts = [a, v(a.x * 0.55, top + (a.y - top) * 0.35, a.z * 0.5), v(a.x * 0.2, top, 0), v(b.x * 0.2, top, 0), v(b.x * 0.55, top + (b.y - top) * 0.35, b.z * 0.5), b];
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 8), m);
}

/** Роза: несколько слоёв лепестков-полусфер вокруг бутона. */
function rose(m: Mat, r: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(r * 0.55, 12, 10), m, [0, r * 0.15, 0], [1, 1.1, 1]));
  for (let layer = 0; layer < 2; layer += 1) {
    const n = 5 + layer * 2;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + layer * 0.4;
      const p = mesh(new THREE.SphereGeometry(r * (0.5 + layer * 0.12), 10, 8, 0, Math.PI), m, [Math.sin(a) * r * (0.35 + layer * 0.25), 0, Math.cos(a) * r * (0.35 + layer * 0.25)], [1, 1, 0.45]);
      p.rotation.y = a - Math.PI / 2;
      p.rotation.z = 0.25 + layer * 0.35;
      g.add(p);
    }
  }
  return g;
}

/** Цепочка из звеньев по кривой. */
function chain(curve: THREE.Curve<THREE.Vector3>, n: number, link: number, m: Mat): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(link, link * 0.28, 6, 12);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const q = curve.getPointAt(t);
    const l = mesh(geo, m, [q.x, q.y, q.z], [1, 1.6, 1]);
    l.quaternion.setFromUnitVectors(v(0, 1, 0), curve.getTangentAt(t));
    if (i % 2) l.rotateY(Math.PI / 2);
    g.add(l);
  }
  return g;
}

// ─── «В руке» ──────────────────────────────────────────────────────────

type Builder = (ctx: ItemCtx) => THREE.Group;

const HELD: Record<string, Builder> = {
  phone: ({ color }) => {
    // Смартфон в чехле: экран (+Z) смотрит вперёд, камеры — на обороте.
    const g = new THREE.Group();
    const cy = 0.025;
    g.add(mesh(slab(rrect(0.092, 0.19, 0.016), 0.014, 0.004), plastic(shade(color, 0.8), 0.5), [0, cy, 0]));
    const screen = phys('#0b1020', 0.08, { clearcoat: 1, emissive: new THREE.Color('#1c3f7a'), emissiveIntensity: 0.55 });
    g.add(mesh(new THREE.ShapeGeometry(rrect(0.082, 0.178, 0.012)), screen, [0, cy, 0.0075]));
    // Значки приложений на экране.
    const icon = M.glow('#8fd3ff', 0.7);
    for (let i = 0; i < 12; i += 1) g.add(mesh(new THREE.PlaneGeometry(0.012, 0.012), i % 3 === 1 ? M.glow('#ff8ad8', 0.7) : icon, [-0.024 + (i % 4) * 0.016, cy + 0.06 - Math.floor(i / 4) * 0.02, 0.0078]));
    g.add(mesh(slab(rrect(0.036, 0.036, 0.01), 0.004, 0.0015), plastic('#222429', 0.3), [-0.018, cy + 0.065, -0.008]));
    for (const [x, y] of [[-0.026, 0.073], [-0.026, 0.057], [-0.01, 0.073]] as const) g.add(mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 16), phys('#05060a', 0.05, { clearcoat: 1 }), [x, cy + y, -0.011]).rotateX(Math.PI / 2));
    return g;
  },
  coffee_cup: () => {
    // Бумажный стакан с крышкой и картонным держателем — держат за середину.
    const g = new THREE.Group();
    const y0 = -0.06;
    g.add(lathe([[0, y0 - 0.08], [0.03, y0 - 0.08], [0.042, y0 + 0.09], [0.04, y0 + 0.09]], paper('#f4efe6')));
    g.add(lathe([[0.0335, y0 - 0.03], [0.04, y0 + 0.045], [0.0405, y0 + 0.045], [0.034, y0 - 0.03]], paper('#9a6a3c')));
    g.add(lathe([[0, y0 + 0.088], [0.045, y0 + 0.088], [0.045, y0 + 0.1], [0.036, y0 + 0.112], [0.03, y0 + 0.118], [0, y0 + 0.118]], plastic('#f7f7f5', 0.5)));
    g.add(mesh(new THREE.BoxGeometry(0.014, 0.004, 0.006), rubber('#3a2a22'), [0, y0 + 0.118, 0.022]));
    return g;
  },
  water_bottle: () => {
    // Спортивная бутылка: прозрачный корпус с водой, крышка с петлёй.
    const g = new THREE.Group();
    const g2 = new THREE.Group();
    g2.position.y = -0.07;
    g2.add(lathe([[0, -0.11], [0.034, -0.11], [0.036, -0.09], [0.036, 0.1], [0.026, 0.13], [0.02, 0.135]], glass('#bfe6ff', 0.35)));
    g2.add(lathe([[0, -0.105], [0.032, -0.105], [0.033, 0.06], [0, 0.06]], phys('#7fc8f0', 0.05, { transparent: true, opacity: 0.45, depthWrite: false })));
    g2.add(lathe([[0.0368, -0.03], [0.0368, 0.03]], plastic('#3ddc84', 0.5), 32));
    g2.add(lathe([[0, 0.13], [0.022, 0.13], [0.022, 0.16], [0, 0.162]], plastic('#f2f3f5', 0.4)));
    g2.add(mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 16), plastic('#f2f3f5', 0.4), [0, 0.172, 0]));
    g.add(g2);
    return g;
  },
  shaker: ({ color }) => {
    // Шейкер висит на петле крышки; внутри — протеиновый коктейль.
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 20, Math.PI), plastic('#1d1f24', 0.4), [0, -0.03, 0]));
    g.add(lathe([[0, -0.075], [0.046, -0.075], [0.046, -0.04], [0.03, -0.03], [0, -0.03]], plastic('#1d1f24', 0.4)));
    g.add(lathe([[0, -0.3], [0.04, -0.3], [0.044, -0.075], [0.042, -0.075]], glass('#f4f7fa', 0.4)));
    g.add(lathe([[0, -0.295], [0.037, -0.295], [0.04, -0.17], [0, -0.17]], phys('#c9a47a', 0.5, { transparent: true, opacity: 0.85 })));
    g.add(lathe([[0.0445, -0.13], [0.0455, -0.09]], plastic(color, 0.4)));
    return g;
  },
  dumbbell: () => {
    // Гантель: хромированный гриф в кулаке, шестигранные блины спереди и сзади.
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 16), M.chrome()));
    for (const sy of [-1, 1]) {
      const plate = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.075, 6), rubber('#25272c'), [0, sy * 0.118, 0]);
      plate.rotation.y = Math.PI / 6;
      g.add(plate, mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 16), M.chrome(), [0, sy * 0.122, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), M.chrome(), [0, sy * 0.082, 0]));
    }
    return g;
  },
  kettlebell: ({ color }) => {
    // Гиря висит под кулаком: дужка вдоль X, литой шар чуть отведён от бедра.
    const g = new THREE.Group();
    const iron = mat('#2a2d33', 0.55, 0.6);
    const out = 0.025;
    const handle = new THREE.CatmullRomCurve3([v(-0.075, -0.13, out), v(-0.07, -0.03, out * 0.4), v(-0.04, 0, 0), v(0.04, 0, 0), v(0.07, -0.03, out * 0.4), v(0.075, -0.13, out)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(handle, 32, 0.016, 10), iron));
    g.add(mesh(new THREE.SphereGeometry(0.095, 28, 20), iron, [0, -0.2, out], [1, 0.92, 1]));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), iron, [0, -0.285, out]));
    // Цветная полоса с весом спереди.
    g.add(mesh(new THREE.CircleGeometry(0.028, 24), plastic(color, 0.5), [0, -0.2, out + 0.096]));
    return g;
  },
  umbrella: ({ color }) => {
    // Зонт-трость сложен и смотрит вниз-вперёд; крюк ручки — над кулаком (модель «вниз» по +Y).
    const g = new THREE.Group();
    const wood = M.wood('#5a3a22', 1, 2);
    g.add(limb(v(0, -0.06, 0), v(0, 0.07, 0), 0.017, wood));
    const crook = new THREE.CatmullRomCurve3([v(0, -0.06, 0), v(0, -0.1, 0), v(0.03, -0.14, 0), v(0.07, -0.13, 0), v(0.085, -0.09, 0)]);
    g.add(new THREE.Mesh(taperTube(crook, 0.017, 0.014, 20, 10), wood));
    g.add(limb(v(0, 0.06, 0), v(0, 0.66, 0), 0.007, M.chrome(), 8));
    const canopy = new THREE.Group();
    const cm = M.cloth(color, 4, 0.7);
    cm.side = THREE.DoubleSide;
    // Сложенный купол: веретено с продольными складками.
    const prof: Array<[number, number]> = [[0.01, 0.12], [0.03, 0.16], [0.042, 0.3], [0.036, 0.46], [0.014, 0.6], [0.008, 0.62]];
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const f = 1 + 0.18 * Math.max(0, Math.sin(Math.atan2(x, z) * 8));
      pos.setXYZ(i, x * f, pos.getY(i), z * f);
    }
    geo.computeVertexNormals();
    canopy.add(new THREE.Mesh(geo, cm));
    canopy.add(mesh(new THREE.TorusGeometry(0.04, 0.006, 6, 20), M.cloth(shade(color, 0.6), 4), [0, 0.3, 0]).rotateX(Math.PI / 2));
    g.add(canopy, cone(v(0, 0.62, 0), v(0, 0.68, 0), 0.008, 0.003, M.chrome(), 8));
    return g;
  },
  tennis_racket: ({ color }) => {
    // Ракетка: рукоять с обмоткой в кулаке, головка с сеткой струн в плоскости XY.
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.019, 0.24, 8), plastic('#f2f3f5', 0.7), [0, 0.0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.02, 8), plastic(color, 0.4), [0, -0.12, 0]));
    const frame = plastic(color, 0.35);
    for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(v(0, 0.12, 0), v(0.02 * sx, 0.22, 0), v(0.1 * sx, 0.3, 0)), 16, 0.011, 8), frame));
    // Обод — эллипс трубкой постоянной толщины.
    const rim = new THREE.EllipseCurve(0, 0, 0.125, 0.165, 0, Math.PI * 2, false, 0);
    const rimPts = rim.getPoints(64).map((p) => v(p.x, p.y + 0.46, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 96, 0.012, 8, true), frame));
    const strings = mat('#f6f2e8', 0.6);
    const net = tex('net', 5, 6);
    if (net) {
      strings.alphaMap = net;
      strings.alphaTest = 0.5;
    }
    strings.side = THREE.DoubleSide;
    g.add(mesh(new THREE.CircleGeometry(1, 48), strings, [0, 0.46, 0], [0.12, 0.16, 1]));
    return g;
  },
  flower_bouquet: () => {
    // Букет роз в крафтовой бумаге: держат за стебли под лентой.
    const g = new THREE.Group();
    const stem = mat('#3d7f3a', 0.7);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      g.add(limb(v(Math.sin(a) * 0.008, -0.12, Math.cos(a) * 0.008), v(Math.sin(a) * 0.03, 0.2, Math.cos(a) * 0.03), 0.0045, stem, 6));
    }
    // Стебли стянуты зелёной лентой (её и держит кулак), выше — бант.
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.07, 16), mat('#2e6b30', 0.8), [0, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.025, 16), M.cloth('#c2185b', 3, 0.6), [0, 0.06, 0]));
    const wrap = paper('#c9a57a');
    wrap.side = THREE.DoubleSide;
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.024, 0.3, 24, 1, true, Math.PI * 0.15, Math.PI * 1.7), wrap, [0, 0.2, 0]));
    const red = phys('#c8102e', 0.55, { sheen: 0.6, sheenColor: new THREE.Color('#ff5a6e') });
    const spots: Array<[number, number, number]> = [[0, 0.36, 0], [0.06, 0.34, 0.03], [-0.06, 0.34, 0.02], [0.03, 0.33, -0.06], [-0.035, 0.335, -0.055], [0.075, 0.31, -0.03], [-0.08, 0.31, -0.02]];
    for (const [x, y, z] of spots) {
      const r = rose(red, 0.036);
      r.position.set(x, y, z);
      r.rotation.set(z * 4, 0, -x * 4);
      g.add(r);
    }
    const leaf = mat('#2e6b30', 0.6, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const l = mesh(new THREE.SphereGeometry(0.04, 10, 6), leaf, [Math.sin(a) * 0.1, 0.3, Math.cos(a) * 0.09], [0.5, 0.18, 1]);
      l.rotation.y = a;
      g.add(l);
    }
    return g;
  },
  skateboard: ({ color }) => {
    // Скейт несут за край деки: дека висит под кулаком ребром вверх, колёса — наружу.
    const g = new THREE.Group();
    const L = 0.92;
    const W = 0.24;
    const s = new THREE.Shape();
    s.absarc(-L / 2 + W / 2, -W / 2, W / 2, Math.PI / 2, (Math.PI * 3) / 2, false);
    s.absarc(L / 2 - W / 2, -W / 2, W / 2, -Math.PI / 2, Math.PI / 2, false);
    const deckGeo = slab(s, 0.016, 0.004);
    deckGeo.translate(0, 0.006, 0);
    // Загнутые концы (кик-тейлы) — к колёсам.
    const p = deckGeo.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) {
      const x = Math.abs(p.getX(i));
      if (x > 0.32) p.setZ(i, p.getZ(i) + (x - 0.32) ** 2 * 2.2);
    }
    deckGeo.computeVertexNormals();
    g.add(new THREE.Mesh(deckGeo, M.wood('#c9a070', 1, 1)));
    // Шкурка на стороне ног и рисунок снизу.
    g.add(mesh(new THREE.PlaneGeometry(0.6, W * 0.92), rubber('#16171a'), [0, -W / 2 + 0.006, -0.0085]).rotateY(Math.PI));
    g.add(mesh(new THREE.PlaneGeometry(0.58, W * 0.8), plastic(color, 0.5), [0, -W / 2 + 0.006, 0.0085]));
    for (const sx of [-1, 1]) {
      const x = sx * 0.3;
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.08, 0.012), M.chrome(), [x, -W / 2 + 0.006, 0.014]));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, W * 0.95, 10), M.chrome(), [x, -W / 2 + 0.006, 0.042]));
      for (const sy of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), plastic('#f4e9c8', 0.6), [x, -W / 2 + 0.006 + sy * 0.1, 0.045]));
    }
    return g;
  },
  acoustic_guitar: () => {
    // Гитару держат за гриф у корпуса: гриф вверх, корпус — ниже кулака, дека смотрит наружу.
    const g = new THREE.Group();
    const top = mat('#e0b97f', 0.55);
    const wood = M.wood('#7a4424', 1, 2);
    const by = -0.33;
    const body = new THREE.Shape();
    // «Восьмёрка» корпуса: широкая нижняя дека, талия, верхняя дека у грифа.
    body.moveTo(0, 0.27);
    body.bezierCurveTo(0.12, 0.27, 0.16, 0.18, 0.14, 0.1);
    body.bezierCurveTo(0.13, 0.04, 0.12, 0.0, 0.16, -0.06);
    body.bezierCurveTo(0.24, -0.16, 0.22, -0.3, 0, -0.31);
    body.bezierCurveTo(-0.22, -0.3, -0.24, -0.16, -0.16, -0.06);
    body.bezierCurveTo(-0.12, 0.0, -0.13, 0.04, -0.14, 0.1);
    body.bezierCurveTo(-0.16, 0.18, -0.12, 0.27, 0, 0.27);
    // Гриф — на оси хвата, дека — вровень с ним, корпус уходит к бедру не дальше 7 см.
    const D = 0.09;
    const zt = 0.018;
    g.add(mesh(slab(body, D, 0.008), wood, [0, by, zt - D / 2]));
    g.add(mesh(new THREE.ShapeGeometry(body, 24), top, [0, by, zt + 0.0005]));
    g.add(mesh(new THREE.CircleGeometry(0.05, 32), mat('#1a0f08', 0.9), [0, by + 0.08, zt + 0.001]));
    g.add(mesh(new THREE.RingGeometry(0.052, 0.062, 32), mat('#3b2416', 0.6), [0, by + 0.08, zt + 0.0012]));
    g.add(mesh(new THREE.BoxGeometry(0.11, 0.022, 0.01), M.wood('#2a1a10'), [0, by - 0.16, zt + 0.005]));
    // Гриф с накладкой и голова с колками.
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), M.wood('#5a3a22', 1, 3), [0, 0.15, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.052, 0.5, 0.008), M.wood('#22140c', 1, 3), [0, 0.15, 0.019]));
    for (let i = 0; i < 12; i += 1) g.add(mesh(new THREE.BoxGeometry(0.052, 0.003, 0.002), M.chrome(), [0, -0.06 + i * 0.035, 0.024]));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.14, 0.02), M.wood('#3b2416'), [0, 0.47, -0.005]).rotateX(-0.2));
    for (let i = 0; i < 6; i += 1) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), M.chrome(), [i < 3 ? -0.045 : 0.045, 0.43 + (i % 3) * 0.035, -0.01]).rotateZ(Math.PI / 2));
    for (let i = 0; i < 6; i += 1) g.add(limb(v(-0.017 + i * 0.007, by - 0.16, zt + 0.011), v(-0.017 + i * 0.007, 0.4, 0.026), 0.0011, mat('#e8e2d0', 0.4), 4));
    return g;
  },
  microphone: ({ color }) => {
    // Микрофон: рукоять в кулаке, сетка-шар над ним.
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.026, 0.018, 0.2, 20), plastic('#1d1f24', 0.35), [0, 0.0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.02, 20), M.gold(), [0, 0.11, 0]));
    const grille = M.metal('#c7cfd8', 0.35);
    const net = tex('net', 4, 3);
    if (net) {
      grille.alphaMap = net;
      grille.alphaTest = 0.5;
    }
    grille.side = THREE.DoubleSide;
    g.add(mesh(new THREE.SphereGeometry(0.043, 24, 16), grille, [0, 0.155, 0]));
    g.add(mesh(new THREE.SphereGeometry(0.036, 20, 14), mat('#111216', 0.8), [0, 0.155, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.012, 20), plastic(color, 0.4), [0, -0.05, 0]));
    return g;
  },
  champagne_glass: () => {
    // Бокал-флюте: держат за ножку, внутри — шампанское с пузырьками.
    const g = new THREE.Group();
    const gl = glass('#f4fbff', 0.3);
    g.add(lathe([[0, -0.075], [0.042, -0.075], [0.043, -0.071], [0.008, -0.066], [0.0055, -0.05], [0.0055, 0.06], [0.012, 0.075], [0.026, 0.14], [0.031, 0.2], [0.032, 0.25], [0.031, 0.25]], gl));
    g.add(mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.12, 10), gl, [0, -0.005, 0]));
    const wine = phys('#f2d27a', 0.1, { transparent: true, opacity: 0.75, depthWrite: false, emissive: new THREE.Color('#5a4410'), emissiveIntensity: 0.2 });
    g.add(lathe([[0, 0.078], [0.011, 0.078], [0.024, 0.14], [0.028, 0.205], [0, 0.205]], wine));
    const bub = mat('#fff8e0', 0.2);
    for (let i = 0; i < 9; i += 1) g.add(mesh(new THREE.SphereGeometry(0.0025, 6, 4), bub, [Math.sin(i * 2.1) * 0.012, 0.09 + i * 0.012, Math.cos(i * 2.1) * 0.012]));
    return g;
  },
  gold_trophy: () => {
    // Кубок чемпиона: держат за ножку, чаша с ручками сверху, постамент снизу.
    const g = new THREE.Group();
    const gold = M.gold();
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.15, 20), gold, [0, 0.0, 0]));
    g.add(lathe([[0, -0.1], [0.05, -0.1], [0.05, -0.075], [0.03, -0.075], [0.022, -0.07]], gold));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), mat('#1d1f24', 0.35), [0, -0.13, 0]));
    g.add(mesh(new THREE.PlaneGeometry(0.07, 0.022), M.gold(), [0, -0.13, 0.0505]));
    g.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), gold, [0, 0.08, 0], [1, 0.7, 1]));
    const cupM = M.gold();
    cupM.side = THREE.DoubleSide;
    g.add(lathe([[0.02, 0.09], [0.07, 0.12], [0.1, 0.2], [0.11, 0.28], [0.104, 0.28]], cupM, 40));
    for (const sx of [-1, 1]) {
      const h = new THREE.CatmullRomCurve3([v(0.1 * sx, 0.26, 0), v(0.17 * sx, 0.27, 0), v(0.17 * sx, 0.18, 0), v(0.08 * sx, 0.15, 0)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(h, 20, 0.009, 8), gold));
    }
    const st = star(0.035, 0.015, 0.008, M.gold());
    st.position.set(0, 0.2, 0.108);
    g.add(st);
    return g;
  },

  // ─── Сумки ───
  grocery_bag: () => {
    // Крафтовый пакет: багет, зелень и яблоко сверху.
    const g = new THREE.Group();
    const kraft = paper('#c7a26f');
    g.add(softBox(0.3, 0.34, 0.11, kraft, -0.37, 0.02, 0.008));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.025, 0.112), paper('#b38f5c'), [0, -0.2, 0.02]));
    const rope = paper('#a5814f');
    g.add(strapLoop(v(-0.07, -0.2, 0.02), v(0.07, -0.2, 0.02), 0.006, rope));
    g.add(limb(v(-0.07, -0.25, 0.03), v(-0.12, -0.08, 0.035), 0.026, M.wood('#d9a55c', 1, 1)));
    const green = mat('#4f9a4a', 0.7);
    for (const [x, z] of [[0.05, 0.03], [0.09, 0.0], [0.02, 0.0]] as const) g.add(mesh(new THREE.SphereGeometry(0.04, 12, 8), green, [x, -0.2, z + 0.02], [1, 0.8, 0.8]));
    g.add(mesh(new THREE.SphereGeometry(0.032, 16, 12), phys('#d32f2f', 0.35, { clearcoat: 0.6 }), [-0.02, -0.19, 0.04]));
    return g;
  },
  tote_bag: ({ color }) => {
    // Холщовый шоппер на длинных ручках, с рисунком-сердцем.
    const g = new THREE.Group();
    const canvas = M.cloth('#efe7d6', 6, 0.95);
    g.add(softBox(0.34, 0.38, 0.05, canvas, -0.42, 0.02, 0.01));
    g.add(strapLoop(v(-0.1, -0.23, 0.02), v(0.1, -0.23, 0.02), 0.009, M.cloth('#d9cdb4', 4)));
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.05);
    heart.bezierCurveTo(-0.08, 0.0, -0.05, 0.06, 0, 0.03);
    heart.bezierCurveTo(0.05, 0.06, 0.08, 0.0, 0, -0.05);
    g.add(mesh(new THREE.ShapeGeometry(heart, 16), mat(color, 0.8), [0, -0.42, 0.0455]));
    return g;
  },
  yoga_mat: ({ color }) => {
    // Свёрнутый коврик на ремне: рулон вдоль X под кулаком.
    const g = new THREE.Group();
    const foam = mat(color, 0.85);
    const cy = -0.2;
    const roll = mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.66, 32), foam, [0, cy, 0.01]);
    roll.rotation.z = Math.PI / 2;
    g.add(roll);
    for (const sx of [-1, 1]) {
      const end = mesh(new THREE.RingGeometry(0.008, 0.052, 32), mat(shade(color, 0.7), 0.85, 0, { side: THREE.DoubleSide }), [sx * 0.331, cy, 0.01]);
      end.rotation.y = (sx * Math.PI) / 2;
      g.add(end);
      const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.002, 4, 32), mat(shade(color, 0.5), 0.9));
      spiral.position.set(sx * 0.332, cy, 0.01);
      spiral.rotation.y = Math.PI / 2;
      g.add(spiral);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.006, 6, 28), rubber('#2a2d33'));
      band.position.set(sx * 0.22, cy, 0.01);
      band.rotation.y = Math.PI / 2;
      g.add(band);
    }
    const strap = new THREE.CatmullRomCurve3([v(-0.22, cy + 0.056, 0.01), v(-0.12, -0.05, 0.005), v(-0.03, 0, 0), v(0.03, 0, 0), v(0.12, -0.05, 0.005), v(0.22, cy + 0.056, 0.01)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(strap, 40, 0.007, 6), rubber('#2a2d33')));
    return g;
  },
  gym_bag: ({ color }) => {
    // Спортивная сумка-баул: цилиндр вдоль X, ручки сходятся в кулаке.
    const g = new THREE.Group();
    const nylon = phys('#22252b', 0.6, { sheen: 0.3, sheenColor: new THREE.Color('#5a6070') });
    const cy = -0.22;
    const body = mesh(new THREE.CapsuleGeometry(0.105, 0.34, 8, 24), nylon, [0, cy, 0.012], [1, 1, 0.58]);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    for (const sx of [-1, 1]) {
      const end = mesh(new THREE.CircleGeometry(0.07, 24), plastic(color, 0.5), [sx * 0.274, cy, 0.012], [1, 1, 1]);
      end.rotation.y = (sx * Math.PI) / 2;
      end.scale.set(0.58, 1, 1);
      g.add(end);
    }
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.01, 0.03), plastic(color, 0.5), [0, cy + 0.03, 0.068]));
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.006, 0.01), M.chrome(), [0, cy + 0.104, 0.012]));
    g.add(strapLoop(v(-0.09, cy + 0.09, 0.012), v(0.09, cy + 0.09, 0.012), 0.009, rubber('#16171a')));
    return g;
  },
  handbag: ({ color }) => {
    // Кожаная сумочка-трапеция на короткой ручке, с золотой застёжкой.
    const g = new THREE.Group();
    const leather = M.leather(shade(color, 0.7).getStyle(), 2);
    const s = new THREE.Shape();
    s.moveTo(-0.15, -0.3);
    s.lineTo(0.15, -0.3);
    s.lineTo(0.12, -0.11);
    s.lineTo(-0.12, -0.11);
    s.closePath();
    g.add(mesh(slab(s, 0.075, 0.01), leather, [0, 0, 0.02]));
    const flap = new THREE.Shape();
    flap.moveTo(-0.122, -0.11);
    flap.lineTo(0.122, -0.11);
    flap.lineTo(0.13, -0.19);
    flap.quadraticCurveTo(0, -0.22, -0.13, -0.19);
    flap.closePath();
    g.add(mesh(new THREE.ShapeGeometry(flap, 12), leather, [0, 0, 0.0585]));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.02, 0.008), M.gold(), [0, -0.205, 0.062]));
    const h = new THREE.CatmullRomCurve3([v(-0.08, -0.11, 0.02), v(-0.07, -0.04, 0.01), v(-0.03, 0, 0), v(0.03, 0, 0), v(0.07, -0.04, 0.01), v(0.08, -0.11, 0.02)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(h, 30, 0.009, 8), leather));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), M.gold(), [sx * 0.08, -0.11, 0.02]));
    return g;
  },
  briefcase: () => {
    // Кожаный портфель с ручкой сверху и замками.
    const g = new THREE.Group();
    const leather = M.leather('#4a2f1f', 2);
    g.add(softBox(0.42, 0.3, 0.085, leather, -0.21, 0.02, 0.012));
    g.add(mesh(new THREE.BoxGeometry(0.43, 0.012, 0.088), M.leather('#3a2418', 2), [0, -0.12, 0.02]));
    for (const sx of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(0.035, 0.03, 0.01), M.gold(), [sx * 0.13, -0.12, 0.066]));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), M.gold(), [sx * 0.06, -0.05, 0.0]));
    }
    const h = new THREE.CatmullRomCurve3([v(-0.06, -0.05, 0), v(-0.05, -0.01, 0), v(0, 0.005, 0), v(0.05, -0.01, 0), v(0.06, -0.05, 0)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(h, 24, 0.012, 8), leather));
    return g;
  },
  clutch: ({ color }) => {
    // Атласный клатч-конверт зажат в кулаке вдоль руки.
    const g = new THREE.Group();
    const satin = phys(color, 0.25, { sheen: 0.8, sheenColor: shade(color, 1.5), clearcoat: 0.2 });
    g.add(mesh(slab(rrect(0.13, 0.27, 0.02), 0.035, 0.008), satin, [0, 0.04, 0.0]));
    // Клапан-конверт на лицевой стороне, застёжка — камень на его острие.
    const flap = new THREE.Shape();
    flap.moveTo(-0.064, 0.174);
    flap.lineTo(0.064, 0.174);
    flap.lineTo(0.064, 0.11);
    flap.lineTo(0, 0.05);
    flap.lineTo(-0.064, 0.11);
    flap.closePath();
    g.add(mesh(new THREE.ShapeGeometry(flap), phys(shade(color, 0.85), 0.25, { sheen: 0.8, sheenColor: shade(color, 1.5) }), [0, 0, 0.0182]));
    g.add(mesh(new THREE.OctahedronGeometry(0.014), M.gem('#ffffff', 0.4), [0, 0.055, 0.02], [1, 1, 0.5]));
    return g;
  },
  picnic_basket: () => {
    // Плетёная корзинка с дугой-ручкой и клетчатой салфеткой.
    const g = new THREE.Group();
    const wicker = M.wood('#c49a5c', 6, 2);
    g.add(softBox(0.36, 0.2, 0.12, wicker, -0.34, 0.02, 0.02));
    g.add(mesh(new THREE.BoxGeometry(0.37, 0.025, 0.125), M.wood('#a07a42', 6, 1), [0, -0.23, 0.02]));
    const cloth = M.cloth('#d32f2f', 10, 0.9);
    cloth.side = THREE.DoubleSide;
    for (const sx of [-1, 1]) {
      const c = mesh(new THREE.PlaneGeometry(0.12, 0.08), cloth, [sx * 0.1, -0.205, 0.08]);
      c.rotation.x = -0.6;
      g.add(c);
    }
    const arc = new THREE.CatmullRomCurve3([v(-0.17, -0.24, 0.02), v(-0.15, -0.08, 0.01), v(-0.05, 0, 0), v(0.05, 0, 0), v(0.15, -0.08, 0.01), v(0.17, -0.24, 0.02)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 40, 0.012, 8), wicker));
    return g;
  },
  boutique_bags: ({ color }) => {
    // Два бумажных пакета из бутиков на верёвочных ручках.
    const g = new THREE.Group();
    const bag = (w: number, h: number, x: number, z: number, m: Mat, trim: Mat): void => {
      const cy = -0.2 - h / 2;
      g.add(mesh(new THREE.BoxGeometry(w, h, 0.07), m, [x, cy, z]));
      g.add(mesh(new THREE.PlaneGeometry(w * 0.5, 0.025), trim, [x, cy + 0.03, z + 0.0355]));
      g.add(strapLoop(v(x - w * 0.22, -0.2, z), v(x + w * 0.22, -0.2, z), 0.005, trim));
    };
    bag(0.24, 0.3, -0.05, 0.0, paper('#111216'), M.gold());
    bag(0.2, 0.24, 0.07, 0.045, paper(color), mat('#ffffff', 0.6));
    return g;
  },
  designer_bag: ({ color }) => {
    // Стёганая сумка на золотой цепочке: цепь в кулаке, сумка висит ниже.
    const g = new THREE.Group();
    const quilt = phys(shade(color, 0.45), 0.45, { sheen: 0.5, sheenColor: shade(color, 1.2), clearcoat: 0.3 });
    const cy = -0.33;
    g.add(softBox(0.28, 0.19, 0.075, quilt, cy, 0.02, 0.018));
    // Ромбы простёжки — тонкими валиками.
    const stitch = phys(shade(color, 0.32), 0.5);
    for (let i = -3; i <= 3; i += 1) {
      for (const s of [-1, 1]) {
        const line = limb(v(i * 0.07 - 0.07, cy - 0.09, 0.058), v(i * 0.07 + 0.07, cy + 0.09, 0.058), 0.0025, stitch, 4);
        if (s < 0) line.scale.x = -1;
        if (Math.abs(i * 0.07) < 0.16) g.add(line);
      }
    }
    g.add(mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 20), M.gold(), [0, cy + 0.03, 0.06]));
    const gold = M.gold();
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([v(sx * 0.13, cy + 0.095, 0.02), v(sx * 0.1, -0.12, 0.012), v(sx * 0.03, 0, 0)]);
      g.add(chain(c, 14, 0.009, gold));
    }
    g.add(limb(v(-0.03, 0, 0), v(0.03, 0, 0), 0.008, gold, 8));
    return g;
  },
};

/** Модель вещи в руке или сумки (в собственных координатах хвата). */
export function heldModel(id: string, ctx: ItemCtx): THREE.Group {
  return HELD[id]?.(ctx) ?? new THREE.Group();
}
