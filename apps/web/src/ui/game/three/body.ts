import * as THREE from 'three';
import type { Figure } from '../../../game/state';

import { BODY_DATA } from './bodyData';
import { bodyPositions, landmarks, vertexParts } from './bodyMesh';

/**
 * Размеры фигуры — по модели MakeHuman (см. bodyMesh): реальные пропорции, рост ≈ 2,25,
 * голова — около 1/7,5 роста. Персонаж смотрит на +Z, ноги на y = 0.
 */
/** Линия пояса (верх брюк) — опорная высота для одежды и снаряжения. */
export const TORSO_Y = 1.29;
/** Голова строится в собственных координатах вокруг HEAD_Y и крепится к шее в точке NECK_Y. */
export const HEAD_Y = 1.9;
export const HEAD_R = 0.27;
/** Приближение черепа эллипсоидом (для головных уборов): ширина, высота, глубина относительно HEAD_R. */
export const HEAD_SCALE = new THREE.Vector3(0.74, 1.06, 0.92);
/** Шарнир шеи в координатах головы — центр нижнего края модели головы. */
export const NECK_Y = BODY_DATA.NECK_Y;
/** Масштаб головы относительно тела. */
export const HEAD_GROW = BODY_DATA.HEAD_GROW;
/** Где на теле находится шарнир шеи. */
export const NECK_WORLD = BODY_DATA.NECK_WORLD;
/** Центр головы в координатах сцены (для камеры портрета). */
export const HEAD_CENTER_WORLD = NECK_WORLD + (HEAD_Y - NECK_Y) * HEAD_GROW;

export interface BodyShape {
  figure: Figure;
  /** Плечо, локоть и запястье руки с x > 0; вторая — зеркально. */
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  /** Тазобедренный сустав, колено и щиколотка ноги с x > 0. */
  hip: THREE.Vector3;
  knee: THREE.Vector3;
  ankle: THREE.Vector3;
  foreR: number;
  hand: number;
  legX: number;
  calfR: number;
  /** Радиус голени у щиколотки. */
  ankleR: number;
  neckR: number;
  foot: number;
}

const V = (p: readonly number[]): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);

/** Средний радиус части тела part вокруг оси a–b в доле t (0 — у a). */
function radiusAt(figure: Figure, part: number, a: THREE.Vector3, b: THREE.Vector3, t: number): number {
  const pos = bodyPositions(figure);
  const vp = vertexParts();
  const ab = new THREE.Vector3().subVectors(b, a);
  const len = ab.length();
  ab.normalize();
  const p = new THREE.Vector3();
  let s = 0;
  let n = 0;
  for (let i = 0; i < vp.length; i += 1) {
    if (vp[i] !== part || pos[i * 3]! < 0) continue;
    p.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!).sub(a);
    const u = p.dot(ab) / len;
    if (Math.abs(u - t) > 0.04) continue;
    s += p.addScaledVector(ab, -p.dot(ab)).length();
    n += 1;
  }
  return n ? s / n : 0.05;
}

function makeShape(figure: Figure): BodyShape {
  const L = landmarks(figure);
  const female = figure === 'female';
  const shoulder = V(L.shoulder);
  const elbow = V(L.elbow);
  const wrist = V(L.wrist);
  const knee = V(L.knee);
  const ankle = V(L.ankle);
  return {
    figure,
    shoulder,
    elbow,
    wrist,
    hip: V(L.hip),
    knee,
    ankle,
    foreR: radiusAt(figure, 1, elbow, wrist, 0.85),
    hand: female ? 0.8 : 0.9,
    legX: L.hip[0],
    calfR: radiusAt(figure, 2, knee, ankle, 0.3),
    ankleR: radiusAt(figure, 2, knee, ankle, 0.88),
    neckR: female ? 0.052 : 0.06,
    foot: female ? 0.86 : 0.95,
  };
}

const shapes = new Map<Figure, BodyShape>();
export const bodyShape = (figure: Figure): BodyShape => {
  let s = shapes.get(figure);
  if (!s) {
    s = makeShape(figure);
    shapes.set(figure, s);
  }
  return s;
};
