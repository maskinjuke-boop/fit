import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { BODY_DATA } from './bodyData';
import { applyRingNormals, headRing, loopSubdivide } from './headMesh';

/**
 * Тело — готовая модель MakeHuman (makehumancommunity.org, CC0) в игровой позе (руки опущены),
 * без головы (она отдельно, стыкуется по шее) и без кистей (у героя свои кисти, держащие предметы).
 * Данные извлекает scripts/extract-mh.py. Координаты — мировые: ноги на y = 0, лицо на +Z.
 *
 * Для одежды и измерений нужно поле расстояний до тела — его даёт сетка расстояний (bodySdf):
 * для каждой ячейки — ближайший треугольник каждой части тела (корпус, руки, ноги) и знак
 * «внутри/снаружи» по лучам вдоль вертикали. Между узлами значения интерполируются.
 */

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

export type Part = 0 | 1 | 2;
export type V3t = [number, number, number];
export interface Landmarks {
  shoulder: V3t;
  elbow: V3t;
  wrist: V3t;
  hand: V3t;
  hip: V3t;
  knee: V3t;
  ankle: V3t;
  toe: V3t;
  neck: V3t;
  chest: V3t;
  pelvis: V3t;
  clavicle: V3t;
  crotch: number;
  waist: number;
  waistW: number;
  armpit: number;
  nipple?: V3t;
  /** Центр сжатой кисти (левой, +X) и ось рукояти в ней. */
  grip: V3t;
  gripAxis: V3t;
}

export const landmarks = (figure: Figure): Landmarks => BODY_DATA[figure].landmarks as unknown as Landmarks;

const posCache = new Map<Figure, Float32Array>();
/** Вершины тела (мировые координаты). */
export function bodyPositions(figure: Figure): Float32Array {
  let p = posCache.get(figure);
  if (!p) {
    const q = new Int16Array(bytes(BODY_DATA[figure].pos).buffer);
    const k = BODY_DATA.scale / 32767;
    p = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 1) p[i] = q[i]! * k;
    posCache.set(figure, p);
  }
  return p;
}

let trisCache: Uint16Array | null = null;
let overlapCache: Uint16Array | null = null;
let partCache: Uint8Array | null = null;
export const bodyTris = (): Uint16Array => (trisCache ??= new Uint16Array(bytes(BODY_DATA.tris).buffer));
/** Полоса шеи под нижним краем головы (прячет щель, когда голова поворачивается). */
export const overlapTris = (): Uint16Array => (overlapCache ??= new Uint16Array(bytes(BODY_DATA.overlap).buffer));
/** Часть тела каждой вершины: 0 — корпус, 1 — рука, 2 — нога. */
export const vertexParts = (): Uint8Array => (partCache ??= bytes(BODY_DATA.part));

/**
 * Сетка тела для отрисовки: деление по Лупу, полоса шеи под головой утоплена внутрь,
 * развёртка по преобладающей оси (как у одежды). ao(x, y, z, nx, ny, nz) — затенение складок.
 */
