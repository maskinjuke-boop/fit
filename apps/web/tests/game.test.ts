import { describe, expect, it } from 'vitest';
import { qualityBonus } from '../src/game/config';
import { generateDailies, taskProgress, tiredGroups } from '../src/game/dailies';
import { addDays, dayKey, weekKey } from '../src/game/dates';
import { applyRep, ensureDay, newCharacterState, reroll, type GameEvent } from '../src/game/engine';
import { levelInfo, xpForLevel } from '../src/game/levels';
import { createState, type GameState } from '../src/game/state';
import type { ExerciseId } from '../src/tracking/exercise';

const day0 = new Date(2026, 10, 2, 10, 0, 0);
const at = (days: number, hour = 10) => new Date(2026, 10, 2 + days, hour, 0, 0);

function hero(opts: { hasBar?: boolean; fitness?: 'beginner' | 'intermediate' | 'advanced' } = {}): GameState {
  return newCharacterState(
    { name: 'Тест', archetype: 'guardian', color: '#ffb020', hasBar: opts.hasBar ?? true, fitness: opts.fitness ?? 'beginner' },
    day0,
    createState,
  );
}

function doReps(s: GameState, exercise: ExerciseId, n: number, quality = 90, now = day0): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let st = s;
  for (let i = 0; i < n; i += 1) {
    const r = applyRep(st, { exercise, quality }, now);
    st = r.state;
    events.push(...r.events);
  }
  return { state: st, events };
}

describe('Уровни', () => {
  it('формула из ТЗ', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(40);
    expect(xpForLevel(5)).toBe(Math.floor(40 * Math.pow(4, 2.2)));
  });

  it('ориентиры ТЗ: 5-й уровень ≈ 40 отжиманий, 10-й ≈ 250', () => {
    expect(Math.round(xpForLevel(5) / 20)).toBeGreaterThanOrEqual(38);
    expect(Math.round(xpForLevel(5) / 20)).toBeLessThanOrEqual(45);
    expect(Math.round(xpForLevel(10) / 20)).toBeGreaterThanOrEqual(240);
    expect(Math.round(xpForLevel(10) / 20)).toBeLessThanOrEqual(260);
  });

  it('levelInfo', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(40).level).toBe(2);
    expect(levelInfo(39).progress).toBeCloseTo(39 / 40, 6);
  });

  it('бонус качества 0,8–1,2', () => {
    expect(qualityBonus(0)).toBeCloseTo(0.8, 6);
    expect(qualityBonus(100)).toBeCloseTo(1.2, 6);
  });
});

describe('Даты', () => {
  it('сдвиг и неделя', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(weekKey('2026-11-04')).toBe('2026-11-02');
    expect(dayKey(day0)).toBe('2026-11-02');
  });
});

describe('Создание персонажа', () => {
  it('сразу есть ежедневки, первый квест и заморозка', () => {
    const s = hero();
    expect(s.dailies?.tasks.length).toBe(3);
    expect(s.quests.first_steps?.status).toBe('active');
    expect(s.streak.freezes).toBe(1);
  });
});

describe('Повторы и опыт', () => {
  it('XP = 10 × множитель × бонус качества', () => {
    const r = applyRep(hero(), { exercise: 'pushup', quality: 100 }, day0);
    const xp = r.events.find((e) => e.kind === 'xp');
    expect(xp?.kind === 'xp' ? xp.amount : 0).toBeCloseTo(24, 6);
    expect(r.state.statXp.strength).toBeCloseTo(24, 6);
  });

  it('повышение уровня', () => {
    const { events } = doReps(hero(), 'pushup', 3, 100);
    expect(events.some((e) => e.kind === 'levelUp' && e.level >= 2)).toBe(true);
  });

  it('сверх дневного лимита XP вдвое меньше (новичок: лимит × 0,7)', () => {
    const { state, events } = doReps(hero(), 'pullup', 36, 50);
    expect(events.some((e) => e.kind === 'limit')).toBe(true);
    const xps = events.filter((e): e is Extract<GameEvent, { kind: 'xp' }> => e.kind === 'xp');
    expect(xps.at(-1)?.overLimit).toBe(true);
    expect(xps[0]?.overLimit).toBe(false);
    expect(state.days['2026-11-02']?.reps.pullup).toBe(36);
  });
});

describe('Квесты', () => {
  it('стартовая цепочка идёт по порядку и даёт награды', () => {
    let s = hero();
    let r = doReps(s, 'squat', 5);
    s = r.state;
    expect(s.quests.first_steps?.status).toBe('done');
    expect(r.events.some((e) => e.kind === 'questDone' && e.questId === 'first_steps')).toBe(true);
    expect(s.quests.warmup?.status).toBe('active');
    expect(s.gold).toBeGreaterThan(0);
    r = doReps(s, 'jumping_jack', 20);
    expect(r.state.quests.push_off?.status).toBe('active');
  });

  it('без турника подтягивания заменяются австралийскими', () => {
    let s = hero({ hasBar: false });
    for (const [ex, n] of [['squat', 5], ['jumping_jack', 20], ['pushup', 5], ['situp', 10], ['lunge', 10]] as const) s = doReps(s, ex, n).state;
    // уровень 3 к этому моменту уже набран
    expect(s.quests.rising?.status).toBe('done');
    expect(s.quests.the_bar?.status).toBe('active');
    s = doReps(s, 'pullup_australian', 5).state;
    expect(s.quests.the_bar?.status).toBe('done');
  });

  it('квест на технику считает только качественные повторы', () => {
    let s = hero();
    for (const [ex, n] of [['squat', 5], ['jumping_jack', 20], ['pushup', 5], ['situp', 10], ['lunge', 10], ['pullup', 1]] as const) s = doReps(s, ex, n).state;
    expect(s.quests.clean_form?.status).toBe('active');
    s = doReps(s, 'pushup', 10, 70).state;
    expect(s.quests.clean_form?.status).toBe('active');
    s = doReps(s, 'pushup', 10, 85).state;
    expect(s.quests.clean_form?.status).toBe('done');
  });
});

