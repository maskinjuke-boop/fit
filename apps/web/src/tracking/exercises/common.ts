import { dist, mid } from '../geometry';
import { LM, SIDE, type Side } from '../landmarks';
import type { Point, Pose, RawPose } from '../types';

const MISSING: Point = { x: NaN, y: NaN, v: 0 };

/** Точка по индексу; наличие ключевых точек заранее гарантирует проверка кадра. */
export function pt(pose: Pose, i: number): Point {
  return pose[i] ?? MISSING;
}

export type SideKey = keyof (typeof SIDE)['left'];

/**
 * Выбор стороны тела для съёмки сбоку с «залипанием»: сторона меняется,
 * только если другая видна заметно лучше. Иначе углы прыгали бы между
 * левой и правой рукой посреди повтора.
 */
export function createSidePicker(keys: readonly SideKey[], switchRatio = 1.25): (raw: RawPose) => Side {
  let current: Side | null = null;
  const score = (raw: RawPose, side: Side): number =>
    keys.reduce((acc, k) => acc + (raw[SIDE[side][k]]?.visibility ?? 0), 0);
  return (raw) => {
    const l = score(raw, 'left');
    const r = score(raw, 'right');
    if (current === null) current = l >= r ? 'left' : 'right';
    else if (current === 'left' && r > l * switchRatio) current = 'right';
    else if (current === 'right' && l > r * switchRatio) current = 'left';
    return current;
  };
}

export function sideIndices(side: Side, keys: readonly SideKey[]): number[] {
  return keys.map((k) => SIDE[side][k]);
}

/** Длина корпуса: от середины плеч до середины бёдер. Единица масштаба для расстояний. */
export function torsoLength(pose: Pose): number {
  const sh = mid(pt(pose, LM.LEFT_SHOULDER), pt(pose, LM.RIGHT_SHOULDER));
  const hp = mid(pt(pose, LM.LEFT_HIP), pt(pose, LM.RIGHT_HIP));
  return dist(sh, hp);
}

/** Длина корпуса для одной стороны (при съёмке сбоку дальняя сторона ненадёжна). */
export function torsoLengthSide(pose: Pose, side: Side): number {
  return dist(pt(pose, SIDE[side].shoulder), pt(pose, SIDE[side].hip));
}
