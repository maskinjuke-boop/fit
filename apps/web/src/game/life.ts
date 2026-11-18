import type { ExerciseId } from '../tracking/exercise';
import type { GameEvent } from './engine';
import { levelOf } from './levels';
import {
  ACTIONS,
  BOND_ENEMY,
  BOND_FRIEND,
  BOWL_MAX,
  LITTER_SIZE,
  PREGNANCY_DAYS,
  SIP,
  STARVE_HOURS,
  CAT_AGE,
  CAT_BREEDS,
  CAT_NAMES,
  CAT_RATES,
  DEMON_EXERCISES,
  DEMON_MAX_FACTOR,
  DEMON_STEP,
  FURNITURE,
  GRAVES_MAX,
  HOME_OBJECTS,
  HOUSES,
  LIFE_EVENTS,
  LITTER_DIRTY,
  OBJECTS,
  PLAY_BOREDOM_MIN,
  PLAY_ITEMS,
  PLAY_RUGS,
  PLAY_SIZES,
  PLAY_ZONE_BOREDOM,
  playItemById,
  WATER_RATE,
  actionById,
  lifeEventById,
  mountOf,
  slotsFor,
} from './lifeContent';
import { APARTMENT_DECOR, CAFE_DECOR, DECOR_KINDS, FINISHES, KITS, NEW_KIT, OLD_KIT, OLD_KIT_COMFORT, finishById, kitById, type KitId } from './homeDecor';
import { rng } from './random';
import type { GameState } from './state';
import type { ActionDef, Blood, Cat, CatBreed, DemonOffer, Grave, ItemSpot, LifeEffect, LifeResult, LifeState, ObjectId, PlayItemId, PlayZoneState, SceneId, Txt } from './lifeTypes';
import { PLAY_START, homeLayout, placeBlocker, playLayout, playSizeFits, type PlaceBlocker, type PlacedHome } from './lifeMap';
import { addDays } from './dates';
import { bloodOf, childBlood, looksOf, normBlood } from './catBlood';

/**
 * Кошачий дом. Людей нет: главные герои — кошки, игрок водит одну из них (её можно сменить),
 * остальные живут сами. Две локации — дом и лавка демона. Каждый реальный день у демона
 * появляется новая кошка: спасти её можно только упражнением перед камерой (демон
 * называет упражнение и число повторов, с каждой спасённой кошкой — больше), и только
 * до конца этого дня — иначе она пропадает. Спасённая кошка живёт в доме. Деньги — только
 * за упражнения (и картины лапками): на мебель, игрушки, ремонт и расширение дома;
 * расшириться можно, когда дом заполнен кошками. Время в доме идёт действиями кошки.
 */

export const DAY = 1440;

/** Первый кот, который живёт в доме с самого начала (рыжий, взрослый). Остальных — спасать у демона. */
export function starterCat(day = 1): Cat {
  return { id: 'cat1', breed: 'ginger', name: 1, adopted: day, fed: 85, play: 75, toilet: 100, drink: 90, starve: 0, sex: 'm', born: day - CAT_AGE.GROWN - 6, blood: { ginger: 1 } };
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
    pet: 'cat1',
    bonds: {},
    demon: null,
    graves: [],
    play: structuredClone(PLAY_START),
    moved: {},
    event: null,
    last: null,
    stats: { rescued: 0, lost: 0, repMoney: 0, played: 0 },
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
  // Родословная: из сохранения, иначе по породе (метис — пополам).
  const blood = c.blood ? normBlood(c.blood, c.breed) : bloodOf(c.breed, isBreed(c.mix) ? c.mix : undefined);
  const look = looksOf(blood);
  const out: Cat = {
    id: c.id,
    breed: look.breed,
    name: typeof c.name === 'number' ? c.name : 0,
    adopted: num(c.adopted, day),
    fed: num(c.fed, 80),
    play: num(c.play, 70),
    toilet: num(c.toilet, 90),
    drink: clamp(num(c.drink, 85), 0, 100),
    starve: Math.max(0, num(c.starve, 0)),
    sex,
    born: typeof c.born === 'number' ? c.born : num(c.adopted, day) - CAT_AGE.GROWN,
    blood,
  };
  if (look.mix) out.mix = look.mix;
  if (c.pregnant && typeof c.pregnant.father === 'string' && Number.isFinite(c.pregnant.due) && sex === 'f') out.pregnant = { father: c.pregnant.father, due: c.pregnant.due };
  if (Array.isArray(c.parents) && c.parents.length === 2) out.parents = [String(c.parents[0]), String(c.parents[1])];
  return out;
}

/** Отношения: только между кошками, которые живут в доме. */
function migrateBonds(raw: unknown, cats: readonly Cat[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  const ids = new Set(cats.map((c) => c.id));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const [a, b] = k.split('|');
    if (a && b && ids.has(a) && ids.has(b) && a !== b && typeof v === 'number' && Number.isFinite(v)) out[bondKey(a, b)] = clamp(v, -100, 100);
  }
  return out;
}

function migrateGraves(raw: unknown, offer: DemonOffer | null): Grave[] {
  const list = Array.isArray(raw) ? (raw as Partial<Grave>[]) : [];
  const out: Grave[] = [];
  for (const g of list) {
    if (!g || !isBreed(g.breed) || typeof g.day !== 'string') continue;
    const x: Grave = { name: num(g.name, 0), breed: g.breed, sex: g.sex === 'm' ? 'm' : 'f', day: g.day };
    if (isBreed(g.mix) && g.mix !== g.breed) x.mix = g.mix;
    if (g.cause === 'hunger' || g.cause === 'thirst') x.cause = g.cause;
    out.push(x);
  }
  // Кошка, пропавшая до появления могилок, тоже получает свою.
  if (!out.length && offer?.status === 'lost') out.push(graveOf(offer));
  return out.slice(-GRAVES_MAX);
}

