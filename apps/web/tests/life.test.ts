import { describe, expect, it } from 'vitest';
import { applyRep, ensureDay, newCharacterState } from '../src/game/engine';
import { xpForLevel } from '../src/game/levels';
import {
  act,
  applyFinish,
  autoChoice,
  blocker,
  buyFurniture,
  catMood,
  comfort,
  demonTarget,
  finishBlocker,
  furnitureBlocker,
  guestDemand,
  guestsNow,
  hasObject,
  houseBlocker,
  kitBlocker,
  makeOffer,
  maxCats,
  maxFood,
  migrateLife,
  offerLeftMs,
  oldStuff,
  ticket,
  upgradeHouse,
  upgradeKit,
} from '../src/game/life';
import { ACTIONS, BOWL_MAX, CAT_BREEDS, DEMON_EXERCISES, FOOD, FURNITURE, HOUSES, LIFE_EVENTS, OBJECTS, REP_MONEY, actionById, mountOf, slotsFor } from '../src/game/lifeContent';
import { RUN_SPEED, STICK_WALK, WALK_SPEED, bounds, cafeTables, demonLayout, detourPoint, guestSpots, homeLayout, homeObstacles, resolve, spawn, stickSpeed, type Box, type P2 } from '../src/game/lifeMap';
import type { Cat, Txt } from '../src/game/lifeTypes';
import { APARTMENT_DECOR, CAFE_DECOR, DECOR_KINDS, FINISHES, OLD_KIT, finishById, kitById } from '../src/game/homeDecor';
import { itemById, renamedItem } from '../src/game/items';
import { createState, DEFAULT_APPEARANCE, migrate, type GameState } from '../src/game/state';

const now = new Date(2026, 10, 5, 10, 0, 0);
const tomorrow = new Date(2026, 10, 6, 10, 0, 0);

function hero(): GameState {
  const s = newCharacterState({ name: 'Тест', archetype: 'ranger', color: '#3ddc84', hasBar: true, fitness: 'intermediate', appearance: DEFAULT_APPEARANCE }, now, createState);
  // Постоянный id — случайности (гости, кошка дня) одинаковы от запуска к запуску.
  s.character.id = 'test-hero';
  s.life.demon = makeOffer(s, s.today);
  return s;
}

const cat = (i: number, over: Partial<Cat> = {}): Cat => ({ id: `cat${i}`, breed: CAT_BREEDS[i % CAT_BREEDS.length]!.id, name: i, adopted: 1, fed: 80, play: 70, toilet: 90, sex: i % 2 ? 'f' : 'm', born: -20, ...over });

/** Кафе с n кошками в разгар дня. */
function cafe(n = 2, hour = 13): GameState {
  const s = structuredClone(hero());
  s.life.minute = hour * 60;
  s.life.cats = Array.from({ length: n }, (_, i) => cat(i + 1));
  s.life.bowl = BOWL_MAX;
  s.life.water = 100;
  s.life.house = Math.min(HOUSES.length - 1, HOUSES.findIndex((h) => h.cats >= n));
  return s;
}

const both = (x: Txt): void => {
  expect(x.ru.length).toBeGreaterThan(0);
  expect(x.en.length).toBeGreaterThan(0);
};

/** n повторов упражнения перед камерой. */
function reps(s: GameState, exercise: Parameters<typeof applyRep>[1]['exercise'], n: number, at = now): GameState {
  let st = s;
  for (let i = 0; i < n; i += 1) st = applyRep(st, { exercise, quality: 90 }, at).state;
  return st;
}

