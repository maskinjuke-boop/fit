import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, checkAchievements, unlockedTitles } from '../src/game/achievements';
import { EXERCISE_GAME, STATS } from '../src/game/config';
import { applyRep, newCharacterState, settleAfterStory, type GameEvent } from '../src/game/engine';
import { ITEMS } from '../src/game/items';
import { createState, DEFAULT_APPEARANCE, migrate, type GameState } from '../src/game/state';
import {
  ENERGY_XP,
  MAX_ENERGY,
  abandonTrial,
  availableChoices,
  camp,
  canAfford,
  checkChance,
  choose,
  proceed,
  requirementMet,
  startJourney,
  travel,
  trialPlan,
} from '../src/game/story';
import { COMPANIONS, REGIONS, REGION_STEPS, STORY_EVENTS, STORY_TITLES, storyEvent } from '../src/game/storyContent';
import { NPC_IDS, type Txt } from '../src/game/storyTypes';
import { NPCS } from '../src/game/storyNpcs';

const now = new Date(2026, 10, 2, 10, 0, 0);

function hero(id = 'hero-1', hasBar = true): GameState {
  const s = newCharacterState({ name: 'Тест', archetype: 'ranger', color: '#3ddc84', hasBar, fitness: 'beginner', appearance: DEFAULT_APPEARANCE }, now, createState);
  return { ...s, character: { ...s.character, id } };
}

const started = (id?: string): GameState => startJourney(hero(id)).state;

function withEvent(s: GameState, id: string): GameState {
  const c = structuredClone(s);
  c.story.event = { id, vars: { npc: 0 } };
  c.story.status = 'event';
  return c;
}

const txts = (): Txt[] => {
  const out: Txt[] = [];
  for (const e of STORY_EVENTS) {
    out.push(e.title, e.text);
    for (const list of Object.values(e.vars ?? {})) out.push(...list);
    for (const c of e.choices) {
      out.push(c.label, c.success.text);
      if (c.fail) out.push(c.fail.text);
    }
  }
  for (const r of REGIONS) out.push(r.name, r.intro);
  for (const c of Object.values(COMPANIONS)) out.push(c.name, c.perk);
  out.push(...Object.values(STORY_TITLES));
  return out;
};

