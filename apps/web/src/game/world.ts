import { regionMonsters } from './combat';
import { rng } from './random';
import type { StoryState } from './storyTypes';

/**
 * Карта мира: дорога через пять регионов с юга на север (по −Z). На дороге — вехи пути
 * (шаги истории) и врата хранителя в конце региона, в стороне от дороги — логова монстров
 * и стоянки. Регион за непобеждённым хранителем закрыт барьером.
 */

export const REGION_LEN = 80;
export const REGION_COUNT = 5;
export const WORLD_HALF_WIDTH = 56;
/** Южный край мира (начало дороги) и северный край. */
export const WORLD_START = 14;
export const WORLD_END = -REGION_LEN * REGION_COUNT - 6;
/** Сколько вех в регионе до хранителя (совпадает с шагами истории). */
export const MARKERS_PER_REGION = 6;

export interface P2 {
  x: number;
  z: number;
}

/** Дорога: x как функция z (плавные изгибы). */
export const roadX = (z: number): number => 16 * Math.sin(z / 37) + 7 * Math.sin(z / 13 + 1.3);

/** Регион по координате z (0 — лес, 4 — цитадель). */
export const regionAt = (z: number): number => Math.max(0, Math.min(REGION_COUNT - 1, Math.floor(-z / REGION_LEN)));

/** Высота рельефа: горы выше, пустыня — дюны, топи — низины; у дороги ровно. */
export function heightAt(x: number, z: number): number {
  const r = regionAt(z);
  const road = Math.min(1, Math.abs(x - roadX(z)) / 14);
  const n = Math.sin(x * 0.13 + z * 0.07) * Math.cos(z * 0.11 - x * 0.05);
  const amp = [0.6, 2.6, 0.35, 1.4, 0.8][r]!;
  const edge = Math.max(0, (Math.abs(x) - 38) / 18);
  return n * amp * road + edge * edge * [3, 9, 1.5, 4, 6][r]!;
}

/** Веха пути: шаг k (0…5) региона r; k = 6 — врата хранителя. */
export function markerPos(region: number, k: number): P2 {
  const z = -REGION_LEN * region - 9 - (k * (REGION_LEN - 20)) / MARKERS_PER_REGION;
  return { x: roadX(z), z };
}

/** Граница региона (барьер на дороге за хранителем). */
export const barrierZ = (region: number): number => -REGION_LEN * (region + 1);

export interface Lair {
  id: string;
  region: number;
  pos: P2;
  monster: ReturnType<typeof regionMonsters>[number];
}

/** Логова монстров: по три в регионе, в стороне от дороги (позиции неизменны). */
export const LAIRS: readonly Lair[] = (() => {
  const out: Lair[] = [];
  for (let r = 0; r < REGION_COUNT; r += 1) {
    const rand = rng(`lair:${r}`);
    const pool = regionMonsters(r);
    for (let i = 0; i < 3; i += 1) {
      const z = -REGION_LEN * r - 16 - i * 22 - rand() * 6;
      const side = i % 2 ? 1 : -1;
      const x = roadX(z) + side * (12 + rand() * 10);
      out.push({ id: `lair_${r}_${i}`, region: r, pos: { x, z }, monster: pool[i % pool.length]! });
    }
  }
  return out;
})();

/** Стоянки (привал) — у дороги в середине каждого региона. */
export const CAMPS: readonly P2[] = Array.from({ length: REGION_COUNT }, (_, r) => {
  const z = -REGION_LEN * r - REGION_LEN * 0.45;
  return { x: roadX(z) + 6, z };
});

/** Самая северная точка, куда можно пройти (до барьера открытого региона). */
export function northLimit(st: Pick<StoryState, 'region' | 'ending'>): number {
  if (st.ending === 'victory') return WORLD_END + 2;
  return Math.max(WORLD_END + 2, barrierZ(Math.min(st.region, REGION_COUNT - 1)) + 1.5);
}

/** Удерживает точку в доступной части мира. */
export function clampToWorld(p: P2, st: Pick<StoryState, 'region' | 'ending'>): P2 {
  return { x: Math.max(-WORLD_HALF_WIDTH, Math.min(WORLD_HALF_WIDTH, p.x)), z: Math.min(WORLD_START, Math.max(northLimit(st), p.z)) };
}

export type WorldTarget = { kind: 'marker'; region: number; step: number; pos: P2 } | { kind: 'boss'; region: number; pos: P2 };

/** Текущая цель на дороге: следующая веха или врата хранителя. */
export function currentTarget(st: Pick<StoryState, 'region' | 'step' | 'ending' | 'started'>): WorldTarget | null {
  if (!st.started || st.ending) return null;
  const region = Math.min(st.region, REGION_COUNT - 1);
  if (st.step >= MARKERS_PER_REGION) return { kind: 'boss', region, pos: markerPos(region, MARKERS_PER_REGION) };
  return { kind: 'marker', region, step: st.step, pos: markerPos(region, st.step) };
}

/** Начальная точка героя в регионе. */
export const regionStart = (region: number): P2 => {
  const z = -REGION_LEN * region - 2;
  return { x: roadX(z), z };
};

export const dist = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Радиус, в котором можно взаимодействовать с объектом. */
export const REACH = 3.2;