const graveOf = (o: DemonOffer): Grave => {
  const g: Grave = { name: o.name, breed: o.breed, sex: o.sex, day: o.day };
  if (o.mix) g.mix = o.mix;
  return g;
};

const isPlayItem = (x: unknown): x is PlayItemId => PLAY_ITEMS.some((p) => p.id === x);

function migratePlay(raw: unknown): PlayZoneState {
  const r = (raw ?? {}) as Partial<PlayZoneState>;
  if (!raw || typeof raw !== 'object') return structuredClone(PLAY_START);
  const owned = [...new Set([...PLAY_START.owned, ...(Array.isArray(r.owned) ? r.owned.filter(isPlayItem) : [])])];
  const items = Array.isArray(r.items) ? [...new Set(r.items.filter((x) => isPlayItem(x) && owned.includes(x)))] : [...PLAY_START.items];
  return { size: clamp(Math.round(num(r.size, 0)), 0, PLAY_SIZES.length - 1), items, owned, rug: PLAY_RUGS.some((x) => x.id === r.rug) ? r.rug! : PLAY_START.rug };
}

function migrateMoved(raw: unknown): Record<string, ItemSpot> {
  const out: Record<string, ItemSpot> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, Partial<ItemSpot>>)) {
    if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) out[k] = { x: v.x!, z: v.z!, rot: Math.round(num(v.rot, 0) / (Math.PI / 2)) * (Math.PI / 2) };
  }
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
  out.blood = d.blood ? normBlood(d.blood, out.breed) : bloodOf(out.breed, out.mix);
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
    pet: typeof r.pet === 'string' && cats.some((c) => c.id === r.pet) ? r.pet : cats[0]!.id,
    bonds: migrateBonds(r.bonds, cats),
    demon: migrateOffer(r.demon),
    graves: migrateGraves(r.graves, migrateOffer(r.demon)),
    play: migratePlay(r.play),
    moved: migrateMoved(r.moved),
    event: r.event && lifeEventById(r.event.id) ? r.event : null,
    last: null,
    stats: {
      rescued: num(stats.rescued, 0),
      lost: num(stats.lost, 0),
      repMoney: num(stats.repMoney, 0),
      played: num(stats.played, 0),
    },
  };
  return out;
}

// ─── Показатели ────────────────────────────────────────────────────────

/** Уровень героя (растёт от упражнений перед камерой). */
export const heroLevel = (s: GameState): number => levelOf(s.totalXp);

