import type { Landmark, Pose, RawPose } from './types';

/**
 * One Euro Filter (Casiez et al., 2012): сильнее сглаживает при медленном движении
 * (убирает дрожание точек в покое) и почти не запаздывает при быстром.
 */
export class OneEuroFilter {
  private prevValue: number | null = null;
  private prevDeriv = 0;
  private prevT: number | null = null;

  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 10,
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param tSec время кадра в секундах */
  filter(value: number, tSec: number): number {
    if (this.prevValue === null || this.prevT === null || tSec <= this.prevT) {
      this.prevValue = value;
      this.prevT = tSec;
      this.prevDeriv = 0;
      return value;
    }
    const dt = tSec - this.prevT;
    const deriv = (value - this.prevValue) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const derivHat = aD * deriv + (1 - aD) * this.prevDeriv;
    const cutoff = this.minCutoff + this.beta * Math.abs(derivHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const out = a * value + (1 - a) * this.prevValue;
    this.prevValue = out;
    this.prevDeriv = derivHat;
    this.prevT = tSec;
    return out;
  }

  reset(): void {
    this.prevValue = null;
    this.prevT = null;
    this.prevDeriv = 0;
  }
}

export interface SmootherOptions {
  minCutoff?: number;
  beta?: number;
  /** Если кадров не было дольше этого времени, фильтры сбрасываются. */
  resetAfterMs?: number;
}

/**
 * Сглаживает все 33 точки и переводит их в пространство с исправленными
 * пропорциями (x × ширина/высота кадра), чтобы углы считались без искажений.
 */
export class LandmarkSmoother {
  private fx: OneEuroFilter[] = [];
  private fy: OneEuroFilter[] = [];
  private vis: number[] = [];
  private lastT: number | null = null;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly resetAfterMs: number;

  constructor(opts: SmootherOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.0;
    this.beta = opts.beta ?? 10;
    this.resetAfterMs = opts.resetAfterMs ?? 500;
  }

  reset(): void {
    this.fx = [];
    this.fy = [];
    this.vis = [];
    this.lastT = null;
  }

  /**
   * @param raw точки MediaPipe
   * @param tMs время кадра, мс
   * @param aspect ширина / высота кадра
   */
  smooth(raw: RawPose, tMs: number, aspect: number): Pose {
    if (this.lastT !== null && tMs - this.lastT > this.resetAfterMs) this.reset();
    this.lastT = tMs;
    const tSec = tMs / 1000;
    return raw.map((lm: Landmark, i) => {
      let fx = this.fx[i];
      let fy = this.fy[i];
      if (!fx || !fy) {
        fx = this.fx[i] = new OneEuroFilter(this.minCutoff, this.beta);
        fy = this.fy[i] = new OneEuroFilter(this.minCutoff, this.beta);
      }
      const prevV = this.vis[i];
      const v = prevV === undefined ? lm.visibility : 0.5 * prevV + 0.5 * lm.visibility;
      this.vis[i] = v;
      return { x: fx.filter(lm.x * aspect, tSec), y: fy.filter(lm.y, tSec), v };
    });
  }
}
