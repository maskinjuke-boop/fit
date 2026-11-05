import { mountOf } from './lifeContent';
import type { ObjectId, SceneId } from './lifeTypes';

/**
 * Раскладка двух локаций: дом (комната в разрезе, предметы у стен) и фитнес-зал
 * (место тренера впереди, ученики рядами лицом к нему, ресепшен, душевая, бар).
 * Координаты: x — вправо, z — к камере, пол y = 0.
 */

export interface P2 {
  x: number;
  z: number;
}

/** Препятствие — прямоугольник на полу. */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Placed {
  id: ObjectId;
  pos: P2;
  /** Поворот вокруг Y (лицевая сторона предмета смотрит на +Z при 0). */
  rot: number;
  /** Где встать, чтобы пользоваться. */
  use: P2;
  box: Box | null;
}

export const HOUSE = { w: 15, d: 11 };
export const GYM_ROOM = { w: 16, d: 12 };

const box = (x: number, z: number, hw: number, hd: number): Box => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });

interface Slot {
  pos: P2;
  rot: number;
  use: P2;
  /** Высота предмета на стене. */
  y?: number;
}

/** Места у стен для мебели и техники. */
function furnitureSlots(): Slot[] {
  const { w, d } = HOUSE;
  const L = -w / 2;
  const R = w / 2;
  const B = -d / 2;
  const back = [-3.9, -2.2, -0.5, 1.2, 2.9, 4.4].map((x) => ({ pos: { x, z: B + 0.5 }, rot: 0, use: { x, z: B + 1.75 } }));
  const left = [-2.6, 1.9].map((z) => ({ pos: { x: L + 0.7, z }, rot: Math.PI / 2, use: { x: L + 2, z } }));
  const right = [-2.4, -0.7, 1.0, 2.7].map((z) => ({ pos: { x: R - 0.7, z }, rot: -Math.PI / 2, use: { x: R - 2, z } }));
  // Порядок заполнения: сначала задняя стена (лучше видна), потом боковые.
  return [back[1]!, back[3]!, right[1]!, left[0]!, back[0]!, back[4]!, right[2]!, back[2]!, left[1]!, right[0]!, back[5]!, right[3]!];
}

/** Места на стенах (картины, часы, неон, кондиционер). */
function wallSlots(): Slot[] {
  const { w, d } = HOUSE;
  const B = -d / 2;
  const L = -w / 2;
  return [
    { pos: { x: -6.3, z: B + 0.04 }, rot: 0, use: { x: -4.6, z: B + 1.9 }, y: 2.05 },
    { pos: { x: -1.3, z: B + 0.04 }, rot: 0, use: { x: -1.3, z: B + 1.9 }, y: 2.35 },
    { pos: { x: 2.0, z: B + 0.04 }, rot: 0, use: { x: 2.0, z: B + 1.9 }, y: 2.35 },
    { pos: { x: 5.6, z: B + 0.04 }, rot: 0, use: { x: 4.4, z: B + 1.9 }, y: 2.45 },
    { pos: { x: L + 0.04, z: -0.9 }, rot: Math.PI / 2, use: { x: L + 1.6, z: -0.9 }, y: 2.1 },
  ];
}

/** Места на полу для декора. */
function floorSlots(): Slot[] {
  const { w, d } = HOUSE;
  const L = -w / 2;
  const R = w / 2;
  const F = d / 2;
  return [
    { pos: { x: L + 0.45, z: -1.1 }, rot: 0, use: { x: L + 1.5, z: -1.1 } },
    // На кухне у правой стены стоят кошачьи миски — декор между местами для мебели.
    { pos: { x: R - 0.45, z: 0.15 }, rot: 0, use: { x: R - 1.5, z: 0.15 } },
    { pos: { x: L + 0.45, z: 3.0 }, rot: 0, use: { x: L + 1.5, z: 3.0 } },
    { pos: { x: -2.6, z: F - 0.45 }, rot: 0, use: { x: -2.6, z: F - 1.4 } },
    { pos: { x: 3.0, z: F - 0.45 }, rot: 0, use: { x: 3.0, z: F - 1.4 } },
  ];
}

