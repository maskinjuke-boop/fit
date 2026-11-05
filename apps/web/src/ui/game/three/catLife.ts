import * as THREE from 'three';
import { PETS, dist, resolve, type Box, type P2, type Placed } from '../../../game/lifeMap';
import type { CatBreed, ObjectId } from '../../../game/lifeTypes';
import { buildCat, buildToy, poseCat, type Cat3D, type CatMode } from './cats3d';
import { disposeObject } from './kit';
import type { Motion } from './rig';

/**
 * Жизнь кошек в доме: у каждой — план из шагов (дойти, повернуться, побыть в позе,
 * прыгнуть, поохотиться на игрушку, потереться о ноги). Новый план выбирается по
 * потребностям из сохранения: голодная идёт к миске и ест, «приспичило» — в лоток
 * (запрыгивает, присаживается, закапывает), заскучавшая гоняет мячик или мышку,
 * остальное время бродит, носится, запрыгивает на диван, кровать и кресла и спит там,
 * трётся о ноги героя. На ласку отвечает мурлыканьем (иногда переворачивается на спину),
 * на игру — охотой на дразнилку, на угощение — ест с руки, на зов — бежит к герою.
 */

/** Место на мебели: поверхность, высота и откуда запрыгивать с пола. */
export interface Perch {
  pos: P2;
  y: number;
  edge: P2;
}

/** Действие героя, на которое реагируют кошки. */
export interface CatHeroAct {
  key: number;
  motion: Motion;
  /** С какой кошкой (гладит, играет, кормит). */
  cat: string | null;
  /** Когда герой устроился на месте (null — ещё подходит). */
  settledAt: number | null;
}

/** Всё, что кошкам нужно знать о доме в этот кадр. */
export interface CatWorld {
  bounds: Box;
  /** Препятствия для кошек (без мисок и лотка). */
  boxes: readonly Box[];
  perches: readonly Perch[];
  /** Высота наполнителя в лотке. */
  litterSurface: number;
  hero: P2;
  act: CatHeroAct | null;
  pets: { bowl: number; litter: number };
  need(id: string): { fed: number; play: number; toilet: number };
}

type Step =
  | { k: 'go'; to: P2; run?: boolean; near?: number; detours?: number }
  | { k: 'turn'; heading: number }
  | { k: 'pose'; mode: CatMode; dur: number; tag?: 'eat' | 'drink' | 'litter' }
  | { k: 'jump'; to: P2; y: number; hop?: boolean }
  | { k: 'hunt'; toy: Toy; left: number; phase: 'chase' | 'aim' | 'swat' }
  | { k: 'rub'; dur: number; angle: number };

export interface CatAI {
  cat: Cat3D;
  id: string;
  shadow: THREE.Object3D;
  pos: P2;
  /** Высота над полом (на мебели, в лотке, в прыжке). */
  y: number;
  heading: number;
  mode: CatMode;
  plan: Step[];
  /** Когда начат текущий шаг (−1 — ещё не начат). */
  stepAt: number;
  speed: number;
  seed: number;
  size: number;
  tilt: number;
  /** Подскок на месте (только для вида: игра с дразнилкой). */
  hop: number;
  /** Прыжок: откуда, куда, когда начат, сколько длится полёт и высота дуги. */
  jump: { from: P2; fromY: number; to: P2; toY: number; at: number; dur: number; h: number } | null;
  /** Где спрыгнуть, если сидит на мебели. */
  edge: P2 | null;
  stuck: number;
  ateAt: number;
  drankAt: number;
  litterAt: number;
  /** На какой зов уже откликнулась. */
  called: number;
  /** Сколько раз за время жизни ела, ходила в лоток, запрыгивала на мебель (для проверок). */
  log: { eat: number; drink: number; litter: number; perch: number; hunt: number; rub: number };
}

interface Toy {
  obj: THREE.Group;
  pos: P2;
  vel: P2;
  kind: 'ball' | 'mouse';
}

