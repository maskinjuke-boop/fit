import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { NECK_WORLD, TORSO_Y, bodyShape, type BodyShape } from './body';
import { loadMesh, saveMesh } from './meshStore';
import { blend, ellipsoid, netsGen, polyline, roundCone, runSliced, smax, smin, sphere, type Field, type MeshOptions, type Prim, type V3 } from './sdf';

/**
 * Анатомия героя: тело как поле расстояний из трёх частей — корпус, руки и ноги
 * (руки и ноги симметричны: считаются по |x|). Части плавно сливаются в одну кожу.
 * Мужская фигура — «треугольник» с широкими плечами и рельефом груди и пресса,
 * женская — «песочные часы»: узкая талия, широкие бёдра и выраженная грудь.
 * Одежда — оболочки того же тела с маской области (футболка, топ, брюки…).
 */

const T = TORSO_Y;

export interface Parts {
  torso: number;
  arm: number;
  leg: number;
}

interface Anatomy {
  torso: Field;
  arm: Field;
  leg: Field;
  /** Тело целиком и (через scratch) расстояния до частей. */
  eval(x: number, y: number, z: number, out?: Parts): number;
  shape: BodyShape;
}

const lerp3 = (a: THREE.Vector3, b: THREE.Vector3, t: number, off: V3 = [0, 0, 0]): V3 => [a.x + (b.x - a.x) * t + off[0], a.y + (b.y - a.y) * t + off[1], a.z + (b.z - a.z) * t + off[2]];
const v3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];

function torsoPrims(female: boolean): { main: Prim[]; detail: Prim[]; carve: Prim[] } {
  const neckTop = NECK_WORLD + 0.12;
  if (female) {
    return {
      main: [
        ellipsoid([0, T + 0.38, -0.005], [0.222, 0.24, 0.148]),
        ellipsoid([0, T + 0.12, 0], [0.19, 0.2, 0.132]),
        ellipsoid([0, T + 0.04, 0.03], [0.155, 0.12, 0.108]),
        ellipsoid([0, T - 0.08, -0.012], [0.285, 0.16, 0.158]),
        ellipsoid([0.1, T + 0.38, -0.05], [0.125, 0.19, 0.1]),
        // Трапеция: от шеи вниз к плечу (у женской фигуры — мягкий покатый скат).
        roundCone([0.03, T + 0.62, -0.035], [0.25, T + 0.535, -0.025], 0.05, 0.042),
        roundCone([0, T + 0.5, -0.02], [0, neckTop, 0], 0.068, 0.058),
      ],
      // Грудь: полная нижняя часть и мягкий переход сверху (каплевидная форма), ягодицы.
      detail: [
        ellipsoid([0.086, T + 0.37, 0.118], [0.104, 0.1, 0.112]),
        ellipsoid([0.075, T + 0.435, 0.07], [0.09, 0.075, 0.075]),
        ellipsoid([0.095, T - 0.12, -0.08], [0.14, 0.14, 0.126]),
        // Ключицы и грудино-ключично-сосцевидные мышцы шеи.
        roundCone([0.018, T + 0.585, 0.06], [0.21, T + 0.565, 0.005], 0.0105, 0.0095),
        roundCone([0.045, NECK_WORLD + 0.07, -0.005], [0.016, T + 0.6, 0.055], 0.014, 0.011),
      ],
      carve: [sphere([0, T + 0.02, 0.14], 0.011)],
    };
  }
  return {
    main: [
      ellipsoid([0, T + 0.37, 0], [0.255, 0.26, 0.165]),
      ellipsoid([0, T + 0.1, 0.005], [0.222, 0.2, 0.15]),
      ellipsoid([0, T - 0.08, -0.005], [0.245, 0.15, 0.15]),
      ellipsoid([0.12, T + 0.38, -0.05], [0.15, 0.2, 0.11]),
      // Трапеция: мощный скат от шеи к плечу.
      roundCone([0.03, T + 0.65, -0.04], [0.29, T + 0.55, -0.025], 0.064, 0.05),
      roundCone([0, T + 0.5, -0.02], [0, neckTop, 0], 0.088, 0.072),
    ],
    // Грудные мышцы, кубики пресса, ягодицы.
    detail: [
      ellipsoid([0.105, T + 0.43, 0.088], [0.12, 0.085, 0.07]),
      ...[0.04, 0.115, 0.19].map((dy): Prim => ellipsoid([0.045, T + dy, 0.128], [0.042, 0.034, 0.034])),
      ellipsoid([0.085, T - 0.13, -0.065], [0.12, 0.13, 0.11]),
      // Ключицы и грудино-ключично-сосцевидные мышцы шеи.
      roundCone([0.02, T + 0.6, 0.075], [0.25, T + 0.58, 0.01], 0.013, 0.012),
      roundCone([0.055, NECK_WORLD + 0.07, -0.005], [0.02, T + 0.615, 0.07], 0.018, 0.014),
    ],
    carve: [sphere([0, T + 0.02, 0.157], 0.011)],
  };
}