export const hourOf = (minute: number): number => Math.floor(minute / 60);
export const clock = (minute: number): string => `${String(hourOf(minute)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
/** Ночь (0…7 ч): кошки больше спят. */
export const nightHour = (minute: number): boolean => hourOf(minute) < 7;

/** Лоток грязный: кошкам неуютно. */
export const litterDirty = (life: LifeState): boolean => life.cats.length > 0 && life.litter >= LITTER_DIRTY;

/** Уют от ремонта: отделка и базовая мебель (старьё — в минус). */
export function decorComfort(life: LifeState): number {
  const finish = DECOR_KINDS.reduce((a, k) => a + (finishById(life.decor[k])?.comfort ?? 0), 0);
  const kit = KITS.reduce((a, k) => a + (life.kit[k.id] ? 0 : OLD_KIT_COMFORT), 0);
  return finish + kit;
}

/** Уют дома: ремонт, мебель и декор, игровая зона, простор (до 40); грязный лоток его портит. */
export function comfort(life: LifeState): number {
  const items = [...life.furniture, ...HOME_OBJECTS].reduce((a, id) => a + (OBJECTS[id].comfort ?? 0), 0) + playComfort(life.play);
  const space = HOUSES[life.house]?.comfort ?? 0;
  return Math.max(0, Math.min(40, items + space + decorComfort(life)) - (litterDirty(life) ? 5 : 0));
}

/** Настроение кошки 0…100: сытость, вода, игра, туалет; грязный лоток, пустые миски — хуже. */
export function catMood(c: Cat, life: LifeState): number {
  let m = (c.fed + c.drink + c.play + c.toilet) / 4;
  if (litterDirty(life)) m -= 15;
  if (life.bowl <= 0 && c.fed < 40) m -= 10;
  if (life.water <= 0) m -= 10;
  return clamp(Math.round(m), 0, 100);
}

// ─── Игровая зона ──────────────────────────────────────────────────────

/** Уют от игровой зоны сверх базового: размер и игрушки. */
export function playComfort(play: PlayZoneState): number {
  return (PLAY_SIZES[play.size]?.comfort ?? 0) + playLayout(play).reduce((a, it) => a + playItemById(it.id).comfort, 0);
}

/** Во сколько раз медленнее скучают кошки: базовая зона и каждая игрушка в ней. */
export function playBoredom(play: PlayZoneState): number {
  return Math.max(PLAY_BOREDOM_MIN, PLAY_ZONE_BOREDOM - playLayout(play).reduce((a, it) => a + playItemById(it.id).fun, 0));
}

/** Свободных мест вида kind в зоне. */
export function playFree(play: PlayZoneState, kind: 'big' | 'small' | 'long'): number {
  const all = PLAY_SIZES[play.size]!.slots.filter((x) => x.kind === kind).length;
  return all - playLayout(play).filter((it) => playItemById(it.id).kind === kind).length;
}

export type PlayBlocker = 'placed' | 'space' | 'money' | null;

/** Поставить игрушку в зону: уже стоит, нет места её вида, нет денег (купленную — бесплатно). */
export function playBlocker(s: GameState, id: PlayItemId): PlayBlocker {
  const play = s.life.play;
  if (play.items.includes(id)) return 'placed';
  if (playFree(play, playItemById(id).kind) <= 0) return 'space';
  if (!play.owned.includes(id) && s.gold < playItemById(id).price) return 'money';
  return null;
}

/** Купить (если ещё нет) и поставить игрушку в зону. */
export function placePlayItem(state: GameState, id: PlayItemId): GameState {
  if (playBlocker(state, id)) return state;
  const s = structuredClone(state);
  const play = s.life.play;
  if (!play.owned.includes(id)) {
    s.gold -= playItemById(id).price;
    play.owned.push(id);
  }
  play.items.push(id);
  return s;
}

/** Убрать игрушку из зоны (остаётся купленной — вернуть можно бесплатно). */
export function removePlayItem(state: GameState, id: PlayItemId): GameState {
  if (!state.life.play.items.includes(id)) return state;
  const s = structuredClone(state);
  s.life.play.items = s.life.play.items.filter((x) => x !== id);
  return s;
}

export type PlaySizeBlocker = 'max' | 'house' | 'money' | null;

/** Расширить зону: следующий размер помещается в кафе этой ступени и хватает денег. */
export function playSizeBlocker(s: GameState): PlaySizeBlocker {
  const next = PLAY_SIZES[s.life.play.size + 1];
  if (!next) return 'max';
  if (s.life.house < next.needHouse || !playSizeFits(s.life.house, s.life.play.size + 1)) return 'house';
  if (s.gold < next.cost) return 'money';
  return null;
}

export function upgradePlaySize(state: GameState): GameState {
  if (playSizeBlocker(state)) return state;
  const s = structuredClone(state);
  s.life.play.size += 1;
  s.gold -= PLAY_SIZES[s.life.play.size]!.cost;
  // Зона стала больше — встаёт на своё место заново (переставить можно снова).
  delete s.life.moved.play_zone;
  return s;
}

/** Цвет коврика (бесплатно). */
export function setPlayRug(state: GameState, rug: string): GameState {
  if (!PLAY_RUGS.some((x) => x.id === rug) || state.life.play.rug === rug) return state;
  return { ...state, life: { ...state.life, play: { ...state.life.play, rug } } };
}

// ─── Перестановка ──────────────────────────────────────────────────────

/** Раскладка дома с перестановками игрока. */
export const cafeLayout = (life: LifeState): PlacedHome[] => homeLayout(life.furniture, life.cats.length > 0, life.house, life.play, life.moved);

/** Можно ли переставить предмет key в at (поворот кратно 90°). */
export const moveBlocker = (life: LifeState, key: string, at: ItemSpot): PlaceBlocker => placeBlocker(cafeLayout(life), key, at, life.house);

/** Переставить предмет (бесплатно), если туда можно. */
export function moveCafeItem(state: GameState, key: string, at: ItemSpot): GameState {
  const spot = { x: Math.round(at.x * 20) / 20, z: Math.round(at.z * 20) / 20, rot: Math.round(at.rot / (Math.PI / 2)) * (Math.PI / 2) };
  if (moveBlocker(state.life, key, spot)) return state;
  const s = structuredClone(state);
  s.life.moved[key] = spot;
  return s;
}

/** Вернуть предмет на место по умолчанию (all — все предметы). */
export function resetMoved(state: GameState, key: string | null): GameState {
  if (key ? !state.life.moved[key] : !Object.keys(state.life.moved).length) return state;
  const s = structuredClone(state);
  if (key) delete s.life.moved[key];
  else s.life.moved = {};
  return s;
}

// ─── Возраст кошек ─────────────────────────────────────────────────────

/** Возраст кошки в месяцах (один игровой день — месяц). */
export const catAge = (c: { born: number }, day: number): number => Math.max(0, day - c.born);
export const isKitten = (c: { born: number }, day: number): boolean => catAge(c, day) < CAT_AGE.KITTEN;
/** Рост 0.42…1: котёнок растёт до года. */
export const catGrowth = (c: { born: number }, day: number): number => Math.min(1, 0.42 + (0.58 * catAge(c, day)) / CAT_AGE.GROWN);

export const catName = (c: { name: number }): Txt => CAT_NAMES[c.name % CAT_NAMES.length]!;

/** Сколько кошек помещается в доме. */
export const maxCats = (life: LifeState): number => HOUSES[life.house]?.cats ?? 2;

function freeCatName(life: LifeState, r: () => number): number {
  const used = new Set(life.cats.map((c) => c.name % CAT_NAMES.length));
  let name = Math.floor(r() * CAT_NAMES.length);
  for (let i = 0; i < CAT_NAMES.length && used.has(name); i += 1) name = (name + 1) % CAT_NAMES.length;
  return name;
}

/** Кошка, которой управляет игрок. */
export const petOf = (life: LifeState): Cat | undefined => life.cats.find((c) => c.id === life.pet) ?? life.cats[0];

/** Взять под управление другую кошку. */
export function setPet(state: GameState, id: string): GameState {
  if (state.life.pet === id || !state.life.cats.some((c) => c.id === id)) return state;
  return { ...state, life: { ...state.life, pet: id } };
}

// ─── Отношения ─────────────────────────────────────────────────────────

export const bondKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** Отношения двух кошек −100…100 (0 — едва знакомы). */
export const bondOf = (life: LifeState, a: string, b: string): number => life.bonds[bondKey(a, b)] ?? 0;
function addBond(life: LifeState, a: string, b: string, d: number): void {
  if (a === b || !d) return;
  const k = bondKey(a, b);
  life.bonds[k] = clamp(Math.round(((life.bonds[k] ?? 0) + d) * 10) / 10, -100, 100);
}
/** Отношения словами: враги, не ладят, знакомы, приятели, друзья, не разлей вода. */
export function bondLevel(v: number): 'enemy' | 'cold' | 'known' | 'pal' | 'friend' | 'love' {
  if (v <= -60) return 'enemy';
  if (v <= BOND_ENEMY) return 'cold';
  if (v < 25) return 'known';
  if (v < BOND_FRIEND) return 'pal';
  if (v < 90) return 'friend';
  return 'love';
}

export type MateBlocker = 'sex' | 'young' | 'bond' | 'pregnant' | 'full' | null;

/** Могут ли две кошки завести котят: кот и кошка, обе взрослые, дружат, не беременна, есть место. */
export function mateBlocker(life: LifeState, a: Cat, b: Cat): MateBlocker {
  if (a.sex === b.sex) return 'sex';
  if (catAge(a, life.day) < CAT_AGE.ADULT || catAge(b, life.day) < CAT_AGE.ADULT) return 'young';
  if (bondOf(life, a.id, b.id) < BOND_FRIEND) return 'bond';
  if ((a.sex === 'f' ? a : b).pregnant) return 'pregnant';
  if (life.cats.length >= maxCats(life)) return 'full';
  return null;
}

const nextCatId = (life: LifeState): string => `cat${life.cats.reduce((m, c) => Math.max(m, Number(c.id.slice(3)) || 0), 0) + 1}`;

// ─── Время ─────────────────────────────────────────────────────────────

interface Tally {
  money: number;
  notes: Txt[];
}
const startTally = (): Tally => ({ money: 0, notes: [] });

/** Робот-пылесос собирает шерсть и наполнитель: лоток пачкается медленнее. */
const litterRate = (life: LifeState): number => (life.furniture.includes('robot_vacuum') ? 14 : 20);

/** Кошка умерла от голода или жажды. */
interface Death {
  cat: Cat;
  cause: 'hunger' | 'thirst';
}

/**
 * Жизнь кошек за hours игровых часов: проголодавшись, едят из миски (порция корма), пьют
 * воду, ходят в лоток (он пачкается), скучают без игры. Кошка игрока сама ест, пьёт и ходит
 * в лоток, только когда совсем припрёт — обычно этим управляет игрок. Без еды или воды кошка
 * держится STARVE_HOURS часов, потом умирает. Отношения: довольные кошки сближаются,
 * скучающие и голодные ссорятся. night — ночь.
 */
function catsLive(life: LifeState, hours: number, night: boolean, r: () => number): Death[] {
  const deaths: Death[] = [];
  for (const c of life.cats) {
    const mine = c.id === life.pet;
    c.fed = clamp(c.fed - CAT_RATES.fed * hours * (night ? 0.6 : 1), 0, 100);
    if (c.fed < (mine ? 12 : 45) && life.bowl > 0) {
      life.bowl -= 1;
      c.fed = clamp(c.fed + 55, 0, 100);
    }
    c.drink = clamp(c.drink - CAT_RATES.drink * hours * (night ? 0.6 : 1), 0, 100);
    if (c.drink < (mine ? 12 : 45) && life.water > 0) {
      life.water = clamp(life.water - SIP, 0, 100);
      c.drink = clamp(c.drink + 60, 0, 100);
    }
    c.toilet = clamp(c.toilet - CAT_RATES.toilet * hours, 0, 100);
    if (c.toilet < (mine ? 8 : 35)) {
      life.litter = clamp(life.litter + litterRate(life), 0, 100);
      c.toilet = 100;
    }
    // Ночью кошки спят; в игровой зоне играют сами — скучают медленнее.
    c.play = clamp(c.play - CAT_RATES.play * playBoredom(life.play) * hours * (night ? 0.4 : 1) * (isKitten(c, life.day) ? 1.5 : 1), 0, 100);
    // Без еды или воды — считаются часы; поела и попила — понемногу отходит.
    if (c.fed <= 0 || c.drink <= 0) c.starve += hours;
    else c.starve = Math.max(0, c.starve - hours * 2);
    if (c.starve >= STARVE_HOURS) deaths.push({ cat: c, cause: c.drink <= 0 ? 'thirst' : 'hunger' });
  }
  life.water = clamp(life.water - WATER_RATE * hours, 0, 100);
  // Отношения меняются сами: довольные — сближаются, скучающие и голодные — ссорятся.
  const cs = life.cats;
  for (let i = 0; i < cs.length; i += 1)
    for (let j = i + 1; j < cs.length; j += 1) {
      const a = cs[i]!;
      const b = cs[j]!;
      const happy = Math.min(a.play, b.play) > 55 && Math.min(a.fed, b.fed) > 40;
      const grumpy = Math.min(a.play, b.play) < 20 || Math.min(a.fed, b.fed) < 15;
      const d = (happy ? 0.8 : grumpy ? -1.2 : 0.1) * hours * (0.6 + r() * 0.8);
      addBond(life, a.id, b.id, d);
    }
  return deaths;
}

/** Умершие кошки: могилка с фото (в лавке демона), запись в итоге, кошка игрока — другая. */
function bury(s: GameState, deaths: Death[], tally: Tally): void {
  const life = s.life;
  for (const { cat, cause } of deaths) {
    if (!life.cats.includes(cat)) continue;
    life.cats = life.cats.filter((c) => c !== cat);
    for (const k of Object.keys(life.bonds)) if (k.split('|').includes(cat.id)) delete life.bonds[k];
    const g: Grave = { name: cat.name, breed: cat.breed, sex: cat.sex, day: `home-${life.day}-${cat.id}`, cause };
    if (cat.mix) g.mix = cat.mix;
    life.graves = [...life.graves, g].slice(-GRAVES_MAX);
    life.stats.lost += 1;
    const n = catName(cat);
    tally.notes.push(cause === 'thirst' ? { ru: `${n.ru} умерла от жажды…`, en: `${n.en} died of thirst…` } : { ru: `${n.ru} умерла от голода…`, en: `${n.en} died of hunger…` });
  }
  if (!life.cats.some((c) => c.id === life.pet)) life.pet = life.cats[0]?.id ?? '';
}

function passTime(s: GameState, minutes: number, tally: Tally = startTally()): void {
  const life = s.life;
  let left = minutes;
  while (left > 0) {
    const step = Math.min(left, DAY - life.minute, 60);
    const r = rng(`${s.character.id}:live:${life.day}:${life.minute}`);
    bury(s, catsLive(life, step / 60, nightHour(life.minute), r), tally);
    life.minute += step;
    left -= step;
    if (life.minute >= DAY) {
      life.minute -= DAY;
      life.day += 1;
      newGameDay(s, tally);
    }
  }
}

/** Новорождённые котята: кровь — средняя от родителей, сколько — до места в доме. */
function birth(s: GameState, mom: Cat, tally: Tally): void {
  const life = s.life;
  const p = mom.pregnant;
  if (!p) return;
  delete mom.pregnant;
  const dad = life.cats.find((c) => c.id === p.father);
  const r = rng(`${s.character.id}:birth:${mom.id}:${life.day}`);
  const want = LITTER_SIZE[0] + Math.floor(r() * (LITTER_SIZE[1] - LITTER_SIZE[0] + 1));
  const n = Math.min(want, maxCats(life) - life.cats.length);
  const born: Cat[] = [];
  for (let i = 0; i < n; i += 1) {
    const blood: Blood = childBlood(mom.blood, dad?.blood ?? mom.blood);
    const look = looksOf(blood);
    const kit: Cat = { id: nextCatId(life), breed: look.breed, name: freeCatName(life, r), adopted: life.day, fed: 90, play: 80, toilet: 100, drink: 90, starve: 0, sex: r() < 0.5 ? 'f' : 'm', born: life.day, blood, parents: [mom.id, p.father] };
    if (look.mix) kit.mix = look.mix;
    life.cats.push(kit);
    born.push(kit);
    // Мама и котята сразу родные.
    addBond(life, mom.id, kit.id, 80);
    if (dad) addBond(life, dad.id, kit.id, 50);
  }
  for (let i = 0; i < born.length; i += 1) for (let j = i + 1; j < born.length; j += 1) addBond(life, born[i]!.id, born[j]!.id, 70);
  life.stats.born = (life.stats.born ?? 0) + born.length;
  const m = catName(mom);
  tally.notes.push(born.length ? { ru: `У ${m.ru} родились котята: ${born.length}!`, en: `${m.en} had ${born.length} kitten(s)!` } : { ru: `У ${m.ru} могли быть котята, но в доме нет места.`, en: `${m.en} could have had kittens, but the home is full.` });
}

/** Новый игровой день: котята, утреннее событие. */
function newGameDay(s: GameState, tally: Tally): void {
  const life = s.life;
  for (const c of [...life.cats]) if (c.pregnant && life.day >= c.pregnant.due) birth(s, c, tally);
  const roll = rng(`${s.character.id}:life:${life.day}`);
  if (!life.event && roll() < 0.4) {
    const pool = LIFE_EVENTS.filter((e) => !e.needsCats || life.cats.length > 0);
    const ev = pool[Math.floor(roll() * pool.length)];
    if (ev) life.event = { id: ev.id };
  }
}

function applyEffect(s: GameState, e: LifeEffect, tally: Tally, target?: string): void {
  const life = s.life;
  if (e.money) {
    const before = s.gold;
    s.gold = Math.max(0, s.gold + e.money);
    tally.money += s.gold - before;
  }
  if (e.bowl) life.bowl = clamp(life.bowl + e.bowl, 0, BOWL_MAX);
  if (e.water) life.water = clamp(life.water + e.water, 0, 100);
  if (e.litter) life.litter = clamp(life.litter + e.litter, 0, 100);
  // Ласка и угощение достаются выбранной кошке, иначе — той (не своей), которой это нужнее всех.
  const others = life.cats.filter((c) => c.id !== life.pet);
  const pool = others.length ? others : life.cats;
  const neediest = (k: 'play' | 'fed'): Cat | undefined => pool.find((c) => c.id === target) ?? pool.reduce<Cat | undefined>((m, c) => (!m || c[k] < m[k] ? c : m), undefined);
  if (e.catPlay) {
    const c = neediest('play');
    if (c) c.play = clamp(c.play + e.catPlay, 0, 100);
  }
  if (e.catFed) {
    const c = neediest('fed');
    if (c) c.fed = clamp(c.fed + e.catFed, 0, 100);
  }
  if (e.catsPlay) for (const c of life.cats) c.play = clamp(c.play + e.catsPlay, 0, 100);
  const me = petOf(life);
  if (e.bond && me && target && target !== me.id && life.cats.some((c) => c.id === target)) addBond(life, me.id, target, e.bond);
  if (e.self && me) {
    if (e.self.drink) me.drink = clamp(me.drink + e.self.drink, 0, 100);
    if (e.self.fed) me.fed = clamp(me.fed + e.self.fed, 0, 100);
    if (e.self.play) {
      me.play = clamp(me.play + e.self.play, 0, 100);
      life.stats.played += 1;
    }
    if (e.self.toilet) me.toilet = clamp(me.toilet + e.self.toilet, 0, 100);
  }
}

// ─── Доступность действий ──────────────────────────────────────────────

export type Blocker = 'money' | 'missing' | 'enough' | 'empty' | 'nocat' | 'saved' | 'full' | 'sex' | 'young' | 'bond' | 'pregnant' | null;

/** Есть ли предмет в текущей локации. */
export function hasObject(s: GameState, id: ObjectId): boolean {
  const life = s.life;
  if (life.scene === 'demon') return id === 'demon' || id === 'demon_door' || (id === 'belt' && life.demon?.status === 'waiting') || (id === 'graves' && life.graves.length > 0);
  if (id === 'cat' || id === 'cat_bowl' || id === 'litter') return life.cats.length > 0;
  return HOME_OBJECTS.includes(id) || life.furniture.includes(id);
}

/** Можно ли сделать действие; target — кошка, с которой (для действий с кошкой). */
export function blocker(s: GameState, a: ActionDef, target?: string | null): Blocker {
  const life = s.life;
  if (!hasObject(s, a.at)) return 'missing';
  if (a.needItem && !life.play.items.includes(a.needItem)) return 'missing';
  if (a.needOther && life.cats.length < 2) return 'nocat';
  if (a.needMate) {
    const me = petOf(life);
    const others = life.cats.filter((c) => c.id !== me?.id);
    const pick = target ? others.filter((c) => c.id === target) : others;
    if (!me || !pick.length) return 'nocat';
    // Без выбранной кошки — причина у самой подходящей.
    const reasons = pick.map((c) => mateBlocker(life, me, c));
    if (!reasons.includes(null)) return reasons.sort((x, y) => MATE_ORDER.indexOf(y) - MATE_ORDER.indexOf(x))[0] ?? 'nocat';
  }
  // Миски и так полны, лоток и так чистый; миска пуста.
  if ((a.effect.bowl ?? 0) > 0 && life.bowl >= BOWL_MAX && life.water >= 90) return 'enough';
  if (a.effect.litter && a.effect.litter < 0 && life.litter < 5) return 'enough';
  if (a.needBowl && life.bowl <= 0) return 'empty';
  if ((a.effect.water ?? 0) < 0 && life.water <= 0) return 'empty';
  if (a.effect.self?.drink && (petOf(life)?.drink ?? 0) >= 92) return 'enough';
  // Своя кошка сыта или ей не нужно в лоток.
  const me = petOf(life);
  if (me && a.effect.self?.fed && a.effect.self.fed >= 20 && me.fed >= 90) return 'enough';
  if (me && a.effect.self?.toilet && me.toilet >= 90) return 'enough';
  if (a.rescue) {
    const o = life.demon;
    if (!o || o.status === 'lost') return 'nocat';
    if (o.status === 'saved') return 'saved';
    if (life.cats.length >= maxCats(life)) return 'full';
  }
  if ((a.cost ?? 0) > s.gold) return 'money';
  return null;
}

/** Чем ближе к «можно», тем позже в списке (показывается самая близкая причина). */
const MATE_ORDER: readonly MateBlocker[] = ['sex', 'young', 'pregnant', 'full', 'bond'];

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
  s.life.last = r;
}

/** Действие кошки игрока; target — другая кошка (для действий с кошкой). */
export function act(state: GameState, actionId: string, target?: string): LifeOutcome {
  const a = actionById(actionId);
  if (!a || state.life.event) return same(state);
  if (blocker(state, a, target)) return same(state);
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
  applyEffect(s, a.effect, tally, target);
  // Котята: кошка беременеет (котята — через PREGNANCY_DAYS игровых дней).
  if (a.needMate) {
    const me = petOf(life);
    const other = life.cats.find((c) => c.id === target && c.id !== me?.id) ?? life.cats.find((c) => me && c.id !== me.id && !mateBlocker(life, me, c));
    if (me && other && !mateBlocker(life, me, other)) {
      const mom = me.sex === 'f' ? me : other;
      const dad = mom === me ? other : me;
      mom.pregnant = { father: dad.id, due: life.day + PREGNANCY_DAYS };
      const m = catName(mom);
      tally.notes.push({ ru: `${m.ru} ждёт котят — через ${PREGNANCY_DAYS} дня.`, en: `${m.en} is expecting kittens in ${PREGNANCY_DAYS} days.` });
    }
  }
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
  if (mix && mix !== breed) {
    offer.mix = mix;
    // Метис: доля второй породы — от 1/8 до половины.
    offer.blood = bloodOf(breed, mix, [0.125, 0.25, 0.25, 0.375, 0.5][Math.floor(r() * 5)]!);
  } else offer.blood = { [breed]: 1 };
  return offer;
}

/** До конца реального дня (кошку ещё можно спасти), мс. */
export function offerLeftMs(now: Date): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - now.getTime());
}

/** Режим администратора: где кошка на ленте (доля пути), независимо от часов; null — по часам. */
let beltOverride: number | null = null;
export const setBeltOverride = (f: number | null): void => {
  beltOverride = f === null ? null : Math.min(1, Math.max(0, f));
};
export const getBeltOverride = (): number | null => beltOverride;

/** Доля прошедших суток (0 — полночь, 1 — следующая полночь): столько проехала кошка по ленте. */
export function dayFraction(now: Date): number {
  if (beltOverride !== null) return beltOverride;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
}

/** Завтрашняя кошка (сидит у демона на коленях): порода, пол и возраст — как у завтрашнего предложения. */
export const tomorrowOffer = (s: GameState): DemonOffer => makeOffer(s, addDays(s.today, 1));

/** Спасти кошку дня: она появляется в доме (s уже скопировано). */
function saveCat(s: GameState, events: GameEvent[]): void {
  const life = s.life;
  const o = life.demon;
  if (!o || o.status !== 'waiting') return;
  o.status = 'saved';
  o.progress = o.target;
  const blood = o.blood ?? bloodOf(o.breed, o.mix);
  const cat: Cat = { id: nextCatId(life), breed: o.breed, name: o.name, adopted: life.day, fed: 70, play: 60, toilet: 100, drink: 70, starve: 0, sex: o.sex, born: life.day - o.age, blood };
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
    // Доехала по ленте до конца и упала в жерло — ей ставят могилку с фото.
    o.status = 'lost';
    s.life.stats.lost += 1;
    s.life.graves = [...s.life.graves, graveOf(o)].slice(-GRAVES_MAX);
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
  // Убранная вещь ничего не возвращает (и забывает, куда её переставили).
  s.life.furniture = s.life.furniture.filter((x) => x !== id);
  delete s.life.moved[id];
  return s;
}

export type HouseBlocker = 'max' | 'cats' | 'money' | null;

/** Расшириться можно, когда в доме живёт достаточно кошек и хватает денег. */
export function houseBlocker(s: GameState): HouseBlocker {
  const next = HOUSES[s.life.house + 1];
  if (!next) return 'max';
  if (s.life.cats.length < next.needCats) return 'cats';
  if (s.gold < next.cost) return 'money';
  return null;
}

/** Расширить дом: больше места для мебели и кошек. */
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

// ─── Самостоятельность кошки игрока ─────────────────────────────────────

/** Сколько денег кошка не тратит сама (кроме корма). */
export const AUTO_RESERVE = 40;
/** Сколько последних дел кошка помнит, чтобы не повторять одно и то же. */
export const AUTO_MEMORY = 6;
/** С какой пользы дело срочное (голод, лоток, пустая миска) — его кошка делает и между делами. */
export const AUTO_URGENT = 25;

/** Польза дела для своей кошки и остальных. */
function actionValue(state: GameState, a: ActionDef): number {
  const life = state.life;
  const me = petOf(life);
  const e = a.effect;
  if (!me) return -Infinity;
  if (a.id === 'eat') return me.fed < 30 ? 32 : me.fed < 55 ? 14 : -Infinity;
  if (a.id === 'drink') return me.drink < 30 ? 31 : me.drink < 60 ? 12 : -Infinity;
  // Котят и ссоры кошка сама не затевает.
  if (a.needMate || a.id === 'hiss_cat') return -Infinity;
  if (a.id === 'use_litter') return me.toilet < 30 ? 31 : me.toilet < 50 ? 12 : -Infinity;
  if (a.id === 'ask_food') return life.bowl === 0 || life.water < 10 ? 30 : life.bowl <= 1 || life.water < 30 ? 14 : -Infinity;
  if (a.id === 'clean_litter') return life.litter >= LITTER_DIRTY ? 28 + (life.litter - LITTER_DIRTY) * 0.3 : life.litter >= 35 ? 8 : -Infinity;
  // Ночью кошка охотнее спит.
  if (a.id === 'nap_sofa' || a.id === 'house_nap' || a.id === 'armchair' || a.id === 'hammock_nap') return nightHour(life.minute) ? 9 : me.play > 70 ? 5 : 2;
  const others = life.cats.filter((c) => c.id !== me.id);
  const minOther = Math.min(100, ...others.map((c) => c.play));
  let v = 0;
  if (e.self?.play) v += Math.max(0, 80 - me.play) * 0.25 + e.self.play * 0.08;
  if (e.catPlay) v += Math.max(0, 70 - minOther) * 0.2 + 1;
  if (e.catsPlay) v += Math.max(0, 70 - Math.min(minOther, me.play)) * 0.12 * Math.max(1, life.cats.length / 2) + 1;
  if (e.money) v += e.money * 0.12;
  if (a.cost) v -= a.cost * 0.3;
  return v;
}

/** Можно ли кошке самой заплатить за действие. */
function affordable(state: GameState, a: ActionDef): boolean {
  const cost = a.cost ?? 0;
  if (!cost) return true;
  return a.id === 'ask_food' ? state.gold >= cost : state.gold - cost >= AUTO_RESERVE;
}

/** Срочное ли дело: голод, лоток, пустые миски. */
function pressing(life: LifeState, a: ActionDef): boolean {
  const me = petOf(life);
  if (a.id === 'eat') return !!me && me.fed < 30;
  if (a.id === 'drink') return !!me && me.drink < 30;
  if (a.id === 'use_litter') return !!me && me.toilet < 30;
  if (a.id === 'ask_food') return life.bowl === 0 || life.water < 10;
  if (a.id === 'clean_litter') return life.litter >= LITTER_DIRTY;
  return false;
}

/**
 * Что кошка игрока сделает сама: самое полезное дело (еда, лоток, игра, другие кошки).
 * Спасение кошки — только с игроком. Из лавки демона возвращается домой.
 * urgentOnly — только срочное. null — делать нечего.
 */
export function autoChoice(state: GameState, recent: readonly string[] = [], urgentOnly = false): { action: ActionDef; leisure: boolean } | null {
  const life = state.life;
  if (life.event || !life.cats.length) return null;
  if (life.scene === 'demon') {
    const back = actionById('go_cafe');
    return back && !urgentOnly ? { action: back, leisure: false } : null;
  }
  const mem = recent.slice(-AUTO_MEMORY);
  const repeats = (id: string): number => mem.reduce((n, x, i) => n + (x === id ? 0.5 + (i + 1) / mem.length : 0), 0);
  let best: ActionDef | null = null;
  let score = urgentOnly ? AUTO_URGENT : 3;
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

// ─── Для режима администратора (тесты дома и лавки) ────────────────────

/** Добавить кошку породы breed сразу в дом (в обход демона), если есть место. */
export function adminAddCat(state: GameState, breed: CatBreed, kitten = false): GameState {
  if (state.life.cats.length >= maxCats(state.life)) return state;
  const s = structuredClone(state);
  const life = s.life;
  const r = rng(`${s.character.id}:admin-cat:${life.cats.length}:${life.day}:${life.minute}`);
  const cat: Cat = { id: nextCatId(life), breed, name: freeCatName(life, r), adopted: life.day, fed: 80, play: 70, toilet: 100, drink: 80, starve: 0, sex: r() < 0.5 ? 'f' : 'm', born: life.day - (kitten ? 2 : CAT_AGE.GROWN + 6), blood: { [breed]: 1 } };
  if (!life.cats.length) {
    life.bowl = BOWL_MAX;
    life.water = 100;
    life.litter = 0;
  }
  life.cats.push(cat);
  return s;
}

/** Заполнить дом кошками разных пород до предела ступени. */
export function adminFillCats(state: GameState): GameState {
  let s = state;
  for (let i = 0; s.life.cats.length < maxCats(s.life) && i < 20; i += 1) s = adminAddCat(s, CAT_BREEDS[(s.life.cats.length + i) % CAT_BREEDS.length]!.id);
  return s;
}

/** Убрать кошек из дома (all — всех, кроме своей; иначе последнюю чужую). */
export function adminRemoveCats(state: GameState, all: boolean): GameState {
  const others = state.life.cats.filter((c) => c.id !== state.life.pet);
  if (!others.length) return state;
  const s = structuredClone(state);
  const drop = all ? new Set(others.map((c) => c.id)) : new Set([others[others.length - 1]!.id]);
  s.life.cats = s.life.cats.filter((c) => !drop.has(c.id));
  return s;
}

/** Потребности всех кошек: голодные, скучающие, «приспичило» (low) — или всё на максимум. */
export function adminCatNeeds(state: GameState, v: { fed?: number; play?: number; toilet?: number; drink?: number; starve?: number }): GameState {
  const s = structuredClone(state);
  for (const c of s.life.cats) {
    if (v.drink !== undefined) c.drink = v.drink;
    if (v.starve !== undefined) c.starve = v.starve;
    if (v.fed !== undefined) c.fed = v.fed;
    if (v.play !== undefined) c.play = v.play;
    if (v.toilet !== undefined) c.toilet = v.toilet;
  }
  return s;
}

/** Кошку дня не спасли: падает в жерло прямо сейчас (могилка, событие). */
export function adminDropCat(state: GameState): { state: GameState; events: GameEvent[] } {
  const o = state.life.demon;
  if (!o || o.status !== 'waiting') return { state, events: [] };
  const s = structuredClone(state);
  const d = s.life.demon!;
  d.status = 'lost';
  s.life.stats.lost += 1;
  s.life.graves = [...s.life.graves, graveOf(d)].slice(-GRAVES_MAX);
  return { state: s, events: [{ kind: 'catLost', name: d.name, breed: d.breed }] };
}

/** Другая кошка дня (порода, упражнение, повторы — заново), прогресс сброшен. */
export function adminRerollOffer(state: GameState, n: number): GameState {
  const s = structuredClone(state);
  const o = makeOffer(s, `${s.today}#${n}`);
  o.day = s.today;
  s.life.demon = o;
  return s;
}

