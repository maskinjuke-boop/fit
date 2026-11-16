import * as THREE from 'three';
import type { FacePart } from '../../../game/state';
import { HEAD_DATA } from './headData';

/**
 * Готовая модель головы из MakeHuman (makehumancommunity.org, лицензия CC0): женская и
 * мужская формы, мишени для ползунков лица, положение глаз и рта. Данные извлекает
 * scripts/extract-mh.py. Координаты — относительно центра головы, лицо смотрит на +Z.
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

const gauss = (v: number, c: number, s: number): number => Math.exp(-(((v - c) / s) ** 2));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Полное лицо (fat 0…1): круглые щёки, шире нижняя часть лица, брыли у челюсти и второй
 * подбородок. Кольцо шеи (шов с телом) не двигается — сдвиг плавно сходит к нему на нет;
 * уши отодвигаются вместе со щеками.
 */
function fatten(p: Float32Array, female: boolean, fat: number): void {
  const ring = headRing(female).idx;
  const ears = earMask();
  const rx: number[] = [];
  for (const i of ring) rx.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
  const fixed = new Uint8Array(p.length / 3);
  for (const i of ring) fixed[i] = 1;
  const k = female ? 0.9 : 1;
  for (let i = 0; i < p.length / 3; i += 1) {
    if (fixed[i]) continue;
    const x = p[i * 3]!;
    const y = p[i * 3 + 1]!;
    const z = p[i * 3 + 2]!;
    const ax = Math.abs(x);
    const s = Math.sign(x) || 1;
    let near = 1;
    if (y < -0.18) {
      let d = 9;
      for (let j = 0; j < rx.length; j += 3) d = Math.min(d, Math.hypot(x - rx[j]!, y - rx[j + 1]!, z - rx[j + 2]!));
      near = smoothstep(0.0, 0.05, d);
    }
    if (ears[i]) {
      // Уши — целиком наружу, как щёки под ними.
      p[i * 3] = x + s * fat * 0.032 * k;
      continue;
    }
    const front = smoothstep(-0.16, 0.06, z);
    // Нижняя половина лица шире — растяжение от средней линии (гладко, без складок у рта),
    // сильнее всего на уровне щёк и челюсти; глазницы и веки не трогаем.
    const band = gauss(y, -0.15, 0.13) * smoothstep(0.01, -0.06, y);
    let dx = x * fat * 0.42 * band * front * k;
    // Брыли у углов челюсти.
    dx += s * fat * 0.018 * gauss(y, -0.24, 0.045) * smoothstep(-0.02, 0.14, z) * smoothstep(0.06, 0.13, ax) * k;
    // Круглые щёки выдаются вперёд.
    let dz = fat * 0.03 * gauss(ax, 0.1, 0.055) * gauss(y, -0.11, 0.07) * smoothstep(0.08, 0.2, z);
    let dy = 0;
    // Второй подбородок: под челюстью вперёд и вниз.
    const chin = gauss(y, -0.285, 0.04) * smoothstep(0.04, 0.2, z) * gauss(x, 0, 0.11);
    dz += fat * 0.07 * chin;
    dy -= fat * 0.022 * chin;
    // Вся голова чуть полнее и круглее сзади и сверху.
    const round = fat * 0.012 * smoothstep(-0.2, 0.05, y) * (1 - smoothstep(0.06, 0.16, z));
    const r = Math.hypot(x, z) || 1;
    dx += (x / r) * round;
    dz += (z / r) * round;
    p[i * 3] = x + dx * near;
    p[i * 3 + 1] = y + dy * near;
    p[i * 3 + 2] = z + dz * near;
  }
}