function armPrims(shape: BodyShape, female: boolean): Prim[] {
  const s = shape.shoulder;
  const e = shape.elbow;
  const w = shape.wrist;
  const dir = new THREE.Vector3().subVectors(w, e).normalize();
  const tip = w.clone().addScaledVector(dir, 0.016);
  const k = female ? 0.8 : 1;
  return [
    // Дельтовидная мышца: округлая «шапочка» над суставом, сужается книзу к месту прикрепления.
    ellipsoid([s.x + 0.012, s.y - 0.02, 0], [0.085 * k, 0.095 * k, 0.092 * k]),
    roundCone([s.x + 0.006, s.y + 0.0, 0], lerp3(s, e, 0.42, [0.014, 0, 0]), 0.084 * k, 0.042 * k),
    roundCone(v3(s), v3(e), 0.085 * k, 0.06 * k),
    ellipsoid(lerp3(s, e, 0.45, [0, 0, 0.02]), [0.07 * k, 0.11 * k, 0.07 * k]),
    ellipsoid(lerp3(s, e, 0.45, [0.005, 0, -0.025]), [0.065 * k, 0.12 * k, 0.065 * k]),
    roundCone(v3(e), v3(w), 0.064 * k, 0.036 * k),
    ellipsoid(lerp3(e, w, 0.25, [0, 0, 0.005]), [0.064 * k, 0.1 * k, 0.058 * k]),
    // Запястье плоское, как основание ладони (ладонь смотрит к телу).
    ellipsoid(v3(tip), [0.026 * k, 0.034 * k, 0.035 * k]),
  ];
}

function legPrims(shape: BodyShape, female: boolean): Prim[] {
  const x = shape.legX;
  const hip = new THREE.Vector3(x, T - 0.06, 0);
  const knee = new THREE.Vector3(x * 1.04, 0.6, 0.02);
  const ankle = new THREE.Vector3(x * 1.06, 0.1, 0);
  const prims: Prim[] = [
    roundCone(v3(hip), v3(knee), female ? 0.14 : 0.125, female ? 0.072 : 0.075),
    ellipsoid(lerp3(hip, knee, 0.4, [0, 0, 0.03]), female ? [0.1, 0.2, 0.095] : [0.1, 0.2, 0.09]),
    sphere(v3(knee), female ? 0.066 : 0.07),
    roundCone(v3(knee), v3(ankle), female ? 0.066 : 0.072, female ? 0.04 : 0.045),
    ellipsoid(lerp3(knee, ankle, 0.25, [0, 0, -0.03]), female ? [0.062, 0.11, 0.062] : [0.07, 0.12, 0.07]),
    sphere([ankle.x, 0.07, 0.01], 0.045),
  ];
  // Женская фигура: полнота бедра снаружи — линия «песочных часов».
  if (female) prims.push(ellipsoid([x + 0.055, T - 0.2, -0.01], [0.11, 0.16, 0.12]));
  return prims;
}

const anatomies = new Map<Figure, Anatomy>();

