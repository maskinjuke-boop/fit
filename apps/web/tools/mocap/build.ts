/**
 * Конвейер клипов захвата движения: BVH из CMU Graphics Lab Motion Capture Database
 * (конвертация B. Hahne, cgspeed) → наш скелет → src/ui/game/three/mocapClips.ts.
 *
 * Запуск (из apps/web): tsx tools/mocap/build.ts <папка data репозитория cmu-mocap>
 * Нужны только файлы из SPECS; сами BVH в репозиторий игры не кладутся.
 *
 * Ходьба и бег: берётся один цикл (от постановки левой стопы до следующей) из середины
 * записи, направление движения поворачивается на +Z, поступательное движение убирается:
 * система отсчёта клипа едет с постоянной скоростью (путь левой стопы за цикл / время), так
 * что опорная стопа в клипе едет назад ровно со скоростью тела. Шов цикла сглаживается
 * (closeLoop), у стоп — только пока они в воздухе.
 * Стойка на месте: отрезок записи, у которого поза в конце ближе всего к позе в начале,
 * конец плавно переходит в начало (crossfadeLoop).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { BONES, joints } from '../../src/ui/game/three/rig';
import { parseBvh, jointIndex, type Bvh } from './bvh';
import { closeLoop, crossfadeLoop, packClip, type ClipFrame } from './clip';
import { lockFeet, type FootFlags, type RawFrame } from './feet';
import { averageQuat, bvhLeg, makeRetarget, ourWorld, targetLeg, toLocal, worldFrames, type OurBone, type Target, type WorldFrame } from './retarget';

interface Spec {
  name: string;
  file: string;
  kind: 'gait' | 'idle';
  /** Стойка: где искать отрезок (с) и его длительность (с). */
  search?: [number, number];
  length?: [number, number];
  note: string;
}

export const SPECS: Spec[] = [
  { name: 'walk_slow', file: '007/07_04.bvh', kind: 'gait', note: '07_04 slow walk' },
  { name: 'walk', file: '007/07_01.bvh', kind: 'gait', note: '07_01 walk' },
  { name: 'walk_fast', file: '007/07_12.bvh', kind: 'gait', note: '07_12 brisk walk' },
  { name: 'jog', file: '002/02_03.bvh', kind: 'gait', note: '02_03 run/jog' },
  { name: 'idle', file: '139/139_02.bvh', kind: 'idle', search: [0.3, 7.7], length: [4, 7], note: '139_02 shifting weight' },
];

const FPS = 30;
/** Ходьба: средняя ширина следа стопы от середины (м модели) и отведение рук (рад). */
const FOOT_X = 0.1;
const ARM_OUT = 0.1;
const UP = new THREE.Vector3(0, 1, 0);

/** Наш эталонный скелет (женская фигура без ползунков). */
export function canonTarget(): Target {
  const J = joints('female');
  const tip = (h: THREE.Vector3, f: THREE.Vector3): THREE.Vector3 => h.clone().add(h.clone().sub(f).setLength(0.08));
  const parent: Target['parent'] = {
    root: null,
    spine: 'root',
    chest: 'spine',
    neck: 'chest',
    l_clav: 'chest',
    l_upper: 'l_clav',
    l_fore: 'l_upper',
    l_hand: 'l_fore',
    r_clav: 'chest',
    r_upper: 'r_clav',
    r_fore: 'r_upper',
    r_hand: 'r_fore',
    l_thigh: 'root',
    l_shin: 'l_thigh',
    l_foot: 'l_shin',
    l_toe: 'l_foot',
    r_thigh: 'root',
    r_shin: 'r_thigh',
    r_foot: 'r_shin',
    r_toe: 'r_foot',
  };
  return { joints: { ...J, l_hand_tip: tip(J.l_hand, J.l_fore), r_hand_tip: tip(J.r_hand, J.r_fore) }, parent };
}

