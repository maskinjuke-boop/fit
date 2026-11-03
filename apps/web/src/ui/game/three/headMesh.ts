import * as THREE from 'three';
import type { FacePart } from '../../../game/state';
import { HEAD_DATA } from './headData';

/**
 * Готовая модель головы из MakeHuman (makehumancommunity.org, лицензия CC0): женская и
 * мужская формы, мишени для ползунков лица, положение глаз и рта. Данные извлекает
 * scripts/extract-head.py. Координаты — относительно центра головы, лицо смотрит на +Z.
 */

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};
const i16 = (s: string): Int16Array => new Int16Array(bytes(s).buffer);
const u16 = (s: string): Uint16Array => new Uint16Array(bytes(s).buffer);

type Sex = 'female' | 'male';
const sexOf = (female: boolean): Sex => (female ? 'female' : 'male');

let trisCache: Uint16Array | null = null;
/** Треугольники головы (общие для обеих форм). */
export const headTris = (): Uint16Array => (trisCache ??= u16(HEAD_DATA.tris));

const baseCache = new Map<Sex, Float32Array>();
function basePositions(sex: Sex): Float32Array {
  let p = baseCache.get(sex);
  if (!p) {
    const q = i16(HEAD_DATA[sex].pos);
    const k = HEAD_DATA.scale / 32767;
    p = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 1) p[i] = q[i]! * k;
    baseCache.set(sex, p);
  }
  return p;
}

interface Delta {
  idx: Uint16Array;
  d: Float32Array;
}
const deltaCache = new Map<string, Delta>();
function delta(part: string, sign: 'p' | 'm'): Delta | null {
  const sl = (HEAD_DATA.sliders as Record<string, Record<'p' | 'm', { idx: string; d: string; sc: number }>>)[part];
  if (!sl) return null;
  const key = `${part}${sign}`;
  let out = deltaCache.get(key);
  if (!out) {
    const e = sl[sign];
    const q = i16(e.d);
    const k = e.sc / 32767;
    const d = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 1) d[i] = q[i]! * k;
    out = { idx: u16(e.idx), d };
    deltaCache.set(key, out);
  }
  return out;
}

/** Масштаб глаза (яблоко и веки) по ползунку. */
export const eyeScale = (v: number): number => 1 + 0.13 * v;

/** Сила мишеней MakeHuman при крайнем положении ползунка. */
export const SLIDER_GAIN: Partial<Record<FacePart, number>> = { faceWidth: 0.6, cheekbones: 0.7, jaw: 0.6, chin: 0.6, nose: 0.7, lips: 0.75, eyes: 1 };

/** Вершины головы с учётом черт лица (значения ползунков −1 … 1). */
export function headPositions(female: boolean, face: Record<FacePart, number>): Float32Array {
  const base = basePositions(sexOf(female));
  const parts = (Object.keys(SLIDER_GAIN) as FacePart[]).filter((k) => face[k] && k !== 'eyes');
  if (!parts.length && !face.eyes) return base;
  const p = Float32Array.from(base);
  if (face.eyes) {
    // Размер глаз: веки и глазница масштабируются вокруг центра глаза вместе с глазным яблоком.
    const { c, r } = eyeAnchor(female);
    const k = eyeScale(face.eyes) - 1;
    for (let i = 0; i < p.length; i += 3) {
      const cx = p[i]! > 0 ? c.x : -c.x;
      const dx = p[i]! - cx;
      const dy = p[i + 1]! - c.y;
      const dz = p[i + 2]! - c.z;
      const w = 1 - Math.min(1, Math.max(0, (Math.hypot(dx, dy, dz) / r - 1.25) / 0.9));
      if (w <= 0) continue;
      const s = k * w * w * (3 - 2 * w);
      p[i] = p[i]! + dx * s;
      p[i + 1] = p[i + 1]! + dy * s;
      p[i + 2] = p[i + 2]! + dz * s;
    }
  }
  for (const k of parts) {
    const val = face[k] * SLIDER_GAIN[k]!;
    const dl = delta(k, val > 0 ? 'p' : 'm');
    if (!dl) continue;
    const w = Math.abs(val);
    for (let j = 0; j < dl.idx.length; j += 1) {
      const i = dl.idx[j]! * 3;
      p[i] = p[i]! + dl.d[j * 3]! * w;
      p[i + 1] = p[i + 1]! + dl.d[j * 3 + 1]! * w;
      p[i + 2] = p[i + 2]! + dl.d[j * 3 + 2]! * w;
    }
  }
  return p;
}

