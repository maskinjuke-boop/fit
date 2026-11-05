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
  /** Голова (для предметов на голове: VR-шлем). */
  head: THREE.Object3D;
  /** Точка хвата сжатого кулака в осях кости кисти (для предметов на время действия). */
  grip: { l: THREE.Vector3; r: THREE.Vector3 };
}

/**
 * Строит кости по суставам (сдвинутым ползунками), превращает сетки тела в сетки со
 * скиннингом и крепит голову и предметы к костям.
 */
export function buildRig(root: THREE.Object3D, torso: THREE.Object3D, head: THREE.Object3D, figure: Figure, morph: Morph | null, rigid: ReadonlySet<THREE.Object3D>): Rig {
  const J = joints(figure);
  // Точка хвата кулака относительно кисти (по исходной фигуре, до ползунков).
  const L = landmarks(figure);
  const grip = { l: new THREE.Vector3(L.grip[0], L.grip[1], L.grip[2]).sub(J.l_hand), r: new THREE.Vector3(-L.grip[0], L.grip[1], L.grip[2]).sub(J.r_hand) };
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
  return { bones, rest, thigh: J.l_thigh.distanceTo(J.l_shin), shin: J.l_shin.distanceTo(J.l_foot), root, held, head, grip };
}

// ─── Позы ──────────────────────────────────────────────────────────────

/** Поза с телом и делом рук: «sit:read» — сидя читает, «stand:cook» — стоя готовит. */
export type Stance = 'stand' | 'sit' | 'crouch' | 'lie';
export type Act =
  | 'none'
  | 'relax'
  | 'tv'
  | 'phone'
  | 'text'
  | 'read'
  | 'cook'
  | 'eat'
  | 'drink'
  | 'wash'
  | 'type'
  | 'game'
  | 'paint'
  | 'write'
  | 'piano'
  | 'pet'
  | 'play'
  | 'feed'
  | 'call'
  | 'pour'
  | 'scoop'
  | 'box'
  | 'dance'
  | 'vr'
  | 'talk'
  | 'watch'
  | 'stretch'
  | 'circles'
  | 'massage'
  | 'sleep';
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
  /** Ходьба: цели голеностопов (смещение от покоя по y и z, в координатах тела) и наклон стоп. */
  feet?: { l: [number, number, number]; r: [number, number, number]; yaw: number };
  /** Наклон всего тела вбок (повороты на ходу). */
  roll?: number;
}