/** Мировой кадр в дробный момент x (кадры): линейно положения, сферически повороты. */
function frameAt(W: readonly WorldFrame[], x: number): WorldFrame {
  const i = Math.max(0, Math.min(W.length - 2, Math.floor(x)));
  const t = Math.max(0, Math.min(1, x - i));
  const a = W[i]!;
  const b = W[i + 1]!;
  return { pos: a.pos.map((p, k) => p.clone().lerp(b.pos[k]!, t)), rot: a.rot.map((q, k) => q.clone().slerp(b.rot[k]!, t)) };
}

export interface Joints {
  hips: number;
  lu: number;
  ru: number;
  lf: number;
  rf: number;
  lt: number;
  rt: number;
}

const horiz = (v: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(v.x, 0, v.z);

/** Горизонтальная скорость сустава j в кадре i (м/с). */
function speed(W: readonly WorldFrame[], j: number, i: number, dt: number): number {
  const a = W[Math.max(1, i - 1)]!.pos[j]!;
  const b = W[Math.min(W.length - 1, i + 1)]!.pos[j]!;
  const n = Math.min(W.length - 1, i + 1) - Math.max(1, i - 1);
  return Math.hypot(b.x - a.x, b.z - a.z) / (n * dt);
}

const percentile = (a: number[], q: number): number => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * q)]!;

/** Убирает дребезг признака: короткие (≤ 4 кадров) провалы и всплески. */
function clean(a: boolean[]): void {
  for (const v of [true, false]) {
    let i = 0;
    while (i < a.length) {
      if (a[i] === v) {
        i += 1;
        continue;
      }
      let j = i;
      while (j < a.length && a[j] !== v) j += 1;
      if (i > 0 && j < a.length && j - i <= 4) for (let k = i; k < j; k += 1) a[k] = v;
      i = j;
    }
  }
}

/**
 * Опора стопы по кадрам: голеностоп неподвижен (пятка/вся стопа) и/или подушечка неподвижна.
 * С полом floor — ещё и низко над ним (у CMU пол бывает наклонён, поэтому высота — от
 * плоскости; без пола — только по скорости).
 */
function contacts(W: readonly WorldFrame[], ankle: number, toe: number, dt: number, floor?: { a: number; t: number; bx: number; bz: number }, thr = 0.3): { ank: boolean[]; toe: boolean[] } {
  const n = W.length;
  const ank: boolean[] = [false];
  const tc: boolean[] = [false];
  const low = (p: THREE.Vector3, base: number, h: number): boolean => !floor || p.y - (base + floor.bx * p.x + floor.bz * p.z) < h;
  for (let i = 1; i < n; i += 1) {
    ank.push(speed(W, ankle, i, dt) < thr * 0.7 && low(W[i]!.pos[ankle]!, floor?.a ?? 0, 0.03));
    tc.push(speed(W, toe, i, dt) < thr && low(W[i]!.pos[toe]!, floor?.t ?? 0, 0.03));
  }
  clean(ank);
  clean(tc);
  return { ank, toe: tc };
}

/** Опора обеих стоп: сначала по скорости, затем — с высотой над подобранным полом. */
export function footContacts(W: readonly WorldFrame[], J: Joints, dt: number): { cl: ReturnType<typeof contacts>; cr: ReturnType<typeof contacts>; floor: Floor } {
  let cl = contacts(W, J.lf, J.lt, dt);
  let cr = contacts(W, J.rf, J.rt, dt);
  const floor = fitFloor(W, J, cl, cr);
  // Уровень подушечки над плоскостью пола — медиана по плоским стопам.
  const toeBase = (c: ReturnType<typeof contacts>, j: number): number => {
    const d = W.map((f, i) => (c.ank[i] && c.toe[i] ? f.pos[j]!.y - floor.bx * f.pos[j]!.x - floor.bz * f.pos[j]!.z : NaN)).filter((x) => !Number.isNaN(x));
    return percentile(d, 0.5);
  };
  cl = contacts(W, J.lf, J.lt, dt, { a: floor.a[0], t: toeBase(cl, J.lt), bx: floor.bx, bz: floor.bz });
  cr = contacts(W, J.rf, J.rt, dt, { a: floor.a[1], t: toeBase(cr, J.rt), bx: floor.bx, bz: floor.bz });
  return { cl, cr, floor: fitFloor(W, J, cl, cr) };
}

