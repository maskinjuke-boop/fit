import type { ExerciseDef, ExerciseSession } from './exercise';
import { isMetricsError } from './exercise';
import { checkFrame, type FrameCheck } from './frameValidator';
import { LandmarkSmoother } from './oneEuroFilter';
import { RepStateMachine, type Phase, type RepEvent } from './repStateMachine';
import type { FeedbackKey, FrameHint, Metrics, Pose, RawPose } from './types';

export interface FrameResult {
  frame: FrameCheck;
  /** Подсказка по кадру (точки не видны и т. п.). */
  hint?: FrameHint;
  pose: Pose | null;
  metrics: Metrics | null;
  events: RepEvent[];
  phases: Array<{ machine: string; phase: Phase }>;
}

export interface RepCounterStats {
  count: number;
  rejected: number;
  lastQuality: number | null;
  avgQuality: number | null;
  lastReason: FeedbackKey | null;
}

export interface RepCounterOptions {
  /** Если человек пропал из кадра дольше этого времени, автоматы сбрасываются в начало. */
  lostResetMs?: number;
}

/**
 * Оркестратор конвейера из ТЗ (раздел 3): проверка кадра → сглаживание →
 * метрики → автоматы → события повторов. Не зависит от браузера и MediaPipe,
 * поэтому полностью покрывается тестами на записанных последовательностях точек.
 */
export class RepCounter {
  private session: ExerciseSession;
  private machines: RepStateMachine[];
  private smoother = new LandmarkSmoother();
  private lostSince: number | null = null;
  private readonly lostResetMs: number;
  private qualities: number[] = [];
  private stats: RepCounterStats = { count: 0, rejected: 0, lastQuality: null, avgQuality: null, lastReason: null };

  constructor(
    readonly def: ExerciseDef,
    opts: RepCounterOptions = {},
  ) {
    this.lostResetMs = opts.lostResetMs ?? 1000;
    this.session = def.createSession();
    this.machines = this.session.machines.map((s) => new RepStateMachine(s));
  }

  get snapshot(): RepCounterStats {
    return { ...this.stats };
  }

  highlight(raw: RawPose | null): readonly number[] {
    return raw ? this.session.highlight(raw) : [];
  }

  reset(): void {
    this.session = this.def.createSession();
    this.machines = this.session.machines.map((s) => new RepStateMachine(s));
    this.smoother.reset();
    this.lostSince = null;
    this.qualities = [];
    this.stats = { count: 0, rejected: 0, lastQuality: null, avgQuality: null, lastReason: null };
  }

  /**
   * @param raw точки MediaPipe или null, если человек не найден
   * @param tMs время кадра, мс (монотонно растёт)
   * @param aspect ширина / высота кадра
   */
  process(raw: RawPose | null, tMs: number, aspect: number): FrameResult {
    const phases = (): FrameResult['phases'] => this.machines.map((m) => ({ machine: m.spec.id, phase: m.currentPhase }));
    const required = raw ? this.session.required(raw) : [];
    const frame = checkFrame(raw, required, this.def.visibilityThreshold);

    if (!raw || !frame.ok) {
      this.handleLost(tMs);
      const res: FrameResult = { frame, pose: null, metrics: null, events: [], phases: phases() };
      if (frame.hint) res.hint = frame.hint;
      return res;
    }

    const pose = this.smoother.smooth(raw, tMs, aspect);
    const m = this.session.metrics(pose, tMs);
    if (isMetricsError(m)) {
      this.handleLost(tMs);
      return { frame, hint: m.error, pose, metrics: null, events: [], phases: phases() };
    }
    this.lostSince = null;

    const events: RepEvent[] = [];
    for (const machine of this.machines) events.push(...machine.update(m, tMs));
    for (const e of events) this.apply(e);
    return { frame, pose, metrics: m, events, phases: phases() };
  }

  private handleLost(tMs: number): void {
    if (this.lostSince === null) this.lostSince = tMs;
    if (tMs - this.lostSince >= this.lostResetMs) {
      for (const m of this.machines) m.reset();
    }
  }

  private apply(e: RepEvent): void {
    if (e.kind === 'rep') {
      this.qualities.push(e.quality);
      this.stats.count += 1;
      this.stats.lastQuality = e.quality;
      this.stats.avgQuality = Math.round(this.qualities.reduce((a, b) => a + b, 0) / this.qualities.length);
      this.stats.lastReason = null;
    } else {
      this.stats.rejected += 1;
      this.stats.lastReason = e.reason;
    }
  }
}
