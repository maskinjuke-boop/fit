import { describe, expect, it } from 'vitest';
import { adminAddCats, build, buildBlocker, burn, cityNewRealDay, clearAsh, demolish, makeOffering, tileAt } from '../src/game/city/city';
import { BUILDINGS, CAT_ITEMS, DAY_MIN, HOUSE_LEVELS, OFFERING_SIZE, PROFESSIONS, TOWNS, WORKSHOP_LEVELS, buildingById } from '../src/game/city/content';
import { amenityBonus, freeBeds, hourOf, productivity, residents, stepCity, townLevel, workers } from '../src/game/city/sim';
import { roadPath } from '../src/game/city/spots';
import { applyRep, ensureDay, newGameState } from '../src/game/engine';
import { createState, migrate, type GameState } from '../src/game/state';

const DAY = new Date('2026-11-20T10:00:00');
const fresh = (): GameState => newGameState({ name: 'Мурлыкино', hasBar: false, fitness: 'beginner' }, DAY, (c) => createState(c, DAY.getTime()));

describe('содержимое города', () => {
  it('у каждой профессии своя мастерская, тексты на двух языках, цены положительные', () => {
    for (const p of PROFESSIONS) {
      const w = buildingById(p.workshop);
      expect(w.kind).toBe('workshop');
      expect(w.profession).toBe(p.id);
      expect(p.name.ru && p.name.en && p.doing.ru && p.doing.en).toBeTruthy();
    }
    for (const b of BUILDINGS) {
      expect(b.name.ru && b.name.en && b.desc.ru && b.desc.en).toBeTruthy();
      if (b.kind !== 'temple' && b.kind !== 'ash') expect(b.cost).toBeGreaterThan(0);
    }
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
    for (const i of CAT_ITEMS) expect(i.price).toBeGreaterThan(0);
  });
});

describe('новый город', () => {
  it('храм, домик с кошкой-пекарем, пекарня, сквер; подношение на сегодня', () => {
    const s = fresh();
    const c = s.city;
    expect(c.buildings.map((b) => b.type).sort()).toEqual(['bakery', 'garden', 'house', 'temple']);
    expect(c.cats.length).toBe(1);
    const k = c.cats[0]!;
    expect(k.profession).toBe('baker');
    expect(k.work).toBe(c.buildings.find((b) => b.type === 'bakery')!.id);
    expect(c.offering?.day).toBe(s.today);
    expect(c.offering?.tasks.length).toBe(OFFERING_SIZE);
    expect(s.gold).toBeGreaterThan(0);
  });
});

