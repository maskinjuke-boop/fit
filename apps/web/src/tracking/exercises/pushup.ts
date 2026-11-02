import type { ExerciseDef } from '../exercise';
import { angleAt } from '../geometry';
import { SIDE, type Side } from '../landmarks';
import { angleRep } from '../repStateMachine';
import { createSidePicker, pt, sideIndices, type SideKey } from './common';
import { THRESHOLDS as T } from './thresholds';

type PushupMetrics = { elbow: number; body: number };

const KEYS: readonly SideKey[] = ['shoulder', 'elbow', 'wrist', 'hip', 'ankle'];

/** Отжимание, камера сбоку: угол в локте 155° → 90° → 155°, корпус прямой. */
export const pushup: ExerciseDef<PushupMetrics> = {
  id: 'pushup',
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
        return {
          elbow: angleAt(pt(pose, s.shoulder), pt(pose, s.elbow), pt(pose, s.wrist)),
          body: angleAt(pt(pose, s.shoulder), pt(pose, s.hip), pt(pose, s.ankle)),
        };
      },
      machines: [
        angleRep<PushupMetrics>({
          metric: 'elbow',
          start: { dir: 'above', value: T.pushup.elbowTop },
          peak: { dir: 'below', value: T.pushup.elbowBottom },
          hysteresis: T.hysteresisDeg,
          minDurationMs: T.minDurationMs.strength,
          partialReason: 'goLower',
          lockoutReason: 'extendArms',
          checks: [{ id: 'body', reason: 'keepBodyStraight', ok: (m) => m.body >= T.pushup.bodyStraightMin }],
        }),
      ],
    };
  },
};
