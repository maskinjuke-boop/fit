import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { NECK_WORLD, TORSO_Y, bodyShape, type BodyShape } from './body';
import { bodyFistDeltas, bodyRenderGeometry, bodySdf, bodySdfAsync, landmarks } from './bodyMesh';
export { landmarks };
import { loadMesh, saveMesh } from './meshStore';
import { ellipsoid, netsGen, polyline, runSliced, smax, type Field, type MeshOptions, type V3 } from './sdf';

/**
 * Анатомия героя: тело — готовая модель MakeHuman (см. bodyMesh), поле расстояний до неё
 * разделено на три части — корпус, руки и ноги. Одежда — оболочки того же тела с маской
 * области (футболка, топ, брюки…), поэтому сидит по фигуре.
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

const anatomies = new Map<Figure, Anatomy>();

export function anatomy(figure: Figure): Anatomy {
  let a = anatomies.get(figure);
  if (a) return a;
  const sdf = bodySdf(figure);
  const tmp: Parts = { torso: 0, arm: 0, leg: 0 };
  a = {
    shape: bodyShape(figure),
    torso: (x, y, z) => (sdf.parts(x, y, z, tmp), tmp.torso),
    arm: (x, y, z) => (sdf.parts(x, y, z, tmp), tmp.arm),
    leg: (x, y, z) => (sdf.parts(x, y, z, tmp), tmp.leg),
    eval: (x, y, z, out) => (out ? sdf.parts(x, y, z, out) : sdf.d(x, y, z)),
  };
  anatomies.set(figure, a);
  return a;
}

/** Поле расстояний строится порциями заранее (затем anatomy() берёт его из кэша). */
const anatomyAsync = (figure: Figure): Promise<unknown> => bodySdfAsync(figure, (g) => runSliced(g));

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
const MESHER_VERSION = 'mh1';

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

