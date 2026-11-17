import * as THREE from 'three';
import type { Figure, HairStyle } from '../../../game/state';
import { BONES, type BoneName } from './rig';

/**
 * Мульт-люди: модели Quaternius «Ultimate Animated Character Pack» (CC0, public/models/people,
 * scripts/extract-toon.py). Анимации моделей не используются — сетка «надевается» на скелет игры:
 * каждая кость модели переносится на свою кость игры (поворот по направлению кости, растяжение
 * по длине, толщина — общим масштабом и полнотой), голова — целиком, с мульт-увеличением.
 * Так работают все позы, упражнения и предметы игры, а пропорции тела — как у скелета игры.
 */

interface Prim {
  mat: string;
  col: [number, number, number];
  n: number;
  pos: string;
  idx: string;
  j: string;
  w: string;
}
interface ToonData {
  name: string;
  joints: Record<string, [number, number, number]>;
  bones: string[];
  prims: Prim[];
}

export const TOON_MODELS = ['Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Female', 'Casual2_Female', 'Casual3_Female'] as const;
export type ToonModel = (typeof TOON_MODELS)[number];

/** Модель по фигуре и причёске (причёска — часть модели). */
export function toonModelFor(figure: Figure, hair: HairStyle): ToonModel {
  if (figure === 'female') return hair === 'long' || hair === 'curly' ? 'Casual3_Female' : hair === 'ponytail' || hair === 'bun' ? 'Casual_Female' : 'Casual2_Female';
  return hair === 'buzz' ? 'Casual2_Male' : hair === 'curly' || hair === 'bun' ? 'Casual3_Male' : 'Casual_Male';
}

const data = new Map<ToonModel, ToonData>();
let loading: Promise<void> | null = null;

