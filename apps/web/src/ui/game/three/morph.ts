import * as THREE from 'three';
import { sliderValue, type Appearance, type BodyPart } from '../../../game/state';
import { NECK_WORLD, type BodyShape } from './body';
import { landmarks } from './bodyMesh';

/**
 * Настройка тела ползунками без повторной «лепки»: плавная деформация пространства вокруг
 * героя. Одна и та же функция сдвигает вершины тела, одежды, поясов и доспехов, поэтому
 * одежда остаётся по фигуре. Кисти, оружие и щит не искажаются — только переносятся.
 */

export type BodyParams = Partial<Record<BodyPart, number>>;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ближайшая точка ломаной и расстояние до неё. */
function nearest(p: THREE.Vector3, pts: THREE.Vector3[], out: THREE.Vector3): { d: number; t: number } {
  let best = Infinity;
  let bt = 0;
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    ab.subVectors(b, a);
    const t = Math.max(0, Math.min(1, ap.subVectors(p, a).dot(ab) / ab.lengthSq()));
    q.copy(a).addScaledVector(ab, t);
    const d = q.distanceTo(p);
    if (d < best) {
      best = d;
      bt = (i + t) / (pts.length - 1);
      out.copy(q);
    }
  }
  return { d: best, t: bt };
}

export type Morph = (p: THREE.Vector3) => void;

/** Значения ползунков (общие «вес» и «мышцы» раскладываются по группам). */
export function bodyValues(a: Pick<Appearance, 'body'>): Record<BodyPart, number> {
  const b = a.body ?? {};
  const v = (k: BodyPart): number => sliderValue(b[k]);
  const weight = v('weight');
  const muscle = v('muscle');
  return {
    height: v('height'),
    weight,
    muscle,
    shoulders: v('shoulders') + muscle * 0.5,
    chest: v('chest') + muscle * 0.35 + weight * 0.25,
    arms: v('arms') + muscle * 0.6 + weight * 0.4,
    neck: v('neck') + muscle * 0.5 + weight * 0.3,
    waist: v('waist') + weight * 0.7 - muscle * 0.1,
    belly: v('belly') + weight * 0.8,
    hips: v('hips') + weight * 0.45,
    glutes: v('glutes') + weight * 0.35 + muscle * 0.2,
    legs: v('legs') + muscle * 0.45 + weight * 0.45,
  };
}

