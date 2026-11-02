import { clamp01 } from './geometry';
import type { FeedbackKey, Metrics } from './types';

/** Проверка техники: должна выполняться на большей части кадров повтора. */
export interface TechniqueCheck<M extends Metrics = Metrics> {
  id: string;
  reason: FeedbackKey;
  /** true — техника в норме. ref — метрики в момент начала повтора. */
  ok(m: M, ref: M): boolean;
  /** Допустимая доля кадров с нарушением, по умолчанию 0,25. */
  maxViolation?: number;
}

/**
 * Описание повтора как перехода «старт → пик → старт».
 * Пороги задают сами предикаты; зона гистерезиса — это разница между
 * порогом входа в зону (isStart/isPeak) и порогом выхода (hasLeftStart/hasLeftPeak).
 */
export interface RepSpec<M extends Metrics = Metrics> {
  /** Имя автомата: 'main', или 'left'/'right' для упражнений с подсчётом по каждой ноге. */
  id: string;
  isStart(m: M): boolean;
  isPeak(m: M): boolean;
  /** Ушёл из стартовой зоны дальше зоны гистерезиса — повтор начался. */
  hasLeftStart(m: M): boolean;
  /** Ушёл из пиковой зоны дальше зоны гистерезиса — пошёл обратно. */
  hasLeftPeak(m: M): boolean;
  /** Насколько глубже порога пика (≥ 0 внутри пика), в единицах метрики. */
  peakMargin(m: M): number;
  /** Запас глубины, при котором оценка глубины максимальна. */
  fullDepthMargin: number;
  /** Минимальная длительность повтора: от начала до засчёта. */
  minDurationMs: number;
  /** Минимальное время от начала повтора до пика (негативные подтягивания). */
  minToPeakMs?: number;
  /** Сколько нужно удерживать старт перед первым повтором (вис в подтягиваниях). */
  startHoldMs?: number;
  /** Когда засчитывать: при возврате в старт (по умолчанию) или при достижении пика. */
  countAt?: 'return' | 'peak';
  /** Причина, если вернулся в старт, не дойдя до пика. */
  partialReason: FeedbackKey;
  /** Причина, если снова ушёл в пик, не вернувшись в старт. */
  lockoutReason: FeedbackKey;
  /** Причина, если пик достигнут слишком быстро (для minToPeakMs). */
  toPeakReason?: FeedbackKey;
  checks?: ReadonlyArray<TechniqueCheck<M>>;
}

export type Phase = 'idle' | 'ready' | 'moving' | 'peak' | 'returning' | 'awaitStart';

export type RepEvent =
  | { kind: 'rep'; machine: string; t: number; durationMs: number; quality: number }
  | { kind: 'rejected'; machine: string; t: number; reason: FeedbackKey };

const DEFAULT_MAX_VIOLATION = 0.25;

/**
 * Конечный автомат одного повтора.
 *
 * idle → (старт удерживается startHoldMs) → ready
 * ready → (ушёл из старта) → moving
 * moving → (пик) → peak | (вернулся без пика) → ready + отказ partialReason
 * peak → (ушёл из пика) → returning   [или засчёт сразу, если countAt = 'peak']
 * returning → (старт) → ready + повтор | (снова пик) → peak + отказ lockoutReason
 * awaitStart → (старт) → ready
 */
export class RepStateMachine<M extends Metrics = Metrics> {
  private phase: Phase = 'idle';
  private startSince: number | null = null;
  /** Последний кадр, когда метрика была в стартовой зоне: от него считается длительность. */
  private lastInStart = 0;
  private repStartT = 0;
  private peakT = 0;
  private ref: M | null = null;
  private maxMargin = 0;
  private frames = 0;
  private violations: number[] = [];

  constructor(readonly spec: RepSpec<M>) {}

  get currentPhase(): Phase {
    return this.phase;
  }

  reset(): void {
    this.phase = 'idle';
    this.startSince = null;
    this.ref = null;
  }

  update(m: M, t: number): RepEvent[] {
    const s = this.spec;
    const events: RepEvent[] = [];

    switch (this.phase) {
      case 'idle': {
        if (s.isStart(m)) {
          if (this.startSince === null) this.startSince = t;
          this.lastInStart = t;
          if (t - this.startSince >= (s.startHoldMs ?? 0)) this.phase = 'ready';
        } else {
          this.startSince = null;
        }
        break;
      }
      case 'ready': {
        if (s.isStart(m)) this.lastInStart = t;
        if (s.hasLeftStart(m) && !s.isStart(m)) {
          this.beginRep(m, this.lastInStart);
          this.phase = 'moving';
          this.track(m);
          if (s.isPeak(m)) this.enterPeak(m, t, events);
        }
        break;
      }
      case 'moving': {
        this.track(m);
        if (s.isPeak(m)) {
          this.enterPeak(m, t, events);
        } else if (s.isStart(m)) {
          events.push({ kind: 'rejected', machine: s.id, t, reason: s.partialReason });
          this.lastInStart = t;
          this.phase = 'ready';
        }
        break;
      }
      case 'peak': {
        this.track(m);
        if (s.hasLeftPeak(m) && !s.isPeak(m)) this.phase = 'returning';
        break;
      }
      case 'returning': {
        this.track(m);
        if (s.isStart(m)) {
          events.push(this.complete(t));
          this.lastInStart = t;
          this.phase = 'ready';
        } else if (s.isPeak(m)) {
          // Снова ушёл в пик, не вернувшись в старт: подсказываем выпрямиться.
          // Повтор продолжается и будет засчитан, когда человек вернётся в старт.
          events.push({ kind: 'rejected', machine: s.id, t, reason: s.lockoutReason });
          this.phase = 'peak';
        }
        break;
      }
      case 'awaitStart': {
        if (s.isStart(m)) {
          this.lastInStart = t;
          this.phase = 'ready';
        }
        break;
      }
    }
    return events;
  }