export function anatomy(figure: Figure): Anatomy {
  let a = anatomies.get(figure);
  if (a) return a;
  const female = figure === 'female';
  const shape = bodyShape(figure);
  const tp = torsoPrims(female);
  const main = blend(tp.main, 0.09);
  const detail = blend(tp.detail, 0.03);
  const carve = tp.carve;
  const torso: Field = (x, y, z) => {
    const ax = Math.abs(x);
    let d = smin(main(ax, y, z), detail(ax, y, z), female ? 0.045 : 0.03);
    for (const c of carve) d = smax(d, -c.d(ax, y, z), 0.01);
    return d;
  };
  const armF = blend(armPrims(shape, female), 0.035);
  const legF = blend(legPrims(shape, female), 0.04);
  const arm: Field = (x, y, z) => armF(Math.abs(x), y, z);
  const leg: Field = (x, y, z) => legF(Math.abs(x), y, z);
  a = {
    shape,
    torso,
    arm,
    leg,
    eval(x, y, z, out) {
      const t = torso(x, y, z);
      const r = arm(x, y, z);
      const l = leg(x, y, z);
      if (out) {
        out.torso = t;
        out.arm = r;
        out.leg = l;
      }
      return smin(smin(t, r, 0.03), l, 0.06);
    },
  };
  anatomies.set(figure, a);
  return a;
}

/** Общий шаг сетки — у всех оболочек одинаковый, поэтому одежда ложится ровно. */
export const STEP = 0.014;

const geometryCache = new Map<string, THREE.BufferGeometry>();
const pending = new Map<string, Promise<THREE.BufferGeometry>>();

/** Отмечает кэшированную геометрию, чтобы её не освобождали при пересборке героя. */
function shared(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.userData.shared = true;
  return g;
}

interface Job {
  field: Field;
  opts: MeshOptions;
}

function bodyJob(figure: Figure): Job {
  const a = anatomy(figure);
  const field: Field = (x, y, z) => a.eval(x, y, z);
  // Тени в складках кожи чуть тёплые (подповерхностное рассеяние).
  return { field, opts: { min: [-0.62, 0.04, -0.32], max: [0.62, NECK_WORLD + 0.2, 0.36], step: STEP, uv: 4, ao: { field, tint: [0.75, 1.05, 1.2] } } };
}

/** Сетка из кэша или построенная сразу (в тестах и когда ждать нельзя). */
function meshSync(key: string, job: () => Job): THREE.BufferGeometry {
  let g = geometryCache.get(key);
  if (!g) {
    const j = job();
    const gen = netsGen(j.field, j.opts);
    let r = gen.next();
    while (!r.done) r = gen.next();
    g = shared(r.value);
    geometryCache.set(key, g);
  }
  return g;
}

/** Версия построителя сеток: менять, если меняется сам алгоритм (развёртка, затенение складок). */
const MESHER_VERSION = 'r4.1';

/**
 * «Отпечаток» задания: значения поля в контрольных точках и параметры сетки.
 * Меняется при любой правке анатомии или одежды — тогда кэш устройства не используется.
 */