/**
 * Пол записи: у CMU он бывает чуть наклонён (до 2 см на метр), а маркеры голеностопов у
 * левой и правой ноги стоят на разной высоте. Плоскость y = a[стопа] + bx·x + bz·z
 * подбирается по голеностопам плоских стоп (наименьшие квадраты).
 */
export interface Floor {
  a: [number, number];
  bx: number;
  bz: number;
}

function fitFloor(W: readonly WorldFrame[], J: Joints, cl: ReturnType<typeof contacts>, cr: ReturnType<typeof contacts>): Floor {
  // Нормальные уравнения для [aL, aR, bx, bz].
  const A = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const B = [0, 0, 0, 0];
  for (let i = 1; i < W.length; i += 1)
    for (const [c, j, side] of [[cl, J.lf, 0], [cr, J.rf, 1]] as const) {
      if (!c.ank[i] || !c.toe[i]) continue;
      const p = W[i]!.pos[j]!;
      const row = [side === 0 ? 1 : 0, side === 1 ? 1 : 0, p.x, p.z];
      for (let r = 0; r < 4; r += 1) {
        for (let k = 0; k < 4; k += 1) A[r]![k]! += row[r]! * row[k]!;
        B[r]! += row[r]! * p.y;
      }
    }
  // Небольшая регуляризация наклона: при стойке на месте он не определяется.
  A[2]![2]! += 1e-2;
  A[3]![3]! += 1e-2;
  for (let r = 0; r < 4; r += 1) {
    const piv = A[r]![r]!;
    for (let k = r; k < 4; k += 1) A[r]![k]! /= piv;
    B[r]! /= piv;
    for (let q = 0; q < 4; q += 1) {
      if (q === r) continue;
      const f = A[q]![r]!;
      for (let k = r; k < 4; k += 1) A[q]![k]! -= f * A[r]![k]!;
      B[q]! -= f * B[r]!;
    }
  }
  return { a: [B[0]!, B[1]!], bx: B[2]!, bz: B[3]! };
}

/** Средние повороты стоп и пальцев, стоящих на полу (в осях с поворотом −yaw). */
function flatRefs(bvh: Bvh, W: readonly WorldFrame[], J: Joints, cl: ReturnType<typeof contacts>, cr: ReturnType<typeof contacts>, yaw: number, from = 1, to = W.length): Partial<Record<OurBone, THREE.Quaternion>> {
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, -yaw);
  // Только середина каждого интервала плоской опоры: края — это ещё постановка или уже перекат.
  const pick = (c: ReturnType<typeof contacts>, j: number): THREE.Quaternion => {
    const qs: THREE.Quaternion[] = [];
    for (let i = from; i < to; ) {
      if (!(c.ank[i] && c.toe[i])) {
        i += 1;
        continue;
      }
      let e = i;
      while (e + 1 < to && c.ank[e + 1] && c.toe[e + 1]) e += 1;
      const q = Math.floor((e - i) / 4);
      for (let k = i + q; k <= e - q; k += 1) qs.push(turn.clone().multiply(W[k]!.rot[j]!));
      i = e + 1;
    }
    if (!qs.length) throw new Error(`${bvh.joints[j]!.name}: нет кадров с плоской стопой`);
    return averageQuat(qs);
  };
  return { l_foot: pick(cl, J.lf), l_toe: pick(cl, J.lt), r_foot: pick(cr, J.rf), r_toe: pick(cr, J.rt) };
}

interface Built {
  frames: ClipFrame[];
  stride: number;
  /** Ходьба: доли цикла, когда левая стопа отрывается, правая встаёт и отрывается (левая встаёт в 0). */
  events?: { lOff: number; rOn: number; rOff: number };
  info: string;
}

