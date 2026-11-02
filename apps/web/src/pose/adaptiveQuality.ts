export type ModelVariant = 'lite' | 'full';

export interface QualityState {
  model: ModelVariant;
  /** Масштаб входного кадра для модели (1 — исходное разрешение). */
  inputScale: number;
}

export interface AdaptiveOptions {
  /** Ниже этого FPS качество снижается (ТЗ: 15). */
  minFps?: number;
  /** Выше этого FPS lite можно заменить на full. */
  upgradeFps?: number;
  /** Сколько FPS должен держаться ниже/выше порога, мс. */
  sustainMs?: number;
  /** Разрешить переход на full на мощных устройствах. */
  allowUpgrade?: boolean;
}

export type QualityChange = { kind: 'model'; to: ModelVariant } | { kind: 'scale'; to: number } | null;

/**
 * Решает, когда менять модель и разрешение входа:
 * FPS < 15 дольше 3 с → full→lite, затем разрешение 1 → 0,75 → 0,5.
 * Если lite держит ≥ 45 FPS 5 с — один раз пробуем full; после понижения
 * повышение больше не пробуется, чтобы качество не «прыгало».
 */
export class AdaptiveQuality {
  private lowSince: number | null = null;
  private highSince: number | null = null;
  private downgraded = false;
  private readonly minFps: number;
  private readonly upgradeFps: number;
  private readonly sustainMs: number;
  private readonly allowUpgrade: boolean;

  constructor(
    public state: QualityState,
    opts: AdaptiveOptions = {},
  ) {
    this.minFps = opts.minFps ?? 15;
    this.upgradeFps = opts.upgradeFps ?? 45;
    this.sustainMs = opts.sustainMs ?? 3000;
    this.allowUpgrade = opts.allowUpgrade ?? true;
  }

  /** Вызывается с текущим FPS; возвращает изменение, которое нужно применить. */
  update(fps: number, tMs: number): QualityChange {
    if (fps < this.minFps) {
      this.highSince = null;
      if (this.lowSince === null) this.lowSince = tMs;
      if (tMs - this.lowSince >= this.sustainMs) {
        this.lowSince = null;
        return this.downgrade();
      }
      return null;
    }
    this.lowSince = null;

    if (this.allowUpgrade && !this.downgraded && this.state.model === 'lite' && fps >= this.upgradeFps) {
      if (this.highSince === null) this.highSince = tMs;
      if (tMs - this.highSince >= this.sustainMs + 2000) {
        this.highSince = null;
        this.state = { ...this.state, model: 'full' };
        return { kind: 'model', to: 'full' };
      }
    } else {
      this.highSince = null;
    }
    return null;
  }

  private downgrade(): QualityChange {
    this.downgraded = true;
    if (this.state.model === 'full') {
      this.state = { ...this.state, model: 'lite' };
      return { kind: 'model', to: 'lite' };
    }
    const next = this.state.inputScale > 0.75 ? 0.75 : this.state.inputScale > 0.5 ? 0.5 : null;
    if (next === null) return null;
    this.state = { ...this.state, inputScale: next };
    return { kind: 'scale', to: next };
  }
}

/** Скользящее среднее FPS по окну. */
export class FpsMeter {
  private times: number[] = [];

  constructor(private readonly windowMs = 2000) {}

  tick(tMs: number): number {
    this.times.push(tMs);
    while (this.times.length > 0 && tMs - (this.times[0] as number) > this.windowMs) this.times.shift();
    if (this.times.length < 2) return 0;
    const span = tMs - (this.times[0] as number);
    return span > 0 ? ((this.times.length - 1) * 1000) / span : 0;
  }
}
