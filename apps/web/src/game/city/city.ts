import type { ExerciseId } from '../../tracking/exercise';
import { addDays, daysBetween } from '../dates';
import { rng } from '../random';
import type { GameState } from '../state';
import {
  BUILDINGS,
  CATCH_UP_MAX,
  CLEAR_ASH,
  COATS,
  DAY_MIN,
  DEMOLISH_REFUND,
  FIRE_MS,
  FIRE_SHARE,
  MAP,
  OFFERING_POOL,
  OFFERING_REWARD,
  OFFERING_SIZE,
  START_GOLD,
  TOWNS,
  buildingById,
  professionById,
} from './content';
import { buildingAt, catName, decide, hire, news, residents, spawnCat, stepCity, townLevel } from './sim';
import type { Building, BuildingId, CityCat, CityState, Offering } from './types';

/**
 * Город кошек: создание, сохранение, действия игрока (строить, сносить, расчищать пепел),
 * подношение богам и пожар без него, ход времени.
 */

/** Пастельные цвета стен (номер хранится в здании). */
export const TINTS = ['#ffd6c9', '#ffe9b8', '#d7f0d2', '#cfe5ff', '#ead9ff', '#ffd0e4', '#fff3d6', '#d6f3ef'] as const;

const clampN = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Новое поселение: храм, домик с первой кошкой-пекарем и пекарня. */
export function newCity(name: string, day: string, now = Date.now()): CityState {
  const c: CityState = {
    name,
    clock: 7 * 60,
    lastReal: now,
    buildings: [],
    cats: [],
    nextId: 1,
    offering: null,
    graceDay: day,
    news: [],
    lost: [],
    stats: { arrived: 0, burned: 0, offerings: 0, repMoney: 0 },
    town: 0,
    arriveAt: null,
  };
  const add = (type: BuildingId, gx: number, gz: number, tint = 0): Building => {
    const b: Building = { id: c.nextId++, kind: buildingById(type).kind, type, gx, gz, level: 1, fund: 0, visits: 0, tint };
    c.buildings.push(b);
    return b;
  };
  add('temple', 0, 0);
  const home = add('house', -1, 0, 0);
  add('bakery', 1, 0, 1);
  add('garden', 0, 1, 2);
  const k = spawnCat(c, rng(`start:${name}`));
  if (k) {
    k.profession = 'baker';
    k.work = null;
    hire(c, k);
    k.home = home.id;
    // Сразу дома, на крыльце.
    k.x = home.gx * 4 + 0.6;
    k.z = home.gz * 4 + 1.4;
    k.act = { kind: 'relax', at: home.id, until: c.clock + 30, use: 'porch', spot: 0, dur: 30 };
    k.money = 30;
  }
  c.news = [];
  c.offering = makeOffering(c, day, name);
  return c;
}

/** Старое или испорченное сохранение — новое поселение. */
export function migrateCity(raw: unknown, day: string): CityState {
  const r = raw as Partial<CityState> | undefined;
  if (!r || !Array.isArray(r.buildings) || !Array.isArray(r.cats) || !r.buildings.some((b) => b?.kind === 'temple')) return newCity('Мурлыкино', day);
  const buildings = r.buildings.filter((b) => b && BUILDINGS.some((d) => d.id === b.type));
  const ids = new Set(buildings.map((b) => b.id));
  const cats = r.cats
    .filter((k) => k && typeof k.id === 'number' && COATS.some((x) => x.id === k.coat))
    .map((k) => ({
      ...k,
      home: k.home !== null && ids.has(k.home) ? k.home : null,
      work: k.work !== null && ids.has(k.work) ? k.work : null,
      items: Array.isArray(k.items) ? k.items : [],
      needs: { food: clampN(k.needs?.food, 60), energy: clampN(k.needs?.energy, 60), fun: clampN(k.needs?.fun, 60), social: clampN(k.needs?.social, 60) },
      act: k.act && typeof k.act.until === 'number' ? k.act : { kind: 'relax' as const, at: null, until: 0 },
    }));
  return {
    name: typeof r.name === 'string' && r.name ? r.name : 'Мурлыкино',
    clock: clampN(r.clock, 7 * 60),
    lastReal: clampN(r.lastReal, Date.now()),
    buildings,
    cats,
    nextId: Math.max(clampN(r.nextId, 1), ...buildings.map((b) => b.id + 1), ...cats.map((k) => k.id + 1)),
    offering: r.offering && Array.isArray(r.offering.tasks) ? r.offering : null,
    graceDay: typeof r.graceDay === 'string' ? r.graceDay : day,
    news: Array.isArray(r.news) ? r.news : [],
    lost: Array.isArray(r.lost) ? r.lost : [],
    stats: { arrived: clampN(r.stats?.arrived, 0), burned: clampN(r.stats?.burned, 0), offerings: clampN(r.stats?.offerings, 0), repMoney: clampN(r.stats?.repMoney, 0) },
    town: clampN(r.town, 0),
    arriveAt: typeof r.arriveAt === 'number' ? r.arriveAt : null,
  };
}