/** Вершины головы с учётом черт лица (значения ползунков −1 … 1) и полноты fat (0 … 1). */
export function headPositions(female: boolean, face: Record<FacePart, number>, fat = 0): Float32Array {
  const base = basePositions(sexOf(female));
  const parts = (Object.keys(SLIDER_GAIN) as FacePart[]).filter((k) => face[k] && k !== 'eyes');
  if (!parts.length && !face.eyes && !fat) return base;
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
  if (fat > 0) fatten(p, female, fat);
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
 * fixed — вершины, которые не двигаются (кольцо шва шеи): рёбра между ними делятся пополам,
 * поэтому шов у головы и тела после деления совпадает точно.
 */
export function loopSubdivide(pos: Float32Array, tris: ArrayLike<number>, scalar: Float32Array, fixed?: Uint8Array): { pos: Float32Array; tris: Uint32Array; scalar: Float32Array } {
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
      if (o.length === 2 && !(fixed?.[a] && fixed[b])) out[e * 3 + c] = 0.375 * (pos[a * 3 + c]! + pos[b * 3 + c]!) + 0.125 * (pos[o[0]! * 3 + c]! + pos[o[1]! * 3 + c]!);
      else out[e * 3 + c] = 0.5 * (pos[a * 3 + c]! + pos[b * 3 + c]!);
    }
    if (o.length !== 2) boundary[a] = boundary[b] = 1;
    sc[e] = 0.5 * (scalar[a]! + scalar[b]!);
    e += 1;
  }
  for (let i = 0; i < n; i += 1) {
    sc[i] = scalar[i]!;
    const m = nb[i]!.length;
    if (boundary[i] || fixed?.[i] || m < 3) {
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

/** Номера вершин кольца шва шеи (нижний край головы) и нормали в них по всей модели. */
export function headRing(female: boolean): { idx: Uint16Array; n: Float32Array } {
  return { idx: u16(HEAD_DATA.ring), n: Float32Array.from(new Int8Array(bytes(HEAD_DATA[sexOf(female)].ringN).buffer), (q) => q / 127) };
}

/**
 * Нормали вершин кольца шва (и середин рёбер между ними после деления) — одинаковые
 * у головы и тела, чтобы на шее не было линии освещения.
 */
export function applyRingNormals(geo: THREE.BufferGeometry, idx: ArrayLike<number>, n: Float32Array): number[] {
  const nor = geo.getAttribute('normal');
  const ring = new Map<number, number>();
  for (let k = 0; k < idx.length; k += 1) {
    ring.set(idx[k]!, k);
    nor.setXYZ(idx[k]!, n[k * 3]!, n[k * 3 + 1]!, n[k * 3 + 2]!);
  }
  // Середины рёбер кольца (после деления): вершина рядом с двумя вершинами кольца ровно
  // посередине между ними — нормаль как среднее нормалей концов.
  const tri = geo.index!;
  const pos = geo.getAttribute('position');
  const near = new Map<number, Set<number>>();
  for (let t = 0; t < tri.count; t += 3) {
    const v = [tri.getX(t), tri.getX(t + 1), tri.getX(t + 2)];
    for (const m of v) {
      if (ring.has(m)) continue;
      for (const r of v) {
        if (!ring.has(r)) continue;
        let set = near.get(m);
        if (!set) near.set(m, (set = new Set()));
        set.add(r);
      }
    }
  }
  const acc = new Map<number, THREE.Vector3>();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pm = new THREE.Vector3();
  for (const [m, set] of near) {
    if (set.size !== 2) continue;
    const [a, b] = [...set] as [number, number];
    pa.fromBufferAttribute(pos, a);
    pb.fromBufferAttribute(pos, b);
    pm.fromBufferAttribute(pos, m);
    if (pm.distanceTo(pa.lerp(pb, 0.5)) > 1e-5) continue;
    const ka = ring.get(a)!;
    const kb = ring.get(b)!;
    acc.set(m, new THREE.Vector3(n[ka * 3]! + n[kb * 3]!, n[ka * 3 + 1]! + n[kb * 3 + 1]!, n[ka * 3 + 2]! + n[kb * 3 + 2]!).normalize());
  }
  for (const [m, d] of acc) nor.setXYZ(m, d.x, d.y, d.z);
  nor.needsUpdate = true;
  return [...ring.keys(), ...acc.keys()];
}