function fingerprint(j: Job): string {
  const { min, max } = j.opts;
  let seed = 12345;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let h = 2166136261;
  for (let i = 0; i < 160; i += 1) {
    const x = min[0] + (max[0] - min[0]) * rnd();
    const y = min[1] + (max[1] - min[1]) * rnd();
    const z = min[2] + (max[2] - min[2]) * rnd();
    const v = Math.round(j.field(x, y, z) * 1e5);
    h = Math.imul(h ^ (v & 0xffff), 16777619);
    h = Math.imul(h ^ ((v >>> 16) & 0xffff), 16777619);
  }
  const extra = JSON.stringify([MESHER_VERSION, j.opts.step, j.opts.uv, j.opts.ao?.tint, j.opts.ao?.strength]);
  for (let i = 0; i < extra.length; i += 1) h = Math.imul(h ^ extra.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Сетка из кэша устройства или построенная порциями без подвисания интерфейса. */
function meshAsync(key: string, job: () => Job): Promise<THREE.BufferGeometry> {
  const hit = geometryCache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      try {
        const j = job();
        const storeKey = `${key}|${fingerprint(j)}`;
        const stored = await loadMesh(storeKey);
        const g = stored ?? (await runSliced(netsGen(j.field, j.opts)));
        if (!stored) saveMesh(storeKey, `${key}|`, g);
        const out = geometryCache.get(key) ?? shared(g);
        geometryCache.set(key, out);
        return out;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, p);
  }
  return p;
}

export function bodyGeometry(figure: Figure): THREE.BufferGeometry {
  return meshSync(`${figure}|body`, () => bodyJob(figure));
}

// ─── Одежда ────────────────────────────────────────────────────────────

export const GARMENT_IDS = [
  'tee',
  'tee_fitted',
  'tee_long',
  'tank',
  'sports_bra',
  'crop_top',
  'vest',
  'cuirass',
  'mail',
  'robe_top',
  'breastplate',
  'pants',
  'leggings',
  'shorts',
  'briefs',
  'bracers',
  'greaves',
  'mantle',
] as const;
export type GarmentId = (typeof GARMENT_IDS)[number];

interface GarmentSpec {
  off: number;
  min: V3;
  max: V3;
  /** Маска области (< 0 — внутри). p — расстояния до частей тела. */
  mask(x: number, y: number, z: number, p: Parts): number;
}

const slab = (y: number, lo: number, hi: number): number => Math.max(lo - y, y - hi);

function specs(figure: Figure): Record<GarmentId, GarmentSpec> {
  const female = figure === 'female';
  const shape = bodyShape(figure);
  const s = shape.shoulder;
  const e = shape.elbow;
  const w = shape.wrist;
  const up = new THREE.Vector3().subVectors(e, s);
  const upLen = up.length();
  up.normalize();
  const fore = new THREE.Vector3().subVectors(w, e);
  const foreLen = fore.length();
  fore.normalize();
  /** Где вдоль плеча (0 — плечевой сустав, 1 — локоть). */
  const tUp = (x: number, y: number, z: number): number => ((Math.abs(x) - s.x) * up.x + (y - s.y) * up.y + (z - s.z) * up.z) / upLen;
  const tFore = (x: number, y: number, z: number): number => ((Math.abs(x) - e.x) * fore.x + (y - e.y) * fore.y + (z - e.z) * fore.z) / foreLen;
  // Принадлежность части тела: что ближе — корпус, рука или нога.
  const torsoOnly = (p: Parts): number => p.torso - Math.min(p.arm, p.leg) - 0.004;
  const armOnly = (p: Parts): number => p.arm - p.torso + 0.004;
  const notArm = (p: Parts): number => Math.min(p.torso, p.leg) - p.arm - 0.004;
  const legOrHips = (p: Parts): number => Math.min(p.torso, p.leg) - p.arm;
  const neck = ellipsoid([0, T + 0.66, 0.02], [0.105, 0.09, 0.14]);
  const scoop = ellipsoid([0, T + 0.64, 0.13], [0.12, 0.13, 0.18]);
  const backScoop = ellipsoid([0, T + 0.64, -0.14], [0.11, 0.1, 0.12]);
  const armhole = ellipsoid([0.27, T + 0.52, 0], [0.07, 0.12, 0.16]);
  const braFront = ellipsoid([0, T + 0.6, 0.17], [0.07, 0.13, 0.12]);
  const cleavage = ellipsoid([0, T + 0.56, 0.2], [0.045, 0.11, 0.1]);
  /** Вырез «лодочкой» спереди, и шея открыта со всех сторон. */
  const scooped = (shrink: number) => (x: number, y: number, z: number): number => Math.min(neck.d(x, y, z), scoop.d(x, y, z) + shrink);
  const torsoBox: [V3, V3] = [
    [-0.46, T - 0.3, -0.3],
    [0.46, NECK_WORLD + 0.05, 0.34],
  ];
  const fullBox: [V3, V3] = [
    [-0.64, T - 0.32, -0.32],
    [0.64, NECK_WORLD + 0.05, 0.36],
  ];
  const strapF = polyline([
    [0.07, T + 0.5, 0.16],
    [0.12, T + 0.6, 0.06],
    [0.13, T + 0.63, -0.03],
    [0.05, T + 0.46, -0.15],
  ]);
  const halter = polyline([
    [0.05, T + 0.5, 0.15],
    [0.065, T + 0.63, 0.06],
    [0.05, T + 0.7, -0.03],
    [0, T + 0.68, -0.07],
  ]);
  const top = (lo: number, sleeve: number | null, neckHole: (x: number, y: number, z: number) => number) => (x: number, y: number, z: number, p: Parts) => {
    const body = Math.max(slab(y, lo, NECK_WORLD), notArm(p), -neckHole(Math.abs(x), y, z));
    if (sleeve === null) return body;
    const arm = Math.max(armOnly(p), sleeve <= 1 ? (tUp(x, y, z) - sleeve) * upLen : (tFore(x, y, z) - (sleeve - 1)) * foreLen);
    return Math.min(body, arm);
  };
  return {
    tee: { off: 0.016, min: fullBox[0], max: fullBox[1], mask: top(T - 0.03, 0.42, (x, y, z) => neck.d(x, y, z)) },
    tee_fitted: { off: 0.014, min: fullBox[0], max: fullBox[1], mask: top(T - 0.02, 0.36, scooped(0.04)) },
    tee_long: { off: 0.02, min: [-0.66, T - 0.36, -0.32], max: fullBox[1], mask: top(T - 0.06, 1.9, (x, y, z) => neck.d(x, y, z)) },
    robe_top: { off: 0.022, min: [-0.66, T - 0.36, -0.32], max: fullBox[1], mask: top(T - 0.1, 1.9, scooped(0.02)) },
    mail: { off: 0.026, min: fullBox[0], max: fullBox[1], mask: top(T - 0.2, 0.85, (x, y, z) => neck.d(x, y, z) - 0.01) },
    tank: {
      off: 0.015,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => Math.max(slab(y, T - 0.04, NECK_WORLD), notArm(p), -scoop.d(Math.abs(x), y, z), -backScoop.d(Math.abs(x), y, z), -armhole.d(Math.abs(x), y, z)),
    },
    sports_bra: {
      off: 0.013,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        const band = Math.max(slab(y, T + 0.27, T + 0.52), torsoOnly(p), -braFront.d(ax, y, z), -backScoop.d(ax, y, z) + 0.03);
        return Math.min(band, Math.max(strapF(ax, y, z) - 0.026, torsoOnly(p)));
      },
    },
    crop_top: { off: 0.013, min: fullBox[0], max: fullBox[1], mask: top(T + 0.24, 0.22, scooped(0.05)) },
    vest: {
      off: 0.026,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        const open = Math.max(ax - (0.035 + Math.max(0, y - (T + 0.25)) * 0.45), -z);
        return Math.max(slab(y, T - 0.06, NECK_WORLD), torsoOnly(p) + 0.006, -open, -neck.d(ax, y, z) + 0.02, -armhole.d(ax, y, z));
      },
    },
    cuirass: {
      off: 0.034,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => Math.max(slab(y, T - 0.04, NECK_WORLD), torsoOnly(p), -neck.d(Math.abs(x), y, z) + 0.01),
    },
    breastplate: {
      off: 0.024,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        // Широкая полоса спереди (закрывает грудь целиком, с ложбинкой посередине) сужается к спине.
        const k = Math.min(1, Math.max(0, (z + 0.1) / 0.15));
        const bandY = Math.abs(y - (T + 0.35 + 0.025 * k)) - (0.05 + 0.075 * k);
        const cups = Math.max(bandY, torsoOnly(p), -cleavage.d(ax, y, z));
        return Math.min(cups, Math.max(halter(ax, y, z) - 0.022, torsoOnly(p)));
      },
    },
    pants: { off: 0.012, min: [-0.42, 0.1, -0.32], max: [0.42, T + 0.08, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, 0.13, T + 0.04), notArm(p)) },
    leggings: { off: 0.009, min: [-0.42, 0.1, -0.32], max: [0.42, T + 0.1, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, 0.13, T + 0.06), notArm(p)) },
    shorts: { off: 0.011, min: [-0.42, 0.7, -0.32], max: [0.42, T + 0.08, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, female ? 0.84 : 0.76, T + 0.03), notArm(p)) },
    briefs: { off: 0.012, min: [-0.42, T - 0.36, -0.32], max: [0.42, T + 0.06, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, T - 0.25, T + 0.01), legOrHips(p)) },
    bracers: {
      off: 0.024,
      min: [-0.64, T - 0.32, -0.2],
      max: [0.64, T + 0.25, 0.2],
      mask: (x, y, z, p) => Math.max(armOnly(p), (0.32 - tFore(x, y, z)) * foreLen, (tFore(x, y, z) - 0.95) * foreLen),
    },
    // Накидка капюшона: лежит на плечах поверх любой одежды, вокруг шеи — свободный вырез.
    mantle: {
      off: 0.042,
      min: [-0.62, T + 0.24, -0.34],
      max: [0.62, NECK_WORLD + 0.08, 0.38],
      mask: (x, y, z) => Math.max(T + 0.36 + 0.03 * Math.min(1, Math.abs(x) / 0.3) - y, -(neck.d(Math.abs(x), y, z) - 0.025)),
    },
    greaves: {
      off: 0.02,
      min: [-0.36, 0.25, -0.24],
      max: [0.36, 0.62, 0.26],
      mask: (_x, y, z, p) => Math.max(slab(y, 0.32, 0.56), p.leg - p.torso, -z - 0.02),
    },
  };
}

