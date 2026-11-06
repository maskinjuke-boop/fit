import { describe, expect, it } from 'vitest';
import { applyRep, ensureDay, newCharacterState, type GameEvent } from '../src/game/engine';
import { xpForLevel } from '../src/game/levels';
import {
  act,
  adoptCat,
  buyExtra,
  clientFee,
  extraBlocker,
  gymComfort,
  houseBlocker,
  maxCats,
  sellFurniture,
  sessionPay,
  upgradeHouse,
  answerEvent,
  AUTO_RESERVE,
  autoAction,
  autoChoice,
  catBlocker,
  catMood,
  litterDirty,
  comfort,
  hasObject,
  rehomeCat,
  blocker,
  buyFurniture,
  clientOutfit,
  clientTarget,
  dailyQuota,
  effectiveAppearance,
  endSession,
  fee,
  furnitureBlocker,
  gymBlocker,
  makeClient,
  migrateLife,
  quotaFor,
  repsOn,
  sessionTarget,
  skillLevel,
  sleepMinutes,
  startSession,
  trainerLevel,
  upgradeGym,
} from '../src/game/life';
import { ACTIONS, GYM_EXTRAS, HOUSES, BOWL_MAX, CAT_BREEDS, LITTER_DIRTY, FURNITURE, GYMS, HOUSE_SLOTS, LIFE_EVENTS, MAX_CATS, OBJECTS, SESSION_EXERCISES, actionById, lifeEventById, mountOf, slotsFor } from '../src/game/lifeContent';
import { RUN_SPEED, STICK_WALK, WALK_SPEED, blocked, bounds, clientSpot, detourPoint, freeSpot, gymGear, gymLayout, homeLayout, homeObstacles, resolve, spawn, stickSpeed, type Box, type P2 } from '../src/game/lifeMap';
import type { Txt } from '../src/game/lifeTypes';
import { itemById } from '../src/game/items';
import { createState, DEFAULT_APPEARANCE, migrate, type GameState } from '../src/game/state';

const now = new Date(2026, 10, 5, 10, 0, 0);
const tomorrow = new Date(2026, 10, 6, 10, 0, 0);

function hero(): GameState {
  return newCharacterState({ name: 'Тест', archetype: 'ranger', color: '#3ddc84', hasBar: true, fitness: 'intermediate', appearance: DEFAULT_APPEARANCE }, now, createState);
}

/** Герой в зале в заданное время (и день уже начат, чтобы повторы не сдвигали дату). */
function inGym(hour = 10, s0 = hero()): GameState {
  const s = structuredClone(ensureDay(s0, now).state);
  s.life.scene = 'gym';
  s.life.minute = hour * 60;
  return s;
}

const withLevel = (s: GameState, level: number): GameState => {
  const c = structuredClone(s);
  c.totalXp = xpForLevel(level);
  return c;
};

const both = (x: Txt): void => {
  expect(x.ru.length).toBeGreaterThan(0);
  expect(x.en.length).toBeGreaterThan(0);
};

describe('содержимое тренера', () => {
  it('все тексты на двух языках, id уникальны', () => {
    for (const a of ACTIONS) both(a.label);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const id of Object.keys(OBJECTS)) both(OBJECTS[id as keyof typeof OBJECTS].name);
    for (const g of GYMS) {
      both(g.name);
      both(g.desc);
    }
    for (const e of LIFE_EVENTS) {
      both(e.title);
      both(e.text);
      for (const c of e.choices) both(c.text);
    }
  });

  it('уровни зала: больше мест, дороже занятия и улучшения', () => {
    for (let i = 1; i < GYMS.length; i += 1) {
      expect(GYMS[i]!.cap).toBeGreaterThan(GYMS[i - 1]!.cap);
      expect(GYMS[i]!.mult).toBeGreaterThan(GYMS[i - 1]!.mult);
      expect(GYMS[i]!.cost).toBeGreaterThan(GYMS[i - 1]!.cost);
    }
  });

  it('ученики одеты в существующие вещи своих слотов', () => {
    for (let id = 1; id < 40; id += 1) {
      for (const level of [1, 6, 14]) {
        const c = makeClient(id, level, 1);
        for (const [slot, item] of Object.entries(clientOutfit(c))) expect(itemById(item!)?.slot).toBe(slot);
      }
    }
  });

  it('предметы дома и зала, места учеников и оборудование — внутри комнат', () => {
    const inside = (scene: 'home' | 'gym', p: { x: number; z: number }): void => {
      const b = bounds(scene);
      expect(p.x).toBeGreaterThanOrEqual(b.x0 - 0.5);
      expect(p.x).toBeLessThanOrEqual(b.x1 + 0.5);
      expect(p.z).toBeGreaterThanOrEqual(b.z0 - 0.5);
      expect(p.z).toBeLessThanOrEqual(b.z1 + 0.5);
    };
    const home = homeLayout(FURNITURE.slice(0, HOUSE_SLOTS));
    expect(home.length).toBe(7 + HOUSE_SLOTS);
    for (const p of home) {
      inside('home', p.pos);
      inside('home', p.use);
    }
    for (const p of gymLayout(true, true)) {
      inside('gym', p.pos);
      inside('gym', p.use);
    }
    for (let i = 0; i < 10; i += 1) inside('gym', clientSpot(i));
    // Оборудование каждой ступени — внутри зала своего размера.
    for (let tier = 0; tier < GYMS.length; tier += 1) {
      const b = bounds('gym', tier);
      for (const g of gymGear(tier, GYM_EXTRAS.filter((x) => x.gym <= tier).map((x) => x.id))) {
        expect(g.pos.x).toBeGreaterThanOrEqual(b.x0 - 0.5);
        expect(g.pos.x).toBeLessThanOrEqual(b.x1 + 0.5);
        expect(g.pos.z).toBeGreaterThanOrEqual(b.z0 - 0.5);
        expect(g.pos.z).toBeLessThanOrEqual(b.z1 + 0.5);
      }
    }
    // До каждого места использования можно дойти: точка не внутри препятствия.
    const boxes = [...gymLayout(true, true), ...gymGear(2)].map((x) => x.box).filter((b) => b !== null);
    for (const p of gymLayout(true, true)) {
      const r = resolve(p.use, bounds('gym'), boxes);
      expect(Math.hypot(r.x - p.use.x, r.z - p.use.z)).toBeLessThan(0.3);
    }
    for (const sc of ['home', 'gym'] as const) inside(sc, spawn(sc));
  });
});

