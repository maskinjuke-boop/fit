import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import type { ExerciseId } from '../../../tracking/exercise';
import { bodyPositions, landmarks, vertexParts } from './bodyMesh';
import { decodeClip, gaitKeys, makePose, mixPose, sampleClip, warpPhase, type Clip, type ClipPose } from './mocap';
import { CLIPS, CLIP_ANKLE, CLIP_LEG } from './mocapClips';
import type { Morph } from './morph';

/**
 * Скелет персонажа для анимации: 20 костей (таз, поясница, грудь, шея, ключицы, руки,
 * ноги и пальцы стоп). Веса вершин тела считаются по частям модели MakeHuman (корпус,
 * рука, нога) и положению вдоль костей; одежда, обувь и украшения берут веса ближайшей
 * вершины тела. Голова и предметы в руках крепятся к костям жёстко. Ходьба, бег и стойка
 * на месте — записи захвата движения (mocap.ts), упражнения и действия — процедурные позы
 * (присед, отжимание, скручивание, выпад, «джампинг джек», бег с высоким подниманием
 * колен, подтягивание).
 */

// Новые кости — в конце списка: номера старых в весах вершин не меняются.
export const BONES = ['root', 'spine', 'chest', 'neck', 'l_upper', 'l_fore', 'l_hand', 'r_upper', 'r_fore', 'r_hand', 'l_thigh', 'l_shin', 'l_foot', 'r_thigh', 'r_shin', 'r_foot', 'l_clav', 'r_clav', 'l_toe', 'r_toe'] as const;
export type BoneName = (typeof BONES)[number];
const B: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  spine: 'root',
  chest: 'spine',
  neck: 'chest',
  l_clav: 'chest',
  l_upper: 'l_clav',
  l_fore: 'l_upper',
  l_hand: 'l_fore',
  r_clav: 'chest',
  r_upper: 'r_clav',
  r_fore: 'r_upper',
  r_hand: 'r_fore',
  l_thigh: 'root',
  l_shin: 'l_thigh',
  l_foot: 'l_shin',
  r_thigh: 'root',
  r_shin: 'r_thigh',
  r_foot: 'r_shin',
  l_toe: 'l_foot',
  r_toe: 'r_foot',
};

const v3 = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);

const ballCache = new Map<Figure, [number, number, number]>();
/**
 * Плюснефаланговый сустав (подушечка стопы, где сгибаются пальцы) левой ноги: по сетке —
 * 70 % длины стопы от пятки, на 3 см над полом.
 */
function footBall(figure: Figure): [number, number, number] {
  let b = ballCache.get(figure);
  if (b) return b;
  const pos = bodyPositions(figure);
  const parts = vertexParts();
  let heel = Infinity;
  let tip = -Infinity;
  for (let i = 0; i < pos.length / 3; i += 1) {
    if (parts[i] !== 2 || pos[i * 3]! < 0.05 || pos[i * 3 + 1]! > 0.12) continue;
    heel = Math.min(heel, pos[i * 3 + 2]!);
    tip = Math.max(tip, pos[i * 3 + 2]!);
  }
  const L = landmarks(figure);
  b = [L.ankle[0] + 0.006, 0.03, heel + (tip - heel) * 0.7];
  ballCache.set(figure, b);
  return b;
}