/** Кадр клипа в нашей системе: yaw — направление движения, origin(x) — точка отсчёта на полу. */
function makeFrame(rt: ReturnType<typeof makeRetarget>, target: Target, fr: WorldFrame, J: Joints, yaw: number, origin: THREE.Vector3, S: number, floor: Floor): RawFrame {
  const Jt = target.joints;
  const world = ourWorld(rt, fr, yaw);
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, -yaw);
  const hipRest = Jt.l_thigh.clone().add(Jt.r_thigh).multiplyScalar(0.5);
  // Высота — от плоскости пола (у каждой стопы — свой уровень маркера голеностопа).
  const place = (p: THREE.Vector3, a: number): THREE.Vector3 => {
    const v = p.clone().sub(origin).applyQuaternion(turn);
    const fy = a + floor.bx * p.x + floor.bz * p.z;
    return new THREE.Vector3(v.x * S, Jt.l_foot.y + (p.y - fy) * S, v.z * S + hipRest.z);
  };
  const mid = fr.pos[J.lu]!.clone().add(fr.pos[J.ru]!).multiplyScalar(0.5);
  const M = place(mid, (floor.a[0] + floor.a[1]) / 2);
  // Таз: центр тазобедренных суставов — как у записи, сам корень — с учётом поворота таза.
  const rootQ = world[0]!;
  const root = M.sub(hipRest.clone().sub(Jt.root).applyQuaternion(rootQ)).sub(Jt.root);
  return { world, root, feet: [place(fr.pos[J.lf]!, floor.a[0]), place(fr.pos[J.rf]!, floor.a[1])] };
}

/** Опора стоп в кадрах клипа (по ближайшему кадру записи); дребезг в 1–2 кадра (по кругу) — ещё опора. */
function sampleFlags(c: ReturnType<typeof contacts>, at: (k: number) => number, n: number): FootFlags {
  const ank: boolean[] = [];
  const toe: boolean[] = [];
  for (let k = 0; k < n; k += 1) {
    const i = Math.round(at(k));
    ank.push(Boolean(c.ank[i]));
    toe.push(Boolean(c.toe[i]));
  }
  const close = (a: boolean[]): boolean[] => a.map((x, k) => x || ((a[(k + n - 1) % n]! || a[(k + n - 2) % n]!) && (a[(k + 1) % n]! || a[(k + 2) % n]!)));
  return { ank: close(ank), toe: close(toe) };
}

/** Мировые повороты из локальных (родители в MAP идут раньше детей). */
function toWorld(rt: ReturnType<typeof makeRetarget>, target: Target, q: readonly THREE.Quaternion[]): THREE.Quaternion[] {
  const out: THREE.Quaternion[] = [];
  rt.bones.forEach((b, i) => {
    const p = target.parent[b];
    out.push(p ? out[rt.bones.indexOf(p)]!.clone().multiply(q[i]!) : q[i]!.clone());
  });
  return out;
}

/** Замкнутый цикл: стопы на полу без скольжения (мир едет на stride за цикл). */
function finish(frames: ClipFrame[], rt: ReturnType<typeof makeRetarget>, target: Target, flags: [FootFlags, FootFlags], stride: number): ClipFrame[] {
  const J = target.joints;
  const geo = { ankleY: J.l_foot.y, heel: new THREE.Vector3(0, -J.l_foot.y, -0.055), ball: J.l_toe.clone().sub(J.l_foot).setX(0) };
  const i = (b: OurBone): number => rt.bones.indexOf(b);
  const raw: RawFrame[] = frames.map((f) => ({ world: toWorld(rt, target, f.q), root: f.root, feet: f.feet }));
  if (stride > 0) {
    // Ходьба: у актёров стопы ставятся почти на одну линию, а у нашей фигуры бёдра шире —
    // выглядело бы как «от бедра» на подиуме. Средняя ширина следа — не уже ±FOOT_X.
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? 1 : -1;
      const mean = raw.reduce((a, r) => a + r.feet[side].x, 0) / raw.length;
      if (mean * sx < FOOT_X) for (const r of raw) r.feet[side].x += sx * FOOT_X - mean;
    }
    // Руки чуть в стороны: кисть на махе вперёд проходит перед бедром, а не перед животом.
    for (const [side, sx] of [['l', 1], ['r', -1]] as const) {
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sx * ARM_OUT);
      for (const r of raw) for (const b of ['upper', 'fore', 'hand'] as const) r.world[i(`${side}_${b}`)]!.premultiply(turn);
    }
  }
  lockFeet(raw, flags, stride, geo, [i('l_foot'), i('r_foot')], [i('l_toe'), i('r_toe')]);
  return raw.map((r) => ({ q: toLocal(rt, target, r.world), root: r.root, feet: r.feet }));
}