describe('быт', () => {
  it('новый герой: утро дома, один очень полный ученик', () => {
    const s = hero();
    expect(s.life.scene).toBe('home');
    expect(s.life.clients.length).toBe(1);
    expect(s.life.clients[0]!.fat).toBeGreaterThan(0.85);
    expect(s.gold).toBeGreaterThan(0);
  });

  it('сон — до 7 утра, энергия восстанавливается', () => {
    const s = hero();
    s.life.minute = 23 * 60;
    s.life.needs.energy = 10;
    const next = act(s, 'sleep').state;
    expect(next.life.minute).toBe(7 * 60);
    expect(next.life.day).toBe(2);
    expect(next.life.needs.energy).toBeGreaterThan(80);
    expect(sleepMinutes(23 * 60)).toBe(480);
  });

  it('дорога в зал и обратно', () => {
    const s = hero();
    const g = act(s, 'go_gym').state;
    expect(g.life.scene).toBe('gym');
    expect(act(g, 'go_home').state.life.scene).toBe('home');
  });

  it('мебель покупается, если есть место и деньги', () => {
    let s = hero();
    s.gold = 100000;
    expect(furnitureBlocker(s, 'bed')).toBe('owned');
    for (const id of FURNITURE.slice(0, HOUSE_SLOTS)) s = buyFurniture(s, id);
    expect(s.life.furniture.length).toBe(HOUSE_SLOTS);
    expect(furnitureBlocker(s, FURNITURE[HOUSE_SLOTS]!)).toBe('space');
  });

  it('событие применяет выбор', () => {
    const s = hero();
    s.life.event = { id: 'blogger' };
    const next = answerEvent(s, 'yes');
    expect(next.life.event).toBe(null);
    // Деньги — только за занятия: событие даёт доверие и обаяние, но не деньги.
    expect(next.gold).toBe(s.gold);
    expect(next.life.skills.charisma).toBeGreaterThan(s.life.skills.charisma);
  });

  it('навык растёт с опытом', () => {
    expect(skillLevel(0)).toBe(0);
    expect(skillLevel(12)).toBe(1);
    expect(skillLevel(100000)).toBe(10);
  });
});

describe('занятия', () => {
  it('занятие только в зале и в часы работы', () => {
    const a = actionById('session')!;
    expect(blocker(hero(), a)).toBe('missing');
    expect(blocker(inGym(3), a)).toBe('closed');
    expect(blocker(inGym(10), a)).toBe(null);
    expect(act(inGym(10), 'session').open).toBe('session');
  });

  it('тренер выполняет упражнение — занятие оплачивается, ученики становятся стройнее', () => {
    let s = startSession(inGym(10), 'squat');
    expect(s.life.session?.target).toBe(sessionTarget(s, 'squat'));
    const client = s.life.clients[0]!;
    const target = s.life.session!.target;
    const gold = s.gold;
    const events: GameEvent[] = [];
    for (let i = 0; i < target; i += 1) {
      const r = applyRep(s, { exercise: 'squat', quality: 90 }, now);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.life.session).toBe(null);
    const done = events.find((e) => e.kind === 'sessionDone');
    expect(done && done.kind === 'sessionDone' ? done.pay : 0).toBeGreaterThan(0);
    expect(s.gold).toBeGreaterThan(gold);
    const after = s.life.clients.find((c) => c.id === client.id)!;
    expect(after.fat).toBeLessThan(client.fat);
    expect(after.muscle).toBeGreaterThan(client.muscle);
    expect(after.sessions).toBe(1);
    expect(s.life.stats.sessions).toBe(1);
  });

  it('повторы другого упражнения занятие не двигают; выход — оплата за часть', () => {
    let s = startSession(inGym(10), 'squat');
    s = applyRep(s, { exercise: 'pushup', quality: 90 }, now).state;
    expect(s.life.session?.progress).toBe(0);
    for (let i = 0; i < 3; i += 1) s = applyRep(s, { exercise: 'squat', quality: 90 }, now).state;
    const gold = s.gold;
    const ended = endSession(s);
    expect(ended.life.session).toBe(null);
    expect(ended.gold).toBeGreaterThan(gold);
    expect(ended.gold - gold).toBeLessThan(fee(s));
    // Без единого повтора выход ничего не платит.
    const empty = endSession(startSession(inGym(10), 'lunge'));
    expect(empty.life.session).toBe(null);
    expect(empty.life.stats.sessions).toBe(0);
  });

  it('с уровнем растут число учеников, цена и повторы; новички спортивнее', () => {
    const low = inGym(10);
    const high = withLevel(inGym(10), 9);
    high.life.gym = 4;
    expect(trainerLevel(high)).toBe(9);
    expect(clientTarget(low)).toBe(1);
    expect(clientTarget(high)).toBeGreaterThan(clientTarget(low));
    expect(fee(high)).toBeGreaterThan(fee(low));
    for (const [ex] of SESSION_EXERCISES) expect(sessionTarget(high, ex)).toBeGreaterThan(sessionTarget(low, ex));
    const avg = (level: number): number => {
      let sum = 0;
      for (let i = 1; i <= 30; i += 1) sum += makeClient(i, level, 1).fat;
      return sum / 30;
    };
    expect(avg(12)).toBeLessThan(avg(1) - 0.8);
  });

  it('новые ученики приходят до предела зала', () => {
    let s = withLevel(inGym(10), 12);
    s.gold = 0;
    for (let k = 0; k < 15; k += 1) {
      s = startSession(s, 'jumping_jack');
      const target = s.life.session!.target;
      for (let i = 0; i < target; i += 1) s = applyRep(s, { exercise: 'jumping_jack', quality: 90 }, now).state;
      s.life.needs.energy = 100;
      s.life.minute = 10 * 60;
    }
    expect(s.life.clients.length).toBe(GYMS[0]!.cap);
  });

  it('улучшение зала: нужен уровень и деньги, растут места и цена', () => {
    let s = inGym(10);
    s.gold = 100000;
    expect(gymBlocker(s)).toBe('level');
    s = withLevel(s, 3);
    expect(gymBlocker(s)).toBe(null);
    const before = fee(s);
    s = upgradeGym(s);
    expect(s.life.gym).toBe(1);
    expect(s.gold).toBe(100000 - GYMS[1]!.cost);
    expect(fee(s)).toBeGreaterThan(before);
    expect(gymBlocker(s)).toBe('level');
  });
});