let earCache: Uint8Array | null = null;
/** 1 — вершина принадлежит уху (уши не входят в «форму черепа» для волос и шапок). */
export function earMask(): Uint8Array {
  if (!earCache) {
    const packed = bytes(HEAD_DATA.ear);
    earCache = new Uint8Array(HEAD_DATA.n);
    for (let i = 0; i < HEAD_DATA.n; i += 1) earCache[i] = (packed[i >> 3]! >> (7 - (i & 7))) & 1;
  }
  return earCache;
}

const lipCache = new Map<Sex, Uint8Array>();
/** Вес губ для каждой вершины (0 … 255). */
export function lipWeights(female: boolean): Uint8Array {
  const sex = sexOf(female);
  let w = lipCache.get(sex);
  if (!w) {
    w = bytes(HEAD_DATA[sex].lip);
    lipCache.set(sex, w);
  }
  return w;
}

/** Центр левого глаза (+X) и радиус глазного яблока. */
export const eyeAnchor = (female: boolean): { c: THREE.Vector3; r: number } => {
  const e = HEAD_DATA[sexOf(female)];
  return { c: new THREE.Vector3(e.eye[0], e.eye[1], e.eye[2]), r: e.er };
};

/** Рот: высота линии смыкания губ, полуширина, выступ вперёд. */
export const mouthAnchor = (female: boolean): { y: number; w: number; z: number } => HEAD_DATA[sexOf(female)].mouth;

/**
 * Таблица радиусов поверхности по направлениям от центра (θ от макушки, φ от лица):
 * для каждой ячейки — дальнее пересечение луча с сеткой (без ушей). Треугольники
 * «растеризуются» в сетку углов, поэтому лучей проверяется немного. Пустые ячейки
 * (отверстие шеи) заполняются по соседям.
 */
export function rayRadiusTable(pos: Float32Array, NT: number, NP: number): Float32Array {
  const tris = headTris();
  const ear = earMask();
  const W = NP + 1;
  const tab = new Float32Array((NT + 1) * W);
  const dT = Math.PI / NT;
  const dP = (2 * Math.PI) / NP;
  const th = [0, 0, 0];
  const ph = [0, 0, 0];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const qv = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t]!;
    const i1 = tris[t + 1]!;
    const i2 = tris[t + 2]!;
    if (ear[i0] || ear[i1] || ear[i2]) continue;
    a.fromArray(pos, i0 * 3);
    b.fromArray(pos, i1 * 3);
    c.fromArray(pos, i2 * 3);
    let k = 0;
    for (const p of [a, b, c]) {
      const r = p.length();
      th[k] = Math.acos(Math.max(-1, Math.min(1, p.y / r)));
      ph[k] = Math.atan2(p.x, p.z);
      k += 1;
    }
    // Треугольник на шве φ = ±π — разворачиваем углы.
    if (Math.max(...ph) - Math.min(...ph) > Math.PI) for (let m = 0; m < 3; m += 1) if (ph[m]! < 0) ph[m]! += 2 * Math.PI;
    const iA = Math.max(0, Math.floor(Math.min(...th) / dT));
    const iB = Math.min(NT, Math.ceil(Math.max(...th) / dT));
    const jA = Math.floor((Math.min(...ph) + Math.PI) / dP);
    const jB = Math.ceil((Math.max(...ph) + Math.PI) / dP);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    for (let i = iA; i <= iB; i += 1) {
      const st = Math.sin(i * dT);
      const ct = Math.cos(i * dT);
      for (let jj = jA; jj <= jB; jj += 1) {
        const p0 = -Math.PI + jj * dP;
        d.set(st * Math.sin(p0), ct, st * Math.cos(p0));
        // Пересечение луча из центра с треугольником (Мёллер — Трумбор).
        pv.crossVectors(d, e2);
        const det = e1.dot(pv);
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        tv.copy(a).negate();
        const u = tv.dot(pv) * inv;
        if (u < -1e-6 || u > 1 + 1e-6) continue;
        qv.crossVectors(tv, e1);
        const w = d.dot(qv) * inv;
        if (w < -1e-6 || u + w > 1 + 1e-6) continue;
        const r = e2.dot(qv) * inv;
        if (r <= 0) continue;
        const j = ((jj % NP) + NP) % NP;
        const cell = i * W + j;
        if (r > tab[cell]!) tab[cell] = r;
      }
    }
  }
  // Последний столбец совпадает с первым (φ = π и −π).
  for (let i = 0; i <= NT; i += 1) tab[i * W + NP] = Math.max(tab[i * W + NP]!, tab[i * W]!);
  for (let i = 0; i <= NT; i += 1) tab[i * W] = tab[i * W + NP]!;
  // Пустые ячейки (место ушей, края отверстия шеи): по строке — линейно между заполненными
  // соседями по φ; строки совсем без попаданий (низ шеи) — копией строки выше.
  for (let i = 0; i <= NT; i += 1) {
    const row = i * W;
    const hit: number[] = [];
    for (let j = 0; j < NP; j += 1) if (tab[row + j]! > 0) hit.push(j);
    if (!hit.length) {
      if (i > 0) for (let j = 0; j <= NP; j += 1) tab[row + j] = tab[row - W + j]!;
      continue;
    }
    for (let h = 0; h < hit.length; h += 1) {
      const j0 = hit[h]!;
      const j1 = h + 1 < hit.length ? hit[h + 1]! : hit[0]! + NP;
      const a0 = tab[row + j0]!;
      const a1 = tab[row + (j1 % NP)]!;
      for (let j = j0 + 1; j < j1; j += 1) tab[row + (j % NP)] = a0 + ((a1 - a0) * (j - j0)) / (j1 - j0);
    }
    tab[row + NP] = tab[row]!;
  }
  // Верхний полюс: одно значение на всю строку.
  for (let i = 0; i <= NT; i += 1) if (!tab[i * W]) for (let j = 0; j <= NP; j += 1) tab[i * W + j] = tab[(i + 1) * W + j]!;
  return tab;
}