/** Суставы в координатах тела (левая сторона — +X). */
export function joints(figure: Figure): Record<BoneName, THREE.Vector3> {
  const L = landmarks(figure);
  const side = (p: readonly number[], sx: number): THREE.Vector3 => new THREE.Vector3(p[0]! * sx, p[1], p[2]);
  const pelvis = v3(L.pelvis);
  const ball = footBall(figure);
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
    l_clav: side(L.clavicle, 1),
    r_clav: side(L.clavicle, -1),
    l_toe: side(ball, 1),
    r_toe: side(ball, -1),
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
      const [th, sh, ft, to] = left ? (['l_thigh', 'l_shin', 'l_foot', 'l_toe'] as const) : (['r_thigh', 'r_shin', 'r_foot', 'r_toe'] as const);
      const k = smooth(J[th].y - 0.14, J[th].y + 0.02, p.y);
      const f = smooth(J[sh].y - 0.05, J[sh].y + 0.05, p.y);
      const g = smooth(J[ft].y - 0.02, J[ft].y + 0.05, p.y);
      // Пальцы: всё впереди подушечки стопы (сгиб — плавный, на 4 см).
      const e = smooth(J[to].z - 0.025, J[to].z + 0.015, p.z) * (1 - smooth(J[ft].y - 0.03, J[ft].y, p.y));
      add(th, f * (1 - 0.45 * k));
      add('root', f * 0.45 * k);
      add(sh, (1 - f) * g);
      add(ft, (1 - f) * (1 - g) * (1 - e));
      add(to, (1 - f) * (1 - g) * e);
    } else if (part === 1) {
      const [up, fo, hd, cl] = left ? (['l_upper', 'l_fore', 'l_hand', 'l_clav'] as const) : (['r_upper', 'r_fore', 'r_hand', 'r_clav'] as const);
      const k = smooth(J[up].y - 0.12, J[up].y + 0.03, p.y);
      const f = smooth(J[fo].y - 0.05, J[fo].y + 0.05, p.y);
      const g = smooth(J[hd].y - 0.03, J[hd].y + 0.03, p.y);
      add(up, f * (1 - 0.5 * k));
      // Верх руки у плеча — наполовину на ключице (плечо поднимается и уходит вперёд-назад).
      add(cl, f * 0.5 * k);
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
      // Плечевой пояс (верх плеча, лопатка, край груди у подмышки) — на ключице.
      const cl = left ? 'l_clav' : 'r_clav';
      const ax = Math.abs(p.x);
      const a = 0.85 * smooth(Math.abs(J[cl].x) + 0.03, Math.abs(J[up].x) - 0.04, ax) * smooth(L.armpit - 0.1, L.armpit - 0.01, p.y);
      if (a > 0) {
        add(cl, rest * a);
        rest *= 1 - a;
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
}

/** Параметры движения: скорость (м/с), наклон в повороте и ход посадки. */
export interface AnimOpts {
  speed?: number;
  lean?: number;
  /**
   * Позы сидя: ход посадки 0…1 (0 — стоит, 1 — сидит; вставание — обратно). Стопы — по
   * прямой от места стоя к месту сидя (сцена сдвигает тело так, что они стоят на полу),
   * таз уходит назад и вниз, корпус наклоняется вперёд, руки — к позе дела. С ходом посадки
   * (и при 1) ширина стоп — как стоя; без него — поза сидя как есть (ученики, превью).
   */
  settle?: number;
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

// ─── Ходьба, бег и стойка: клипы захвата движения ─────────────────────

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const ss = (x: number): number => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/** Клипы распаковываются при первом использовании (вместе с 3D-сценой). */
let clips: Record<keyof typeof CLIPS, Clip> | null = null;
const clipSet = (): Record<keyof typeof CLIPS, Clip> => (clips ??= Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, decodeClip(c, BONES.length)])) as Record<keyof typeof CLIPS, Clip>);

/** Походки по возрастанию скорости: медленная, обычная, быстрая ходьба и бег трусцой. */
const GAITS = ['walk_slow', 'walk', 'walk_fast', 'jog'] as const;

/** Во сколько раз нога персонажа (с ростом) длиннее, чем у эталона клипов. */
const legScale = (rig: Rig): number => (rig.thigh + rig.shin) / CLIP_LEG;

/** Опорные точки выравнивания пар походок (по событиям шага). */
const keyCache = new Map<Clip, Map<Clip, [number[], number[]]>>();
function keysOf(a: Clip, b: Clip): [number[], number[]] {
  let m = keyCache.get(a);
  if (!m) keyCache.set(a, (m = new Map()));
  let k = m.get(b);
  if (!k) m.set(b, (k = a.events && b.events ? gaitKeys(a.events, b.events) : [[0, 1], [0, 1]]));
  return k;
}

const warp = new Float32Array(4);
/** Смесь походок в момент: две записи, вес b, скорость в масштабе эталона, их фазы и ход. */
const mix = { a: null as Clip | null, b: null as Clip | null, w: 0, u: 0, pa: 0, pb: 0, ra: 1, rb: 1 };

