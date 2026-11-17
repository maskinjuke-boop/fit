import * as THREE from 'three';
import { sliderValue, type Appearance, type BodyPart } from '../../../game/state';
import { NECK_WORLD, type BodyShape } from './body';
import { landmarks } from './bodyMesh';
import { BONES } from './rig';
import { fatShift } from './fatBody';
import { weldedNormals } from './skinTex';

/** Номера костей рук (плечо, предплечье, кисть) в скелете. */
const ARM_BONES = new Set<number>(['l_upper', 'l_fore', 'l_hand', 'r_upper', 'r_fore', 'r_hand'].map((b) => (BONES as readonly string[]).indexOf(b)));

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

/** Деформация точки; arm — доля веса костей рук у вершины сетки со скиннингом (если известна). */
export type Morph = ((p: THREE.Vector3, arm?: number) => void) & {
  /** Сколько раз сглаживать долю руки по соседям в сетке (плавный стык рукава и корпуса). */
  armSmooth?: number;
};

/** Значения ползунков (общие «вес» и «мышцы» раскладываются по группам). */
export function bodyValues(a: Pick<Appearance, 'body' | 'heavy'>): Record<BodyPart, number> {
  const b = a.body ?? {};
  const v = (k: BodyPart): number => sliderValue(b[k]);
  const weight = v('weight');
  const muscle = v('muscle');
  // Сильная полнота (ученики-новички): здесь — только шея и плечи; объём тела — в bodyMorph.
  const h = heavyValue(a);
  return {
    height: v('height'),
    weight,
    muscle,
    shoulders: v('shoulders') + muscle * 0.5,
    chest: v('chest') + muscle * 0.35 + weight * 0.25,
    arms: v('arms') + muscle * 0.6 + weight * 0.4,
    neck: v('neck') + muscle * 0.5 + weight * 0.3 + h * 1.2,
    waist: v('waist') + weight * 0.7 - muscle * 0.1,
    belly: v('belly') + weight * 0.8,
    hips: v('hips') + weight * 0.45,
    glutes: v('glutes') + weight * 0.35 + muscle * 0.2,
    legs: v('legs') + muscle * 0.45 + weight * 0.45,
  };
}

/** Полнота лица 0 … 1: у полных учеников (heavy) и при большом весе на ползунке. */
export function faceFat(a: Pick<Appearance, 'body' | 'heavy'>): number {
  const w = sliderValue(a.body?.weight);
  return Math.max(0, Math.min(1, heavyValue(a) + Math.max(0, w - 0.3) * 0.6));
}

/** Во сколько раз крупнее голова у полного (fat — полнота лица): голова под стать телу. */
export const headFatScale = (fat: number): number => 1 + 0.3 * Math.max(0, Math.min(1, fat));

/** Сильная полнота 0 … 1. */
export const heavyValue = (a: Pick<Appearance, 'heavy'>): number => (typeof a.heavy === 'number' && Number.isFinite(a.heavy) ? Math.max(0, Math.min(1, a.heavy)) : 0);

/** Деформация тела по ползункам; null — всё по умолчанию. */
/**
 * under — для сетки самого тела: под одеждой у очень полных тело раздувается чуть меньше
 * одежды, чтобы при сгибах (скиннинг сжимает толстые места) кожа не проступала сквозь неё.
 */