/** Места на мебели, куда кошка запрыгивает (в осях предмета). */
const PERCH: Partial<Record<ObjectId, Array<{ at: [number, number]; y: number; edge: [number, number] }>>> = {
  sofa: [
    { at: [-0.75, 0.05], y: 0.475, edge: [-0.8, 0.88] },
    { at: [0.7, 0.05], y: 0.475, edge: [0.8, 0.88] },
  ],
  bed: [
    { at: [0.45, 0.35], y: 0.7, edge: [1.4, 0.35] },
    { at: [0.2, 1.0], y: 0.7, edge: [0.2, 1.72] },
  ],
  armchair: [{ at: [0, 0.12], y: 0.65, edge: [0, 0.9] }],
  big_tv: [{ at: [0, 1.25], y: 0.44, edge: [0.75, 1.25] }],
  massage_chair: [{ at: [0, 0.05], y: 0.58, edge: [0, 0.95] }],
};

/** Места на мебели этой раскладки (в мировых координатах). */
export function perchSpots(placed: readonly Placed[], bounds: Box, boxes: readonly Box[]): Perch[] {
  const out: Perch[] = [];
  for (const p of placed) {
    const list = PERCH[p.id];
    if (!list) continue;
    const c = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    const w = (l: [number, number]): P2 => ({ x: p.pos.x + l[0] * c + l[1] * sn, z: p.pos.z - l[0] * sn + l[1] * c });
    for (const x of list) out.push({ pos: w(x.at), y: x.y, edge: resolve(w(x.edge), bounds, boxes) });
  }
  return out;
}

const angleTo = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const CROUCH = 0.24;
const LAND = 0.16;

