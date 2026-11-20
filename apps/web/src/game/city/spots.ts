import { TILE } from './content';
import type { Building, BuildingId } from './types';

/**
 * Места кошек в зданиях (в осях клетки: центр — 0, 0, фасад смотрит на +z, к камере):
 * где стоит, на какой высоте, куда смотрит и что делает. Нужны и симуляции (куда идти),
 * и сцене (поза кошки).
 */

export type SpotPose = 'hidden' | 'stand' | 'sit' | 'work' | 'swing' | 'slide' | 'ride' | 'fish' | 'climb' | 'eat' | 'shop' | 'pray' | 'hammer' | 'play' | 'dance';

export interface Spot {
  x: number;
  z: number;
  /** Высота (полка, скамейка). */
  y: number;
  /** Куда смотрит: 0 — на +z (к камере). */
  h: number;
  pose: SpotPose;
}

const s = (x: number, z: number, pose: SpotPose, h = 0, y = 0): Spot => ({ x, z, y, h, pose });

/** Где кошка ждёт у входа (на дорожке перед фасадом). */
export const DOOR_Z = TILE / 2 - 0.35;

const SPOTS: Partial<Record<BuildingId, readonly Spot[]>> = {
  temple: [s(-1.3, 1.25, 'pray', Math.PI), s(-0.45, 1.5, 'pray', Math.PI), s(0.45, 1.5, 'pray', Math.PI), s(1.3, 1.25, 'pray', Math.PI), s(-1.6, 0.4, 'pray', Math.PI * 0.75), s(1.6, 0.4, 'pray', -Math.PI * 0.75)],
  garden: [s(-1.2, 1.05, 'sit', 0, 0.26), s(-0.7, 1.05, 'sit', 0, 0.26), s(0.7, 1.05, 'sit', 0, 0.26), s(1.2, 1.05, 'sit', 0, 0.26), s(0, 0.55, 'stand', Math.PI)],
  fountain: Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 5) * Math.PI;
    // По переднему краю чаши, лицом наружу.
    return s(Math.sin(a) * 1.25, Math.cos(a) * 1.25 * 0.9 + 0.1, 'sit', a, 0.3);
  }),
  flowerbed: [s(-0.9, 1.3, 'stand', Math.PI), s(0, 1.35, 'stand', Math.PI), s(0.9, 1.3, 'stand', Math.PI)],
  lanterns: [s(-0.8, 1.2, 'stand', 0), s(0.8, 1.2, 'stand', 0), s(0, 0.2, 'dance', 0)],
  statue: [s(-1.0, 1.2, 'stand', Math.PI), s(1.0, 1.2, 'stand', Math.PI), s(0, 1.45, 'pray', Math.PI)],
  playground: [s(-0.95, 0.15, 'slide', 0, 0), s(0.55, -0.35, 'swing', 0, 0.32), s(1.15, -0.35, 'swing', 0, 0.32), s(-0.2, 1.05, 'play', 0), s(0.7, 1.15, 'play', Math.PI)],
  cafe: [s(-1.25, 0.55, 'eat', Math.PI / 2, 0.24), s(-0.45, 0.55, 'eat', -Math.PI / 2, 0.24), s(0.45, 0.55, 'eat', Math.PI / 2, 0.24), s(1.25, 0.55, 'eat', -Math.PI / 2, 0.24), s(-0.4, -0.65, 'eat', Math.PI / 2, 0.24), s(0.4, -0.65, 'eat', -Math.PI / 2, 0.24)],
  pond: [s(-0.6, 0.35, 'fish', Math.PI, 0.12), s(0, 0.35, 'fish', Math.PI, 0.12), s(0.6, 0.35, 'fish', Math.PI, 0.12), s(1.3, 1.2, 'sit', Math.PI * 0.8)],
  cattower: [s(0.75, 1.0, 'play', Math.PI), s(-0.2, 0.25, 'climb', 0, 0.75), s(0.3, -0.05, 'climb', 0, 1.35), s(-0.25, -0.2, 'sit', 0, 1.95)],
  market: [s(-1.05, 1.0, 'shop', Math.PI), s(0, 1.0, 'shop', Math.PI), s(1.05, 1.0, 'shop', Math.PI), s(-0.5, 1.45, 'stand', Math.PI), s(0.5, 1.45, 'stand', Math.PI), s(0, 1.6, 'stand', Math.PI)],
  carousel: Array.from({ length: 6 }, (_, i) => s(0, 0, 'ride', (i / 6) * Math.PI * 2)),
  cinema: Array.from({ length: 8 }, () => s(0, 0.9, 'hidden')),
};

