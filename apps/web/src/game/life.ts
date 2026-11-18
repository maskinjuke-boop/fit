import type { ExerciseId } from '../tracking/exercise';
import type { GameEvent } from './engine';
import type { Slot } from './items';
import { levelOf } from './levels';
import {
  ACTIONS,
  BOWL_MAX,
  CAT_AGE,
  CAT_BREEDS,
  CAT_NAMES,
  CAT_RATES,
  DEMON_EXERCISES,
  DEMON_MAX_FACTOR,
  DEMON_STEP,
  FOOD,
  FURNITURE,
  GUESTS_PER_CAT,
  GUEST_NAMES,
  HOME_OBJECTS,
  HOUSES,
  LIFE_EVENTS,
  LITTER_DIRTY,
  NIGHT_GUESTS,
  NIGHT_HOURS,
  OBJECTS,
  PLAY_ZONE_BOREDOM,
  TICKET,
  WATER_RATE,
  actionById,
  lifeEventById,
  mountOf,
  slotsFor,
} from './lifeContent';
import { APARTMENT_DECOR, CAFE_DECOR, DECOR_KINDS, KITS, NEW_KIT, OLD_KIT, OLD_KIT_COMFORT, finishById, kitById, type KitId } from './homeDecor';
import { rng } from './random';
import { FACE_PARTS, type Appearance, type FacePart, type GameState, type HairStyle } from './state';
import type { ActionDef, Cat, CatBreed, DemonOffer, LifeEffect, LifeResult, LifeState, ObjectId, SceneId, Txt } from './lifeTypes';

/**
 * Котокафе. Две локации — своё кафе и лавка демона. Каждый реальный день у демона
 * появляется новая кошка: спасти её можно только упражнением перед камерой (демон
 * называет упражнение и число повторов, с каждой спасённой кошкой — больше), и только
 * до конца этого дня — иначе она пропадает. Спасённая кошка живёт в кафе. Гости
 * приходят круглосуточно (ночью — меньше) поиграть с кошками и платят за вход, за столиками
 * заказывают еду с витрины (продукты закупаются или пекутся). Чем больше довольных кошек и
 * чем уютнее кафе, тем больше гостей. Деньги — на мебель, декор, ремонт и расширение кафе;
 * расшириться можно, когда кафе заполнено кошками. Время в кафе идёт действиями.
 */

export const DAY = 1440;

/**
 * Первый кот, который живёт в кафе с самого начала (рыжий Барсик, взрослый): с ним сразу
 * приходят гости. Остальных кошек — только спасать у демона.
 */
export function starterCat(day = 1): Cat {
  return { id: 'cat1', breed: 'ginger', name: 1, adopted: day, fed: 85, play: 75, toilet: 100, sex: 'm', born: day - CAT_AGE.GROWN - 6 };
}

export function newLife(): LifeState {
  return {
    day: 1,
    minute: 10 * 60,
    scene: 'cafe',
    furniture: [],
    cats: [starterCat()],
    bowl: BOWL_MAX,
    water: 100,
    litter: 0,
    house: 0,
    decor: { ...CAFE_DECOR },
    finishes: [...START_FINISHES],
    kit: { ...OLD_KIT },
    food: FOOD.batch,
    guests: 0,
    buzz: 0,
    demon: null,
    event: null,
    last: null,
    stats: { visitors: 0, earned: 0, rescued: 0, lost: 0, repMoney: 0, meals: 0 },
  };
}

/** Отделка, которая есть с самого начала: стартовая отделка кафе и «без ковра». */
const START_FINISHES: readonly string[] = [...new Set([...Object.values(CAFE_DECOR), 'rug_none'])];

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const isBreed = (b: unknown): b is CatBreed => CAT_BREEDS.some((x) => x.id === b);

/**
 * Отделка и мебель из сохранения (ступень кафе — как ступень прежнего жилья). Сохранение
 * времён квартиры (без стартовой отделки кафе): старьё и простой ремонт, который игра
 * ставила сама, сменяет отделка кафе; купленное сохраняется в запасе.
 */
function migrateHome(r: Partial<LifeState>): Pick<LifeState, 'house' | 'decor' | 'finishes' | 'kit'> {
  const house = clamp(Math.round(num(r.house, 0)), 0, HOUSES.length - 1);
  const saved = Array.isArray(r.finishes) ? r.finishes.filter((id) => finishById(id)) : [];
  const apartment = !saved.includes(CAFE_DECOR.wall);
  const finishes = [...new Set([...START_FINISHES, ...saved])];
  const decor = { ...CAFE_DECOR };
  const hasDecor = !!r.decor && typeof r.decor === 'object';
  for (const k of DECOR_KINDS) {
    const id = hasDecor ? r.decor![k] : undefined;
    if (typeof id !== 'string' || finishById(id)?.kind !== k || !finishes.includes(id)) continue;
    if (apartment && APARTMENT_DECOR[k] === id) continue;
    decor[k] = id;
  }
  const kit = hasDecor ? { ...OLD_KIT } : { ...NEW_KIT };
  for (const k of KITS) if (r.kit?.[k.id] === 1) kit[k.id] = 1;
  return { house, decor, finishes, kit };
}

