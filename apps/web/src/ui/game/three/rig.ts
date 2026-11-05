import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import type { ExerciseId } from '../../../tracking/exercise';
import { bodyPositions, landmarks, vertexParts } from './bodyMesh';
import type { Morph } from './morph';

/**
 * Скелет персонажа для анимации: 17 костей (таз, поясница, грудь, шея, руки и ноги).
 * Веса вершин тела считаются по частям модели MakeHuman (корпус, рука, нога) и положению
 * вдоль костей; одежда, обувь и украшения берут веса ближайшей вершины тела. Голова и
 * предметы в руках крепятся к костям жёстко. Позы — процедурные: ходьба, ожидание и
 * упражнения (присед, отжимание, скручивание, выпад, «джампинг джек», бег с высоким
 * подниманием колен, подтягивание).
 */

export const BONES = ['root', 'spine', 'chest', 'neck', 'l_upper', 'l_fore', 'l_hand', 'r_upper', 'r_fore', 'r_hand', 'l_thigh', 'l_shin', 'l_foot', 'r_thigh', 'r_shin', 'r_foot'] as const;
export type BoneName = (typeof BONES)[number];
const B: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  spine: 'root',
  chest: 'spine',
  neck: 'chest',
  l_upper: 'chest',
  l_fore: 'l_upper',
  l_hand: 'l_fore',
  r_upper: 'chest',
  r_fore: 'r_upper',
  r_hand: 'r_fore',
  l_thigh: 'root',
  l_shin: 'l_thigh',
  l_foot: 'l_shin',
  r_thigh: 'root',
  r_shin: 'r_thigh',
  r_foot: 'r_shin',
};

const v3 = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);