/** Затенение складок кожи по полю расстояний: шаги от поверхности вдоль нормали. */
function aoAt(figure: Figure): (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number {
  const a = anatomy(figure);
  return (x, y, z, nx, ny, nz) => {
    let occ = 0;
    let sca = 1;
    for (let i = 1; i <= 4; i += 1) {
      const hh = 0.01 + 0.028 * i;
      occ += Math.max(0, hh - a.eval(x + nx * hh, y + ny * hh, z + nz * hh)) * sca;
      sca *= 0.7;
    }
    return Math.min(1, Math.max(0.3, 1 - occ * 4.2));
  };
}

/** Тело; grips — какие кисти сжаты (держат предмет): [правая, левая]. */
export function bodyGeometry(figure: Figure, grips: readonly [boolean, boolean] = [false, false]): THREE.BufferGeometry {
  const key = grips[0] || grips[1] ? `${figure}|body|${+grips[0]}${+grips[1]}` : `${figure}|body`;
  let g = geometryCache.get(key);
  if (!g) {
    g = shared(bodyRenderGeometry(figure, aoAt(figure), grips));
    geometryCache.set(key, g);
  }
  return g;
}

/** Морф-цели «кисть сжата» для сетки тела: сдвиг вершин и нормалей, [правая, левая]. */
export interface FistMorph {
  pos: [Float32Array, Float32Array];
  nor: [Float32Array, Float32Array];
}
const fistCache = new Map<string, FistMorph>();

/**
 * Сжатие в кулак кистей, разжатых в bodyGeometry(figure, grips), — для предметов на время
 * действия. Нормали меняются только у вершин кисти и их соседей (шов шеи не трогается).
 */
export function fistMorph(figure: Figure, grips: readonly [boolean, boolean]): FistMorph {
  const key = `${figure}|${+grips[0]}${+grips[1]}`;
  const hit = fistCache.get(key);
  if (hit) return hit;
  const geo = bodyGeometry(figure, grips);
  const pos = geo.getAttribute('position').array as Float32Array;
  const n0 = geo.getAttribute('normal');
  const index = geo.index!;
  const [dr, dl] = bodyFistDeltas(figure, grips);
  const fist = Float32Array.from(pos, (v, i) => v + dr[i]! + dl[i]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(fist, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const n1 = g.getAttribute('normal');
  // Вершины, которые двигаются, и их соседи — у них меняется нормаль.
  const n = pos.length / 3;
  const moved = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (Math.abs(dr[i * 3]!) + Math.abs(dr[i * 3 + 1]!) + Math.abs(dr[i * 3 + 2]!) + Math.abs(dl[i * 3]!) + Math.abs(dl[i * 3 + 1]!) + Math.abs(dl[i * 3 + 2]!) > 1e-6) moved[i] = 1;
  const ring = new Uint8Array(n);
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    if (moved[a] || moved[b] || moved[c]) ring[a] = ring[b] = ring[c] = 1;
  }
  const nr = new Float32Array(pos.length);
  const nl = new Float32Array(pos.length);
  for (let i = 0; i < n; i += 1) {
    if (!ring[i]) continue;
    const out = pos[i * 3]! < 0 ? nr : nl;
    out[i * 3] = n1.getX(i) - n0.getX(i);
    out[i * 3 + 1] = n1.getY(i) - n0.getY(i);
    out[i * 3 + 2] = n1.getZ(i) - n0.getZ(i);
  }
  g.dispose();
  const m: FistMorph = { pos: [dr, dl], nor: [nr, nl] };
  fistCache.set(key, m);
  return m;
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
  'boots',
  'sneakers',
  'sole',
  'sandals',
  // Откровенные и облегающие вещи (новые предметы).
  'bikini_top',
  'tube_top',
  'bikini_bottom',
  'micro_shorts',
  'corset',
  'stockings',
  'harness',
  'bodysuit',
  'thigh_boots',
  'knee_boots',
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
  const L = landmarks(figure);
  const a = anatomy(figure);
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
  /** Точка, перенесённая на кожу (с отступом off) по полю расстояний. */
  const onSkin = (p: V3, off = 0): V3 => {
    let [x, y, z] = p;
    const h = 0.004;
    for (let i = 0; i < 12; i += 1) {
      const d = a.torso(x, y, z) - off;
      const gx = a.torso(x + h, y, z) - a.torso(x - h, y, z);
      const gy = a.torso(x, y + h, z) - a.torso(x, y - h, z);
      const gz = a.torso(x, y, z + h) - a.torso(x, y, z - h);
      const gl = Math.hypot(gx, gy, gz) || 1;
      x -= (d * gx) / gl;
      y -= (d * gy) / gl;
      z -= (d * gz) / gl;
    }
    return [x, y, z];
  };
  // Принадлежность части тела: что ближе — корпус, рука или нога.
  const torsoOnly = (p: Parts): number => p.torso - Math.min(p.arm, p.leg) - 0.004;
  const armOnly = (p: Parts): number => p.arm - p.torso + 0.004;
  const notArm = (p: Parts): number => Math.min(p.torso, p.leg) - p.arm - 0.004;
  const legOrHips = (p: Parts): number => Math.min(p.torso, p.leg) - p.arm;
  const legOnly = (p: Parts): number => p.leg - Math.min(p.torso, p.arm) + 0.004;
  // Шея и вырезы — по сечению шеи модели.
  // Основание шеи — чуть выше ключиц (сустав шеи модели выше, у затылка).
  const neckY = L.clavicle[1] + 0.035;
  const ns = section(figure, neckY + 0.02);
  const nz = (ns.zFront + ns.zBack) / 2;
  const neck = ellipsoid([0, neckY + 0.04, nz + 0.01], [ns.wx + 0.03, 0.075, (ns.zFront - ns.zBack) / 2 + 0.045]);
  const bs = section(figure, neckY - 0.03);
  // Грудь: у женской фигуры — по соску модели, у мужской — по грудным мышцам.
  const nip: V3 = L.nipple ? [L.nipple[0], L.nipple[1], L.nipple[2]] : [0.1, L.armpit - 0.07, 0.12];
  const scoop = ellipsoid([0, neckY - 0.01, bs.zFront + 0.03], [0.12, 0.13, 0.16]);
  const backScoop = ellipsoid([0, neckY - 0.01, bs.zBack - 0.01], [0.11, 0.1, 0.12]);
  const armhole = ellipsoid([s.x - 0.04, s.y - 0.01, s.z], [0.085, 0.13, 0.17]);
  // Чашка купальника — треугольник вокруг соска (у мужской фигуры — условная точка).
  const cupShape = ellipsoid([nip[0], nip[1] + 0.005, nip[2] - 0.03], female ? [0.072, 0.075, 0.12] : [0.06, 0.06, 0.1]);
  const braFront = ellipsoid([0, nip[1] + 0.19, nip[2] + 0.05], [0.06, 0.12, 0.12]);
  const cleavage = ellipsoid([0, nip[1] + 0.17, nip[2] + 0.06], [0.04, 0.1, 0.1]);
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
  const shoulderTop = (k: number): V3 => onSkin([0.07 + (s.x - 0.09) * k, neckY + 0.02, nz - 0.01]);
  const strapF = polyline([
    onSkin([nip[0] - 0.07, nip[1] + 0.13, nip[2]]),
    onSkin([nip[0] - 0.045, nip[1] + 0.24, nip[2] - 0.02]),
    shoulderTop(0.45),
    onSkin([0.1, nip[1] + 0.2, -0.2]),
    onSkin([0.05, nip[1] + 0.06, -0.2]),
  ]);
  const halter = polyline([onSkin([0.045, nip[1] + 0.12, nip[2]]), onSkin([0.05, nip[1] + 0.24, nip[2] - 0.03]), shoulderTop(0.1), onSkin([0, neckY - 0.03, -0.2])]);
  const top = (lo: number, sleeve: number | null, neckHole: (x: number, y: number, z: number) => number) => (x: number, y: number, z: number, p: Parts) => {
    const body = Math.max(slab(y, lo, NECK_WORLD), notArm(p), -neckHole(Math.abs(x), y, z));
    if (sleeve === null) return body;
    const arm = Math.max(armOnly(p), sleeve <= 1 ? (tUp(x, y, z) - sleeve) * upLen : (tFore(x, y, z) - (sleeve - 1)) * foreLen);
    return Math.min(body, arm);
  };
  const ankle = L.ankle[1];
  const knee = L.knee[1];
  const shoeBox: [V3, V3] = [
    [-0.42, -0.06, -0.3],
    [0.42, ankle + 0.33, 0.36],
  ];
  const shoe = (topY: number) => (_x: number, y: number, _z: number, p: Parts): number => Math.max(y - topY, legOnly(p));
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
        // Спереди лиф закрывает грудь, сзади — узкая полоса под лопатками.
        const back = Math.min(1, Math.max(0, (nip[2] - 0.08 - z) / 0.2));
        const band = Math.max(slab(y, nip[1] - 0.11, nip[1] + 0.16 - 0.1 * back), torsoOnly(p), -braFront.d(ax, y, z));
        return Math.min(band, Math.max(strapF(ax, y, z) - 0.03, torsoOnly(p)));
      },
    },
    crop_top: { off: 0.013, min: fullBox[0], max: fullBox[1], mask: top(nip[1] - 0.13, 0.22, scooped(0.05)) },
    vest: {
      off: 0.026,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        const open = Math.max(ax - (0.035 + Math.max(0, y - (nip[1] - 0.1)) * 0.45), -z);
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
        const bandY = Math.abs(y - (nip[1] - 0.01 + 0.025 * k)) - (0.05 + 0.08 * k);
        const cups = Math.max(bandY, torsoOnly(p), -cleavage.d(ax, y, z));
        return Math.min(cups, Math.max(halter(ax, y, z) - 0.022, torsoOnly(p)));
      },
    },
    pants: { off: 0.012, min: [-0.46, 0.0, -0.32], max: [0.46, T + 0.08, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, ankle + 0.06, T + 0.04), notArm(p)) },
    leggings: { off: 0.009, min: [-0.46, 0.0, -0.32], max: [0.46, T + 0.1, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, ankle + 0.07, T + 0.06), notArm(p)) },
    shorts: { off: 0.011, min: [-0.46, knee, -0.32], max: [0.46, T + 0.08, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, knee + (female ? 0.2 : 0.14), T + 0.03), notArm(p)) },
    briefs: { off: 0.012, min: [-0.46, L.crotch - 0.12, -0.32], max: [0.46, T + 0.06, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, L.crotch - 0.04, T - 0.02), legOrHips(p)) },
    bracers: {
      off: 0.024,
      min: [-0.64, w.y - 0.1, -0.2],
      max: [0.64, e.y + 0.1, 0.2],
      mask: (x, y, z, p) => Math.max(armOnly(p), (0.32 - tFore(x, y, z)) * foreLen, (tFore(x, y, z) - 0.95) * foreLen),
    },
    // Накидка капюшона: лежит на плечах поверх любой одежды, вокруг шеи — свободный вырез.
    mantle: {
      off: 0.042,
      min: [-0.62, s.y - 0.3, -0.34],
      max: [0.62, NECK_WORLD + 0.08, 0.38],
      mask: (x, y, z) => Math.max(s.y - 0.16 + 0.03 * Math.min(1, Math.abs(x) / 0.3) - y, -(neck.d(Math.abs(x), y, z) - 0.025)),
    },
    greaves: {
      off: 0.02,
      min: [-0.4, knee - 0.4, -0.24],
      max: [0.4, knee, 0.26],
      mask: (_x, y, z, p) => Math.max(slab(y, knee - 0.3, knee - 0.05), p.leg - p.torso, L.knee[2] - z - 0.02),
    },
    boots: { off: 0.014, min: shoeBox[0], max: shoeBox[1], mask: shoe(ankle + 0.27) },
    sneakers: { off: 0.012, min: shoeBox[0], max: shoeBox[1], mask: shoe(ankle + 0.045) },
    sole: { off: 0.022, min: shoeBox[0], max: [0.42, 0.08, 0.36], mask: shoe(0.028) },
    // Купальный лиф: треугольные чашки, завязки под грудью и на шее (у мужской фигуры не используется).
    bikini_top: {
      off: 0.011,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        const cup = cupShape.d(ax, y, z);
        const string = Math.max(Math.abs(y - (nip[1] - 0.075)) - 0.008, -0.02 - cup * 0);
        return Math.max(Math.min(cup, string, halter(ax, y, z) - 0.008), torsoOnly(p));
      },
    },
    // Бандо: полоса ткани вокруг груди без бретелей.
    tube_top: { off: 0.012, min: torsoBox[0], max: torsoBox[1], mask: (_x, y, _z, p) => Math.max(slab(y, nip[1] - 0.085, nip[1] + 0.07), torsoOnly(p)) },
    // Плавки с высоким вырезом на бёдрах: спереди ниже пупка, по бокам выше.
    bikini_bottom: {
      off: 0.011,
      min: [-0.46, L.crotch - 0.12, -0.32],
      max: [0.46, T + 0.06, 0.32],
      mask: (x, y, _z, p) => {
        const ax = Math.abs(x);
        const lo = L.crotch - 0.035 + Math.max(0, ax - 0.035) * 1.15;
        return Math.max(slab(y, lo, T - 0.1 + Math.min(0.05, ax * 0.3)), legOrHips(p));
      },
    },
    micro_shorts: { off: 0.012, min: [-0.46, L.crotch - 0.15, -0.32], max: [0.46, T + 0.06, 0.32], mask: (_x, y, _z, p) => Math.max(slab(y, L.crotch - 0.075, T - 0.03), notArm(p)) },
    // Корсет: от талии до груди, поверх топа.
    corset: { off: 0.02, min: torsoBox[0], max: torsoBox[1], mask: (_x, y, _z, p) => Math.max(slab(y, T - 0.07, nip[1] - 0.07), torsoOnly(p)) },
    // Чулки: стопа и нога до середины бедра.
    stockings: { off: 0.005, min: [-0.42, -0.06, -0.3], max: [0.42, knee + 0.3, 0.36], mask: (_x, y, _z, p) => Math.max(y - (knee + 0.24), legOnly(p)) },
    // Портупея: ремни крест-накрест на груди и спине, ошейник и пояс.
    harness: {
      off: 0.022,
      min: torsoBox[0],
      max: torsoBox[1],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        const line = (x0: number, y0: number, x1: number, y1: number): number => {
          const dx = x1 - x0;
          const dy = y1 - y0;
          const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) - 0.011;
        };
        const cross = Math.min(line(s.x - 0.07, neckY - 0.03, -0.14, T + 0.06), line(-(s.x - 0.07), neckY - 0.03, 0.14, T + 0.06));
        const belt = Math.abs(y - (T + 0.05)) - 0.016;
        const collar = Math.max(Math.abs(y - (neckY - 0.035)) - 0.011, ax - 0.13);
        const front = Math.max(ax - 0.009, slab(y, nip[1] - 0.02, neckY - 0.03), -z);
        return Math.max(Math.min(cross, belt, collar, front), torsoOnly(p));
      },
    },
    // Слитный купальник: открытые плечи, глубокий вырез и высокий вырез на бёдрах.
    bodysuit: {
      off: 0.011,
      min: [-0.46, L.crotch - 0.12, -0.32],
      max: [0.46, NECK_WORLD + 0.05, 0.34],
      mask: (x, y, z, p) => {
        const ax = Math.abs(x);
        const upper = Math.max(slab(y, T - 0.12, NECK_WORLD), notArm(p), -scoop.d(ax, y, z) + 0.015, -backScoop.d(ax, y, z) - 0.02, -armhole.d(ax, y, z));
        const lo = L.crotch - 0.035 + Math.max(0, ax - 0.035) * 1.25;
        const lower = Math.max(slab(y, lo, T), legOrHips(p));
        return Math.min(upper, lower);
      },
    },
    thigh_boots: { off: 0.016, min: [-0.42, -0.06, -0.3], max: [0.42, knee + 0.3, 0.36], mask: shoe(knee + 0.22) },
    knee_boots: { off: 0.015, min: [-0.42, -0.06, -0.3], max: [0.42, knee + 0.1, 0.36], mask: shoe(knee - 0.03) },
    sandals: {
      off: 0.01,
      min: shoeBox[0],
      max: shoeBox[1],
      mask: (_x, y, z, p) => {
        // Ремешки: вокруг щиколотки, над подъёмом и поперёк стопы, плюс шнуровка по голени.
        const ring1 = Math.abs(y - (ankle + 0.005)) - 0.012;
        const ring2 = Math.abs(y - (ankle + 0.17)) - 0.01;
        const ring3 = Math.abs(y - (ankle + 0.1)) - 0.01;
        const instep = Math.max(Math.abs(z - (L.toe[2] + 0.03)) - 0.013, y - ankle);
        return Math.max(Math.min(ring1, ring2, ring3, instep), legOnly(p));
      },
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
  await anatomyAsync(figure);
  if (body) bodyGeometry(figure);
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
  // Кольцо повторяет сечение тела (поясница вогнута, живот и ягодицы выпуклые).
  const a = anatomy(shape.figure);
  const s = section(shape.figure, worldY);
  const zc = (s.zFront + s.zBack) / 2;
  const f = (x: number, z: number): number => Math.min(a.torso(x, worldY, z), a.leg(x, worldY, z)) - off;
  const N = 72;
  const r: number[] = [];
  for (let i = 0; i < N; i += 1) {
    const t = (i / N) * Math.PI * 2;
    const dx = Math.sin(t);
    const dz = Math.cos(t);
    let q = 0.02;
    while (q < 0.7 && f(dx * q, zc + dz * q) < 0) q += 0.004;
    r.push(q);
  }
  // Сглаживание по кругу — без мелких изломов.
  const sm = r.map((_, i) => (r[(i + N - 2) % N]! + 2 * r[(i + N - 1) % N]! + 3 * r[i]! + 2 * r[(i + 1) % N]! + r[(i + 2) % N]!) / 9);
  const pts = sm.map((q, i) => {
    const t = (i / N) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(t) * q, worldY, zc + Math.cos(t) * q);
  });
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 144, tube, 10, true);
  return new THREE.Mesh(geo, m);
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
