import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { mesh, ring, type Mat } from './kit';

/** Размеры фигуры. Персонаж смотрит на +Z, ноги на y = 0, рост ≈ 2,2. */
export const TORSO_Y = 0.98;
export const TORSO_DEPTH = 0.68;
export const HEAD_Y = 1.9;
export const HEAD_R = 0.27;
export const HEAD_SCALE = new THREE.Vector3(0.93, 1.05, 0.98);
export const NECK_Y = 1.68;
/** Голова чуть крупнее реальной — так персонаж выразительнее на маленьком экране. */
export const HEAD_GROW = 1.14;

export interface BodyShape {
  figure: Figure;
  /** Профиль корпуса: (радиус, высота от талии). */
  torso: Array<[number, number]>;
  pelvis: Array<[number, number]>;
  /** Плечо, локоть и запястье правой для зрителя руки (x > 0); левая — зеркально. */
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  upperR: number;
  foreR: number;
  hand: number;
  legX: number;
  thighR: number;
  calfR: number;
  neckR: number;
  foot: number;
}

const MALE: BodyShape = {
  figure: 'male',
  torso: [
    [0, -0.02],
    [0.26, 0],
    [0.28, 0.12],
    [0.3, 0.28],
    [0.34, 0.44],
    [0.35, 0.52],
    [0.3, 0.58],
    [0.16, 0.63],
    [0, 0.64],
  ],
  pelvis: [
    [0, 0.04],
    [0.262, 0.03],
    [0.272, -0.03],
    [0.262, -0.1],
    [0.2, -0.16],
    [0, -0.18],
  ],
  shoulder: new THREE.Vector3(0.38, 1.5, 0),
  elbow: new THREE.Vector3(0.5, 1.14, 0.03),
  wrist: new THREE.Vector3(0.56, 0.84, 0.1),
  upperR: 0.09,
  foreR: 0.072,
  hand: 1,
  legX: 0.155,
  thighR: 0.105,
  calfR: 0.09,
  neckR: 0.085,
  foot: 1,
};

const FEMALE: BodyShape = {
  figure: 'female',
  torso: [
    [0, -0.02],
    [0.275, 0],
    [0.25, 0.1],
    [0.243, 0.2],
    [0.27, 0.34],
    [0.29, 0.45],
    [0.29, 0.52],
    [0.25, 0.575],
    [0.14, 0.62],
    [0, 0.63],
  ],
  pelvis: [
    [0, 0.04],
    [0.278, 0.03],
    [0.302, -0.04],
    [0.292, -0.11],
    [0.222, -0.17],
    [0, -0.19],
  ],
  shoulder: new THREE.Vector3(0.325, 1.49, 0),
  elbow: new THREE.Vector3(0.43, 1.14, 0.03),
  wrist: new THREE.Vector3(0.49, 0.85, 0.1),
  upperR: 0.074,
  foreR: 0.06,
  hand: 0.88,
  legX: 0.15,
  thighR: 0.11,
  calfR: 0.082,
  neckR: 0.07,
  foot: 0.9,
};

export const bodyShape = (figure: Figure): BodyShape => (figure === 'female' ? FEMALE : MALE);

const lathe = (pts: Array<[number, number]>): THREE.Vector2[] => pts.map(([r, y]) => new THREE.Vector2(r, y));

/** Сглаженный профиль корпуса (сплайн через опорные точки) — кэшируется на фигуру. */
const smoothCache = new Map<Figure, THREE.Vector2[]>();
function smoothTorso(shape: BodyShape): THREE.Vector2[] {
  let p = smoothCache.get(shape.figure);
  if (!p) {
    const pts = new THREE.SplineCurve(lathe(shape.torso)).getPoints(40);
    p = pts.map((q, i) => new THREE.Vector2(i === 0 || i === pts.length - 1 ? 0 : Math.max(0, q.x), q.y));
    smoothCache.set(shape.figure, p);
  }
  return p;
}

/** Радиус корпуса на высоте y над талией. */
export function torsoRadius(shape: BodyShape, y: number): number {
  const p = smoothTorso(shape);
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (y <= b.y) return y <= a.y ? a.x : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return 0;
}

/** Объём груди у женской фигуры: относительная прибавка радиуса на высоте y и угле a (0 — спереди). */
function bust(shape: BodyShape, y: number, a: number): number {
  if (shape.figure !== 'female') return 0;
  const lobe = (c: number): number => Math.exp(-(((a - c) / 0.34) ** 2));
  return 0.16 * Math.exp(-(((y - 0.4) / 0.08) ** 2)) * Math.min(1, lobe(0.42) + lobe(-0.42));
}

/** Точка на передней поверхности корпуса. */
export function onTorso(shape: BodyShape, x: number, worldY: number, grow = 1, lift = 0.006): THREE.Vector3 {
  const y = worldY - TORSO_Y;
  const r = torsoRadius(shape, y);
  const xl = x / grow;
  let zl = r > Math.abs(xl) ? Math.sqrt(r * r - xl * xl) : 0;
  const f = 1 + bust(shape, y, Math.atan2(xl, zl));
  zl = r * f > Math.abs(xl) ? Math.sqrt((r * f) ** 2 - xl * xl) : 0;
  return new THREE.Vector3(x, worldY, zl * TORSO_DEPTH * grow + lift);
}

/** Оболочка корпуса (рубашка, жилет, доспех): grow > 1 — поверх предыдущего слоя. Шов — на спине. */
export function torsoShell(shape: BodyShape, m: Mat, grow = 1, phiStart = Math.PI, phiLength = Math.PI * 2): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.LatheGeometry(smoothTorso(shape), 48, phiStart, phiLength);
  if (shape.figure === 'female') {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const f = 1 + bust(shape, y, Math.atan2(x, z));
      pos.setXYZ(i, x * f, y, z * f);
    }
    geo.computeVertexNormals();
  }
  const me = new THREE.Mesh(geo, m);
  me.position.y = TORSO_Y - 0.01 * grow;
  me.scale.set(grow, 1 + (grow - 1) * 0.5, TORSO_DEPTH * grow);
  g.add(me);
  return g;
}

/** Нижняя часть одежды от талии (мантия, юбка доспеха): профиль задаётся от талии вниз. */
export function skirt(shape: BodyShape, m: Mat, pts: Array<[number, number]>, grow = 1): THREE.Mesh {
  const hip = shape.figure === 'female' ? 1.08 : 1;
  // Профиль задан сверху вниз, а LatheGeometry строит внешние грани для профиля снизу вверх.
  const me = new THREE.Mesh(new THREE.LatheGeometry(lathe(pts.map(([r, y]): [number, number] => [r * hip, y]).reverse()), 40), m);
  me.position.y = TORSO_Y;
  me.scale.set(grow, 1, TORSO_DEPTH * grow * 1.04);
  return me;
}

export function pelvis(shape: BodyShape, m: Mat): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(lathe([...shape.pelvis].reverse()), 40), m, [0, TORSO_Y, 0], [1, 1, TORSO_DEPTH * 1.04]);
}

/** Пояс-кольцо на высоте y. */
export function band(shape: BodyShape, worldY: number, tube: number, m: Mat, grow = 1.02): THREE.Mesh {
  const r = Math.max(torsoRadius(shape, worldY - TORSO_Y), shape.pelvis[1]![0]) * grow;
  return ring(r, tube, m, worldY, 1, TORSO_DEPTH * 1.06);
}