describe('норма дня', () => {
  it('выполненная норма — событие, невыполненная — штраф и потеря доверия', () => {
    let s = hero();
    const quota = dailyQuota(s);
    const events: GameEvent[] = [];
    for (let i = 0; i < quota; i += 1) {
      const r = applyRep(s, { exercise: i % 2 ? 'squat' : 'lunge', quality: 90 }, now);
      s = r.state;
      events.push(...r.events);
    }
    expect(repsOn(s, s.today)).toBe(quota);
    expect(events.filter((e) => e.kind === 'quotaDone').length).toBe(1);
    // Выполненный день без штрафа.
    const ok = ensureDay(s, tomorrow);
    expect(ok.events.some((e) => e.kind === 'quotaMissed')).toBe(false);

    // Пропущенный день — штраф и недовольство.
    const lazy = ensureDay(hero(), now).state;
    lazy.gold = 500;
    const loyalty = lazy.life.clients[0]!.loyalty;
    const missed = ensureDay(lazy, tomorrow);
    const e = missed.events.find((x) => x.kind === 'quotaMissed');
    expect(e && e.kind === 'quotaMissed' ? e.fine : 0).toBeGreaterThan(0);
    expect(missed.state.gold).toBeLessThan(500);
    expect(missed.state.life.clients[0]!.loyalty).toBe(loyalty - 15);
  });

  it('ученик без доверия уходит', () => {
    const s = ensureDay(hero(), now).state;
    s.life.clients[0]!.loyalty = 10;
    const r = ensureDay(s, tomorrow);
    expect(r.state.life.clients.length).toBe(0);
    const e = r.events.find((x) => x.kind === 'quotaMissed');
    expect(e && e.kind === 'quotaMissed' ? e.left : 0).toBe(1);
  });

  it('норма растёт с уровнем, но не бесконечно', () => {
    expect(quotaFor(withLevel(hero(), 5))).toBeGreaterThan(quotaFor(hero()));
    expect(quotaFor(withLevel(hero(), 60))).toBe(120);
    // Норма дня фиксируется утром и не растёт от нового уровня в тот же день.
    const s = ensureDay(hero(), now).state;
    const q = dailyQuota(s);
    expect(dailyQuota(withLevel(s, 10))).toBe(q);
    expect(dailyQuota(ensureDay(withLevel(s, 10), tomorrow).state)).toBeGreaterThan(q);
  });
});