function migrateCat(c: Partial<Cat> & { id: string; breed: CatBreed }, day: number): Cat {
  const sex = c.sex === 'f' || c.sex === 'm' ? c.sex : (Number(c.id.replace(/\D/g, '')) || 0) % 2 ? 'f' : 'm';
  const out: Cat = {
    id: c.id,
    breed: c.breed,
    name: typeof c.name === 'number' ? c.name : 0,
    adopted: num(c.adopted, day),
    fed: num(c.fed, 80),
    play: num(c.play, 70),
    toilet: num(c.toilet, 90),
    sex,
    born: typeof c.born === 'number' ? c.born : num(c.adopted, day) - CAT_AGE.GROWN,
  };
  if (isBreed(c.mix) && c.mix !== c.breed) out.mix = c.mix;
  return out;
}

function migrateOffer(o: unknown): DemonOffer | null {
  const d = o as Partial<DemonOffer> | null;
  if (!d || typeof d.day !== 'string' || !isBreed(d.breed) || !DEMON_EXERCISES.some(([e]) => e === d.exercise)) return null;
  const out: DemonOffer = {
    day: d.day,
    breed: d.breed,
    sex: d.sex === 'm' ? 'm' : 'f',
    name: num(d.name, 0),
    age: num(d.age, CAT_AGE.ADULT),
    exercise: d.exercise!,
    target: Math.max(1, num(d.target, 20)),
    progress: Math.max(0, num(d.progress, 0)),
    status: d.status === 'saved' || d.status === 'lost' ? d.status : 'waiting',
  };
  if (isBreed(d.mix) && d.mix !== d.breed) out.mix = d.mix;
  return out;
}

/**
 * Старые сохранения (жизнь тренера) переводятся в котокафе: кошки, мебель для кафе,
 * ремонт и ступень помещения сохраняются, зал и ученики — нет.
 */
export function migrateLife(raw: Partial<LifeState> | undefined): LifeState {
  const base = newLife();
  if (!raw) return base;
  const r = raw as Partial<LifeState> & Record<string, unknown>;
  const day = num(r.day, base.day);
  const home = migrateHome(r);
  const saved = Array.isArray(r.cats) ? r.cats.filter((c) => isBreed(c.breed)).map((c) => migrateCat(c, day)).slice(0, HOUSES[home.house]!.cats) : [];
  // Кафе без кошек (сохранение до стартового кота) получает первого кота с полными мисками.
  const cats = saved.length ? saved : [starterCat(day)];
  const stats = (r.stats ?? {}) as Partial<LifeState['stats']>;
  const out: LifeState = {
    ...base,
    day,
    minute: num(r.minute, base.minute),
    scene: r.scene === 'demon' ? 'demon' : 'cafe',
    furniture: [...new Set((r.furniture ?? []).filter((id) => FURNITURE.includes(id)))],
    cats,
    bowl: saved.length && typeof r.bowl === 'number' ? r.bowl : BOWL_MAX,
    water: saved.length && typeof r.water === 'number' ? r.water : 100,
    litter: saved.length ? num(r.litter, 0) : 0,
    ...home,
    food: clamp(Math.round(num(r.food, FOOD.batch)), 0, HOUSES[home.house]!.food),
    guests: 0,
    buzz: clamp(num(r.buzz, 0), -5, 20),
    demon: migrateOffer(r.demon),
    event: r.event && lifeEventById(r.event.id) ? r.event : null,
    last: null,
    stats: {
      visitors: num(stats.visitors, 0),
      earned: num(stats.earned, 0),
      rescued: num(stats.rescued, 0),
      lost: num(stats.lost, 0),
      repMoney: num(stats.repMoney, 0),
      meals: num(stats.meals, 0),
    },
  };
  // Гости, которые сейчас в кафе (их число не хранится между запусками).
  out.guests = Math.round(guestDemand(out));
  return out;
}

// ─── Показатели ────────────────────────────────────────────────────────

/** Уровень героя (растёт от упражнений перед камерой). */
export const heroLevel = (s: GameState): number => levelOf(s.totalXp);

