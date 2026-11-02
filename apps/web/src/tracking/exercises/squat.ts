import type { ExerciseDef } from '../exercise';
import { angleAt, inclinationFromHorizontal } from '../geometry';
import { SIDE, type Side } from '../landmarks';
import { angleRep } from '../repStateMachine';
import { createSidePicker, pt, sideIndices, type SideKey } from './common';
import { THRESHOLDS as T } from './thresholds';

type SquatMetrics = { knee: number; torso: number };

const KEYS: readonly SideKey[] = ['shoulder', 'hip', 'knee', 'ankle'];

/** Приседание, камера сбоку или под 45°: колено 160° → 100° → 160°, корпус не ниже 45° к полу. */
export const squat: ExerciseDef<SquatMetrics> = {
  id: 'squat',
  kind: 'strength',
  view: 'sideOr45',
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
        return {
          knee: angleAt(pt(pose, s.hip), pt(pose, s.knee), pt(pose, s.ankle)),
          torso: inclinationFromHorizontal(pt(pose, s.hip), pt(pose, s.shoulder)),
        };
      },
      machines: [
        angleRep<SquatMetrics>({
          metric: 'knee',
          start: { dir: 'above', value: T.squat.kneeTop },
          peak: { dir: 'below', value: T.squat.kneeBottom },
          hysteresis: T.hysteresisDeg,
          minDurationMs: T.minDurationMs.strength,
          partialReason: 'goLower',
          lockoutReason: 'standUpFully',
          checks: [{ id: 'torso', reason: 'chestUp', ok: (m) => m.torso >= T.squat.torsoMinFromFloor }],
        }),
      ],
    };
  },
};