describe('содержимое котокафе', () => {
  it('все тексты на двух языках, id уникальны, спортивного зала нет', () => {
    for (const a of ACTIONS) both(a.label);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const id of Object.keys(OBJECTS)) both(OBJECTS[id as keyof typeof OBJECTS].name);
    for (const h of HOUSES) {
      both(h.name);
      both(h.desc);
    }
    for (const e of LIFE_EVENTS) {
      both(e.title);
      both(e.text);
      for (const c of e.choices) both(c.text);
    }
    const ids = Object.keys(OBJECTS);
    for (const gone of ['coach', 'reception', 'gym_door', 'treadmill', 'dumbbells', 'yoga_mat', 'punching_bag', 'bed', 'fridge', 'stove', 'shower']) expect(ids).not.toContain(gone);
    // Еда — только для гостей: у стойки (закупка, выпечка) и к столикам.
    for (const a of ACTIONS.filter((x) => x.effect.food)) expect(a.at).toBe('counter');
  });

  it('спортивные вещи убраны из магазина и у игроков заменяются повседневными', () => {
    for (const id of ['dumbbell', 'running_shoes', 'yoga_mat', 'sports_bra', 'gym_shorts', 'tracksuit', 'kettlebell']) {
      expect(itemById(id)).toBe(undefined);
      expect(itemById(renamedItem(id))).toBeTruthy();
    }
    // Цепочка переименований: старое → промежуточное → нынешнее.
    expect(itemById(renamedItem('sport_set'))).toBeTruthy();
    const s = hero();
    const raw = structuredClone(s) as GameState;
    raw.inventory = ['dumbbell', 'running_shoes'];
    raw.equipped = { weapon: 'dumbbell', feet: 'running_shoes' };
    const m = migrate(raw);
    expect(m.inventory).toEqual(['coffee_cup', 'sneakers']);
    expect(m.equipped.feet).toBe('sneakers');
  });

  it('ступени кафе: больше места, кошек и гостей; расширение — по числу кошек', () => {
    for (let i = 1; i < HOUSES.length; i += 1) {
      const a = HOUSES[i - 1]!;
      const b = HOUSES[i]!;
      expect(b.w * b.d).toBeGreaterThan(a.w * a.d);
      expect(b.cats).toBeGreaterThan(a.cats);
      expect(b.seats).toBeGreaterThan(a.seats);
      expect(b.cost).toBeGreaterThan(a.cost);
      // Расшириться можно, когда прежнее кафе заполнено кошками.
      expect(b.needCats).toBe(a.cats);
    }
  });
});

describe('кошка дня в лавке демона', () => {
  it('новый день — новая кошка: порода, упражнение и число повторов одинаковы весь день', () => {
    const s = hero();
    const o = s.life.demon!;
    expect(o.day).toBe(s.today);
    expect(o.status).toBe('waiting');
    expect(DEMON_EXERCISES.some(([e]) => e === o.exercise)).toBe(true);
    expect(makeOffer(s, s.today)).toEqual({ ...o, name: makeOffer(s, s.today).name });
    expect(o.target).toBe(demonTarget(DEMON_EXERCISES.find(([e]) => e === o.exercise)![1], 0));
  });

  it('в начале в кафе живёт один кот; упражнение демона спасает кошку: она появляется в кафе, второй в тот же день нет', () => {
    let s = hero();
    expect(s.life.cats.length).toBe(1);
    expect(s.life.cats[0]!.sex).toBe('m');
    expect(s.life.bowl).toBe(BOWL_MAX);
    expect(guestDemand(s.life)).toBeGreaterThan(0);
    // Старое сохранение без кошек получает первого кота.
    expect(migrateLife({ ...structuredClone(s.life), cats: [], bowl: 0 }).cats.length).toBe(1);
    s.life.cats = [];
    const o = s.life.demon!;
    // Другое упражнение кошку не спасает.
    const other = DEMON_EXERCISES.find(([e]) => e !== o.exercise)![0];
    s = reps(s, other, 5);
    expect(s.life.demon!.progress).toBe(0);
    s = reps(s, o.exercise, o.target - 1);
    expect(s.life.cats.length).toBe(0);
    const r = applyRep(s, { exercise: o.exercise, quality: 90 }, now);
    s = r.state;
    expect(r.events.some((e) => e.kind === 'catSaved')).toBe(true);
    expect(s.life.cats.length).toBe(1);
    expect(s.life.cats[0]!.breed).toBe(o.breed);
    expect(s.life.demon!.status).toBe('saved');
    expect(s.life.bowl).toBe(BOWL_MAX);
    expect(s.life.stats.rescued).toBe(1);
    // Больше повторов — больше кошек не прибавляется.
    s = reps(s, o.exercise, o.target);
    expect(s.life.cats.length).toBe(1);
    expect(blocker(s, actionById('rescue')!)).toBe('missing');
    s.life.scene = 'demon';
    expect(blocker(s, actionById('rescue')!)).toBe('saved');
  });

  it('не спасли до полуночи — кошка пропадает; на следующий день новая, а спасённые дорожают', () => {
    const s = hero();
    const next = ensureDay(s, tomorrow);
    expect(next.events.some((e) => e.kind === 'catLost')).toBe(true);
    expect(next.state.life.stats.lost).toBe(1);
    expect(next.state.life.demon!.day).not.toBe(s.life.demon!.day);
    expect(next.state.life.demon!.status).toBe('waiting');
    // Спасённая вчера — не «пропала», а следующая просит больше повторов.
    let saved = reps(s, s.life.demon!.exercise, s.life.demon!.target);
    saved = ensureDay(saved, tomorrow).state;
    expect(saved.life.stats.lost).toBe(0);
    const o = saved.life.demon!;
    const base = DEMON_EXERCISES.find(([e]) => e === o.exercise)![1];
    expect(o.target).toBe(demonTarget(base, 1));
    expect(demonTarget(base, 1)).toBeGreaterThan(base);
    expect(demonTarget(base, 100)).toBeLessThanOrEqual(base * 4);
  });

  it('в полном кафе кошку не спасти: нужно расширяться', () => {
    let s = cafe(HOUSES[0]!.cats);
    s.life.house = 0;
    expect(s.life.cats.length).toBe(maxCats(s.life));
    s = reps(s, s.life.demon!.exercise, s.life.demon!.target);
    expect(s.life.demon!.status).toBe('waiting');
    expect(s.life.demon!.progress).toBe(0);
    s.life.scene = 'demon';
    expect(blocker(s, actionById('rescue')!)).toBe('full');
  });

  it('у демона: «спасти» открывает упражнение, выход ведёт в кафе', () => {
    let s = hero();
    s = act(s, 'go_demon').state;
    expect(s.life.scene).toBe('demon');
    expect(hasObject(s, 'demon')).toBe(true);
    expect(hasObject(s, 'cage')).toBe(true);
    expect(hasObject(s, 'sofa')).toBe(false);
    const out = act(s, 'rescue');
    expect(out.rescue).toBe(s.life.demon!.exercise);
    s = act(s, 'go_cafe').state;
    expect(s.life.scene).toBe('cafe');
  });

  it('время до полуночи', () => {
    expect(offerLeftMs(new Date(2026, 10, 5, 23, 0, 0))).toBe(3600000);
    expect(offerLeftMs(new Date(2026, 10, 5, 0, 0, 0))).toBe(24 * 3600000);
  });
});