/** Параметры движения: скорость (м/с) и наклон в повороте. */
export interface AnimOpts {
  speed?: number;
  lean?: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Фаза повтора 0…1 → 0 (исходное) … 1 (нижняя точка) … 0. */
const wave = (phase: number): number => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
/** Редкий «жест»: 0 почти всё время, плавный горб длиной width (доля периода) раз в period с. */
const beat = (t: number, period: number, width = 0.18, shift = 0): number => {
  const x = (((t + shift) / period) % 1 + 1) % 1;
  return x < width ? Math.sin((x / width) * Math.PI) : 0;
};

type Rots = Partial<Record<BoneName, Rot>>;

/** Ноги, таз и наклон тела для позы. */
function stancePose(stance: Stance, t: number): Pose {
  const breath = Math.sin(t * 1.6);
  switch (stance) {
    case 'sit':
      return {
        rot: { l_thigh: [-1.5, 0, 0.08], r_thigh: [-1.5, 0, -0.08], l_shin: [1.45, 0, 0], r_shin: [1.45, 0, 0], l_foot: [0.05, 0, 0], r_foot: [0.05, 0, 0], spine: [-0.05 + 0.012 * breath, 0, 0], chest: [0.01 * breath, 0, 0] },
        hip: [0, -0.46, -0.4],
      };
    case 'crouch':
      // Присед на корточки: колени врозь, корпус над стопами.
      return { rot: { root: [0, 0, 0], spine: [0.42, 0, 0], chest: [0.15 + 0.01 * breath, 0, 0], neck: [-0.15, 0, 0], l_thigh: [0, 0, 0.18], r_thigh: [0, 0, -0.18] }, hip: [0, -0.52, -0.16], ik: true };
    case 'lie':
      return {
        rot: { l_upper: [0.05, 0, 0.12], r_upper: [0.05, 0, -0.12], l_fore: [-0.2, 0, 0], r_fore: [-0.2, 0, 0], neck: [0.25, 0, 0], l_foot: [0.5, 0, 0], r_foot: [0.5, 0, 0], chest: [0.025 * breath, 0, 0] },
        pitch: -Math.PI / 2,
        lift: 0.13,
      };
    case 'stand':
    default:
      // Стоя: лёгкое переминание с ноги на ногу и дыхание.
      return { rot: { spine: [0, 0.03 * Math.sin(t * 0.4), 0.012 * Math.sin(t * 0.35)], chest: [0.008 * breath, 0, 0] }, hip: [0.012 * Math.sin(t * 0.35), -0.004 * (1 + breath), 0], ik: true };
  }
}

/** Руки, корпус и голова для дела. */
function actPose(act: Act, stance: Stance, t: number): Rots {
  const s = Math.sin;
  const c = Math.cos;
  const sit = stance === 'sit';
  switch (act) {
    case 'relax':
      // Откинулся на спинку, руки на подлокотниках, голова лениво поворачивается.
      return { spine: [-0.24, 0, 0], chest: [-0.04, 0, 0], l_upper: [0.15, 0, 0.42], r_upper: [0.15, 0, -0.42], l_fore: [-0.55, 0, 0.1], r_fore: [-0.55, 0, -0.1], l_hand: [0.2, 0, 0], r_hand: [0.2, 0, 0], neck: [0.14, 0.28 * s(t * 0.3), 0.04 * s(t * 0.21)] };
    case 'tv': {
      // Смотрит сериал: откинулся, пульт в правой руке на колене, иногда нажимает.
      const click = beat(t, 7, 0.12);
      return {
        spine: [-0.2, 0, 0],
        chest: [-0.02, 0, 0],
        l_upper: [0.1, 0, 0.4],
        l_fore: [-0.5, 0, 0.1],
        l_hand: [0.2, 0, 0],
        r_upper: [-0.32 - 0.25 * click, 0, -0.16],
        r_fore: [-0.95 - 0.25 * click, 0, 0.25],
        r_hand: [-0.2, 0, 0],
        neck: [0.05 + 0.04 * s(t * 0.4), 0.08 * s(t * 0.13), 0],
      };
    }
    case 'massage':
      return { spine: [-0.3 + 0.02 * s(t * 18), 0, 0], l_upper: [0.1, 0, 0.32], r_upper: [0.1, 0, -0.32], l_fore: [-0.6, 0, 0.05], r_fore: [-0.6, 0, -0.05], neck: [-0.12, 0, 0.04 * s(t * 15)] };
    case 'sleep':
      return { l_upper: [-0.4, 0, 0.2], r_upper: [-0.4, 0, -0.2], l_fore: [-1.9, 0, -0.5], r_fore: [-1.9, 0, 0.5], neck: [0.15, 0.25, 0] };
    case 'phone': {
      // Разговор: телефон у уха, свободная рука жестикулирует, голова кивает.
      const g = s(t * 1.9);
      return {
        spine: [sit ? -0.08 : 0, 0.06 * s(t * 0.5), 0],
        r_upper: [-0.4, 0, -0.62],
        r_fore: [-2.55, 0, 0.12],
        r_hand: [0.35, 0, 0.15],
        l_upper: [-0.25 - 0.12 * g, 0, 0.16],
        l_fore: [-0.9 + 0.35 * g, 0, -0.05],
        l_hand: [0.1 * s(t * 2.7), 0, 0],
        neck: [0.05 + 0.06 * beat(t, 2.4, 0.3), 0.15 * s(t * 0.8), -0.14],
      };
    }
    case 'text': {
      // Печатает в телефоне: телефон перед грудью, взгляд вниз, большой палец двигается.
      const tap = s(t * 11);
      return {
        spine: [0.04, 0, 0],
        r_upper: [-0.32, 0, -0.1],
        r_fore: [-1.55, 0, 0.42],
        r_hand: [0.25 + 0.05 * tap, 0, 0.1],
        l_upper: [-0.3, 0, 0.12],
        l_fore: [-1.45, 0, -0.42],
        l_hand: [0.1, 0, 0],
        neck: [0.5, 0.03 * s(t * 0.6), 0],
      };
    }
    case 'read': {
      // Книга в обеих руках перед грудью, время от времени перелистывает страницу.
      const turn = beat(t, 6.5, 0.16);
      return {
        spine: [sit ? -0.1 : 0.02, 0, 0],
        chest: [0.08, 0, 0],
        l_upper: [-0.42, 0, 0.12],
        r_upper: [-0.42 - 0.12 * turn, 0, -0.12 - 0.12 * turn],
        l_fore: [-1.5, 0, -0.5],
        r_fore: [-1.5 - 0.1 * turn, 0, 0.5 + 0.25 * turn],
        l_hand: [0.15, 0, 0.1],
        r_hand: [0.15, 0, -0.1],
        neck: [0.42 + 0.03 * s(t * 0.9), 0.06 * s(t * 0.6) - 0.1 * turn, 0],
      };
    }
    case 'cook': {
      // Помешивает лопаткой в сковороде, левая рука придерживает ручку, переступает.
      const a = t * 3.6;
      return {
        spine: [0.16, 0.05 * s(t * 0.7), 0],
        chest: [0.05, 0, 0],
        l_upper: [-0.6, 0, 0.12],
        l_fore: [-0.85, 0, -0.3],
        l_hand: [0.2, 0, 0],
        r_upper: [-0.72 + 0.12 * s(a), 0.15 * c(a), -0.12],
        r_fore: [-0.95 + 0.15 * c(a), 0, 0.35],
        r_hand: [0.3 + 0.2 * s(a), 0, 0],
        neck: [0.42, 0.1 * s(t * 0.5), 0],
      };
    }
    case 'eat': {
      // Тарелка (или ведро попкорна) в левой руке, правая подносит еду ко рту.
      const bite = s(Math.PI * Math.min(1, Math.max(0, ((t * 0.45) % 1) / 0.45))) ** 1.5;
      return {
        spine: [sit ? -0.12 : 0.04, 0, 0],
        l_upper: [-0.4, 0, 0.14],
        l_fore: [-1.25, 0, -0.38],
        l_hand: [0.15, 0, 0],
        r_upper: [-0.3 - 0.45 * bite, 0, -0.16 + 0.05 * bite],
        r_fore: [-1.25 - 1.15 * bite, 0, 0.35],
        r_hand: [0.1 + 0.2 * bite, 0, 0],
        neck: [0.32 - 0.25 * bite, 0, 0],
      };
    }
    case 'drink': {
      // Подносит чашку ко рту, запрокидывает голову, ставит обратно к груди.
      const sip = s(Math.PI * Math.min(1, Math.max(0, ((t * 0.32) % 1) / 0.5))) ** 1.3;
      return {
        spine: [sit ? -0.1 : 0, 0, 0],
        l_upper: [-0.08, 0, 0.12],
        l_fore: [-0.5, 0, 0],
        r_upper: [-0.35 - 0.4 * sip, 0, -0.18 + 0.08 * sip],
        r_fore: [-1.35 - 0.95 * sip, 0, 0.3],
        r_hand: [0.1 - 0.35 * sip, 0, 0],
        neck: [0.15 - 0.4 * sip, 0, 0],
      };
    }
    case 'wash': {
      const a = t * 5;
      return { l_upper: [-0.6, 0, 1.9 + 0.12 * s(a)], r_upper: [-0.6, 0, -1.9 - 0.12 * s(a + 1)], l_fore: [-1.9, 0, 0], r_fore: [-1.9, 0, 0], neck: [-0.25, 0.15 * s(t), 0], spine: [0, 0.08 * s(t * 1.3), 0] };
    }
    case 'type': {
      const a = t * 9;
      const look = beat(t, 5, 0.25);
      return {
        spine: [0.08, 0, 0],
        l_upper: [-0.55, 0, 0.2],
        r_upper: [-0.55 + 0.08 * look, 0, -0.26],
        l_fore: [-1.0 + 0.07 * s(a), 0, -0.32],
        r_fore: [-1.0 + 0.07 * s(a + 2), 0, 0.32 + 0.1 * look],
        l_hand: [0.15 + 0.08 * Math.max(0, s(a * 1.3)), 0, 0],
        r_hand: [0.15 + 0.08 * Math.max(0, s(a * 1.1 + 1)), 0, 0],
        neck: [0.12 + 0.04 * look, 0.08 * s(t * 0.4), 0],
      };
    }
    case 'game': {
      // Геймпад в обеих руках, азарт: наклоны корпуса вслед за игрой.
      const a = t * 6;
      const sway = s(t * 1.3);
      return {
        spine: [(sit ? 0.12 : 0.06) + 0.04 * beat(t, 3.1, 0.3), 0.06 * sway, 0.05 * sway],
        l_upper: [-0.32, 0, 0.16],
        r_upper: [-0.32, 0, -0.16],
        l_fore: [-1.45 + 0.06 * s(a), 0, -0.5],
        r_fore: [-1.45 + 0.06 * s(a + 1.5), 0, 0.5],
        l_hand: [0.2, 0, 0.05],
        r_hand: [0.2, 0, -0.05],
        neck: [0.22, -0.04 * sway, -0.03 * sway],
      };
    }
    case 'vr': {
      // В шлеме: руки с контроллерами тянутся к виртуальным предметам, голова оглядывается.
      const a = t * 2.2;
      return {
        l_upper: [-1.0 + 0.5 * s(a), 0, 0.35 + 0.2 * s(a * 0.7)],
        r_upper: [-1.1 + 0.5 * s(a + 2), 0, -0.35 - 0.2 * s(a * 0.9)],
        l_fore: [-0.6 - 0.3 * s(a + 1), 0, 0],
        r_fore: [-0.6 - 0.3 * s(a + 3), 0, 0],
        neck: [-0.1 + 0.08 * s(t * 0.7), 0.5 * s(t * 0.9), 0],
        spine: [0.04 * s(t * 1.1), 0.25 * s(t * 0.9), 0],
      };
    }
    case 'paint': {
      // Кисть в правой руке мазками по холсту, палитра в левой у пояса.
      const a = t * 3;
      const dab = beat(t, 1.6, 0.4);
      return {
        spine: [0.04, -0.08, 0],
        r_upper: [-1.15 + 0.18 * s(a) - 0.1 * dab, 0.1, -0.12 + 0.14 * c(a)],
        r_fore: [-0.6 - 0.15 * dab, 0, 0.1],
        r_hand: [0.2 * dab, 0, 0],
        l_upper: [-0.25, 0, 0.22],
        l_fore: [-1.3, 0, -0.35],
        l_hand: [0.2, 0, 0],
        neck: [0.05, 0.1 + 0.05 * s(t * 0.5), 0.03 * s(t * 0.3)],
      };
    }
    case 'write': {
      // Блокнот в левой руке, правая пишет; задумывается, подняв взгляд.
      const think = beat(t, 6, 0.3);
      const a = t * 7;
      return {
        spine: [0.06, 0, 0],
        l_upper: [-0.3, 0, 0.14],
        l_fore: [-1.45, 0, -0.45],
        l_hand: [0.25, 0, 0],
        r_upper: [-0.35 - 0.1 * think, 0, -0.1],
        r_fore: [-1.45 - 0.5 * think + 0.04 * s(a), 0, 0.45 - 0.1 * think],
        r_hand: [0.2 + 0.05 * s(a * 1.3), 0, 0],
        neck: [0.45 - 0.45 * think, 0.1 * think, 0],
      };
    }
    case 'piano': {
      const a = t * 7;
      return { l_upper: [-0.6, 0, 0.14], r_upper: [-0.6, 0, -0.14], l_fore: [-0.85, 0, -0.2 + 0.08 * s(t * 0.9)], r_fore: [-0.85, 0, 0.2 + 0.08 * s(t * 0.7)], l_hand: [0.25 * Math.max(0, s(a)), 0, 0], r_hand: [0.25 * Math.max(0, s(a + 1.3)), 0, 0], spine: [0.06 + 0.03 * s(t * 1.6), 0.1 * s(t * 0.8), 0], neck: [0.2 + 0.05 * s(t * 1.6), 0.15 * s(t * 0.8), 0] };
    }
    case 'pet': {
      // Гладит кошку от головы к хвосту, второй рукой опирается на колено.
      const a = (t * 0.9) % 1;
      const stroke = a < 0.7 ? a / 0.7 : 1 - (a - 0.7) / 0.3;
      return {
        r_upper: [-0.95 + 0.3 * stroke, 0, -0.1],
        r_fore: [-0.5 + 0.25 * stroke, 0, 0.1],
        r_hand: [0.3, 0, 0],
        l_upper: [-0.55, 0, 0.18],
        l_fore: [-0.9, 0, -0.1],
        neck: [0.35, 0.08 * s(t * 0.7), 0.06],
      };
    }
    case 'play': {
      // Дразнилка в правой руке: водит перышком по полу, кошка охотится.
      const a = t * 2.6;
      return {
        r_upper: [-0.85 + 0.25 * s(a * 0.7), 0, -0.3 + 0.35 * s(a)],
        r_fore: [-0.4 - 0.2 * c(a), 0, 0],
        r_hand: [0.4 * s(a * 1.3), 0, 0],
        l_upper: [-0.5, 0, 0.2],
        l_fore: [-0.9, 0, -0.1],
        spine: [0, 0.12 * s(a), 0],
        neck: [0.35, 0.3 * s(a), 0],
      };
    }
    case 'feed': {
      // Протягивает угощение на ладони, кошка ест с руки.
      return { r_upper: [-0.8, 0, -0.08], r_fore: [-0.35, 0, 0.1], r_hand: [-0.5, 0, 0.3], l_upper: [-0.5, 0, 0.18], l_fore: [-0.9, 0, -0.1], neck: [0.4, 0.05 * s(t), 0.08] };
    }
    case 'call': {
      // Подзывает: рука вперёд и манит пальцами, голова чуть набок.
      const lure = s(t * 6);
      return { r_upper: [-0.85, 0, -0.15], r_fore: [-0.45 - 0.25 * Math.max(0, lure), 0, 0.1], r_hand: [-0.3 + 0.4 * Math.max(0, lure), 0, 0], l_upper: [-0.45, 0, 0.18], l_fore: [-0.9, 0, -0.1], neck: [0.1, 0.12 * s(t * 0.8), 0.12] };
    }
    case 'pour': {
      // Сыплет корм из пакета в миску, придерживая миску левой.
      const tilt = 0.5 + 0.5 * s(t * 2.2);
      return { r_upper: [-0.95, 0, -0.08], r_fore: [-0.6, 0, 0.25], r_hand: [0.2, 0, 0.8 + 0.5 * tilt], l_upper: [-0.85, 0, 0.12], l_fore: [-0.25, 0, -0.1], neck: [0.45, 0, 0] };
    }
    case 'scoop': {
      // Совком просеивает наполнитель лотка.
      const a = (t * 1.3) % 1;
      const dig = a < 0.5 ? a / 0.5 : 1 - (a - 0.5) / 0.5;
      return { r_upper: [-0.85 + 0.35 * dig, 0, -0.12], r_fore: [-0.5 - 0.6 * dig, 0, 0.2], r_hand: [0.5 - 0.7 * dig, 0, 0], l_upper: [-0.5, 0, 0.2], l_fore: [-0.9, 0, -0.1], neck: [0.45, 0, 0] };
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
        neck: [0.15, -0.15 * (l - r), 0],
      };
    }
    case 'dance': {
      const a = t * 4.2;
      return { spine: [0, 0.3 * s(a / 2), 0.08 * s(a)], chest: [0, 0.15 * s(a / 2), 0], l_upper: [-0.4, 0, 1.2 + 0.9 * s(a)], r_upper: [-0.4, 0, -1.2 - 0.9 * s(a + Math.PI)], l_fore: [-0.9, 0, 0], r_fore: [-0.9, 0, 0], neck: [0, 0.2 * s(a / 2), 0.1 * s(a)] };
    }
    case 'talk': {
      const a = t * 2.6;
      return { spine: [0, 0.08 * s(t * 0.6), 0], l_upper: [-0.55 + 0.25 * s(a), 0, 0.35], r_upper: [-0.6 + 0.25 * s(a + 1.7), 0, -0.4], l_fore: [-1.2, 0, 0.3 * s(a)], r_fore: [-1.1, 0, -0.3 * s(a + 1)], l_hand: [0.2 * s(a * 1.3), 0, 0], r_hand: [0.2 * s(a * 1.1 + 1), 0, 0], neck: [0.04 * beat(t, 1.8, 0.4), 0.18 * s(t * 0.9), 0.05 * s(a)] };
    }
    case 'watch': {
      // Смотрит на рыбок: руки за спиной, наклоняется ближе, голова следит.
      const lean = beat(t, 8, 0.5);
      return { spine: [0.1 + 0.15 * lean, 0, 0], l_upper: [0.35, 0, 0.12], r_upper: [0.35, 0, -0.12], l_fore: [-0.9, 0, -0.6], r_fore: [-0.9, 0, 0.6], neck: [0.1, 0.35 * s(t * 0.5), 0.05 * s(t * 0.33)] };
    }
    case 'stretch': {
      // Растяжка: руки вверх, наклоны в стороны.
      const a = s(t * 1.1);
      return { spine: [0, 0, 0.28 * a], chest: [0, 0, 0.12 * a], l_upper: [-0.2, 0, 2.75 - 0.15 * a], r_upper: [-0.2, 0, -2.75 - 0.15 * a], l_fore: [-0.2, 0, 0.3], r_fore: [-0.2, 0, -0.3], neck: [0, 0, -0.1 * a] };
    }
    case 'circles': {
      // Круги руками в стороны.
      const a = t * 4.2;
      return { l_upper: [0.45 * s(a), 0, 1.45 + 0.35 * c(a)], r_upper: [0.45 * s(a), 0, -1.45 - 0.35 * c(a)], l_fore: [-0.1, 0, 0], r_fore: [-0.1, 0, 0], neck: [0, 0.1 * s(t * 0.7), 0] };
    }
    case 'none':
    default:
      return sit ? { l_upper: [-0.4, 0, 0.05], r_upper: [-0.4, 0, -0.05], l_fore: [-0.7, 0, -0.35], r_fore: [-0.7, 0, 0.35] } : stance === 'lie' ? {} : { l_upper: [0, 0, 0.05], r_upper: [0, 0, -0.05], l_fore: [-0.15, 0, 0], r_fore: [-0.15, 0, 0] };
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

// ─── Ходьба ────────────────────────────────────────────────────────────

/** Длина ноги модели в покое (бедро + голень), по ней масштабируется шаг. */
const LEG = 1.12;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const ss = (x: number): number => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/** Скорость в «ногах в секунду» (одинаковая походка у высоких и низких). */
const legSpeed = (rig: Rig, speed: number): number => speed / Math.max(0.3, rig.root.scale.x * (rig.thigh + rig.shin));

/**
 * Частота шага (полных циклов в секунду) для скорости speed (м/с): с ростом скорости
 * шаг и длиннее, и чаще. Сцена копит фазу cycle += dt · gaitFreq, и стопы не скользят.
 */
export function gaitFreq(rig: Rig, speed: number): number {
  const v = legSpeed(rig, speed) * LEG;
  return 0.6 + 0.4 * Math.min(3.2, v);
}

/**
 * Шаг: фаза цикла u (0 — удар пяткой левой ноги), скорость v (м/с, для ноги LEG).
 * Опорная стопа едет назад ровно со скоростью тела (по обратной кинематике), пятка
 * встаёт первой, в конце опоры стопа перекатывается на носок; переносимая нога сгибается
 * в колене. Таз поворачивается навстречу плечам, руки идут в противофазе к ногам со
 * сгибом в локте, корпус покачивается, голова держится ровно. На бегу — короче опора,
 * сильнее наклон и сгиб рук.
 */
function walkPose(u: number, v: number, t: number): Pose {
  const run = ss((v - 2.1) / 0.9);
  const amp = ss(v / 1.1);
  const f = 0.6 + 0.4 * Math.min(3.2, v);
  const D = 0.62 - 0.17 * run;
  const travel = (v * D) / f;
  const F = travel * 0.42;
  const Bk = travel - F;
  const Lf = 0.17;
  const toe = 0.62 * amp;
  const lift = (0.085 + 0.08 * run) * amp;
  const foot = (p: number): [number, number, number] => {
    if (p < D) {
      const s = p / D;
      let z = F - (F + Bk) * s;
      let y = 0;
      let pitch = s < 0.14 ? -0.24 * amp * (1 - s / 0.14) : 0;
      if (s > 0.6) {
        const phi = toe * ((s - 0.6) / 0.4) ** 1.6;
        y += Lf * Math.sin(phi);
        z += Lf * (1 - Math.cos(phi));
        pitch = phi;
      }
      return [y, z, pitch];
    }
    const s = (p - D) / (1 - D);
    const y0 = Lf * Math.sin(toe);
    const z0 = -Bk + Lf * (1 - Math.cos(toe));
    const z = z0 + (F - z0) * (0.5 - 0.5 * Math.cos(Math.PI * s));
    const y = y0 * (1 - ss(s / 0.45)) + lift * Math.sin(Math.PI * Math.min(1, s * 1.1)) ** 0.8;
    const pitch = toe + (-0.24 * amp - toe) * ss(s);
    return [y, z, pitch];
  };
  const tau = Math.PI * 2;
  const c = Math.cos(tau * u);
  const ca = Math.cos(tau * (u - 0.06));
  // Таз: ниже всего при двойной опоре, выше — над опорной ногой; на бегу наоборот.
  const bob = 0.5 + 0.5 * Math.cos(2 * tau * u);
  const vk = Math.min(1, v / 2.6);
  const drop = (0.008 + 0.02 * vk + 0.03 * run) * amp + (0.03 + 0.02 * vk) * (run > 0.5 ? 1 - bob : bob) * amp;
  const pelvis = -0.11 * amp * c * (1 - 0.4 * run);
  const shoulders = 0.1 * amp * c;
  const lean = 0.04 * amp + 0.13 * run;
  const swing = (0.36 + 0.12 * run) * amp;
  const elbow = (k: number): number => -(0.22 + 0.32 * Math.max(0, k) * amp) - 1.05 * run;
  return {
    rot: {
      root: [0, pelvis, 0.035 * amp * Math.sin(tau * u)],
      spine: [lean * 0.6, (shoulders - pelvis) * 0.45, -0.02 * amp * Math.sin(tau * u)],
      chest: [lean * 0.4 + 0.01 * Math.sin(t * 1.6), (shoulders - pelvis) * 0.55, 0],
      // Голова смотрит вперёд: шея гасит повороты плеч и наклон корпуса.
      neck: [-lean * 0.7 + 0.015 * bob, -shoulders, 0],
      // Рука впереди чуть отводится наружу, чтобы кисть не заходила на таз.
      l_upper: [-0.04 + swing * ca, 0, 0.11 + 0.14 * Math.max(0, -ca) * amp + 0.04 * run],
      r_upper: [-0.04 - swing * ca, 0, -0.11 - 0.14 * Math.max(0, ca) * amp - 0.04 * run],
      l_fore: [elbow(-ca), 0, 0.08],
      r_fore: [elbow(ca), 0, -0.08],
      l_hand: [-0.12, 0, 0],
      r_hand: [-0.12, 0, 0],
    },
    hip: [0.022 * amp * Math.cos(tau * (u - D / 2)), -drop, 0],
    feet: { l: foot(u % 1), r: foot((u + 0.5) % 1), yaw: pelvis },
  };
}

/** Поза для движения в момент t (с) с фазой повтора phase (0…1). */
function poseFor(motion: Motion, t: number, phase: number): Pose {
  const k = wave(phase);
  const colon = motion.indexOf(':');
  if (colon > 0) return composedPose(motion.slice(0, colon) as Stance, motion.slice(colon + 1) as Act, t);
  switch (motion) {
    case 'walk':
      return walkPose(phase, 1.2, t);
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

/** Ладонь (середина) в осях кисти: правая кисть, у левой x зеркально. */
const PALM = new THREE.Vector3(0.022, -0.075, 0.018);

/**
 * Положение и поворот ладоней в позе motion в момент t (в координатах тела, без наклона
 * всего тела): для крепления предметов так, чтобы в этой позе они смотрели как нужно.
 */
export function handPose(rig: Rig, motion: Motion, t: number): Record<'l' | 'r', { q: THREE.Quaternion; palm: THREE.Vector3 }> {
  const p = poseFor(motion, t, 0);
  const e = new THREE.Euler();
  const side = (sd: 'l' | 'r'): { q: THREE.Quaternion; palm: THREE.Vector3 } => {
    const q = new THREE.Quaternion();
    const pos = rig.rest.root.clone();
    if (p.hip) pos.add(new THREE.Vector3(...p.hip));
    const chain: BoneName[] = ['root', 'spine', 'chest', `${sd}_upper`, `${sd}_fore`, `${sd}_hand`];
    chain.forEach((b, i) => {
      if (i > 0) pos.add(rig.rest[b].clone().applyQuaternion(q));
      const r = p.rot[b];
      if (r) q.multiply(new THREE.Quaternion().setFromEuler(e.set(r[0], r[1], r[2])));
    });
    const palm = PALM.clone();
    if (sd === 'l') palm.x = -palm.x;
    return { q, palm: pos.add(palm.applyQuaternion(q)) };
  };
  return { l: side('l'), r: side('r') };
}

/** Угол «вниз → направление» вокруг оси X: 0 — вниз, + — назад. */
const sagittal = (d: THREE.Vector3): number => Math.atan2(-d.z, -d.y);

const LEG_BONES: readonly BoneName[] = ['l_thigh', 'l_shin', 'l_foot', 'r_thigh', 'r_shin', 'r_foot'];
const legPrev = new Float32Array(6);
const tmpA = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpH = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Ставит ногу по обратной кинематике: голеностоп — в точку покоя, сдвинутую на (dy, dz)
 * (без сдвига стопа остаётся на месте при смещении таза), колено сгибается вперёд,
 * стопа — горизонтально с наклоном pitch (− носок вверх, + пятка вверх). yaw — поворот таза.
 */
function solveLeg(rig: Rig, side: 'l' | 'r', hip: THREE.Vector3, dy = 0, dz = 0, pitch = 0, yaw = 0): void {
  const th = rig.bones[`${side}_thigh`];
  const sh = rig.bones[`${side}_shin`];
  const restKnee = rig.rest[`${side}_shin`];
  const restAnkle = rig.rest[`${side}_foot`];
  const off = rig.rest[`${side}_thigh`];
  // Голеностоп в покое и цель.
  tmpA.copy(rig.rest.root).add(off).add(restKnee).add(restAnkle);
  tmpA.y += dy;
  tmpA.z += dz;
  // Вектор от тазобедренного сустава до цели — в повёрнутой системе таза.
  tmpD.subVectors(tmpA, hip).applyAxisAngle(Y, -yaw).sub(off);
  const d = tmpD;
  const a = rig.thigh;
  const b = rig.shin;
  const L = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, Math.hypot(d.y, d.z)));
  const beta = Math.acos(Math.min(1, Math.max(-1, (a * a + L * L - b * b) / (2 * a * L))));
  const gamma = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - L * L) / (2 * a * b))));
  const alphaD = sagittal(d);
  const bindThigh = sagittal(restKnee);
  const bindShin = sagittal(restAnkle);
  const thighW = alphaD - beta;
  th.rotation.x = thighW - bindThigh;
  // Голень: мировой угол thighW + gamma, относительно бедра — с поправкой на позу покоя.
  sh.rotation.x = gamma - bindShin + bindThigh;
  // Стопа горизонтальна (плюс наклон переката).
  rig.bones[`${side}_foot`].rotation.x = -(th.rotation.x + sh.rotation.x) + pitch;
}

