import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, FpsMeter } from '../src/pose/adaptiveQuality';
import { summarize } from '../src/tools/accuracy';
import { Recorder, recordingToFrames } from '../src/tools/recording';

describe('AdaptiveQuality', () => {
  it('при низком FPS: full → lite → разрешение 0,75 → 0,5', () => {
    const a = new AdaptiveQuality({ model: 'full', inputScale: 1 });
    const changes = [];
    for (let t = 0; t <= 20000; t += 100) {
      const c = a.update(10, t);
      if (c) changes.push(c);
    }
    expect(changes).toEqual([
      { kind: 'model', to: 'lite' },
      { kind: 'scale', to: 0.75 },
      { kind: 'scale', to: 0.5 },
    ]);
  });

  it('кратковременная просадка FPS ничего не меняет', () => {
    const a = new AdaptiveQuality({ model: 'lite', inputScale: 1 });
    let change = null;
    for (let t = 0; t <= 10000; t += 100) change = change ?? a.update(t % 4000 < 2000 ? 10 : 30, t);
    expect(change).toBe(null);
  });

  it('на мощном устройстве lite один раз меняется на full', () => {
    const a = new AdaptiveQuality({ model: 'lite', inputScale: 1 });
    const changes = [];
    for (let t = 0; t <= 20000; t += 100) {
      const c = a.update(55, t);
      if (c) changes.push(c);
    }
    expect(changes).toEqual([{ kind: 'model', to: 'full' }]);
  });

  it('FpsMeter', () => {
    const m = new FpsMeter();
    let fps = 0;
    for (let t = 0; t <= 3000; t += 1000 / 30) fps = m.tick(t);
    expect(fps).toBeCloseTo(30, 0);
  });
});

describe('Отчёт о точности', () => {
  it('считает пропуски и ложные засчёты', () => {
    const s = summarize([
      { exercise: 'pushup', expected: 10, counted: 10, source: 'video', at: '' },
      { exercise: 'pushup', expected: 10, counted: 11, source: 'video', at: '' },
      { exercise: 'squat', expected: 20, counted: 19, source: 'camera', at: '' },
    ]);
    expect(s.expected).toBe(40);
    expect(s.falsePositiveRate).toBeCloseTo(0.025, 6);
    expect(s.missRate).toBeCloseTo(0.025, 6);
    expect(s.accuracy).toBeCloseTo(0.95, 6);
  });
});

describe('Recorder', () => {
  it('запись и обратное чтение', () => {
    const rec = new Recorder('pushup', 'camera');
    rec.add([{ x: 0.123456, y: 0.5, z: 0, visibility: 0.9 }], 1000, 0.75);
    rec.add(null, 1033, 0.75);
    const out = rec.finish(5);
    expect(out.frames.length).toBe(2);
    expect(out.frames[0]?.t).toBe(0);
    expect(out.expectedReps).toBe(5);
    const frames = recordingToFrames(out);
    expect(frames[0]?.raw?.[0]?.x).toBe(0.1235);
    expect(frames[1]?.raw).toBe(null);
  });
});