/** Кошки дома: parent — куда добавлять модели, shadow — тень под кошкой. */
export function createCatLife(parent: THREE.Object3D, shadow: () => THREE.Object3D) {
  const cats = new Map<string, CatAI>();
  const toys: Toy[] = [];
  let a = 12345;
  const rand = (): number => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length]!;
  const randomSpot = (w: CatWorld): P2 => {
    const b = w.bounds;
    for (let i = 0; i < 20; i += 1) {
      const q = { x: b.x0 + 0.6 + rand() * (b.x1 - b.x0 - 1.2), z: b.z0 + 0.6 + rand() * (b.z1 - b.z0 - 1.2) };
      const r = resolve(q, b, w.boxes);
      if (Math.hypot(r.x - q.x, r.z - q.z) < 0.01) return q;
    }
    return { x: 0, z: 0.5 };
  };
  const restDur = (mode: CatMode): number => ({ sit: 4 + rand() * 5, groom: 3 + rand() * 3, idle: 1.5 + rand() * 2.5, lie: 6 + rand() * 7, sleep: 12 + rand() * 14 } as Partial<Record<CatMode, number>>)[mode] ?? 3;
  /** Точка перед миской (кошка стоит мордой к ней, на +x). */
  const bowlFront = (bowl: P2, c: CatAI): P2 => ({ x: bowl.x - 0.3 * c.size, z: bowl.z });
  const litterIn = (): P2 => ({ x: PETS.litter.pos.x, z: PETS.litter.pos.z + 0.02 });
  const litterOut = (): P2 => ({ x: PETS.litter.pos.x, z: PETS.litter.pos.z - 0.6 });

  const planNext = (c: CatAI, t: number, w: CatWorld): void => {
    const need = w.need(c.id);
    // На мебели: ещё полежать или спрыгнуть.
    if (c.y > 0.05) {
      const urgent = need.toilet < 40 || (need.fed < 50 && w.pets.bowl > 0);
      if (!urgent && rand() < 0.45) {
        const m = pick(['lie', 'sleep', 'groom', 'sit'] as const);
        c.plan = [{ k: 'pose', mode: m, dur: restDur(m) }];
      } else c.plan = [{ k: 'jump', to: c.edge ?? randomSpot(w), y: 0 }];
      return;
    }
    const opts: Array<[number, () => Step[]]> = [];
    if (need.toilet < 40 && w.pets.litter < 100 && t - c.litterAt > 60)
      opts.push([
        12,
        () => [
          // Приспичило — издалека бежит.
          { k: 'go', to: litterOut(), run: dist(c.pos, litterOut()) > 4 },
          { k: 'turn', heading: 0 },
          { k: 'jump', to: litterIn(), y: w.litterSurface, hop: true },
          { k: 'turn', heading: Math.PI },
          { k: 'pose', mode: 'litter', dur: 4, tag: 'litter' },
          { k: 'turn', heading: 0 },
          { k: 'pose', mode: 'dig', dur: 2.5 },
          { k: 'turn', heading: Math.PI },
          { k: 'jump', to: litterOut(), y: 0, hop: true },
        ],
      ]);
    if (w.pets.bowl > 0 && t - c.ateAt > 45 && need.fed < 85)
      opts.push([
        need.fed < 55 ? 10 : 1,
        () => [
          { k: 'go', to: bowlFront(PETS.food, c), run: need.fed < 40 && dist(c.pos, PETS.food) > 4 },
          { k: 'turn', heading: Math.PI / 2 },
          { k: 'pose', mode: 'eat', dur: 6 + rand() * 4, tag: 'eat' },
          ...(rand() < 0.6 ? ([{ k: 'go', to: bowlFront(PETS.water, c) }, { k: 'turn', heading: Math.PI / 2 }, { k: 'pose', mode: 'eat', dur: 3, tag: 'drink' }] as Step[]) : []),
          { k: 'pose', mode: 'groom', dur: 3 },
        ],
      ]);
    if (t - c.drankAt > 70) opts.push([0.8, () => [{ k: 'go', to: bowlFront(PETS.water, c) }, { k: 'turn', heading: Math.PI / 2 }, { k: 'pose', mode: 'eat', dur: 3.5, tag: 'drink' }]]);
    if (toys.length) opts.push([0.8 + (100 - need.play) / 22, () => [{ k: 'hunt', toy: pick(toys), left: 2 + Math.floor(rand() * 3), phase: 'chase' }, { k: 'pose', mode: 'sit', dur: 2 }]]);
    if (dist(w.hero, c.pos) < 6 && !w.act) opts.push([1.2, () => [{ k: 'go', to: w.hero, run: dist(w.hero, c.pos) > 2.5, near: 0.45 }, { k: 'rub', dur: 3.5 + rand() * 2.5, angle: rand() * 6 }, { k: 'pose', mode: 'sit', dur: 2 }]]);
    opts.push([2, () => [{ k: 'go', to: randomSpot(w) }]]);
    opts.push([0.7, () => [{ k: 'go', to: randomSpot(w), run: true }, { k: 'go', to: randomSpot(w), run: true }, { k: 'pose', mode: 'idle', dur: 1.5 }]]);
    if (w.perches.length)
      opts.push([
        2.2,
        () => {
          const pr = pick(w.perches);
          const m = pick(['lie', 'sleep', 'sleep', 'groom', 'sit'] as const);
          return [{ k: 'go', to: pr.edge }, { k: 'turn', heading: Math.atan2(pr.pos.x - pr.edge.x, pr.pos.z - pr.edge.z) }, { k: 'jump', to: pr.pos, y: pr.y }, { k: 'pose', mode: m, dur: restDur(m) }];
        },
      ]);
    opts.push([
      1.8,
      () => {
        const m = pick(['sit', 'groom', 'idle', 'lie', 'sleep'] as const);
        return [{ k: 'pose', mode: m, dur: restDur(m) }];
      },
    ]);
    const total = opts.reduce((s, [x]) => s + x, 0);
    let r = rand() * total;
    for (const [x, make] of opts) {
      r -= x;
      if (r <= 0) {
        c.plan = make();
        return;
      }
    }
    c.plan = [{ k: 'pose', mode: 'idle', dur: 2 }];
  };

  /** Начать прыжок к цели (вверх на мебель, вниз на пол, в лоток). */
  const startJump = (c: CatAI, to: P2, y: number, t: number, hop = false): void => {
    const d = dist(c.pos, to);
    c.jump = { from: { ...c.pos }, fromY: c.y, to: { ...to }, toY: y, at: t, dur: hop ? 0.32 : 0.38 + Math.abs(y - c.y) * 0.35, h: hop ? 0.1 : 0.12 + Math.max(0, y - c.y) * 0.35 + d * 0.05 };
    if (d > 0.05) c.heading = Math.atan2(to.x - c.pos.x, to.z - c.pos.z);
    if (y > 0.2) c.log.perch += 1;
  };
  /** Прыжок идёт: присела → полёт по дуге → приземлилась. true — закончен. */
  const runJump = (c: CatAI, t: number): boolean => {
    const j = c.jump!;
    const e = t - j.at;
    if (e < CROUCH) {
      c.mode = 'crouch';
      return false;
    }
    const s = Math.min(1, (e - CROUCH) / j.dur);
    c.pos = { x: j.from.x + (j.to.x - j.from.x) * s, z: j.from.z + (j.to.z - j.from.z) * s };
    c.y = j.fromY + (j.toY - j.fromY) * s + j.h * 4 * s * (1 - s);
    const vy = j.toY - j.fromY + j.h * 4 * (1 - 2 * s);
    const horiz = Math.max(0.2, dist(j.from, j.to));
    c.tilt = Math.max(-0.7, Math.min(0.7, -Math.atan2(vy, horiz) * 0.8));
    c.mode = s < 1 ? 'jump' : 'crouch';
    if (s < 1) return false;
    c.tilt = 0;
    if (e - CROUCH - j.dur < LAND) return false;
    c.y = j.toY;
    c.edge = j.toY > 0.2 ? { ...j.from } : null;
    c.jump = null;
    return true;
  };
  const kickToy = (toy: Toy, heading: number, power: number): void => {
    const ang = heading + (rand() - 0.5) * 1.2;
    toy.vel = { x: Math.sin(ang) * power, z: Math.cos(ang) * power };
  };
  /** Движение к точке: true — дошла (или упёрлась). */
  const walkTo = (c: CatAI, to: P2, want: number, near: number, dt: number, w: CatWorld): boolean => {
    const gx = to.x - c.pos.x;
    const gz = to.z - c.pos.z;
    const d = Math.hypot(gx, gz);
    if (d < near) return true;
    c.heading += angleTo(c.heading, Math.atan2(gx, gz)) * Math.min(1, dt * 6);
    const target = want * Math.min(1, 0.4 + d * 1.5);
    c.speed += (target - c.speed) * Math.min(1, dt * 6);
    const step = c.speed * dt;
    const next = resolve({ x: c.pos.x + Math.sin(c.heading) * step, z: c.pos.z + Math.cos(c.heading) * step }, w.bounds, w.boxes);
    // Упёрлась в мебель — через секунду бросает затею.
    if (Math.hypot(next.x - c.pos.x, next.z - c.pos.z) < step * 0.3) c.stuck += dt;
    else c.stuck = Math.max(0, c.stuck - dt);
    c.pos = next;
    c.mode = c.speed > 0.75 ? 'trot' : 'walk';
    return c.stuck > 0.35;
  };
  /** Обход препятствия: точка сбоку от пути к цели, свободная от мебели (null — обойти нельзя). */
  const detour = (c: CatAI, to: P2, w: CatWorld): P2 | null => {
    const base = Math.atan2(to.x - c.pos.x, to.z - c.pos.z);
    let best: P2 | null = null;
    let bestD = Infinity;
    for (const turn of [1.2, -1.2, 0.7, -0.7, 2.0, -2.0]) {
      for (const len of [0.8, 1.4]) {
        const q = { x: c.pos.x + Math.sin(base + turn) * len, z: c.pos.z + Math.cos(base + turn) * len };
        const r = resolve(q, w.bounds, w.boxes);
        if (Math.hypot(r.x - q.x, r.z - q.z) > 0.01) continue;
        // Путь до точки свободен (проверка по шагам).
        let free = true;
        for (let k = 1; k <= 4 && free; k += 1) {
          const m = { x: c.pos.x + ((q.x - c.pos.x) * k) / 4, z: c.pos.z + ((q.z - c.pos.z) * k) / 4 };
          const rm = resolve(m, w.bounds, w.boxes);
          if (Math.hypot(rm.x - m.x, rm.z - m.z) > 0.01) free = false;
        }
        if (!free) continue;
        const d = dist(q, to) + rand() * 0.3;
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    return best;
  };
  /** Реакция на героя во время действия с этой кошкой (гладит, играет, кормит). */
  const react = (c: CatAI, act: CatHeroAct, t: number, w: CatWorld): void => {
    c.speed = 0;
    // После ласки — новые дела.
    c.plan = [];
    c.stepAt = -1;
    c.heading += angleTo(c.heading, Math.atan2(w.hero.x - c.pos.x, w.hero.z - c.pos.z)) * 0.08;
    const e = act.settledAt !== null ? t - act.settledAt : 0;
    c.tilt = 0;
    if (act.motion === 'crouch:pet') c.mode = e > 1.4 && (act.key + Math.round(c.seed)) % 2 === 0 ? 'belly' : 'purr';
    else if (act.motion === 'crouch:feed') c.mode = e > 0.5 ? 'eat' : 'sit';
    else if (act.motion === 'crouch:play') {
      // Охотится на пёрышко: припадает, подпрыгивает, бьёт лапой.
      const k = (e * 0.9) % 1;
      c.mode = k < 0.4 ? 'crouch' : k < 0.6 ? 'jump' : 'swat';
      c.hop = k >= 0.4 && k < 0.6 ? 0.16 * Math.sin(((k - 0.4) / 0.2) * Math.PI) : 0;
      c.tilt = k < 0.5 ? -0.5 : 0.3;
    } else c.mode = 'sit';
  };

  const updateCat = (c: CatAI, t: number, dt: number, w: CatWorld): void => {
    c.tilt *= 0.9;
    c.hop = 0;
    const act = w.act;
    // Зов: все кошки бегут к герою и трутся о ноги.
    if (act && act.settledAt !== null && act.motion === 'crouch:call' && c.called !== act.key) {
      c.called = act.key;
      c.plan = [...(c.y > 0.05 ? ([{ k: 'jump', to: c.edge ?? randomSpot(w), y: 0 }] as Step[]) : []), { k: 'go', to: w.hero, run: true, near: 0.5 }, { k: 'rub', dur: 3.5, angle: c.seed }, { k: 'pose', mode: 'purr', dur: 2.5 }];
      c.stepAt = -1;
    }
    if (act?.cat === c.id && !c.jump && c.y < 0.05) {
      react(c, act, t, w);
      return;
    }
    if (c.jump) {
      // Прыжок шага плана закончен — следующий шаг (прыжок охоты продолжает охоту).
      if (runJump(c, t) && c.plan[0]?.k === 'jump') {
        c.plan.shift();
        c.stepAt = -1;
      }
      return;
    }
    if (!c.plan.length) {
      planNext(c, t, w);
      c.stepAt = -1;
    }
    const step = c.plan[0]!;
    const first = c.stepAt < 0;
    if (first) {
      c.stepAt = t;
      c.stuck = 0;
    }
    let done = false;
    switch (step.k) {
      case 'go':
        if (c.y > 0.05) {
          // Цель на полу, а кошка на мебели — сначала спрыгнуть.
          c.plan.unshift({ k: 'jump', to: c.edge ?? randomSpot(w), y: 0 });
          c.stepAt = -1;
          break;
        }
        if (walkTo(c, step.to, step.run ? 1.7 : 0.5, step.near ?? 0.08, dt, w)) {
          // Упёрлась — обходит мебель (несколько попыток), иначе бросает затею.
          const reached = dist(c.pos, step.to) < (step.near ?? 0.08) + 0.02;
          const via = reached || (step.detours ?? 0) >= 5 ? null : detour(c, step.to, w);
          if (via) {
            step.detours = (step.detours ?? 0) + 1;
            c.plan.unshift({ k: 'go', to: via, run: step.run, near: 0.15, detours: 5 });
            c.stepAt = -1;
          } else if (reached) done = true;
          else c.plan = [];
        }
        break;
      case 'turn': {
        const d = angleTo(c.heading, step.heading);
        c.heading += d * Math.min(1, dt * 5);
        c.mode = 'idle';
        done = Math.abs(d) < 0.08;
        break;
      }
      case 'pose':
        c.mode = step.mode;
        if (t - c.stepAt > step.dur) {
          done = true;
          if (step.tag === 'eat') {
            c.ateAt = t;
            c.log.eat += 1;
          }
          if (step.tag === 'drink') {
            c.drankAt = t;
            c.log.drink += 1;
          }
          if (step.tag === 'litter') {
            c.litterAt = t;
            c.log.litter += 1;
          }
        }
        break;
      case 'jump':
        if (first) startJump(c, step.to, step.y, t, step.hop);
        break;
      case 'hunt': {
        const toy = step.toy;
        if (step.phase === 'chase') {
          // Бежит к игрушке, останавливается в прыжке от неё.
          if (dist(c.pos, toy.pos) < 0.5 || walkTo(c, toy.pos, 1.5, 0.5, dt, w)) {
            step.phase = 'aim';
            c.stepAt = t;
          }
        } else if (step.phase === 'aim') {
          c.speed = 0;
          c.heading += angleTo(c.heading, Math.atan2(toy.pos.x - c.pos.x, toy.pos.z - c.pos.z)) * Math.min(1, dt * 8);
          c.mode = 'crouch';
          if (t - c.stepAt > 0.7) {
            // Прыжок на игрушку (присела уже — сразу полёт).
            const to = resolve({ x: toy.pos.x - Math.sin(c.heading) * 0.18, z: toy.pos.z - Math.cos(c.heading) * 0.18 }, w.bounds, w.boxes);
            c.jump = { from: { ...c.pos }, fromY: 0, to, toY: 0, at: t - CROUCH, dur: 0.3, h: 0.14 };
            step.phase = 'swat';
            c.stepAt = t + 0.3 + LAND;
          }
        } else {
          c.mode = 'swat';
          if (t - c.stepAt > 0.25 && Math.hypot(toy.vel.x, toy.vel.z) < 0.2) kickToy(toy, c.heading, 1.4 + rand() * 1.3);
          if (t - c.stepAt > 0.9) {
            step.left -= 1;
            step.phase = 'chase';
            c.log.hunt += 1;
            done = step.left <= 0;
          }
        }
        break;
      }
      case 'rub': {
        // Кругами у ног героя, касаясь боком.
        step.angle += dt * 1.5;
        const r = 0.42;
        const to = { x: w.hero.x + Math.sin(step.angle) * r, z: w.hero.z + Math.cos(step.angle) * r };
        c.heading += angleTo(c.heading, step.angle + Math.PI / 2) * Math.min(1, dt * 6);
        c.pos = resolve({ x: c.pos.x + (to.x - c.pos.x) * Math.min(1, dt * 3), z: c.pos.z + (to.z - c.pos.z) * Math.min(1, dt * 3) }, w.bounds, w.boxes);
        c.speed = 0.3;
        c.mode = 'rub';
        if (first) c.log.rub += 1;
        done = t - c.stepAt > step.dur;
        break;
      }
    }
    if (step.k !== 'go' && step.k !== 'rub' && !(step.k === 'hunt' && step.phase === 'chase')) c.speed += (0 - c.speed) * Math.min(1, dt * 8);
    if (!c.plan.length) c.stepAt = -1;
    else if (done && c.plan[0] === step) {
      c.plan.shift();
      c.stepAt = -1;
      if (step.k === 'go' || step.k === 'hunt') c.speed *= 0.5;
    }
  };

  return {
    cats,
    toys,
    /** Кошки и игрушки по списку (новые появляются в случайном месте, лишние убираются). */
    sync(want: ReadonlyArray<{ id: string; breed: CatBreed }>, w: CatWorld): void {
      for (const [id, c] of cats) {
        if (!want.some((x) => x.id === id && x.breed === c.cat.breed)) {
          parent.remove(c.cat.root, c.shadow);
          disposeObject(c.cat.root);
          cats.delete(id);
        }
      }
      want.forEach((x, i) => {
        if (cats.has(x.id)) return;
        const cat = buildCat(x.breed, i + 1);
        const sh = shadow();
        const start = randomSpot(w);
        cat.root.position.set(start.x, 0, start.z);
        parent.add(cat.root, sh);
        const size = cat.root.children[0]?.scale.x ?? 1;
        cats.set(x.id, { cat, id: x.id, shadow: sh, pos: start, y: 0, heading: rand() * Math.PI * 2, mode: 'idle', plan: [], stepAt: -1, speed: 0, seed: i * 2.1, size, tilt: 0, hop: 0, jump: null, edge: null, stuck: 0, ateAt: -999, drankAt: -999, litterAt: -999, called: -1, log: { eat: 0, drink: 0, litter: 0, perch: 0, hunt: 0, rub: 0 } });
      });
      if (!want.length) {
        for (const toy of toys) {
          parent.remove(toy.obj);
          disposeObject(toy.obj);
        }
        toys.length = 0;
      } else if (!toys.length) {
        for (const [kind, at] of [['ball', { x: -1.4, z: 0.6 }], ['mouse', { x: 2.2, z: -0.4 }]] as const) {
          const obj = buildToy(kind);
          const pos = resolve(at, w.bounds, w.boxes);
          obj.position.set(pos.x, 0, pos.z);
          parent.add(obj);
          toys.push({ obj, pos, vel: { x: 0, z: 0 }, kind });
        }
      }
    },
    /** Ближайшая к точке кошка. */
    nearest(p: P2): CatAI | null {
      let best: CatAI | null = null;
      for (const c of cats.values()) if (!best || dist(p, c.pos) < dist(p, best.pos)) best = c;
      return best;
    },
    /** Герой подходит к кошке: с мебели она спрыгивает. Возвращает, где кошка будет на полу. */
    claim(c: CatAI, w: CatWorld): P2 {
      if (c.y > 0.05 && !c.jump) {
        const to = c.edge ?? resolve({ x: c.pos.x, z: c.pos.z + 0.6 }, w.bounds, w.boxes);
        c.plan = [{ k: 'jump', to, y: 0 }];
        c.stepAt = -1;
        return to;
      }
      return c.jump ? c.jump.to : c.pos;
    },
    /** Кадр: поведение, позы, тени; игрушки катятся и отскакивают. */
    update(t: number, dt: number, w: CatWorld, render = true): void {
      const blend = 1 - Math.exp(-dt * 7);
      for (const c of cats.values()) {
        updateCat(c, t, dt, w);
        if (!render) continue;
        // Голова поворачивается к герою, если он рядом.
        let look = 0;
        if (dist(w.hero, c.pos) < 2.8) look = Math.max(-1, Math.min(1, angleTo(c.heading, Math.atan2(w.hero.x - c.pos.x, w.hero.z - c.pos.z)) / 1.2));
        const mode = c.mode === 'walk' || c.mode === 'trot' ? (c.speed > 0.05 ? c.mode : 'idle') : c.mode;
        poseCat(c.cat, mode, t + c.seed, Math.max(0.2, c.speed), blend, mode === 'sleep' || mode === 'belly' ? 0 : look, c.tilt);
        c.cat.root.position.set(c.pos.x, c.y + c.hop, c.pos.z);
        c.cat.root.rotation.y = c.heading;
        c.shadow.position.set(c.pos.x, c.jump ? 0.015 : c.y + 0.015, c.pos.z);
        c.shadow.scale.setScalar(c.jump ? Math.max(0.5, 1 - c.y * 0.8) : 1);
      }
      for (const toy of toys) {
        const v = Math.hypot(toy.vel.x, toy.vel.z);
        if (v < 0.01) continue;
        const next = { x: toy.pos.x + toy.vel.x * dt, z: toy.pos.z + toy.vel.z * dt };
        const r = resolve(next, w.bounds, w.boxes);
        if (Math.abs(r.x - next.x) > 1e-4) toy.vel.x = -toy.vel.x * 0.6;
        if (Math.abs(r.z - next.z) > 1e-4) toy.vel.z = -toy.vel.z * 0.6;
        toy.pos = r;
        const f = Math.exp(-dt * (toy.kind === 'ball' ? 1.3 : 3));
        toy.vel.x *= f;
        toy.vel.z *= f;
        toy.obj.position.set(toy.pos.x, 0, toy.pos.z);
        toy.obj.rotation.y = Math.atan2(toy.vel.x, toy.vel.z);
        const spin = toy.obj.getObjectByName('spin');
        if (spin) spin.rotation.x += (v * dt) / 0.045;
      }
    },
  };
}

export type CatLife = ReturnType<typeof createCatLife>;
