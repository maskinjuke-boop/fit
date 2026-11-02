import type { RepSpec } from './repStateMachine';
import type { FrameHint, Metrics, Pose, RawPose } from './types';

export type ExerciseId =
  | 'pullup'
  | 'pullup_negative'
  | 'pullup_australian'
  | 'pushup'
  | 'squat'
  | 'lunge'
  | 'situp'
  | 'jumping_jack'
  | 'high_knees';

export type CameraView = 'side' | 'sideOr45' | 'front' | 'frontOrBack';

/** Экземпляр упражнения на одну тренировку: может хранить калибровку (линию турника и т. п.). */
export interface ExerciseSession<M extends Metrics = Metrics> {
  /** Ключевые точки для проверки кадра (могут зависеть от выбранной стороны). */
  required(raw: RawPose): readonly number[];
  /** Метрики кадра; null — посчитать нельзя (с подсказкой). */
  metrics(pose: Pose, t: number): M | { error: FrameHint };
  machines: ReadonlyArray<RepSpec<M>>;
  /** Точки и кости, которые подсвечиваются на скелете. */
  highlight(raw: RawPose): readonly number[];
}

export interface ExerciseDef<M extends Metrics = Metrics> {
  id: ExerciseId;
  kind: 'strength' | 'cardio';
  view: CameraView;
  /** Порог видимости ключевых точек; по ТЗ 0,6. */
  visibilityThreshold: number;
  /** Для облегчённых вариантов — основное упражнение. */
  liteOf?: ExerciseId;
  createSession(): ExerciseSession<M>;
}

export function isMetricsError<M extends Metrics>(r: M | { error: FrameHint }): r is { error: FrameHint } {
  return typeof (r as { error?: unknown }).error === 'string';
}
