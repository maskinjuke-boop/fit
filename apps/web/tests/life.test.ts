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
  dayFraction,
  demonTarget,
  finishBlocker,
  furnitureBlocker,
  hasObject,
  houseBlocker,
  kitBlocker,
  makeOffer,
  maxCats,
  migrateLife,
  offerLeftMs,
  oldStuff,
  tomorrowOffer,
  upgradeHouse,
  upgradeKit,
} from '../src/game/life';
import { ACTIONS, BOWL_MAX, CAT_BREEDS, DEMON_EXERCISES, FURNITURE, HOUSES, LIFE_EVENTS, OBJECTS, REP_MONEY, actionById, mountOf, slotsFor } from '../src/game/lifeContent';
import { RUN_SPEED, STICK_WALK, WALK_SPEED, bounds, demonLayout, detourPoint, homeLayout, homeObstacles, resolve, spawn, stickSpeed, type Box, type P2 } from '../src/game/lifeMap';
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

const cat = (i: number, over: Partial<Cat> = {}): Cat => {
  const breed = over.breed ?? CAT_BREEDS[i % CAT_BREEDS.length]!.id;
  return { id: `cat${i}`, breed, name: i, adopted: 1, fed: 80, play: 70, toilet: 90, drink: 80, starve: 0, sex: i % 2 ? 'f' : 'm', born: -20, blood: { [breed]: 1 }, ...over };
};

