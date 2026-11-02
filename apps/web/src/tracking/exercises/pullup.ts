import type { ExerciseDef, ExerciseSession } from '../exercise';
import { angleAt, median, mid } from '../geometry';
import { LM, SIDE, type Side } from '../landmarks';
import { angleRep, type RepSpec } from '../repStateMachine';
import type { FrameHint, Pose } from '../types';
import { createSidePicker, pt, sideIndices, torsoLength, type SideKey } from './common';
import { THRESHOLDS as T } from './thresholds';

type PullupMetrics = {
  /** Средний угол в локтях. */
  elbow: number;
  /** Подбородок выше линии турника (> 0), в длинах корпуса. */
  chin: number;
  /** Горизонтальное положение середины бёдер. */
  hipX: number;
  torso: number;
};

const REQUIRED = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW,
  LM.RIGHT_ELBOW,
  LM.LEFT_WRIST,
  LM.RIGHT_WRIST,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
];

const P = T.pullup;

/**
 * Линия турника: медиана высоты запястий за первые 2 секунды, пока руки над плечами
 * (в висе или в верхней точке кисти лежат на турнике). Если позже запястья в висе
 * систематически уходят от линии (телефон сдвинули), калибровка начинается заново.
 */
class BarLine {
  private samples: number[] = [];
  private since: number | null = null;
  private y: number | null = null;
  private drift = 0;

  update(wristY: number, shoulderY: number, torso: number, t: number): number {
    const armsUp = wristY < shoulderY;
    if (this.y === null) {
      if (armsUp) {
        if (this.since === null) this.since = t;
        this.samples.push(wristY);
        if (t - this.since >= P.barCalibrationMs) this.y = median(this.samples);
      }
      return this.y ?? wristY;
    }
    if (armsUp && Math.abs(wristY - this.y) > 0.25 * torso) this.drift += 1;
    else this.drift = 0;
    if (this.drift > 30) {
      this.samples = [];
      this.since = null;
      this.y = null;
      this.drift = 0;
      return wristY;
    }
    return this.y;
  }

  get calibrated(): boolean {
    return this.y !== null;
  }
}

function headY(pose: Pose, torso: number): number | null {
  const ml = pt(pose, LM.MOUTH_LEFT);
  const mr = pt(pose, LM.MOUTH_RIGHT);
  if (ml.v >= P.headVisibility && mr.v >= P.headVisibility) return (ml.y + mr.y) / 2;
  // Съёмка сзади: рот не виден, подбородок оцениваем по ушам.
  const el = pt(pose, LM.LEFT_EAR);
  const er = pt(pose, LM.RIGHT_EAR);
  if (el.v >= P.headVisibility && er.v >= P.headVisibility) return (el.y + er.y) / 2 + P.chinBelowEars * torso;
  return null;
}

function pullupSession(machine: RepSpec<PullupMetrics>): ExerciseSession<PullupMetrics> {
  const bar = new BarLine();
  return {
    required: () => REQUIRED,
    highlight: () => [...REQUIRED, LM.MOUTH_LEFT, LM.MOUTH_RIGHT],
    metrics(pose, t) {
      const torso = torsoLength(pose);
      const hy = headY(pose, torso);
      if (hy === null) return { error: 'headNotVisible' as FrameHint };
      const lw = pt(pose, LM.LEFT_WRIST);
      const rw = pt(pose, LM.RIGHT_WRIST);
      const wristY = (lw.y + rw.y) / 2;
      const shoulderY = mid(pt(pose, LM.LEFT_SHOULDER), pt(pose, LM.RIGHT_SHOULDER)).y;
      const barY = bar.update(wristY, shoulderY, torso, t);
      const elbowL = angleAt(pt(pose, LM.LEFT_SHOULDER), pt(pose, LM.LEFT_ELBOW), lw);
      const elbowR = angleAt(pt(pose, LM.RIGHT_SHOULDER), pt(pose, LM.RIGHT_ELBOW), rw);
      return {
        elbow: (elbowL + elbowR) / 2,
        chin: (barY - hy) / torso,
        hipX: mid(pt(pose, LM.LEFT_HIP), pt(pose, LM.RIGHT_HIP)).x,
        torso,
      };
    },
    machines: [machine],
  };
}

