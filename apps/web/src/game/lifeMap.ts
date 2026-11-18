import { HOUSES, mountOf, slotsFor } from './lifeContent';
import type { ObjectId, SceneId } from './lifeTypes';

/**
 * Раскладка двух локаций: котокафе (зал в разрезе, предметы у стен, гости среди кошек)
 * и лавка демона (прилавок с демоном, клетка с кошкой дня, выход).
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
/** Лавка демона. */
export const DEMON_ROOM = { w: 11, d: 9 };

/**
 * Края кафе ступени tier. Кафе растёт влево и к зрителю: правая (стойка) и задняя стены
 * остаются на месте, поэтому стойка, кошачьи миски и лоток не переезжают.
 */
export function houseRect(tier = 0): { L: number; R: number; B: number; F: number; w: number; d: number; cx: number; cz: number } {
  const h = HOUSES[Math.max(0, Math.min(HOUSES.length - 1, tier))]!;
  const R = HOUSE.w / 2;
  const B = -HOUSE.d / 2;
  const L = R - h.w;
  const F = B + h.d;
  return { L, R, B, F, w: h.w, d: h.d, cx: (L + R) / 2, cz: (B + F) / 2 };
}

const box = (x: number, z: number, hw: number, hd: number): Box => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });

interface Slot {
  pos: P2;
  rot: number;
  use: P2;
  /** Высота предмета на стене. */
  y?: number;
}

/** Передняя стена прежней квартиры (у маленькой однушки — её собственная): у неё душ, дверь и лоток. */
export const frontOf = (tier = 0): number => Math.min(HOUSE.d / 2, houseRect(tier).F);

/** Места у стен для мебели и техники (в большом доме — ещё и «островки» посреди новой части). */
function furnitureSlots(tier: number): Slot[] {
  const { L, R, B, F } = houseRect(tier);
  // Убитая однушка: два места у задней стены между кроватью и кухней и одно у правой стены.
  if (tier <= 0) return [1.0, 2.9].map((x) => ({ pos: { x, z: B + 0.5 }, rot: 0, use: { x, z: B + 1.75 } })).concat([{ pos: { x: R - 0.7, z: -0.7 }, rot: -Math.PI / 2, use: { x: R - 2, z: -0.7 } }]);
  const back = [-3.9, -2.2, -0.5, 1.2, 2.9, 4.4].map((x) => ({ pos: { x, z: B + 0.5 }, rot: 0, use: { x, z: B + 1.75 } }));
  // Место у левой стены — сразу за изножьем кровати, не заходя на неё.
  const left = [-2.05, 1.9].map((z) => ({ pos: { x: L + 0.7, z }, rot: Math.PI / 2, use: { x: L + 2, z } }));
  const right = [-2.4, -0.7, 1.0, 2.7].map((z) => ({ pos: { x: R - 0.7, z }, rot: -Math.PI / 2, use: { x: R - 2, z } }));
  // Порядок заполнения: сначала задняя стена (лучше видна), потом боковые.
  const out: Slot[] = [back[1]!, back[3]!, right[1]!, left[0]!, back[0]!, back[4]!, right[2]!, back[2]!, left[1]!, right[0]!, back[5]!, right[3]!];
  if (tier <= 1) return out;
  // Новая часть дома: задняя стена левее, левая стена ближе к зрителю, островки лицом к зрителю.
  for (let x = -5.6; x - 0.55 > L + 2.45; x -= 1.7) out.push({ pos: { x, z: B + 0.5 }, rot: 0, use: { x, z: B + 1.75 } });
  for (const z of [5.8, 7.5]) if (z + 0.55 < F - 0.5) out.push({ pos: { x: L + 0.7, z }, rot: Math.PI / 2, use: { x: L + 2, z } });
  for (const z of [1.6, 4.6]) {
    if (z + 1.3 > F - 0.4) continue;
    for (let x = -5.8; x - 0.55 > L + 2.4; x -= 1.7) out.push({ pos: { x, z }, rot: 0, use: { x, z: z + 1.25 } });
  }
  return out;
}