  private beginRep(m: M, t: number): void {
    this.repStartT = t;
    this.ref = m;
    this.maxMargin = 0;
    this.frames = 0;
    this.violations = (this.spec.checks ?? []).map(() => 0);
  }

  private enterPeak(m: M, t: number, events: RepEvent[]): void {
    this.peakT = t;
    this.maxMargin = Math.max(this.maxMargin, this.spec.peakMargin(m));
    if (this.spec.countAt === 'peak') {
      events.push(this.complete(t));
      this.phase = 'awaitStart';
    } else {
      this.phase = 'peak';
    }
  }

  private track(m: M): void {
    this.frames += 1;
    if (this.spec.isPeak(m)) this.maxMargin = Math.max(this.maxMargin, this.spec.peakMargin(m));
    const checks = this.spec.checks ?? [];
    const ref = this.ref ?? m;
    checks.forEach((c, i) => {
      if (!c.ok(m, ref)) this.violations[i] = (this.violations[i] ?? 0) + 1;
    });
  }

  private complete(t: number): RepEvent {
    const s = this.spec;
    const id = s.id;
    const durationMs = t - this.repStartT;

    if (durationMs < s.minDurationMs) return { kind: 'rejected', machine: id, t, reason: 'tooFast' };
    if (s.minToPeakMs !== undefined && this.peakT - this.repStartT < s.minToPeakMs) {
      return { kind: 'rejected', machine: id, t, reason: s.toPeakReason ?? 'tooFast' };
    }

    let worst = 0;
    const checks = s.checks ?? [];
    for (let i = 0; i < checks.length; i += 1) {
      const c = checks[i];
      if (!c) continue;
      const frac = this.frames > 0 ? (this.violations[i] ?? 0) / this.frames : 0;
      const limit = c.maxViolation ?? DEFAULT_MAX_VIOLATION;
      if (frac > limit) return { kind: 'rejected', machine: id, t, reason: c.reason };
      worst = Math.max(worst, frac / limit);
    }

    return { kind: 'rep', machine: id, t, durationMs, quality: scoreQuality(this.maxMargin, s.fullDepthMargin, worst, durationMs, s.minDurationMs) };
  }
}

/**
 * Оценка качества 0–100 (стартовая формула, калибруется на бете):
 * 45% — глубина (порог пика = 0,5, порог + fullDepthMargin = 1),
 * 40% — техника (доля кадров с нарушениями относительно допустимой),
 * 15% — темп (вдвое медленнее минимальной длительности = 1).
 */
export function scoreQuality(margin: number, fullDepthMargin: number, worstViolation: number, durationMs: number, minDurationMs: number): number {
  const depth = clamp01(0.5 + (0.5 * margin) / Math.max(fullDepthMargin, 1e-6));
  const form = 1 - clamp01(worstViolation);
  const tempo = minDurationMs > 0 ? clamp01((durationMs - minDurationMs) / minDurationMs) : 1;
  return Math.round(100 * (0.45 * depth + 0.4 * form + 0.15 * tempo));
}

/** Помощник для упражнений с одной угловой метрикой: пороги и гистерезис в градусах. */
export interface ThresholdRule {
  /** 'below' — зона, где метрика ≤ value; 'above' — где ≥ value. */
  dir: 'below' | 'above';
  value: number;
}

export function inZone(v: number, r: ThresholdRule): boolean {
  return r.dir === 'below' ? v <= r.value : v >= r.value;
}

/** Вышел из зоны дальше, чем на hysteresis. */
export function leftZone(v: number, r: ThresholdRule, hysteresis: number): boolean {
  return r.dir === 'below' ? v > r.value + hysteresis : v < r.value - hysteresis;
}

/** Насколько значение глубже порога зоны (≥ 0 внутри зоны). */
export function marginInZone(v: number, r: ThresholdRule): number {
  return r.dir === 'below' ? r.value - v : v - r.value;
}

export interface AngleRepOptions<M extends Metrics> {
  id?: string;
  /** Имя метрики, по которой идёт автомат. */
  metric: keyof M & string;
  start: ThresholdRule;
  peak: ThresholdRule;
  hysteresis?: number;
  fullDepthMargin?: number;
  minDurationMs: number;
  partialReason: FeedbackKey;
  lockoutReason: FeedbackKey;
  checks?: ReadonlyArray<TechniqueCheck<M>>;
}

/** Строит RepSpec для упражнения, где старт и пик заданы порогами одной метрики. */
export function angleRep<M extends Metrics>(o: AngleRepOptions<M>): RepSpec<M> {
  const h = o.hysteresis ?? 10;
  const val = (m: M): number => m[o.metric] as number;
  return {
    id: o.id ?? 'main',
    isStart: (m) => inZone(val(m), o.start),
    isPeak: (m) => inZone(val(m), o.peak),
    hasLeftStart: (m) => leftZone(val(m), o.start, h),
    hasLeftPeak: (m) => leftZone(val(m), o.peak, h),
    peakMargin: (m) => marginInZone(val(m), o.peak),
    fullDepthMargin: o.fullDepthMargin ?? 15,
    minDurationMs: o.minDurationMs,
    partialReason: o.partialReason,
    lockoutReason: o.lockoutReason,
    ...(o.checks ? { checks: o.checks } : {}),
  };
}
