import type { ExerciseDef } from '../exercise';
import { dist } from '../geometry';
import { LM } from '../landmarks';
import type { RepSpec } from '../repStateMachine';
import { pt, torsoLength } from './common';
import { THRESHOLDS as T } from './thresholds';

type JackMetrics = {
  /** > 0 — оба запястья выше носа (в длинах корпуса). */
  wristsOverHead: number;
  /** > 0 — оба запястья ниже плеч (в длинах корпуса). */
  wristsBelowShoulders: number;
  /** Расстояние между голеностопами / ширина плеч. */
  feetRatio: number;
  /** Разница высоты запястий, длин корпуса. */
  armDiff: number;
};

const REQUIRED = [
  LM.NOSE,
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_WRIST,
  LM.RIGHT_WRIST,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
];

const J = T.jumpingJack;

const machine: RepSpec<JackMetrics> = {
  id: 'main',
  isStart: (m) => m.wristsBelowShoulders >= 0 && m.feetRatio <= J.feetTogetherMax,
  isPeak: (m) => m.wristsOverHead >= 0 && m.feetRatio >= J.feetApartMin,
  hasLeftStart: (m) => m.wristsBelowShoulders < -J.armHysteresis || m.feetRatio > J.feetTogetherMax + J.feetHysteresis,
  hasLeftPeak: (m) => m.wristsOverHead < -J.armHysteresis || m.feetRatio < J.feetApartMin - J.feetHysteresis,
  peakMargin: (m) => Math.min(m.wristsOverHead, m.feetRatio - J.feetApartMin),
  fullDepthMargin: 0.3,
  minDurationMs: T.minDurationMs.cardio,
  partialReason: 'armsAndLegsWider',
  lockoutReason: 'closeArmsAndLegs',
  checks: [{ id: 'symmetry', reason: 'armsSymmetric', ok: (m) => m.armDiff <= J.armSymmetryMax }],
};

/** Джампинг-джек, камера спереди: руки внизу и стопы вместе → запястья выше головы и стопы шире плеч. */
export const jumpingJack: ExerciseDef<JackMetrics> = {
  id: 'jumping_jack',
  kind: 'cardio',
  view: 'front',
  visibilityThreshold: 0.6,
  createSession() {
    return {
      required: () => REQUIRED,
      highlight: () => REQUIRED,
      metrics(pose) {
        const torso = torsoLength(pose);
        const nose = pt(pose, LM.NOSE);
        const ls = pt(pose, LM.LEFT_SHOULDER);
        const rs = pt(pose, LM.RIGHT_SHOULDER);
        const lw = pt(pose, LM.LEFT_WRIST);
        const rw = pt(pose, LM.RIGHT_WRIST);
        const shoulderY = Math.max(ls.y, rs.y);
        const shoulderWidth = Math.max(dist(ls, rs), 1e-6);
        return {
          wristsOverHead: (nose.y - Math.max(lw.y, rw.y)) / torso,
          wristsBelowShoulders: (Math.min(lw.y, rw.y) - shoulderY) / torso,
          feetRatio: dist(pt(pose, LM.LEFT_ANKLE), pt(pose, LM.RIGHT_ANKLE)) / shoulderWidth,
          armDiff: Math.abs(lw.y - rw.y) / torso,
        };
      },
      machines: [machine],
    };
  },
};