/** Места на стенах (картины, часы, неон, кондиционер). */
function wallSlots(tier: number): Slot[] {
  const { L, R, B } = houseRect(tier);
  if (tier <= 0) {
    return [
      { pos: { x: 2.0, z: B + 0.04 }, rot: 0, use: { x: 2.0, z: B + 1.9 }, y: 2.35 },
      { pos: { x: L + 0.04, z: -0.9 }, rot: Math.PI / 2, use: { x: L + 1.6, z: -0.9 }, y: 2.1 },
    ];
  }
  const out: Slot[] = [
    { pos: { x: L + 1.2, z: B + 0.04 }, rot: 0, use: { x: L + 2.9, z: B + 1.9 }, y: 2.05 },
    { pos: { x: -1.3, z: B + 0.04 }, rot: 0, use: { x: -1.3, z: B + 1.9 }, y: 2.35 },
    { pos: { x: 2.0, z: B + 0.04 }, rot: 0, use: { x: 2.0, z: B + 1.9 }, y: 2.35 },
    { pos: { x: 3.7, z: B + 0.04 }, rot: 0, use: { x: 3.7, z: B + 1.9 }, y: 2.4 },
    { pos: { x: L + 0.04, z: -0.9 }, rot: Math.PI / 2, use: { x: L + 1.6, z: -0.9 }, y: 2.1 },
  ];
  if (tier <= 1) return out;
  for (let x = -3.9; x > L + 2.6; x -= 2.6) out.push({ pos: { x, z: B + 0.04 }, rot: 0, use: { x, z: B + 1.9 }, y: 2.4 });
  for (const z of [-1.55, 1.85]) out.push({ pos: { x: R - 0.04, z }, rot: -Math.PI / 2, use: { x: R - 1.8, z }, y: 2.45 });
  return out;
}

/** Места на полу для декора. */
function floorSlots(tier: number): Slot[] {
  const { L, R, F } = houseRect(tier);
  const F0 = HOUSE.d / 2;
  if (tier <= 0) {
    return [
      { pos: { x: L + 0.45, z: -2.3 }, rot: 0, use: { x: L + 1.5, z: -2.3 } },
      { pos: { x: R - 0.45, z: 0.15 }, rot: 0, use: { x: R - 1.5, z: 0.15 } },
    ];
  }
  const out: Slot[] = [
    { pos: { x: L + 0.45, z: -1.1 }, rot: 0, use: { x: L + 1.5, z: -1.1 } },
    // На кухне у правой стены стоят кошачьи миски — декор между местами для мебели.
    { pos: { x: R - 0.45, z: 0.15 }, rot: 0, use: { x: R - 1.5, z: 0.15 } },
    { pos: { x: L + 0.45, z: 3.0 }, rot: 0, use: { x: L + 1.5, z: 3.0 } },
    { pos: { x: -2.6, z: F0 - 0.45 }, rot: 0, use: { x: -2.6, z: F0 - 1.4 } },
    { pos: { x: 3.0, z: F0 - 0.45 }, rot: 0, use: { x: 3.0, z: F0 - 1.4 } },
  ];
  if (tier <= 1) return out;
  for (const x of [-5.2, 0.2, -7.8, 5.6, -10.4, -13.0, -15.6]) if (x - 0.3 > L + 0.8) out.push({ pos: { x, z: F - 0.45 }, rot: 0, use: { x, z: F - 1.4 } });
  return out;
}

/** Препятствия кафе без действий: журнальный столик перед диваном (из модели дивана). */
export function homeObstacles(): Box[] {
  return [box(0.4, 0.25, 0.45, 0.35)];
}

/** Столик для гостей: стулья слева и справа (смотрят на столик), где сидят и едят гости. */
export const TABLE = { chair: 0.72, hw: 1.0, hd: 0.42 } as const;

