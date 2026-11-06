import * as THREE from 'three';
import { bvhPose, jointIndex, type Bvh } from './bvh';

/**
 * Перенос записи CMU (BVH, «Motionbuilder-friendly» от B. Hahne: кадр 0 — T-поза, 120 к/с,
 * единица — 1/0.45 дюйма) на скелет игры.
 *
 * Повороты: для каждой нашей кости берётся мировой поворот сустава записи R(t). Позы покоя
 * разные (у записи T-поза, у нас руки опущены), поэтому сначала поза записи «доводится» до
 * нашей: Δ — кратчайший поворот направления кости записи в эталонном кадре к направлению
 * нашей кости в покое. Мировой поворот нашей кости — R(t) · R(эталон)⁻¹ · Δ⁻¹ (в покое наши
 * кости без поворота), локальный — относительно мирового поворота родителя.
 * Эталон стоп и пальцев — не T-поза, а средняя поза стопы, стоящей на полу: плоская стопа
 * записи → плоская стопа нашей модели.
 *
 * Положения: центр тазобедренных суставов и голеностопы — в метрах записи, повёрнутые так,
 * чтобы движение шло по +Z, без поступательного движения (см. build.ts), и умноженные на
 * отношение длин ног (наша модель / актёр). Высота отсчитывается от голеностопа плоской
 * стопы на полу.
 */

/** Метров в единице файла CMU (1/0.45 дюйма). */
export const CMU_UNIT = 0.0254 / 0.45;

export type OurBone =
  | 'root'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'l_clav'
  | 'l_upper'
  | 'l_fore'
  | 'l_hand'
  | 'r_clav'
  | 'r_upper'
  | 'r_fore'
  | 'r_hand'
  | 'l_thigh'
  | 'l_shin'
  | 'l_foot'
  | 'l_toe'
  | 'r_thigh'
  | 'r_shin'
  | 'r_foot'
  | 'r_toe';

/** Наша кость ← сустав записи и сустав, задающий направление кости ('end' — конец цепочки, 'flat' — эталон по плоской стопе). */
const MAP: ReadonlyArray<[OurBone, string, string]> = [
  ['root', 'Hips', 'none'],
  ['spine', 'Spine', 'Spine1'],
  ['chest', 'Spine1', 'Neck1'],
  ['neck', 'Head', 'end'],
  ['l_clav', 'LeftShoulder', 'LeftArm'],
  ['l_upper', 'LeftArm', 'LeftForeArm'],
  ['l_fore', 'LeftForeArm', 'LeftHand'],
  ['l_hand', 'LeftHand', 'LeftHandIndex1'],
  ['r_clav', 'RightShoulder', 'RightArm'],
  ['r_upper', 'RightArm', 'RightForeArm'],
  ['r_fore', 'RightForeArm', 'RightHand'],
  ['r_hand', 'RightHand', 'RightHandIndex1'],
  ['l_thigh', 'LeftUpLeg', 'LeftLeg'],
  ['l_shin', 'LeftLeg', 'LeftFoot'],
  ['l_foot', 'LeftFoot', 'flat'],
  ['l_toe', 'LeftToeBase', 'flat'],
  ['r_thigh', 'RightUpLeg', 'RightLeg'],
  ['r_shin', 'RightLeg', 'RightFoot'],
  ['r_foot', 'RightFoot', 'flat'],
  ['r_toe', 'RightToeBase', 'flat'],
];

/** Наш скелет в покое: суставы (координаты тела) и родители. */
export interface Target {
  joints: Record<OurBone | 'l_hand_tip' | 'r_hand_tip', THREE.Vector3>;
  parent: Record<OurBone, OurBone | null>;
}

/** Мировая поза записи в метрах. */
export interface WorldFrame {
  pos: THREE.Vector3[];
  rot: THREE.Quaternion[];
}

export function worldFrames(bvh: Bvh): WorldFrame[] {
  return bvh.frames.map((_, f) => {
    const p = bvhPose(bvh, f);
    return { pos: p.pos.map((v) => v.multiplyScalar(CMU_UNIT)), rot: p.rot };
  });
}