describe('деньги: повторы, задания и гости', () => {
  it('каждый повтор приносит деньги (в пределах дневного лимита)', () => {
    const s = hero();
    const after = applyRep(s, { exercise: 'squat', quality: 90 }, now).state;
    expect(after.gold - s.gold).toBeGreaterThanOrEqual(REP_MONEY);
    expect(after.life.stats.repMoney).toBe(REP_MONEY);
  });

  it('без кошек гостей нет; довольные кошки и уют — больше гостей и дороже вход', () => {
    expect(guestDemand({ ...hero().life, cats: [] })).toBe(0);
    const s = cafe(2);
    const g = guestDemand(s.life);
    expect(g).toBeGreaterThan(0);
    const sad = structuredClone(s);
    for (const c of sad.life.cats) Object.assign(c, { fed: 5, play: 5, toilet: 10 });
    expect(guestDemand(sad.life)).toBeLessThan(g);
    // Уют: с декором вход дороже.
    const cosy = structuredClone(s);
    cosy.life.furniture = ['painting', 'house_plant', 'palm'];
    expect(ticket(cosy.life)).toBeGreaterThan(ticket(s.life));
    // Мест не больше, чем вмещает кафе.
    const crowd = cafe(10);
    expect(guestDemand(crowd.life)).toBeLessThanOrEqual(HOUSES[crowd.life.house]!.seats);
  });

  it('кафе работает круглосуточно: гости платят за вход и играют с кошками, ночью их меньше', () => {
    let s = cafe(2, 11);
    for (const c of s.life.cats) c.play = 20;
    s.life.buzz = 2;
    const gold = s.gold;
    for (let i = 0; i < 9; i += 1) s = act(s, 'relax').state;
    expect(s.gold).toBeGreaterThan(gold);
    expect(s.life.stats.visitors).toBeGreaterThan(0);
    expect(guestsNow(s.life).length).toBe(s.life.guests);
    expect(actionById('close')).toBe(undefined);
    // Ночью кафе открыто, гостей меньше; реклама работает и ночью.
    const night = cafe(2, 3);
    expect(guestDemand(night.life)).toBeGreaterThan(0);
    expect(guestDemand(night.life)).toBeLessThan(guestDemand(cafe(2, 13).life));
    expect(blocker(night, actionById('flyers')!)).toBe(null);
    expect(guestsNow({ ...night.life, guests: 2 }).length).toBe(2);
    const more = act(cafe(2, 12), 'flyers').state;
    expect(more.life.buzz).toBeGreaterThan(0);
    expect(guestDemand(more.life)).toBeGreaterThan(guestDemand(cafe(2, 12).life));
  });

  it('гости едят: еда с витрины приносит деньги сверху входа; без еды гостей меньше', () => {
    let s = cafe(2, 12);
    s.life.buzz = 3;
    s.life.food = maxFood(s.life);
    s.gold = 0;
    for (let i = 0; i < 9; i += 1) s = act(s, 'relax').state;
    expect(s.life.stats.meals).toBeGreaterThan(0);
    expect(s.life.food).toBe(maxFood(s.life) - s.life.stats.meals);
    expect(s.life.stats.earned).toBeGreaterThan(s.life.stats.visitors * 15);
    const empty = cafe(2, 12);
    empty.life.food = 0;
    expect(guestDemand(empty.life)).toBeCloseTo(guestDemand(cafe(2, 12).life) * FOOD.noFood, 5);
    // Закупка: партия за деньги; выпечка — бесплатно, но дольше; полная витрина — не нужно.
    empty.gold = 100;
    const bought = act(empty, 'restock').state;
    expect(bought.life.food).toBeGreaterThan(0);
    expect(act(empty, 'bake').state.life.food).toBeGreaterThan(0);
    expect(actionById('bake')!.minutes).toBeGreaterThan(actionById('restock')!.minutes);
    const full = cafe(2, 12);
    full.life.food = maxFood(full.life);
    expect(blocker(full, actionById('restock')!)).toBe('enough');
    // Заказ к столику — только если есть гости.
    const lonely = cafe(0);
    lonely.life.guests = 0;
    expect(hasObject(lonely, 'table')).toBe(true);
    expect(blocker(lonely, actionById('serve')!)).toBe('empty');
    // Игровая зона есть всегда: уют, кошки скучают медленнее, у неё — игры с кошками.
    expect(hasObject(lonely, 'play_zone')).toBe(true);
    expect(ACTIONS.filter((x) => x.at === 'play_zone').length).toBeGreaterThanOrEqual(3);
    for (let t = 0; t < HOUSES.length; t += 1) {
      const lay = homeLayout([...FURNITURE], true, t);
      const pz = lay.find((x) => x.id === 'play_zone')!;
      const rb = bounds('cafe', t);
      expect(pz.box!.x0).toBeGreaterThanOrEqual(rb.x0 - 0.35);
      expect(pz.box!.z0).toBeGreaterThanOrEqual(rb.z0 - 0.35);
      // Не налезает на столики, стойку, диван и купленную мебель.
      for (const o of lay) if (o !== pz && o.box) expect(o.box.x1 <= pz.box!.x0 || o.box.x0 >= pz.box!.x1 || o.box.z1 <= pz.box!.z0 || o.box.z0 >= pz.box!.z1).toBe(true);
    }
    // Столиков больше с каждой ступенью кафе.
    for (let t = 0; t < HOUSES.length; t += 1) expect(cafeTables(t).length).toBe(HOUSES[t]!.tables);
  });

  it('квесты и задания снова приносят деньги', () => {
    let s = hero();
    const gold = s.gold;
    // Первый квест: 5 приседаний.
    s = reps(s, 'squat', 5);
    expect(s.quests.first_steps?.status).toBe('done');
    expect(s.gold - gold).toBeGreaterThan(5 * REP_MONEY);
  });
});