export function bodyRenderGeometry(figure: Figure, ao?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number, grips: readonly [boolean, boolean] = [false, false]): THREE.BufferGeometry {
  const tris = bodyTris();
  const over = overlapTris();
  const all = new Uint32Array(tris.length + over.length);
  all.set(tris);
  all.set(over, tris.length);
  let base = bodyPositions(figure);
  if (grips[0] || grips[1]) {
    // Кисть, держащая предмет, — сжата в кулак (правая — x < 0, левая — x > 0).
    base = Float32Array.from(base);
    const idx = new Uint16Array(bytes(BODY_DATA[figure].fistIdx).buffer);
    const q = new Int16Array(bytes(BODY_DATA[figure].fist).buffer);
    const k = BODY_DATA.scale / 32767;
    for (let j = 0; j < idx.length; j += 1) {
      const i = idx[j]!;
      if (!grips[base[i * 3]! < 0 ? 0 : 1]) continue;
      base[i * 3] = q[j * 3]! * k;
      base[i * 3 + 1] = q[j * 3 + 1]! * k;
      base[i * 3 + 2] = q[j * 3 + 2]! * k;
    }
  }
  const flag = new Float32Array(base.length / 3);
  for (let i = 0; i < over.length; i += 1) flag[over[i]!] = 1;
  for (let i = 0; i < tris.length; i += 1) flag[tris[i]!] = 0;
  // Кольцо шва шеи не сглаживается — совпадает с нижним краем головы.
  const ringIdx = new Uint16Array(bytes(BODY_DATA.ring).buffer);
  const fixed = new Uint8Array(base.length / 3);
  for (const i of ringIdx) fixed[i] = 1;
  const sub = loopSubdivide(base, all, flag, fixed);
  const geo = new THREE.BufferGeometry();
  const pos = sub.pos;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(pos.length / 3 < 65536 ? Uint16Array.from(sub.tris) : sub.tris, 1));
  geo.computeVertexNormals();
  const ring = headRing(figure === 'female');
  applyRingNormals(geo, ringIdx, ring.n);
  const nor = geo.getAttribute('normal');
  const n = pos.length / 3;
  for (let i = 0; i < n; i += 1) {
    // Вся полоса над швом (и середины рёбер у самого шва) уходит под кожу головы.
    const f = sub.scalar[i]!;
    if (f > 0.01) {
      pos[i * 3] = pos[i * 3]! - nor.getX(i) * 0.003;
      pos[i * 3 + 1] = pos[i * 3 + 1]! - nor.getY(i) * 0.003;
      pos[i * 3 + 2] = pos[i * 3 + 2]! - nor.getZ(i) * 0.003;
    }
  }
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    if (ay > ax * 1.4 && ay > az * 1.4) uv.set([x * 4, z * 4], i * 2);
    else if (ax > az) uv.set([z * 4, y * 4], i * 2);
    else uv.set([x * 4, y * 4], i * 2);
    // У шва шеи затенения нет — цвет кожи совпадает с головой.
    const seam = Math.min(1, Math.max(0, (y - (BODY_DATA.NECK_WORLD - 0.07)) / 0.05));
    const a = ao ? 1 + (ao(x, y, z, nx, ny, nz) - 1) * (1 - seam * seam * (3 - 2 * seam)) : 1;
    // Тени в складках кожи чуть тёплые (подповерхностное рассеяние).
    col[i * 3] = a ** 0.75;
    col[i * 3 + 1] = a ** 1.05;
    col[i * 3 + 2] = a ** 1.2;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// ─── Поле расстояний ──────────────────────────────────────────────────

const H = 0.016;
const MIN: V3t = [-0.6, -0.06, -0.38];
const MAX: V3t = [0.6, 2.14, 0.4];
const NX = Math.ceil((MAX[0] - MIN[0]) / H) + 1;
const NY = Math.ceil((MAX[1] - MIN[1]) / H) + 1;
const NZ = Math.ceil((MAX[2] - MIN[2]) / H) + 1;

export interface BodySdf {
  /** Расстояние со знаком до всего тела. */
  d(x: number, y: number, z: number): number;
  /** Расстояния до частей: корпус, рука, нога (у ближайшей части — со знаком тела). */
  parts(x: number, y: number, z: number, out: { torso: number; arm: number; leg: number }): number;
}

/** Треугольники для поля: тело и «заплатки» на отверстиях (шея, запястья). */
function closedMesh(figure: Figure): { tri: Float64Array; part: Uint8Array } {
  const pos = bodyPositions(figure);
  const tris = bodyTris();
  const vp = vertexParts();
  const cnt = new Map<number, number>();
  const n = pos.length / 3;
  const key = (a: number, b: number): number => (a < b ? a * n + b : b * n + a);
  for (let t = 0; t < tris.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const kk = key(tris[t + k]!, tris[t + ((k + 1) % 3)]!);
      cnt.set(kk, (cnt.get(kk) ?? 0) + 1);
    }
  }
  // Граничные рёбра (с направлением, как в треугольнике) — собираем в петли.
  const next = new Map<number, number>();
  for (let t = 0; t < tris.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = tris[t + k]!;
      const b = tris[t + ((k + 1) % 3)]!;
      if (cnt.get(key(a, b)) === 1) next.set(b, a); // обратный обход закрывает отверстие
    }
  }
  const caps: number[][] = [];
  const seen = new Set<number>();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop: number[] = [];
    let c: number | undefined = s;
    while (c !== undefined && !seen.has(c)) {
      seen.add(c);
      loop.push(c);
      c = next.get(c);
    }
    if (loop.length >= 3) caps.push(loop);
  }
  const out: number[] = [];
  const parts: number[] = [];
  const P = (i: number): number[] => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
  for (let t = 0; t < tris.length; t += 3) {
    out.push(...P(tris[t]!), ...P(tris[t + 1]!), ...P(tris[t + 2]!));
    const ps = [vp[tris[t]!]!, vp[tris[t + 1]!]!, vp[tris[t + 2]!]!];
    parts.push(ps[0] === ps[1] || ps[0] === ps[2] ? ps[0]! : ps[1]!);
  }
  for (const loop of caps) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const i of loop) {
      cx += pos[i * 3]! / loop.length;
      cy += pos[i * 3 + 1]! / loop.length;
      cz += pos[i * 3 + 2]! / loop.length;
    }
    for (let k = 0; k < loop.length; k += 1) {
      out.push(...P(loop[k]!), ...P(loop[(k + 1) % loop.length]!), cx, cy, cz);
      parts.push(vp[loop[k]!]!);
    }
  }
  return { tri: Float64Array.from(out), part: Uint8Array.from(parts) };
}