export const hourOf = (minute: number): number => Math.floor(minute / 60);
export const clock = (minute: number): string => `${String(hourOf(minute)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
/** Ночь: кафе открыто, но гостей меньше, кошки больше спят. */
export const nightHour = (minute: number): boolean => hourOf(minute) >= NIGHT_HOURS[0] && hourOf(minute) < NIGHT_HOURS[1];
/** Сколько порций еды помещается на витрине. */
export const maxFood = (life: LifeState): number => HOUSES[life.house]?.food ?? 12;

/** Лоток грязный: кошкам неуютно, гостей меньше. */
export const litterDirty = (life: LifeState): boolean => life.cats.length > 0 && life.litter >= LITTER_DIRTY;

/** Уют от ремонта: отделка и базовая мебель (старьё — в минус). */
export function decorComfort(life: LifeState): number {
  const finish = DECOR_KINDS.reduce((a, k) => a + (finishById(life.decor[k])?.comfort ?? 0), 0);
  const kit = KITS.reduce((a, k) => a + (life.kit[k.id] ? 0 : OLD_KIT_COMFORT), 0);
  return finish + kit;
}

/** Уют кафе: ремонт, мебель и декор, игровая зона, простор (до 40); грязный лоток его портит. */
export function comfort(life: LifeState): number {
  const items = [...life.furniture, ...HOME_OBJECTS].reduce((a, id) => a + (OBJECTS[id].comfort ?? 0), 0);
  const space = HOUSES[life.house]?.comfort ?? 0;
  return Math.max(0, Math.min(40, items + space + decorComfort(life)) - (litterDirty(life) ? 5 : 0));
}

/** Цена входа: базовая плюс уют. */
export const ticket = (life: LifeState): number => TICKET.base + TICKET.perComfort * comfort(life);

/** Сколько гостей кафе вмещает. */
export const seats = (life: LifeState): number => HOUSES[life.house]?.seats ?? 3;

/** Настроение кошки 0…100: сытость, игра, туалет; грязный лоток, пустые миски — хуже. */
export function catMood(c: Cat, life: LifeState): number {
  let m = (c.fed + c.play + c.toilet) / 3;
  if (litterDirty(life)) m -= 15;
  if (life.bowl <= 0 && c.fed < 40) m -= 10;
  if (life.water <= 0) m -= 10;
  return clamp(Math.round(m), 0, 100);
}

/**
 * Сколько гостей в кафе: довольные кошки, уют и реклама; ночью и без еды на витрине — меньше;
 * не больше мест.
 */
export function guestDemand(life: LifeState): number {
  if (!life.cats.length) return 0;
  const moodK = life.cats.reduce((a, c) => a + 0.35 + 0.65 * (catMood(c, life) / 100), 0);
  const k = (nightHour(life.minute) ? NIGHT_GUESTS : 1) * (life.food > 0 ? 1 : FOOD.noFood);
  const raw = (moodK * GUESTS_PER_CAT * (1 + 0.03 * comfort(life)) + life.buzz) * k;
  return clamp(raw, 0, seats(life));
}

/** Примерный доход в час (для подсказок): вход и еда (если она есть на витрине). */
export const hourlyIncome = (life: LifeState): number => Math.round((guestDemand(life) / 1.5) * (ticket(life) + (life.food > 0 ? FOOD.chance * FOOD.price : 0)));

// ─── Возраст кошек ─────────────────────────────────────────────────────

/** Возраст кошки в месяцах (один игровой день — месяц). */
export const catAge = (c: { born: number }, day: number): number => Math.max(0, day - c.born);
export const isKitten = (c: { born: number }, day: number): boolean => catAge(c, day) < CAT_AGE.KITTEN;
/** Рост 0.42…1: котёнок растёт до года. */
export const catGrowth = (c: { born: number }, day: number): number => Math.min(1, 0.42 + (0.58 * catAge(c, day)) / CAT_AGE.GROWN);

export const catName = (c: { name: number }): Txt => CAT_NAMES[c.name % CAT_NAMES.length]!;

/** Сколько кошек помещается в кафе. */
export const maxCats = (life: LifeState): number => HOUSES[life.house]?.cats ?? 2;

function freeCatName(life: LifeState, r: () => number): number {
  const used = new Set(life.cats.map((c) => c.name % CAT_NAMES.length));
  let name = Math.floor(r() * CAT_NAMES.length);
  for (let i = 0; i < CAT_NAMES.length && used.has(name); i += 1) name = (name + 1) % CAT_NAMES.length;
  return name;
}

const nextCatId = (life: LifeState): string => `cat${life.cats.reduce((m, c) => Math.max(m, Number(c.id.slice(3)) || 0), 0) + 1}`;

// ─── Время ─────────────────────────────────────────────────────────────

interface Tally {
  money: number;
  guests: number;
  notes: Txt[];
}
const startTally = (): Tally => ({ money: 0, guests: 0, notes: [] });

/** Робот-пылесос собирает шерсть и наполнитель: лоток пачкается медленнее. */
const litterRate = (life: LifeState): number => (life.furniture.includes('robot_vacuum') ? 14 : 20);

/**
 * Жизнь кошек за hours игровых часов: проголодавшись, едят из миски (порция корма),
 * ходят в лоток (он пачкается), скучают без игры; гости с ними играют. night — ночь.
 */
function catsLive(life: LifeState, hours: number, night: boolean, guests: number): void {
  if (!life.cats.length) return;
  const fun = (guests * 6 * hours) / life.cats.length;
  for (const c of life.cats) {
    c.fed = clamp(c.fed - CAT_RATES.fed * hours * (night ? 0.6 : 1), 0, 100);
    if (c.fed < 45 && life.bowl > 0) {
      life.bowl -= 1;
      c.fed = clamp(c.fed + 55, 0, 100);
    }
    c.toilet = clamp(c.toilet - CAT_RATES.toilet * hours, 0, 100);
    if (c.toilet < 35) {
      life.litter = clamp(life.litter + litterRate(life), 0, 100);
      c.toilet = 100;
    }
    // Ночью кошки спят, днём скучают, но гости с ними играют.
    // В игровой зоне кошки играют сами — скучают медленнее.
    c.play = clamp(c.play - CAT_RATES.play * PLAY_ZONE_BOREDOM * hours * (night ? 0.4 : 1) * (isKitten(c, life.day) ? 1.5 : 1) + fun, 0, 100);
    life.water = clamp(life.water - WATER_RATE * hours * (night ? 0.6 : 1), 0, 100);
  }
}

/**
 * Гости за шаг времени: сколько пришло (платят за вход), сколько заказало еду с витрины
 * (платят сверху) и сколько сейчас в кафе.
 */
function guestsCome(s: GameState, hours: number, tally: Tally, key: string): number {
  const life = s.life;
  const demand = guestDemand(life);
  // Гость сидит около полутора часов: приходит demand / 1.5 человек в час.
  const r = rng(key);
  const expect = (demand / 1.5) * hours;
  let come = Math.floor(expect);
  if (r() < expect - come) come += 1;
  let meals = 0;
  for (let i = 0; i < come && life.food > 0; i += 1) {
    if (r() >= FOOD.chance) continue;
    life.food -= 1;
    meals += 1;
  }
  life.stats.meals += meals;
  const pay = come * ticket(life) + meals * FOOD.price;
  s.gold += pay;
  life.stats.earned += pay;
  life.stats.visitors += come;
  tally.money += pay;
  tally.guests += come;
  life.guests = Math.round(demand);
  return demand;
}

function passTime(s: GameState, minutes: number, tally: Tally): void {
  const life = s.life;
  let left = minutes;
  while (left > 0) {
    const step = Math.min(left, DAY - life.minute, 60);
    const hours = step / 60;
    const guests = guestsCome(s, hours, tally, `${s.character.id}:guests:${life.day}:${life.minute}`);
    catsLive(life, hours, nightHour(life.minute), guests);
    life.minute += step;
    left -= step;
    if (life.minute >= DAY) {
      life.minute -= DAY;
      life.day += 1;
      newGameDay(s);
    }
  }
  life.guests = Math.round(guestDemand(life));
}

/** Новый игровой день: утреннее событие. */
function newGameDay(s: GameState): void {
  const life = s.life;
  const roll = rng(`${s.character.id}:life:${life.day}`);
  life.buzz = 0;
  if (!life.event && roll() < 0.4) {
    const pool = LIFE_EVENTS.filter((e) => !e.needsCats || life.cats.length > 0);
    const ev = pool[Math.floor(roll() * pool.length)];
    if (ev) life.event = { id: ev.id };
  }
}

function applyEffect(s: GameState, e: LifeEffect, tally: Tally): void {
  const life = s.life;
  if (e.money) {
    const before = s.gold;
    s.gold = Math.max(0, s.gold + e.money);
    tally.money += s.gold - before;
  }
  if (e.bowl) life.bowl = clamp(life.bowl + e.bowl, 0, BOWL_MAX);
  if (e.water) life.water = clamp(life.water + e.water, 0, 100);
  if (e.litter) life.litter = clamp(life.litter + e.litter, 0, 100);
  // Ласка и угощение достаются кошке, которой это нужнее всех.
  const neediest = (k: 'play' | 'fed'): Cat | undefined => life.cats.reduce<Cat | undefined>((m, c) => (!m || c[k] < m[k] ? c : m), undefined);
  if (e.catPlay) {
    const c = neediest('play');
    if (c) c.play = clamp(c.play + e.catPlay, 0, 100);
  }
  if (e.catFed) {
    const c = neediest('fed');
    if (c) c.fed = clamp(c.fed + e.catFed, 0, 100);
  }
  if (e.catsPlay) for (const c of life.cats) c.play = clamp(c.play + e.catsPlay, 0, 100);
  if (e.buzz) life.buzz = clamp(life.buzz + e.buzz, -5, 20);
  if (e.food) life.food = clamp(life.food + e.food, 0, maxFood(life));
}

// ─── Доступность действий ──────────────────────────────────────────────

export type Blocker = 'money' | 'missing' | 'enough' | 'empty' | 'nocat' | 'saved' | 'full' | null;

/** Есть ли предмет в текущей локации. */
export function hasObject(s: GameState, id: ObjectId): boolean {
  const life = s.life;
  if (life.scene === 'demon') return id === 'demon' || id === 'demon_door' || (id === 'cage' && life.demon?.status === 'waiting');
  if (id === 'cat' || id === 'cat_bowl' || id === 'litter') return life.cats.length > 0;
  return HOME_OBJECTS.includes(id) || life.furniture.includes(id);
}

export function blocker(s: GameState, a: ActionDef): Blocker {
  const life = s.life;
  if (!hasObject(s, a.at)) return 'missing';
  // Миски и так полны, лоток и так чистый.
  if (a.effect.bowl && life.bowl >= BOWL_MAX && life.water >= 90) return 'enough';
  if (a.effect.litter && a.effect.litter < 0 && life.litter < 5) return 'enough';
  // Витрина и так полна; заказ некому принести.
  if (a.effect.food && life.food >= maxFood(life)) return 'enough';
  if (a.at === 'table' && life.guests <= 0) return 'empty';
  if (a.rescue) {
    const o = life.demon;
    if (!o || o.status === 'lost') return 'nocat';
    if (o.status === 'saved') return 'saved';
    if (life.cats.length >= maxCats(life)) return 'full';
  }
  if ((a.cost ?? 0) > s.gold) return 'money';
  return null;
}

export const actionsAt = (id: ObjectId): ActionDef[] => ACTIONS.filter((a) => a.at === id);

// ─── Действия ──────────────────────────────────────────────────────────

export interface LifeOutcome {
  state: GameState;
  /** Открыть упражнение демона перед камерой. */
  rescue?: ExerciseId;
  train?: boolean;
  open?: ActionDef['open'];
}

const same = (state: GameState): LifeOutcome => ({ state });

function finish(s: GameState, icon: string, text: Txt, ok: boolean, minutes: number, tally: Tally): void {
  const r: LifeResult = { icon, text, ok, money: tally.money, minutes, notes: tally.notes };
  if (tally.guests) r.guests = tally.guests;
  s.life.last = r;
}

export function act(state: GameState, actionId: string): LifeOutcome {
  const a = actionById(actionId);
  if (!a || state.life.event) return same(state);
  if (blocker(state, a)) return same(state);
  if (a.open) return { state, open: a.open };
  if (a.rescue) return { state, rescue: state.life.demon!.exercise };
  if (a.train) return { state, train: true };
  const s = structuredClone(state);
  const life = s.life;
  const tally = startTally();
  if (a.cost) {
    s.gold -= a.cost;
    tally.money -= a.cost;
  }
  const minutes = a.minutes;
  passTime(s, minutes, tally);
  applyEffect(s, a.effect, tally);
  if (a.go) life.scene = a.go;
  if (a.go && tally.notes.length === 0 && !tally.money) life.last = null;
  else finish(s, a.icon, a.label, true, minutes, tally);
  return { state: s };
}

// ─── Кошка дня у демона ────────────────────────────────────────────────

/** Сколько повторов демон просит за кошку: растёт с каждой спасённой. */
export function demonTarget(base: number, rescued: number): number {
  return Math.round(base * Math.min(DEMON_MAX_FACTOR, 1 + DEMON_STEP * rescued));
}

/** Кошка дня: порода, пол, возраст, имя и упражнение — по дню и герою (одинаковы весь день). */
export function makeOffer(s: GameState, day: string): DemonOffer {
  const r = rng(`${s.character.id}:demon:${day}`);
  const breed = CAT_BREEDS[Math.floor(r() * CAT_BREEDS.length)]!.id;
  // Иногда — метис.
  const mixRoll = r();
  const mix = mixRoll < 0.25 ? CAT_BREEDS[Math.floor(r() * CAT_BREEDS.length)]!.id : undefined;
  const [exercise, base] = DEMON_EXERCISES[Math.floor(r() * DEMON_EXERCISES.length)]!;
  const offer: DemonOffer = {
    day,
    breed,
    sex: r() < 0.5 ? 'f' : 'm',
    name: freeCatName(s.life, r),
    // Котёнок от 3 месяцев до взрослой двухлетней кошки.
    age: 3 + Math.floor(r() * 22),
    exercise,
    target: demonTarget(base, s.life.stats.rescued),
    progress: 0,
    status: 'waiting',
  };
  if (mix && mix !== breed) offer.mix = mix;
  return offer;
}

/** До конца реального дня (кошку ещё можно спасти), мс. */
export function offerLeftMs(now: Date): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - now.getTime());
}

/** Спасти кошку дня: она появляется в кафе (s уже скопировано). */
function saveCat(s: GameState, events: GameEvent[]): void {
  const life = s.life;
  const o = life.demon;
  if (!o || o.status !== 'waiting') return;
  o.status = 'saved';
  o.progress = o.target;
  const cat: Cat = { id: nextCatId(life), breed: o.breed, name: o.name, adopted: life.day, fed: 70, play: 60, toilet: 100, sex: o.sex, born: life.day - o.age };
  if (o.mix) cat.mix = o.mix;
  // С первой кошкой появляются миски (полные корма и воды) и чистый лоток.
  if (life.cats.length === 0) {
    life.bowl = BOWL_MAX;
    life.water = 100;
    life.litter = 0;
  }
  // Кошки зовут по имени — если имя занято, берётся свободное.
  if (life.cats.some((c) => c.name % CAT_NAMES.length === cat.name % CAT_NAMES.length)) cat.name = freeCatName(life, rng(`${s.character.id}:name:${o.day}`));
  life.cats.push(cat);
  life.stats.rescued += 1;
  events.push({ kind: 'catSaved', name: cat.name, breed: cat.breed });
}

/** Повтор перед камерой: деньги, кошка дня продвигается (s уже скопировано). */
export function lifeOnRep(s: GameState, exercise: ExerciseId, events: GameEvent[]): void {
  const life = s.life;
  const o = life.demon;
  if (!o || o.status !== 'waiting' || o.day !== s.today || o.exercise !== exercise) return;
  if (life.cats.length >= maxCats(life)) return;
  o.progress += 1;
  if (o.progress >= o.target) saveCat(s, events);
}

/** Деньги за повтор (в пределах дневного лимита упражнения). */
export function lifeRepMoney(s: GameState, amount: number): void {
  if (amount <= 0) return;
  s.gold += amount;
  s.life.stats.repMoney += amount;
}

/**
 * Смена реального дня: если кошку дня не спасли — она пропадает; у демона появляется новая.
 */
export function lifeNewRealDay(s: GameState, prev: string, today: string, events: GameEvent[]): void {
  const o = s.life.demon;
  if (o && o.day !== today && o.status === 'waiting') {
    o.status = 'lost';
    s.life.stats.lost += 1;
    events.push({ kind: 'catLost', name: o.name, breed: o.breed });
  }
  if (!s.life.demon || s.life.demon.day !== today) s.life.demon = makeOffer(s, today);
  void prev;
}

// ─── Событие, мебель, расширение ───────────────────────────────────────

export function answerEvent(state: GameState, choiceId: string): GameState {
  const ev = state.life.event ? lifeEventById(state.life.event.id) : undefined;
  const c = ev?.choices.find((x) => x.id === choiceId);
  if (!ev || !c || (c.cost ?? 0) > state.gold) return state;
  const s = structuredClone(state);
  const tally = startTally();
  if (c.cost) {
    s.gold -= c.cost;
    tally.money -= c.cost;
  }
  applyEffect(s, c.effect, tally);
  s.life.event = null;
  finish(s, ev.icon, c.text, true, 0, tally);
  return s;
}

export type FurnitureBlocker = 'owned' | 'money' | 'space' | null;

export function furnitureBlocker(s: GameState, id: ObjectId): FurnitureBlocker {
  const o = OBJECTS[id];
  if (o.price === undefined || s.life.furniture.includes(id)) return 'owned';
  const mount = mountOf(id);
  if (s.life.furniture.filter((x) => mountOf(x) === mount).length >= slotsFor(mount, s.life.house)) return 'space';
  if (s.gold < o.price) return 'money';
  return null;
}

export function buyFurniture(state: GameState, id: ObjectId): GameState {
  if (furnitureBlocker(state, id)) return state;
  const s = structuredClone(state);
  s.gold -= OBJECTS[id].price!;
  s.life.furniture.push(id);
  return s;
}

export function sellFurniture(state: GameState, id: ObjectId): GameState {
  if (!state.life.furniture.includes(id)) return state;
  const s = structuredClone(state);
  // Убранная вещь ничего не возвращает.
  s.life.furniture = s.life.furniture.filter((x) => x !== id);
  return s;
}

export type HouseBlocker = 'max' | 'cats' | 'money' | null;

/** Расшириться можно, когда в кафе живёт достаточно кошек и хватает денег. */
export function houseBlocker(s: GameState): HouseBlocker {
  const next = HOUSES[s.life.house + 1];
  if (!next) return 'max';
  if (s.life.cats.length < next.needCats) return 'cats';
  if (s.gold < next.cost) return 'money';
  return null;
}

/** Расширить кафе: зал больше, мест для мебели, кошек, гостей, столиков и еды больше. */
export function upgradeHouse(state: GameState): GameState {
  if (houseBlocker(state)) return state;
  const s = structuredClone(state);
  s.life.house += 1;
  const h = HOUSES[s.life.house]!;
  s.gold -= h.cost;
  finish(s, h.icon, h.name, true, 0, startTally());
  return s;
}

// ─── Ремонт ────────────────────────────────────────────────────────────

export type FinishBlocker = 'current' | 'level' | 'money' | null;

/** Можно ли выбрать отделку: уже стоит, рано по уровню, не хватает денег (купленную — бесплатно). */
export function finishBlocker(s: GameState, id: string): FinishBlocker {
  const def = finishById(id);
  if (!def || s.life.decor[def.kind] === id) return 'current';
  if (s.life.finishes.includes(id)) return null;
  if (heroLevel(s) < (def.level ?? 1)) return 'level';
  if (s.gold < def.price) return 'money';
  return null;
}

/** Сделать отделку: купить (если ещё нет) и сразу поставить; старая остаётся в запасе. */
export function applyFinish(state: GameState, id: string): GameState {
  if (finishBlocker(state, id)) return state;
  const def = finishById(id)!;
  const s = structuredClone(state);
  if (!s.life.finishes.includes(id)) {
    s.gold -= def.price;
    s.life.finishes.push(id);
  }
  s.life.decor[def.kind] = id;
  return s;
}

export type KitBlocker = 'owned' | 'money' | null;

export function kitBlocker(s: GameState, id: KitId): KitBlocker {
  if (s.life.kit[id]) return 'owned';
  if (s.gold < kitById(id).price) return 'money';
  return null;
}

/** Заменить старую базовую мебель новой. */
export function upgradeKit(state: GameState, id: KitId): GameState {
  if (kitBlocker(state, id)) return state;
  const s = structuredClone(state);
  s.gold -= kitById(id).price;
  s.life.kit[id] = 1;
  return s;
}

/** Сколько всего ещё можно улучшить (для подсказки): старая базовая мебель. */
export function oldStuff(life: LifeState): number {
  return KITS.filter((k) => !life.kit[k.id]).length;
}

export function dismissResult(state: GameState): GameState {
  if (!state.life.last) return state;
  return { ...state, life: { ...state.life, last: null } };
}

// ─── Гости как персонажи ───────────────────────────────────────────────

const HAIR: Record<'male' | 'female', HairStyle[]> = { male: ['short', 'buzz', 'curly'], female: ['long', 'ponytail', 'bob', 'bun', 'curly'] };

/** Гость кафе (внешность по номеру): кто сидит в кафе в этот час. */
export interface Guest {
  id: string;
  seed: number;
  figure: 'male' | 'female';
  name: Txt;
}

export function guestOf(seed: number): Guest {
  const r = rng(`guest:${seed}`);
  const figure = r() < 0.55 ? 'female' : 'male';
  const names = GUEST_NAMES[figure];
  return { id: `g${seed}`, seed, figure, name: names[Math.floor(r() * names.length)]! };
}

/** Гости в кафе сейчас: меняются каждый час (номера — по дню и часу). */
export function guestsNow(life: LifeState): Guest[] {
  const n = Math.min(life.guests, seats(life));
  // Состав меняется постепенно: чётные места — каждые два часа, нечётные — со сдвигом на час.
  const h = life.day * 24 + hourOf(life.minute);
  return Array.from({ length: n }, (_, i) => guestOf(Math.floor((h + (i % 2)) / 2) * 37 + i * 7 + 1));
}

/** Черты лица по номеру: у каждого своё лицо (значения ближе к середине). */
export function guestFace(seed: number): Partial<Record<FacePart, number>> {
  const r = rng(`face:${seed}`);
  const face: Partial<Record<FacePart, number>> = {};
  for (const k of FACE_PARTS) face[k] = Math.round(Math.max(-1, Math.min(1, (r() + r() - 1) * 1.6)) * 100) / 100;
  return face;
}

export function guestAppearance(g: Guest): Appearance {
  const r = rng(`look:${g.seed}`);
  const hair = HAIR[g.figure][Math.floor(r() * HAIR[g.figure].length)]!;
  const fat = (r() - 0.4) * 0.8;
  return {
    figure: g.figure,
    skin: Math.floor(r() * 6),
    hair,
    hairColor: Math.floor(r() * 4),
    beard: g.figure === 'male' && r() < 0.3,
    eyes: Math.floor(r() * 6),
    face: guestFace(g.seed),
    body: { weight: fat },
  };
}

const GUEST_TOPS = ['basic_tee', 'hoodie', 'button_shirt', 'crop_top', 'denim_crop'];
const GUEST_BOTTOMS = ['jeans', 'cargo_pants', 'mini_skirt', 'pleated_skirt', 'ripped_jeans'];

/** Повседневная одежда гостя. */
export function guestOutfit(g: Guest): Partial<Record<Slot, string>> {
  const r = rng(`outfit:${g.seed}`);
  const top = g.figure === 'male' ? (r() < 0.5 ? 'basic_tee' : r() < 0.5 ? 'hoodie' : 'button_shirt') : GUEST_TOPS[Math.floor(r() * GUEST_TOPS.length)]!;
  const bottom = g.figure === 'male' ? (r() < 0.6 ? 'jeans' : 'cargo_pants') : GUEST_BOTTOMS[Math.floor(r() * GUEST_BOTTOMS.length)]!;
  return { body: top, legs: bottom, feet: r() < 0.5 ? 'sneakers' : 'chelsea_boots' };
}

// ─── Самостоятельность героя ───────────────────────────────────────────

/** Сколько денег сим не тратит сам (кроме корма кошкам). */
export const AUTO_RESERVE = 40;
/** Сколько последних дел сим помнит, чтобы не повторять одно и то же. */
export const AUTO_MEMORY = 6;
/** С какой пользы дело срочное (пустая миска, грязный лоток, пустая витрина) — его сим делает и между делами. */
export const AUTO_URGENT = 25;

/** Польза дела для кафе: кошки, гости, деньги. */
function actionValue(state: GameState, a: ActionDef): number {
  const life = state.life;
  const e = a.effect;
  if (a.effect.food) {
    // Пустая витрина — срочно; закупка быстрее выпечки, пока на неё есть деньги.
    const low = life.food === 0 ? 27 : life.food < maxFood(life) * 0.3 ? 12 : -Infinity;
    return a.cost ? low + 2 : low;
  }
  if (a.id === 'serve') return life.guests > 0 ? 5 : -Infinity;
  if (a.id === 'fill_bowl') return life.bowl === 0 || life.water < 10 ? 30 : life.bowl <= 1 || life.water < 30 ? 14 : -Infinity;
  if (a.id === 'clean_litter') return life.litter >= LITTER_DIRTY ? 28 + (life.litter - LITTER_DIRTY) * 0.3 : life.litter >= 35 ? 8 : -Infinity;
  if (a.id === 'call_cat' || a.id === 'relax' || a.id === 'armchair') return -Infinity;
  const minPlay = Math.min(100, ...life.cats.map((c) => c.play));
  let v = 0;
  if (e.catPlay) v += Math.max(0, 70 - minPlay) * 0.25 + 2;
  if (e.catsPlay) v += Math.max(0, 70 - minPlay) * 0.15 * Math.max(1, life.cats.length / 2) + 1;
  if (e.catFed) v += Math.max(0, 50 - Math.min(100, ...life.cats.map((c) => c.fed))) * 0.3;
  if ((e.buzz ?? 0) > 0) v += life.buzz < 4 && life.cats.length ? 6 + e.buzz! * 2 : 0;
  if (e.money) v += e.money * 0.12;
  if (a.cost) v -= a.cost * 0.3;
  return v;
}

/** Можно ли симу самому заплатить за действие. */
function affordable(state: GameState, a: ActionDef): boolean {
  const cost = a.cost ?? 0;
  if (!cost) return true;
  return a.id === 'fill_bowl' || a.id === 'restock' ? state.gold >= cost : state.gold - cost >= AUTO_RESERVE;
}

/** Срочное ли дело: пустые миски, грязный лоток, пустая витрина. */
function pressing(life: LifeState, a: ActionDef): boolean {
  if (a.id === 'fill_bowl') return life.bowl === 0 || life.water < 10;
  if (a.id === 'clean_litter') return life.litter >= LITTER_DIRTY;
  if (a.effect.food) return life.food === 0;
  return false;
}

/**
 * Что сим сделает сам: самое полезное дело в кафе (кошки, гости, еда, порядок). Упражнения
 * и спасение кошки — только с игроком. Из лавки демона
 * возвращается в кафе. urgentOnly — только срочное. null — делать нечего.
 */
export function autoChoice(state: GameState, recent: readonly string[] = [], urgentOnly = false): { action: ActionDef; leisure: boolean } | null {
  const life = state.life;
  if (life.event) return null;
  if (life.scene === 'demon') {
    const back = actionById('go_cafe');
    return back && !urgentOnly ? { action: back, leisure: false } : null;
  }
  const mem = recent.slice(-AUTO_MEMORY);
  const repeats = (id: string): number => mem.reduce((n, x, i) => n + (x === id ? 0.5 + (i + 1) / mem.length : 0), 0);
  let best: ActionDef | null = null;
  let score = urgentOnly ? AUTO_URGENT : 5;
  const jitter = rng(`${life.day}:${life.minute}:${mem.length}`);
  for (const a of ACTIONS) {
    if (a.train || a.rescue || a.open || a.go || !hasObject(state, a.at) || blocker(state, a) || !affordable(state, a)) continue;
    if (urgentOnly && !pressing(life, a)) continue;
    const v = actionValue(state, a) - repeats(a.id) * 6 + jitter() * 2;
    if (v > score) {
      score = v;
      best = a;
    }
  }
  return best ? { action: best, leisure: !pressing(life, best) } : null;
}

export function autoAction(state: GameState, recent: readonly string[] = []): ActionDef | null {
  return autoChoice(state, recent)?.action ?? null;
}

export type { SceneId };