describe('жизнь кошек', () => {
  it('сутки по распорядку: ночью спит, днём работает и зарабатывает, сыта и бодра', () => {
    const s = fresh();
    const c = s.city;
    const k = c.cats[0]!;
    const seen = new Set<string>();
    for (let m = 0; m < DAY_MIN * 2; m += 1) {
      stepCity(c, 1);
      if (!k.act.path) seen.add(`${Math.floor(hourOf(c.clock))}:${k.act.kind}`);
    }
    expect([...seen].some((x) => x.endsWith(':work') && +x.split(':')[0]! >= 9 && +x.split(':')[0]! < 16)).toBe(true);
    expect([...seen].some((x) => x.endsWith(':sleep') && (+x.split(':')[0]! >= 23 || +x.split(':')[0]! < 6))).toBe(true);
    expect(k.earned).toBeGreaterThan(60);
    expect(k.needs.food).toBeGreaterThan(10);
    expect(k.needs.energy).toBeGreaterThan(10);
    // Копилка мастерской растёт от заработка.
    expect(c.buildings.find((b) => b.type === 'bakery')!.fund).toBeGreaterThan(5);
  });

  it('в пустой дом приезжает кошка; профессия — где есть место; без мастерской — ищет работу', () => {
    let s = fresh();
    s.gold = 1000;
    s = build(s, 'house', 1, 1);
    expect(freeBeds(s.city)).toBe(1);
    stepCity(s.city, 120);
    expect(s.city.cats.length).toBe(2);
    const k = s.city.cats[1]!;
    // В пекарне 2 места — вторая кошка тоже пекарь.
    expect(k.profession).toBe('baker');
    expect(k.work).not.toBe(null);
    expect(residents(s.city, tileAt(s.city, 1, 1)!).length).toBe(1);
    // Пекарня полна: третья кошка — другой профессии, без работы, пока нет её мастерской.
    s = build(s, 'house', -1, 1);
    stepCity(s.city, 120);
    const third = s.city.cats[2]!;
    expect(third.work).toBe(null);
    const shop = PROFESSIONS.find((p) => p.id === third.profession)!.workshop;
    s.city.town = 3;
    s = build(s, shop, 2, 0);
    expect(s.city.cats[2]!.work).toBe(tileAt(s.city, 2, 0)!.id);
  });

  it('кошки улучшают дома и мастерские на свои деньги, покупают вещи на рынке', () => {
    let s = fresh();
    s.gold = 5000;
    s.city.town = 2;
    s = build(s, 'market', 1, 1);
    const c = s.city;
    const k = c.cats[0]!;
    k.money = HOUSE_LEVELS[0]!.upgrade + 400;
    c.buildings.find((b) => b.type === 'bakery')!.fund = WORKSHOP_LEVELS[0]!.upgrade - 1;
    for (let m = 0; m < DAY_MIN * 2; m += 1) stepCity(c, 1);
    const home = c.buildings.find((b) => b.kind === 'house')!;
    expect(home.level).toBeGreaterThanOrEqual(2);
    expect(c.buildings.find((b) => b.type === 'bakery')!.level).toBe(2);
    expect(k.items.length).toBeGreaterThan(0);
    expect(c.news.some((n) => n.kind === 'upgradeHome')).toBe(true);
  });

  it('настроение: благоустройство рядом и вещи поднимают, выработка растёт с настроением', () => {
    const s = fresh();
    const c = s.city;
    const k = c.cats[0]!;
    const home = c.buildings.find((b) => b.kind === 'house')!;
    expect(amenityBonus(c, home.gx, home.gz)).toBeGreaterThan(0);
    k.mood = 20;
    const low = productivity(c, k);
    k.mood = 90;
    expect(productivity(c, k)).toBeGreaterThan(low);
  });

  it('дорожки: путь идёт по границам клеток и кончается в цели', () => {
    const p = roadPath([-4, 1], [8, 9.5]);
    expect(p[p.length - 1]).toEqual([8, 9.5]);
    for (const [x, z] of p.slice(0, -1)) {
      const onRow = Math.abs(((z - 2) % 4) + 4) % 4 < 1e-6;
      const onCol = Math.abs(((x - 2) % 4) + 4) % 4 < 1e-6;
      expect(onRow || onCol).toBe(true);
    }
  });

  it('поселение растёт с числом жителей и открывает клетки', () => {
    let s = fresh();
    expect(buildBlocker(s, 'house', 3, 0)).toBe('locked');
    s = adminAddCats(s, TOWNS[1]!.pop);
    stepCity(s.city, 5);
    expect(townLevel(s.city)).toBeGreaterThanOrEqual(1);
    s.gold = 1000;
    expect(buildBlocker(s, 'house', 3, 0)).not.toBe('locked');
  });
});

describe('стройка', () => {
  it('нужны деньги, свободная клетка и ступень поселения; снос и расчистка', () => {
    let s = fresh();
    s.gold = 0;
    expect(buildBlocker(s, 'house', 1, 1)).toBe('money');
    s.gold = 500;
    expect(buildBlocker(s, 'house', 0, 0)).toBe('busy');
    expect(buildBlocker(s, 'cinema', 1, 1)).toBe('town');
    s = build(s, 'playground', 1, 1);
    expect(s.gold).toBe(500 - buildingById('playground').cost);
    const pg = tileAt(s.city, 1, 1)!;
    s = demolish(s, pg.id);
    expect(tileAt(s.city, 1, 1)).toBe(undefined);
    // Жилой дом с кошкой не снести.
    const home = s.city.buildings.find((b) => b.kind === 'house')!;
    expect(demolish(s, home.id)).toBe(s);
  });
});