/**
 * Какие две походки смешать при скорости speed (м/с сцены) и с каким весом, и где каждая
 * из них в общей фазе phase. Скорость переводится в масштаб эталона (высокие шагают
 * шире). Вес меняется плавно почти на всём промежутке между скоростями записей (узкая
 * полоса смеси при разгоне проскакивалась бы за пару кадров — рывком позы); в смеси записи
 * выравниваются по событиям шага (постановки и отрывы стоп совпадают), иначе опорная стопа
 * одной записи смешивалась бы с летящей стопой другой.
 */
function gaitMix(rig: Rig, speed: number, phase: number): typeof mix {
  const set = clipSet();
  const u = speed / Math.max(0.3, rig.root.scale.x * legScale(rig));
  const v = (c: Clip): number => c.stride / c.duration;
  let i = 0;
  while (i < GAITS.length - 2 && u > v(set[GAITS[i + 1]!])) i += 1;
  const a = set[GAITS[i]!];
  const b = set[GAITS[i + 1]!];
  const w = ss(((u - v(a)) / (v(b) - v(a)) - 0.1) / 0.8);
  const [ka, kb] = keysOf(a, b);
  warpPhase(ka, kb, w, phase, warp);
  mix.a = a;
  mix.b = b;
  mix.w = w;
  mix.u = u;
  mix.pa = warp[0]!;
  mix.pb = warp[1]!;
  mix.ra = warp[2]!;
  mix.rb = warp[3]!;
  return mix;
}

/**
 * Частота шага (циклов в секунду) для скорости speed в фазе phase: путь опорной стопы в
 * смеси походок за единицу фазы равен пройденному телом пути — стопа не скользит. Сцена
 * копит фазу cycle += dt · gaitFreq(rig, speed, cycle).
 */
export function gaitFreq(rig: Rig, speed: number, phase = 0): number {
  const m = gaitMix(rig, speed, phase);
  return m.u / (m.a!.stride * m.ra * (1 - m.w) + m.b!.stride * m.rb * m.w);
}

const poseA = makePose(BONES.length);
const poseB = makePose(BONES.length);
const poseM = makePose(BONES.length);
const tq = new THREE.Quaternion();

/** Цепочки «таз → стопа» (номера костей) для поворота стопы в осях тела. */
const FOOT_CHAIN = { l: [B.root, B.l_thigh, B.l_shin, B.l_foot], r: [B.root, B.r_thigh, B.r_shin, B.r_foot] } as const;
const FWD = new THREE.Vector3(0, 0, 1);
/** Подъём пятки стопы с поворотом q (рад, + — пятка вверх, − — носок вверх). */
const heelUp = (q: THREE.Quaternion): number => -Math.asin(Math.max(-1, Math.min(1, tv.copy(FWD).applyQuaternion(q).y)));

/** Поворот стопы side в осях тела по позе клипа. */
function footQ(pose: ClipPose, side: 'l' | 'r', out: THREE.Quaternion): THREE.Quaternion {
  const c = FOOT_CHAIN[side];
  out.fromArray(pose.q, c[0] * 4);
  for (let k = 1; k < 4; k += 1) out.multiply(tq.fromArray(pose.q, c[k]! * 4));
  return out;
}

/** Пятка (на полу) и подушечка стопы эталона клипов от голеностопа. */
let refFoot: { heel: THREE.Vector3; ball: THREE.Vector3 } | null = null;
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qm = new THREE.Quaternion();
const pv = new THREE.Vector3();
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();

/** Точка опоры стопы с поворотом q (в pv, от голеностопа): пятка, пока носок поднят, подушечка — пока поднята пятка. */
function pivot(q: THREE.Quaternion): THREE.Vector3 {
  refFoot ??= (() => {
    const J = joints('female');
    return { heel: new THREE.Vector3(0, -J.l_foot.y, -0.055), ball: J.l_toe.clone().sub(J.l_foot).setX(0) };
  })();
  return pv.copy(refFoot.heel).lerp(refFoot.ball, ss((heelUp(q) + 0.03) / 0.06));
}

/** Шаг персонажа между кадрами: фаза, голеностопы и повороты стоп клипа, поправки стоп (x, z). */
interface GaitHold {
  live: boolean;
  phase: number;
  ankle: Float32Array;
  q: Float32Array;
  off: Float32Array;
}
const holds = new WeakMap<Rig, GaitHold>();