describe('дом и кошки', () => {
  it('у всего для дома есть цена, раздел и текст; кошки — на двух языках', () => {
    for (const id of FURNITURE) {
      const o = OBJECTS[id];
      expect(o.price ?? 0).toBeGreaterThan(0);
      expect(['furniture', 'tech', 'decor']).toContain(o.kind);
      both(o.name);
      both(o.desc!);
    }
    for (const b of CAT_BREEDS) {
      both(b.name);
      both(b.desc);
    }
  });

  it('места считаются по виду: у стен, на стенах, на полу', () => {
    let s = hero();
    s.gold = 1e6;
    for (const id of FURNITURE) s = buyFurniture(s, id);
    for (const m of ['slot', 'wall', 'floor'] as const) expect(s.life.furniture.filter((x) => mountOf(x) === m).length).toBe(Math.min(slotsFor(m), FURNITURE.filter((x) => mountOf(x) === m).length));
    // Мебели и техники больше, чем мест у стен: часть приходится выбирать.
    expect(FURNITURE.filter((x) => mountOf(x) === 'slot').length).toBeGreaterThan(slotsFor('slot'));
    expect(s.life.furniture).toContain('robot_vacuum');
    // Всё купленное получает место в доме.
    const placed = homeLayout(s.life.furniture);
    for (const id of s.life.furniture) expect(placed.some((p) => p.id === id)).toBe(true);
    for (const p of placed) {
      const b = bounds('home');
      expect(p.pos.x).toBeGreaterThanOrEqual(b.x0 - 0.5);
      expect(p.pos.x).toBeLessThanOrEqual(b.x1 + 0.5);
      expect(p.pos.z).toBeGreaterThanOrEqual(b.z0 - 0.5);
    }
  });

  it('уют и робот-пылесос замедляют падение потребностей дома', () => {
    const plain = hero();
    const cosy = hero();
    cosy.gold = 1e6;
    let c = cosy;
    for (const id of ['robot_vacuum', 'painting', 'palm', 'neon_sign'] as const) c = buyFurniture(c, id);
    expect(comfort(c.life)).toBeGreaterThan(0);
    const a = act(plain, 'pose').state;
    const b = act(c, 'pose').state;
    expect(b.life.needs.hygiene).toBeGreaterThan(a.life.needs.hygiene);
    expect(b.life.needs.social).toBeGreaterThan(a.life.needs.social);
  });

  it('кошки: не больше трёх, имена не повторяются, с ними можно играть', () => {
    let s = hero();
    s.gold = 10000;
    expect(hasObject(s, 'cat')).toBe(false);
    for (const b of ['ginger', 'sphynx', 'maine_coon', 'persian'] as const) s = adoptCat(s, b);
    expect(s.life.cats.length).toBe(MAX_CATS);
    expect(new Set(s.life.cats.map((c) => c.name)).size).toBe(MAX_CATS);
    expect(catBlocker(s, 'black')).toBe('max');
    expect(hasObject(s, 'cat')).toBe(true);
    const played = act(s, 'play_cat').state;
    expect(played.life.needs.fun).toBeGreaterThan(s.life.needs.fun);
    // В зале кошек нет.
    expect(hasObject(inGym(10, s), 'cat')).toBe(false);
    const less = rehomeCat(s, s.life.cats[0]!.id);
    expect(less.life.cats.length).toBe(MAX_CATS - 1);
    // Кошки сохраняются при миграции.
    expect(migrateLife(structuredClone(s.life)).cats.length).toBe(MAX_CATS);
  });
});

describe('самостоятельность сима', () => {
  const full = (s: GameState): GameState => {
    for (const n of Object.keys(s.life.needs) as Array<keyof GameState['life']['needs']>) s.life.needs[n] = 95;
    return s;
  };

  it('всё хорошо — сим не стоит, а занимается бесплатным досугом', () => {
    const a = autoAction(full(hero()));
    expect(a === null).toBe(false);
    expect(a?.train ?? false).toBe(false);
    expect(a?.open).toBe(undefined);
    expect(a?.cost ?? 0).toBe(0);
    expect(a?.sleep ?? false).toBe(false);
  });

  it('досуг не повторяется по кругу: недавние дела сим выбирает неохотно', () => {
    const s = full(hero());
    s.gold = 1e5;
    for (const id of ['bookshelf', 'armchair', 'piano', 'easel', 'smart_speaker', 'console'] as const) Object.assign(s, buyFurniture(s, id));
    const recent: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = autoAction(s, recent)!;
      expect(a === null).toBe(false);
      recent.push(a.id);
    }
    // Подряд одно и то же не делает, за 12 дел — хотя бы 4 разных.
    for (let i = 1; i < recent.length; i += 1) expect(recent[i] === recent[i - 1]).toBe(false);
    expect(new Set(recent).size).toBeGreaterThanOrEqual(4);
  });

  it('долгая жизнь без игрока: не зацикливается, не тратит все деньги, держит потребности', () => {
    let s = hero();
    s.gold = 2000;
    s = adoptCat(s, 'ginger');
    for (const id of ['bookshelf', 'smart_speaker', 'computer', 'easel'] as const) s = buyFurniture(s, id);
    // Деньги приносят только занятия (их сим сам не проводит) — запас на продукты и корм.
    s.gold = 1500;
    const start = s.gold;
    const recent: string[] = [];
    const count = new Map<string, number>();
    let minGold = s.gold;
    let low = 0;
    const cheapSpend = new Set<string>();
    for (let i = 0; i < 600 && recent.length < 400; i += 1) {
      if (s.life.event) {
        s = answerEvent(s, lifeEventById(s.life.event.id)!.choices.find((c) => !c.cost)!.id);
        continue;
      }
      const a = autoAction(s, recent);
      if (!a) break;
      const before = s.gold;
      s = act(s, a.id).state;
      if (before < AUTO_RESERVE && s.gold < before) cheapSpend.add(a.id);
      recent.push(a.id);
      count.set(a.id, (count.get(a.id) ?? 0) + 1);
      minGold = Math.min(minGold, s.gold);
      if (Object.values(s.life.needs).some((v) => v < 10)) low += 1;
    }
    expect(recent.length).toBe(400);
    // Ни одно дело не занимает больше четверти времени.
    for (const [, n] of count) expect(n).toBeLessThan(100);
    expect(count.size).toBeGreaterThanOrEqual(8);
    // Деньги приносят только занятия, которые сим сам не проводит: ниже запаса он тратит
    // только на самое нужное (продукты, еду, корм) и не уходит в минус.
    expect(minGold).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThan(0);
    for (const id of cheapSpend) expect(['groceries', 'order', 'fill_bowl']).toContain(id);
    // Кошка сыта, лоток не зарос: сим сам насыпает корм и убирает.
    expect(count.get('fill_bowl') ?? 0).toBeGreaterThan(0);
    expect(count.get('clean_litter') ?? 0).toBeGreaterThan(0);
    expect(low).toBeLessThan(40);
  });

  it('в зале без срочных дел — болтает с учениками, а не стоит', () => {
    const s = full(inGym(12));
    expect(autoAction(s)?.id).toBe('chat_clients');
  });

  it('голоден — ест из холодильника или готовит', () => {
    const s = full(hero());
    s.life.needs.food = 15;
    expect(['snack', 'cook', 'cook_fit']).toContain(autoAction(s)?.id);
  });

  it('без продуктов и голоден — заказывает продукты или еду', () => {
    const s = full(hero());
    s.life.groceries = 0;
    s.life.needs.food = 20;
    expect(['groceries', 'order']).toContain(autoAction(s)?.id);
  });

  it('ночью уставший ложится спать', () => {
    const s = full(hero());
    s.life.minute = 23 * 60;
    s.life.needs.energy = 30;
    expect(autoAction(s)?.id).toBe('sleep');
  });

  it('грязный — в душ', () => {
    const s = full(hero());
    s.life.needs.hygiene = 10;
    expect(autoAction(s)?.id).toBe('shower');
  });

  it('поздно или нет сил в зале — едет домой; камерных занятий сам не начинает', () => {
    const late = full(inGym(23));
    expect(autoAction(late)?.id).toBe('go_home');
    const tired = full(inGym(12));
    tired.life.needs.energy = 15;
    expect(autoAction(tired)?.id).toBe('go_home');
    const fine = full(inGym(12));
    const a = autoAction(fine);
    expect(a?.train ?? false).toBe(false);
    expect(a?.open).toBe(undefined);
  });

  it('между делами сим берёт только срочное (голод, пустая миска, поздно в зале), досуг — помечен', () => {
    const s = full(hero());
    const fun = autoChoice(s);
    expect(fun?.leisure).toBe(true);
    expect(autoChoice(s, [], true)).toBe(null);
    // Слегка проголодался — подождёт, сильно — ест сразу.
    s.life.needs.food = 60;
    expect(autoChoice(s, [], true)).toBe(null);
    s.life.needs.food = 15;
    const need = autoChoice(s, [], true);
    expect(need?.leisure).toBe(false);
    expect(['snack', 'cook', 'cook_fit']).toContain(need?.action.id);
    expect(autoChoice(full(inGym(23)), [], true)?.action.id).toBe('go_home');
    const cat = full(adoptCat(Object.assign(hero(), { gold: 500 }), 'ginger'));
    cat.life.bowl = 0;
    expect(autoChoice(cat, [], true)?.action.id).toBe('fill_bowl');
  });

  it('при событии сим ждёт решения игрока', () => {
    const s = hero();
    s.life.needs.food = 5;
    s.life.event = { id: 'blogger' };
    expect(autoAction(s)).toBe(null);
  });
});