// ─── Время ─────────────────────────────────────────────────────────────

/** Досчитать жизнь города до реального времени now (пока игра была закрыта — не больше ~3 игровых дней). */
export function advanceCity(c: CityState, now: number): void {
  const dt = (now - c.lastReal) / 1000;
  c.lastReal = now;
  if (dt <= 0) return;
  stepCity(c, Math.min(dt, CATCH_UP_MAX));
}

// ─── Стройка ───────────────────────────────────────────────────────────

/** Сколько клеток от храма можно застраивать. */
export const buildRadius = (c: CityState): number => TOWNS[townLevel(c)]!.radius;
export const tileAt = (c: CityState, gx: number, gz: number): Building | undefined => c.buildings.find((b) => b.gx === gx && b.gz === gz);

export type BuildBlocker = 'locked' | 'busy' | 'money' | 'town' | null;

export function buildBlocker(s: GameState, type: BuildingId, gx: number, gz: number): BuildBlocker {
  const c = s.city;
  const d = buildingById(type);
  if (Math.max(Math.abs(gx), Math.abs(gz)) > Math.min(MAP, buildRadius(c))) return 'locked';
  if (tileAt(c, gx, gz)) return 'busy';
  if (townLevel(c) < d.town) return 'town';
  if (s.gold < d.cost) return 'money';
  return null;
}

/** Построить здание на клетке (за деньги игрока). */
export function build(state: GameState, type: BuildingId, gx: number, gz: number): GameState {
  if (buildBlocker(state, type, gx, gz)) return state;
  const s = structuredClone(state);
  const c = s.city;
  const d = buildingById(type);
  s.gold -= d.cost;
  const b: Building = { id: c.nextId++, kind: d.kind, type, gx, gz, level: 1, fund: 0, visits: 0, tint: (c.nextId * 3) % TINTS.length };
  c.buildings.push(b);
  news(c, 'build', d.icon, { ru: `Построено: ${d.name.ru.toLowerCase()}`, en: `Built: ${d.name.en.toLowerCase()}` });
  // Мастерская — безработные этой профессии сразу получают работу.
  if (d.kind === 'workshop') for (const k of c.cats) if (k.work === null) hire(c, k);
  return s;
}

export type DemolishBlocker = 'occupied' | 'fixed' | null;
export function demolishBlocker(c: CityState, b: Building): DemolishBlocker {
  if (b.kind === 'temple' || b.kind === 'ash') return 'fixed';
  if (b.kind === 'house' && residents(c, b).length) return 'occupied';
  return null;
}

/** Снести здание (часть денег возвращается). Работники остаются без работы. */
export function demolish(state: GameState, id: number): GameState {
  const b0 = buildingAt(state.city, id);
  if (!b0 || demolishBlocker(state.city, b0)) return state;
  const s = structuredClone(state);
  const c = s.city;
  const b = buildingAt(c, id)!;
  s.gold += Math.floor(buildingById(b.type).cost * DEMOLISH_REFUND);
  c.buildings = c.buildings.filter((x) => x.id !== id);
  for (const k of c.cats) {
    if (k.work === id) k.work = null;
    if (k.act.at === id) decide(c, k);
  }
  for (const k of c.cats) if (k.work === null) hire(c, k);
  return s;
}

