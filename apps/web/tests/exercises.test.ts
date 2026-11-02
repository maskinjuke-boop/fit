import { describe, expect, it } from 'vitest';
import {
  highKnees,
  jumpingJack,
  lunge,
  pullup,
  pullupAustralian,
  pullupNegative,
  pushup,
  situp,
  squat,
} from '../src/tracking/exercises';
import type { ExerciseDef } from '../src/tracking/exercise';
import type { Metrics } from '../src/tracking/types';
import {
  animate,
  concatKeys,
  jackPose,
  kneesPose,
  lungePose,
  pullupPose,
  pushupPose,
  repKeys,
  run,
  situpPose,
  squatPose,
  type Frame,
} from './synthetic';

const asDef = (d: unknown) => d as ExerciseDef<Metrics>;

describe('Отжимание', () => {
  const gen = (elbow: number) => pushupPose(elbow);

  it('5 полных повторов', () => {
    const r = run(asDef(pushup), animate(gen, repKeys({ n: 5, start: 170, peak: 75, downMs: 700, upMs: 600 })));
    expect(r.count).toBe(5);
    expect(r.rejected).toBe(0);
    for (const q of r.qualities) {
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(100);
    }
  });

  it('половинчатый повтор не засчитан, подсказка «ниже»', () => {
    const keys = concatKeys(
      repKeys({ n: 2, start: 170, peak: 75, downMs: 700, upMs: 600 }),
      repKeys({ n: 1, start: 170, peak: 120, downMs: 600, upMs: 600, leadMs: 100 }),
    );
    const r = run(asDef(pushup), animate(gen, keys));
    expect(r.count).toBe(2);
    expect(r.reasons).toContain('goLower');
  });

  it('провисший корпус → «держи корпус»', () => {
    const sag = (elbow: number) => pushupPose(elbow, 140);
    const r = run(asDef(pushup), animate(sag, repKeys({ n: 3, start: 170, peak: 75, downMs: 700, upMs: 600 })));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('keepBodyStraight');
  });

  it('слишком быстрые повторы не засчитаны', () => {
    const r = run(asDef(pushup), animate(gen, repKeys({ n: 3, start: 170, peak: 75, downMs: 200, upMs: 200, holdMs: 0 })));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('tooFast');
  });

  it('работает в кадре 16:9 и 9:16 (исправление пропорций)', () => {
    const frames = animate(gen, repKeys({ n: 3, start: 170, peak: 75, downMs: 700, upMs: 600 }));
    // Сжимаем x как в широком кадре: углы восстанавливаются через aspect.
    const squeeze = (k: number): Frame[] =>
      frames.map((f) => ({ t: f.t, raw: f.raw?.map((lm) => ({ ...lm, x: lm.x / k })) ?? null }));
    expect(run(asDef(pushup), squeeze(16 / 9), 16 / 9).count).toBe(3);
    expect(run(asDef(pushup), squeeze(9 / 16), 9 / 16).count).toBe(3);
  });
});

describe('Приседание', () => {
  it('4 полных повтора', () => {
    const r = run(asDef(squat), animate((k) => squatPose(k), repKeys({ n: 4, start: 175, peak: 85, downMs: 900, upMs: 800 })));
    expect(r.count).toBe(4);
  });

  it('сильный наклон корпуса → «грудь выше»', () => {
    const r = run(asDef(squat), animate((k) => squatPose(k, 30), repKeys({ n: 2, start: 175, peak: 85, downMs: 900, upMs: 800 })));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('chestUp');
  });
});

describe('Выпад', () => {
  it('3 полных повтора', () => {
    const gen = (p: number) => lungePose(170 - p * 80, 170 - p * 75);
    const r = run(asDef(lunge), animate(gen, repKeys({ n: 3, start: 0, peak: 1, downMs: 900, upMs: 800 })));
    expect(r.count).toBe(3);
  });

  it('завал корпуса → «корпус вертикально»', () => {
    const gen = (p: number) => lungePose(170 - p * 80, 170 - p * 75, 35);
    const r = run(asDef(lunge), animate(gen, repKeys({ n: 2, start: 0, peak: 1, downMs: 900, upMs: 800 })));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('torsoUpright');
  });
});

describe('Скручивание', () => {
  it('3 полных повтора', () => {
    const r = run(asDef(situp), animate((h) => situpPose(h), repKeys({ n: 3, start: 150, peak: 55, downMs: 800, upMs: 800 })));
    expect(r.count).toBe(3);
  });

  it('ноги уезжают → «ноги неподвижны»', () => {
    const gen = (p: number) => situpPose(150 - p * 95, p * 0.12);
    const r = run(asDef(situp), animate(gen, repKeys({ n: 2, start: 0, peak: 1, downMs: 800, upMs: 800 })));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('keepFeetStill');
  });
});

