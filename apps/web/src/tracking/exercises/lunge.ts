import type { ExerciseDef } from '../exercise';
import { angleAt, deviationFromVertical } from '../geometry';
import { LM, SIDE, type Side } from '../landmarks';
import { angleRep } from '../repStateMachine';
import { createSidePicker, pt } from './common';
import { THRESHOLDS as T } from './thresholds';

type LungeMetrics = { frontKnee: number; torso: number };

const LEGS = [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE];

/**
 * Выпад, камера сбоку: нужны обе ноги. «Переднее» колено — то, что согнуто сильнее.
 * Колени ≥ 160° → переднее ≤ 100° → колени ≥ 160°, корпус вертикальный (≤ 20°).
 * Дальняя нога видна хуже, поэтому порог видимости снижен до 0,5.
 */
export const lunge: ExerciseDef<LungeMetrics> = {
  id: 'lunge',
  kind: 'strength',
  view: 'side',
  visibilityThreshold: T.lunge.visibility,
  createSession() {
    const pick = createSidePicker(['shoulder', 'hip']);
    let side: Side = 'left';
    return {
      required(raw) {
        side = pick(raw);
        return [SIDE[side].shoulder, ...LEGS];
      },
      highlight: () => [SIDE[side].shoulder, ...LEGS],
      metrics(pose) {
        const left = angleAt(pt(pose, LM.LEFT_HIP), pt(pose, LM.LEFT_KNEE), pt(pose, LM.LEFT_ANKLE));
        const right = angleAt(pt(pose, LM.RIGHT_HIP), pt(pose, LM.RIGHT_KNEE), pt(pose, LM.RIGHT_ANKLE));
        return {
          frontKnee: Math.min(left, right),
          torso: deviationFromVertical(pt(pose, SIDE[side].hip), pt(pose, SIDE[side].shoulder)),
        };
      },
      machines: [
        angleRep<LungeMetrics>({
          metric: 'frontKnee',
          start: { dir: 'above', value: T.lunge.kneeTop },
          peak: { dir: 'below', value: T.lunge.frontKneeBottom },
          hysteresis: T.hysteresisDeg,
          minDurationMs: T.minDurationMs.strength,
          partialReason: 'goLower',
          lockoutReason: 'standUpFully',
          checks: [{ id: 'torso', reason: 'torsoUpright', ok: (m) => m.torso <= T.lunge.torsoMaxFromVertical }],
        }),
      ],
    };
  },
};