/** Что в кафе занято всегда: стойка, диван, миски, лоток, проход от двери, места мебели и где у неё стоят. */
function fixedKeep(tier: number): Box[] {
  const { L, R, B } = houseRect(tier);
  const P = petsAt(tier);
  const door = { x: L + 0.06, z: frontOf(tier) - 1.3 };
  const keep: Box[] = [
    box(R - 1.7, B + 0.6, 1.25, 1.6),
    box(0.4, 0.9, 1.6, 1.3),
    box(P.bowls.pos.x, P.bowls.pos.z, 1.1, 0.8),
    box(P.litter.pos.x, P.litter.pos.z, 0.9, 1.0),
    box(door.x + 1.2, door.z, 1.4, 0.9),
  ];
  // Места мебели (все, даже пустые: купленная мебель не встанет в столик) и где у неё стоят.
  for (const sl of furnitureSlots(tier)) keep.push(box(sl.pos.x, sl.pos.z, 0.65, 0.65), box(sl.use.x, sl.use.z, 0.45, 0.45));
  for (const sl of floorSlots(tier)) keep.push(box(sl.pos.x, sl.pos.z, 0.45, 0.45), box(sl.use.x, sl.use.z, 0.35, 0.35));
  return keep;
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Игровая зона для кошек: коврик, домик-когтеточка с полками, столбик-когтеточка, тоннель. */
export const PLAY_ZONE = { hw: 1.0, hd: 0.8 } as const;

/**
 * Где игровая зона в кафе ступени tier: у задней стены, ближе к левому краю (свободное место
 * не на местах мебели, не у стойки, дивана, мисок, лотка и двери).
 */
export function playZoneAt(tier: number): P2 {
  const { L, R, B, F } = houseRect(tier);
  const keep = fixedKeep(tier);
  const pad = 0.2;
  let best: P2 | null = null;
  let bestScore = Infinity;
  for (let x = L + PLAY_ZONE.hw + 0.12; x <= R - 3; x += 0.05) {
    for (let z = B + PLAY_ZONE.hd + 0.1; z <= F - PLAY_ZONE.hd - 0.6; z += 0.1) {
      const me = box(x, z, PLAY_ZONE.hw + pad, PLAY_ZONE.hd + pad);
      if (keep.some((k) => overlaps(me, k))) continue;
      const score = (z - B) * 1.0 + (x - L) * 0.12;
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  }
  return best ?? { x: L + PLAY_ZONE.hw + 0.12, z: F - PLAY_ZONE.hd - 0.6 };
}

/**
 * Части игровой зоны в мировых координатах (зона не поворачивается: домик у задней стены):
 * домик (внутри и перед входом), средняя полка и верхняя лежанка домика, столбик-когтеточка
 * (где встать, чтобы точить когти, и полочка на нём), помпон под средней полкой, концы тоннеля.
 */
export interface PlayParts {
  zone: P2;
  /** Внутри домика (пол домика на высоте houseY) и точка перед входом. */
  house: P2;
  houseY: number;
  door: P2;
  /** Средняя полка и верхняя лежанка: где лежать, высота; base — откуда запрыгивать с пола. */
  mid: { pos: P2; y: number };
  top: { pos: P2; y: number };
  base: P2;
  /** Столбик-когтеточка: сам столбик, где кошка стоит перед ним (смотрит на −z), полочка сверху. */
  post: P2;
  scratch: P2;
  postTop: { pos: P2; y: number; edge: P2 };
  /** Помпон на верёвочке под средней полкой и где кошка стоит, чтобы бить его лапой. */
  pompom: P2;
  pompomAt: P2;
  /** Концы тоннеля (кошка пробегает насквозь). */
  tunnel: [P2, P2];
}

export function playParts(zone: P2): PlayParts {
  const at = (x: number, z: number): P2 => ({ x: zone.x + x, z: zone.z + z });
  return {
    zone,
    house: at(-0.55, -0.32),
    houseY: 0.06,
    door: at(-0.55, 0.12),
    mid: { pos: at(-0.12, -0.42), y: 0.82 },
    top: { pos: at(-0.55, -0.32), y: 1.32 },
    base: at(-0.1, 0.12),
    post: at(0.6, -0.45),
    scratch: at(0.6, -0.15),
    postTop: { pos: at(0.6, -0.45), y: 0.8, edge: at(0.6, 0.05) },
    pompom: at(0.0, -0.3),
    pompomAt: at(0.0, 0.0),
    tunnel: [at(-0.48, 0.45), at(0.9, 0.45)],
  };
}

/** Препятствия игровой зоны для кошек: домик и столбик (по коврику и через тоннель — можно). */
export function playCatBoxes(zone: P2): Box[] {
  const p = playParts(zone);
  // Кошка обходит препятствия с запасом 0,3 — коробки меньше самих домика и столбика.
  return [box(p.house.x, p.house.z, 0.05, 0.05), box(p.post.x, p.post.z, 0, 0)];
}

/**
 * Места столиков кафе ступени tier (сколько — по ступени): свободные точки зала поближе к
 * стойке с витриной, не на местах мебели, не у мисок, лотка, двери и игровой зоны, с проходами.
 */
export function cafeTables(tier: number): P2[] {
  const n = HOUSES[Math.max(0, Math.min(HOUSES.length - 1, tier))]!.tables;
  const { L, R, B, F } = houseRect(tier);
  const z0 = playZoneAt(tier);
  const keep = [...fixedKeep(tier), box(z0.x, z0.z, PLAY_ZONE.hw + 0.3, PLAY_ZONE.hd + 0.3)];
  const cand: P2[] = [];
  for (let x = R - 2.0; x >= L + 1.6; x -= 0.25) for (let z = B + 2.0; z <= F - 1.2; z += 0.25) cand.push({ x, z });
  const goal = { x: R - 4.2, z: B + 4.0 };
  cand.sort((a, b) => dist(a, goal) - dist(b, goal));
  const out: P2[] = [];
  const pad = 0.45;
  for (const c of cand) {
    if (out.length >= n) break;
    const me = box(c.x, c.z, TABLE.hw + pad, TABLE.hd + pad);
    if (keep.some((k) => overlaps(me, k))) continue;
    if (out.some((o) => Math.abs(o.x - c.x) < 2 * TABLE.hw + 1.0 && Math.abs(o.z - c.z) < 2 * TABLE.hd + 1.1)) continue;
    out.push(c);
  }
  return out;
}

/** Стулья у столиков: точка стула и куда смотрит сидящий (на столик). */
export function tableChairs(tier: number): Array<{ pos: P2; face: number; table: number }> {
  return cafeTables(tier).flatMap((t, i) => [
    { pos: { x: t.x - TABLE.chair, z: t.z }, face: Math.PI / 2, table: i },
    { pos: { x: t.x + TABLE.chair, z: t.z }, face: -Math.PI / 2, table: i },
  ]);
}

export interface PlacedHome extends Placed {
  /** Высота на стене (для настенных предметов). */
  y: number;
}

/**
 * Кошачье хозяйство: миски с кормом и водой на кухне у правой стены (между холодильником
 * и местом для мебели) и лоток в углу у душа. Не занимают платных мест.
 */
export const petsAt = (tier = 1) => {
  const F0 = frontOf(tier);
  return {
    bowls: { pos: { x: HOUSE.w / 2 - 0.35, z: -3.65 }, rot: -Math.PI / 2, use: { x: HOUSE.w / 2 - 1.05, z: -3.65 } },
    /** Миска с кормом и миска с водой (мировые координаты). */
    food: { x: HOUSE.w / 2 - 0.35, z: -3.85 },
    water: { x: HOUSE.w / 2 - 0.35, z: -3.45 },
    litter: { pos: { x: 4.55, z: F0 - 0.65 }, rot: Math.PI, use: { x: 4.55, z: F0 - 1.3 } },
  } as const;
};
/** Кошачье хозяйство в квартире и домах побольше (у однушки лоток ближе: см. petsAt). */
export const PETS = petsAt(1);

/** Предметы дома: базовые на своих местах, купленные — по свободным местам своего вида; pets — есть кошки (миски и лоток). */
export function homeLayout(furniture: readonly ObjectId[], pets = false, tier = 0): PlacedHome[] {
  const { L, R, B } = houseRect(tier);
  // Дверь остаётся у прежней передней части зала (рядом с лотком).
  const F = frontOf(tier);
  const base: Placed[] = [
    // Стойка с витриной у задней стены справа.
    { id: 'counter', pos: { x: R - 1.7, z: B + 0.6 }, rot: -Math.PI / 2, use: { x: R - 1.9, z: B + 1.85 }, box: box(R - 1.7, B + 0.6, 1.25, 0.55) },
    // Перед диваном — столик: подходят к дивану сбоку от него.
    { id: 'sofa', pos: { x: 0.4, z: 1.4 }, rot: Math.PI, use: { x: -0.6, z: 0.6 }, box: box(0.4, 1.4, 1.25, 0.5) },
    { id: 'door', pos: { x: L + 0.06, z: F - 1.3 }, rot: Math.PI / 2, use: { x: L + 1.1, z: F - 1.3 }, box: null },
  ];
  // Игровая зона для кошек: подходят к ней спереди.
  const pz = playZoneAt(tier);
  base.push({ id: 'play_zone', pos: pz, rot: 0, use: { x: pz.x + 0.2, z: pz.z + PLAY_ZONE.hd + 0.55 }, box: box(pz.x, pz.z, PLAY_ZONE.hw, PLAY_ZONE.hd) });
  // Столики: подходят к ним спереди (со стороны зрителя).
  for (const tb of cafeTables(tier)) base.push({ id: 'table', pos: tb, rot: 0, use: { x: tb.x, z: tb.z + TABLE.hd + 0.75 }, box: box(tb.x, tb.z, TABLE.hw, TABLE.hd) });
  const out: PlacedHome[] = base.map((p) => ({ ...p, y: 0 }));
  const pools: Record<'slot' | 'wall' | 'floor', Slot[]> = {
    slot: furnitureSlots(tier).slice(0, slotsFor('slot', tier)),
    wall: wallSlots(tier).slice(0, slotsFor('wall', tier)),
    floor: floorSlots(tier).slice(0, slotsFor('floor', tier)),
  };
  const used = { slot: 0, wall: 0, floor: 0 };
  for (const id of furniture) {
    const mount = mountOf(id);
    if (mount === 'free') {
      // Робот-пылесос: станция у стены возле двери, сам ездит по дому.
      const z = tier <= 0 ? F - 0.4 : 2.75;
      out.push({ id, pos: { x: L + 0.35, z }, rot: Math.PI / 2, use: { x: L + 1.3, z }, box: null, y: 0 });
      continue;
    }
    const sl = pools[mount][used[mount]];
    if (!sl) continue;
    used[mount] += 1;
    const hw = mount === 'slot' ? 0.55 : 0.28;
    out.push({ id, pos: sl.pos, rot: sl.rot, use: sl.use, box: mount === 'wall' ? null : box(sl.pos.x, sl.pos.z, hw, hw), y: sl.y ?? 0 });
  }
  if (pets) {
    const P = petsAt(tier);
    const b = P.bowls;
    out.push({ id: 'cat_bowl', pos: { ...b.pos }, rot: b.rot, use: { ...b.use }, box: box(b.pos.x, b.pos.z, 0.18, 0.4), y: 0 });
    const l = P.litter;
    out.push({ id: 'litter', pos: { ...l.pos }, rot: l.rot, use: { ...l.use }, box: box(l.pos.x, l.pos.z, 0.3, 0.24), y: 0 });
  }
  return out;
}

/** Лавка демона: прилавок с демоном у задней стены, клетка с кошкой дня, выход слева. */
export function demonLayout(): Placed[] {
  const { w, d } = DEMON_ROOM;
  const L = -w / 2;
  const F = d / 2;
  const B = -d / 2;
  return [
    { id: 'demon', pos: { x: 0, z: B + 1.4 }, rot: 0, use: { x: 0, z: B + 3.0 }, box: box(0, B + 1.4, 1.5, 0.55) },
    { id: 'cage', pos: { x: 3.0, z: B + 1.6 }, rot: -0.35, use: { x: 2.6, z: B + 3.0 }, box: box(3.0, B + 1.6, 0.6, 0.5) },
    { id: 'demon_door', pos: { x: L + 0.06, z: F - 2.0 }, rot: Math.PI / 2, use: { x: L + 1.1, z: F - 2.0 }, box: null },
  ];
}

/** Где сидит или стоит демон (за прилавком). */
export const DEMON_SPOT: P2 = { x: 0, z: -DEMON_ROOM.d / 2 + 0.55 };

/**
 * Места гостей в кафе: свободные точки зала (не в мебели и не у дверей), сначала ближе к
 * середине, где играют кошки.
 */
export function guestSpots(tier: number, boxes: readonly Box[], n: number): P2[] {
  const { L, R, B, F, cx, cz } = houseRect(tier);
  const out: P2[] = [];
  const cand: P2[] = [];
  for (let x = L + 1.6; x <= R - 1.6; x += 1.5) for (let z = B + 2.2; z <= F - 1.4; z += 1.5) cand.push({ x, z });
  cand.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  for (const p of cand) {
    if (out.length >= n) break;
    if (blocked(p, boxes, 0.55)) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.3)) continue;
    out.push(p);
  }
  return out;
}