describe('кошки в кафе', () => {
  it('миски, лоток и настроение', () => {
    let s = cafe(1);
    s.life.litter = 90;
    const mood = catMood(s.life.cats[0]!, s.life);
    s = act(s, 'clean_litter').state;
    expect(s.life.litter).toBe(0);
    expect(catMood(s.life.cats[0]!, s.life)).toBeGreaterThan(mood);
    expect(blocker(s, actionById('clean_litter')!)).toBe('enough');
    s.life.bowl = 0;
    s.gold = 100;
    s = act(s, 'fill_bowl').state;
    expect(s.life.bowl).toBe(BOWL_MAX);
    s.life.cats[0]!.play = 10;
    s = act(s, 'play_cat').state;
    expect(s.life.cats[0]!.play).toBeGreaterThan(40);
  });

  it('старые сохранения: кошки и мебель для кафе остаются, зал, ученики и потребности уходят', () => {
    const s = hero();
    const raw = {
      ...structuredClone(s.life),
      scene: 'gym',
      house: 2,
      furniture: ['painting', 'treadmill', 'computer', 'palm'],
      cats: [cat(1), { ...cat(2), pregnant: { due: 5, father: 'black' } }],
      clients: [{ id: 'c1' }],
      gym: 3,
      needs: { food: 50 },
    } as unknown as Parameters<typeof migrateLife>[0];
    const m = migrateLife(raw);
    expect(m.scene).toBe('cafe');
    expect(m.furniture).toEqual(['painting', 'palm']);
    expect(m.cats.length).toBe(2);
    expect('pregnant' in m.cats[1]!).toBe(false);
    expect('clients' in m).toBe(false);
    expect('needs' in m).toBe(false);
    expect(m.house).toBe(2);
    // Квартирная отделка, которую игра ставила сама, сменяется отделкой кафе; купленное — в запасе.
    const flat = migrateLife({ ...raw, decor: { ...APARTMENT_DECOR, wall: 'wall_brick' }, finishes: [...Object.values(APARTMENT_DECOR), 'wall_brick', 'wall_peeling'] } as typeof raw);
    expect(flat.decor).toEqual({ ...CAFE_DECOR, wall: 'wall_brick' });
    expect(flat.finishes).toContain('floor_parquet');
    expect(flat.finishes).not.toContain('wall_peeling');
    expect(flat.food).toBeGreaterThan(0);
    // Уже в кафе: выбранная простая отделка остаётся.
    const again = migrateLife({ ...flat, decor: { ...flat.decor, floor: 'floor_parquet' } });
    expect(again.decor.floor).toBe('floor_parquet');
  });
});

