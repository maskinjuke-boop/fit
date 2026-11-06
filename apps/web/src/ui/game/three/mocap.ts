import * as THREE from 'three';

/**
 * Клипы захвата движения (CMU Graphics Lab Motion Capture Database, перенесены на наш скелет
 * конвейером tools/mocap): распаковка и выборка позы в фазе с интерполяцией кватернионов.
 *
 * Кадр клипа — локальные повороты всех костей (в порядке BONES из rig.ts), смещение таза от
 * покоя и цели голеностопов (левая, правая) в координатах тела эталонной фигуры. Клип ходьбы —
 * один цикл (два шага) с началом в момент постановки левой стопы, движение на месте:
 * опорная стопа едет назад ровно на stride за цикл.
 */

/** Масштаб квантования: кватернионы — ×32767, смещения — в 0,1 мм. */
export const CLIP_SCALE_Q = 32767;
export const CLIP_SCALE_POS = 10000;

/** Упакованный клип (так он лежит в mocapClips.ts). */
export interface PackedClip {
  fps: number;
  frames: number;
  /** Цикл (ходьба, стойка) или однократное движение (сесть, встать). */
  loop: boolean;
  /** Путь тела за цикл (м эталонной фигуры); 0 — на месте. */
  stride: number;
  /** Ходьба и бег: доли цикла, когда левая стопа отрывается, правая встаёт и отрывается (левая встаёт в 0). */
  events?: GaitEvents;
  data: string;
}

export interface GaitEvents {
  lOff: number;
  rOn: number;
  rOff: number;
}

export interface Clip {
  fps: number;
  frames: number;
  bones: number;
  loop: boolean;
  stride: number;
  /** Длительность цикла, с. */
  duration: number;
  events: GaitEvents | null;
  /** Повороты: frames × bones × 4. */
  q: Float32Array;
  /** Таз и голеностопы: frames × 9. */
  pos: Float32Array;
}

/** Поза из клипа: повороты костей и 9 чисел положений (таз, левый и правый голеностопы). */
export interface ClipPose {
  q: Float32Array;
  pos: Float32Array;
}

const fromBase64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

export function decodeClip(src: PackedClip, bones: number): Clip {
  const raw = new Int16Array(fromBase64(src.data).buffer);
  const stride = bones * 4 + 9;
  if (raw.length !== src.frames * stride) throw new Error(`клип: ${raw.length} чисел вместо ${src.frames * stride}`);
  const q = new Float32Array(src.frames * bones * 4);
  const pos = new Float32Array(src.frames * 9);
  for (let f = 0; f < src.frames; f += 1) {
    const o = f * stride;
    for (let b = 0; b < bones; b += 1) {
      let x = raw[o + b * 4]! / CLIP_SCALE_Q;
      let y = raw[o + b * 4 + 1]! / CLIP_SCALE_Q;
      let z = raw[o + b * 4 + 2]! / CLIP_SCALE_Q;
      let w = raw[o + b * 4 + 3]! / CLIP_SCALE_Q;
      const n = Math.hypot(x, y, z, w) || 1;
      x /= n;
      y /= n;
      z /= n;
      w /= n;
      const k = (f * bones + b) * 4;
      q[k] = x;
      q[k + 1] = y;
      q[k + 2] = z;
      q[k + 3] = w;
    }
    for (let i = 0; i < 9; i += 1) pos[f * 9 + i] = raw[o + bones * 4 + i]! / CLIP_SCALE_POS;
  }
  return { fps: src.fps, frames: src.frames, bones, loop: src.loop, stride: src.stride, duration: src.frames / src.fps, events: src.events ?? null, q, pos };
}

/** Сферическая интерполяция кватернионов в массивах (THREE.Quaternion.slerpFlat, без выделения памяти). */
const slerpFlat = THREE.Quaternion.slerpFlat as unknown as (dst: Float32Array, d: number, a: Float32Array, ai: number, b: Float32Array, bi: number, t: number) => void;