/** Суставы в координатах тела (левая сторона — +X). */
export function joints(figure: Figure): Record<BoneName, THREE.Vector3> {
  const L = landmarks(figure);
  const side = (p: readonly number[], sx: number): THREE.Vector3 => new THREE.Vector3(p[0]! * sx, p[1], p[2]);
  const pelvis = v3(L.pelvis);
  return {
    root: new THREE.Vector3(0, pelvis.y, pelvis.z),
    spine: new THREE.Vector3(0, L.waist, pelvis.z),
    chest: new THREE.Vector3(0, L.chest[1], L.chest[2] * 0.4),
    neck: new THREE.Vector3(0, L.neck[1], L.neck[2]),
    l_upper: side(L.shoulder, 1),
    l_fore: side(L.elbow, 1),
    l_hand: side(L.wrist, 1),
    r_upper: side(L.shoulder, -1),
    r_fore: side(L.elbow, -1),
    r_hand: side(L.wrist, -1),
    l_thigh: side(L.hip, 1),
    l_shin: side(L.knee, 1),
    l_foot: side(L.ankle, 1),
    r_thigh: side(L.hip, -1),
    r_shin: side(L.knee, -1),
    r_foot: side(L.ankle, -1),
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ─── Веса ──────────────────────────────────────────────────────────────

interface BaseWeights {
  idx: Uint8Array;
  w: Float32Array;
  /** Сетки поиска: вершины рук и остальные (руки висят вплотную к бёдрам). */
  arms: Map<number, number[]>;
  rest: Map<number, number[]>;
  pos: Float32Array;
}
const baseCache = new Map<Figure, BaseWeights>();
const CELL = 0.03;
const cellKey = (x: number, y: number, z: number): number => ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);

/** Веса вершин исходной сетки тела (до 4 костей) и сетка для поиска ближайшей вершины. */
function baseWeights(figure: Figure): BaseWeights {
  let bw = baseCache.get(figure);
  if (bw) return bw;
  const pos = bodyPositions(figure);
  const parts = vertexParts();
  const L = landmarks(figure);
  const J = joints(figure);
  const n = pos.length / 3;
  const idx = new Uint8Array(n * 4);
  const w = new Float32Array(n * 4);
  const arms = new Map<number, number[]>();
  const restGrid = new Map<number, number[]>();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i += 1) {
    p.fromArray(pos, i * 3);
    const acc: Partial<Record<BoneName, number>> = {};
    const add = (b: BoneName, x: number): void => {
      if (x > 1e-4) acc[b] = (acc[b] ?? 0) + x;
    };
    const left = p.x >= 0;
    const part = parts[i] ?? 0;
    if (part === 2) {
      const [th, sh, ft] = left ? (['l_thigh', 'l_shin', 'l_foot'] as const) : (['r_thigh', 'r_shin', 'r_foot'] as const);
      const k = smooth(J[th].y - 0.14, J[th].y + 0.02, p.y);
      const f = smooth(J[sh].y - 0.05, J[sh].y + 0.05, p.y);
      const g = smooth(J[ft].y - 0.02, J[ft].y + 0.05, p.y);
      add(th, f * (1 - 0.45 * k));
      add('root', f * 0.45 * k);
      add(sh, (1 - f) * g);
      add(ft, (1 - f) * (1 - g));
    } else if (part === 1) {
      const [up, fo, hd] = left ? (['l_upper', 'l_fore', 'l_hand'] as const) : (['r_upper', 'r_fore', 'r_hand'] as const);
      const k = smooth(J[up].y - 0.12, J[up].y + 0.03, p.y);
      const f = smooth(J[fo].y - 0.05, J[fo].y + 0.05, p.y);
      const g = smooth(J[hd].y - 0.03, J[hd].y + 0.03, p.y);
      add(up, f * (1 - 0.5 * k));
      add('chest', f * 0.5 * k);
      add(fo, (1 - f) * g);
      add(hd, (1 - f) * (1 - g));
    } else {
      const n1 = smooth(J.neck.y - 0.07, J.neck.y + 0.02, p.y);
      const c = smooth(J.spine.y + (J.chest.y - J.spine.y) * 0.25, J.chest.y, p.y);
      const r = smooth(J.root.y - 0.02, J.spine.y, p.y);
      let rest = 1;
      // Плечо: у подмышки и на плечах часть веса — рука.
      const up = left ? 'l_upper' : 'r_upper';
      const ds = p.distanceTo(J[up]);
      if (Math.abs(p.x) > Math.abs(J[up].x) * 0.55 && ds < 0.11) {
        const a = 0.45 * (1 - ds / 0.11);
        add(up, a);
        rest -= a;
      }
      // Ягодицы и пах: часть веса — бедро.
      const th = left ? 'l_thigh' : 'r_thigh';
      if (Math.abs(p.x) > 0.025 && p.y < L.crotch + 0.12) {
        const a = 0.5 * (1 - smooth(L.crotch - 0.02, L.crotch + 0.12, p.y));
        add(th, a * rest);
        rest *= 1 - a;
      }
      add('neck', rest * n1);
      add('chest', rest * (1 - n1) * c);
      add('spine', rest * (1 - n1) * (1 - c) * r);
      add('root', rest * (1 - n1) * (1 - c) * (1 - r));
    }
    const top = (Object.entries(acc) as Array<[BoneName, number]>).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, x]) => a + x, 0) || 1;
    top.forEach(([b, x], k) => {
      idx[i * 4 + k] = B[b];
      w[i * 4 + k] = x / sum;
    });
    if (top.length === 0) w[i * 4] = 1;
    const key = cellKey(p.x, p.y, p.z);
    const grid = part === 1 ? arms : restGrid;
    let list = grid.get(key);
    if (!list) grid.set(key, (list = []));
    list.push(i);
  }
  bw = { idx, w, arms, rest: restGrid, pos };
  baseCache.set(figure, bw);
  return bw;
}

/** Ближайшая вершина в сетке поиска: [индекс, квадрат расстояния]. */
function nearestIn(bw: BaseWeights, grid: Map<number, number[]>, x: number, y: number, z: number): [number, number] {
  let best = -1;
  let bd = Infinity;
  for (let r = 1; r <= 6 && best < 0; r += r < 2 ? 1 : 2) {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx += 1)
      for (let dy = -r; dy <= r; dy += 1)
        for (let dz = -r; dz <= r; dz += 1) {
          const list = grid.get(((cx + dx + 512) * 1024 + (cy + dy + 512)) * 1024 + (cz + dz + 512));
          if (!list) continue;
          for (const i of list) {
            const ddx = bw.pos[i * 3]! - x;
            const ddy = bw.pos[i * 3 + 1]! - y;
            const ddz = bw.pos[i * 3 + 2]! - z;
            const d = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
        }
  }
  return [best, bd];
}

/**
 * Ближайшая вершина тела. Рука берётся, только если она заметно ближе корпуса и ног:
 * кисти висят у бёдер, и шорты не должны «прилипать» к рукам.
 */
function nearestBase(bw: BaseWeights, x: number, y: number, z: number, arms = true): number {
  const [r, dr] = nearestIn(bw, bw.rest, x, y, z);
  const [a, da] = arms ? nearestIn(bw, bw.arms, x, y, z) : [-1, Infinity];
  if (a >= 0 && (r < 0 || Math.sqrt(da) < Math.sqrt(dr) * 0.55)) return a;
  return Math.max(0, r);
}