/** Могилки: убрать все или добавить n тестовых (разные породы и имена). */
export function adminGraves(state: GameState, add: number): GameState {
  const s = structuredClone(state);
  if (add <= 0) s.life.graves = [];
  else {
    const at = s.life.graves.length;
    for (let i = 0; i < add; i += 1) s.life.graves.push({ name: (at + i * 5) % CAT_NAMES.length, breed: CAT_BREEDS[(at + i) % CAT_BREEDS.length]!.id, sex: i % 2 ? 'm' : 'f', day: `admin-${at + i}` });
    s.life.graves = s.life.graves.slice(-GRAVES_MAX);
  }
  return s;
}

/** Ступень дома напрямую (без условий); лишние кошки остаются, пока их не убрать. */
export function adminSetHouse(state: GameState, tier: number): GameState {
  const s = structuredClone(state);
  s.life.house = clamp(Math.round(tier), 0, HOUSES.length - 1);
  return s;
}

/** Промотать время в доме на minutes (кошки едят, пьют, ходят в лоток, скучают, могут умереть). */
export function adminSkipTime(state: GameState, minutes: number): GameState {
  const s = structuredClone(state);
  const tally = startTally();
  passTime(s, minutes, tally);
  if (tally.notes.length) finish(s, '⏩', { ru: 'Время прошло', en: 'Time passed' }, true, minutes, tally);
  return s;
}