describe('подношение богам', () => {
  it('упражнения засчитываются, за всё — награда и благословение', () => {
    let s = fresh();
    const o = s.city.offering!;
    const gold = s.gold;
    let done = false;
    for (const t of o.tasks)
      for (let i = 0; i < t.target; i += 1) {
        const r = applyRep(s, { exercise: t.exercise, quality: 90 }, DAY);
        s = r.state;
        if (r.events.some((e) => e.kind === 'offeringDone')) done = true;
      }
    expect(done).toBe(true);
    expect(s.city.offering!.complete).toBe(true);
    expect(s.gold).toBeGreaterThan(gold + o.tasks.reduce((a, t) => a + t.target, 0));
  });

  it('нет подношения до полуночи — сгорает часть домов вместе с жителями, остаётся пепел', () => {
    let s = fresh();
    s = adminAddCats(s, 5);
    stepCity(s.city, 5);
    const houses = s.city.buildings.filter((b) => b.kind === 'house').length;
    const cats = s.city.cats.length;
    s.city.graceDay = '2000-01-01';
    const next = ensureDay(s, new Date('2026-11-21T09:00:00'));
    const fire = next.events.find((e) => e.kind === 'cityFire');
    expect(fire).toBeTruthy();
    const ash = next.state.city.buildings.filter((b) => b.kind === 'ash');
    expect(ash.length).toBe(Math.max(1, Math.round(houses / 3)));
    expect(next.state.city.cats.length).toBeLessThan(cats);
    expect(next.state.city.offering!.day).toBe('2026-11-21');
    // Пепел расчищается за деньги.
    const st = { ...next.state, gold: 100 };
    expect(clearAsh(st, ash[0]!.id).city.buildings.some((b) => b.id === ash[0]!.id)).toBe(false);
  });

  it('в день основания пожара нет; сделанное подношение спасает', () => {
    const s = fresh();
    expect(ensureDay(s, new Date('2026-11-21T09:00:00')).events.some((e) => e.kind === 'cityFire')).toBe(false);
    const s2 = structuredClone(s);
    s2.city.graceDay = '2000-01-01';
    s2.city.offering!.complete = true;
    expect(ensureDay(s2, new Date('2026-11-21T09:00:00')).events.some((e) => e.kind === 'cityFire')).toBe(false);
    const r = cityNewRealDay(structuredClone(s2), '2026-11-20', '2026-11-25');
    expect(r.houses).toBeGreaterThan(0);
  });

  it('повторов больше с ростом поселения', () => {
    const s = fresh();
    const a = makeOffering(s.city, '2026-11-22', 'x');
    const big = adminAddCats(s, 12);
    const b = makeOffering(big.city, '2026-11-22', 'x');
    expect(b.tasks.reduce((x, t) => x + t.target, 0)).toBeGreaterThan(a.tasks.reduce((x, t) => x + t.target, 0));
    void burn;
    void workers;
  });
});

describe('сохранение', () => {
  it('старое сохранение (кафе, герой) — новый город, деньги остаются', () => {
    const old = { version: 1, character: { id: 'x', name: 'Вера', hasBar: true, fitness: 'advanced', createdDay: '2026-11-01', archetype: 'guardian' }, gold: 321, days: {}, lifetimeReps: { squat: 10 }, today: '2026-11-19', life: { cats: [] }, quests: {} } as unknown as GameState;
    const m = migrate(old);
    expect(m.gold).toBe(321);
    expect(m.city.buildings.some((b) => b.kind === 'temple')).toBe(true);
    expect(m.character.hasBar).toBe(true);
    expect('quests' in m).toBe(false);
    // Город переживает сохранение и загрузку.
    const again = migrate(JSON.parse(JSON.stringify(fresh())) as GameState);
    expect(again.city.cats.length).toBe(1);
  });
});