/** Загружает модели (один раз; без браузера и при ошибке остаются прежние люди). */
export function loadToonPeople(): Promise<void> {
  if (loading) return loading;
  if (typeof fetch === 'undefined' || typeof document === 'undefined') return (loading = Promise.resolve());
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  loading = Promise.all(
    TOON_MODELS.map((name) =>
      fetch(`${base}models/people/${name}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<ToonData>) : null))
        .then((d) => {
          if (d) data.set(name, d);
        })
        .catch(() => undefined),
    ),
  ).then(() => undefined);
  return loading;
}

/** Данные модели напрямую (тесты, сборка без браузера). */
export function setToonData(name: ToonModel, d: unknown): void {
  data.set(name, d as ToonData);
}

/** На сколько центр мульт-головы выше центра прежней головы (кадрирование портретов и крупных планов). */
export const TOON_HEAD_LIFT = 0.12;

export const toonReady = (name?: ToonModel): boolean => (name ? data.has(name) : data.size === TOON_MODELS.length);

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

// ─── Перенос на скелет игры ────────────────────────────────────────────

/** Кость модели → кость игры и отрезок (начало и конец) у модели и у игры. */
type Seg = { bone: BoneName; from: string; to: string; ours: [BoneName, BoneName | 'ground']; kind: 'limb' | 'end' };
const SIDE = (s: 'L' | 'R'): Record<string, Seg> => {
  const o = s === 'L' ? 'l' : 'r';
  return {
    [`Shoulder.${s}`]: { bone: `${o}_clav` as BoneName, from: `Shoulder.${s}`, to: `UpperArm.${s}`, ours: [`${o}_clav` as BoneName, `${o}_upper` as BoneName], kind: 'limb' },
    [`UpperArm.${s}`]: { bone: `${o}_upper` as BoneName, from: `UpperArm.${s}`, to: `LowerArm.${s}`, ours: [`${o}_upper` as BoneName, `${o}_fore` as BoneName], kind: 'limb' },
    [`LowerArm.${s}`]: { bone: `${o}_fore` as BoneName, from: `LowerArm.${s}`, to: `Fist.${s}`, ours: [`${o}_fore` as BoneName, `${o}_hand` as BoneName], kind: 'limb' },
    [`Fist.${s}`]: { bone: `${o}_hand` as BoneName, from: `Fist.${s}`, to: `Fist.${s}`, ours: [`${o}_hand` as BoneName, `${o}_hand` as BoneName], kind: 'end' },
    [`UpperLeg.${s}`]: { bone: `${o}_thigh` as BoneName, from: `UpperLeg.${s}`, to: `LowerLeg.${s}`, ours: [`${o}_thigh` as BoneName, `${o}_shin` as BoneName], kind: 'limb' },
    [`LowerLeg.${s}`]: { bone: `${o}_shin` as BoneName, from: `LowerLeg.${s}`, to: `Foot.${s}`, ours: [`${o}_shin` as BoneName, 'ground'], kind: 'limb' },
    [`Foot.${s}`]: { bone: `${o}_foot` as BoneName, from: `Foot.${s}`, to: `Foot.${s}`, ours: [`${o}_foot` as BoneName, `${o}_foot` as BoneName], kind: 'end' },
  };
};
const LIMBS: Record<string, Seg> = { ...SIDE('L'), ...SIDE('R') };
const TORSO = new Set(['Hips', 'Abdomen', 'Torso', 'Body', 'Bone', 'PoleTarget.L', 'PoleTarget.R']);
const HEAD = new Set(['Neck', 'Head']);
const TORSO_BONE: Record<string, BoneName> = { Hips: 'root', Abdomen: 'spine', Torso: 'chest', Neck: 'neck', Head: 'neck' };

export interface ToonShape {
  /** Полнота (ползунок веса) −1 … 1, сильная полнота 0 … 1, мышцы −1 … 1. */
  weight: number;
  heavy: number;
  muscle: number;
}

export interface ToonParts {
  /** Тело (кроме головы): веса костей игры (skinIndex/skinWeight), координаты тела. */
  body: THREE.Mesh;
  /** Голова с волосами и глазами — в координатах относительно шеи (J.neck). */
  head: THREE.Group;
  /** Глаза: сетки, которые «моргают» (масштаб по высоте вокруг центра). */
  eyes: THREE.Mesh[];
  /** Материалы по именам модели (Skin, Shirt, Pants, Belt, Face, Hair). */
  mats: Map<string, THREE.MeshStandardMaterial>;
}

const BI: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

/** Поворот, переводящий направление a в b (кратчайший). */
const align = (a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());

/** Масштаб: вдоль оси d — k, поперёк — kp (и отдельно по глубине kz для корпуса). */
function axisScale(d: THREE.Vector3, k: number, kp: number): THREE.Matrix4 {
  const n = d.clone().normalize();
  const e = (k - kp);
  return new THREE.Matrix4().set(
    kp + e * n.x * n.x, e * n.x * n.y, e * n.x * n.z, 0,
    e * n.y * n.x, kp + e * n.y * n.y, e * n.y * n.z, 0,
    e * n.z * n.x, e * n.z * n.y, kp + e * n.z * n.z, 0,
    0, 0, 0, 1,
  );
}

/**
 * Сетка модели на скелете игры. J — суставы игры (уже с ползунками), J0 — суставы без ползунков
 * (общий масштаб модели), headScale — мульт-голова относительно головы модели.
 */
export function buildToon(name: ToonModel, J: Record<BoneName, THREE.Vector3>, J0: Record<BoneName, THREE.Vector3>, shape: ToonShape, headScale = 1): ToonParts | null {
  const d = data.get(name);
  if (!d) return null;
  const tj = (k: string): THREE.Vector3 => new THREE.Vector3(...d.joints[k]!);
  // Общий масштаб — по ширине плеч.
  const s = (0.8 * (J0.l_upper.x - J0.r_upper.x)) / (tj('UpperArm.L').x - tj('UpperArm.R').x);
  const heavy = Math.max(0, Math.min(1, shape.heavy));
  const w = Math.max(-1, Math.min(1, shape.weight));
  const mu = Math.max(-1, Math.min(1, shape.muscle));
  const fatT = 1 + 0.22 * w + 1.25 * heavy;
  const fatA = 1 + 0.14 * w + 0.12 * mu + 0.8 * heavy;
  const fatL = 1 + 0.16 * w + 0.06 * mu + 0.85 * heavy;
  const chestK = 1 + 0.08 * mu;

  // Матрицы костей модели → тело игры.
  const mats = new Map<string, THREE.Matrix4>();
  // Корпус целиком: таз модели → таз игры, высота — от таза до шеи, ширина — общий масштаб.
  const ky = (J.neck.y - J.root.y) / (tj('Neck').y - tj('Hips').y);
  const torso = new THREE.Matrix4()
    .makeTranslation(J.root.x, J.root.y, J.root.z)
    .multiply(new THREE.Matrix4().makeScale(s * fatT * chestK, ky, s * fatT))
    .multiply(new THREE.Matrix4().makeTranslation(-tj('Hips').x, -tj('Hips').y, -tj('Hips').z));
  for (const b of TORSO) mats.set(b, torso);
  // Голова и шея — целиком, с мульт-увеличением.
  const sh = s * headScale * (1 + 0.12 * heavy);
  const head = new THREE.Matrix4()
    .makeTranslation(J.neck.x, J.neck.y, J.neck.z)
    .multiply(new THREE.Matrix4().makeScale(sh, sh, sh))
    .multiply(new THREE.Matrix4().makeTranslation(-tj('Neck').x, -tj('Neck').y, -tj('Neck').z));
  for (const b of HEAD) mats.set(b, head);
  // Руки и ноги: поворот по направлению кости, длина — как у игры, толщина — общий масштаб.
  const rot = new Map<string, THREE.Quaternion>();
  for (const [b, seg] of Object.entries(LIMBS)) {
    const leg = seg.bone.includes('thigh') || seg.bone.includes('shin') || seg.bone.includes('foot');
    const kp = s * (leg ? fatL : fatA);
    const from = tj(seg.from);
    const at = J[seg.ours[0]];
    let m: THREE.Matrix4;
    if (seg.kind === 'limb') {
      const tdir = tj(seg.to).sub(from);
      const end = seg.ours[1] === 'ground' ? new THREE.Vector3(J[seg.bone.replace('shin', 'foot') as BoneName].x, s * tj(seg.to).y, J[seg.bone.replace('shin', 'foot') as BoneName].z) : J[seg.ours[1]].clone();
      const odir = end.clone().sub(at);
      const q = align(tdir, odir);
      rot.set(b, q);
      const k = odir.length() / tdir.length();
      m = new THREE.Matrix4()
        .makeTranslation(at.x, at.y, at.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
        .multiply(axisScale(tdir, k, kp))
        .multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
    } else {
      // Кисть и стопа: поворот как у родителя, масштаб — общий; стопа — от земли.
      const parent = b.startsWith('Fist') ? b.replace('Fist', 'LowerArm') : b.replace('Foot', 'LowerLeg');
      const q = rot.get(parent) ?? new THREE.Quaternion();
      if (b.startsWith('Foot')) {
        // Стопа: пятка — под лодыжкой игры, подошва — на полу.
        m = new THREE.Matrix4()
          .makeTranslation(at.x, 0, at.z)
          .multiply(new THREE.Matrix4().makeScale(s * 1.15 * (1 + 0.15 * heavy), s, s * 1.15))
          .multiply(new THREE.Matrix4().makeTranslation(-from.x, 0, -from.z));
      } else {
        m = new THREE.Matrix4()
          .makeTranslation(at.x, at.y, at.z)
          .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
          .multiply(new THREE.Matrix4().makeScale(kp * 0.6, kp * 0.6, kp * 0.6))
          .multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
      }
    }
    mats.set(b, m);
  }
  const boneMat = d.bones.map((b) => mats.get(b) ?? torso);
  const boneOurs = d.bones.map((b) => BI[(LIMBS[b]?.bone ?? TORSO_BONE[b] ?? 'root') as BoneName]);
  const isHead = d.bones.map((b) => HEAD.has(b));
  // Живот у полных — вперёд.
  const belly = 1.1 * heavy + 0.25 * Math.max(0, w);
  const abd = d.bones.indexOf('Abdomen');
  const hipsI = d.bones.indexOf('Hips');

  // Сборка сеток: тело (со скиннингом) и голова (жёстко, относительно шеи).
  const bodyPos: number[] = [];
  const bodyIdx: number[] = [];
  const bodySi: number[] = [];
  const bodySw: number[] = [];
  const bodyGroups: Array<{ start: number; count: number; mat: string }> = [];
  const headGroup = new THREE.Group();
  const eyes: THREE.Mesh[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const acc = new THREE.Vector3();
  for (const pr of d.prims) {
    let mat = materials.get(pr.mat);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(pr.col[0], pr.col[1], pr.col[2], THREE.LinearSRGBColorSpace), roughness: 0.82, metalness: 0, flatShading: true });
      mat.name = pr.mat;
      materials.set(pr.mat, mat);
    }
    const pos = new Float32Array(bytes(pr.pos).buffer);
    const raw = bytes(pr.idx);
    const idx = pr.n < 65536 ? new Uint16Array(raw.buffer) : new Uint32Array(raw.buffer);
    const jj = bytes(pr.j);
    const ww = bytes(pr.w);
    const out = new Float32Array(pr.n * 3);
    const headW = new Float32Array(pr.n);
    for (let i = 0; i < pr.n; i += 1) {
      p.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
      acc.set(0, 0, 0);
      let wsum = 0;
      let bellyW = 0;
      for (let k = 0; k < 4; k += 1) {
        const wt = ww[i * 4 + k]! / 255;
        if (wt <= 0) continue;
        const b = jj[i * 4 + k]!;
        q.copy(p).applyMatrix4(boneMat[b]!);
        acc.addScaledVector(q, wt);
        wsum += wt;
        if (isHead[b]) headW[i] = headW[i]! + wt;
        if (b === abd || b === hipsI) bellyW += wt;
      }
      if (wsum > 0) acc.multiplyScalar(1 / wsum);
      if (belly > 0 && bellyW > 0 && p.z > tj('Abdomen').z) {
        const around = Math.exp(-(((p.y - tj('Abdomen').y) / 0.07) ** 2));
        acc.z += (acc.z - J.spine.z) * belly * around * (bellyW / Math.max(wsum, 1e-6));
      }
      out[i * 3] = acc.x;
      out[i * 3 + 1] = acc.y;
      out[i * 3 + 2] = acc.z;
    }
    // Треугольники: голова — если все три вершины в основном на голове.
    const hTris: number[] = [];
    const bStart = bodyIdx.length;
    const base = bodyPos.length / 3;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]!;
      const b = idx[t + 1]!;
      const c = idx[t + 2]!;
      if (headW[a]! > 0.5 && headW[b]! > 0.5 && headW[c]! > 0.5) hTris.push(a, b, c);
      else bodyIdx.push(base + a, base + b, base + c);
    }
    for (let i = 0; i < pr.n; i += 1) {
      bodyPos.push(out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!);
      // Веса костей игры (кости модели, перенесённые на одну кость игры, складываются).
      const agg = new Map<number, number>();
      for (let k = 0; k < 4; k += 1) {
        const wt = ww[i * 4 + k]! / 255;
        if (wt <= 0) continue;
        const ob = boneOurs[jj[i * 4 + k]!]!;
        agg.set(ob, (agg.get(ob) ?? 0) + wt);
      }
      const top = [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((a2, e) => a2 + e[1], 0) || 1;
      for (let k = 0; k < 4; k += 1) {
        bodySi.push(top[k]?.[0] ?? 0);
        bodySw.push((top[k]?.[1] ?? 0) / sum);
      }
    }
    if (bodyIdx.length > bStart) bodyGroups.push({ start: bStart, count: bodyIdx.length - bStart, mat: pr.mat });
    if (hTris.length) {
      // Голова: только нужные вершины, координаты от шеи.
      const remap = new Map<number, number>();
      const hp: number[] = [];
      const hi: number[] = [];
      for (const v0 of hTris) {
        let r = remap.get(v0);
        if (r === undefined) {
          r = hp.length / 3;
          remap.set(v0, r);
          hp.push(out[v0 * 3]! - J.neck.x, out[v0 * 3 + 1]! - J.neck.y, out[v0 * 3 + 2]! - J.neck.z);
        }
        hi.push(r);
      }
      if (pr.mat === 'Face') {
        // Глаза и брови — отдельные куски сетки (по связности). Глаз на каждой стороне моргает
        // масштабом по высоте вокруг своего центра, бровь (верхний кусок) остаётся.
        const key = (v0: number): string => `${Math.round(hp[v0 * 3]! * 1e4)},${Math.round(hp[v0 * 3 + 1]! * 1e4)},${Math.round(hp[v0 * 3 + 2]! * 1e4)}`;
        const up = new Map<string, string>();
        const find = (k: string): string => {
          let r = k;
          while (up.get(r) !== r) r = up.get(r)!;
          up.set(k, r);
          return r;
        };
        for (const v0 of hi) if (!up.has(key(v0))) up.set(key(v0), key(v0));
        for (let t = 0; t < hi.length; t += 3) {
          const r0 = find(key(hi[t]!));
          for (let k = 1; k < 3; k += 1) {
            const r1 = find(key(hi[t + k]!));
            if (r1 !== r0) up.set(r1, r0);
          }
        }
        const comps = new Map<string, number[]>();
        for (let t = 0; t < hi.length; t += 3) {
          const r = find(key(hi[t]!));
          const list = comps.get(r) ?? [];
          list.push(t);
          comps.set(r, list);
        }
        const info = [...comps.values()].map((tris) => {
          let cx = 0;
          let cy = 0;
          for (const t of tris) for (let k = 0; k < 3; k += 1) {
            cx += hp[hi[t + k]! * 3]!;
            cy += hp[hi[t + k]! * 3 + 1]!;
          }
          return { tris, x: cx / (tris.length * 3), y: cy / (tris.length * 3) };
        });
        for (const side of [1, -1]) {
          const mine = info.filter((c) => Math.sign(c.x || 1) === side).sort((x, y) => x.y - y.y);
          if (!mine.length) continue;
          const groups = mine.length > 1 ? [mine.slice(0, -1), mine.slice(-1)] : [mine];
          groups.forEach((grp, gi) => {
            const sp: number[] = [];
            const si2: number[] = [];
            const map2 = new Map<number, number>();
            for (const c of grp)
              for (const t of c.tris)
                for (let k = 0; k < 3; k += 1) {
                  const v0 = hi[t + k]!;
                  let r = map2.get(v0);
                  if (r === undefined) {
                    r = sp.length / 3;
                    map2.set(v0, r);
                    sp.push(hp[v0 * 3]!, hp[v0 * 3 + 1]!, hp[v0 * 3 + 2]!);
                  }
                  si2.push(r);
                }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3));
            g.setIndex(si2);
            g.computeBoundingBox();
            const c = g.boundingBox!.getCenter(new THREE.Vector3());
            g.translate(-c.x, -c.y, -c.z);
            g.computeVertexNormals();
            const em = new THREE.Mesh(g, mat);
            em.position.copy(c);
            const eye = gi === 0;
            em.name = eye ? 'toon-eye' : 'toon-brow';
            headGroup.add(em);
            if (eye) eyes.push(em);
          });
        }
        continue;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hp), 3));
      g.setIndex(hi);
      g.computeVertexNormals();
      const hm = new THREE.Mesh(g, mat);
      hm.name = `toon-head-${pr.mat}`;
      headGroup.add(hm);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bodyPos), 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(bodySi), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(bodySw), 4));
  geo.setIndex(bodyPos.length / 3 < 65536 ? new THREE.BufferAttribute(new Uint16Array(bodyIdx), 1) : new THREE.BufferAttribute(new Uint32Array(bodyIdx), 1));
  const order = [...materials.keys()];
  for (const g of bodyGroups) geo.addGroup(g.start, g.count, order.indexOf(g.mat));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, order.map((k) => materials.get(k)!));
  body.name = 'toon-body';
  return { body, head: headGroup, eyes, mats: materials };
}