describe('Джампинг-джек', () => {
  const gen = (p: number) => jackPose(p, 0.4 + p * 1.4);

  it('10 прыжков', () => {
    const r = run(asDef(jumpingJack), animate(gen, repKeys({ n: 10, start: 0, peak: 1, downMs: 300, upMs: 300, holdMs: 50 })));
    expect(r.count).toBe(10);
  });

  it('руки только до плеч → «шире руки и ноги»', () => {
    const r = run(asDef(jumpingJack), animate(gen, repKeys({ n: 2, start: 0, peak: 0.6, downMs: 300, upMs: 300 })));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('armsAndLegsWider');
  });

  it('одна рука отстаёт → «руки симметрично»', () => {
    const skew = (p: number) => jackPose(p, 0.4 + p * 1.4, 0.6);
    const r = run(asDef(jumpingJack), animate(skew, repKeys({ n: 2, start: 0, peak: 1, downMs: 400, upMs: 400 })));
    expect(r.count).toBe(0);
  });
});

describe('Бег на месте', () => {
  /** Чередование ног: p от 0 до 2, левое колено на нечётных, правое на чётных полупериодах. */
  const alternate = (lift: number) => (p: number) => {
    const phase = p % 2;
    const left = phase < 1 ? Math.sin(phase * Math.PI) * lift : 0;
    const right = phase >= 1 ? Math.sin((phase - 1) * Math.PI) * lift : 0;
    return kneesPose(left, right);
  };

  it('10 подъёмов колена (по 5 каждой ногой)', () => {
    const r = run(asDef(highKnees), animate(alternate(80), [[0, 0], [500, 0], [5500, 10]]));
    expect(r.count).toBe(10);
  });

  it('низкие подъёмы → «колено выше»', () => {
    const r = run(asDef(highKnees), animate(alternate(48), [[0, 0], [500, 0], [3500, 6]]));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('kneeHigher');
  });
});

describe('Подтягивание', () => {
  const gen = (p: number) => pullupPose(p);
  const reps = (n: number, peak = 1) => repKeys({ n, start: 0, peak, downMs: 900, upMs: 1000, leadMs: 2500 });

  it('3 полных повтора после виса', () => {
    const r = run(asDef(pullup), animate(gen, reps(3)));
    expect(r.count).toBe(3);
  });

  it('подбородок не дошёл до турника → не засчитан', () => {
    const r = run(asDef(pullup), animate(gen, reps(2, 0.6)));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('chinAboveBar');
  });

  it('раскачка → «без раскачки»', () => {
    const swing = (p: number) => pullupPose(p, p * 0.2);
    const r = run(asDef(pullup), animate(swing, reps(2)));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('noSwinging');
  });

  it('съёмка сзади: подбородок по ушам', () => {
    const back = (p: number) => pullupPose(p, 0, false);
    const r = run(asDef(pullup), animate(back, reps(2)));
    expect(r.count).toBe(2);
  });

  it('без виса в начале повтор не считается', () => {
    // Сразу тянется, не повисев 0,3 с.
    const r = run(asDef(pullup), animate(gen, [[0, 0.5], [600, 1], [1600, 0], [1700, 0]]));
    expect(r.count).toBe(0);
  });
});

describe('Негативное подтягивание', () => {
  const gen = (p: number) => pullupPose(1 - p);

  it('опускание за 4 с засчитано', () => {
    const r = run(asDef(pullupNegative), animate(gen, [[0, 0], [600, 0], [4600, 1], [5000, 1]]));
    expect(r.count).toBe(1);
  });

  it('опускание за 1,5 с → «опускайся медленнее»', () => {
    const r = run(asDef(pullupNegative), animate(gen, [[0, 0], [600, 0], [2100, 1], [2500, 1]]));
    expect(r.count).toBe(0);
    expect(r.reasons).toContain('lowerSlower');
  });

  it('несколько негативов подряд', () => {
    const keys: Array<[number, number]> = [[0, 0], [600, 0]];
    let t = 600;
    for (let i = 0; i < 3; i += 1) {
      t += 4000;
      keys.push([t, 1]);
      t += 800;
      keys.push([t, 0]);
      t += 500;
      keys.push([t, 0]);
    }
    expect(run(asDef(pullupNegative), animate(gen, keys)).count).toBe(3);
  });
});

describe('Австралийское подтягивание', () => {
  it('3 повтора', () => {
    const r = run(asDef(pullupAustralian), animate((e) => pushupPose(e), repKeys({ n: 3, start: 170, peak: 75, downMs: 800, upMs: 800 })));
    expect(r.count).toBe(3);
  });
});

describe('Потеря человека в кадре', () => {
  it('подсказка и сброс автомата, если человек пропал', () => {
    const frames = animate((e) => pushupPose(e), [[0, 170], [500, 170], [1200, 75]]);
    const t = frames.at(-1)?.t ?? 0;
    const lost: Frame[] = Array.from({ length: 45 }, (_, i) => ({ t: t + 33 * (i + 1), raw: null }));
    const back = animate((e) => pushupPose(e), [[t + 1600, 75], [t + 2300, 170]]);
    const r = run(asDef(pushup), [...frames, ...lost, ...back]);
    expect(r.results.some((x) => x.hint === 'noPerson')).toBe(true);
    // Половина повтора до пропажи и половина после не складываются в повтор.
    expect(r.count).toBe(0);
  });
});