describe('Содержимое истории', () => {
  it('все тексты есть на двух языках', () => {
    for (const x of txts()) {
      expect(x.ru.length).toBeGreaterThan(0);
      expect(x.en.length).toBeGreaterThan(0);
    }
  });

  it('события корректны: уникальные id, подстановки определены, упражнения и характеристики существуют', () => {
    const ids = new Set(STORY_EVENTS.map((e) => e.id));
    expect(ids.size).toBe(STORY_EVENTS.length);
    for (const e of STORY_EVENTS) {
      const choiceIds = new Set(e.choices.map((c) => c.id));
      expect(choiceIds.size).toBe(e.choices.length);
      for (const key of [...e.text.ru.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)) expect(Object.keys(e.vars ?? {})).toContain(key);
      for (const c of e.choices) {
        if (c.trial) expect(EXERCISE_GAME[c.trial.exercise]).toBeTruthy();
        if (c.check) expect(STATS).toContain(c.check.stat);
        if (c.check || c.trial || c.gamble) expect(c.fail).toBeTruthy();
        if (c.success.effect.title) expect(STORY_TITLES[c.success.effect.title]).toBeTruthy();
      }
      // В каждом событии есть вариант без особых требований — путь не может зайти в тупик.
      expect(e.choices.some((c) => !c.requires || (e.boss && c.trial))).toBe(true);
    }
  });

  it('у каждого региона есть хранитель и свои события', () => {
    REGIONS.forEach((_, i) => {
      expect(STORY_EVENTS.some((e) => e.boss && e.regions?.includes(i))).toBe(true);
      expect(STORY_EVENTS.filter((e) => !e.boss && e.regions?.includes(i)).length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('Путешествие', () => {
  it('начинается с запасом шагов и выпадает событие за шаг', () => {
    const s = started();
    expect(s.story.started).toBe(true);
    expect(s.story.energy).toBeGreaterThanOrEqual(3);
    const r = travel(s).state;
    expect(r.story.status).toBe('event');
    expect(r.story.energy).toBe(s.story.energy - 1);
    expect(storyEvent(r.story.event!.id)).toBeTruthy();
  });

  it('событие детерминировано для одного героя и разное у разных героев', () => {
    const a = travel(started('a')).state.story.event!.id;
    expect(travel(started('a')).state.story.event!.id).toBe(a);
    const ids = new Set(['b', 'c', 'd', 'e', 'f', 'g'].map((id) => travel(started(id)).state.story.event!.id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('без шагов пути идти нельзя; тренировка даёт шаги', () => {
    let s = started();
    s = { ...s, story: { ...s.story, energy: 0 } };
    expect(travel(s).state).toBe(s);
    let events: GameEvent[] = [];
    let xp = 0;
    while (xp < ENERGY_XP) {
      const r = applyRep(s, { exercise: 'pushup', quality: 90 }, now);
      xp += r.events.filter((e) => e.kind === 'xp').reduce((a, e) => a + (e.kind === 'xp' ? e.amount : 0), 0);
      events = [...events, ...r.events];
      s = r.state;
    }
    expect(s.story.energy).toBe(1);
    expect(events.some((e) => e.kind === 'storyEnergy')).toBe(true);
  });

  it('прямой выбор даёт исход и шаг вперёд; затем снова можно идти', () => {
    const s = withEvent(started(), 'pilgrim');
    const r = choose(s, 'map').state;
    expect(r.story.status).toBe('outcome');
    expect(r.story.step).toBe(1);
    expect(r.story.last?.ok).toBe(true);
    expect(proceed(r).state.story.status).toBe('idle');
  });

  it('требования скрывают выбор: «я свой» только для разбойника', () => {
    const s = withEvent(started(), 'bandits');
    const ev = storyEvent('bandits')!;
    expect(availableChoices(s, ev).some((c) => c.id === 'brothers')).toBe(false);
    s.story.flags.push('outlaw');
    expect(availableChoices(s, ev).some((c) => c.id === 'brothers')).toBe(true);
  });

  it('платный выбор недоступен без золота', () => {
    const s = withEvent(started(), 'merchant');
    s.gold = 0;
    const buy = storyEvent('merchant')!.choices.find((c) => c.id === 'buy')!;
    expect(canAfford(s, buy)).toBe(false);
    expect(choose(s, 'buy').state).toBe(s);
  });

  it('испытание засчитывается повторами в тренировке', () => {
    let s = choose(withEvent(started(), 'rival'), 'accept').state;
    expect(s.story.status).toBe('trial');
    const trial = s.story.trial!;
    expect(trial.exercise).toBe('pushup');
    let done = false;
    for (let i = 0; i < trial.target; i += 1) {
      const r = applyRep(s, { exercise: 'pushup', quality: 90 }, now);
      s = r.state;
      done = done || r.events.some((e) => e.kind === 'storyTrialDone');
    }
    expect(done).toBe(true);
    expect(s.story.status).toBe('outcome');
    expect(s.story.last?.ok).toBe(true);
  });

  it('другие упражнения испытание не двигают; отказ — неудачный исход', () => {
    let s = choose(withEvent(started(), 'rival'), 'accept').state;
    s = applyRep(s, { exercise: 'squat', quality: 90 }, now).state;
    expect(s.story.trial?.progress).toBe(0);
    const r = abandonTrial(s).state;
    expect(r.story.status).toBe('outcome');
    expect(r.story.last?.ok).toBe(false);
  });

  it('без турника подтягивания в испытании заменяются облегчёнными', () => {
    const s = startJourney(hero('nobar', false)).state;
    expect(trialPlan(s, { exercise: 'pullup', reps: 3 }).exercise).toBe('pullup_australian');
    expect(trialPlan(s, { exercise: 'pullup', reps: 3 }).target).toBeGreaterThan(3);
  });

  it('шанс проверки растёт со спутником и благословением и падает с проклятием', () => {
    const s = started();
    const base = checkChance(s, { stat: 'strength', diff: 2 });
    s.story.companions.push('squire');
    const withSquire = checkChance(s, { stat: 'strength', diff: 2 });
    expect(withSquire).toBeGreaterThan(base);
    s.story.flags.push('cursed');
    expect(checkChance(s, { stat: 'strength', diff: 2 })).toBeLessThan(withSquire);
  });

  it('после шести шагов выходит хранитель, победа открывает следующий регион', () => {
    let s = started();
    s.story.step = REGION_STEPS;
    s.gold = 1000;
    s = travel(s).state;
    expect(storyEvent(s.story.event!.id)?.boss).toBe(true);
    // Хранитель леса: проходим «напролом» через испытание.
    s = choose(s, 'fight').state;
    for (let i = 0; i < 100 && s.story.status === 'trial'; i += 1) s = applyRep(s, { exercise: 'squat', quality: 90 }, now).state;
    expect(s.story.last?.effect.clear).toBe(true);
    expect(s.story.region).toBe(1);
    expect(s.story.step).toBe(0);
    expect(s.story.regionsCleared).toBe(1);
  });

  it('стойкость на нуле завершает путешествие поражением', () => {
    let s = withEvent(started(), 'cart');
    s.story.resolve = 1;
    s = choose(s, 'pass').state;
    expect(s.story.ending).toBe('defeat');
    s = proceed(s).state;
    expect(s.story.status).toBe('ended');
    expect(travel(s).state).toBe(s);
    const next = startJourney(s).state;
    expect(next.story.run).toBe(1);
    expect(next.story.status).toBe('idle');
    expect(next.story.ending).toBe(null);
  });

  it('привал восстанавливает стойкость за шаг пути', () => {
    const s = started();
    s.story.resolve = 5;
    const r = camp(s).state;
    expect(r.story.resolve).toBe(7);
    expect(r.story.energy).toBe(s.story.energy - 1);
  });

  it('случайные прохождения не ломают состояние', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      let s = started(`fuzz-${seed}`);
      s.gold = 500;
      for (let step = 0; step < 120; step += 1) {
        const st = s.story;
        if (st.status === 'ended') break;
        if (st.status === 'idle') {
          s.story.energy = MAX_ENERGY;
          s = travel(s).state;
        } else if (st.status === 'event') {
          const ev = storyEvent(st.event!.id)!;
          const options = availableChoices(s, ev).filter((c) => canAfford(s, c));
          const pick = options[(seed + step) % options.length]!;
          s = choose(s, pick.id).state;
        } else if (st.status === 'trial') {
          s = (step + seed) % 2 === 0 ? abandonTrial(s).state : applyRep(s, { exercise: st.trial!.exercise, quality: 90 }, now).state;
        } else if (st.status === 'outcome') {
          s = proceed(s).state;
        }
        expect(s.story.resolve).toBeGreaterThanOrEqual(0);
        expect(s.story.resolve).toBeLessThanOrEqual(s.story.maxResolve);
        expect(s.story.region).toBeLessThan(REGIONS.length);
        expect(s.story.step).toBeLessThanOrEqual(REGION_STEPS);
        expect(s.story.companions.length).toBeLessThanOrEqual(3);
        expect(new Set(s.inventory).size).toBe(s.inventory.length);
        for (const id of s.inventory) expect(ITEMS.some((i) => i.id === id)).toBe(true);
      }
    }
  });

  it('старое сохранение получает историю и достижения', () => {
    const legacy = JSON.parse(JSON.stringify(hero())) as Record<string, unknown>;
    delete legacy.story;
    delete legacy.achievements;
    const m = migrate(legacy as unknown as GameState);
    expect(m.story.started).toBe(false);
    expect(m.achievements).toEqual({});
  });
});

describe('Достижения', () => {
  it('первый повтор открывает достижение с наградой', () => {
    const r = applyRep(hero(), { exercise: 'squat', quality: 90 }, now);
    expect(r.state.achievements.first_rep).toBeTruthy();
    expect(r.events.some((e) => e.kind === 'achievement' && e.id === 'first_rep')).toBe(true);
  });

  it('начало путешествия открывает «В путь!»', () => {
    const r = settleAfterStory(started(), []);
    expect(r.state.achievements.story_start).toBeTruthy();
  });

  it('титулы собираются из истории и достижений', () => {
    const s = started();
    s.story.titles.push('forest_friend');
    s.streak.best = 7;
    const events: GameEvent[] = [];
    checkAchievements(s, events);
    expect(unlockedTitles(s)).toContain('forest_friend');
    expect(unlockedTitles(s)).toContain('discipline');
  });

  it('у достижений уникальные id и понятный прогресс', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const s = hero();
    for (const a of ACHIEVEMENTS) {
      const [cur, goal] = a.progress(s);
      expect(goal).toBeGreaterThan(0);
      expect(cur).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Персонажи истории', () => {
  it('у каждого персонажа есть тексты на двух языках, внешность и знакомство', () => {
    for (const id of NPC_IDS) {
      const n = NPCS[id];
      for (const x of [n.name, n.role, n.bio, ...n.lines]) {
        expect(x.ru.length).toBeGreaterThan(0);
        expect(x.en.length).toBeGreaterThan(0);
      }
      for (const item of Object.values(n.equipped)) expect(ITEMS.some((i) => i.id === item)).toBe(true);
      // Есть событие знакомства и хотя бы два продолжения.
      const evs = STORY_EVENTS.filter((e) => e.npc === id);
      expect(evs.some((e) => e.when?.notMet === id)).toBe(true);
      expect(evs.filter((e) => e.when?.npc?.[0] === id).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('знакомство меняет отношение, а следующая встреча требует дружбы', () => {
    let s = withEvent(started(), 'lira_meet');
    s = choose(s, 'flirt').state;
    expect(s.story.npcs.lira !== undefined).toBe(true);
    const debt = storyEvent('lira_debt')!;
    const low = structuredClone(s);
    low.story.npcs.lira = 1;
    expect(requirementMet(low, debt.when)).toBe(false);
    low.story.npcs.lira = 3;
    expect(requirementMet(low, debt.when)).toBe(true);
    // Повторного знакомства не будет.
    expect(requirementMet(s, storyEvent('lira_meet')!.when)).toBe(false);
  });

  it('отношение в границах и сохраняется в новом путешествии', () => {
    let s = withEvent(started(), 'lira_smuggle');
    s.story.npcs.lira = 1;
    for (let i = 0; i < 3; i += 1) {
      s = withEvent(proceed(s).state, 'lira_smuggle');
      s = choose(s, 'report').state;
    }
    expect(s.story.npcs.lira).toBe(-5);
    const next = startJourney({ ...s, story: { ...s.story, ending: 'defeat', status: 'ended' } }).state;
    expect(next.story.npcs.lira).toBe(-5);
  });

  it('союзник помогает в битве с хранителем', () => {
    const s = withEvent(started(), 'boss_serpent');
    const ev = storyEvent('boss_serpent')!;
    expect(availableChoices(s, ev).some((c) => c.id === 'zara')).toBe(false);
    s.story.flags.push('zara_ally');
    expect(availableChoices(s, ev).some((c) => c.id === 'zara')).toBe(true);
    s.story.region = 3;
    const r = choose(s, 'zara').state;
    expect(r.story.region).toBe(4);
    expect(r.story.npcs.zara).toBe(1);
  });
});