/** Рабочие места мастерской (у прилавка и станков, лицом к улице). */
const WORK: readonly Spot[] = [s(-0.6, 0.35, 'work'), s(0.6, 0.35, 'work'), s(-0.6, -0.4, 'work'), s(0.6, -0.4, 'work')];

/** Места здания по занятию: дом — внутри, на крыльце или у стены с молотком. */
export function spotsOf(b: Pick<Building, 'kind' | 'type'>, use: 'inside' | 'porch' | 'hammer' | 'visit' = 'visit'): readonly Spot[] {
  if (b.kind === 'house') {
    if (use === 'porch') return [s(0.62, 1.42, 'sit', 0, 0.12), s(-0.62, 1.42, 'sit', 0, 0.12), s(0, 1.55, 'sit', 0)];
    if (use === 'hammer') return [s(-1.15, 1.35, 'hammer', Math.PI * 0.85), s(1.15, 1.35, 'hammer', -Math.PI * 0.85)];
    return [s(0, 1.0, 'hidden'), s(0, 1.0, 'hidden'), s(0, 1.0, 'hidden')];
  }
  if (b.kind === 'workshop') return WORK;
  return SPOTS[b.type] ?? [s(0, 1.3, 'stand', Math.PI)];
}

/** Центр клетки в метрах. */
export const tileCenter = (gx: number, gz: number): [number, number] => [gx * TILE, gz * TILE];

/** Точка на дорожке перед фасадом здания. */
export function frontOf(b: Pick<Building, 'gx' | 'gz'>): [number, number] {
  const [x, z] = tileCenter(b.gx, b.gz);
  return [x, z + TILE / 2];
}

/** Мировая точка места. */
export function spotWorld(b: Pick<Building, 'gx' | 'gz'>, sp: Spot): [number, number] {
  const [x, z] = tileCenter(b.gx, b.gz);
  return [x + sp.x, z + sp.z];
}

/**
 * Путь по дорожкам между клетками: от точки a по горизонтальной дорожке до ближайшей
 * вертикальной, по ней — до дорожки цели, дальше к цели. Дорожки идут по границам клеток,
 * поэтому через здания путь не проходит.
 */
export function roadPath(a: [number, number], b: [number, number]): Array<[number, number]> {
  const H = TILE / 2;
  // Горизонтальные дорожки — z = (k + 0.5) · TILE, вертикальные — x = (k + 0.5) · TILE.
  // Дорожка точки: если стоит на дорожке — она, если внутри клетки — дорожка перед фасадом клетки.
  const rowOf = (z: number): number => {
    const line = Math.round((z - H) / TILE) * TILE + H;
    if (Math.abs(z - line) < 0.05) return line;
    return Math.round(z / TILE) * TILE + H;
  };
  const colNear = (x: number): number => Math.round((x - H) / TILE) * TILE + H;
  const za = rowOf(a[1]);
  const zb = rowOf(b[1]);
  const out: Array<[number, number]> = [];
  const push = (p: [number, number]): void => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.01) out.push(p);
  };
  push([a[0], za]);
  if (Math.abs(za - zb) > 0.01) {
    // Вертикальная дорожка между точками (ближе к a).
    const lo = Math.min(a[0], b[0]);
    const hi = Math.max(a[0], b[0]);
    let cx = colNear(a[0]);
    if (cx < lo - H || cx > hi + H) cx = colNear((a[0] + b[0]) / 2);
    push([cx, za]);
    push([cx, zb]);
  }
  push([b[0], zb]);
  push(b);
  return out;
}
