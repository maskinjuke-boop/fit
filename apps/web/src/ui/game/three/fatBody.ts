import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { bodyPositions, vertexParts } from './bodyMesh';
import { FAT_DATA, MUSCLE_DATA } from './fatData';

/**
 * Полная фигура — отдельная модель MakeHuman (та же сетка с максимальным весом, CC0):
 * для каждой вершины тела известен сдвиг к полной форме. Из этих сдвигов строится поле
 * в пространстве вокруг тела — одно и то же для кожи, одежды и обуви, поэтому одежда
 * сидит на полной фигуре так же, как на обычной. У рук и корпуса поля раздельные
 * (рука у бока не тянет за собой бок и наоборот).
 */

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

interface Field {
  pos: Float32Array;
  d: Float32Array;
  arm: Uint8Array;
  cells: Map<number, number[]>;
}

const CELL = 0.06;
const SIGMA = 0.028;
const cellKey = (ix: number, iy: number, iz: number): number => ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);

/** Какая форма: полная (fat) или атлетичная (muscle). */
export type ShapeKind = 'fat' | 'muscle';

const fields = new Map<string, Field>();

function field(figure: Figure, kind: ShapeKind): Field {
  const key = `${kind}|${figure}`;
  let f = fields.get(key);
  if (f) return f;
  const data = (kind === 'fat' ? FAT_DATA : MUSCLE_DATA)[figure];
  const q = new Int16Array(bytes(data.d).buffer);
  const k = data.sc / 32767;
  const d = new Float32Array(q.length);
  for (let i = 0; i < q.length; i += 1) d[i] = q[i]! * k;
  const pos = bodyPositions(figure);
  const parts = vertexParts();
  const arm = new Uint8Array(pos.length / 3);
  const cells = new Map<number, number[]>();
  for (let i = 0; i < pos.length / 3; i += 1) {
    arm[i] = parts[i] === 1 ? 1 : 0;
    const key = cellKey(Math.floor(pos[i * 3]! / CELL), Math.floor(pos[i * 3 + 1]! / CELL), Math.floor(pos[i * 3 + 2]! / CELL));
    let c = cells.get(key);
    if (!c) cells.set(key, (c = []));
    c.push(i);
  }
  f = { pos, d, arm, cells };
  fields.set(key, f);
  return f;
}

const acc = [new THREE.Vector3(), new THREE.Vector3()];
const wsum = [0, 0];
const best = [Infinity, Infinity];
const bestI = [-1, -1];

/**
 * Сдвиг к полной фигуре в точке p (координаты героя). armShare — доля руки у вершины
 * со скиннингом (0 — корпус и ноги, 1 — рука); без неё берутся все ближайшие вершины.
 */
export function fatShift(figure: Figure, p: THREE.Vector3, armShare: number | undefined, out: THREE.Vector3, kind: ShapeKind = 'fat'): THREE.Vector3 {
  const f = field(figure, kind);
  acc[0]!.set(0, 0, 0);
  acc[1]!.set(0, 0, 0);
  wsum[0] = wsum[1] = 0;
  best[0] = best[1] = Infinity;
  bestI[0] = bestI[1] = -1;
  const ix = Math.floor(p.x / CELL);
  const iy = Math.floor(p.y / CELL);
  const iz = Math.floor(p.z / CELL);
  for (let r = 1; r <= 3; r += 1) {
    for (let a = ix - r; a <= ix + r; a += 1)
      for (let b = iy - r; b <= iy + r; b += 1)
        for (let c = iz - r; c <= iz + r; c += 1) {
          // Внешний слой куба — только на следующих кругах поиска.
          if (r > 1 && Math.max(Math.abs(a - ix), Math.abs(b - iy), Math.abs(c - iz)) < r) continue;
          const list = f.cells.get(cellKey(a, b, c));
          if (!list) continue;
          for (const i of list) {
            const dx = f.pos[i * 3]! - p.x;
            const dy = f.pos[i * 3 + 1]! - p.y;
            const dz = f.pos[i * 3 + 2]! - p.z;
            const dd = dx * dx + dy * dy + dz * dz;
            const s = armShare === undefined ? 0 : f.arm[i]!;
            if (dd < best[s]!) {
              best[s] = dd;
              bestI[s] = i;
            }
            const w = Math.exp(-dd / (SIGMA * SIGMA));
            if (w < 1e-4) continue;
            wsum[s] = wsum[s]! + w;
            acc[s]!.x += f.d[i * 3]! * w;
            acc[s]!.y += f.d[i * 3 + 1]! * w;
            acc[s]!.z += f.d[i * 3 + 2]! * w;
          }
        }
    if (bestI[0]! >= 0 || bestI[1]! >= 0) break;
  }
  const part = (s: number, o: THREE.Vector3): boolean => {
    if (wsum[s]! > 1e-3) {
      o.copy(acc[s]!).multiplyScalar(1 / wsum[s]!);
      return true;
    }
    const i = bestI[s]!;
    if (i < 0) return false;
    o.set(f.d[i * 3]!, f.d[i * 3 + 1]!, f.d[i * 3 + 2]!);
    return true;
  };
  out.set(0, 0, 0);
  if (armShare === undefined) {
    part(0, out);
    return out;
  }
  const ok0 = part(0, tA);
  const ok1 = part(1, tB);
  if (ok0 && ok1) return out.copy(tA).lerp(tB, Math.max(0, Math.min(1, armShare)));
  if (ok0) return out.copy(tA);
  if (ok1) return out.copy(tB);
  return out;
}

const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