describe('раскладка дома', () => {
  it('к предметам можно подойти: места использования не внутри препятствий (столик у дивана — препятствие)', () => {
    const b = bounds('home');
    const placed = homeLayout(FURNITURE, true);
    const obstacles = homeObstacles();
    for (const p of placed) {
      const r = resolve(p.use, b, obstacles);
      expect(Math.hypot(r.x - p.use.x, r.z - p.use.z)).toBeLessThan(0.01);
    }
    const sofa = placed.find((p) => p.id === 'sofa')!;
    const all = [...placed.map((p) => p.box).filter((x) => x !== null), ...obstacles];
    const r = resolve(sofa.use, b, all);
    expect(Math.hypot(r.x - sofa.use.x, r.z - sofa.use.z)).toBeLessThan(0.01);
    // Столик перед диваном не пропускает героя.
    const table = resolve({ x: 0.4, z: 0.25 }, b, obstacles);
    expect(Math.hypot(table.x - 0.4, table.z - 0.25)).toBeGreaterThan(0.3);
  });

  it('герой обходит мебель по пути к предмету (как в сцене: шаг, упёрся — обход)', () => {
    const b = bounds('home');
    const placed = homeLayout(['armchair', 'big_tv', 'bookshelf', 'computer'], true);
    const boxes: Box[] = [...placed.map((p) => p.box).filter((x): x is Box => x !== null), ...homeObstacles()];
    const walk = (from: P2, to: P2): boolean => {
      let pos = { ...from };
      let via: P2 | null = null;
      let detours = 0;
      for (let i = 0; i < 2000; i += 1) {
        const aim = via ?? to;
        const d = Math.hypot(aim.x - pos.x, aim.z - pos.z);
        if (d < (via ? 0.2 : 0.25)) {
          if (!via) return true;
          via = null;
          continue;
        }
        const step = Math.min(0.05, d);
        const next = resolve({ x: pos.x + ((aim.x - pos.x) / d) * step, z: pos.z + ((aim.z - pos.z) / d) * step }, b, boxes);
        if (Math.hypot(next.x - pos.x, next.z - pos.z) < step * 0.2) {
          const alt = detours < 6 ? detourPoint(pos, to, b, boxes) : null;
          if (!alt) return false;
          via = alt;
          detours += 1;
        }
        pos = next;
      }
      return false;
    };
    const sofa = placed.find((p) => p.id === 'sofa')!;
    // Из кухни, от кровати, от двери и из-за телевизора — к дивану сбоку от столика.
    for (const from of [{ x: 5, z: -3 }, { x: -4, z: -2.5 }, { x: -6, z: 4 }, { x: 0.4, z: -0.7 }, { x: 3, z: 3 }]) expect(walk(from, sofa.use)).toBe(true);
  });

  it('место у мебели: свободная точка рядом, куда герой подходит и откуда уходит шагом', () => {
    const b = bounds('home');
    const placed = homeLayout(['computer'], true);
    const boxes: Box[] = [...placed.map((p) => p.box).filter((x): x is Box => x !== null), ...homeObstacles()];
    const sofa = placed.find((p) => p.id === 'sofa')!;
    const bed = placed.find((p) => p.id === 'bed')!;
    // Место сидя на диване — у самого сиденья (вплотную подойти нельзя), свободная точка — на пути к месту использования.
    const seat = { x: sofa.pos.x, z: sofa.pos.z - 0.45 };
    expect(blocked(seat, boxes, 0)).toBe(true);
    const free = freeSpot(seat, sofa.use, b, boxes);
    const r = resolve(free, b, boxes);
    expect(Math.hypot(r.x - free.x, r.z - free.z)).toBeLessThan(1e-6);
    expect(Math.hypot(free.x - sofa.use.x, free.z - sofa.use.z)).toBeLessThan(Math.hypot(seat.x - sofa.use.x, seat.z - sofa.use.z) + 1e-6);
    // Из кровати — к краю, а не к дальнему месту использования.
    const inBed = { x: bed.pos.x, z: bed.pos.z + 0.95 };
    const edge = freeSpot(inBed, bed.use, b, boxes);
    expect(Math.hypot(edge.x - inBed.x, edge.z - inBed.z)).toBeLessThan(Math.hypot(bed.use.x - inBed.x, bed.use.z - inBed.z));
    expect(blocked(edge, boxes, 0.29)).toBe(false);
    // Свободная точка — сама точка.
    expect(freeSpot(sofa.use, seat, b, boxes)).toEqual(sofa.use);
  });

  it('стик: неполный наклон — шаг, до упора — бег трусцой; скорость растёт без скачков', () => {
    expect(stickSpeed(0)).toBe(0);
    expect(stickSpeed(0.04)).toBe(0);
    expect(stickSpeed(0.5)).toBeLessThan(WALK_SPEED);
    expect(stickSpeed(STICK_WALK)).toBeCloseTo(WALK_SPEED, 6);
    expect(stickSpeed(1)).toBeCloseTo(RUN_SPEED, 6);
    expect(stickSpeed(1.5)).toBeCloseTo(RUN_SPEED, 6);
    let prev = stickSpeed(0.06);
    for (let m = 0.07; m <= 1; m += 0.01) {
      const v = stickSpeed(m);
      expect(v).toBeGreaterThan(prev);
      expect(v - prev).toBeLessThan(0.1);
      prev = v;
    }
  });
});