/** Расчистить пепелище. */
export function clearAsh(state: GameState, id: number): GameState {
  const b = buildingAt(state.city, id);
  if (!b || b.kind !== 'ash' || state.gold < CLEAR_ASH) return state;
  const s = structuredClone(state);
  s.gold -= CLEAR_ASH;
  s.city.buildings = s.city.buildings.filter((x) => x.id !== id);
  return s;
}

export function renameCity(state: GameState, name: string): GameState {
  const n = name.trim().slice(0, 24);
  if (!n) return state;
  const s = structuredClone(state);
  s.city.name = n;
  return s;
}

// ─── Подношение богам ──────────────────────────────────────────────────

/** Подношение на день: OFFERING_SIZE упражнений, повторов больше с ростом поселения. */
export function makeOffering(c: CityState, day: string, seed: string): Offering {
  const r = rng(`${seed}:offering:${day}`);
  const pool = [...OFFERING_POOL];
  const k = Math.min(2.5, 1 + 0.05 * c.cats.length);
  const tasks: Offering['tasks'] = [];
  while (tasks.length < OFFERING_SIZE && pool.length) {
    const [ex, base] = pool.splice(Math.floor(r() * pool.length), 1)[0]!;
    tasks.push({ exercise: ex, target: Math.round(base * k), done: 0 });
  }
  return { day, tasks, complete: false };
}

/** Повтор засчитан: прогресс подношения (только сегодняшнего). */
export function cityOnRep(s: GameState, exercise: ExerciseId): boolean {
  const o = s.city.offering;
  if (!o || o.complete || o.day !== s.today) return false;
  const task = o.tasks.find((x) => x.exercise === exercise && x.done < x.target);
  if (!task) return false;
  task.done += 1;
  if (o.tasks.every((x) => x.done >= x.target)) {
    o.complete = true;
    s.gold += OFFERING_REWARD;
    s.city.stats.offerings += 1;
    news(s.city, 'offering', '✨', { ru: 'Подношение принято — боги довольны и благословляют город', en: 'The offering is accepted — the gods are pleased and bless the town' });
    return true;
  }
  return false;
}

/** Деньги игроку за повтор. */
export function cityRepMoney(s: GameState, amount: number): void {
  if (amount <= 0) return;
  s.gold += amount;
  s.city.stats.repMoney += amount;
}

/** Гнев богов: сгорает часть жилых домов, их жители погибают. Возвращает число домов и погибших. */
export function burn(c: CityState, seed: string, now = Date.now()): { houses: number; cats: string[] } {
  const r = rng(`${seed}:fire`);
  const lived = c.buildings.filter((b) => b.kind === 'house' && residents(c, b).length > 0);
  const pool = lived.length ? lived : c.buildings.filter((b) => b.kind === 'house');
  if (!pool.length) return { houses: 0, cats: [] };
  const n = Math.max(1, Math.round(pool.length * FIRE_SHARE));
  const order = [...pool].sort(() => r() - 0.5).slice(0, n);
  const dead: CityCat[] = [];
  for (const b of order) {
    const here = residents(c, b);
    dead.push(...here);
    b.ashOf = here.map((k) => k.name);
    b.kind = 'ash';
    b.type = 'ash';
    b.fireUntil = now + FIRE_MS;
  }
  const ids = new Set(dead.map((k) => k.id));
  c.cats = c.cats.filter((k) => !ids.has(k.id));
  for (const k of c.cats) k.sadUntil = c.clock + DAY_MIN;
  for (const k of dead) c.lost = [...c.lost, { name: k.name, coat: k.coat, day: seed }].slice(-40);
  c.stats.burned += order.length;
  const names = dead.map((k) => catName(k));
  news(c, 'fire', '🔥', {
    ru: `Боги разгневались: сгорело домов — ${order.length}${names.length ? `, погибли: ${names.map((x) => x.ru).join(', ')}` : ''}`,
    en: `The gods are angry: ${order.length} house(s) burned${names.length ? `, lost: ${names.map((x) => x.en).join(', ')}` : ''}`,
  });
  return { houses: order.length, cats: names.map((x) => x.ru) };
}