/** Препятствия дома без действий: телевизор и журнальный столик перед диваном (из модели дивана). */
export function homeObstacles(): Box[] {
  return [box(0.4, -1.5, 0.85, 0.3), box(0.4, 0.25, 0.45, 0.35)];
}

export interface PlacedHome extends Placed {
  /** Высота на стене (для настенных предметов). */
  y: number;
}

/**
 * Кошачье хозяйство: миски с кормом и водой на кухне у правой стены (между холодильником
 * и местом для мебели) и лоток в углу у душа. Не занимают платных мест.
 */
export const PETS = {
  bowls: { pos: { x: HOUSE.w / 2 - 0.35, z: -3.65 }, rot: -Math.PI / 2, use: { x: HOUSE.w / 2 - 1.05, z: -3.65 } },
  /** Миска с кормом и миска с водой (мировые координаты). */
  food: { x: HOUSE.w / 2 - 0.35, z: -3.85 },
  water: { x: HOUSE.w / 2 - 0.35, z: -3.45 },
  litter: { pos: { x: 4.55, z: 4.85 }, rot: Math.PI, use: { x: 4.55, z: 4.2 } },
} as const;

/** Предметы дома: базовые на своих местах, купленные — по свободным местам своего вида; pets — есть кошки (миски и лоток). */
export function homeLayout(furniture: readonly ObjectId[], pets = false): PlacedHome[] {
  const { w, d } = HOUSE;
  const L = -w / 2;
  const R = w / 2;
  const B = -d / 2;
  const F = d / 2;
  const base: Placed[] = [
    { id: 'bed', pos: { x: L + 1.3, z: B + 1.4 }, rot: 0, use: { x: L + 2.9, z: B + 1.6 }, box: box(L + 1.3, B + 1.4, 1.05, 1.35) },
    // Перед диваном — столик: подходят к дивану сбоку от него.
    { id: 'sofa', pos: { x: 0.4, z: 1.4 }, rot: Math.PI, use: { x: -0.6, z: 0.6 }, box: box(0.4, 1.4, 1.25, 0.5) },
    { id: 'fridge', pos: { x: R - 0.55, z: B + 0.5 }, rot: 0, use: { x: R - 0.8, z: B + 1.8 }, box: box(R - 0.55, B + 0.5, 0.45, 0.4) },
    { id: 'stove', pos: { x: R - 1.65, z: B + 0.45 }, rot: 0, use: { x: R - 1.9, z: B + 1.7 }, box: box(R - 1.65, B + 0.45, 0.5, 0.4) },
    { id: 'shower', pos: { x: R - 0.75, z: F - 1.2 }, rot: -Math.PI / 2, use: { x: R - 2.1, z: F - 1.2 }, box: box(R - 0.75, F - 1.2, 0.7, 0.7) },
    { id: 'mirror', pos: { x: L + 0.08, z: 0.4 }, rot: Math.PI / 2, use: { x: L + 1.2, z: 0.4 }, box: null },
    { id: 'door', pos: { x: L + 0.06, z: F - 1.3 }, rot: Math.PI / 2, use: { x: L + 1.1, z: F - 1.3 }, box: null },
  ];
  const out: PlacedHome[] = base.map((p) => ({ ...p, y: 0 }));
  const pools: Record<'slot' | 'wall' | 'floor', Slot[]> = { slot: furnitureSlots(), wall: wallSlots(), floor: floorSlots() };
  const used = { slot: 0, wall: 0, floor: 0 };
  for (const id of furniture) {
    const mount = mountOf(id);
    if (mount === 'free') {
      // Робот-пылесос: станция у стены возле двери, сам ездит по дому.
      out.push({ id, pos: { x: L + 0.35, z: 2.75 }, rot: Math.PI / 2, use: { x: L + 1.3, z: 2.75 }, box: null, y: 0 });
      continue;
    }
    const sl = pools[mount][used[mount]];
    if (!sl) continue;
    used[mount] += 1;
    const hw = mount === 'slot' ? 0.55 : 0.28;
    out.push({ id, pos: sl.pos, rot: sl.rot, use: sl.use, box: mount === 'wall' ? null : box(sl.pos.x, sl.pos.z, hw, hw), y: sl.y ?? 0 });
  }
  if (pets) {
    const b = PETS.bowls;
    out.push({ id: 'cat_bowl', pos: { ...b.pos }, rot: b.rot, use: { ...b.use }, box: box(b.pos.x, b.pos.z, 0.18, 0.4), y: 0 });
    const l = PETS.litter;
    out.push({ id: 'litter', pos: { ...l.pos }, rot: l.rot, use: { ...l.use }, box: box(l.pos.x, l.pos.z, 0.3, 0.24), y: 0 });
  }
  return out;
}