describe('жизнь кошек', () => {
  const withCat = (): GameState => {
    const s = hero();
    s.gold = 5000;
    return adoptCat(s, 'british');
  };

  it('миски и лоток — только когда есть кошка, не занимают платных мест', () => {
    const s = hero();
    expect(hasObject(s, 'cat_bowl')).toBe(false);
    expect(hasObject(s, 'litter')).toBe(false);
    const c = withCat();
    expect(hasObject(c, 'cat_bowl')).toBe(true);
    expect(hasObject(c, 'litter')).toBe(true);
    expect(c.life.bowl).toBe(BOWL_MAX);
    expect(c.life.litter).toBe(0);
    const placed = homeLayout(c.life.furniture, true);
    expect(placed.some((p) => p.id === 'cat_bowl')).toBe(true);
    expect(placed.some((p) => p.id === 'litter')).toBe(true);
    expect(homeLayout([]).some((p) => p.id === 'cat_bowl')).toBe(false);
    // Не мешают мебели: миска и лоток не пересекаются с местами у стен и предметами.
    const all = homeLayout(FURNITURE, true);
    const pets = all.filter((p) => p.id === 'cat_bowl' || p.id === 'litter');
    for (const p of pets)
      for (const q of all) {
        if (q === p || !q.box || !p.box) continue;
        const overlap = p.box.x0 < q.box.x1 && q.box.x0 < p.box.x1 && p.box.z0 < q.box.z1 && q.box.z0 < p.box.z1;
        expect(overlap).toBe(false);
      }
  });

  it('со временем кошка голодает и ест из миски, ходит в лоток — он пачкается', () => {
    let s = withCat();
    // Утренние события останавливают время — для проверки их пропускаем.
    const tv = (x: GameState): GameState => {
      const y = act(x, 'tv').state;
      y.life.event = null;
      return y;
    };
    for (let i = 0; i < 8; i += 1) s = tv(s);
    const cat = s.life.cats[0]!;
    expect(s.life.bowl).toBeLessThan(BOWL_MAX);
    expect(s.life.litter).toBeGreaterThan(0);
    expect(cat.play).toBeLessThan(70);
    // Миска пустеет — кошка голодает.
    s.life.bowl = 0;
    for (let i = 0; i < 16; i += 1) s = tv(s);
    expect(s.life.cats[0]!.fed).toBeLessThan(20);
    expect(catMood(s.life.cats[0]!, s.life)).toBeLessThan(70);
    // Насыпать корм — платно, и кошка снова ест.
    const gold = s.gold;
    s = act(s, 'fill_bowl').state;
    expect(s.gold).toBe(gold - actionById('fill_bowl')!.cost!);
    s = tv(s);
    expect(s.life.cats[0]!.fed).toBeGreaterThan(40);
    // Полную миску не наполнить.
    s.life.bowl = BOWL_MAX;
    expect(blocker(s, actionById('fill_bowl')!)).toBe('enough');
  });

  it('грязный лоток: хуже гигиена дома, уют и настроение кошки; уборка всё исправляет', () => {
    const clean = withCat();
    const dirty = structuredClone(clean);
    dirty.life.litter = LITTER_DIRTY + 20;
    expect(litterDirty(dirty.life)).toBe(true);
    expect(comfort(dirty.life)).toBeLessThan(comfort(clean.life));
    expect(catMood(dirty.life.cats[0]!, dirty.life)).toBeLessThan(catMood(clean.life.cats[0]!, clean.life));
    const a = act(clean, 'tv').state;
    const b = act(dirty, 'tv').state;
    expect(b.life.needs.hygiene).toBeLessThan(a.life.needs.hygiene);
    const done = act(b, 'clean_litter').state;
    expect(done.life.litter).toBe(0);
    expect(blocker(done, actionById('clean_litter')!)).toBe('enough');
    // Переполненный лоток — кошка не идёт туда, дома ещё грязнее.
    const full = structuredClone(clean);
    full.life.litter = 100;
    full.life.cats[0]!.toilet = 36;
    const after = act(full, 'tv').state;
    expect(after.life.litter).toBe(100);
    expect(after.life.needs.hygiene).toBeLessThan(a.life.needs.hygiene);
  });

  it('игра и ласка поднимают потребность той кошки, которой это нужнее', () => {
    let s = withCat();
    s = adoptCat(s, 'black');
    s.life.cats[0]!.play = 80;
    s.life.cats[1]!.play = 10;
    const after = act(s, 'play_cat').state;
    expect(after.life.cats[1]!.play).toBeGreaterThan(40);
    expect(after.life.cats[0]!.play).toBeLessThanOrEqual(80);
  });

  it('сим сам насыпает корм в пустую миску и убирает грязный лоток', () => {
    const s = withCat();
    for (const n of Object.keys(s.life.needs) as Array<keyof GameState['life']['needs']>) s.life.needs[n] = 90;
    s.life.bowl = 0;
    expect(autoAction(s)?.id).toBe('fill_bowl');
    s.life.bowl = BOWL_MAX;
    s.life.litter = 90;
    expect(autoAction(s)?.id).toBe('clean_litter');
  });

  it('кошки пьют: вода в миске убывает, без воды им хуже; сим наливает её вместе с кормом', () => {
    let s = withCat();
    expect(s.life.water).toBe(100);
    for (let i = 0; i < 4; i += 1) {
      s = act(s, 'tv').state;
      s.life.event = null;
    }
    expect(s.life.water).toBeLessThan(100);
    const mood = catMood(s.life.cats[0]!, s.life);
    s.life.water = 0;
    expect(catMood(s.life.cats[0]!, s.life)).toBeLessThan(mood);
    for (const n of Object.keys(s.life.needs) as Array<keyof GameState['life']['needs']>) s.life.needs[n] = 90;
    s.life.bowl = BOWL_MAX;
    expect(blocker(s, actionById('fill_bowl')!)).toBe(null);
    expect(autoAction(s)?.id).toBe('fill_bowl');
    s = act(s, 'fill_bowl').state;
    expect(s.life.water).toBe(100);
    expect(blocker(s, actionById('fill_bowl')!)).toBe('enough');
  });

  it('потребности кошек сохраняются, старые сохранения получают значения по умолчанию', () => {
    const s = withCat();
    s.life.cats[0]!.fed = 33;
    s.life.litter = 44;
    const m = migrateLife(structuredClone(s.life));
    expect(m.cats[0]!.fed).toBe(33);
    expect(m.litter).toBe(44);
    const old = { cats: [{ id: 'cat1', breed: 'ginger', name: 0, adopted: 1 }] };
    const o = migrateLife(old as never);
    expect(o.cats[0]!.fed).toBe(80);
    expect(o.cats[0]!.toilet).toBe(90);
    expect(o.bowl).toBe(BOWL_MAX);
    expect(o.water).toBe(100);
    expect(o.litter).toBe(0);
    expect(migrateLife({} as never).water).toBe(0);
  });
});

