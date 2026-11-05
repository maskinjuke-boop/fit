import { describe, expect, it } from 'vitest';
import { applyRep, newCharacterState } from '../src/game/engine';
import { xpForLevel } from '../src/game/levels';
import {
  act,
  answerEvent,
  applyJob,
  blocker,
  buyFurniture,
  effectiveAppearance,
  fitness,
  furnitureBlocker,
  looks,
  meetsLevel,
  moveHome,
  personAct,
  personBlocker,
  personPlace,
  peopleAt,
  skillLevel,
  sleepMinutes,
} from '../src/game/life';
import { ACTIONS, FURNITURE, HOMES, HOME_IDS, JOBS, JOB_IDS, LIFE_EVENTS, LOCATIONS, LOCATION_IDS, OBJECTS, PEOPLE, PERSON_ACTIONS, PERSON_IDS, actionById } from '../src/game/lifeContent';
import { homeBounds, homeLayout, spawn } from '../src/game/lifeMap';
import type { Txt } from '../src/game/lifeTypes';
import { createState, DEFAULT_APPEARANCE, migrate, type GameState } from '../src/game/state';
import { itemById } from '../src/game/items';

const now = new Date(2026, 10, 5, 10, 0, 0);

function hero(): GameState {
  return newCharacterState({ name: 'Тест', archetype: 'ranger', color: '#3ddc84', hasBar: true, fitness: 'intermediate', appearance: DEFAULT_APPEARANCE }, now, createState);
}

/** Герой в городе в заданное время. */
function inCity(s: GameState, hour: number): GameState {
  const c = structuredClone(s);
  c.life.scene = 'city';
  c.life.minute = hour * 60;
  return c;
}

const both = (x: Txt): void => {
  expect(x.ru.length).toBeGreaterThan(0);
  expect(x.en.length).toBeGreaterThan(0);
};

describe('содержимое симулятора', () => {
  it('все тексты на двух языках, id уникальны', () => {
    for (const a of ACTIONS) both(a.label);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const a of PERSON_ACTIONS) both(a.label);
    for (const id of LOCATION_IDS) both(LOCATIONS[id].name);
    for (const id of Object.keys(OBJECTS)) both(OBJECTS[id as keyof typeof OBJECTS].name);
    for (const id of JOB_IDS) for (const l of JOBS[id].levels) both(l.title);
    for (const id of PERSON_IDS) {
      const p = PEOPLE[id];
      both(p.name);
      both(p.bio);
      for (const l of p.lines) both(l);
    }
    for (const e of LIFE_EVENTS) {
      both(e.title);
      both(e.text);
      for (const c of e.choices) both(c.text);
    }
  });

  it('у каждой работы есть место со сменой; у каждого жителя есть, где его встретить', () => {
    for (const id of JOB_IDS) {
      expect(ACTIONS.some((a) => a.work && 'location' in a.at && a.at.location === JOBS[id].location)).toBe(true);
      expect(JOBS[id].shift / 60).toBeLessThanOrEqual(JOBS[id].hours[1] - JOBS[id].hours[0]);
    }
    for (const id of PERSON_IDS) expect(PEOPLE[id].schedule.length).toBeGreaterThan(0);
  });

  it('жители одеты в существующие вещи своих слотов', () => {
    for (const id of PERSON_IDS) {
      for (const [slot, item] of Object.entries(PEOPLE[id].equipped)) expect(itemById(item!)?.slot).toBe(slot);
    }
  });

  it('предметы квартиры стоят внутри комнаты, места использования — тоже', () => {
    for (const home of HOME_IDS) {
      const b = homeBounds(home);
      const placed = homeLayout(home, FURNITURE);
      expect(placed.length).toBe(7 + HOMES[home].slots);
      for (const p of placed) {
        expect(p.use.x).toBeGreaterThanOrEqual(b.x0);
        expect(p.use.x).toBeLessThanOrEqual(b.x1);
        expect(p.use.z).toBeGreaterThanOrEqual(b.z0);
        expect(p.use.z).toBeLessThanOrEqual(b.z1);
      }
      const sp = spawn('home', home);
      expect(sp.x).toBeGreaterThan(b.x0);
    }
  });
});

describe('время и потребности', () => {
  it('новый герой: утро первого дня дома, немного продуктов', () => {
    const s = hero();
    expect(s.life.day).toBe(1);
    expect(s.life.scene).toBe('home');
    expect(s.life.groceries).toBeGreaterThan(0);
  });

  it('сон — до 7 утра следующего дня, энергия восстанавливается', () => {
    const s = hero();
    s.life.minute = 23 * 60;
    s.life.needs.energy = 10;
    const r = act(s, 'sleep').state;
    expect(r.life.day).toBe(2);
    expect(r.life.minute).toBe(7 * 60);
    expect(r.life.needs.energy).toBeGreaterThan(90);
    expect(sleepMinutes(5 * 60)).toBe(480);
  });

  it('еда из холодильника тратит продукты и утоляет голод, время идёт', () => {
    const s = hero();
    s.life.needs.food = 20;
    const r = act(s, 'cook').state;
    expect(r.life.groceries).toBe(s.life.groceries - 1);
    expect(r.life.needs.food).toBeGreaterThan(70);
    expect(r.life.minute).toBe(s.life.minute + 60);
    expect(r.life.last?.ok).toBe(true);
    s.life.groceries = 0;
    expect(blocker(s, actionById('cook')!)).toBe('groceries');
  });

  it('без сил герой засыпает и просыпается дома', () => {
    const s = inCity(hero(), 14);
    s.life.needs.energy = 2;
    const r = act(s, 'walk').state;
    expect(r.life.scene).toBe('home');
    expect(r.life.minute).toBe(7 * 60);
  });

  it('выход в город и домой; закрытые места недоступны', () => {
    const s = hero();
    const city = act(s, 'go_out').state;
    expect(city.life.scene).toBe('city');
    const night = inCity(s, 3);
    expect(blocker(night, actionById('cafe_coffee')!)).toBe('closed');
    const rich = inCity(s, 23);
    rich.gold = 100;
    expect(blocker(rich, actionById('dance')!)).toBe(null);
    rich.gold = 0;
    expect(blocker(rich, actionById('dance')!)).toBe('money');
    expect(act(city, 'go_home').state.life.scene).toBe('home');
  });

  it('аренда списывается раз в неделю, без денег — долг', () => {
    const s = hero();
    s.gold = 1000;
    s.life.rentUntil = 2;
    s.life.minute = 23 * 60;
    const r = act(s, 'sleep').state;
    expect(r.gold).toBe(1000 - HOMES.studio.rent);
    expect(r.life.rentUntil).toBe(9);
    const poor = structuredClone(s);
    poor.gold = 0;
    expect(act(poor, 'sleep').state.life.debt).toBe(HOMES.studio.rent);
  });
});

