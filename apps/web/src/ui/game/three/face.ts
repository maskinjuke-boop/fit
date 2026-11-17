import * as THREE from 'three';
import { FACE_DATA } from './faceData';
import { headRing, headTris, loopSubdivide } from './headMesh';

/**
 * Мимика — выражения лица MakeHuman (CC0): смесь «единиц позы» лицевых костей, заранее
 * переведённая в сдвиги вершин базовой головы (scripts/extract-mh.py). Здесь сдвиги делятся
 * по Лупу вместе с сеткой головы и становятся морф-целями черепа (и бровей — по ближайшей вершине).
 */

export const EXPRESSIONS = ['smile', 'effort', 'strain', 'sleep', 'tired', 'focus'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const baseCache = new Map<string, Float32Array>();

/** Сдвиги вершин базовой (неделённой) головы для выражения e. */
export function expressionBase(e: Expression, female: boolean, n: number): Float32Array {
  const key = `${e}|${female}`;
  const hit = baseCache.get(key);
  if (hit) return hit;
  const d = FACE_DATA[e][female ? 'female' : 'male'];
  const idx = new Uint16Array(bytes(d.idx).buffer);
  const q = new Int8Array(bytes(d.d).buffer);
  const out = new Float32Array(n * 3);
  const k = d.sc / 127;
  for (let j = 0; j < idx.length; j += 1) {
    const i = idx[j]!;
    out[i * 3] = q[j * 3]! * k;
    out[i * 3 + 1] = q[j * 3 + 1]! * k;
    out[i * 3 + 2] = q[j * 3 + 2]! * k;
  }
  baseCache.set(key, out);
  return out;
}

/**
 * Морф-цели выражений для черепа geo (сетка после деления по Лупу и раздвоения по развёртке:
 * userData.src — номер вершины до раздвоения). n — число вершин базовой головы.
 */
export function addExpressionMorphs(geo: THREE.BufferGeometry, female: boolean, n: number): void {
  if (geo.morphAttributes.position?.length) return;
  const tris = headTris();
  const fixed = new Uint8Array(n);
  for (const i of headRing(female).idx) fixed[i] = 1;
  const zero = new Float32Array(n);
  const src = geo.userData.src as Uint32Array | undefined;
  const count = geo.getAttribute('position').count;
  geo.morphAttributes.position = EXPRESSIONS.map((e) => {
    const sub = loopSubdivide(expressionBase(e, female, n), tris, zero, fixed).pos;
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const s = src ? src[i]! : i;
      out[i * 3] = sub[s * 3]!;
      out[i * 3 + 1] = sub[s * 3 + 1]!;
      out[i * 3 + 2] = sub[s * 3 + 2]!;
    }
    return new THREE.BufferAttribute(out, 3);
  });
  geo.morphTargetsRelative = true;
}

/** Управление мимикой головы: плавное смешивание выражений. */
export interface FaceCtl {
  /** Целевая сила выражения (0 … 1); остальные — к нулю. */
  want(e: Expression | null, w?: number): void;
  /** Шаг сглаживания (вызывать каждый кадр). */
  update(dt: number): void;
}

export function faceController(meshes: THREE.Mesh[]): FaceCtl {
  const target = new Float32Array(EXPRESSIONS.length);
  const cur = new Float32Array(EXPRESSIONS.length);
  for (const m of meshes) {
    m.updateMorphTargets();
    if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
  }
  return {
    want(e, w = 1) {
      target.fill(0);
      if (e) target[EXPRESSIONS.indexOf(e)] = Math.max(0, Math.min(1, w));
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * 6);
      let changed = false;
      for (let i = 0; i < cur.length; i += 1) {
        const v = cur[i]! + (target[i]! - cur[i]!) * k;
        if (Math.abs(v - cur[i]!) > 1e-4) changed = true;
        cur[i] = v;
      }
      if (!changed) return;
      for (const m of meshes) if (m.morphTargetInfluences) for (let i = 0; i < cur.length; i += 1) m.morphTargetInfluences[i] = cur[i]!;
    },
  };
}

const HAPPY = new Set(['tv', 'game', 'play', 'dance', 'pet', 'talk', 'eat', 'drink', 'relax', 'vr', 'call', 'piano', 'paint']);
const EXERCISES = new Set(['squat', 'lunge', 'pushup', 'situp', 'jumping_jack', 'high_knees', 'pullup', 'pullup_negative', 'pullup_australian']);

/**
 * Выражение лица для движения: сон — закрытые глаза, упражнение — напряжение на усилии
 * (сильнее в середине повтора), отдых и развлечения — лёгкая улыбка, разминка — сосредоточенность.
 */
export function expressionFor(motion: string | null, phase = 0): [Expression | null, number] {
  if (!motion || motion === 'idle' || motion === 'walk') return [null, 0];
  const act = motion.includes(':') ? motion.slice(motion.indexOf(':') + 1) : motion;
  if (act === 'sleep') return ['sleep', 1];
  if (EXERCISES.has(act)) return ['effort', 0.35 + 0.65 * Math.sin(Math.PI * Math.max(0, Math.min(1, phase)))];
  if (act === 'box') return ['strain', 0.6];
  if (act === 'stretch' || act === 'circles') return ['focus', 0.7];
  if (HAPPY.has(act)) return ['smile', 0.8];
  return [null, 0];
}