/**
 * Опорная стопа стоит на месте и при смене скорости: смесь походок с другим весом (разгон,
 * торможение) сдвинула бы её по полу. Пока стопа в опоре, её точка опоры за кадр сдвигается
 * в теле ровно на пройденный путь, а разница копится в поправке голеностопа; в переносе
 * поправка плавно гаснет (стопа встаёт уже без неё). Всё — в масштабе эталона клипов.
 */
function holdFeet(rig: Rig, pose: ClipPose, m: typeof mix, phase: number): void {
  let h = holds.get(rig);
  if (!h) holds.set(rig, (h = { live: false, phase: 0, ankle: new Float32Array(6), q: new Float32Array(8), off: new Float32Array(4) }));
  const dp = (((phase - h.phase) % 1) + 1) % 1;
  const fresh = !h.live || dp > 0.25;
  const travel = dp * (m.a!.stride * m.ra * (1 - m.w) + m.b!.stride * m.rb * m.w);
  // Опора — по событиям шага преобладающей записи.
  const c = m.w < 0.5 ? m.a! : m.b!;
  const u = m.w < 0.5 ? m.pa : m.pb;
  const e = c.events;
  for (const side of SIDES) {
    const o = side === 'l' ? 3 : 6;
    const j = side === 'l' ? 0 : 2;
    const ai = side === 'l' ? 0 : 3;
    const qi = side === 'l' ? 0 : 4;
    footQ(pose, side, qm);
    const stance = !e || (side === 'l' ? u < e.lOff : e.rOn < e.rOff ? u >= e.rOn && u < e.rOff : u >= e.rOn || u < e.rOff);
    if (fresh) {
      h.off[j] = 0;
      h.off[j + 1] = 0;
    } else if (stance) {
      pivot(qm);
      pa.copy(pv).applyQuaternion(qa.fromArray(h.q, qi)).add(tv.fromArray(h.ankle, ai));
      pb.copy(pv).applyQuaternion(qm).add(tv.fromArray(pose.pos, o));
      h.off[j] = h.off[j]! + pa.x - pb.x;
      h.off[j + 1] = h.off[j + 1]! + pa.z - travel - pb.z;
    } else {
      const f = 1 - Math.min(1, dp * 8);
      h.off[j] = h.off[j]! * f;
      h.off[j + 1] = h.off[j + 1]! * f;
    }
    for (let k = 0; k < 3; k += 1) h.ankle[ai + k] = pose.pos[o + k]!;
    qm.toArray(h.q, qi);
    pose.pos[o] = pose.pos[o]! + h.off[j]!;
    pose.pos[o + 2] = pose.pos[o + 2]! + h.off[j + 1]!;
  }
  h.phase = phase;
  h.live = true;
}

/**
 * Смесь двух походок (w — вес b). Повороты смешиваются сферически, а голеностоп — так, чтобы
 * точка опоры стопы (пятка при постановке, подушечка при перекате) была смесью точек опоры
 * обеих записей: в каждой записи она неподвижна в мире, значит, и в смеси. Если смешивать
 * сами голеностопы, у стоп с разным наклоном точка опоры ехала бы по полу и уходила под него.
 */
function mixGait(a: ClipPose, b: ClipPose, w: number, out: ClipPose): ClipPose {
  mixPose(a, b, w, out);
  if (w <= 0 || w >= 1) return out;
  for (const side of SIDES) {
    footQ(a, side, qa);
    footQ(b, side, qb);
    pivot(footQ(out, side, qm));
    const o = side === 'l' ? 3 : 6;
    pa.copy(pv).applyQuaternion(qa).add(tv.fromArray(a.pos, o));
    pb.copy(pv).applyQuaternion(qb).add(tv.fromArray(b.pos, o));
    pa.lerp(pb, w).sub(pv.applyQuaternion(qm));
    pa.toArray(out.pos, o);
  }
  return out;
}

const SOLE = new THREE.Vector3(0, -0.03, 0);
const TIP = new THREE.Vector3(0, -0.03, 0.085);
const fq = new THREE.Quaternion();
const fv = new THREE.Vector3();
/**
 * Самая низкая точка стопы (пятка, подошва под подушечкой, кончики пальцев) относительно
 * голеностопа — по текущим поворотам костей ноги (координаты тела).
 */