/** Дом с n кошками в разгар дня (кошка игрока — первая). */
function cafe(n = 2, hour = 13): GameState {
  const s = structuredClone(hero());
  s.life.minute = hour * 60;
  s.life.cats = Array.from({ length: n }, (_, i) => cat(i + 1));
  s.life.pet = 'cat1';
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

describe('содержимое кошачьего дома', () => {
  it('все тексты на двух языках, id уникальны, ни зала, ни кафе нет', () => {
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
    for (const gone of ['coach', 'reception', 'gym_door', 'treadmill', 'dumbbells', 'yoga_mat', 'punching_bag', 'bed', 'fridge', 'stove', 'shower', 'counter', 'table']) expect(ids).not.toContain(gone);
    // Кафе и гостей больше нет: ни еды на продажу, ни рекламы.
    for (const gone of ['serve', 'restock', 'bake', 'flyers', 'chat_guests', 'pet_cat', 'hug_cat', 'call_cat']) expect(actionById(gone)).toBe(undefined);
    // Все породы — с ценой, у каждой своя.
    expect(CAT_BREEDS.length).toBeGreaterThanOrEqual(15);
    for (const b of CAT_BREEDS) {
      both(b.name);
      expect(b.value).toBeGreaterThan(0);
    }
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

  it('ступени дома: больше места и кошек; расширение — по числу кошек', () => {
    for (let i = 1; i < HOUSES.length; i += 1) {
      const a = HOUSES[i - 1]!;
      const b = HOUSES[i]!;
      expect(b.w * b.d).toBeGreaterThan(a.w * a.d);
      expect(b.cats).toBeGreaterThan(a.cats);
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
    expect(s.life.pet).toBe(s.life.cats[0]!.id);
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
    // Упавшей в жерло кошке ставят могилку (порода и имя — её); завтрашняя кошка демона
    // (на коленях) — это и есть кошка следующего дня.
    expect(next.state.life.graves.length).toBe(1);
    expect(next.state.life.graves[0]!.breed).toBe(s.life.demon!.breed);
    expect(next.state.life.graves[0]!.name).toBe(s.life.demon!.name);
    expect(tomorrowOffer(s).breed).toBe(next.state.life.demon!.breed);
    expect(tomorrowOffer(s).sex).toBe(next.state.life.demon!.sex);
    expect(hasObject({ ...next.state, life: { ...next.state.life, scene: 'demon' } }, 'graves')).toBe(true);
    expect(hasObject({ ...s, life: { ...s.life, scene: 'demon' } }, 'graves')).toBe(false);
    // Лента: в полдень кошка на середине пути, к полуночи — у жерла.
    expect(dayFraction(new Date(2026, 10, 5, 12, 0, 0))).toBeCloseTo(0.5, 3);
    expect(dayFraction(new Date(2026, 10, 5, 23, 59, 59))).toBeGreaterThan(0.999);
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
    expect(hasObject(s, 'belt')).toBe(true);
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

describe('деньги: повторы и задания', () => {
  it('каждый повтор приносит деньги (в пределах дневного лимита)', () => {
    const s = hero();
    const after = applyRep(s, { exercise: 'squat', quality: 90 }, now).state;
    expect(after.gold - s.gold).toBeGreaterThanOrEqual(REP_MONEY);
    expect(after.life.stats.repMoney).toBe(REP_MONEY);
  });

  it('деньги — только за упражнения: дела кошки денег не приносят (кроме картин лапками)', () => {
    let s = cafe(2, 11);
    const gold = s.gold;
    for (let i = 0; i < 6; i += 1) s = act(s, 'nap_sofa').state;
    expect(s.gold).toBe(gold);
    s.life.furniture = ['easel'];
    expect(act(s, 'paint').state.gold).toBeGreaterThan(s.gold);
    // Игровая зона есть всегда, у игрушек — свои занятия кошки.
    expect(hasObject(s, 'play_zone')).toBe(true);
    expect(ACTIONS.filter((x) => x.at === 'play_zone' && x.needItem).length).toBeGreaterThanOrEqual(8);
    for (let t = 0; t < HOUSES.length; t += 1) {
      const lay = homeLayout([...FURNITURE], true, t);
      const pz = lay.find((x) => x.id === 'play_zone')!;
      const rb = bounds('cafe', t);
      expect(pz.box!.x0).toBeGreaterThanOrEqual(rb.x0 - 0.35);
      expect(pz.box!.z0).toBeGreaterThanOrEqual(rb.z0 - 0.35);
      for (const o of lay) if (o !== pz && o.box) expect(o.box.x1 <= pz.box!.x0 || o.box.x0 >= pz.box!.x1 || o.box.z1 <= pz.box!.z0 || o.box.z0 >= pz.box!.z1).toBe(true);
    }
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

describe('кошки дома', () => {
  it('кошка игрока: ест, пьёт, ходит в лоток, играет; миски и лоток; настроение', () => {
    let s = cafe(1);
    s.life.litter = 90;
    const mood = catMood(s.life.cats[0]!, s.life);
    s = act(s, 'clean_litter').state;
    expect(s.life.litter).toBe(0);
    expect(catMood(s.life.cats[0]!, s.life)).toBeGreaterThan(mood);
    expect(blocker(s, actionById('clean_litter')!)).toBe('enough');
    // Сытая — есть не нужно; голодная — ест из миски (порция уходит).
    expect(blocker(s, actionById('eat')!)).toBe(null);
    s.life.cats[0]!.fed = 95;
    expect(blocker(s, actionById('eat')!)).toBe('enough');
    s.life.cats[0]!.fed = 20;
    const bowl = s.life.bowl;
    s = act(s, 'eat').state;
    expect(s.life.cats[0]!.fed).toBeGreaterThan(60);
    expect(s.life.bowl).toBe(bowl - 1);
    s.life.cats[0]!.drink = 10;
    s = act(s, 'drink').state;
    expect(s.life.cats[0]!.drink).toBeGreaterThan(60);
    s.life.cats[0]!.toilet = 10;
    s = act(s, 'use_litter').state;
    expect(s.life.cats[0]!.toilet).toBe(100);
    expect(s.life.litter).toBeGreaterThan(0);
    // Пустая миска: есть нечего — мяукнуть у кормушки (корм за деньги).
    s.life.bowl = 0;
    s.life.cats[0]!.fed = 20;
    expect(blocker(s, actionById('eat')!)).toBe('empty');
    s.gold = 100;
    s = act(s, 'ask_food').state;
    expect(s.life.bowl).toBe(BOWL_MAX);
    s.life.cats[0]!.play = 10;
    s = act(s, 'scratch_post').state;
    expect(s.life.cats[0]!.play).toBeGreaterThan(20);
    expect(s.life.stats.played).toBeGreaterThan(0);
    // Игрушки нет в зоне — и занятия с ней нет.
    expect(blocker(s, actionById('wheel_run')!)).toBe('missing');
  });

  it('смена кошки: управление переходит к другой, её потребности меняют действия', async () => {
    const m = await import('../src/game/life');
    let s = cafe(2);
    expect(m.petOf(s.life)!.id).toBe('cat1');
    s = m.setPet(s, 'cat2');
    expect(s.life.pet).toBe('cat2');
    expect(m.setPet(s, 'nope')).toBe(s);
    s.life.cats[1]!.fed = 10;
    s = act(s, 'eat').state;
    expect(s.life.cats[1]!.fed).toBeGreaterThan(50);
    expect(s.life.cats[0]!.fed).toBeLessThan(85);
    // Действия с другой кошкой: ей — игра, обеим — отношения.
    s.life.cats[0]!.play = 10;
    const b0 = m.bondOf(s.life, 'cat1', 'cat2');
    s = act(s, 'play_cats', 'cat1').state;
    expect(s.life.cats[0]!.play).toBeGreaterThan(30);
    expect(m.bondOf(s.life, 'cat1', 'cat2')).toBeGreaterThan(b0);
    s = act(s, 'hiss_cat', 'cat1').state;
    expect(m.bondOf(s.life, 'cat2', 'cat1')).toBeLessThan(b0 + 6);
    // Одна кошка — с другими кошками ничего не сделать.
    expect(blocker(cafe(1), actionById('rub_cat')!)).toBe('nocat');
  });

  it('голод и жажда: без еды или воды кошка держится сутки, потом умирает (могилка)', async () => {
    const m = await import('../src/game/life');
    let s = cafe(2);
    s.life.bowl = 0;
    s.life.water = 0;
    for (const c of s.life.cats) Object.assign(c, { fed: 0, drink: 0 });
    s = m.adminSkipTime(s, 10 * 60);
    expect(s.life.cats.length).toBe(2);
    expect(s.life.cats[0]!.starve).toBeGreaterThanOrEqual(10);
    s = m.adminSkipTime(s, 15 * 60);
    expect(s.life.cats.length).toBe(0);
    expect(s.life.graves.length).toBe(2);
    expect(s.life.graves.every((g) => g.cause === 'thirst' || g.cause === 'hunger')).toBe(true);
    expect(s.life.last?.notes.length).toBeGreaterThan(0);
    expect(s.life.pet).toBe('');
    // С кормом и водой — живут: едят и пьют сами.
    let ok = cafe(2);
    for (const c of ok.life.cats) Object.assign(c, { fed: 30, drink: 30 });
    ok = m.adminSkipTime(ok, 30 * 60);
    expect(ok.life.cats.length).toBe(2);
    // Поела — счётчик уходит.
    let back = cafe(1);
    back.life.cats[0]!.starve = 20;
    back = m.adminSkipTime(back, 5 * 60);
    expect(back.life.cats[0]!.starve).toBeLessThan(20);
  });

  it('родословная: чистота крови, ценность, метисы; котята — смесь крови родителей', async () => {
    const m = await import('../src/game/life');
    const b = await import('../src/game/catBlood');
    const pure = b.catValue({ bengal: 1 });
    const half = b.catValue({ bengal: 0.5, black: 0.5 });
    expect(pure).toBeGreaterThan(half * 2);
    expect(b.catValue({ ginger: 1 })).toBeLessThan(b.catValue({ british: 1 }));
    expect(b.purity({ siamese: 0.75, persian: 0.25 })).toBe(0.75);
    expect(b.looksOf({ siamese: 0.75, persian: 0.25 })).toEqual({ breed: 'siamese', mix: 'persian' });
    expect(b.childBlood({ siamese: 1 }, { persian: 1 })).toEqual({ siamese: 0.5, persian: 0.5 });
    expect(b.childBlood({ siamese: 0.5, persian: 0.5 }, { siamese: 1 })).toEqual({ siamese: 0.75, persian: 0.25 });
    expect(b.pedigree({ siamese: 0.75, persian: 0.25 }, 'ru')).toContain('75%');
    // Котята: кот и кошка, взрослые, дружат, есть место.
    let s = cafe(2);
    s.life.house = 2;
    s.life.cats[0]!.blood = { bengal: 1 };
    s.life.cats[1]!.blood = { persian: 1 };
    const mate = actionById('mate_cat')!;
    expect(blocker(s, mate, 'cat2')).toBe('bond');
    s = m.adminBonds(s, 80);
    expect(blocker(s, mate, 'cat2')).toBe(null);
    const same = structuredClone(s);
    same.life.cats[1]!.sex = same.life.cats[0]!.sex;
    expect(blocker(same, mate, 'cat2')).toBe('sex');
    const young = structuredClone(s);
    young.life.cats[1]!.born = young.life.day - 2;
    expect(blocker(young, mate, 'cat2')).toBe('young');
    s = act(s, 'mate_cat', 'cat2').state;
    const mom = s.life.cats.find((c) => c.sex === 'f')!;
    expect(mom.pregnant).toBeTruthy();
    expect(blocker(s, mate, 'cat2')).toBe('pregnant');
    s = m.adminSkipTime(s, 3 * 24 * 60 - s.life.minute);
    const kits = s.life.cats.filter((c) => c.parents);
    expect(kits.length).toBeGreaterThanOrEqual(1);
    for (const k of kits) {
      expect(k.blood).toEqual({ bengal: 0.5, persian: 0.5 });
      expect(m.isKitten(k, s.life.day)).toBe(true);
      expect(m.bondOf(s.life, mom.id, k.id)).toBeGreaterThan(30);
    }
    expect(s.life.stats.born).toBe(kits.length);
    // Сохранение: кровь из породы старого сохранения (метис — пополам).
    const old = migrateLife({ ...s.life, cats: [{ ...cat(1), blood: undefined, mix: 'persian' } as unknown as Cat] });
    expect(old.cats[0]!.blood).toEqual({ black: 0.5, persian: 0.5 });
  });

  it('отношения сами меняются: довольные сближаются, голодные и скучающие ссорятся', async () => {
    const m = await import('../src/game/life');
    let happy = cafe(2);
    happy = m.adminSkipTime(happy, 6 * 60);
    expect(m.bondOf(happy.life, 'cat1', 'cat2')).toBeGreaterThan(0);
    let grumpy = cafe(2);
    for (const c of grumpy.life.cats) c.play = 5;
    grumpy = m.adminSkipTime(grumpy, 6 * 60);
    expect(m.bondOf(grumpy.life, 'cat1', 'cat2')).toBeLessThan(0);
    expect(m.bondLevel(-70)).toBe('enemy');
    expect(m.bondLevel(95)).toBe('love');
  });

  it('старые сохранения: кошки и мебель для кафе остаются, зал, ученики и потребности уходят', () => {
    const s = hero();
    const raw = {
      ...structuredClone(s.life),
      scene: 'gym',
      house: 2,
      furniture: ['painting', 'treadmill', 'computer', 'palm'],
      cats: [cat(1), { ...cat(2), pregnant: { due: 5, father: 'black' } }],
      food: 12,
      guests: 3,
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
    expect('food' in flat).toBe(false);
    expect('guests' in flat).toBe(false);
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

  it('дом начинается с простой отделки; диван можно заменить, отделку — купить и вернуть', () => {
    let s = hero();
    expect(s.life.house).toBe(0);
    expect(s.life.decor).toEqual(CAFE_DECOR);
    expect(s.life.kit).toEqual(OLD_KIT);
    expect(oldStuff(s.life)).toBe(1);
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

describe('самостоятельность кошки игрока', () => {
  it('голод, жажда, лоток и пустая миска — срочно; у демона — вернуться домой', () => {
    const s = cafe(2);
    s.life.cats[0]!.fed = 10;
    expect(autoChoice(s, [], true)?.action.id).toBe('eat');
    s.life.cats[0]!.fed = 90;
    s.life.cats[0]!.drink = 10;
    expect(autoChoice(s, [], true)?.action.id).toBe('drink');
    s.life.cats[0]!.drink = 90;
    s.life.cats[0]!.toilet = 10;
    expect(autoChoice(s, [], true)?.action.id).toBe('use_litter');
    s.life.cats[0]!.toilet = 90;
    s.life.litter = 90;
    expect(autoChoice(s, [], true)?.action.id).toBe('clean_litter');
    s.life.litter = 0;
    s.life.bowl = 0;
    s.gold = 50;
    expect(autoChoice(s, [], true)?.action.id).toBe('ask_food');
    const demon = structuredClone(s);
    demon.life.scene = 'demon';
    expect(autoChoice(demon)?.action.id).toBe('go_cafe');
  });

  it('скучает — играет сама; котят и ссор сама не затевает; упражнения и спасение — только с игроком', () => {
    const s = cafe(2);
    for (const c of s.life.cats) c.play = 5;
    s.life.bonds = { 'cat1|cat2': 90 };
    const c = autoChoice(s);
    expect(c).not.toBe(null);
    expect(c!.action.effect.self?.play || c!.action.effect.catPlay || c!.action.effect.catsPlay).toBeTruthy();
    for (let i = 0; i < 40; i += 1) {
      const x = autoChoice({ ...s, life: { ...s.life, minute: 600 + i * 17 } });
      if (x) expect(x.action.rescue || x.action.train || x.action.go || x.action.needMate || x.action.id === 'hiss_cat').toBeFalsy();
    }
  });
});

describe('раскладка', () => {
  it('к предметам дома можно подойти; диван и дверь на месте, стойки, столиков, кровати и кухни нет', () => {
    const b = bounds('cafe');
    const placed = homeLayout(FURNITURE, true);
    const obstacles = homeObstacles();
    for (const p of placed) {
      const r = resolve(p.use, b, obstacles);
      expect(Math.hypot(r.x - p.use.x, r.z - p.use.z)).toBeLessThan(0.01);
    }
    const ids = placed.map((p) => p.id);
    for (const id of ['sofa', 'door', 'cat_bowl', 'litter']) expect(ids).toContain(id);
    for (const id of ['counter', 'table']) expect(ids).not.toContain(id);
  });

  it('кошка обходит мебель по пути к мискам', () => {
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
    const bowls = placed.find((p) => p.id === 'cat_bowl')!;
    for (const from of [{ x: -4, z: 3 }, { x: -6, z: 4 }, { x: 3, z: 3 }]) expect(walk(from, bowls.use)).toBe(true);
  });

  it('лавка демона: демон за прилавком, клетка и выход; герой появляется у двери', () => {
    const placed = demonLayout();
    expect(placed.map((p) => p.id).sort()).toEqual(['belt', 'demon', 'demon_door', 'graves']);
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

describe('инструменты администратора для дома и лавки', () => {
  it('кошки, ступень, время, отношения, лента, кошка дня и могилки', async () => {
    const m = await import('../src/game/life');
    let s = hero();
    s = m.adminFillCats(m.adminSetHouse(s, 1));
    expect(s.life.house).toBe(1);
    expect(s.life.cats.length).toBe(HOUSES[1]!.cats);
    expect(m.adminAddCat(s, 'bengal')).toBe(s);
    s = m.adminRemoveCats(s, false);
    expect(s.life.cats.length).toBe(HOUSES[1]!.cats - 1);
    s = m.adminAddCat(s, 'sphynx', true);
    expect(m.isKitten(s.life.cats.at(-1)!, s.life.day)).toBe(true);
    s = m.adminCatNeeds(s, { play: 5 });
    expect(s.life.cats.every((c) => c.play === 5)).toBe(true);
    s = m.adminSetHour(s, 3);
    expect(s.life.minute).toBe(180);
    const day = s.life.day;
    s = m.adminSkipTime(s, 24 * 60);
    expect(s.life.day).toBe(day + 1);
    // Отношения: все дружат или всё сброшено; метис.
    const fr = m.adminBonds(s, 80);
    expect(m.bondOf(fr.life, s.life.cats[0]!.id, s.life.cats[1]!.id)).toBe(80);
    expect(m.adminBonds(fr, null).life.bonds).toEqual({});
    const mixed = m.adminAddMix(m.adminRemoveCats(s, false), 'siamese', 'persian', 0.25);
    expect(mixed.life.cats.at(-1)!.blood).toEqual({ siamese: 0.75, persian: 0.25 });
    // Кошка дня: другая (на сегодня), уронить в жерло — могилка.
    const o = s.life.demon!;
    const other = m.adminRerollOffer(s, 3);
    expect(other.life.demon!.day).toBe(s.today);
    expect(JSON.stringify(other.life.demon)).not.toBe(JSON.stringify(o));
    const dropped = m.adminDropCat(s);
    expect(dropped.state.life.demon!.status).toBe('lost');
    expect(dropped.state.life.graves.length).toBe(s.life.graves.length + 1);
    expect(dropped.events[0]!.kind).toBe('catLost');
    expect(m.adminGraves(s, 5).life.graves.length).toBe(s.life.graves.length + 5);
    expect(m.adminGraves(dropped.state, 0).life.graves.length).toBe(0);
    // Лента: положение задаётся вручную и возвращается к часам.
    m.setBeltOverride(0.9);
    expect(m.dayFraction(new Date(2026, 10, 5, 1, 0, 0))).toBe(0.9);
    m.setBeltOverride(null);
    expect(m.dayFraction(new Date(2026, 10, 5, 12, 0, 0))).toBeCloseTo(0.5, 3);
    expect(m.adminScene(s, 'demon').life.scene).toBe('demon');
    expect(m.adminBuyAll(s).life.furniture.length).toBe(FURNITURE.length);
    expect(m.adminEvent(s, 'catnip').life.event!.id).toBe('catnip');
  });
});

describe('игровая зона: расширение и игрушки', () => {
  it('покупка, места по видам, убрать и вернуть бесплатно, расширение, коврик, уют и скука', async () => {
    const m = await import('../src/game/life');
    const { PLAY_SIZES, playItemById } = await import('../src/game/lifeContent');
    let s = hero();
    s.gold = 5000;
    expect(s.life.play.items).toEqual(['tree', 'post', 'tunnel']);
    const c0 = comfort(s.life);
    const b0 = m.playBoredom(s.life.play);
    // В уголке два малых места: гамак встаёт рядом со столбиком, коробкам уже некуда.
    expect(m.playBlocker(s, 'hammock')).toBe(null);
    s = m.placePlayItem(s, 'hammock');
    expect(m.playBlocker(s, 'boxes')).toBe('space');
    s = m.removePlayItem(s, 'post');
    expect(s.gold).toBe(5000 - playItemById('hammock').price);
    expect(s.life.play.items).toContain('hammock');
    expect(comfort(s.life)).toBeGreaterThan(c0);
    expect(m.playBoredom(s.life.play)).toBeLessThan(b0);
    // Столбик куплен — вернуть бесплатно.
    const g = s.gold;
    s = m.placePlayItem(s, 'post');
    expect(s.gold).toBe(g);
    // Расширение: только в кафе побольше.
    expect(m.playSizeBlocker(s)).toBe('house');
    s.life.house = 3;
    expect(m.playSizeBlocker(s)).toBe(null);
    s = m.upgradePlaySize(s);
    expect(s.life.play.size).toBe(1);
    expect(s.gold).toBe(g - PLAY_SIZES[1]!.cost);
    s = m.upgradePlaySize(s);
    expect(s.life.play.size).toBe(2);
    expect(m.playSizeBlocker(s)).toBe('max');
    for (const id of ['boxes', 'wheel', 'track', 'tower'] as const) s = m.placePlayItem(s, id);
    expect(s.life.play.items.length).toBe(8);
    expect(m.playBlocker(s, 'tower')).toBe('placed');
    expect(m.playBoredom(s.life.play)).toBeGreaterThanOrEqual(0.5);
    // Коврик.
    expect(m.setPlayRug(s, 'pink').life.play.rug).toBe('pink');
    expect(m.setPlayRug(s, 'nope')).toBe(s);
    // Зона помещается в кафе на своём размере и не налезает на столики и мебель.
    for (let t = 3; t < HOUSES.length; t += 1) {
      const lay = homeLayout([...FURNITURE], true, t, s.life.play);
      const pz = lay.find((x) => x.id === 'play_zone')!;
      for (const o of lay) if (o !== pz && o.box) expect(o.box.x1 <= pz.box!.x0 || o.box.x0 >= pz.box!.x1 || o.box.z1 <= pz.box!.z0 || o.box.z0 >= pz.box!.z1).toBe(true);
    }
    // Сохранение: зона восстанавливается, мусор отбрасывается.
    const back = migrateLife({ ...s.life, play: { size: 9, items: ['wheel', 'xxx', 'tower'], owned: ['wheel'], rug: '??' } } as unknown as Parameters<typeof migrateLife>[0]);
    expect(back.play.size).toBe(PLAY_SIZES.length - 1);
    expect(back.play.items).toEqual(['wheel']);
    expect(back.play.rug).toBe('mint');
    expect(migrateLife({ ...s.life, play: undefined } as unknown as Parameters<typeof migrateLife>[0]).play.items).toEqual(['tree', 'post', 'tunnel']);
  });
});

describe('перестановка вещей в доме', () => {
  it('двигать и поворачивать можно, на чужое место, за стены, на вход и вплотную — нельзя', async () => {
    const m = await import('../src/game/life');
    let s = cafe(4);
    s.life.furniture = ['armchair', 'painting', 'house_plant'];
    const lay = m.cafeLayout(s.life);
    const keys = lay.map((p) => p.key);
    for (const k of ['sofa', 'play_zone', 'cat_bowl', 'litter', 'armchair', 'painting', 'door']) expect(keys).toContain(k);
    // Кресло — в свободное место, повернуть на 90°.
    const free = { x: -3.0, z: 2.6, rot: Math.PI / 2 };
    expect(m.moveBlocker(s.life, 'armchair', free)).toBe(null);
    s = m.moveCafeItem(s, 'armchair', free);
    const a1 = m.cafeLayout(s.life).find((p) => p.key === 'armchair')!;
    expect(a1.pos).toEqual({ x: -3, z: 2.6 });
    expect(a1.rot).toBeCloseTo(Math.PI / 2, 5);
    // На стойку — нельзя; за стену — нельзя; на вход — нельзя.
    const zone = lay.find((p) => p.key === 'play_zone')!;
    expect(m.moveBlocker(s.life, 'sofa', { x: zone.pos.x, z: zone.pos.z, rot: Math.PI })).not.toBe(null);
    expect(m.moveBlocker(s.life, 'armchair', { x: 50, z: 0, rot: 0 })).toBe('out');
    const door = lay.find((p) => p.key === 'door')!;
    expect(m.moveBlocker(s.life, 'armchair', { x: door.use.x, z: door.use.z, rot: 0 })).not.toBe(null);
    expect(m.moveCafeItem(s, 'door', { x: 0, z: 0, rot: 0 })).toBe(s);
    // Картина вешается на ближайшую стену.
    s = m.moveCafeItem(s, 'painting', { x: m.cafeLayout(s.life).find((p) => p.key === 'door')!.pos.x + 0.3, z: -1.5, rot: 0 });
    const pic = m.cafeLayout(s.life).find((p) => p.key === 'painting')!;
    expect(pic.rot).toBeCloseTo(Math.PI / 2, 5);
    // Миски переехали — кошки едят там (позиция мисок из раскладки).
    const bowls0 = lay.find((p) => p.key === 'cat_bowl')!;
    expect(m.moveBlocker(s.life, 'cat_bowl', { x: bowls0.pos.x, z: bowls0.pos.z + 1.2, rot: 0 })).toBe(null);
    // Вернуть на место и сохранение.
    s = m.resetMoved(s, 'armchair');
    expect(s.life.moved.armchair).toBe(undefined);
    expect(migrateLife({ ...s.life, moved: { sofa: { x: 1, z: 2, rot: 1.6 }, bad: { x: 'a' } } } as unknown as Parameters<typeof migrateLife>[0]).moved).toEqual({ sofa: { x: 1, z: 2, rot: Math.PI / 2 } });
    expect(m.resetMoved(s, null).life.moved).toEqual({});
    // Проданная вещь забывает своё место.
    s = m.moveCafeItem(s, 'armchair', { x: -3.0, z: 2.6, rot: 0 });
    expect(s.life.moved.armchair).toBeTruthy();
    expect(m.sellFurniture(s, 'armchair').life.moved.armchair).toBe(undefined);
  });
});