describe('мебель, расширение и ремонт', () => {
  it('мебель покупается в свободные места своего вида', () => {
    let s = cafe(1);
    s.gold = 100000;
    for (const id of FURNITURE) s = buyFurniture(s, id);
    for (const mount of ['slot', 'wall', 'floor'] as const) expect(s.life.furniture.filter((x) => mountOf(x) === mount).length).toBeLessThanOrEqual(slotsFor(mount, s.life.house));
    const missing = FURNITURE.find((id) => !s.life.furniture.includes(id));
    if (missing) expect(furnitureBlocker(s, missing)).toBe('space');
    expect(comfort(s.life)).toBeGreaterThan(comfort(cafe(1).life));
  });

  it('расширение: нужно достаточно кошек и денег; отделка остаётся', () => {
    let s = hero();
    s.gold = 100000;
    expect(houseBlocker(s)).toBe('cats');
    s.life.cats = [cat(1), cat(2)];
    s = applyFinish(s, 'wall_stripes');
    expect(houseBlocker(s)).toBe(null);
    s = upgradeHouse(s);
    expect(s.life.house).toBe(1);
    expect(s.gold).toBe(100000 - finishById('wall_stripes')!.price - HOUSES[1]!.cost);
    expect(s.life.decor.wall).toBe('wall_stripes');
    expect(s.life.decor.floor).toBe(CAFE_DECOR.floor);
    expect(houseBlocker(s)).toBe('cats');
    expect(maxCats(s.life)).toBe(HOUSES[1]!.cats);
  });

  it('кафе начинается с простой отделки кафе; диван можно заменить, отделку — купить и вернуть', () => {
    let s = hero();
    expect(s.life.house).toBe(0);
    expect(s.life.decor).toEqual(CAFE_DECOR);
    expect(s.life.kit).toEqual(OLD_KIT);
    expect(oldStuff(s.life)).toBe(1);
    expect(s.life.food).toBeGreaterThan(0);
    expect(kitBlocker(s, 'sofa')).toBe('money');
    s.gold = 5000;
    const c0 = comfort(s.life);
    s = upgradeKit(s, 'sofa');
    expect(s.gold).toBe(5000 - kitById('sofa').price);
    expect(comfort(s.life)).toBeGreaterThan(c0);
    s = applyFinish(s, 'wall_floral');
    const gold = s.gold;
    s = applyFinish(s, 'wall_cafe');
    expect(s.life.decor.wall).toBe('wall_cafe');
    s = applyFinish(s, 'wall_floral');
    expect(s.gold).toBe(gold);
    expect(finishBlocker(s, 'floor_marble')).toBe('level');
    const lv = structuredClone(s);
    lv.totalXp = xpForLevel(20);
    expect(finishBlocker(lv, 'floor_marble')).toBe(null);
    for (const k of DECOR_KINDS) expect(FINISHES.filter((f) => f.kind === k).length).toBeGreaterThanOrEqual(5);
  });
});

