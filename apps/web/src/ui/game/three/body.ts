import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { mesh, ring, type Mat } from './kit';

/**
 * Размеры фигуры. Персонаж смотрит на +Z, ноги на y = 0, рост ≈ 2,3.
 * Пропорции близки к человеческим (около 5 голов): длинные ноги, руки до середины бедра.
 */
export const TORSO_Y = 1.16;
export const TORSO_DEPTH = 0.68;
/** Голова строится в собственных координатах вокруг HEAD_Y и крепится к шее в точке NECK_Y. */
export const HEAD_Y = 1.9;
export const HEAD_R = 0.27;
export const HEAD_SCALE = new THREE.Vector3(0.93, 1.05, 0.98);
export const NECK_Y = 1.68;
/** Масштаб головы относительно тела. */
export const HEAD_GROW = 0.86;
/** Где на теле находится шарнир шеи. */
export const NECK_WORLD = TORSO_Y + 0.71;
/** Центр головы в координатах сцены (для камеры портрета). */
export const HEAD_CENTER_WORLD = NECK_WORLD + (HEAD_Y - NECK_Y) * HEAD_GROW;

export interface BodyShape {
  figure: Figure;
  /** Профиль корпуса: (радиус, высота от талии). */
  torso: Array<[number, number]>;
  pelvis: Array<[number, number]>;
  /** Плечо, локоть и запястье руки с x > 0; вторая — зеркально. */
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
  /** Объём груди: амплитуда, высота центра, ширина. */
  chest: { amp: number; y: number; up: number; down: number; lobe: number; spread: number };
}

const MALE: BodyShape = {
  figure: 'male',
  torso: [
    [0, -0.02],
    [0.255, 0],
    [0.27, 0.1],
    [0.29, 0.24],
    [0.33, 0.4],
    [0.345, 0.5],
    [0.32, 0.56],
    [0.2, 0.62],
    [0.09, 0.645],
    [0, 0.65],
  ],
  pelvis: [
    [0, 0.04],
    [0.262, 0.03],
    [0.272, -0.03],
    [0.262, -0.1],
    [0.2, -0.16],
    [0, -0.18],
  ],
  shoulder: new THREE.Vector3(0.37, TORSO_Y + 0.52, 0),
  elbow: new THREE.Vector3(0.45, TORSO_Y + 0.13, -0.03),
  wrist: new THREE.Vector3(0.5, TORSO_Y - 0.24, 0.05),
  upperR: 0.092,
  foreR: 0.073,
  hand: 1,
  legX: 0.15,
  thighR: 0.11,
  calfR: 0.085,
  neckR: 0.082,
  foot: 1,
  chest: { amp: 0.06, y: 0.43, up: 0.08, down: 0.06, lobe: 0.45, spread: 0.42 },
};

const FEMALE: BodyShape = {
  figure: 'female',
  torso: [
    [0, -0.02],
    [0.27, 0],
    [0.235, 0.11],
    [0.235, 0.2],
    [0.26, 0.33],
    [0.28, 0.44],
    [0.285, 0.51],
    [0.26, 0.56],
    [0.16, 0.61],
    [0.075, 0.63],
    [0, 0.64],
  ],
  pelvis: [
    [0, 0.04],
    [0.272, 0.03],
    [0.292, -0.04],
    [0.286, -0.11],
    [0.225, -0.17],
    [0, -0.19],
  ],
  shoulder: new THREE.Vector3(0.315, TORSO_Y + 0.505, 0),
  elbow: new THREE.Vector3(0.39, TORSO_Y + 0.14, -0.03),
  wrist: new THREE.Vector3(0.44, TORSO_Y - 0.22, 0.05),
  upperR: 0.074,
  foreR: 0.058,
  hand: 0.86,
  legX: 0.152,
  thighR: 0.124,
  calfR: 0.08,
  neckR: 0.066,
  foot: 0.88,
  chest: { amp: 0.3, y: 0.385, up: 0.1, down: 0.066, lobe: 0.46, spread: 0.33 },
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

/** Рельеф груди (у мужской фигуры — грудные мышцы): относительная прибавка радиуса на высоте y и угле a (0 — спереди). */
function bust(shape: BodyShape, y: number, a: number): number {
  const c = shape.chest;
  const lobe = (center: number): number => Math.exp(-(((a - center) / c.spread) ** 2));
  const dy = y - c.y;
  const vert = Math.exp(-((dy / (dy > 0 ? c.up : c.down)) ** 2));
  return c.amp * vert * (lobe(c.lobe) + lobe(-c.lobe));
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
  const geo = new THREE.LatheGeometry(smoothTorso(shape), 56, phiStart, phiLength);
  {
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