/** Усреднение кватернионов (одного полушария) — для эталона плоской стопы. */
export function averageQuat(qs: readonly THREE.Quaternion[]): THREE.Quaternion {
  const acc = new THREE.Vector4();
  const first = qs[0]!;
  for (const q of qs) {
    const s = q.x * first.x + q.y * first.y + q.z * first.z + q.w * first.w < 0 ? -1 : 1;
    acc.x += q.x * s;
    acc.y += q.y * s;
    acc.z += q.z * s;
    acc.w += q.w * s;
  }
  return new THREE.Quaternion(acc.x, acc.y, acc.z, acc.w).normalize();
}

/** Длина ноги записи (тазобедренный — колено — голеностоп) в T-позе, м. */
export function bvhLeg(bvh: Bvh, f0: WorldFrame): number {
  const a = f0.pos[jointIndex(bvh, 'LeftUpLeg')]!;
  const b = f0.pos[jointIndex(bvh, 'LeftLeg')]!;
  const c = f0.pos[jointIndex(bvh, 'LeftFoot')]!;
  return a.distanceTo(b) + b.distanceTo(c);
}

export const targetLeg = (t: Target): number => t.joints.l_thigh.distanceTo(t.joints.l_shin) + t.joints.l_shin.distanceTo(t.joints.l_foot);

/** Постоянные переноса: эталонные повороты записи и поправки Δ⁻¹ для каждой нашей кости. */
export interface Retarget {
  bones: OurBone[];
  src: number[];
  /** R(эталон)⁻¹ · Δ⁻¹ — умножается справа на мировой поворот сустава записи. */
  post: THREE.Quaternion[];
}

/**
 * flatFeet — средние мировые повороты стоп и пальцев записи, когда стопа стоит на полу
 * (l_foot, l_toe, r_foot, r_toe); без них эталон стоп — T-поза.
 */
export function makeRetarget(bvh: Bvh, f0: WorldFrame, target: Target, flatFeet?: Partial<Record<OurBone, THREE.Quaternion>>): Retarget {
  const J = target.joints;
  const dir = (b: OurBone): THREE.Vector3 => {
    switch (b) {
      case 'neck':
        return new THREE.Vector3(0, 1, 0);
      case 'l_hand':
        return J.l_hand_tip.clone().sub(J.l_hand).normalize();
      case 'r_hand':
        return J.r_hand_tip.clone().sub(J.r_hand).normalize();
      default: {
        // Направление к дочернему суставу.
        const child = (Object.keys(target.parent) as OurBone[]).find((c) => target.parent[c] === b && !c.endsWith('_clav') && !c.endsWith('_thigh'));
        return J[child!].clone().sub(J[b]).normalize();
      }
    }
  };
  const bones: OurBone[] = [];
  const src: number[] = [];
  const post: THREE.Quaternion[] = [];
  for (const [b, name, to] of MAP) {
    const j = jointIndex(bvh, name);
    bones.push(b);
    src.push(j);
    if (to === 'none') {
      post.push(f0.rot[j]!.clone().invert());
      continue;
    }
    if (to === 'flat') {
      const ref = flatFeet?.[b] ?? f0.rot[j]!;
      post.push(ref.clone().invert());
      continue;
    }
    let d: THREE.Vector3;
    if (to === 'end') {
      const e = bvh.joints[j]!.end!.clone().multiplyScalar(CMU_UNIT);
      d = e.applyQuaternion(f0.rot[j]!).normalize();
    } else d = f0.pos[jointIndex(bvh, to)]!.clone().sub(f0.pos[j]!).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(d, dir(b));
    post.push(f0.rot[j]!.clone().invert().multiply(delta.invert()));
  }
  return { bones, src, post };
}

/** Мировые повороты наших костей в кадре (в осях, повёрнутых на −yaw вокруг Y). */
export function ourWorld(rt: Retarget, fr: WorldFrame, yaw: number): THREE.Quaternion[] {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  return rt.bones.map((_, i) => turn.clone().multiply(fr.rot[rt.src[i]!]!).multiply(rt.post[i]!));
}

/** Локальные повороты из мировых. */
export function toLocal(rt: Retarget, target: Target, world: readonly THREE.Quaternion[]): THREE.Quaternion[] {
  const at = new Map(rt.bones.map((b, i) => [b, i]));
  return rt.bones.map((b, i) => {
    const p = target.parent[b];
    if (!p) return world[i]!.clone();
    return world[at.get(p)!]!.clone().invert().multiply(world[i]!);
  });
}