/** Где можно ходить: в кафе ступени house или в лавке демона. */
export const bounds = (scene: SceneId, tier?: number): Box => {
  if (scene === 'cafe') {
    const h = houseRect(tier ?? 0);
    return { x0: h.L + 0.35, x1: h.R - 0.35, z0: h.B + 0.35, z1: h.F - 0.2 };
  }
  const r = DEMON_ROOM;
  return { x0: -r.w / 2 + 0.35, x1: r.w / 2 - 0.35, z0: -r.d / 2 + 0.35, z1: r.d / 2 - 0.2 };
};

/** Точка появления у входной двери. */
export function spawn(scene: SceneId, tier?: number): P2 {
  const door = scene === 'cafe' ? homeLayout([], false, tier ?? 0).find((p) => p.id === 'door')! : demonLayout().find((p) => p.id === 'demon_door')!;
  return { x: door.use.x + 0.4, z: door.use.z };
}

export const REACH = 1.7;

/**
 * Скорости героя (м сцены/с; сцена крупнее метра в 1,33 раза): шаг — сам идёт к цели
 * (≈ 1,5 м/с у человека), бег трусцой — стик до упора.
 */
export const WALK_SPEED = 2.0;
export const RUN_SPEED = 3.3;
/** До какого наклона стика герой идёт шагом (клавиши без Shift — тоже шагом). */
export const STICK_WALK = 0.7;