/** Квадрат расстояния от точки до треугольника t (ближайшая точка по Эриксону). */
function triDist2(T: Float64Array, t: number, px: number, py: number, pz: number): number {
  const o = t * 9;
  const ax = T[o]!;
  const ay = T[o + 1]!;
  const az = T[o + 2]!;
  const abx = T[o + 3]! - ax;
  const aby = T[o + 4]! - ay;
  const abz = T[o + 5]! - az;
  const acx = T[o + 6]! - ax;
  const acy = T[o + 7]! - ay;
  const acz = T[o + 8]! - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number;
  let qy: number;
  let qz: number;
  if (d1 <= 0 && d2 <= 0) {
    qx = ax;
    qy = ay;
    qz = az;
  } else {
    const bpx = apx - abx;
    const bpy = apy - aby;
    const bpz = apz - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = apx - acx;
    const cpy = apy - acy;
    const cpz = apz - acz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      qx = ax + abx;
      qy = ay + aby;
      qz = az + abz;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      qx = ax + abx * v;
      qy = ay + aby * v;
      qz = az + abz * v;
    } else if (d6 >= 0 && d5 <= d6) {
      qx = ax + acx;
      qy = ay + acy;
      qz = az + acz;
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      qx = ax + acx * w;
      qy = ay + acy * w;
      qz = az + acz * w;
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      const bx = ax + abx;
      const by = ay + aby;
      const bz = az + abz;
      qx = bx + (acx - abx) * w;
      qy = by + (acy - aby) * w;
      qz = bz + (acz - abz) * w;
    } else {
      const den = 1 / (va + vb + vc);
      const v = vb * den;
      const w = vc * den;
      qx = ax + abx * v + acx * w;
      qy = ay + aby * v + acy * w;
      qz = az + abz * v + acz * w;
    }
  }
  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/** Строит поле расстояний порциями (yield — пауза для интерфейса). */