describe('самостоятельность героя', () => {
  it('пустая миска, грязный лоток и пустая витрина — срочно; у демона — вернуться в кафе', () => {
    const s = cafe(2);
    s.life.bowl = 0;
    expect(autoChoice(s, [], true)?.action.id).toBe('fill_bowl');
    s.life.bowl = BOWL_MAX;
    s.life.litter = 90;
    expect(autoChoice(s, [], true)?.action.id).toBe('clean_litter');
    s.life.litter = 0;
    s.life.food = 0;
    s.gold = 200;
    expect(autoChoice(s, [], true)?.action.id).toBe('restock');
    s.gold = 0;
    expect(autoChoice(s, [], true)?.action.id).toBe('bake');
    s.life.food = 5;
    const demon = structuredClone(s);
    demon.life.scene = 'demon';
    expect(autoChoice(demon)?.action.id).toBe('go_cafe');
  });

  it('скучающие кошки — герой играет с ними; упражнения и спасение — только с игроком', () => {
    const s = cafe(2);
    for (const c of s.life.cats) c.play = 5;
    const c = autoChoice(s);
    expect(c).not.toBe(null);
    // С кошкой или в игровой зоне (дразнилка, новые игрушки, котошоу).
    expect(['play_cat', 'pet_cat', 'laser', 'new_toys', 'cat_show']).toContain(c!.action.id);
    expect(c!.action.effect.catPlay || c!.action.effect.catsPlay).toBeTruthy();
    for (let i = 0; i < 30; i += 1) {
      const x = autoChoice({ ...s, life: { ...s.life, minute: 600 + i * 17 } });
      if (x) expect(x.action.rescue || x.action.train || x.action.go).toBeFalsy();
    }
  });
});

describe('раскладка', () => {
  it('к предметам кафе можно подойти; стойка, диван и дверь на месте, кровати и кухни нет', () => {
    const b = bounds('cafe');
    const placed = homeLayout(FURNITURE, true);
    const obstacles = homeObstacles();
    for (const p of placed) {
      const r = resolve(p.use, b, obstacles);
      expect(Math.hypot(r.x - p.use.x, r.z - p.use.z)).toBeLessThan(0.01);
    }
    const ids = placed.map((p) => p.id);
    for (const id of ['counter', 'sofa', 'door', 'cat_bowl', 'litter']) expect(ids).toContain(id);
  });

  it('герой обходит мебель по пути к стойке', () => {
    const b = bounds('cafe', 1);
    const placed = homeLayout(['armchair', 'big_tv', 'bookshelf', 'piano'], true, 1);
    const boxes: Box[] = [...placed.map((p) => p.box).filter((x): x is Box => x !== null), ...homeObstacles()];
    const walk = (from: P2, to: P2): boolean => {
      let pos = { ...from };
      let via: P2 | null = null;
      for (let i = 0, detours = 0; i < 2000; i += 1) {
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
    const counter = placed.find((p) => p.id === 'counter')!;
    for (const from of [{ x: -4, z: 3 }, { x: -6, z: 4 }, { x: 3, z: 3 }]) expect(walk(from, counter.use)).toBe(true);
  });

  it('гости стоят в свободных местах, не в мебели и не друг в друге', () => {
    const placed = homeLayout(['armchair', 'bookshelf'], true, 2);
    const boxes: Box[] = [...placed.map((p) => p.box).filter((x): x is Box => x !== null), ...homeObstacles()];
    const spots = guestSpots(2, boxes, HOUSES[2]!.seats);
    expect(spots.length).toBe(HOUSES[2]!.seats);
    for (const p of spots) for (const q of spots) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(1.2);
  });

  it('лавка демона: демон за прилавком, клетка и выход; герой появляется у двери', () => {
    const placed = demonLayout();
    expect(placed.map((p) => p.id).sort()).toEqual(['cage', 'demon', 'demon_door']);
    const b = bounds('demon');
    const sp = spawn('demon');
    expect(sp.x).toBeGreaterThan(b.x0);
    expect(sp.x).toBeLessThan(b.x1);
  });

  it('стик: неполный наклон — шаг, до упора — бег трусцой', () => {
    expect(stickSpeed(0)).toBe(0);
    expect(stickSpeed(STICK_WALK)).toBeCloseTo(WALK_SPEED, 6);
    expect(stickSpeed(1)).toBeCloseTo(RUN_SPEED, 6);
  });
});