export const makePose = (bones: number): ClipPose => ({ q: new Float32Array(bones * 4), pos: new Float32Array(9) });

/**
 * Поза клипа в фазе u (доля цикла; у цикла — по модулю 1, у однократного клипа — 0…1
 * с остановкой на последнем кадре): сферическая интерполяция между соседними кадрами.
 */
export function sampleClip(clip: Clip, u: number, out: ClipPose): ClipPose {
  const n = clip.frames;
  let x: number;
  if (clip.loop) x = (((u % 1) + 1) % 1) * n;
  else x = Math.max(0, Math.min(1, u)) * (n - 1);
  const i = Math.min(n - 1, Math.floor(x));
  const j = clip.loop ? (i + 1) % n : Math.min(n - 1, i + 1);
  const t = x - i;
  const B = clip.bones;
  for (let b = 0; b < B; b += 1) slerpFlat(out.q, b * 4, clip.q, (i * B + b) * 4, clip.q, (j * B + b) * 4, t);
  for (let k = 0; k < 9; k += 1) out.pos[k] = clip.pos[i * 9 + k]! + (clip.pos[j * 9 + k]! - clip.pos[i * 9 + k]!) * t;
  return out;
}

/** Смесь двух поз: w = 0 — a, 1 — b (результат можно писать в a). */
export function mixPose(a: ClipPose, b: ClipPose, w: number, out: ClipPose): ClipPose {
  const B = a.q.length / 4;
  for (let k = 0; k < B; k += 1) slerpFlat(out.q, k * 4, a.q, k * 4, b.q, k * 4, w);
  for (let k = 0; k < 9; k += 1) out.pos[k] = a.pos[k]! + (b.pos[k]! - a.pos[k]!) * w;
  return out;
}

/**
 * Опорные точки выравнивания двух походок: доли цикла общих событий шага (постановки и
 * отрывы стоп) у a и b, по возрастанию, с 0 и 1 по краям. Если события идут в разном
 * порядке (ходьба и бег), выравниваются только постановки стоп.
 */
export function gaitKeys(a: GaitEvents, b: GaitEvents): [number[], number[]] {
  const order = (e: GaitEvents): string => (['lOff', 'rOn', 'rOff'] as const).slice().sort((x, y) => e[x] - e[y]).join();
  const keys = order(a) === order(b) ? (['lOff', 'rOn', 'rOff'] as const).slice().sort((x, y) => a[x] - a[y]) : (['rOn'] as const);
  return [[0, ...keys.map((k) => a[k]), 1], [0, ...keys.map((k) => b[k]), 1]];
}

/**
 * Время смеси: phase — общая фаза, ka/kb — опорные точки (gaitKeys), w — вес b. Опорные
 * точки общей фазы — смесь точек a и b; между ними фаза каждой походки идёт равномерно.
 * Возвращает фазы a и b и скорости их хода (доля цикла походки на долю общей фазы).
 */
export function warpPhase(ka: readonly number[], kb: readonly number[], w: number, phase: number, out: Float32Array): Float32Array {
  const u = ((phase % 1) + 1) % 1;
  let i = 0;
  const key = (j: number): number => ka[j]! + (kb[j]! - ka[j]!) * w;
  while (i < ka.length - 2 && u >= key(i + 1)) i += 1;
  const c0 = key(i);
  const c1 = key(i + 1);
  const t = c1 > c0 ? (u - c0) / (c1 - c0) : 0;
  out[0] = ka[i]! + (ka[i + 1]! - ka[i]!) * t;
  out[1] = kb[i]! + (kb[i + 1]! - kb[i]!) * t;
  out[2] = c1 > c0 ? (ka[i + 1]! - ka[i]!) / (c1 - c0) : 1;
  out[3] = c1 > c0 ? (kb[i + 1]! - kb[i]!) / (c1 - c0) : 1;
  return out;
}