const local = (rt: ReturnType<typeof makeRetarget>, target: Target, r: RawFrame): ClipFrame => ({ q: toLocal(rt, target, r.world), root: r.root, feet: r.feet });

function gait(bvh: Bvh, target: Target): Built {
  const W = worldFrames(bvh);
  const f0 = W[0]!;
  const J: Joints = {
    hips: jointIndex(bvh, 'Hips'),
    lu: jointIndex(bvh, 'LeftUpLeg'),
    ru: jointIndex(bvh, 'RightUpLeg'),
    lf: jointIndex(bvh, 'LeftFoot'),
    rf: jointIndex(bvh, 'RightFoot'),
    lt: jointIndex(bvh, 'LeftToeBase'),
    rt: jointIndex(bvh, 'RightToeBase'),
  };
  const S = targetLeg(target) / bvhLeg(bvh, f0);
  const { cl, cr, floor } = footContacts(W, J, bvh.dt);
  // Постановки левой стопы: начало неподвижности голеностопа после переноса (стопа летела быстрее 1 м/с).
  const strikes: number[] = [];
  for (let i = 30; i < W.length; i += 1) {
    if (!cl.ank[i] || cl.ank.slice(i - 6, i).some(Boolean)) continue;
    let swung = false;
    for (let k = i - 30; k < i; k += 1) swung ||= speed(W, J.lf, k, bvh.dt) > 1;
    if (swung) strikes.push(i);
  }
  // Интервал опоры, начиная с постановки: средняя точка стопы.
  const stanceMean = (s: number): THREE.Vector3 | null => {
    const acc = new THREE.Vector3();
    let n = 0;
    for (let i = s; i < W.length && cl.ank[i]; i += 1, n += 1) acc.add(W[i]!.pos[J.lf]!);
    const end = s + n;
    return n >= 6 && end < W.length - 1 ? acc.divideScalar(n) : null;
  };
  let best: [number, number] | null = null;
  const middle = W.length / 2;
  for (let k = 0; k + 1 < strikes.length; k += 1) {
    const a = strikes[k]!;
    const b = strikes[k + 1]!;
    if (!stanceMean(a) || !stanceMean(b)) continue;
    if (!best || Math.abs((a + b) / 2 - middle) < Math.abs((best[0] + best[1]) / 2 - middle)) best = [a, b];
  }
  if (!best) throw new Error(`не найден полный цикл шага: постановки ${strikes.join(", ")}`);
  const [s0, s1] = best;
  const stride = horiz(stanceMean(s1)!.sub(stanceMean(s0)!));
  const yaw = Math.atan2(stride.x, stride.z);
  const rt = makeRetarget(bvh, f0, target, flatRefs(bvh, W, J, cl, cr, yaw));
  const N = Math.round((s1 - s0) * bvh.dt * FPS);
  const at = (k: number): number => s0 + ((s1 - s0) * k) / N;
  // Точка отсчёта едет равномерно; в среднем таз над ней.
  const origin0 = new THREE.Vector3();
  for (let k = 0; k < N; k += 1) {
    const fr = frameAt(W, at(k));
    origin0.add(horiz(fr.pos[J.lu]!.clone().add(fr.pos[J.ru]!).multiplyScalar(0.5)).addScaledVector(stride, -k / N));
  }
  origin0.divideScalar(N);
  const raw: ClipFrame[] = [];
  for (let k = 0; k <= N; k += 1) raw.push(local(rt, target, makeFrame(rt, target, frameAt(W, at(k)), J, yaw, origin0.clone().addScaledVector(stride, k / N), S, floor)));
  // Перенос каждой ноги (доли цикла) — там раскладывается разрыв шва у костей ноги.
  const swingOf = (c: ReturnType<typeof contacts>): [number, number] => {
    let best: [number, number] = [0, 0];
    for (let k = 0; k <= N; ) {
      const air = (j: number): boolean => !c.ank[Math.round(at(j))] && !c.toe[Math.round(at(j))];
      if (!air(k)) {
        k += 1;
        continue;
      }
      let e = k;
      while (e + 1 <= N && air(e + 1)) e += 1;
      if (e - k > (best[1] - best[0]) * N) best = [k / N, e / N];
      k = e + 1;
    }
    return best;
  };
  const leg = (side: 'l' | 'r', c: ReturnType<typeof contacts>): { bones: number[]; swing: [number, number]; side: 0 | 1 } => ({
    bones: (['thigh', 'shin', 'foot', 'toe'] as const).map((b) => rt.bones.indexOf(`${side}_${b}`)),
    swing: swingOf(c),
    side: side === 'l' ? 0 : 1,
  });
  const frames = finish(closeLoop(raw, [leg('l', cl), leg('r', cr)]), rt, target, [sampleFlags(cl, at, N), sampleFlags(cr, at, N)], stride.length() * S);
  const T = (s1 - s0) * bvh.dt;
  const v = stride.length() / T;
  // События шага — по опоре записи (кадры клипа, по кругу).
  const stanceOf = (c: ReturnType<typeof contacts>): boolean[] => {
    const f = sampleFlags(c, at, N);
    return f.ank.map((a, k) => a || f.toe[k]!);
  };
  // Конец опоры, идущей с кадра from (по кругу), и начало следующей опоры.
  const offFrom = (st: boolean[], from: number): number => {
    let k = from;
    while (st[k % N] && k < from + N) k += 1;
    return (k % N) / N;
  };
  const sl = stanceOf(cl);
  const sr = stanceOf(cr);
  let rOn = Math.round(N / 2);
  while (rOn > 1 && sr[rOn - 1]) rOn -= 1;
  while (rOn < N - 1 && !sr[rOn]) rOn += 1;
  const events = { lOff: offFrom(sl, 0), rOn: rOn / N, rOff: offFrom(sr, rOn) };
  return { frames, stride: stride.length() * S, events, info: `cycle ${s0}-${s1} (${T.toFixed(2)} s), ${v.toFixed(2)} m/s, stride ${stride.length().toFixed(2)} m, S ${S.toFixed(3)}` };
}