function footLow(rig: Rig, side: 'l' | 'r', ankleY: number): number {
  fq.copy(rig.bones.root.quaternion).multiply(rig.bones[`${side}_thigh`].quaternion).multiply(rig.bones[`${side}_shin`].quaternion).multiply(rig.bones[`${side}_foot`].quaternion);
  const heel = fv.set(0, -ankleY, -0.055).applyQuaternion(fq).y;
  const ball = fv.copy(rig.rest[`${side}_toe`]).applyQuaternion(fq).y;
  const sole = ball + fv.copy(SOLE).applyQuaternion(fq).y;
  const tip = ball + fv.copy(TIP).applyQuaternion(fq.multiply(rig.bones[`${side}_toe`].quaternion)).y;
  return Math.min(heel, sole, tip);
}

/** Ставит позу клипа: повороты костей, таз (смещение от покоя) и ноги — по целям голеностопов. */
function applyClip(rig: Rig, pose: ClipPose): void {
  const r = legScale(rig);
  for (let i = 0; i < BONES.length; i += 1) {
    const b = BONES[i]!;
    const bone = rig.bones[b];
    bone.quaternion.fromArray(pose.q, i * 4);
    if (b !== 'root') bone.position.copy(rig.rest[b]);
  }
  const p = pose.pos;
  rig.bones.root.position.set(rig.rest.root.x + p[0]! * r, rig.rest.root.y + p[1]! * r, rig.rest.root.z + p[2]! * r);
  // Голеностопы: по ширине — как у актёра (в масштабе ноги), по высоте и вперёд — от покоя.
  let drop = 0;
  for (const side of SIDES) {
    const o = side === 'l' ? 3 : 6;
    const ankle = restAnkle(rig, side);
    const t = side === 'l' ? tgtL : tgtR;
    t.set(p[o]! * r, ankle.y + (p[o + 1]! - CLIP_ANKLE[1]) * r, ankle.z + (p[o + 2]! - CLIP_ANKLE[2]) * r);
    // Ничто не уходит под пол (смесь походок, другие пропорции стопы).
    t.y -= Math.min(0, t.y + footLow(rig, side, ankle.y));
    // Нога не дотягивается (пропорции не как у актёра) — таз опускается, а не стопа повисает.
    tv.copy(rig.bones[`${side}_thigh`].position).applyQuaternion(rig.bones.root.quaternion).add(rig.bones.root.position);
    const reach = REACH * (rig.thigh + rig.shin);
    const h2 = (tv.x - t.x) ** 2 + (tv.z - t.z) ** 2;
    const dy = tv.y - t.y;
    if (dy * dy + h2 > reach * reach && h2 < reach * reach) drop = Math.max(drop, dy - Math.sqrt(reach * reach - h2));
  }
  rig.bones.root.position.y -= drop;
  reachLeg(rig, 'l', tgtL);
  reachLeg(rig, 'r', tgtR);
}

const SIDES = ['l', 'r'] as const;
/** Насколько можно выпрямить ногу (доля длины): у прямой ноги колено «щёлкает». */
const REACH = 0.985;
const tgtL = new THREE.Vector3();
const tgtR = new THREE.Vector3();
const tv = new THREE.Vector3();

const ankleRest = { l: new THREE.Vector3(), r: new THREE.Vector3() };
/** Голеностоп в покое (координаты тела). */
function restAnkle(rig: Rig, side: 'l' | 'r'): THREE.Vector3 {
  return ankleRest[side].copy(rig.rest.root).add(rig.rest[`${side}_thigh`]).add(rig.rest[`${side}_shin`]).add(rig.rest[`${side}_foot`]);
}

const qT = new THREE.Quaternion();
const qS = new THREE.Quaternion();
const qF = new THREE.Quaternion();
const qR = new THREE.Quaternion();
const pH = new THREE.Vector3();
const pK = new THREE.Vector3();
const pA = new THREE.Vector3();
const pK2 = new THREE.Vector3();
const vU = new THREE.Vector3();
const vN = new THREE.Vector3();
const vX = new THREE.Vector3();
const vY = new THREE.Vector3();