/**
 * Веса костей для сетки (вершины переводятся матрицей m в координаты тела).
 * Общие сетки тела и одежды считаются один раз и запоминаются.
 */
function skinGeometry(geo: THREE.BufferGeometry, m: THREE.Matrix4, figure: Figure): void {
  if (geo.getAttribute('skinIndex') && geo.userData.skinFigure === figure) return;
  const bw = baseWeights(figure);
  const pos = geo.getAttribute('position');
  const si = new Uint16Array(pos.count * 4);
  const sw = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  // Мелкие детали (полоски, ремешки, украшения) целиком на руке или целиком не на ней.
  geo.computeBoundingSphere();
  let arms = true;
  const bs = geo.boundingSphere;
  if (bs && bs.radius < 0.3) {
    const c = bs.center.clone().applyMatrix4(m);
    const [, dr] = nearestIn(bw, bw.rest, c.x, c.y, c.z);
    const [, da] = nearestIn(bw, bw.arms, c.x, c.y, c.z);
    arms = da < dr;
  }
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    const j = nearestBase(bw, p.x, p.y, p.z, arms);
    for (let k = 0; k < 4; k += 1) {
      si[i * 4 + k] = bw.idx[j * 4 + k]!;
      sw[i * 4 + k] = bw.w[j * 4 + k]!;
    }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.userData.skinFigure = figure;
}

/**
 * Готовит веса всех сеток тела (до деформации ползунками). rigid — объекты, которые
 * крепятся к костям целиком (предметы в руках).
 */
export function prepareSkin(torso: THREE.Object3D, figure: Figure, rigid: ReadonlySet<THREE.Object3D>): void {
  torso.updateMatrixWorld(true);
  const toTorso = new THREE.Matrix4().copy(torso.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const used = new Map<THREE.BufferGeometry, string>();
  torso.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || inRigid(me, rigid)) return;
    m.multiplyMatrices(toTorso, me.matrixWorld);
    const key = m.elements.map((x) => x.toFixed(4)).join();
    const seen = used.get(me.geometry);
    // Одна геометрия у нескольких сеток с разным положением (перья крыльев) — нужна своя копия.
    if (seen !== undefined && seen !== key) {
      me.geometry = me.geometry.clone();
      me.geometry.deleteAttribute('skinIndex');
    }
    used.set(me.geometry, key);
    skinGeometry(me.geometry, m, figure);
  });
}

function inRigid(o: THREE.Object3D, rigid: ReadonlySet<THREE.Object3D>): boolean {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (rigid.has(x)) return true;
  return false;
}

// ─── Скелет ────────────────────────────────────────────────────────────

export interface Rig {
  bones: Record<BoneName, THREE.Bone>;
  /** Положение костей в покое (для смещения таза). */
  rest: Record<BoneName, THREE.Vector3>;
  /** Длины сегментов ноги (для обратной кинематики). */
  thigh: number;
  shin: number;
  /** Корень персонажа: наклон всего тела вокруг стоп (отжимания, скручивания). */
  root: THREE.Object3D;
  /** Предметы в руках (прячутся во время упражнений). */
  held: THREE.Object3D[];
}

/**
 * Строит кости по суставам (сдвинутым ползунками), превращает сетки тела в сетки со
 * скиннингом и крепит голову и предметы к костям.
 */
export function buildRig(root: THREE.Object3D, torso: THREE.Object3D, head: THREE.Object3D, figure: Figure, morph: Morph | null, rigid: ReadonlySet<THREE.Object3D>): Rig {
  const J = joints(figure);
  if (morph) for (const b of BONES) morph(J[b]);
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const b of BONES) {
    const bone = new THREE.Bone();
    bone.name = b;
    bones[b] = bone;
  }
  for (const b of BONES) {
    const parent = PARENT[b];
    const bone = bones[b];
    if (parent) {
      bone.position.subVectors(J[b], J[parent]);
      bones[parent].add(bone);
    } else {
      bone.position.copy(J[b]);
      torso.add(bone);
    }
  }
  torso.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map((b) => bones[b]));
  // Сетки → сетки со скиннингом (те же геометрия и материал).
  const meshes: THREE.Mesh[] = [];
  torso.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh && !(me as THREE.SkinnedMesh).isSkinnedMesh && me.geometry.getAttribute('skinIndex') && !inRigid(me, rigid)) meshes.push(me);
  });
  for (const me of meshes) {
    const sm = new THREE.SkinnedMesh(me.geometry, me.material);
    sm.name = me.name;
    sm.position.copy(me.position);
    sm.quaternion.copy(me.quaternion);
    sm.scale.copy(me.scale);
    sm.castShadow = me.castShadow;
    sm.receiveShadow = me.receiveShadow;
    sm.renderOrder = me.renderOrder;
    sm.userData = me.userData;
    sm.frustumCulled = false;
    const parent = me.parent!;
    parent.add(sm);
    for (const c of [...me.children]) sm.add(c);
    parent.remove(me);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
  }
  // Голова — на шее, предметы — в кистях.
  bones.neck.attach(head);
  head.userData.baseY = head.position.y;
  const held: THREE.Object3D[] = [];
  for (const o of rigid) {
    const id = o.userData.hand as 'l' | 'r' | undefined;
    (id === 'l' ? bones.l_hand : bones.r_hand).attach(o);
    held.push(o);
  }
  const rest = Object.fromEntries(BONES.map((b) => [b, bones[b].position.clone()])) as Record<BoneName, THREE.Vector3>;
  return { bones, rest, thigh: J.l_thigh.distanceTo(J.l_shin), shin: J.l_shin.distanceTo(J.l_foot), root, held };
}