/** Деформация тела по ползункам; null — всё по умолчанию. */
export function bodyMorph(shape: BodyShape, a: Pick<Appearance, 'body'>): Morph | null {
  const m = bodyValues(a);
  const parts: BodyPart[] = ['shoulders', 'chest', 'arms', 'neck', 'waist', 'belly', 'hips', 'glutes', 'legs'];
  if (parts.every((k) => Math.abs(m[k]) < 1e-3)) return null;
  const L = landmarks(shape.figure);
  const female = shape.figure === 'female';
  // Рука до кончиков пальцев: кисть — часть сетки тела и движется вместе с рукой.
  const tip = shape.wrist.clone().addScaledVector(new THREE.Vector3().subVectors(shape.wrist, shape.elbow).normalize(), 0.2);
  const arm = [shape.shoulder.clone(), shape.elbow.clone(), shape.wrist.clone(), tip];
  const leg = [shape.hip.clone().setY(shape.hip.y + 0.04), shape.knee.clone(), shape.ankle.clone()];
  const hipY = shape.hip.y;
  const sy = shape.shoulder.y;
  const cy = L.clavicle[1];
  // Центры груди (у женской фигуры — бюст, у мужской — грудные мышцы) и ягодиц.
  const chestC = L.nipple ? new THREE.Vector3(L.nipple[0] - 0.035, L.nipple[1] + 0.015, L.nipple[2] - 0.065) : new THREE.Vector3(0.09, L.armpit - 0.06, 0.09);
  const chestR = female ? 0.1 : 0.11;
  const gluteC = new THREE.Vector3(female ? 0.095 : 0.085, hipY - 0.06, female ? -0.11 : -0.1);
  const qa = new THREE.Vector3();
  const ql = new THREE.Vector3();
  const loc = new THREE.Vector3();
  const d = new THREE.Vector3();
  return (p) => {
    const sx = p.x < 0 ? -1 : 1;
    // Работаем в правой половине (тело симметрично), сдвиг затем отражаем.
    loc.set(Math.abs(p.x), p.y, p.z);
    const ax = loc.x;
    const na = nearest(loc, arm, qa);
    const armW = smooth(0.11, 0.07, na.d) * smooth(0.17, 0.24, ax);
    const nl = nearest(loc, leg, ql);
    const legW = smooth(0.2, 0.12, nl.d) * smooth(hipY + 0.1, hipY - 0.08, loc.y);
    const torsoW = 1 - armW;
    d.set(0, 0, 0);
    // Плечи: руки целиком и плечевой пояс сдвигаются наружу.
    if (m.shoulders) {
      const w = Math.max(armW, smooth(0.07, 0.22, ax) * smooth(sy - 0.24, sy - 0.02, loc.y) * (1 - legW));
      d.x += 0.045 * m.shoulders * w;
    }
    // Грудь: объём растёт от центра внутри грудной клетки наружу.
    if (m.chest) {
      const g = Math.exp(-loc.distanceToSquared(chestC) / (chestR * chestR)) * smooth(-0.03, 0.06, loc.z) * torsoW;
      const k = (female ? 0.42 : 0.32) * m.chest * g;
      d.x += (loc.x - chestC.x) * k;
      d.y += (loc.y - chestC.y) * k * 0.8;
      d.z += (loc.z - (chestC.z - 0.09)) * k;
    }
    // Руки отходят от тела, когда шире бёдра, талия или руки, — чтобы не входили в корпус.
    const spread = 0.045 * Math.max(0, m.hips) + 0.03 * Math.max(0, m.waist) + 0.02 * Math.max(0, m.arms) + 0.02 * Math.max(0, m.glutes);
    if (spread && armW > 0) d.x += spread * armW * smooth(shape.shoulder.y, shape.elbow.y, loc.y);
    // Руки толще или тоньше (кисть не меняется).
    if (m.arms && armW > 0) {
      const k = 0.35 * m.arms * armW * smooth(shape.wrist.y + 0.01, shape.wrist.y + 0.12, loc.y);
      d.x += (loc.x - qa.x) * k;
      d.y += (loc.y - qa.y) * k;
      d.z += (loc.z - qa.z) * k;
    }
    // Шея.
    if (m.neck) {
      // К шву с головой (верх шеи) утолщение сходит на нет — шея и голова стыкуются без ступеньки.
      const g = smooth(cy - 0.04, cy + 0.06, loc.y) * smooth(NECK_WORLD, NECK_WORLD - 0.07, loc.y) * smooth(0.13, 0.08, Math.hypot(loc.x, loc.z + 0.01)) * torsoW;
      d.x += loc.x * 0.28 * m.neck * g;
      d.z += (loc.z + 0.01) * 0.28 * m.neck * g;
    }
    // Талия.
    if (m.waist) {
      const g = Math.exp(-(((loc.y - L.waist) / 0.12) ** 2)) * smooth(0.32, 0.26, ax) * torsoW;
      d.x += loc.x * 0.22 * m.waist * g;
      d.z += loc.z * 0.22 * m.waist * g;
    }
    // Живот вперёд.
    if (m.belly) {
      const g = Math.exp(-(((loc.y - (L.waist - 0.05)) / 0.11) ** 2) - (loc.x / 0.15) ** 2) * smooth(-0.02, 0.08, loc.z) * torsoW;
      d.z += 0.07 * m.belly * g;
      d.y -= 0.01 * m.belly * g;
    }
    // Бёдра (таз и верх бедра).
    if (m.hips) {
      const g = Math.exp(-(((loc.y - (hipY - 0.04)) / 0.13) ** 2)) * smooth(0.38, 0.32, ax) * torsoW;
      d.x += loc.x * 0.16 * m.hips * g;
      d.z += loc.z * 0.06 * m.hips * g;
    }
    // Ягодицы.
    if (m.glutes) {
      const g = Math.exp(-loc.distanceToSquared(gluteC) / 0.012) * smooth(0.03, -0.05, loc.z) * torsoW;
      d.x += (loc.x - gluteC.x) * 0.3 * m.glutes * g;
      d.y += (loc.y - gluteC.y) * 0.2 * m.glutes * g;
      d.z += (loc.z - (gluteC.z + 0.07)) * 0.35 * m.glutes * g;
    }
    // Ноги толще или тоньше (у щиколотки — меньше, там обувь).
    if (m.legs && legW > 0) {
      const k = 0.3 * m.legs * legW * smooth(shape.ankle.y + 0.05, shape.ankle.y + 0.2, loc.y);
      d.x += (loc.x - ql.x) * k;
      d.z += (loc.z - ql.z) * k;
    }
    p.x += d.x * sx;
    p.y += d.y;
    p.z += d.z;
  };
}

/** Рост: масштаб героя от земли (±6%). */
export const heightScale = (a: Pick<Appearance, 'body'>): number => 1 + 0.06 * sliderValue(a.body?.height);

/**
 * Применяет деформацию ко всем сеткам группы (в её координатах). Объекты из rigid
 * не искажаются, а переносятся вместе с точкой крепления.
 */
export function applyMorph(group: THREE.Object3D, morph: Morph, rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }>): void {
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const skip = new Set<THREE.Object3D>();
  for (const r of rigid) r.obj.traverse((o) => skip.add(o));
  const m = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  const p = new THREE.Vector3();
  group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || skip.has(me)) return;
    m.multiplyMatrices(toGroup, me.matrixWorld);
    inv.copy(m).invert();
    // Общие сетки (тело, одежда из кэша) не трогаем — деформируем копию.
    const geo = me.geometry.clone();
    geo.userData = {};
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      morph(p);
      p.applyMatrix4(inv);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    if (geo.index && geo.getAttribute('color')) {
      // Сетки тела и одежды гладкие — нормали пересчитываем по новой форме.
      geo.deleteAttribute('normal');
      geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();
    if (me.geometry.userData.shared !== true) me.geometry.dispose();
    me.geometry = geo;
  });
  for (const r of rigid) {
    p.copy(r.anchor);
    morph(p);
    r.obj.position.add(p.sub(r.anchor));
  }
}
