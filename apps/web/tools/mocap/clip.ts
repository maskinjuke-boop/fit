import * as THREE from 'three';
import { CLIP_SCALE_POS, CLIP_SCALE_Q } from '../../src/ui/game/three/mocap';

/**
 * Зацикливание и упаковка клипов (офлайн, без DOM).
 */

/** Кадр клипа: локальные повороты костей, смещение таза и цели голеностопов (l, r). */
export interface ClipFrame {
  q: THREE.Quaternion[];
  root: THREE.Vector3;
  feet: [THREE.Vector3, THREE.Vector3];
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Делает цикл замкнутым: frames — N + 1 кадров, последний совпадает по фазе с первым.
 * Разрыв (первый − последний) раскладывается по циклу: у корпуса и рук — равномерно, у
 * костей ноги legs[i] — только пока она в воздухе (swing[i] — начало и конец переноса в
 * долях цикла), чтобы опорная стопа не меняла наклон. Возвращает N кадров.
 */
export function closeLoop(frames: ClipFrame[], legs: Array<{ bones: number[]; swing: [number, number]; side: 0 | 1 }> = []): ClipFrame[] {
  const n = frames.length - 1;
  const first = frames[0]!;
  const last = frames[n]!;
  const id = new THREE.Quaternion();
  const delta = first.q.map((q, b) => q.clone().multiply(last.q[b]!.clone().invert()));
  const dRoot = first.root.clone().sub(last.root);
  const dFeet = [0, 1].map((k) => first.feet[k]!.clone().sub(last.feet[k]!));
  // Доля поправки по фазе для каждой кости: r(1) − r(0) = 1, в опоре — постоянна (0).
  const ramp: Array<(u: number) => number> = first.q.map(() => (u: number) => u);
  const footRamp: Array<(u: number) => number> = [(u) => u, (u) => u];
  for (const leg of legs) {
    const [a, b] = leg.swing;
    // Опора после переноса длиннее — поправка в ней 0, значит в начале цикла она −1.
    const c = a < 1 - b ? -1 : 0;
    const r = (u: number): number => smooth(a, b, u) + c;
    for (const bone of leg.bones) ramp[bone] = r;
    footRamp[leg.side] = r;
  }
  const out: ClipFrame[] = [];
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    const f = frames[i]!;
    const q = f.q.map((x, b) => {
      const r = ramp[b]!(u);
      // Отрицательная доля — обратный поворот.
      const d = r >= 0 ? new THREE.Quaternion().slerpQuaternions(id, delta[b]!, r) : new THREE.Quaternion().slerpQuaternions(id, delta[b]!.clone().invert(), -r);
      return d.multiply(x);
    });
    const root = f.root.clone().addScaledVector(dRoot, u);
    const feet = [0, 1].map((k) => f.feet[k]!.clone().addScaledVector(dFeet[k]!, footRamp[k]!(u))) as [THREE.Vector3, THREE.Vector3];
    out.push({ q, root, feet });
  }
  return out;
}

/**
 * Склеивает конец неповторяющегося отрезка с началом (стойка на месте): последние
 * blend кадров плавно переходят в позу первого кадра, поэтому шва не видно.
 */
export function crossfadeLoop(frames: ClipFrame[], blend: number): ClipFrame[] {
  const n = frames.length;
  const out = frames.map((f) => ({ q: f.q.map((q) => q.clone()), root: f.root.clone(), feet: [f.feet[0].clone(), f.feet[1].clone()] as [THREE.Vector3, THREE.Vector3] }));
  for (let i = 0; i < blend; i += 1) {
    // Кадр n − blend + i смешивается с кадром i − blend (то есть с «продолжением» начала).
    const k = n - blend + i;
    const w = smooth(0, 1, (i + 1) / (blend + 1));
    const src = out[k]!;
    const dst = frames[0]!;
    src.q.forEach((q, b) => q.slerp(dst.q[b]!, w));
    src.root.lerp(dst.root, w);
    src.feet[0].lerp(dst.feet[0], w);
    src.feet[1].lerp(dst.feet[1], w);
  }
  return out;
}

/** Упаковка кадров: на кадр — кватернионы (×32767), таз и стопы (в 0,1 мм), int16 → base64. */
export function packClip(frames: readonly ClipFrame[]): string {
  if (frames.length === 0) return '';
  const bones = frames[0]!.q.length;
  const stride = bones * 4 + 9;
  const data = new Int16Array(frames.length * stride);
  const q16 = (x: number): number => Math.max(-32767, Math.min(32767, Math.round(x * CLIP_SCALE_Q)));
  const p16 = (x: number): number => {
    const v = Math.round(x * CLIP_SCALE_POS);
    if (Math.abs(v) > 32767) throw new Error(`клип: смещение ${x} не помещается в int16`);
    return v;
  };
  let prev: THREE.Quaternion[] | null = null;
  frames.forEach((f, i) => {
    let o = i * stride;
    f.q.forEach((q, b) => {
      // Соседние кадры — в одном полушарии (интерполяция идёт коротким путём).
      const p = prev?.[b];
      const s = p && p.dot(q) < 0 ? -1 : 1;
      data[o++] = q16(q.x * s);
      data[o++] = q16(q.y * s);
      data[o++] = q16(q.z * s);
      data[o++] = q16(q.w * s);
      if (s < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    });
    prev = f.q;
    for (const v of [f.root, f.feet[0], f.feet[1]]) {
      data[o++] = p16(v.x);
      data[o++] = p16(v.y);
      data[o++] = p16(v.z);
    }
  });
  return Buffer.from(data.buffer).toString('base64');
}