// ─── Позы ──────────────────────────────────────────────────────────────

/** Поза с телом и делом рук: «sit:read» — сидя читает, «stand:cook» — стоя готовит. */
export type Stance = 'stand' | 'sit' | 'crouch' | 'lie';
export type Act = 'none' | 'relax' | 'phone' | 'read' | 'cook' | 'eat' | 'drink' | 'wash' | 'type' | 'game' | 'paint' | 'piano' | 'pet' | 'play' | 'box' | 'dance' | 'vr' | 'talk' | 'massage' | 'sleep';
export type Motion = 'idle' | 'walk' | ExerciseId | `${Stance}:${Act}`;

type Rot = [number, number, number];
interface Pose {
  rot: Partial<Record<BoneName, Rot>>;
  /** Смещение таза (м). */
  hip?: [number, number, number];
  /** Наклон всего тела вокруг стоп (рад, + — вперёд) и подъём над полом. */
  pitch?: number;
  lift?: number;
  /** Ноги ставятся по обратной кинематике (стопы на месте). */
  ik?: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Фаза повтора 0…1 → 0 (исходное) … 1 (нижняя точка) … 0. */
const wave = (phase: number): number => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

type Rots = Partial<Record<BoneName, Rot>>;

/** Ноги, таз и наклон тела для позы. */
function stancePose(stance: Stance, t: number): Pose {
  const breath = Math.sin(t * 1.6);
  switch (stance) {
    case 'sit':
      return {
        rot: { l_thigh: [-1.5, 0, 0.06], r_thigh: [-1.5, 0, -0.06], l_shin: [1.45, 0, 0], r_shin: [1.45, 0, 0], l_foot: [0.05, 0, 0], r_foot: [0.05, 0, 0], spine: [-0.05 + 0.01 * breath, 0, 0] },
        hip: [0, -0.46, -0.4],
      };
    case 'crouch':
      return { rot: { spine: [0.35, 0, 0], chest: [0.15, 0, 0] }, hip: [0, -0.42, -0.12], ik: true };
    case 'lie':
      return {
        rot: { l_upper: [0.05, 0, 0.12], r_upper: [0.05, 0, -0.12], l_fore: [-0.2, 0, 0], r_fore: [-0.2, 0, 0], neck: [0.25, 0, 0], l_foot: [0.5, 0, 0], r_foot: [0.5, 0, 0], chest: [0.02 * breath, 0, 0] },
        pitch: -Math.PI / 2,
        lift: 0.13,
      };
    case 'stand':
    default:
      return { rot: { spine: [0, 0.03 * Math.sin(t * 0.4), 0] } };
  }
}

/** Руки, корпус и голова для дела. */
function actPose(act: Act, stance: Stance, t: number): Rots {
  const s = Math.sin;
  switch (act) {
    case 'relax':
      return { spine: [-0.22, 0, 0], l_upper: [0.25, 0, 0.45], r_upper: [0.25, 0, -0.45], l_fore: [-0.35, 0, 0], r_fore: [-0.35, 0, 0], neck: [0.12, 0.25 * s(t * 0.3), 0] };
    case 'massage':
      return { spine: [-0.28 + 0.02 * s(t * 18), 0, 0], l_upper: [0.1, 0, 0.3], r_upper: [0.1, 0, -0.3], l_fore: [-0.6, 0, 0], r_fore: [-0.6, 0, 0], neck: [-0.1, 0, 0.03 * s(t * 15)] };
    case 'sleep':
      return { l_upper: [-0.4, 0, 0.2], r_upper: [-0.4, 0, -0.2], l_fore: [-1.9, 0, -0.5], r_fore: [-1.9, 0, 0.5], neck: [0.15, 0.25, 0] };
    case 'phone':
      return { r_upper: [-0.45, 0, -0.75], r_fore: [-2.45, 0, 0], r_hand: [0.3, 0, 0], l_upper: [-0.2, 0, 0.12], l_fore: [-0.6 + 0.3 * s(t * 1.7), 0, 0], neck: [0.05, 0.15 * s(t * 0.8), -0.12] };
    case 'read':
      return { l_upper: [-0.5, 0, 0.12], r_upper: [-0.5, 0, -0.12], l_fore: [-1.55, 0, -0.45], r_fore: [-1.55, 0, 0.45], neck: [0.45, 0.04 * s(t * 0.6), 0], chest: [0.08, 0, 0] };
    case 'cook': {
      const a = t * 4;
      return { spine: [0.12, 0, 0], l_upper: [-0.55, 0, 0.1], l_fore: [-1.0, 0, -0.35], r_upper: [-0.65 + 0.12 * s(a), 0.12 * Math.cos(a), -0.1], r_fore: [-0.9 + 0.1 * Math.cos(a), 0, 0.3], neck: [0.4, 0, 0] };
    }
    case 'eat':
    case 'drink': {
      const slow = act === 'drink' ? 1.4 : 2.4;
      const bite = Math.max(0, s(t * slow));
      return { l_upper: [-0.45, 0, 0.1], l_fore: [-1.35, 0, -0.35], r_upper: [-0.35 - 0.55 * bite, 0, -0.12], r_fore: [-1.2 - 1.15 * bite, 0, 0.25], neck: [0.25 - 0.3 * bite * (act === 'drink' ? 1 : 0.4), 0, 0] };
    }
    case 'wash': {
      const a = t * 5;
      return { l_upper: [-0.6, 0, 1.9 + 0.12 * s(a)], r_upper: [-0.6, 0, -1.9 - 0.12 * s(a + 1)], l_fore: [-1.9, 0, 0], r_fore: [-1.9, 0, 0], neck: [-0.25, 0.15 * s(t), 0], spine: [0, 0.08 * s(t * 1.3), 0] };
    }
    case 'type': {
      const a = t * 9;
      return { l_upper: [-0.55, 0, 0.18], r_upper: [-0.55, 0, -0.18], l_fore: [-1.0 + 0.06 * s(a), 0, -0.3], r_fore: [-1.0 + 0.06 * s(a + 2), 0, 0.3], neck: [0.15, 0, 0] };
    }
    case 'game': {
      const a = t * 6;
      return { spine: [stance === 'sit' ? 0.1 : 0.05, 0.05 * s(t * 1.2), 0], l_upper: [-0.4, 0, 0.15], r_upper: [-0.4, 0, -0.15], l_fore: [-1.5 + 0.08 * s(a), 0, -0.5], r_fore: [-1.5 + 0.08 * s(a + 1.5), 0, 0.5], neck: [0.3, 0, 0] };
    }
    case 'vr': {
      const a = t * 2.2;
      return { l_upper: [-1.0 + 0.5 * s(a), 0, 0.35 + 0.2 * s(a * 0.7)], r_upper: [-1.1 + 0.5 * s(a + 2), 0, -0.35 - 0.2 * s(a * 0.9)], l_fore: [-0.6, 0, 0], r_fore: [-0.6, 0, 0], neck: [-0.1, 0.5 * s(t * 0.9), 0], spine: [0, 0.25 * s(t * 0.9), 0] };
    }
    case 'paint': {
      const a = t * 3;
      return { r_upper: [-1.25 + 0.2 * s(a), 0.1, -0.15 + 0.15 * Math.cos(a)], r_fore: [-0.45, 0, 0], l_upper: [-0.45, 0, 0.15], l_fore: [-1.3, 0, -0.3], neck: [0, 0.1, 0] };
    }
    case 'piano': {
      const a = t * 7;
      return { l_upper: [-0.6, 0, 0.12], r_upper: [-0.6, 0, -0.12], l_fore: [-0.85, 0, -0.2], r_fore: [-0.85, 0, 0.2], l_hand: [0.25 * Math.max(0, s(a)), 0, 0], r_hand: [0.25 * Math.max(0, s(a + 1.3)), 0, 0], spine: [0.05, 0.1 * s(t * 0.8), 0], neck: [0.2, 0.15 * s(t * 0.8), 0] };
    }
    case 'pet': {
      const a = t * 3;
      return { r_upper: [-0.95 + 0.18 * s(a), 0, -0.12], r_fore: [-0.35, 0, 0], l_upper: [-0.3, 0, 0.25], l_fore: [-0.9, 0, 0], neck: [0.5, 0, 0] };
    }
    case 'play': {
      const a = t * 5;
      return { r_upper: [-0.9, 0, -0.35 + 0.45 * s(a)], r_fore: [-0.3, 0, 0], l_upper: [-0.2, 0, 0.3], l_fore: [-0.7, 0, 0], neck: [0.45, 0.25 * s(a), 0] };
    }
    case 'box': {
      const a = (t * 2.2) % 2;
      const jab = (x: number): number => Math.max(0, Math.sin(Math.min(1, Math.max(0, x)) * Math.PI));
      const l = jab(a);
      const r = jab(a - 1);
      return {
        spine: [0.12, 0.25 * (l - r), 0],
        l_upper: [-1.15 - 0.35 * l, 0, 0.25 - 0.15 * l],
        r_upper: [-1.15 - 0.35 * r, 0, -0.25 + 0.15 * r],
        l_fore: [-2.0 + 1.85 * l, 0, -0.3],
        r_fore: [-2.0 + 1.85 * r, 0, 0.3],
        neck: [0.15, 0, 0],
      };
    }
    case 'dance': {
      const a = t * 4.2;
      return { spine: [0, 0.3 * s(a / 2), 0.08 * s(a)], chest: [0, 0.15 * s(a / 2), 0], l_upper: [-0.4, 0, 1.2 + 0.9 * s(a)], r_upper: [-0.4, 0, -1.2 - 0.9 * s(a + Math.PI)], l_fore: [-0.9, 0, 0], r_fore: [-0.9, 0, 0], neck: [0, 0.2 * s(a / 2), 0.1 * s(a)] };
    }
    case 'talk': {
      const a = t * 2.6;
      return { l_upper: [-0.55 + 0.25 * s(a), 0, 0.35], r_upper: [-0.6 + 0.25 * s(a + 1.7), 0, -0.4], l_fore: [-1.2, 0, 0.3 * s(a)], r_fore: [-1.1, 0, -0.3 * s(a + 1)], neck: [0, 0.18 * s(t * 0.9), 0.05 * s(a)] };
    }
    case 'none':
    default:
      return stance === 'sit' ? { l_upper: [-0.4, 0, 0.05], r_upper: [-0.4, 0, -0.05], l_fore: [-0.7, 0, -0.35], r_fore: [-0.7, 0, 0.35] } : stance === 'lie' ? {} : { l_upper: [0, 0, 0.05], r_upper: [0, 0, -0.05], l_fore: [-0.15, 0, 0], r_fore: [-0.15, 0, 0] };
  }
}

/** Поза с телом и делом рук. */
function composedPose(stance: Stance, act: Act, t: number): Pose {
  const base = stancePose(stance, t);
  const arms = actPose(act, stance, t);
  // Танец — с покачиванием таза и пружинящими коленями.
  if (act === 'dance' && stance === 'stand') {
    const a = t * 4.2;
    return { rot: { ...base.rot, ...arms }, hip: [0.05 * Math.sin(a / 2), -0.06 * Math.abs(Math.sin(a)), 0], ik: true };
  }
  if (act === 'box' && stance === 'stand') return { rot: { ...base.rot, ...arms }, hip: [0, -0.07, 0], ik: true };
  return { ...base, rot: { ...base.rot, ...arms } };
}

/** Поза для движения в момент t (с) с фазой повтора phase (0…1). */
function poseFor(motion: Motion, t: number, phase: number): Pose {
  const k = wave(phase);
  const colon = motion.indexOf(':');
  if (colon > 0) return composedPose(motion.slice(0, colon) as Stance, motion.slice(colon + 1) as Act, t);
  switch (motion) {
    case 'walk': {
      const a = t * 7;
      const s = Math.sin(a);
      return {
        rot: {
          l_thigh: [-0.45 * s, 0, 0],
          r_thigh: [0.45 * s, 0, 0],
          l_shin: [Math.max(0, Math.sin(a - 1.4)) * 0.75, 0, 0],
          r_shin: [Math.max(0, -Math.sin(a - 1.4)) * 0.75, 0, 0],
          l_foot: [-0.15 * s, 0, 0],
          r_foot: [0.15 * s, 0, 0],
          l_upper: [0.38 * s, 0, 0.06],
          r_upper: [-0.38 * s, 0, -0.06],
          l_fore: [-0.25 - 0.15 * Math.max(0, -s), 0, 0],
          r_fore: [-0.25 - 0.15 * Math.max(0, s), 0, 0],
          spine: [0.04, 0.06 * s, 0],
          chest: [0, -0.1 * s, 0],
        },
        hip: [0, -Math.abs(Math.cos(a)) * 0.025, 0],
      };
    }
    case 'squat':
      return {
        rot: { spine: [0.35 * k, 0, 0], chest: [0.15 * k, 0, 0], l_upper: [-1.35 * k, 0, 0.05], r_upper: [-1.35 * k, 0, -0.05], l_fore: [-0.15 * k, 0, 0], r_fore: [-0.15 * k, 0, 0] },
        hip: [0, -0.42 * k, -0.18 * k],
        ik: true,
      };
    case 'lunge': {
      return {
        rot: {
          l_thigh: [-1.25 * k, 0, 0],
          l_shin: [1.3 * k, 0, 0],
          r_thigh: [0.55 * k, 0, 0],
          r_shin: [1.5 * k, 0, 0],
          r_foot: [-0.6 * k, 0, 0],
          l_upper: [0.1, 0, 0.12 * k],
          r_upper: [0.1, 0, -0.12 * k],
          spine: [0.05 * k, 0, 0],
        },
        hip: [0, -0.38 * k, 0.12 * k],
      };
    }
    case 'jumping_jack': {
      const up = Math.sin(phase * Math.PI);
      return {
        rot: {
          l_upper: [0, 0, 2.7 * k],
          r_upper: [0, 0, -2.7 * k],
          l_fore: [0, 0, 0.2 * k],
          r_fore: [0, 0, -0.2 * k],
          l_thigh: [0, 0, 0.3 * k],
          r_thigh: [0, 0, -0.3 * k],
          l_foot: [0, 0, -0.3 * k],
          r_foot: [0, 0, 0.3 * k],
          l_shin: [0.15 * up, 0, 0],
          r_shin: [0.15 * up, 0, 0],
        },
        lift: 0.12 * up,
      };
    }
    case 'high_knees': {
      const a = phase * Math.PI * 2;
      const l = Math.max(0, Math.sin(a));
      const r = Math.max(0, -Math.sin(a));
      return {
        rot: {
          l_thigh: [-1.5 * l, 0, 0],
          l_shin: [1.7 * l, 0, 0],
          r_thigh: [-1.5 * r, 0, 0],
          r_shin: [1.7 * r, 0, 0],
          l_upper: [0.6 * Math.sin(a) - 0.2, 0, 0.05],
          r_upper: [-0.6 * Math.sin(a) - 0.2, 0, -0.05],
          l_fore: [-1.3, 0, 0],
          r_fore: [-1.3, 0, 0],
        },
        lift: 0.06 * Math.abs(Math.sin(a)),
      };
    }
    case 'pushup': {
      // Планка: тело наклонено вперёд вокруг стоп, прямые руки перпендикулярны полу.
      const pitch = lerp(1.05, 1.22, k);
      return {
        rot: {
          l_upper: [-pitch + 0.75 * k, 0, 0.12],
          r_upper: [-pitch + 0.75 * k, 0, -0.12],
          l_fore: [-1.35 * k, 0, 0],
          r_fore: [-1.35 * k, 0, 0],
          l_hand: [pitch - 0.6 * k, 0, 0],
          r_hand: [pitch - 0.6 * k, 0, 0],
          l_foot: [-0.7, 0, 0],
          r_foot: [-0.7, 0, 0],
          neck: [-0.35, 0, 0],
        },
        pitch,
      };
    }
    case 'situp': {
      // Лёжа на спине с согнутыми коленями; корпус поднимается к коленям.
      const up = k;
      return {
        rot: {
          l_thigh: [-1.25, 0, 0.05],
          r_thigh: [-1.25, 0, -0.05],
          l_shin: [1.9, 0, 0],
          r_shin: [1.9, 0, 0],
          l_foot: [-0.6, 0, 0],
          r_foot: [-0.6, 0, 0],
          spine: [0.55 * up, 0, 0],
          chest: [0.45 * up, 0, 0],
          neck: [0.3 * up, 0, 0],
          l_upper: [-2.6, 0, 0.35],
          r_upper: [-2.6, 0, -0.35],
          l_fore: [-1.9, 0, 0],
          r_fore: [-1.9, 0, 0],
        },
        pitch: -Math.PI / 2,
        lift: 0.12,
      };
    }
    case 'pullup':
    case 'pullup_negative':
    case 'pullup_australian': {
      const up = k;
      return {
        rot: {
          l_upper: [-0.2, 0, 2.9 - 1.3 * up],
          r_upper: [-0.2, 0, -2.9 + 1.3 * up],
          l_fore: [0, 0, 0.3 + 1.6 * up],
          r_fore: [0, 0, -0.3 - 1.6 * up],
          l_shin: [0.4, 0, 0],
          r_shin: [0.4, 0, 0],
          l_thigh: [-0.15, 0, 0],
          r_thigh: [-0.15, 0, 0],
        },
        lift: 0.15 + 0.35 * up,
      };
    }
    case 'idle':
    default: {
      const b = Math.sin(t * 1.3);
      return {
        rot: {
          l_upper: [0.03 * b, 0, 0.04],
          r_upper: [-0.03 * b, 0, -0.04],
          l_fore: [-0.12, 0, 0],
          r_fore: [-0.12, 0, 0],
          spine: [0, 0.03 * Math.sin(t * 0.4), 0],
          neck: [0.02 * Math.sin(t * 0.7), 0.05 * Math.sin(t * 0.5), 0],
        },
      };
    }
  }
}

/** Угол «вниз → направление» вокруг оси X: 0 — вниз, + — назад. */
const sagittal = (d: THREE.Vector3): number => Math.atan2(-d.z, -d.y);

/** Ставит ногу по обратной кинематике: стопа остаётся на месте при смещении таза. */
function solveLeg(rig: Rig, side: 'l' | 'r', hip: THREE.Vector3): void {
  const th = rig.bones[`${side}_thigh`];
  const sh = rig.bones[`${side}_shin`];
  const restKnee = rig.rest[`${side}_shin`];
  const restAnkle = rig.rest[`${side}_foot`];
  const restHipW = rig.rest.root.clone().add(rig.rest[`${side}_thigh`]);
  const ankleW = restHipW.clone().add(restKnee).add(restAnkle);
  const hipW = hip.clone().add(rig.rest[`${side}_thigh`]);
  const d = ankleW.sub(hipW);
  const a = rig.thigh;
  const b = rig.shin;
  const L = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, d.length()));
  const beta = Math.acos(Math.min(1, Math.max(-1, (a * a + L * L - b * b) / (2 * a * L))));
  const gamma = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - L * L) / (2 * a * b))));
  const alphaD = sagittal(d);
  const bindThigh = sagittal(restKnee);
  const bindShin = sagittal(restAnkle);
  const thighW = alphaD - beta;
  th.rotation.x = thighW - bindThigh;
  // Голень: мировой угол thighW + gamma, относительно бедра — с поправкой на позу покоя.
  sh.rotation.x = gamma - bindShin + bindThigh;
  // Стопа остаётся горизонтальной.
  rig.bones[`${side}_foot`].rotation.x = -(th.rotation.x + sh.rotation.x);
}