describe('Ежедневки', () => {
  it('три задания разных групп мышц', () => {
    for (let i = 0; i < 20; i += 1) {
      const s = ensureDay(hero(), at(i)).state;
      const groups = s.dailies?.tasks.flatMap((t) => (t.group ? [t.group] : [])) ?? [];
      expect(new Set(groups).size).toBe(groups.length);
      expect(s.dailies?.tasks.length).toBe(3);
    }
  });

  it('без турника нет обычных подтягиваний', () => {
    for (let i = 0; i < 30; i += 1) {
      const s = ensureDay(hero({ hasBar: false }), at(i)).state;
      expect(s.dailies?.tasks.some((t) => t.exercise === 'pullup')).toBe(false);
    }
  });

  it('уставшая вчера группа мышц сегодня отдыхает', () => {
    const tired = tiredGroups({ reps: { squat: 180 }, goodReps: {}, cameraXp: 0, dailiesDone: 0 });
    expect(tired.has('legs')).toBe(true);
    const s = hero();
    s.days[addDays(s.today, 0)] = { reps: { squat: 180, lunge: 120 }, goodReps: {}, cameraXp: 0, dailiesDone: 0 };
    const next = ensureDay(s, at(1)).state;
    expect(next.dailies?.tasks.some((t) => t.group === 'legs')).toBe(false);
  });

  it('выполнение задания и бонус за все три', () => {
    let s = hero();
    const tasks = s.dailies?.tasks ?? [];
    const allEvents: GameEvent[] = [];
    for (const t of tasks) {
      if ((t.template === 'reps' || t.template === 'cardio' || t.template === 'technique') && t.exercise) {
        const r = doReps(s, t.exercise, t.target, 90);
        s = r.state;
        allEvents.push(...r.events);
      } else if (t.template === 'variety') {
        for (const ex of ['squat', 'situp', 'lunge'] as const) {
          const r = doReps(s, ex, 10, 90);
          s = r.state;
          allEvents.push(...r.events);
        }
      } else if (t.template === 'xp') {
        while (taskProgress(t, s.days[s.today]) < t.target) {
          const r = doReps(s, 'pushup', 10, 90);
          s = r.state;
          allEvents.push(...r.events);
        }
      }
    }
    expect(s.dailies?.tasks.every((t) => t.done)).toBe(true);
    expect(allEvents.some((e) => e.kind === 'dailyBonus')).toBe(true);
    expect(s.streak.count).toBe(1);
  });

  it('замена задания — один раз в день', () => {
    const s = hero();
    const before = s.dailies?.tasks[0]?.key;
    const once = reroll(s, 0);
    expect(once.dailies?.tasks[0]?.key).not.toBe(before);
    expect(once.dailies?.rerollUsed).toBe(true);
    expect(reroll(once, 1)).toBe(once);
  });

  it('шаблон не повторяется два дня подряд', () => {
    let s = hero();
    for (let i = 1; i < 10; i += 1) {
      const prev = new Set(s.dailies?.tasks.map((t) => t.key));
      s = ensureDay(s, at(i)).state;
      const repeated = s.dailies?.tasks.filter((t) => prev.has(t.key)).length ?? 0;
      expect(repeated).toBe(0);
    }
  });

  it('генерация детерминирована для дня', () => {
    const s = hero();
    expect(generateDailies(s, '2026-11-05').map((t) => t.key)).toEqual(generateDailies(s, '2026-11-05').map((t) => t.key));
  });
});

describe('Стрик', () => {
  const train = (s: GameState, now: Date) => doReps(s, 'pushup', 6, 90, now).state;

  it('растёт день за днём', () => {
    let s = hero();
    for (let i = 0; i < 3; i += 1) s = train(s, at(i));
    expect(s.streak.count).toBe(3);
  });

  it('пропуск закрывается заморозкой', () => {
    let s = train(hero(), at(0));
    s = train(s, at(2));
    expect(s.streak.count).toBe(2);
    expect(s.streak.freezes).toBe(0);
  });

  it('без заморозок стрик сгорает', () => {
    let s = train(hero(), at(0));
    s = train(s, at(3));
    expect(s.streak.count).toBe(1);
  });

  it('квест на стрик закрывается', () => {
    let s = hero();
    for (const [ex, n] of [['squat', 5], ['jumping_jack', 20], ['pushup', 5], ['situp', 10], ['lunge', 10], ['pullup', 1], ['pushup', 10]] as const) s = doReps(s, ex, n).state;
    expect(s.quests.habit?.status).toBe('active');
    s = train(s, at(1));
    s = train(s, at(2));
    expect(s.quests.habit?.status).toBe('done');
  });
});