const noSwinging = {
  id: 'swing',
  reason: 'noSwinging' as const,
  ok: (m: PullupMetrics, ref: PullupMetrics) => Math.abs(m.hipX - ref.hipX) <= P.maxHipSwing * ref.torso,
};

/** Подтягивание, камера спереди или сзади: вис (локти ≥ 150°) → подбородок выше турника → вис. */
export const pullup: ExerciseDef<PullupMetrics> = {
  id: 'pullup',
  kind: 'strength',
  view: 'frontOrBack',
  visibilityThreshold: 0.6,
  createSession: () =>
    pullupSession({
      id: 'main',
      isStart: (m) => m.elbow >= P.hangElbowMin,
      isPeak: (m) => m.chin >= 0,
      hasLeftStart: (m) => m.elbow < P.hangElbowMin - T.hysteresisDeg,
      hasLeftPeak: (m) => m.chin < -P.chinDropHysteresis,
      peakMargin: (m) => m.chin,
      fullDepthMargin: 0.15,
      startHoldMs: P.hangHoldMs,
      minDurationMs: T.minDurationMs.strength,
      partialReason: 'chinAboveBar',
      lockoutReason: 'straightenArmsInHang',
      checks: [noSwinging],
    }),
};

/**
 * Негативное подтягивание: старт в верхней точке (подбородок над турником),
 * медленное опускание до виса не быстрее 3 секунд. Засчитывается в момент виса;
 * подняться наверх снова можно как угодно (прыжком, с опоры).
 */
export const pullupNegative: ExerciseDef<PullupMetrics> = {
  id: 'pullup_negative',
  kind: 'strength',
  view: 'frontOrBack',
  visibilityThreshold: 0.6,
  liteOf: 'pullup',
  createSession: () =>
    pullupSession({
      id: 'main',
      isStart: (m) => m.chin >= 0,
      isPeak: (m) => m.elbow >= P.hangElbowMin,
      hasLeftStart: (m) => m.chin < -P.chinDropHysteresis,
      hasLeftPeak: (m) => m.elbow < P.hangElbowMin - T.hysteresisDeg,
      peakMargin: (m) => m.elbow - P.hangElbowMin,
      fullDepthMargin: 20,
      startHoldMs: P.hangHoldMs,
      countAt: 'peak',
      minDurationMs: T.minDurationMs.strength,
      minToPeakMs: T.pullupNegative.minLoweringMs,
      toPeakReason: 'lowerSlower',
      partialReason: 'straightenArmsInHang',
      lockoutReason: 'straightenArmsInHang',
      checks: [noSwinging],
    }),
};

type AustralianMetrics = { elbow: number; body: number };
const AUS_KEYS: readonly SideKey[] = ['shoulder', 'elbow', 'wrist', 'hip', 'ankle'];

/** Австралийское подтягивание (под столом или низкой перекладиной), камера сбоку. */
export const pullupAustralian: ExerciseDef<AustralianMetrics> = {
  id: 'pullup_australian',
  kind: 'strength',
  view: 'side',
  visibilityThreshold: 0.6,
  liteOf: 'pullup',
  createSession() {
    const pick = createSidePicker(AUS_KEYS);
    let side: Side = 'left';
    return {
      required(raw) {
        side = pick(raw);
        return sideIndices(side, AUS_KEYS);
      },
      highlight: () => sideIndices(side, AUS_KEYS),
      metrics(pose) {
        const s = SIDE[side];
        return {
          elbow: angleAt(pt(pose, s.shoulder), pt(pose, s.elbow), pt(pose, s.wrist)),
          body: angleAt(pt(pose, s.shoulder), pt(pose, s.hip), pt(pose, s.ankle)),
        };
      },
      machines: [
        angleRep<AustralianMetrics>({
          metric: 'elbow',
          start: { dir: 'above', value: T.australian.elbowStraight },
          peak: { dir: 'below', value: T.australian.elbowBent },
          hysteresis: T.hysteresisDeg,
          minDurationMs: T.minDurationMs.strength,
          partialReason: 'comeHigher',
          lockoutReason: 'extendArms',
          checks: [{ id: 'body', reason: 'keepBodyStraight', ok: (m) => m.body >= T.australian.bodyStraightMin }],
        }),
      ],
    };
  },
};