const specCache = new Map<Figure, Record<GarmentId, GarmentSpec>>();

function garmentJob(figure: Figure, id: GarmentId): Job {
  let sp = specCache.get(figure);
  if (!sp) {
    sp = specs(figure);
    specCache.set(figure, sp);
  }
  const spec = sp[id];
  const a = anatomy(figure);
  const parts: Parts = { torso: 0, arm: 0, leg: 0 };
  const field: Field = (x, y, z) => {
    const d = a.eval(x, y, z, parts) - spec.off;
    // Снаружи оболочки маска не нужна: значение и так положительное.
    if (d > 0.05) return d;
    // Плавное пересечение — край одежды скруглён, как подогнутый шов, и сетка без «лесенки».
    return smax(d, spec.mask(x, y, z, parts), 0.009);
  };
  const aoField: Field = (x, y, z) => a.eval(x, y, z) - spec.off;
  return { field, opts: { min: spec.min, max: spec.max, step: STEP, uv: 4, ao: { field: aoField, strength: 0.8 } } };
}

/** На сколько слой одежды выступает над кожей. */
export function garmentOffset(figure: Figure, id: GarmentId): number {
  let sp = specCache.get(figure);
  if (!sp) {
    sp = specs(figure);
    specCache.set(figure, sp);
  }
  return sp[id].off;
}