describe('работа', () => {
  it('смена платит, навык растёт, после нескольких смен — повышение', () => {
    let s = applyJob(hero(), 'barista');
    expect(s.life.job?.id).toBe('barista');
    s.life.skills.charisma = 12 * 2 * 2;
    for (let i = 0; i < JOBS.barista.promoteAfter; i += 1) {
      s = inCity(s, 8);
      s.life.needs = { food: 90, energy: 90, hygiene: 90, fun: 90, social: 90 };
      const gold = s.gold;
      s = act(s, 'work_cafe').state;
      expect(s.gold).toBeGreaterThan(gold);
    }
    expect(s.life.job?.level).toBe(1);
    expect(s.life.stats.promotions).toBe(1);
  });

  it('смена только в часы работы и на своей работе', () => {
    const s = applyJob(hero(), 'office');
    expect(blocker(inCity(s, 21), actionById('work_office')!)).toBe('closed');
    expect(blocker(inCity(s, 14), actionById('work_office')!)).toBe('hours');
    expect(blocker(inCity(s, 9), actionById('work_cafe')!)).toBe('job');
    expect(blocker(inCity(s, 9), actionById('work_office')!)).toBe(null);
  });

  it('тренером берут только с настоящей спортивной формой', () => {
    const s = hero();
    expect(meetsLevel(s, 'trainer', 0)).toBe(false);
    for (const k of ['strength', 'legs', 'core', 'endurance'] as const) s.statXp[k] = xpForLevel(3);
    expect(fitness(s)).toBe(3);
    expect(meetsLevel(s, 'trainer', 0)).toBe(true);
    expect(applyJob(s, 'trainer').life.job?.id).toBe('trainer');
  });
});

describe('отношения', () => {
  it('первый разговор — знакомство, свидание — только с близкими, потом можно встречаться', () => {
    const at = personPlace('alex', 10 * 60)!;
    expect(at).toBe('cafe');
    let s = inCity(hero(), 10);
    expect(peopleAt('cafe', 10 * 60)).toContain('alex');
    expect(personBlocker(s, 'alex', 'date', 'cafe')).toBe('aff');
    s = personAct(s, 'alex', 'talk', 'cafe').state;
    expect(s.life.people.alex !== undefined).toBe(true);
    expect(s.life.people.alex!.aff).toBe(1);
    s = inCity(s, 10);
    s.gold = 500;
    s.life.people.alex!.aff = 9;
    s.life.skills.charisma = 1200;
    s.life.needs = { food: 100, energy: 100, hygiene: 100, fun: 100, social: 100 };
    let tries = 0;
    while (!s.life.people.alex!.partner && tries < 20) {
      s = inCity(personAct(s, 'alex', 'romance', 'cafe').state, 10 + (tries % 6));
      s.life.people.alex!.aff = Math.max(8, s.life.people.alex!.aff);
      tries += 1;
    }
    expect(s.life.people.alex!.partner).toBe(true);
    expect(personBlocker(inCity(s, 10), 'alex', 'kiss', 'cafe')).toBe(null);
  });

  it('жителя нет — действие недоступно', () => {
    const s = inCity(hero(), 3);
    expect(personBlocker(s, 'alex', 'talk', 'cafe')).toBe('absent');
  });

  it('событие применяет выбор', () => {
    const s = hero();
    s.life.event = { id: 'found_money' };
    const r = answerEvent(s, 'keep');
    expect(r.life.event).toBe(null);
    expect(r.gold).toBe(s.gold + 40);
  });
});

describe('дом и тело', () => {
  it('мебель покупается, если есть место и деньги; большое жильё открывает больше', () => {
    let s = hero();
    s.gold = 5000;
    expect(furnitureBlocker(s, 'console')).toBe('home');
    s = buyFurniture(s, 'yoga_mat');
    expect(s.life.furniture).toContain('yoga_mat');
    s = moveHome(s, 'flat');
    expect(s.life.home).toBe('flat');
    expect(furnitureBlocker(s, 'console')).toBe(null);
    for (const id of FURNITURE) s = buyFurniture(s, id);
    expect(s.life.furniture.length).toBe(HOMES.flat.slots);
  });

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
    expect(looks(s)).toBeGreaterThan(0);
  });

  it('навык растёт с опытом', () => {
    expect(skillLevel(0)).toBe(0);
    expect(skillLevel(12)).toBe(1);
    expect(skillLevel(100000)).toBe(10);
  });
});

describe('сохранения', () => {
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