/**
 * Одно сглаживающее деление по Лупу: каждый треугольник — на четыре, вершины сдвигаются
 * к среднему соседей. Голова становится гладкой вблизи (подбородок, крылья носа, веки)
 * без лишних вершин в исходных данных. scalar — величина на вершинах (вес губ), делится линейно.
 */
export function loopSubdivide(pos: Float32Array, tris: ArrayLike<number>, scalar: Float32Array): { pos: Float32Array; tris: Uint32Array; scalar: Float32Array } {
  const n = pos.length / 3;
  const edge = new Map<number, number>();
  const opp = new Map<number, number[]>();
  const key = (a: number, b: number): number => (a < b ? a * n + b : b * n + a);
  for (let t = 0; t < tris.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = tris[t + k]!;
      const b = tris[t + ((k + 1) % 3)]!;
      const c = tris[t + ((k + 2) % 3)]!;
      const kk = key(a, b);
      const o = opp.get(kk);
      if (o) o.push(c);
      else opp.set(kk, [c]);
    }
  }
  const nE = opp.size;
  const out = new Float32Array((n + nE) * 3);
  const sc = new Float32Array(n + nE);
  // Соседи вершин и граничные вершины (край шеи).
  const nb: number[][] = Array.from({ length: n }, () => []);
  const boundary = new Uint8Array(n);
  let e = n;
  for (const [kk, o] of opp) {
    const a = Math.floor(kk / n);
    const b = kk % n;
    nb[a]!.push(b);
    nb[b]!.push(a);
    edge.set(kk, e);
    for (let c = 0; c < 3; c += 1) {
      if (o.length === 2) out[e * 3 + c] = 0.375 * (pos[a * 3 + c]! + pos[b * 3 + c]!) + 0.125 * (pos[o[0]! * 3 + c]! + pos[o[1]! * 3 + c]!);
      else out[e * 3 + c] = 0.5 * (pos[a * 3 + c]! + pos[b * 3 + c]!);
    }
    if (o.length !== 2) boundary[a] = boundary[b] = 1;
    sc[e] = 0.5 * (scalar[a]! + scalar[b]!);
    e += 1;
  }
  for (let i = 0; i < n; i += 1) {
    sc[i] = scalar[i]!;
    const m = nb[i]!.length;
    if (boundary[i] || m < 3) {
      for (let c = 0; c < 3; c += 1) out[i * 3 + c] = pos[i * 3 + c]!;
      continue;
    }
    const beta = m === 3 ? 3 / 16 : 3 / (8 * m);
    for (let c = 0; c < 3; c += 1) {
      let s = 0;
      for (const j of nb[i]!) s += pos[j * 3 + c]!;
      out[i * 3 + c] = (1 - m * beta) * pos[i * 3 + c]! + beta * s;
    }
  }
  const idx = new Uint32Array(tris.length * 4);
  let w = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t]!;
    const b = tris[t + 1]!;
    const c = tris[t + 2]!;
    const ab = edge.get(key(a, b))!;
    const bc = edge.get(key(b, c))!;
    const ca = edge.get(key(c, a))!;
    idx.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], w);
    w += 12;
  }
  return { pos: out, tris: idx, scalar: sc };
}
