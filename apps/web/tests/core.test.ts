import { describe, expect, it } from 'vitest';
import { checkFrame } from '../src/tracking/frameValidator';
import { angleAt, angleFromDownVertical, deviationFromVertical, inclinationFromHorizontal, median } from '../src/tracking/geometry';
import { LandmarkSmoother, OneEuroFilter } from '../src/tracking/oneEuroFilter';
import { RepStateMachine, angleRep, scoreQuality, type RepEvent } from '../src/tracking/repStateMachine';
import type { Landmark } from '../src/tracking/types';

const p = (x: number, y: number) => ({ x, y, v: 1 });

describe('geometry', () => {
  it('angleAt: прямой и развёрнутый угол', () => {
    expect(angleAt(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90, 6);
    expect(angleAt(p(-1, 0), p(0, 0), p(1, 0))).toBeCloseTo(180, 6);
    expect(angleAt(p(1, 0), p(0, 0), p(1, 1))).toBeCloseTo(45, 6);
  });

  it('направления относительно вертикали и горизонтали', () => {
    expect(angleFromDownVertical(p(0, 0), p(0, 1))).toBeCloseTo(0, 6);
    expect(angleFromDownVertical(p(0, 0), p(1, 0))).toBeCloseTo(90, 6);
    expect(angleFromDownVertical(p(0, 0), p(0, -1))).toBeCloseTo(180, 6);
    expect(inclinationFromHorizontal(p(0, 0), p(1, -1))).toBeCloseTo(45, 6);
    expect(deviationFromVertical(p(0, 0), p(0, -1))).toBeCloseTo(0, 6);
  });

  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('OneEuroFilter', () => {
  it('сходится к постоянному значению', () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 120; i += 1) out = f.filter(i === 0 ? 0 : 1, i / 30);
    expect(out).toBeCloseTo(1, 2);
  });

  it('уменьшает дрожание в покое', () => {
    const f = new OneEuroFilter();
    let rawVar = 0;
    let outVar = 0;
    let prev = 0.5;
    for (let i = 0; i < 300; i += 1) {
      const noise = (i % 2 === 0 ? 1 : -1) * 0.01;
      const out = f.filter(0.5 + noise, i / 30);
      if (i > 30) {
        rawVar += noise * noise;
        outVar += (out - 0.5) ** 2;
      }
      prev = out;
    }
    expect(prev).toBeGreaterThan(0.48);
    expect(outVar).toBeLessThan(rawVar * 0.25);
  });

  it('LandmarkSmoother исправляет пропорции кадра', () => {
    const s = new LandmarkSmoother();
    const raw: Landmark[] = [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }];
    const out = s.smooth(raw, 0, 16 / 9);
    expect(out[0]?.x).toBeCloseTo(0.5 * (16 / 9), 6);
    expect(out[0]?.y).toBeCloseTo(0.5, 6);
  });
});

describe('checkFrame', () => {
  const lm = (x: number, y: number, visibility: number): Landmark => ({ x, y, z: 0, visibility });

  it('нет человека', () => {
    expect(checkFrame(null, [0], 0.6)).toEqual({ ok: false, hint: 'noPerson', missing: [0] });
  });

  it('точка за краем кадра → отойди дальше', () => {
    const r = checkFrame([lm(0.5, 0.5, 0.9), lm(0.5, 0.995, 0.1)], [0, 1], 0.6);
    expect(r.ok).toBe(false);
    expect(r.hint).toBe('stepBack');
    expect(r.missing).toEqual([1]);
  });

  it('точка в кадре, но не видна → добавь света', () => {
    const r = checkFrame([lm(0.5, 0.5, 0.3)], [0], 0.6);
    expect(r.hint).toBe('moreLight');
  });

  it('все точки видны', () => {
    expect(checkFrame([lm(0.5, 0.5, 0.9)], [0], 0.6).ok).toBe(true);
  });
});

describe('RepStateMachine', () => {
  type M = { a: number };
  const spec = angleRep<M>({
    metric: 'a',
    start: { dir: 'above', value: 155 },
    peak: { dir: 'below', value: 90 },
    hysteresis: 10,
    minDurationMs: 600,
    partialReason: 'goLower',
    lockoutReason: 'extendArms',
  });

  /** Прогоняет последовательность значений с шагом 33 мс. */
  const feed = (values: number[], step = 33) => {
    const m = new RepStateMachine(spec);
    const events = values.flatMap((a, i) => m.update({ a }, i * step));
    return { m, events };
  };
  const label = (e: RepEvent) => (e.kind === 'rep' ? 'rep' : e.reason);
  const ramp = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

  it('полный повтор засчитывается', () => {
    const { events } = feed([...ramp(170, 170, 5), ...ramp(170, 80, 15), ...ramp(80, 170, 15)]);
    expect(events.filter((e) => e.kind === 'rep').length).toBe(1);
  });

  it('половинчатый повтор отклоняется с причиной «ниже»', () => {
    const { events } = feed([...ramp(170, 170, 5), ...ramp(170, 120, 15), ...ramp(120, 170, 15)]);
    expect(events.map(label)).toEqual(['goLower']);
  });

  it('дребезг у порога старта не запускает повтор (гистерезис)', () => {
    const jitter = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 156 : 148));
    const { events, m } = feed([170, 170, ...jitter]);
    expect(events.length).toBe(0);
    expect(m.currentPhase).toBe('ready');
  });

  it('слишком быстрый повтор отклоняется', () => {
    const { events } = feed([170, 170, 140, 80, 120, 170], 33);
    expect(events.map(label)).toEqual(['tooFast']);
  });

  it('без выпрямления рук повтор не засчитывается', () => {
    const { events } = feed([...ramp(170, 170, 3), ...ramp(170, 80, 15), ...ramp(80, 130, 10), ...ramp(130, 80, 10), ...ramp(80, 170, 15)]);
    expect(events.map(label)).toEqual(['extendArms', 'rep']);
  });
});

describe('scoreQuality', () => {
  it('в пределах 0–100 и растёт с глубиной', () => {
    const shallow = scoreQuality(0, 15, 0, 1500, 600);
    const deep = scoreQuality(15, 15, 0, 1500, 600);
    expect(shallow).toBeGreaterThanOrEqual(0);
    expect(deep).toBeLessThanOrEqual(100);
    expect(deep).toBeGreaterThan(shallow);
    expect(scoreQuality(15, 15, 0, 1500, 600)).toBe(100);
  });
});
