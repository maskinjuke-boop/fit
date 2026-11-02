import type { ExerciseDef } from '../exercise';
import { clamp, dist, toDeg } from '../geometry';
import { LM } from '../landmarks';
import { angleRep } from '../repStateMachine';
import { pt } from './common';
import { THRESHOLDS as T } from './thresholds';

type KneesMetrics = { leftLift: number; rightLift: number };

const REQUIRED = [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE];

/**
 * Бег на месте с высоким подъёмом бедра, камера спереди.
 *
 * Спереди бедро, поднятое вперёд, не поворачивается в кадре, а «укорачивается»:
 * колено поднимается к уровню таза. Поэтому угол бедра к вертикали оценивается
 * по высоте колена относительно таза: cos(угол) = (y колена − y таза) / длина бедра.
 * Длина бедра калибруется как максимальная видимая длина (с медленным забыванием,
 * чтобы подстроиться, если человек отошёл от камеры).
 *
 * Каждая нога считается своим автоматом; повтор = один подъём колена.
 */
export const highKnees: ExerciseDef<KneesMetrics> = {
  id: 'high_knees',
  kind: 'cardio',
  view: 'front',
  visibilityThreshold: 0.6,
  createSession() {
    const thigh = { left: 0, right: 0 };
    const DECAY = 0.997;
    const lift = (hipIdx: number, kneeIdx: number, key: 'left' | 'right', pose: Parameters<typeof pt>[0]): number => {
      const hip = pt(pose, hipIdx);
      const knee = pt(pose, kneeIdx);
      const len = dist(hip, knee);
      thigh[key] = Math.max(len, thigh[key] * DECAY);
      const ref = Math.max(thigh[key], 1e-6);
      return toDeg(Math.acos(clamp((knee.y - hip.y) / ref, -1, 1)));
    };
    const rule = {
      start: { dir: 'below' as const, value: T.highKnees.thighDown },
      peak: { dir: 'above' as const, value: T.highKnees.thighUp },
      hysteresis: T.hysteresisDeg,
      fullDepthMargin: 20,
      minDurationMs: T.minDurationMs.cardio,
      partialReason: 'kneeHigher' as const,
      lockoutReason: 'kneeHigher' as const,
    };
    return {
      required: () => REQUIRED,
      highlight: () => REQUIRED,
      metrics(pose) {
        return {
          leftLift: lift(LM.LEFT_HIP, LM.LEFT_KNEE, 'left', pose),
          rightLift: lift(LM.RIGHT_HIP, LM.RIGHT_KNEE, 'right', pose),
        };
      },
      machines: [
        angleRep<KneesMetrics>({ id: 'left', metric: 'leftLift', ...rule }),
        angleRep<KneesMetrics>({ id: 'right', metric: 'rightLift', ...rule }),
      ],
    };
  },
};
