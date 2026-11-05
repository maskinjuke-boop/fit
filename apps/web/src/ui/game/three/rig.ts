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

export type Motion = 'idle' | 'walk' | ExerciseId;

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

/** Поза для движения в момент t (с) с фазой повтора phase (0…1). */
function poseFor(motion: Motion, t: number, phase: number): Pose {
  const k = wave(phase);
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
export function animate(rig: Rig, motion: Motion, t: number, phase = 0): void {
  const p = poseFor(motion, t, phase);
  for (const b of BONES) {
    const r = p.rot[b];
    rig.bones[b].rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
    rig.bones[b].position.copy(rig.rest[b]);
  }
  const hip = rig.rest.root.clone();
  if (p.hip) hip.add(new THREE.Vector3(p.hip[0], p.hip[1], p.hip[2]));
  rig.bones.root.position.copy(hip);
  if (p.ik) {
    solveLeg(rig, 'l', hip);
    solveLeg(rig, 'r', hip);
  }
  rig.root.rotation.x = p.pitch ?? 0;
  rig.root.position.y = p.lift ?? 0;
  const busy = motion !== 'idle' && motion !== 'walk';
  for (const h of rig.held) h.visible = !busy;
}