/** Все кошки дома дружат (для проверки котят) или всё забыто (null). */
export function adminBonds(state: GameState, v: number | null): GameState {
  const s = structuredClone(state);
  const cs = s.life.cats;
  s.life.bonds = {};
  if (v !== null) for (let i = 0; i < cs.length; i += 1) for (let j = i + 1; j < cs.length; j += 1) s.life.bonds[bondKey(cs[i]!.id, cs[j]!.id)] = v;
  return s;
}

/** Добавить метиса: кровь — смесь двух пород (доля второй share). */
export function adminAddMix(state: GameState, a: CatBreed, b: CatBreed, share = 0.5): GameState {
  const s = adminAddCat(state, a);
  if (s === state) return state;
  const c = s.life.cats[s.life.cats.length - 1]!;
  c.blood = normBlood(bloodOf(a, b, share), a);
  const look = looksOf(c.blood);
  c.breed = look.breed;
  if (look.mix) c.mix = look.mix;
  else delete c.mix;
  return s;
}

/** Поставить время суток (hour:00) без прохода времени. */
export function adminSetHour(state: GameState, hour: number): GameState {
  const s = structuredClone(state);
  s.life.minute = clamp(Math.round(hour), 0, 23) * 60;
  return s;
}

/** Вся мебель для дома, вся отделка куплена, базовая мебель новая. */
export function adminBuyAll(state: GameState): GameState {
  const s = structuredClone(state);
  s.life.furniture = [...FURNITURE];
  s.life.finishes = [...new Set([...s.life.finishes, ...FINISHES.map((f) => f.id)])];
  for (const k of KITS) s.life.kit[k.id] = 1;
  s.life.play.owned = PLAY_ITEMS.map((x) => x.id);
  return s;
}

/** Вызвать утреннее событие id прямо сейчас. */
export function adminEvent(state: GameState, id: string): GameState {
  if (!lifeEventById(id)) return state;
  const s = structuredClone(state);
  s.life.event = { id };
  return s;
}

/** Перейти в локацию (дом или лавка демона) без траты времени. */
export function adminScene(state: GameState, scene: SceneId): GameState {
  if (state.life.scene === scene) return state;
  return { ...state, life: { ...state.life, scene, last: null } };
}
