import type { ExerciseDef } from '../exercise';
import { angleAt, dist } from '../geometry';
import { SIDE, type Side } from '../landmarks';
import { angleRep } from '../repStateMachine';
import { createSidePicker, pt, sideIndices, torsoLengthSide, type SideKey } from './common';
import { THRESHOLDS as T } from './thresholds';

type SitupMetrics = { hip: number; ankleX: number; ankleY: number; torso: number };

const KEYS: readonly SideKey[] = ['shoulder', 'hip', 'knee', 'ankle'];

/** Скручивание, камера сбоку: угол плечо–бедро–колено ≥ 120° → ≤ 70° → ≥ 120°, ноги неподвижны. */
export const situp: ExerciseDef<SitupMetrics> = {
  id: 'situp',
  kind: 'strength',
  view: 'side',
  visibilityThreshold: 0.6,
  createSession() {
    const pick = createSidePicker(KEYS);
    let side: Side = 'left';
    return {
      required(raw) {
        side = pick(raw);
        return sideIndices(side, KEYS);
      },
      highlight: () => sideIndices(side, KEYS),
      metrics(pose) {
        const s = SIDE[side];
        const ankle = pt(pose, s.ankle);
        return {
          hip: angleAt(pt(pose, s.shoulder), pt(pose, s.hip), pt(pose, s.knee)),
          ankleX: ankle.x,
          ankleY: ankle.y,
          torso: torsoLengthSide(pose, side),
        };
      },
      machines: [
        angleRep<SitupMetrics>({
          metric: 'hip',
          start: { dir: 'above', value: T.situp.hipAngleLying },
          peak: { dir: 'below', value: T.situp.hipAngleUp },
          hysteresis: T.hysteresisDeg,
          minDurationMs: T.minDurationMs.strength,
          partialReason: 'comeHigher',
          lockoutReason: 'lieBackFully',
          checks: [
            {
              id: 'feet',
              reason: 'keepFeetStill',
              ok: (m, ref) =>
                dist({ x: m.ankleX, y: m.ankleY, v: 1 }, { x: ref.ankleX, y: ref.ankleY, v: 1 }) <= T.situp.feetMaxShift * ref.torso,
            },
          ],
        }),
      ],
    };
  },
};
