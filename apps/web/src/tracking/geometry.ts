import type { Point } from './types';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) };
}

/** Угол в вершине b между отрезками b→a и b→c, градусы 0..180. */
export function angleAt(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return NaN;
  const cos = clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1);
  return toDeg(Math.acos(cos));
}

/**
 * Угол между вектором from→to и вертикалью вниз, градусы 0..180.
 * 0 — вектор смотрит строго вниз, 90 — горизонтально, 180 — строго вверх.
 */
export function angleFromDownVertical(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const n = Math.hypot(dx, dy);
  if (n === 0) return NaN;
  return toDeg(Math.acos(clamp(dy / n, -1, 1)));
}

/** Наклон отрезка к горизонтали, градусы 0..90 (направление не важно). */
export function inclinationFromHorizontal(a: Point, b: Point): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx === 0 && dy === 0) return NaN;
  return toDeg(Math.atan2(dy, dx));
}

/** Отклонение отрезка от вертикали, градусы 0..90 (направление не важно). */
export function deviationFromVertical(a: Point, b: Point): number {
  const inc = inclinationFromHorizontal(a, b);
  return Number.isNaN(inc) ? NaN : 90 - inc;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted.at(m) as number) : ((sorted.at(m - 1) as number) + (sorted.at(m) as number)) / 2;
}
