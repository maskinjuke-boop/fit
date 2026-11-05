import { BASE_OBJECTS, HOMES, LOCATIONS, LOCATION_IDS } from './lifeContent';
import type { HomeId, LocationId, ObjectId, SceneId } from './lifeTypes';

/**
 * Раскладка сцен симулятора: комната квартиры (размер зависит от жилья, предметы — у стен)
 * и улица города (двери мест в ряд вдоль тротуара, парк слева). Координаты: x — вправо,
 * z — к камере, пол y = 0.
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
  /** Центр предмета. */
  pos: P2;
  /** Поворот вокруг Y (лицевая сторона предмета смотрит на +Z при 0). */
  rot: number;
  /** Где встать, чтобы пользоваться. */
  use: P2;
  box: Box | null;
}

export const ROOM: Record<HomeId, { w: number; d: number }> = {
  studio: { w: 9, d: 7.5 },
  flat: { w: 11, d: 8.5 },
  loft: { w: 13, d: 9.5 },
  penthouse: { w: 15, d: 10.5 },
};

const box = (x: number, z: number, hw: number, hd: number): Box => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });

/** Предметы в квартире: базовые на своих местах, купленные — по свободным местам у стен. */
export function homeLayout(home: HomeId, furniture: readonly ObjectId[]): Placed[] {
  const { w, d } = ROOM[home];
  const L = -w / 2;
  const R = w / 2;
  const B = -d / 2;
  const F = d / 2;
  const out: Placed[] = [
    { id: 'bed', pos: { x: L + 1.3, z: B + 1.4 }, rot: 0, use: { x: L + 2.9, z: B + 1.6 }, box: box(L + 1.3, B + 1.4, 1.05, 1.35) },
    { id: 'sofa', pos: { x: 0.4, z: 0.9 }, rot: Math.PI, use: { x: 0.4, z: 2.2 }, box: box(0.4, 0.9, 1.25, 0.5) },
    { id: 'fridge', pos: { x: R - 0.55, z: B + 0.5 }, rot: 0, use: { x: R - 0.8, z: B + 1.8 }, box: box(R - 0.55, B + 0.5, 0.45, 0.4) },
    { id: 'stove', pos: { x: R - 1.65, z: B + 0.45 }, rot: 0, use: { x: R - 1.9, z: B + 1.7 }, box: box(R - 1.65, B + 0.45, 0.5, 0.4) },
    { id: 'shower', pos: { x: R - 0.75, z: F - 1.2 }, rot: -Math.PI / 2, use: { x: R - 2.1, z: F - 1.2 }, box: box(R - 0.75, F - 1.2, 0.7, 0.7) },
    { id: 'mirror', pos: { x: L + 0.08, z: 0.4 }, rot: Math.PI / 2, use: { x: L + 1.2, z: 0.4 }, box: null },
    { id: 'door', pos: { x: L + 0.06, z: F - 1.3 }, rot: Math.PI / 2, use: { x: L + 1.1, z: F - 1.3 }, box: null },
  ];
  // Места для купленной мебели: у стен и в углах (в маленьком жилье их меньше).
  const slots: Array<{ pos: P2; rot: number; use: P2 }> = [
    { pos: { x: 0.4, z: B + 0.45 }, rot: 0, use: { x: 0.4, z: B + 1.7 } },
    { pos: { x: L + 0.7, z: -1.3 }, rot: Math.PI / 2, use: { x: L + 2, z: -1.3 } },
    { pos: { x: R - 0.7, z: -0.9 }, rot: -Math.PI / 2, use: { x: R - 2, z: -0.9 } },
    { pos: { x: -2.4, z: F - 0.8 }, rot: Math.PI, use: { x: -2.4, z: F - 2.1 } },
    { pos: { x: 2.2, z: F - 0.8 }, rot: Math.PI, use: { x: 2.2, z: F - 2.1 } },
    { pos: { x: -2.2, z: B + 0.45 }, rot: 0, use: { x: -2.2, z: B + 1.7 } },
    { pos: { x: 3.2, z: B + 0.45 }, rot: 0, use: { x: 3.2, z: B + 1.7 } },
    { pos: { x: L + 0.7, z: 2.2 }, rot: Math.PI / 2, use: { x: L + 2, z: 2.2 } },
    { pos: { x: R - 0.7, z: 1.5 }, rot: -Math.PI / 2, use: { x: R - 2, z: 1.5 } },
    { pos: { x: 0, z: F - 0.8 }, rot: Math.PI, use: { x: 0, z: F - 2.1 } },
  ];
  furniture.slice(0, HOMES[home].slots).forEach((id, i) => {
    const s = slots[i];
    if (!s) return;
    out.push({ id, pos: s.pos, rot: s.rot, use: s.use, box: box(s.pos.x, s.pos.z, 0.55, 0.55) });
  });
  return out;
}

export const homeBounds = (home: HomeId): Box => {
  const { w, d } = ROOM[home];
  return { x0: -w / 2 + 0.35, x1: w / 2 - 0.35, z0: -d / 2 + 0.35, z1: d / 2 - 0.2 };
};

// ─── Улица ─────────────────────────────────────────────────────────────

/** Линия фасадов (двери) и тротуар. */
export const FACADE_Z = -1;
export const CITY_BOUNDS: Box = { x0: -82, x1: 108, z0: -0.4, z1: 8.5 };

/** Где встать у двери места. */
export const doorPos = (loc: LocationId): P2 => ({ x: LOCATIONS[loc].x, z: loc === 'park' ? 1.5 : 0.6 });

/** Препятствия на улице (кроме зданий, они за линией фасадов). */
export const CITY_BOXES: readonly Box[] = [];

/** Точка появления: у входной двери дома (в квартире) или у подъезда (на улице). */
export function spawn(scene: SceneId, home: HomeId): P2 {
  if (scene === 'city') return { x: doorPos('home').x, z: 1.6 };
  const door = homeLayout(home, []).find((p) => p.id === 'door')!;
  return { x: door.use.x + 0.4, z: door.use.z };
}

/** Где стоят жители у места (несколько — рядом друг с другом). */
export function personSpot(loc: LocationId, i: number): P2 {
  const d = doorPos(loc);
  const off = [2.6, -2.6, 4.4, -4.4][i % 4]!;
  return { x: d.x + off, z: loc === 'park' ? 3 + (i % 2) : 1.2 };
}

export const REACH = 1.7;

export const dist = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Удерживает точку в границах и выталкивает из препятствий. */
export function resolve(p: P2, bounds: Box, boxes: readonly Box[]): P2 {
  let { x, z } = p;
  x = Math.max(bounds.x0, Math.min(bounds.x1, x));
  z = Math.max(bounds.z0, Math.min(bounds.z1, z));
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

export { BASE_OBJECTS, LOCATION_IDS };