/**
 * Дотягивает ногу до цели голеностопа target (координаты тела): колено остаётся в той же
 * плоскости, что и в позе клипа, бедро и голень поворачиваются кратчайшим путём, стопа
 * сохраняет мировой поворот (лежит на полу так же, как у актёра).
 */
function reachLeg(rig: Rig, side: 'l' | 'r', target: THREE.Vector3): void {
  const root = rig.bones.root;
  const th = rig.bones[`${side}_thigh`];
  const sh = rig.bones[`${side}_shin`];
  const ft = rig.bones[`${side}_foot`];
  // Текущая цепочка: тазобедренный сустав, колено, голеностоп и повороты в осях тела.
  qR.copy(root.quaternion);
  pH.copy(th.position).applyQuaternion(qR).add(root.position);
  qT.copy(qR).multiply(th.quaternion);
  pK.copy(sh.position).applyQuaternion(qT).add(pH);
  qS.copy(qT).multiply(sh.quaternion);
  pA.copy(ft.position).applyQuaternion(qS).add(pK);
  qF.copy(qS).multiply(ft.quaternion);
  const a = sh.position.length();
  const b = ft.position.length();
  vU.subVectors(target, pH);
  const d = vU.length();
  if (d < 1e-6) return;
  vU.divideScalar(d);
  const L = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, d));
  // Направление сгиба: колено от линии «таз — цель» (как в клипе; если нога прямая — вперёд).
  vN.subVectors(pK, pH).addScaledVector(vU, -vU.dot(vX.subVectors(pK, pH)));
  if (vN.lengthSq() < 1e-8) vN.set(0, 0, 1).applyQuaternion(qT).addScaledVector(vU, -vU.z);
  vN.normalize();
  const cb = (a * a + L * L - b * b) / (2 * a * L);
  const sb = Math.sqrt(Math.max(0, 1 - cb * cb));
  pK2.copy(pH).addScaledVector(vU, a * cb).addScaledVector(vN, a * sb);
  // Бедро: кратчайший поворот старого направления на новое.
  vX.subVectors(pK, pH).normalize();
  vY.subVectors(pK2, pH).normalize();
  tq.setFromUnitVectors(vX, vY);
  qT.premultiply(tq);
  // Голень: после поворота бедра — к цели.
  vX.subVectors(pA, pK).applyQuaternion(tq).normalize();
  vY.copy(pH).addScaledVector(vU, L).sub(pK2).normalize();
  qS.premultiply(tq);
  tq.setFromUnitVectors(vX, vY);
  qS.premultiply(tq);
  th.quaternion.copy(qR).invert().multiply(qT);
  sh.quaternion.copy(qT).invert().multiply(qS);
  ft.quaternion.copy(qS).invert().multiply(qF);
}