function idle(bvh: Bvh, target: Target, search: [number, number], length: [number, number]): Built {
  const W = worldFrames(bvh);
  const f0 = W[0]!;
  const J: Joints = {
    hips: jointIndex(bvh, 'Hips'),
    lu: jointIndex(bvh, 'LeftUpLeg'),
    ru: jointIndex(bvh, 'RightUpLeg'),
    lf: jointIndex(bvh, 'LeftFoot'),
    rf: jointIndex(bvh, 'RightFoot'),
    lt: jointIndex(bvh, 'LeftToeBase'),
    rt: jointIndex(bvh, 'RightToeBase'),
  };
  const S = targetLeg(target) / bvhLeg(bvh, f0);
  const { cl, cr, floor } = footContacts(W, J, bvh.dt);
  const fps = 1 / bvh.dt;
  // Поза для сравнения: суставы относительно таза (с поворотом таза).
  const key = (i: number): number[] => {
    const f = W[i]!;
    const inv = f.rot[J.hips]!.clone().invert();
    const out: number[] = [];
    for (let j = 0; j < f.pos.length; j += 1) {
      const v = f.pos[j]!.clone().sub(f.pos[J.hips]!).applyQuaternion(inv);
      out.push(v.x, v.y, v.z);
    }
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(f.rot[J.hips]!);
    out.push(fw.x, fw.z, f.pos[J.hips]!.y * 3);
    return out;
  };
  const dist = (a: number[], b: number[]): number => a.reduce((s, x, k) => s + (x - b[k]!) ** 2, 0);
  let best: [number, number, number] = [0, 0, Infinity];
  const step = Math.round(fps / 20);
  for (let a = Math.round(search[0] * fps); a < Math.min(W.length - 2, search[1] * fps); a += step) {
    const ka = key(a);
    const kv = key(a + step);
    for (let b = a + Math.round(length[0] * fps); b < Math.min(W.length - 2 - step, a + length[1] * fps); b += step) {
      const d = dist(ka, key(b)) + 4 * dist(kv.map((x, k) => x - ka[k]!), key(b + step).map((x, k) => x - key(b)[k]!));
      if (d < best[2]) best = [a, b, d];
    }
  }
  const [s0, s1] = best;
  // Направление — средний взгляд таза; точка отсчёта — середина между стопами.
  const fw = new THREE.Vector3();
  const origin = new THREE.Vector3();
  for (let i = s0; i < s1; i += 1) {
    fw.add(new THREE.Vector3(0, 0, 1).applyQuaternion(W[i]!.rot[J.hips]!));
    origin.add(horiz(W[i]!.pos[J.lf]!.clone().add(W[i]!.pos[J.rf]!).multiplyScalar(0.5)));
  }
  origin.divideScalar(s1 - s0);
  const yaw = Math.atan2(fw.x, fw.z);
  const rt = makeRetarget(bvh, f0, target, flatRefs(bvh, W, J, cl, cr, yaw, s0, s1));
  const N = Math.round((s1 - s0) * bvh.dt * FPS);
  const raw: ClipFrame[] = [];
  const at = (k: number): number => s0 + ((s1 - s0) * k) / N;
  for (let k = 0; k < N; k += 1) raw.push(local(rt, target, makeFrame(rt, target, frameAt(W, at(k)), J, yaw, origin, S, floor)));
  const frames = finish(crossfadeLoop(raw, Math.round(FPS * 0.6)), rt, target, [sampleFlags(cl, at, N), sampleFlags(cr, at, N)], 0);
  return { frames, stride: 0, info: `segment ${(s0 * bvh.dt).toFixed(2)}-${(s1 * bvh.dt).toFixed(2)} s, d ${best[2].toFixed(3)}, S ${S.toFixed(3)}` };
}