export function bodyMorph(shape: BodyShape, a: Pick<Appearance, 'body' | 'heavy'>, under = false): Morph | null {
  const m = bodyValues(a);
  const parts: BodyPart[] = ['shoulders', 'chest', 'arms', 'neck', 'waist', 'belly', 'hips', 'glutes', 'legs'];
  const H = heavyValue(a);
  // Голова у полных крупнее (масштаб вокруг шарнира шеи) — верх шеи расширяется так же.
  const seamK = headFatScale(faceFat(a)) - 1;
  if (H <= 0 && seamK <= 0 && parts.every((k) => Math.abs(m[k]) < 1e-3)) return null;
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
  const dir = new THREE.Vector3();
  const pivot = new THREE.Vector3(0, NECK_WORLD, 0);
  const f: Morph = (p, armShare) => {
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
    const spread = Math.min(0.13, 0.045 * Math.max(0, m.hips) + 0.03 * Math.max(0, m.waist) + 0.02 * Math.max(0, m.arms) + 0.02 * Math.max(0, m.glutes));
    // Только сама рука (не соседние точки бёдер и брюк с частичным весом руки).
    if (spread && armW > 0) {
      // Ниже локтя кисть висит у бедра: точки бедра ближе к оси ноги, чем кисть, — их не уводим.
      const nearLeg = smooth(shape.elbow.y - 0.05, shape.elbow.y - 0.15, loc.y) * smooth(0.17, 0.115, nl.d);
      d.x += spread * smooth(0.5, 0.92, armW) * (1 - nearLeg) * smooth(shape.shoulder.y, shape.elbow.y, loc.y);
    }
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
      // Сдвиг пропорционален радиусу только в пределах самой шеи (r ≤ 0.07), дальше (трапеции,
      // ключицы) — постоянный и плавно сходит на нет: иначе сетка складывается в «ожерелье».
      const r = Math.hypot(loc.x, loc.z + 0.01) || 1;
      const g = smooth(cy - 0.04, cy + 0.06, loc.y) * smooth(NECK_WORLD, NECK_WORLD - 0.07, loc.y) * smooth(0.2, 0.07, r) * torsoW;
      const k = 0.28 * m.neck * g * Math.min(r, 0.07);
      d.x += (loc.x / r) * k;
      d.z += ((loc.z + 0.01) / r) * k;
    }
    // Талия.
    if (m.waist) {
      const g = Math.exp(-(((loc.y - L.waist) / 0.12) ** 2)) * smooth(0.32, 0.26, ax) * torsoW;
      d.x += loc.x * 0.22 * m.waist * g;
      d.z += loc.z * 0.22 * m.waist * g;
    }
    // Живот вперёд.
    if (m.belly) {
      // Большой живот — шире и ниже, а не острым бугром.
      const big = Math.max(0, m.belly - 1);
      const g = Math.exp(-(((loc.y - (L.waist - 0.05 - 0.02 * big)) / (0.11 + 0.025 * big)) ** 2) - (loc.x / (0.15 + 0.03 * big)) ** 2) * smooth(-0.02, 0.08, loc.z) * torsoW;
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
      // Внутренняя сторона бедра растёт меньше: толстые ноги не проходят друг сквозь друга.
      const dx = (loc.x - ql.x) * k;
      d.x += dx < 0 ? dx * 0.3 : dx;
      d.z += (loc.z - ql.z) * k;
    }
    if (seamK > 0) {
      // Верх шеи и полоса под кожей головы масштабируются вокруг шарнира, как голова: шов без ступеньки.
      // Плавно по радиусу и почти без вертикального сжатия: иначе зазор между кожей и воротом
      // на трапециях уменьшается и кожа проступает сквозь футболку.
      const r = Math.hypot(loc.x, loc.z + 0.02);
      const w = smooth(NECK_WORLD - 0.14, NECK_WORLD - 0.012, loc.y) * smooth(0.26, 0.09, r) * torsoW;
      if (w > 0) {
        dir.subVectors(loc, pivot);
        dir.y *= smooth(NECK_WORLD - 0.06, NECK_WORLD - 0.015, loc.y);
        d.addScaledVector(dir, seamK * w);
      }
    }
    p.x += d.x * sx;
    p.y += d.y;
    p.z += d.z;
    if (H > 0) {
      // Сильная полнота — форма полной модели MakeHuman (сдвиги вершин, усиленные под степень
      // полноты). У шва шеи сдвиг сходит на нет (голова отдельно), под одеждой тело чуть тоньше.
      fatShift(shape.figure, loc.set(p.x - d.x * sx, p.y - d.y, p.z - d.z), armShare, fd);
      const u = under ? 1 - 0.08 * smooth(L.armpit - 0.12, L.armpit - 0.28, loc.y) * smooth(shape.ankle.y + 0.12, shape.ankle.y + 0.3, loc.y) : 1;
      const k = H * FAT_GAIN * u * smooth(NECK_WORLD - 0.015, NECK_WORLD - 0.09, loc.y);
      p.addScaledVector(fd, k);
    }
  };
  if (H > 0) f.armSmooth = 28;
  return f;
}