describe('фигура и сохранения', () => {
  it('тренировки перед камерой сжигают лишний вес и меняют фигуру', () => {
    let s = hero();
    s.life.fat = 0.5;
    const before = effectiveAppearance(s.character.appearance, s);
    for (let i = 0; i < 300; i += 1) s = applyRep(s, { exercise: 'squat', quality: 90 }, now).state;
    expect(s.life.fat).toBeLessThan(0.5);
    for (const k of ['strength', 'core'] as const) s.statXp[k] = xpForLevel(8);
    const after = effectiveAppearance(s.character.appearance, s);
    expect(after.body?.muscle ?? 0).toBeGreaterThan(before.body?.muscle ?? 0);
    expect(after.body?.weight ?? 0).toBeLessThan(before.body?.weight ?? 0);
  });

  it('сохранение города переходит в жизнь тренера', () => {
    const old = { day: 5, minute: 600, scene: 'city', home: 'loft', job: { id: 'barista', level: 1 }, people: {}, furniture: ['console', 'tv_stand'], needs: { food: 40 } };
    const m = migrateLife(old as never);
    expect(m.scene).toBe('home');
    expect(m.day).toBe(5);
    expect(m.furniture).toEqual(['console']);
    expect(m.clients.length).toBe(1);
    expect(m.needs.food).toBe(40);
  });

  it('старое сохранение RPG получает жизнь, история удаляется, неизвестные вещи пропадают', () => {
    const s = hero() as GameState & { story?: unknown };
    const old = { ...s, story: { started: true }, inventory: ['no_such_item'], equipped: { weapon: 'no_such_item' } } as unknown as GameState;
    delete (old as Partial<GameState>).life;
    const m = migrate(old) as GameState & { story?: unknown };
    expect(m.story).toBe(undefined);
    expect(m.life.day).toBe(1);
    expect(m.inventory).toEqual([]);
    expect(m.equipped).toEqual({});
  });
});