/**
 * Голова смотрит ровно: у разных актёров маркеры головы стоят по-разному, и в T-позе
 * «прямо» у одного — взгляд в пол, у другого — вверх. Средний наклон взгляда за клип
 * приводится к want (рад, + — вниз), колебания головы остаются как у актёра.
 */
export function levelHead(frames: ClipFrame[], want: number): number {
  const fw = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let mean = 0;
  for (const f of frames) {
    q.copy(f.q[0]!).multiply(f.q[1]!).multiply(f.q[2]!).multiply(f.q[3]!);
    fw.set(0, 0, 1).applyQuaternion(q);
    mean += Math.asin(Math.max(-1, Math.min(1, -fw.y)));
  }
  mean /= frames.length;
  const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), want - mean);
  for (const f of frames) f.q[3]!.multiply(fix);
  return mean;
}

export function buildClip(spec: Spec, text: string, target: Target): Built {
  const bvh = parseBvh(text);
  const built = spec.kind === 'gait' ? gait(bvh, target) : idle(bvh, target, spec.search ?? [0, 10], spec.length ?? [3, 6]);
  const was = levelHead(built.frames, 0.06);
  built.info += `, взгляд был ${((was * 180) / Math.PI).toFixed(0)}°`;
  if (spec.kind === 'idle') built.info += `, таз выше на ${(straightenLegs(built.frames, target) * 100).toFixed(1)} см`;
  return built;
}