export function* bodySdfGen(figure: Figure): Generator<void, BodySdf, void> {
  const { tri, part } = closedMesh(figure);
  const nT = part.length;
  const N = NX * NY * NZ;
  const idx = (i: number, j: number, k: number): number => (k * NY + j) * NX + i;
  // Ближайший треугольник каждой части в каждой ячейке.
  const best = [new Int32Array(N).fill(-1), new Int32Array(N).fill(-1), new Int32Array(N).fill(-1)];
  const dist = [new Float32Array(N).fill(Infinity), new Float32Array(N).fill(Infinity), new Float32Array(N).fill(Infinity)];
  for (let t = 0; t < nT; t += 1) {
    if (t % 2000 === 0) yield;
    const o = t * 9;
    const p = part[t]!;
    const lo = [0, 1, 2].map((c) => Math.min(tri[o + c]!, tri[o + 3 + c]!, tri[o + 6 + c]!));
    const hi = [0, 1, 2].map((c) => Math.max(tri[o + c]!, tri[o + 3 + c]!, tri[o + 6 + c]!));
    const i0 = Math.max(0, Math.floor((lo[0]! - MIN[0]) / H) - 1);
    const i1 = Math.min(NX - 1, Math.ceil((hi[0]! - MIN[0]) / H) + 1);
    const j0 = Math.max(0, Math.floor((lo[1]! - MIN[1]) / H) - 1);
    const j1 = Math.min(NY - 1, Math.ceil((hi[1]! - MIN[1]) / H) + 1);
    const k0 = Math.max(0, Math.floor((lo[2]! - MIN[2]) / H) - 1);
    const k1 = Math.min(NZ - 1, Math.ceil((hi[2]! - MIN[2]) / H) + 1);
    const B = best[p]!;
    const Dd = dist[p]!;
    for (let k = k0; k <= k1; k += 1) {
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          const c = idx(i, j, k);
          const d2 = triDist2(tri, t, MIN[0] + i * H, MIN[1] + j * H, MIN[2] + k * H);
          if (d2 < Dd[c]!) {
            Dd[c] = d2;
            B[c] = t;
          }
        }
      }
    }
  }
  // Распространение ближайшего треугольника на всю сетку: проходы вперёд и назад.
  for (let p = 0; p < 3; p += 1) {
    const B = best[p]!;
    const Dd = dist[p]!;
    for (const dir of [1, -1, 1, -1]) {
      const ks = dir > 0 ? 0 : NZ - 1;
      for (let kk = 0; kk < NZ; kk += 1) {
        const k = ks + dir * kk;
        if (kk % 6 === 0) yield;
        for (let jj = 0; jj < NY; jj += 1) {
          const j = dir > 0 ? jj : NY - 1 - jj;
          for (let ii = 0; ii < NX; ii += 1) {
            const i = dir > 0 ? ii : NX - 1 - ii;
            const c = idx(i, j, k);
            const px = MIN[0] + i * H;
            const py = MIN[1] + j * H;
            const pz = MIN[2] + k * H;
            const i2 = i - dir;
            const j2 = j - dir;
            const k2 = k - dir;
            if (i2 >= 0 && i2 < NX) {
              const t = B[idx(i2, j, k)]!;
              if (t >= 0 && t !== B[c]) {
                const d2 = triDist2(tri, t, px, py, pz);
                if (d2 < Dd[c]!) {
                  Dd[c] = d2;
                  B[c] = t;
                }
              }
            }
            if (j2 >= 0 && j2 < NY) {
              const t = B[idx(i, j2, k)]!;
              if (t >= 0 && t !== B[c]) {
                const d2 = triDist2(tri, t, px, py, pz);
                if (d2 < Dd[c]!) {
                  Dd[c] = d2;
                  B[c] = t;
                }
              }
            }
            if (k2 >= 0 && k2 < NZ) {
              const t = B[idx(i, j, k2)]!;
              if (t >= 0 && t !== B[c]) {
                const d2 = triDist2(tri, t, px, py, pz);
                if (d2 < Dd[c]!) {
                  Dd[c] = d2;
                  B[c] = t;
                }
              }
            }
          }
        }
      }
    }
  }
  yield;
  // Знак: вертикальные лучи через узлы сетки, чётность пересечений снизу.
  const inside = new Uint8Array(N);
  const cols: number[][] = Array.from({ length: NX * NZ }, () => []);
  for (let t = 0; t < nT; t += 1) {
    const o = t * 9;
    const lx = Math.min(tri[o]!, tri[o + 3]!, tri[o + 6]!);
    const hx = Math.max(tri[o]!, tri[o + 3]!, tri[o + 6]!);
    const lz = Math.min(tri[o + 2]!, tri[o + 5]!, tri[o + 8]!);
    const hz = Math.max(tri[o + 2]!, tri[o + 5]!, tri[o + 8]!);
    for (let k = Math.max(0, Math.ceil((lz - MIN[2]) / H)); k <= Math.min(NZ - 1, Math.floor((hz - MIN[2]) / H)); k += 1) {
      for (let i = Math.max(0, Math.ceil((lx - MIN[0]) / H)); i <= Math.min(NX - 1, Math.floor((hx - MIN[0]) / H)); i += 1) cols[k * NX + i]!.push(t);
    }
  }
  const E = 1.3e-6;
  for (let k = 0; k < NZ; k += 1) {
    if (k % 8 === 0) yield;
    for (let i = 0; i < NX; i += 1) {
      const list = cols[k * NX + i]!;
      if (!list.length) continue;
      const px = MIN[0] + i * H + E;
      const pz = MIN[2] + k * H + 0.7 * E;
      const ys: number[] = [];
      for (const t of list) {
        const o = t * 9;
        // Барицентрические координаты проекции на плоскость XZ.
        const x0 = tri[o]!;
        const z0 = tri[o + 2]!;
        const x1 = tri[o + 3]!;
        const z1 = tri[o + 5]!;
        const x2 = tri[o + 6]!;
        const z2 = tri[o + 8]!;
        const den = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
        if (Math.abs(den) < 1e-14) continue;
        const a = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / den;
        const b = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / den;
        const c = 1 - a - b;
        if (a < 0 || b < 0 || c < 0) continue;
        ys.push(a * tri[o + 1]! + b * tri[o + 4]! + c * tri[o + 7]!);
      }
      if (ys.length < 2) continue;
      ys.sort((p, q) => p - q);
      let n = 0;
      for (let j = 0; j < NY; j += 1) {
        const y = MIN[1] + j * H;
        while (n < ys.length && ys[n]! < y) n += 1;
        if (n % 2 === 1) inside[idx(i, j, k)] = 1;
      }
    }
  }
  // Итоговые поля: тело и части.
  const D = new Float32Array(N);
  const PT = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let c = 0; c < N; c += 1) {
    const a = Math.sqrt(dist[0]![c]!);
    const b = Math.sqrt(dist[1]![c]!);
    const e = Math.sqrt(dist[2]![c]!);
    const m = Math.min(a, b, e);
    const s = inside[c] ? -1 : 1;
    D[c] = s * m;
    PT[0]![c] = a === m ? s * a : a;
    PT[1]![c] = b === m && a !== m ? s * b : b;
    PT[2]![c] = e === m && a !== m && b !== m ? s * e : e;
  }
  const sample = (G: Float32Array, x: number, y: number, z: number): number => {
    const fx = (x - MIN[0]) / H;
    const fy = (y - MIN[1]) / H;
    const fz = (z - MIN[2]) / H;
    const cx = Math.min(NX - 2, Math.max(0, Math.floor(fx)));
    const cy = Math.min(NY - 2, Math.max(0, Math.floor(fy)));
    const cz = Math.min(NZ - 2, Math.max(0, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - cx));
    const v = Math.min(1, Math.max(0, fy - cy));
    const w = Math.min(1, Math.max(0, fz - cz));
    const o = idx(cx, cy, cz);
    const sx = 1;
    const sy = NX;
    const sz = NX * NY;
    const c00 = G[o]! * (1 - u) + G[o + sx]! * u;
    const c10 = G[o + sy]! * (1 - u) + G[o + sy + sx]! * u;
    const c01 = G[o + sz]! * (1 - u) + G[o + sz + sx]! * u;
    const c11 = G[o + sz + sy]! * (1 - u) + G[o + sz + sy + sx]! * u;
    const val = (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
    // За пределами сетки — плюс расстояние до неё (поле остаётся «снаружи»).
    const ox = Math.max(MIN[0] - x, x - MAX[0], 0);
    const oy = Math.max(MIN[1] - y, y - MAX[1], 0);
    const oz = Math.max(MIN[2] - z, z - MAX[2], 0);
    return ox || oy || oz ? val + Math.hypot(ox, oy, oz) : val;
  };
  return {
    d: (x, y, z) => sample(D, x, y, z),
    parts(x, y, z, out) {
      out.torso = sample(PT[0]!, x, y, z);
      out.arm = sample(PT[1]!, x, y, z);
      out.leg = sample(PT[2]!, x, y, z);
      return sample(D, x, y, z);
    },
  };
}

const sdfCache = new Map<Figure, BodySdf>();
const sdfPending = new Map<Figure, Promise<BodySdf>>();

/** Поле расстояний тела (строится сразу, если ещё нет). */
export function bodySdf(figure: Figure): BodySdf {
  let s = sdfCache.get(figure);
  if (!s) {
    const g = bodySdfGen(figure);
    let r = g.next();
    while (!r.done) r = g.next();
    s = r.value;
    sdfCache.set(figure, s);
  }
  return s;
}

/** То же порциями, не подвешивая интерфейс. */
export function bodySdfAsync(figure: Figure, run: (g: Generator<void, BodySdf, void>) => Promise<BodySdf>): Promise<BodySdf> {
  const hit = sdfCache.get(figure);
  if (hit) return Promise.resolve(hit);
  let p = sdfPending.get(figure);
  if (!p) {
    p = run(bodySdfGen(figure)).then((s) => {
      sdfCache.set(figure, s);
      sdfPending.delete(figure);
      return s;
    });
    sdfPending.set(figure, p);
  }
  return p;
}