describe('деньги только с занятий, жильё и удобства зала', () => {
  it('ничто, кроме занятий, не приносит денег: события, действия, достижения, задания, продажа вещей', () => {
    for (const a of ACTIONS) expect(a.effect.money ?? 0).toBeLessThanOrEqual(0);
    for (const e of LIFE_EVENTS) for (const c of e.choices) expect(c.effect.money ?? 0).toBeLessThanOrEqual(0);
    // Продажа мебели ничего не возвращает.
    let s = hero();
    s.gold = 1000;
    s = buyFurniture(s, 'bookshelf');
    const g = s.gold;
    expect(sellFurniture(s, 'bookshelf').gold).toBe(g);
    // Повторы перед камерой (квесты, задания, достижения) дают опыт, но не деньги.
    let r = ensureDay(hero(), now).state;
    const g0 = r.gold;
    for (let i = 0; i < 300; i += 1) r = applyRep(r, { exercise: i % 2 ? 'squat' : 'pushup', quality: 95 }, now).state;
    expect(r.gold).toBe(g0);
    expect(r.totalXp).toBeGreaterThan(0);
  });

  it('оплата занятия растёт с числом учеников, их атлетичностью, размером и комфортом зала', () => {
    const s = inGym(10);
    const heavy = { ...s.life.clients[0]!, fat: 1, muscle: -0.6 };
    const fit = { ...heavy, id: 'cX', fat: -0.3, muscle: 0.7 };
    expect(clientFee(s, fit)).toBeGreaterThan(clientFee(s, heavy) * 2);
    expect(sessionPay(s, [heavy, heavy])).toBe(2 * clientFee(s, heavy));
    const big = structuredClone(s);
    big.life.gym = 3;
    expect(fee(big)).toBeGreaterThan(fee(s));
    const cosy = structuredClone(s);
    cosy.gold = 1e5;
    const before = fee(cosy);
    const c2 = buyExtra(buyExtra(cosy, 'gym_cooler'), 'gym_music');
    expect(gymComfort(c2.life)).toBe(gymComfort(cosy.life) + 3);
    expect(fee(c2)).toBeGreaterThan(before);
    // Удобства по ступени зала.
    expect(extraBlocker(cosy, 'gym_sauna')).toBe('gym');
    expect(extraBlocker(c2, 'gym_cooler')).toBe('owned');
    // Оплата приходит после занятия.
    let run = startSession(s, 'squat');
    const target = run.life.session!.target;
    const expected = sessionPay(run);
    const g = run.gold;
    for (let i = 0; i < target; i += 1) run = applyRep(run, { exercise: 'squat', quality: 90 }, now).state;
    // За занятие тренер может подрасти в уровне — тогда ставка уже новая.
    expect(run.gold - g).toBeGreaterThanOrEqual(expected);
  });

  it('на первом уровне один максимально полный ученик; с уровнем новички спортивнее', () => {
    expect(makeClient(1, 1, 1).fat).toBe(1);
    let prev = 2;
    for (const level of [1, 3, 5, 7, 9, 11, 13]) {
      let sum = 0;
      for (let i = 1; i <= 20; i += 1) sum += makeClient(i, level, 1).fat;
      expect(sum / 20).toBeLessThan(prev);
      prev = sum / 20;
    }
  });

  it('жильё расширяется: нужен уровень и деньги, больше мест, уюта и кошек; вещи на месте', () => {
    let s = hero();
    s.gold = 1e5;
    expect(houseBlocker(s)).toBe('level');
    s = withLevel(s, 4);
    expect(houseBlocker(s)).toBe(null);
    for (const id of FURNITURE.filter((x) => mountOf(x) === 'slot').slice(0, slotsFor('slot', 0))) s = buyFurniture(s, id);
    const extra = FURNITURE.find((x) => mountOf(x) === 'slot' && !s.life.furniture.includes(x))!;
    expect(furnitureBlocker(s, extra)).toBe('space');
    const comfortBefore = comfort(s.life);
    const up = upgradeHouse(s);
    expect(up.life.house).toBe(1);
    expect(up.gold).toBe(s.gold - HOUSES[1]!.cost);
    expect(furnitureBlocker(up, extra)).toBe(null);
    expect(comfort(up.life)).toBeGreaterThan(comfortBefore);
    expect(maxCats(up.life)).toBeGreaterThan(maxCats(s.life));
    // Вся мебель и предметы помещаются в каждом доме и лежат в его границах.
    for (let tier = 0; tier < HOUSES.length; tier += 1) {
      const b = bounds('home', tier);
      const placed = homeLayout(FURNITURE, true, tier);
      for (const p of placed) {
        expect(p.pos.x).toBeGreaterThanOrEqual(b.x0 - 0.5);
        expect(p.pos.x).toBeLessThanOrEqual(b.x1 + 0.5);
        expect(p.pos.z).toBeGreaterThanOrEqual(b.z0 - 0.5);
        expect(p.pos.z).toBeLessThanOrEqual(b.z1 + 0.5);
      }
      const used = placed.filter((p) => FURNITURE.includes(p.id) && mountOf(p.id) === 'slot').length;
      expect(used).toBe(Math.min(slotsFor('slot', tier), FURNITURE.filter((x) => mountOf(x) === 'slot').length));
      // Места не налезают друг на друга.
      const boxes = placed.map((p) => p.box).filter((x): x is NonNullable<typeof x> => x !== null);
      for (let i = 0; i < boxes.length; i += 1)
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const c = boxes[j]!;
          const overlap = a.x0 < c.x1 - 0.01 && c.x0 < a.x1 - 0.01 && a.z0 < c.z1 - 0.01 && c.z0 < a.z1 - 0.01;
          expect(overlap).toBe(false);
        }
      const sp = spawn('home', tier);
      expect(sp.x).toBeGreaterThanOrEqual(b.x0);
    }
    // Старое сохранение — начальная квартира, без удобств зала.
    const m = migrateLife({ day: 3 } as never);
    expect(m.house).toBe(0);
    expect(m.gymExtras).toEqual([]);
  });
});