/** Поза для движения в момент t (с) с фазой повтора phase (0…1). */
function poseFor(motion: Motion, t: number, phase: number): Pose {
  const k = wave(phase);
  const colon = motion.indexOf(':');
  if (colon > 0) return composedPose(motion.slice(0, colon) as Stance, motion.slice(colon + 1) as Act, t);
  switch (motion) {
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
export function handPose(rig: Rig, motion: Motion, t: number): Record<'l' | 'r', { q: THREE.Quaternion; palm: THREE.Vector3; pos: THREE.Vector3 }> {
  const p = poseFor(motion, t, 0);
  const e = new THREE.Euler();
  const side = (sd: 'l' | 'r'): { q: THREE.Quaternion; palm: THREE.Vector3; pos: THREE.Vector3 } => {
    const q = new THREE.Quaternion();
    const pos = rig.rest.root.clone();
    if (p.hip) pos.add(new THREE.Vector3(...p.hip));
    const chain: BoneName[] = ['root', 'spine', 'chest', `${sd}_clav`, `${sd}_upper`, `${sd}_fore`, `${sd}_hand`];
    chain.forEach((b, i) => {
      if (i > 0) pos.add(rig.rest[b].clone().applyQuaternion(q));
      const r = p.rot[b];
      if (r) q.multiply(new THREE.Quaternion().setFromEuler(e.set(r[0], r[1], r[2])));
    });
    const palm = PALM.clone();
    if (sd === 'l') palm.x = -palm.x;
    return { q, palm: pos.clone().add(palm.applyQuaternion(q)), pos };
  };
  return { l: side('l'), r: side('r') };
}

/** Угол «вниз → направление» вокруг оси X: 0 — вниз, + — назад. */
const sagittal = (d: THREE.Vector3): number => Math.atan2(-d.z, -d.y);

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

/**
 * Где стопы и таз сидящего относительно места, где он стоял (по направлению взгляда, в
 * масштабе персонажа): стопы — впереди корня, таз — позади.
 */
export function seatOffsets(rig: Rig): { feet: number; hips: number } {
  const st = stancePose('sit', 0);
  const e = new THREE.Euler();
  const q1 = new THREE.Quaternion().setFromEuler(e.set(...(st.rot.l_thigh ?? [0, 0, 0])));
  const q2 = new THREE.Quaternion().setFromEuler(e.set(...(st.rot.l_shin ?? [0, 0, 0])));
  const z = (st.hip?.[2] ?? 0) + rig.rest.l_shin.clone().applyQuaternion(q1).z + rig.rest.l_foot.clone().applyQuaternion(q1.multiply(q2)).z;
  const sc = rig.root.scale.x;
  return { feet: (z - rig.rest.l_shin.z - rig.rest.l_foot.z) * sc, hips: (st.hip?.[2] ?? 0) * sc };
}

const seatAnkle = { l: new THREE.Vector3(), r: new THREE.Vector3() };
const qI = new THREE.Quaternion();
const LEGS = new Set<BoneName>(['l_thigh', 'l_shin', 'l_foot', 'l_toe', 'r_thigh', 'r_shin', 'r_foot', 'r_toe']);

/**
 * Посадка на ходу s (0 — стоит, 1 — сидит) поверх позы сидя, уже поставленной на кости:
 * стопы — от покоя к месту сидя по прямой, таз сначала уходит назад, потом опускается,
 * корпус наклоняется вперёд (сильнее всего посередине), голова смотрит вперёд.
 */
function seat(rig: Rig, hip: THREE.Vector3, s: number): void {
  const e = ss(s);
  ankleAt(rig, 'l', seatAnkle.l);
  ankleAt(rig, 'r', seatAnkle.r);
  for (const b of BONES) {
    if (LEGS.has(b)) continue;
    const q = rig.bones[b].quaternion;
    tq.copy(q);
    q.copy(qI).slerp(tq, e);
  }
  const lean = 0.55 * Math.sin(Math.PI * clamp01(s / 0.95));
  rig.bones.spine.rotateX(lean * 0.6);
  rig.bones.chest.rotateX(lean * 0.4);
  rig.bones.neck.rotateX(-lean * 0.6);
  const dx = hip.x - rig.rest.root.x;
  const dy = hip.y - rig.rest.root.y;
  const dz = hip.z - rig.rest.root.z;
  rig.bones.root.position.set(rig.rest.root.x + dx * e, rig.rest.root.y + dy * ss((s - 0.15) / 0.85), rig.rest.root.z + dz * ss(s / 0.85));
  // Ширина стоп — как стоя (иначе сидя колени врозь развели бы стопы по полу на 4–5 см).
  for (const side of SIDES) {
    const rest = restAnkle(rig, side);
    reachLeg(rig, side, seatAnkle[side].lerp(rest, 1 - e).setX(rest.x));
  }
}

const prevQ = new Float32Array(BONES.length * 4);
const prevRoot = new THREE.Vector3();
const prevAnkle = { l: new THREE.Vector3(), r: new THREE.Vector3() };
const nextAnkle = { l: new THREE.Vector3(), r: new THREE.Vector3() };

/** Голеностоп в текущей позе (координаты тела). */
function ankleAt(rig: Rig, side: 'l' | 'r', out: THREE.Vector3): THREE.Vector3 {
  const root = rig.bones.root;
  qT.copy(root.quaternion).multiply(rig.bones[`${side}_thigh`].quaternion);
  qS.copy(qT).multiply(rig.bones[`${side}_shin`].quaternion);
  return out
    .copy(rig.bones[`${side}_foot`].position)
    .applyQuaternion(qS)
    .add(pK.copy(rig.bones[`${side}_shin`].position).applyQuaternion(qT))
    .add(pH.copy(rig.bones[`${side}_thigh`].position).applyQuaternion(root.quaternion))
    .add(root.position);
}

/**
 * Применяет движение к скелету: motion в момент t, фаза повтора phase. blend < 1 —
 * плавный переход от текущей позы (доля пути за кадр, сферическая интерполяция поворотов),
 * 1 — сразу в позу. Ходьба (opts.speed — скорость, м/с сцены) и стойка — клипы захвата
 * движения, остальное — процедурные позы.
 */
export function animate(rig: Rig, motion: Motion, t: number, phase = 0, blend = 1, opts?: AnimOpts): void {
  const k = Math.min(1, Math.max(0, blend));
  if (k < 1) {
    for (let i = 0; i < BONES.length; i += 1) rig.bones[BONES[i]!].quaternion.toArray(prevQ, i * 4);
    prevRoot.copy(rig.bones.root.position);
    ankleAt(rig, 'l', prevAnkle.l);
    ankleAt(rig, 'r', prevAnkle.r);
  }
  let pitch = 0;
  let lift = 0;
  // Стопы стоят на полу: при переходе голеностопы идут по прямой, а не как придётся.
  let planted = true;
  // Шаг прервался — поправки опорных стоп начинаются заново.
  if (motion !== 'walk') {
    const h = holds.get(rig);
    if (h) h.live = false;
  }
  if (motion === 'walk') {
    const m = gaitMix(rig, opts?.speed ?? 1.2, phase);
    const pose = mixGait(sampleClip(m.a!, m.pa, poseA), sampleClip(m.b!, m.pb, poseB), m.w, poseM);
    holdFeet(rig, pose, m, phase);
    applyClip(rig, pose);
  } else if (motion === 'idle') {
    const c = clipSet().idle;
    applyClip(rig, sampleClip(c, t / c.duration, poseA));
  } else {
    const p = poseFor(motion, t, phase);
    for (const b of BONES) {
      const r = p.rot[b];
      const bone = rig.bones[b];
      if (r) bone.rotation.set(r[0], r[1], r[2]);
      else bone.rotation.set(0, 0, 0);
      if (b !== 'root') bone.position.copy(rig.rest[b]);
    }
    const hip = tmpH.copy(rig.rest.root);
    if (p.hip) {
      hip.x += p.hip[0];
      hip.y += p.hip[1];
      hip.z += p.hip[2];
    }
    rig.bones.root.position.copy(hip);
    if (p.ik) {
      solveLeg(rig, 'l', hip);
      solveLeg(rig, 'r', hip);
    }
    planted = Boolean(p.ik);
    if (opts?.settle !== undefined && motion.startsWith('sit:')) {
      seat(rig, hip, clamp01(opts.settle));
      planted = true;
    }
    pitch = p.pitch ?? 0;
    lift = p.lift ?? 0;
  }
  if (k < 1) {
    if (planted) {
      ankleAt(rig, 'l', nextAnkle.l);
      ankleAt(rig, 'r', nextAnkle.r);
    }
    for (let i = 0; i < BONES.length; i += 1) {
      const q = rig.bones[BONES[i]!].quaternion;
      tq.copy(q);
      q.fromArray(prevQ, i * 4).slerp(tq, k);
    }
    rig.bones.root.position.lerpVectors(prevRoot, rig.bones.root.position, k);
    if (planted)
      // Цель — та же доля пути между прежним и новым положением голеностопа.
      for (const side of SIDES) reachLeg(rig, side, nextAnkle[side].lerpVectors(prevAnkle[side], nextAnkle[side], k));
  }
  const roll = opts?.lean ?? 0;
  rig.root.rotation.x = k >= 1 ? pitch : rig.root.rotation.x + (pitch - rig.root.rotation.x) * k;
  rig.root.rotation.z = k >= 1 ? roll : rig.root.rotation.z + (roll - rig.root.rotation.z) * k;
  rig.root.position.y = k >= 1 ? lift : rig.root.position.y + (lift - rig.root.position.y) * k;
  const busy = motion !== 'idle' && motion !== 'walk';
  for (const h of rig.held) h.visible = !busy;
}