/**
 * Смена реального дня: подношение за прошедшие дни не сделано — пожар (за каждый пропущенный
 * день, не больше трёх; в день основания — без пожара). Новое подношение на сегодня.
 */
export function cityNewRealDay(s: GameState, prev: string, today: string): { houses: number; cats: string[] } {
  const c = s.city;
  const out = { houses: 0, cats: [] as string[] };
  if (prev && prev !== today) {
    const missed: string[] = [];
    const o = c.offering;
    if (o && o.day === prev && !o.complete && prev !== c.graceDay) missed.push(prev);
    // Дни, когда игра не открывалась, тоже без подношения.
    const gap = Math.max(0, daysBetween(prev, today) - 1);
    for (let i = 1; i <= gap; i += 1) missed.push(addDays(prev, i));
    for (const d of missed.slice(0, 3)) {
      const r = burn(c, d);
      out.houses += r.houses;
      out.cats.push(...r.cats);
    }
  }
  if (!c.offering || c.offering.day !== today) c.offering = makeOffering(c, today, s.character.id);
  return out;
}

// ─── Для режима администратора ─────────────────────────────────────────

export function adminSkip(state: GameState, minutes: number): GameState {
  const s = structuredClone(state);
  stepCity(s.city, minutes);
  return s;
}
export function adminHour(state: GameState, hour: number): GameState {
  const s = structuredClone(state);
  const c = s.city;
  c.clock = Math.floor(c.clock / DAY_MIN) * DAY_MIN + hour * 60;
  for (const k of c.cats) {
    delete k.act.path;
    decide(c, k);
  }
  return s;
}
/** Построить дома с кошками сразу (заселяются без ожидания). */
export function adminAddCats(state: GameState, n: number): GameState {
  const s = structuredClone(state);
  const c = s.city;
  const R = Math.min(MAP, buildRadius(c));
  for (let i = 0; i < n; i += 1) {
    let spot: [number, number] | null = null;
    for (let d = 1; d <= MAP && !spot; d += 1)
      for (let gx = -d; gx <= d && !spot; gx += 1)
        for (let gz = -d; gz <= d && !spot; gz += 1) if (Math.max(Math.abs(gx), Math.abs(gz)) === d && d <= Math.max(R, d) && !tileAt(c, gx, gz)) spot = [gx, gz];
    if (!spot) break;
    c.buildings.push({ id: c.nextId++, kind: 'house', type: 'house', gx: spot[0], gz: spot[1], level: 1, fund: 0, visits: 0, tint: (c.nextId * 3) % TINTS.length });
    spawnCat(c, rng(`admin:${c.nextId}`));
  }
  return s;
}
export function adminCatMoney(state: GameState, amount: number): GameState {
  const s = structuredClone(state);
  for (const k of s.city.cats) k.money += amount;
  return s;
}
export function adminNeeds(state: GameState, v: number): GameState {
  const s = structuredClone(state);
  for (const k of s.city.cats) k.needs = { food: v, energy: v, fun: v, social: v };
  return s;
}
export function adminFire(state: GameState): GameState {
  const s = structuredClone(state);
  burn(s.city, `admin:${s.city.clock}`);
  return s;
}
export function adminOffering(state: GameState, done: boolean): GameState {
  const s = structuredClone(state);
  const o = s.city.offering;
  if (!o) return s;
  for (const t of o.tasks) t.done = done ? t.target : 0;
  o.complete = done;
  return s;
}
export function adminTown(state: GameState, lv: number): GameState {
  const s = structuredClone(state);
  s.city.town = Math.max(0, Math.min(TOWNS.length - 1, lv));
  return s;
}
/** Сводка профессий для админки и тестов. */
export const professionName = (k: CityCat): string => professionById(k.profession).name.ru;

export { START_GOLD };