/** Скорость по наклону стика (0…1): до 70 % — шаг (чем дальше, тем быстрее), дальше — разгон до бега. */
export function stickSpeed(mag: number): number {
  if (mag <= 0.05) return 0;
  const m = Math.min(1, mag);
  return m <= STICK_WALK ? (WALK_SPEED * m) / STICK_WALK : WALK_SPEED + ((RUN_SPEED - WALK_SPEED) * (m - STICK_WALK)) / (1 - STICK_WALK);
}

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

/** Стоит ли точка внутри препятствия (с запасом r). */
export function blocked(p: P2, boxes: readonly Box[], r: number): boolean {
  return boxes.some((b) => p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r);
}

/**
 * Первая точка на пути from → to, где герой может стоять (resolve её не сдвигает): с места у
 * мебели (на диване, в кровати) он выходит сюда шагом и отсюда же подходит. Нет такой — to.
 */
export function freeSpot(from: P2, to: P2, b0: Box, boxes: readonly Box[]): P2 {
  const steps = Math.max(1, Math.ceil(dist(from, to) / 0.05));
  for (let k = 0; k < steps; k += 1) {
    const m = { x: from.x + ((to.x - from.x) * k) / steps, z: from.z + ((to.z - from.z) * k) / steps };
    const r = resolve(m, b0, boxes);
    if (Math.abs(r.x - m.x) + Math.abs(r.z - m.z) < 1e-6) return m;
  }
  return { ...to };
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