/**
 * Стойка: актёр стоит на чуть согнутых ногах, у нашей фигуры это выглядит как присед.
 * Таз поднимается, пока самая вытянутая за клип нога не станет почти прямой (97 %).
 */
function straightenLegs(frames: ClipFrame[], target: Target): number {
  const J = target.joints;
  const L = targetLeg(target) * 0.97;
  let dy = Infinity;
  for (const f of frames)
    for (const [side, off] of [[0, J.l_thigh], [1, J.r_thigh]] as const) {
      const hip = off.clone().sub(J.root).applyQuaternion(f.q[0]!).add(J.root).add(f.root);
      const a = f.feet[side];
      const h2 = (hip.x - a.x) ** 2 + (hip.z - a.z) ** 2;
      dy = Math.min(dy, a.y - hip.y + Math.sqrt(Math.max(0, L * L - h2)));
    }
  dy = Math.max(0, dy);
  for (const f of frames) f.root.y += dy;
  return dy;
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) throw new Error('укажите папку data репозитория cmu-mocap');
  const target = canonTarget();
  // Порядок костей клипа — как в rig.ts.
  const order = BONES.map((b) => (['root', 'spine', 'chest', 'neck', 'l_clav', 'l_upper', 'l_fore', 'l_hand', 'r_clav', 'r_upper', 'r_fore', 'r_hand', 'l_thigh', 'l_shin', 'l_foot', 'l_toe', 'r_thigh', 'r_shin', 'r_foot', 'r_toe'] as const).indexOf(b as OurBone));
  if (order.some((i) => i < 0)) throw new Error('кости клипа не совпадают с BONES');
  const out: string[] = [];
  let total = 0;
  for (const spec of SPECS) {
    const built = buildClip(spec, readFileSync(join(dir, spec.file), 'utf8'), target);
    const frames = built.frames.map((f) => ({ ...f, q: order.map((i) => f.q[i]!) }));
    const data = packClip(frames);
    total += data.length;
    console.log(`${spec.name}: ${spec.note}, ${frames.length} кадров, ${(data.length / 1024).toFixed(1)} КБ; ${built.info}${built.events ? `, события ${JSON.stringify(built.events)}` : ''}`);
    const ev = built.events ? `events: { lOff: ${built.events.lOff.toFixed(3)}, rOn: ${built.events.rOn.toFixed(3)}, rOff: ${built.events.rOff.toFixed(3)} }, ` : '';
    out.push(`  ${spec.name}: { fps: ${FPS}, frames: ${frames.length}, loop: true, stride: ${built.stride.toFixed(4)}, ${ev}data: '${data}' },`);
  }
  const file = `// Сгенерировано tools/mocap/build.ts — не редактировать вручную.
// Motion capture data: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu),
// created with funding from NSF EIA-0196217. Записи: ${SPECS.map((s) => s.note).join('; ')}.
/* eslint-disable */
import type { PackedClip } from './mocap';

/** Длина ноги эталонной фигуры (бедро + голень), к которой приведены клипы, и её левый голеностоп в покое. */
export const CLIP_LEG = ${targetLeg(target).toFixed(4)};
export const CLIP_ANKLE = [${target.joints.l_foot.toArray().map((x) => x.toFixed(4)).join(', ')}] as const;

export const CLIPS = {
${out.join('\n')}
} satisfies Record<string, PackedClip>;
`;
  const path = new URL('../../src/ui/game/three/mocapClips.ts', import.meta.url);
  writeFileSync(path, file);
  console.log(`всего ${(total / 1024).toFixed(1)} КБ`);
}

if (process.argv[1]?.endsWith('build.ts')) main();