export function garmentGeometry(figure: Figure, id: GarmentId): THREE.BufferGeometry {
  return meshSync(`${figure}|${id}`, () => garmentJob(figure, id));
}

/** Есть ли уже готовые сетки тела и одежды (тогда героя можно собрать сразу). */
export function isPrepared(figure: Figure, garments: readonly GarmentId[]): boolean {
  return geometryCache.has(`${figure}|body`) && garments.every((g) => geometryCache.has(`${figure}|${g}`));
}

/** Заранее строит тело (если body) и одежду порциями, не блокируя интерфейс. */
export async function prepare(figure: Figure, garments: readonly GarmentId[], body = true): Promise<void> {
  if (body) await meshAsync(`${figure}|body`, () => bodyJob(figure));
  for (const g of garments) await meshAsync(`${figure}|${g}`, () => garmentJob(figure, g));
}

// ─── Измерения тела (для поясов, швов, юбок) ──────────────────────────

/** Передняя поверхность тела в точке (x, y): z, где начинается кожа (+ отступ). */
export function frontZ(figure: Figure, x: number, y: number, off = 0): number {
  const a = anatomy(figure);
  let z = 0.45;
  while (z > -0.1 && a.torso(x, y, z) - off > 0) z -= 0.004;
  // Уточнение.
  let lo = z;
  let hi = z + 0.004;
  for (let i = 0; i < 8; i += 1) {
    const m = (lo + hi) / 2;
    if (a.torso(x, y, m) - off > 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

export interface Section {
  /** Половина ширины корпуса. */
  wx: number;
  zFront: number;
  zBack: number;
}

const sectionCache = new Map<string, Section>();

/** Сечение корпуса (вместе с бёдрами) на высоте y — для ремней и юбок. */
export function section(figure: Figure, y: number): Section {
  const key = `${figure}|${y.toFixed(3)}`;
  const hit = sectionCache.get(key);
  if (hit) return hit;
  const a = anatomy(figure);
  const field = (x: number, z: number): number => Math.min(a.torso(x, y, z), a.leg(x, y, z));
  const march = (fx: number, fz: number, from: [number, number]): number => {
    let t = 0;
    while (t < 0.6 && field(from[0] + fx * t, from[1] + fz * t) < 0) t += 0.003;
    return t;
  };
  const zFront = march(0, 1, [0, 0]);
  const zBack = -march(0, -1, [0, 0]);
  const zc = (zFront + zBack) / 2;
  const wx = march(1, 0, [0, zc]);
  const s = { wx, zFront, zBack };
  sectionCache.set(key, s);
  return s;
}

/** Наружная сторона ноги на высоте y (для лампасов): x, где кончается нога (+ отступ). */
export function legOuterX(figure: Figure, y: number, off = 0): number {
  const a = anatomy(figure);
  const shape = a.shape;
  let x = shape.legX;
  while (x < 0.6 && a.leg(x, y, 0) - off < 0) x += 0.003;
  return x;
}

// ─── Детали поверх одежды: швы, пояса, юбки ──────────────────────────

/** Точка на передней поверхности корпуса (или одежды с отступом off). */
export function onTorso(shape: BodyShape, x: number, worldY: number, off = 0.02, lift = 0.006): THREE.Vector3 {
  return new THREE.Vector3(x, worldY, frontZ(shape.figure, x, worldY, off) + lift);
}

/** Пояс-кольцо по сечению тела на высоте y. */
export function band(shape: BodyShape, worldY: number, tube: number, m: THREE.Material, off = 0.03): THREE.Mesh {
  const s = section(shape.figure, worldY);
  const rx = s.wx + off;
  const rz = (s.zFront - s.zBack) / 2 + off;
  const geo = new THREE.TorusGeometry(rx, tube, 10, 64);
  geo.rotateX(Math.PI / 2);
  const me = new THREE.Mesh(geo, m);
  me.position.set(0, worldY, (s.zFront + s.zBack) / 2);
  me.scale.set(1, 1, rz / rx);
  return me;
}

/** Юбка или подол от талии вниз: профиль (радиус, высота от талии), растянутый по бёдрам героя. */
export function skirt(shape: BodyShape, m: THREE.Material, pts: Array<[number, number]>, grow = 1.03): THREE.Mesh {
  const hipY = -0.1;
  const s = section(shape.figure, TORSO_Y + hipY);
  // Радиус профиля на высоте бёдер.
  let rh = pts[0]![0];
  for (let i = 1; i < pts.length; i += 1) {
    const [r0, y0] = pts[i - 1]!;
    const [r1, y1] = pts[i]!;
    if (hipY <= y0 && hipY >= y1) {
      rh = r0 + ((r1 - r0) * (hipY - y0)) / (y1 - y0);
      break;
    }
  }
  const sx = Math.max(grow, (s.wx + 0.03) / rh);
  const sz = Math.max(grow * 0.7, ((s.zFront - s.zBack) / 2 + 0.03) / rh);
  // Профиль задан сверху вниз, а LatheGeometry строит внешние грани для профиля снизу вверх.
  const prof = [...pts].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const me = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), m);
  me.position.set(0, TORSO_Y, (s.zFront + s.zBack) / 2);
  me.scale.set(sx, 1, sz);
  return me;
}