/** Применяет движение к скелету: motion в момент t, фаза повтора phase. */
/**
 * Применяет движение к скелету: motion в момент t, фаза повтора phase. blend < 1 —
 * плавный переход от текущей позы (доля пути за кадр), 1 — сразу в позу.
 */
export function animate(rig: Rig, motion: Motion, t: number, phase = 0, blend = 1): void {
  const p = poseFor(motion, t, phase);
  const k = Math.min(1, Math.max(0, blend));
  for (const b of BONES) {
    const r = p.rot[b];
    const bone = rig.bones[b];
    const x = r ? r[0] : 0;
    const y = r ? r[1] : 0;
    const z = r ? r[2] : 0;
    if (k >= 1) bone.rotation.set(x, y, z);
    else bone.rotation.set(bone.rotation.x + (x - bone.rotation.x) * k, bone.rotation.y + (y - bone.rotation.y) * k, bone.rotation.z + (z - bone.rotation.z) * k);
    if (b !== 'root') bone.position.copy(rig.rest[b]);
  }
  const hip = rig.rest.root.clone();
  if (p.hip) hip.add(new THREE.Vector3(p.hip[0], p.hip[1], p.hip[2]));
  if (k < 1) hip.lerpVectors(rig.bones.root.position, hip, k);
  rig.bones.root.position.copy(hip);
  if (p.ik) {
    solveLeg(rig, 'l', hip);
    solveLeg(rig, 'r', hip);
  }
  const pitch = p.pitch ?? 0;
  const lift = p.lift ?? 0;
  rig.root.rotation.x = k >= 1 ? pitch : rig.root.rotation.x + (pitch - rig.root.rotation.x) * k;
  rig.root.position.y = k >= 1 ? lift : rig.root.position.y + (lift - rig.root.position.y) * k;
  const busy = motion !== 'idle' && motion !== 'walk';
  for (const h of rig.held) h.visible = !busy;
}