const shareCache = new WeakMap<THREE.BufferGeometry, Float32Array>();

/** Сглаживание величины на вершинах по соседям (по треугольникам сетки), iter проходов. */
function smoothOnMesh(geo: THREE.BufferGeometry, val: Float32Array, iter: number): void {
  const idx = geo.index;
  if (!idx || iter <= 0) return;
  const n = val.length;
  // Соседи — по совпадающим позициям (у сеток бывают дубли вершин на швах развёртки).
  const pos = geo.getAttribute('position');
  const weld = new Int32Array(n);
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    const j = seen.get(k);
    if (j === undefined) {
      seen.set(k, i);
      weld[i] = i;
    } else weld[i] = j;
  }
  const a: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const v0 = weld[idx.getX(t)]!;
    const v1 = weld[idx.getX(t + 1)]!;
    const v2 = weld[idx.getX(t + 2)]!;
    a.push(v0, v1, v1, v2, v2, v0);
  }
  const sum = new Float32Array(n);
  const cnt = new Float32Array(n);
  const cur = new Float32Array(n);
  for (let i = 0; i < n; i += 1) cur[weld[i]!] = val[i]!;
  for (let it = 0; it < iter; it += 1) {
    sum.fill(0);
    cnt.fill(0);
    for (let e = 0; e < a.length; e += 2) {
      const u = a[e]!;
      const w = a[e + 1]!;
      sum[u] = sum[u]! + cur[w]!;
      cnt[u] = cnt[u]! + 1;
      sum[w] = sum[w]! + cur[u]!;
      cnt[w] = cnt[w]! + 1;
    }
    for (let i = 0; i < n; i += 1) if (cnt[i]) cur[i] = 0.5 * cur[i]! + (0.5 * sum[i]!) / cnt[i]!;
  }
  for (let i = 0; i < n; i += 1) val[i] = cur[weld[i]!]!;
}

/** Во сколько раз усилить сдвиги полной модели MakeHuman у самого полного ученика. */
const FAT_GAIN = 3.6;
const fd = new THREE.Vector3();
/** На сколько (рад) скелет отводит руки от боков у самого полного (Rig.armOut). */
export const HEAVY_ARM_OUT = 0.4;

/** Рост: масштаб героя от земли (±6%). */
export const heightScale = (a: Pick<Appearance, 'body'>): number => 1 + 0.06 * sliderValue(a.body?.height);

/**
 * Применяет деформацию ко всем сеткам группы (в её координатах). Объекты из rigid
 * не искажаются, а переносятся вместе с точкой крепления.
 */
export function applyMorph(group: THREE.Object3D, morph: Morph, rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }>, special?: ReadonlyMap<THREE.Object3D, Morph>): void {
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
    const f = special?.get(me) ?? morph;
    const si = geo.getAttribute('skinIndex');
    const sw = geo.getAttribute('skinWeight');
    let share: Float32Array | null = null;
    if (si && sw) {
      // Доля руки зависит только от весов костей и сетки — сглаженную храним для общей сетки.
      const src = (me.geometry.userData.morphSrc as THREE.BufferGeometry | undefined) ?? me.geometry;
      const cached = f.armSmooth ? shareCache.get(src) : undefined;
      if (cached && cached.length === pos.count) share = cached;
      else {
        share = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i += 1) {
          let arm = 0;
          for (let k = 0; k < 4; k += 1) if (ARM_BONES.has(si.getComponent(i, k))) arm += sw.getComponent(i, k);
          share[i] = arm;
        }
        if (f.armSmooth) {
          smoothOnMesh(geo, share, f.armSmooth);
          if (src.userData.shared === true) shareCache.set(src, share);
        }
      }
    }
    for (let i = 0; i < pos.count; i += 1) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      f(p, share ? share[i] : undefined);
      p.applyMatrix4(inv);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    if (geo.index && geo.getAttribute('color')) {
      // Сетки тела и одежды гладкие — нормали пересчитываем по новой форме
      // (у кожи с развёрткой вершины на швах раздвоены — нормали у них общие).
      geo.deleteAttribute('normal');
      if (geo.getAttribute('uv1')) weldedNormals(geo);
      else geo.computeVertexNormals();
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