/** Применяет движение к скелету: motion в момент t, фаза повтора phase. */
/**
 * Применяет движение к скелету: motion в момент t, фаза повтора phase. blend < 1 —
 * плавный переход от текущей позы (доля пути за кадр), 1 — сразу в позу.
 */
export function animate(rig: Rig, motion: Motion, t: number, phase = 0, blend = 1, opts?: AnimOpts): void {
  const p = motion === 'walk' ? walkPose(phase, legSpeed(rig, opts?.speed ?? 1.2) * LEG, t) : poseFor(motion, t, phase);
  if (opts?.lean !== undefined) p.roll = opts.lean;
  const k = Math.min(1, Math.max(0, blend));
  // Ноги по обратной кинематике при плавном переходе тоже смешиваются (без рывка).
  const legIk = Boolean(p.feet || p.ik) && k < 1;
  if (legIk) for (let i = 0; i < LEG_BONES.length; i += 1) legPrev[i] = rig.bones[LEG_BONES[i]!].rotation.x;
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
  const hip = tmpH.copy(rig.rest.root);
  if (p.hip) {
    hip.x += p.hip[0];
    hip.y += p.hip[1];
    hip.z += p.hip[2];
  }
  if (k < 1) hip.lerpVectors(rig.bones.root.position, hip, k);
  rig.bones.root.position.copy(hip);
  if (p.feet) {
    // Шаг: в масштабе персонажа (высокие шагают шире) — стопы точно по своим целям.
    const sc = (rig.thigh + rig.shin) / LEG;
    const yaw = rig.bones.root.rotation.y;
    solveLeg(rig, 'l', hip, p.feet.l[0] * sc, p.feet.l[1] * sc, p.feet.l[2], yaw);
    solveLeg(rig, 'r', hip, p.feet.r[0] * sc, p.feet.r[1] * sc, p.feet.r[2], yaw);
  } else if (p.ik) {
    solveLeg(rig, 'l', hip);
    solveLeg(rig, 'r', hip);
  }
  if (legIk)
    for (let i = 0; i < LEG_BONES.length; i += 1) {
      const b = rig.bones[LEG_BONES[i]!];
      b.rotation.x = legPrev[i]! + (b.rotation.x - legPrev[i]!) * k;
    }
  const pitch = p.pitch ?? 0;
  const lift = p.lift ?? 0;
  const roll = p.roll ?? 0;
  rig.root.rotation.x = k >= 1 ? pitch : rig.root.rotation.x + (pitch - rig.root.rotation.x) * k;
  rig.root.rotation.z = k >= 1 ? roll : rig.root.rotation.z + (roll - rig.root.rotation.z) * k;
  rig.root.position.y = k >= 1 ? lift : rig.root.position.y + (lift - rig.root.position.y) * k;
  const busy = motion !== 'idle' && motion !== 'walk';
  for (const h of rig.held) h.visible = !busy;
}