/** Предметы зала (душевая и бар — с ростом зала). */
export function gymLayout(shower: boolean, bar: boolean): Placed[] {
  const { w, d } = GYM_ROOM;
  const L = -w / 2;
  const R = w / 2;
  const F = d / 2;
  const B = -d / 2;
  const out: Placed[] = [
    { id: 'coach', pos: { x: 0, z: 2.4 }, rot: Math.PI, use: { x: 0, z: 2.4 }, box: null },
    { id: 'reception', pos: { x: L + 2.2, z: F - 2.2 }, rot: Math.PI / 2, use: { x: L + 3.6, z: F - 2.2 }, box: box(L + 2.2, F - 2.2, 0.5, 1.2) },
    { id: 'gym_door', pos: { x: L + 0.06, z: F - 4.3 }, rot: Math.PI / 2, use: { x: L + 1.1, z: F - 4.3 }, box: null },
  ];
  if (shower) out.push({ id: 'gym_shower', pos: { x: R - 0.8, z: F - 1.6 }, rot: -Math.PI / 2, use: { x: R - 2.2, z: F - 1.6 }, box: box(R - 0.8, F - 1.6, 0.7, 1.2) });
  if (bar) out.push({ id: 'smoothie', pos: { x: R - 0.9, z: B + 2.4 }, rot: -Math.PI / 2, use: { x: R - 2.3, z: B + 2.4 }, box: box(R - 0.9, B + 2.4, 0.5, 1.4) });
  return out;
}

/** Места учеников: ряды лицом к тренеру. */
export function clientSpot(i: number): P2 {
  const row = Math.floor(i / 5);
  const k = i % 5;
  return { x: (k - 2) * 2.1 + (row % 2) * 1.05, z: -1.4 - row * 2.2 };
}

export const bounds = (scene: SceneId): Box => {
  const r = scene === 'home' ? HOUSE : GYM_ROOM;
  return { x0: -r.w / 2 + 0.35, x1: r.w / 2 - 0.35, z0: -r.d / 2 + 0.35, z1: r.d / 2 - 0.2 };
};

/** Точка появления у входной двери. */
export function spawn(scene: SceneId): P2 {
  const door = scene === 'home' ? homeLayout([]).find((p) => p.id === 'door')! : gymLayout(false, false).find((p) => p.id === 'gym_door')!;
  return { x: door.use.x + 0.4, z: door.use.z };
}

export const REACH = 1.7;

export const dist = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Удерживает точку в границах и выталкивает из препятствий. */
export function resolve(p: P2, b0: Box, boxes: readonly Box[]): P2 {
  let { x, z } = p;
  x = Math.max(b0.x0, Math.min(b0.x1, x));
  z = Math.max(b0.z0, Math.min(b0.z1, z));
  const r = 0.3;
  for (const b of boxes) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
      const dx0 = x - (b.x0 - r);
      const dx1 = b.x1 + r - x;
      const dz0 = z - (b.z0 - r);
      const dz1 = b.z1 + r - z;
      const m = Math.min(dx0, dx1, dz0, dz1);
      if (m === dx0) x = b.x0 - r;
      else if (m === dx1) x = b.x1 + r;
      else if (m === dz0) z = b.z0 - r;
      else z = b.z1 + r;
    }
  }
  return { x, z };
}

/** Свободна ли точка и прямой путь к ней (без препятствий по дороге). */
function clearPath(from: P2, to: P2, b0: Box, boxes: readonly Box[]): boolean {
  const steps = Math.max(2, Math.ceil(dist(from, to) / 0.2));
  for (let k = 1; k <= steps; k += 1) {
    const m = { x: from.x + ((to.x - from.x) * k) / steps, z: from.z + ((to.z - from.z) * k) / steps };
    const r = resolve(m, b0, boxes);
    if (Math.abs(r.x - m.x) + Math.abs(r.z - m.z) > 0.01) return false;
  }
  return true;
}

/**
 * Обход препятствия: точка сбоку от пути from → to, до которой путь свободен, — ближайшая
 * к цели (null — обойти нельзя). Герой упёрся в мебель — идёт сначала туда, потом к цели.
 */
export function detourPoint(from: P2, to: P2, b0: Box, boxes: readonly Box[]): P2 | null {
  const base = Math.atan2(to.x - from.x, to.z - from.z);
  let best: P2 | null = null;
  let bestD = Infinity;
  for (const turn of [0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.5, -2.5]) {
    for (const len of [0.7, 1.3, 2.0]) {
      const q = { x: from.x + Math.sin(base + turn) * len, z: from.z + Math.cos(base + turn) * len };
      if (!clearPath(from, q, b0, boxes)) continue;
      // Лучше точка, откуда до цели путь свободен.
      const d = dist(q, to) + (clearPath(q, to, b0, boxes) ? 0 : 2) + Math.abs(turn) * 0.1;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

/** Оборудование зала по уровню (для модели и столкновений). */
export type GearKind = 'mat' | 'rack' | 'kettlebells' | 'squat_rack' | 'bench' | 'treadmill' | 'bag' | 'cable' | 'bike' | 'plant' | 'neon';

export interface Gear {
  kind: GearKind;
  pos: P2;
  rot: number;
  box: Box | null;
}

export function gymGear(tier: number): Gear[] {
  const { w, d } = GYM_ROOM;
  const L = -w / 2;
  const R = w / 2;
  const B = -d / 2;
  const g: Gear[] = [
    { kind: 'rack', pos: { x: -1.5, z: B + 0.5 }, rot: 0, box: box(-1.5, B + 0.5, 1.1, 0.35) },
    { kind: 'kettlebells', pos: { x: 1.5, z: B + 0.5 }, rot: 0, box: box(1.5, B + 0.5, 0.9, 0.3) },
  ];
  for (let i = 0; i < 10; i += 1) {
    const s = clientSpot(i);
    if (i < [2, 4, 6, 8, 10][Math.min(4, tier)]!) g.push({ kind: 'mat', pos: s, rot: 0, box: null });
  }
  if (tier >= 1) {
    g.push({ kind: 'squat_rack', pos: { x: L + 1.1, z: -2.6 }, rot: Math.PI / 2, box: box(L + 1.1, -2.6, 0.8, 1.1) });
    g.push({ kind: 'bench', pos: { x: L + 1.2, z: -0.3 }, rot: Math.PI / 2, box: box(L + 1.2, -0.3, 0.3, 0.7) });
  }
  if (tier >= 2) {
    for (const z of [-0.6, 1.3]) g.push({ kind: 'treadmill', pos: { x: R - 1.1, z }, rot: -Math.PI / 2, box: box(R - 1.1, z, 0.9, 0.45) });
  }
  if (tier >= 3) {
    g.push({ kind: 'bag', pos: { x: -5.2, z: B + 1.2 }, rot: 0, box: box(-5.2, B + 1.2, 0.35, 0.35) });
    g.push({ kind: 'bag', pos: { x: 5.0, z: B + 1.2 }, rot: 0, box: box(5.0, B + 1.2, 0.35, 0.35) });
    g.push({ kind: 'cable', pos: { x: L + 0.8, z: B + 1.0 }, rot: Math.PI / 4, box: box(L + 0.8, B + 1.0, 0.7, 0.7) });
  }
  if (tier >= 4) {
    for (const z of [3.4]) g.push({ kind: 'bike', pos: { x: R - 3.2, z }, rot: -Math.PI / 2, box: box(R - 3.2, z, 0.35, 0.6) });
    g.push({ kind: 'plant', pos: { x: L + 0.5, z: d / 2 - 0.6 }, rot: 0, box: box(L + 0.5, d / 2 - 0.6, 0.3, 0.3) });
    g.push({ kind: 'plant', pos: { x: R - 0.5, z: B + 0.5 }, rot: 0, box: null });
    g.push({ kind: 'neon', pos: { x: 0, z: B + 0.02 }, rot: 0, box: null });
  }
  return g;
}
