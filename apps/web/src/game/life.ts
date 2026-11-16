import type { ExerciseId } from '../tracking/exercise';
import type { StatId } from './config';
import { addDays, daysBetween } from './dates';
import type { GameEvent } from './engine';
import type { Slot } from './items';
import { levelOf } from './levels';
import { ACTIONS, GYM_EXTRAS, HOUSES, gymExtraById, type GymExtraId, BOWL_MAX, CAT_AGE, CAT_BREEDS, CAT_PREGNANCY_DAYS, CAT_RATES, LITTER_DIRTY, WATER_RATE, CAT_NAMES, CLIENT_NAMES, FURNITURE, GYMS, GYM_HOURS, HOME_OBJECTS, LIFE_EVENTS, MAX_CATS, OBJECTS, SESSION_EXERCISES, actionById, catBreedById, lifeEventById, mountOf, slotsFor } from './lifeContent';
import { BASIC_DECOR, DECOR_KINDS, KITS, NEW_KIT, OLD_DECOR, OLD_KIT, OLD_KIT_COMFORT, OLD_KIT_FACTOR, finishById, kitById, kitOf, type KitId } from './homeDecor';
import { rng } from './random';
import type { Appearance, BodyPart, GameState, HairStyle } from './state';
import { NEEDS, SKILLS, type ActionDef, type Cat, type CatBreed, type Client, type LifeEffect, type LifeResult, type LifeState, type NeedId, type ObjectId, type SkillId, type Txt } from './lifeTypes';

/**
 * Симулятор фитнес-тренера. Две локации — свой дом и фитнес-зал. В зале герой
 * проводит платные занятия: выполняет упражнение перед камерой, ученики повторяют.
 * С уровнем героя растёт число учеников, а новые приходят всё более спортивными;
 * сами ученики худеют и крепнут от занятий. Доход — от уровня, числа учеников и
 * уровня зала, который можно улучшать. Каждый реальный день есть обязательная норма
 * повторов, иначе штраф и недовольство учеников. Время в игре идёт действиями.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

export const DAY = 1440;
export const WAKE_HOUR = 7;

const firstClient = (): Client => makeClient(1, 1, 1);

export function newLife(): LifeState {
  return {
    day: 1,
    minute: 8 * 60,
    needs: { food: 70, energy: 85, hygiene: 75, fun: 65, social: 55 },
    scene: 'home',
    groceries: 4,
    skills: { cooking: 0, charisma: 0, logic: 0, creativity: 0 },
    furniture: [],
    cats: [],
    bowl: 0,
    water: 0,
    litter: 0,
    fat: 0,
    gym: 0,
    gymExtras: [],
    house: 0,
    decor: { ...OLD_DECOR },
    finishes: [...START_FINISHES],
    kit: { ...OLD_KIT },
    clients: [firstClient()],
    nextClient: 2,
    session: null,
    event: null,
    last: null,
    quotaDay: '',
    quota: 20,
    stats: { sessions: 0, earned: 0, meals: 0, workouts: 0, fines: 0, graduated: 0 },
  };
}

/** Отделка, которая есть с самого начала: старьё стартовой квартиры и «без ковра». */
const START_FINISHES: readonly string[] = [...Object.values(OLD_DECOR), 'rug_none'];

/**
 * Отделка и мебель из сохранения. Сохранения до ремонтов (без decor) жили в обычной
 * квартире — для них ступень жилья сдвигается на одну вверх (внизу появилась убитая
 * однушка), а дом получает простой новый ремонт и новую мебель.
 */
function migrateHome(r: Partial<LifeState>): Pick<LifeState, 'house' | 'decor' | 'finishes' | 'kit'> {
  const legacy = !r.decor || typeof r.decor !== 'object';
  const house = Math.max(0, Math.min(HOUSES.length - 1, (typeof r.house === 'number' ? r.house : 0) + (legacy ? 1 : 0)));
  if (legacy) return { house, decor: { ...BASIC_DECOR }, finishes: [...new Set([...START_FINISHES, ...Object.values(BASIC_DECOR)])], kit: { ...NEW_KIT } };
  const finishes = [...new Set([...START_FINISHES, ...(Array.isArray(r.finishes) ? r.finishes.filter((id) => finishById(id)) : [])])];
  const decor = { ...OLD_DECOR };
  for (const k of DECOR_KINDS) {
    const id = r.decor![k];
    if (typeof id === 'string' && finishById(id)?.kind === k && finishes.includes(id)) decor[k] = id;
  }
  const kit = { ...OLD_KIT };
  for (const k of KITS) kit[k.id] = r.kit?.[k.id] === 1 ? 1 : 0;
  return { house, decor, finishes, kit };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Старые сохранения (в том числе города и работы) переводятся в жизнь тренера. */
export function migrateLife(raw: Partial<LifeState> | undefined): LifeState {
  const base = newLife();
  if (!raw) return base;
  const r = raw as Partial<LifeState> & Record<string, unknown>;
  return {
    ...base,
    day: typeof r.day === 'number' ? r.day : base.day,
    minute: typeof r.minute === 'number' ? r.minute : base.minute,
    needs: { ...base.needs, ...(r.needs ?? {}) },
    scene: r.scene === 'gym' ? 'gym' : 'home',
    groceries: typeof r.groceries === 'number' ? r.groceries : base.groceries,
    skills: { ...base.skills, ...(r.skills ?? {}) },
    furniture: (r.furniture ?? []).filter((id) => FURNITURE.includes(id)),
    cats: Array.isArray(r.cats)
      ? r.cats
          .filter((c) => CAT_BREEDS.some((b) => b.id === c.breed))
          .map((c) => migrateCat(c, typeof r.day === 'number' ? r.day : 1))
      : [],
    // Старые сохранения с кошками получают полную миску и чистый лоток.
    bowl: typeof r.bowl === 'number' ? r.bowl : Array.isArray(r.cats) && r.cats.length ? BOWL_MAX : 0,
    water: typeof r.water === 'number' ? r.water : Array.isArray(r.cats) && r.cats.length ? 100 : 0,
    litter: typeof r.litter === 'number' ? r.litter : 0,
    fat: typeof r.fat === 'number' ? r.fat : 0,
    gym: typeof r.gym === 'number' ? r.gym : 0,
    gymExtras: Array.isArray(r.gymExtras) ? r.gymExtras.filter((x) => GYM_EXTRAS.some((g) => g.id === x)) : [],
    ...migrateHome(r),
    clients: Array.isArray(r.clients) && r.clients.length ? r.clients : base.clients,
    nextClient: typeof r.nextClient === 'number' ? r.nextClient : base.nextClient,
    session: r.session ?? null,
    event: r.event && lifeEventById(r.event.id) ? r.event : null,
    last: null,
    quotaDay: typeof r.quotaDay === 'string' ? r.quotaDay : '',
    quota: typeof r.quota === 'number' ? r.quota : base.quota,
    stats: { ...base.stats, ...((r.stats as Partial<LifeState['stats']>) ?? {}) },
  };
}

// ─── Показатели ────────────────────────────────────────────────────────

export const skillLevel = (xp: number): number => Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp) / 12)));
export const skillNext = (xp: number): number => 12 * (skillLevel(xp) + 1) ** 2;

const STAT_IDS: readonly StatId[] = ['strength', 'legs', 'core', 'endurance'];

/** Спортивная форма героя: средний уровень характеристик (растут только от тренировок перед камерой). */
export function fitness(s: GameState): number {
  return Math.round((STAT_IDS.reduce((a, k) => a + levelOf(s.statXp[k]), 0) / STAT_IDS.length) * 10) / 10;
}

export const trainerLevel = (s: GameState): number => levelOf(s.totalXp);
export const mood = (life: LifeState): number => Math.round(NEEDS.reduce((a, n) => a + life.needs[n], 0) / NEEDS.length);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Фигура героя с учётом тренировок и питания. */
export function effectiveAppearance(appearance: Appearance, s: GameState): Appearance {
  const lv = (k: StatId): number => levelOf(s.statXp[k]) - 1;
  const body: Partial<Record<BodyPart, number>> = { ...(appearance.body ?? {}) };
  const add = (k: BodyPart, d: number): void => {
    if (Math.abs(d) < 0.005) return;
    body[k] = clamp((body[k] ?? 0) + d, -1, 1);
  };
  add('muscle', Math.min(0.7, (lv('strength') + lv('core')) * 0.035));
  add('shoulders', Math.min(0.4, lv('strength') * 0.03));
  add('legs', Math.min(0.4, lv('legs') * 0.03));
  add('weight', s.life.fat * 0.75);
  add('belly', Math.max(0, s.life.fat) * 0.6 - Math.min(0.3, lv('core') * 0.025));
  return { ...appearance, body };
}

// ─── Ученики ───────────────────────────────────────────────────────────

const HAIR: Record<'male' | 'female', HairStyle[]> = { male: ['short', 'buzz', 'curly'], female: ['long', 'ponytail', 'bob', 'bun', 'curly'] };

/** Новый ученик: чем выше уровень тренера, тем спортивнее приходят люди. */
export function makeClient(id: number, level: number, day: number): Client {
  const r = rng(`client:${id}`);
  const figure = r() < 0.5 ? 'female' : 'male';
  // Первый ученик — максимально полный; с уровнем тренера новички приходят всё спортивнее.
  const fit = clamp((level - 1) / 12, 0, 1);
  const spread = level <= 1 ? 0 : (r() - 0.5) * 0.12;
  return {
    id: `c${id}`,
    seed: id,
    figure,
    hair: HAIR[figure][Math.floor(r() * HAIR[figure].length)]!,
    skin: Math.floor(r() * 6),
    hairColor: Math.floor(r() * 4),
    name: Math.floor(r() * CLIENT_NAMES[figure].length),
    fat: clamp(1 - fit * 1.25 + spread, -0.35, 1),
    muscle: clamp(-0.6 + fit * 1.1 + spread * 0.8, -0.6, 0.8),
    sessions: 0,
    loyalty: 60,
    joined: day,
  };
}

export const clientName = (c: Client): Txt => CLIENT_NAMES[c.figure][c.name % CLIENT_NAMES[c.figure].length]!;

/** Сколько учеников ходит при этом уровне тренера и зала. */
export const clientTarget = (s: GameState): number => Math.min(GYMS[s.life.gym]!.cap, 1 + Math.floor((trainerLevel(s) - 1) / 2));

/** Сильная полнота ученика 0 … 1: новичок на первом уровне — самый полный, с занятиями и уровнем — меньше. */
export const clientHeavy = (c: Client): number => Math.round(Math.max(0, c.fat) ** 1.3 * 100) / 100;

export function clientAppearance(c: Client): Appearance {
  return {
    figure: c.figure,
    skin: c.skin,
    hair: c.hair,
    hairColor: c.hairColor,
    beard: false,
    eyes: c.seed % 3,
    body: { weight: c.fat, belly: Math.max(0, c.fat) * 0.9, muscle: c.muscle, chest: Math.max(0, c.fat) * 0.3, arms: c.fat * 0.4 },
    heavy: clientHeavy(c),
  };
}

/** Спортивная одежда ученика: полные — в футболке и штанах, подтянутые — в топе и шортах. */
export function clientOutfit(c: Client): Partial<Record<Slot, string>> {
  if (c.fat > 0.45) return { body: 'basic_tee', legs: 'sweatpants', feet: 'sneakers' };
  if (c.fat > 0) return { body: 'tank_top', legs: 'gym_shorts', feet: 'sneakers' };
  return c.figure === 'female' ? { body: 'sports_bra', legs: 'yoga_leggings', feet: 'running_shoes' } : { body: 'tank_top', legs: 'gym_shorts', feet: 'running_shoes' };
}

/** Состояние формы ученика 0…1 (для подписи). */
export const clientForm = (c: Client): number => clamp((1 - c.fat) / 1.4 * 0.7 + (c.muscle + 0.6) / 1.4 * 0.3, 0, 1);

/** Приходит один новый ученик, если есть место. */
function recruit(s: GameState, notes: Txt[], force = false): void {
  const life = s.life;
  const cap = force ? GYMS[life.gym]!.cap : clientTarget(s);
  if (life.clients.length >= cap) return;
  const c = makeClient(life.nextClient, trainerLevel(s), life.day);
  life.nextClient += 1;
  life.clients.push(c);
  notes.push(t(`Новый ученик: ${clientName(c).ru}`, `New client: ${clientName(c).en}`));
}

/** Комфорт зала: базовый у ступени плюс купленные удобства. */
export function gymComfort(life: LifeState): number {
  return (GYMS[life.gym]?.comfort ?? 0) + life.gymExtras.reduce((a, id) => a + (gymExtraById(id)?.comfort ?? 0), 0);
}

/** Множители оплаты: размер зала, комфорт (+5% за единицу), обаяние тренера. */
export function payFactors(s: GameState): { base: number; size: number; comfort: number; charisma: number } {
  return {
    base: 10 + 4 * trainerLevel(s),
    size: GYMS[s.life.gym]!.mult,
    comfort: 1 + 0.05 * gymComfort(s.life),
    charisma: 1 + 0.03 * skillLevel(s.life.skills.charisma),
  };
}

/** Базовая ставка с ученика (без учёта его формы). */
export function fee(s: GameState): number {
  const f = payFactors(s);
  return Math.round(f.base * f.size * f.comfort * f.charisma);
}

/** Насколько атлетичный ученик платит больше: ×0,6 (очень полный) … ×1,5 (в отличной форме). */
export const athleteFactor = (c: Client): number => 0.6 + 0.9 * clientForm(c);

/** Сколько платит ученик за занятие. */
export function clientFee(s: GameState, c: Client): number {
  return Math.round(fee(s) * athleteFactor(c));
}

/** Оплата занятия: сумма по ученикам (по умолчанию — все текущие). */
export function sessionPay(s: GameState, clients: readonly Client[] = s.life.clients): number {
  return clients.reduce((a, c) => a + clientFee(s, c), 0);
}

const FIT_FACTOR = { beginner: 0.7, intermediate: 1, advanced: 1.3 } as const;

/** Повторов на занятии: растёт с уровнем, учитывает подготовку героя. */
export function sessionTarget(s: GameState, exercise: ExerciseId): number {
  const base = SESSION_EXERCISES.find(([e]) => e === exercise)?.[1] ?? 10;
  return Math.max(4, Math.round(base * (1 + 0.06 * (trainerLevel(s) - 1)) * FIT_FACTOR[s.character.fitness]));
}

/** Норма повторов для уровня тренера (назначается в начале реального дня). */
export const quotaFor = (s: GameState): number => Math.min(120, 20 + 5 * (trainerLevel(s) - 1));
/** Обязательная норма повторов на сегодня (не меняется в течение дня, даже с новым уровнем). */
export const dailyQuota = (s: GameState): number => s.life.quota || quotaFor(s);
export const repsOn = (s: GameState, day: string): number => Object.values(s.days[day]?.reps ?? {}).reduce((a, n) => a + (n ?? 0), 0);

// ─── Время ─────────────────────────────────────────────────────────────

export const hourOf = (minute: number): number => Math.floor(minute / 60);
export const clock = (minute: number): string => `${String(hourOf(minute)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const gymOpen = (minute: number): boolean => hourOf(minute) >= GYM_HOURS[0] && hourOf(minute) < GYM_HOURS[1];

const AWAKE: Record<NeedId, number> = { food: -5, energy: -4.2, hygiene: -3, fun: -3.2, social: -2.4 };
const ASLEEP: Record<NeedId, number> = { food: -1.8, energy: 13, hygiene: -1, fun: 0, social: -0.5 };

function bump(life: LifeState, need: NeedId, d: number): number {
  const before = life.needs[need];
  life.needs[need] = clamp(before + d, 0, 100);
  return life.needs[need] - before;
}

interface Tally {
  needs: Partial<Record<NeedId, number>>;
  money: number;
  notes: Txt[];
  skills: Partial<Record<SkillId, number>>;
}
const startTally = (): Tally => ({ needs: {}, money: 0, notes: [], skills: {} });

/** Лоток грязный: дома пахнет, уют и гигиена падают, кошкам неуютно. */
export const litterDirty = (life: LifeState): boolean => life.cats.length > 0 && life.litter >= LITTER_DIRTY;

/** Уют от ремонта: отделка и базовая мебель (старьё — в минус). */
export function decorComfort(life: LifeState): number {
  const finish = DECOR_KINDS.reduce((a, k) => a + (finishById(life.decor[k])?.comfort ?? 0), 0);
  const kit = KITS.reduce((a, k) => a + (life.kit[k.id] ? 0 : OLD_KIT_COMFORT), 0);
  return finish + kit;
}

/** Уют дома: ремонт, декор, мебель и кошки (до 30); грязный лоток его портит. */
export function comfort(life: LifeState): number {
  const items = life.furniture.reduce((a, id) => a + (OBJECTS[id].comfort ?? 0), 0);
  const space = HOUSES[life.house]?.comfort ?? 0;
  return Math.max(0, Math.min(30, items + life.cats.length * 2 + space + decorComfort(life)) - (litterDirty(life) ? 4 : 0));
}

/** Польза от базовой мебели у предмета: старьё даёт меньше. */
export function kitFactor(life: LifeState, object: ObjectId): number {
  const k = kitOf(object);
  return k && !life.kit[k] ? OLD_KIT_FACTOR : 1;
}

// ─── Возраст и родословная кошек ───────────────────────────────────────

const isBreed = (b: unknown): b is CatBreed => CAT_BREEDS.some((x) => x.id === b);

/** Старые сохранения: пол по id, возраст — взрослая (год на момент появления). */
function migrateCat(c: Partial<Cat> & { id: string; breed: CatBreed }, day: number): Cat {
  const sex = c.sex === 'f' || c.sex === 'm' ? c.sex : (Number(c.id.replace(/\D/g, '')) || 0) % 2 ? 'f' : 'm';
  const out: Cat = {
    id: c.id,
    breed: c.breed,
    name: typeof c.name === 'number' ? c.name : 0,
    adopted: typeof c.adopted === 'number' ? c.adopted : day,
    fed: num(c.fed, 80),
    play: num(c.play, 70),
    toilet: num(c.toilet, 90),
    sex,
    born: typeof c.born === 'number' ? c.born : (typeof c.adopted === 'number' ? c.adopted : day) - CAT_AGE.GROWN,
  };
  if (isBreed(c.mix) && c.mix !== c.breed) out.mix = c.mix;
  if (c.pregnant && typeof c.pregnant.due === 'number' && isBreed(c.pregnant.father)) {
    out.pregnant = { due: c.pregnant.due, father: c.pregnant.father };
    if (isBreed(c.pregnant.fatherMix)) out.pregnant.fatherMix = c.pregnant.fatherMix;
  }
  if (typeof c.mother === 'string') out.mother = c.mother;
  return out;
}

/** Возраст кошки в месяцах (один игровой день — месяц). */
export const catAge = (c: Cat, day: number): number => Math.max(0, day - c.born);
export const isKitten = (c: Cat, day: number): boolean => catAge(c, day) < CAT_AGE.KITTEN;
/** Рост 0.42…1: котёнок растёт до года. */
export const catGrowth = (c: Cat, day: number): number => Math.min(1, 0.42 + (0.58 * catAge(c, day)) / CAT_AGE.GROWN);
/** «Кошка ждёт котят» и котята, которых ждут, — занимают места в доме. */
const catsReserved = (life: LifeState): number => life.cats.length + life.cats.filter((c) => c.pregnant).length;

export type PairBlocker = 'pair' | 'pregnant' | 'catsMax' | 'catMood' | null;

/** Пара для котят: взрослые кот и кошка (кошка не ждёт котят), самые довольные. */
export function catCouple(life: LifeState): { mother: Cat; father: Cat } | null {
  const adult = life.cats.filter((c) => catAge(c, life.day) >= CAT_AGE.ADULT);
  const byMood = (a: Cat, b: Cat): number => catMood(b, life) - catMood(a, life);
  const mother = adult.filter((c) => c.sex === 'f' && !c.pregnant).sort(byMood)[0];
  const father = adult.filter((c) => c.sex === 'm').sort(byMood)[0];
  return mother && father ? { mother, father } : null;
}

export function pairBlocker(life: LifeState): PairBlocker {
  const adult = life.cats.filter((c) => catAge(c, life.day) >= CAT_AGE.ADULT);
  if (!adult.some((c) => c.sex === 'm') || !adult.some((c) => c.sex === 'f')) return 'pair';
  const couple = catCouple(life);
  if (!couple) return 'pregnant';
  if (catsReserved(life) >= maxCats(life)) return 'catsMax';
  if (catMood(couple.mother, life) < 40 || catMood(couple.father, life) < 40) return 'catMood';
  return null;
}

/** Порода котёнка: по одному «гену» от матери и отца; разные — метис. */
export function kittenGenes(mother: { breed: CatBreed; mix?: CatBreed }, father: { breed: CatBreed; mix?: CatBreed }, r: () => number): { breed: CatBreed; mix?: CatBreed } {
  const m = mother.mix && r() < 0.5 ? mother.mix : mother.breed;
  const f = father.mix && r() < 0.5 ? father.mix : father.breed;
  return m === f ? { breed: m } : { breed: m, mix: f };
}

function freeCatName(life: LifeState, r: () => number): number {
  const used = new Set(life.cats.map((c) => c.name % CAT_NAMES.length));
  let name = Math.floor(r() * CAT_NAMES.length);
  for (let i = 0; i < CAT_NAMES.length && used.has(name); i += 1) name = (name + 1) % CAT_NAMES.length;
  return name;
}

const nextCatId = (life: LifeState): string => `cat${life.cats.reduce((m, c) => Math.max(m, Number(c.id.slice(3)) || 0), 0) + 1}`;

/** Роды: котята (1–3, сколько поместится) с генами родителей. */
function catBirths(s: GameState, tally: Tally): void {
  const life = s.life;
  for (const mother of [...life.cats]) {
    const p = mother.pregnant;
    if (!p || p.due > life.day) continue;
    delete mother.pregnant;
    const r = rng(`${s.character.id}:litter:${mother.id}:${life.day}`);
    const room = Math.max(1, maxCats(life) - life.cats.length);
    const n = Math.min(room, 1 + Math.floor(r() * 3));
    const names: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const genes = kittenGenes(mother, { breed: p.father, ...(p.fatherMix ? { mix: p.fatherMix } : {}) }, r);
      const kitten: Cat = { id: nextCatId(life), ...genes, name: freeCatName(life, r), adopted: life.day, fed: 90, play: 80, toilet: 100, sex: r() < 0.5 ? 'f' : 'm', born: life.day, mother: mother.id };
      life.cats.push(kitten);
      names.push(catName(kitten).ru);
    }
    tally.notes.push(
      n === 1
        ? t(`🐾 У ${catName(mother).ru} родился котёнок!`, `🐾 ${catName(mother).en} had a kitten!`)
        : t(`🐾 У ${catName(mother).ru} родились котята: ${n}!`, `🐾 ${catName(mother).en} had ${n} kittens!`),
    );
  }
}

/** Настроение кошки 0…100: сытость, игра, туалет; грязный лоток, пустые миски с кормом и водой — хуже. */
export function catMood(c: Cat, life: LifeState): number {
  let m = (c.fed + c.play + c.toilet) / 3;
  if (litterDirty(life)) m -= 15;
  if (life.bowl <= 0 && c.fed < 40) m -= 10;
  if (life.water <= 0) m -= 10;
  return clamp(Math.round(m), 0, 100);
}

/**
 * Жизнь кошек за hours игровых часов: проголодавшись, едят из миски (порция корма),
 * ходят в лоток (он пачкается; в переполненный не идут — «конфуз», дома грязнее),
 * скучают без игры. asleep — герой спит, кошки тоже больше спят.
 */
function catsLive(life: LifeState, hours: number, asleep: boolean, tally: Tally): void {
  if (!life.cats.length) return;
  for (const c of life.cats) {
    c.fed = clamp(c.fed - CAT_RATES.fed * hours * (asleep ? 0.6 : 1), 0, 100);
    if (c.fed < 45 && life.bowl > 0) {
      life.bowl -= 1;
      c.fed = clamp(c.fed + 55, 0, 100);
    }
    c.toilet = clamp(c.toilet - CAT_RATES.toilet * hours, 0, 100);
    if (c.toilet < 35) {
      if (life.litter < 100) life.litter = clamp(life.litter + 20, 0, 100);
      else if (life.scene === 'home') tally.needs.hygiene = (tally.needs.hygiene ?? 0) + bump(life, 'hygiene', -6);
      c.toilet = 100;
    }
    c.play = clamp(c.play - CAT_RATES.play * hours * (asleep ? 0.4 : 1) * (isKitten(c, life.day) ? 1.5 : 1), 0, 100);
    // Пьёт понемногу весь день (ночью меньше).
    life.water = clamp(life.water - WATER_RATE * hours * (asleep ? 0.6 : 1), 0, 100);
  }
}

/** Во сколько раз медленнее падает потребность дома (уют, робот-пылесос, кондиционер). */
export function homeSlowdown(life: LifeState, need: NeedId): number {
  if (life.scene !== 'home') return 0;
  let k = need === 'fun' || need === 'social' ? comfort(life) * 0.02 : 0;
  for (const id of life.furniture) k += OBJECTS[id].slows?.[need] ?? 0;
  return Math.min(0.4, k);
}

function passTime(s: GameState, minutes: number, asleep: boolean, tally: Tally, sleepK = 1): void {
  const life = s.life;
  let left = minutes;
  while (left > 0) {
    const step = Math.min(left, DAY - life.minute, 60);
    for (const n of NEEDS) {
      let rate = (asleep ? ASLEEP : AWAKE)[n];
      // На старой раскладушке сон восстанавливает меньше сил.
      if (asleep && rate > 0) rate *= sleepK;
      const k = rate < 0 ? 1 - homeSlowdown(life, n) : 1;
      // Грязный лоток: дома гигиена падает быстрее.
      if (n === 'hygiene' && life.scene === 'home' && litterDirty(life)) rate -= 1.5;
      tally.needs[n] = (tally.needs[n] ?? 0) + bump(life, n, (rate * k * step) / 60);
    }
    catsLive(life, step / 60, asleep, tally);
    life.minute += step;
    left -= step;
    if (life.minute >= DAY) {
      life.minute -= DAY;
      life.day += 1;
      newGameDay(s, tally);
    }
  }
}

/** Новый игровой день: иногда приходит новый ученик, утреннее событие. */
function newGameDay(s: GameState, tally: Tally): void {
  const life = s.life;
  const roll = rng(`${s.character.id}:life:${life.day}`);
  catBirths(s, tally);
  if (roll() < 0.5) recruit(s, tally.notes);
  if (!life.event && roll() < 0.45) {
    const pool = LIFE_EVENTS.filter((e) => !e.needsClients || life.clients.length > 0);
    const ev = pool[Math.floor(roll() * pool.length)];
    if (ev) life.event = { id: ev.id };
  }
}

export function sleepMinutes(minute: number): number {
  const m = (WAKE_HOUR * 60 - minute + DAY) % DAY;
  return m < 240 ? 480 : m;
}

export const SKILL_NAME: Record<SkillId, Txt> = {
  cooking: t('Кулинария', 'Cooking'),
  charisma: t('Обаяние', 'Charisma'),
  logic: t('Логика', 'Logic'),
  creativity: t('Творчество', 'Creativity'),
};

function applyEffect(s: GameState, e: LifeEffect, tally: Tally): void {
  const life = s.life;
  for (const [n, d] of Object.entries(e.needs ?? {}) as Array<[NeedId, number]>) {
    if (n === 'food' && d > 0 && life.needs.food + d > 120) life.fat = clamp(life.fat + 0.01, -1, 1);
    tally.needs[n] = (tally.needs[n] ?? 0) + bump(life, n, d);
  }
  if (e.money) {
    const before = s.gold;
    s.gold = Math.max(0, s.gold + e.money);
    tally.money += s.gold - before;
  }
  if (e.groceries) life.groceries = Math.max(0, life.groceries + e.groceries);
  if (e.fat) life.fat = clamp(life.fat + e.fat, -1, 1);
  for (const [k, xp] of Object.entries(e.skills ?? {}) as Array<[SkillId, number]>) {
    const before = skillLevel(life.skills[k]);
    life.skills[k] += xp;
    tally.skills[k] = (tally.skills[k] ?? 0) + xp;
    const after = skillLevel(life.skills[k]);
    if (after > before) tally.notes.push(t(`Навык «${SKILL_NAME[k].ru}»: уровень ${after}`, `${SKILL_NAME[k].en} skill: level ${after}`));
  }
  if (e.loyalty) for (const c of life.clients) c.loyalty = clamp(c.loyalty + e.loyalty, 0, 100);
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
  if (e.client) recruit(s, tally.notes, true);
}

// ─── Доступность действий ──────────────────────────────────────────────

export type Blocker = 'closed' | 'money' | 'groceries' | 'need' | 'skill' | 'missing' | 'clients' | 'session' | 'enough' | Exclude<PairBlocker, null> | null;

/** Есть ли предмет в текущей локации. */
export function hasObject(s: GameState, id: ObjectId): boolean {
  const life = s.life;
  if (id === 'cat' || id === 'cat_bowl' || id === 'litter') return life.scene === 'home' && life.cats.length > 0;
  if (life.scene === 'home') return HOME_OBJECTS.includes(id) || life.furniture.includes(id);
  const g = GYMS[life.gym]!;
  if (id === 'gym_shower') return g.shower;
  if (id === 'smoothie') return g.bar;
  return id === 'coach' || id === 'reception' || id === 'gym_door';
}

export function blocker(s: GameState, a: ActionDef): Blocker {
  const life = s.life;
  if (!hasObject(s, a.at)) return 'missing';
  if (a.at === 'coach' && !gymOpen(life.minute)) return 'closed';
  if (a.id === 'chat_clients' && life.clients.length === 0) return 'clients';
  if (a.id === 'pair_cats') {
    const pb = pairBlocker(life);
    if (pb) return pb;
  }
  // Миски и так полны, лоток и так чистый.
  if (a.effect.bowl && life.bowl >= BOWL_MAX && life.water >= 90) return 'enough';
  if (a.effect.litter && a.effect.litter < 0 && life.litter < 5) return 'enough';
  if (a.open === 'session') {
    if (life.session) return 'session';
    if (life.clients.length === 0) return 'clients';
    if (life.needs.energy < 20) return 'need';
  }
  const r = a.requires;
  if (r?.groceries && life.groceries < r.groceries) return 'groceries';
  if (r?.need && life.needs[r.need[0]] < r.need[1]) return 'need';
  if (r?.skill && skillLevel(life.skills[r.skill[0]]) < r.skill[1]) return 'skill';
  if ((a.cost ?? 0) > s.gold) return 'money';
  return null;
}

export const actionsAt = (id: ObjectId): ActionDef[] => ACTIONS.filter((a) => a.at === id);

// ─── Действия ──────────────────────────────────────────────────────────

export interface LifeOutcome {
  state: GameState;
  train?: boolean;
  open?: ActionDef['open'];
}

const same = (state: GameState): LifeOutcome => ({ state });

function collapse(s: GameState, tally: Tally): number {
  const life = s.life;
  if (life.needs.energy > 0) return 0;
  life.scene = 'home';
  life.session = null;
  const m = sleepMinutes(life.minute);
  passTime(s, m, true, tally);
  tally.notes.push(t('Силы кончились — вы уснули и проснулись дома.', 'You ran out of energy, fell asleep and woke up at home.'));
  return m;
}

function finish(s: GameState, icon: string, text: Txt, ok: boolean, minutes: number, tally: Tally): void {
  const r: LifeResult = { icon, text, ok, needs: tally.needs, money: tally.money, minutes, notes: tally.notes };
  if (Object.keys(tally.skills).length) r.skills = tally.skills;
  s.life.last = r;
}

export function act(state: GameState, actionId: string): LifeOutcome {
  const a = actionById(actionId);
  if (!a || state.life.event) return same(state);
  if (blocker(state, a)) return same(state);
  if (a.open) return { state, open: a.open };
  const s = structuredClone(state);
  const life = s.life;
  const tally = startTally();
  if (a.cost) {
    s.gold -= a.cost;
    tally.money -= a.cost;
  }
  let minutes = a.minutes;
  const k = kitFactor(life, a.at);
  if (a.sleep) {
    if (a.id === 'sleep') minutes = sleepMinutes(life.minute);
    passTime(s, minutes, true, tally, k);
  } else {
    passTime(s, minutes, false, tally);
    // Старая мебель: от действия меньше пользы (потребности растут слабее).
    const needs = k < 1 && a.effect.needs ? Object.fromEntries(Object.entries(a.effect.needs).map(([n, d]) => [n, d > 0 ? Math.round(d * k) : d])) : a.effect.needs;
    applyEffect(s, needs === a.effect.needs ? a.effect : { ...a.effect, needs }, tally);
  }
  if (a.id === 'cook' || a.id === 'cook_fit') life.stats.meals += 1;
  if (a.id === 'pair_cats') {
    const couple = catCouple(life);
    if (couple) {
      couple.mother.pregnant = { due: life.day + CAT_PREGNANCY_DAYS, father: couple.father.breed, ...(couple.father.mix ? { fatherMix: couple.father.mix } : {}) };
      tally.notes.push(
        t(
          `💞 ${catName(couple.father).ru} и ${catName(couple.mother).ru} подружились — через ${CAT_PREGNANCY_DAYS} дня ждите котят!`,
          `💞 ${catName(couple.father).en} and ${catName(couple.mother).en} hit it off — kittens in ${CAT_PREGNANCY_DAYS} days!`,
        ),
      );
    }
  }
  if (a.go) life.scene = a.go;
  minutes += collapse(s, tally);
  if (a.go && tally.notes.length === 0) life.last = null;
  else finish(s, a.icon, a.label, true, minutes, tally);
  const out: LifeOutcome = { state: s };
  if (a.train) out.train = true;
  return out;
}

// ─── Занятия ───────────────────────────────────────────────────────────

/** Начать групповое занятие: дальше — повторы перед камерой. */
export function startSession(state: GameState, exercise: ExerciseId): GameState {
  const life = state.life;
  const a = actionById('session')!;
  if (life.event || blocker(state, a) || !SESSION_EXERCISES.some(([e]) => e === exercise)) return state;
  const s = structuredClone(state);
  s.life.session = { exercise, target: sessionTarget(s, exercise), progress: 0, clients: s.life.clients.map((c) => c.id) };
  return s;
}

/** Итог занятия: оплата за выполненную часть, ученики стали в лучшей форме (s уже скопировано). */
function completeSession(s: GameState, completion: number): void {
  const life = s.life;
  const sess = life.session;
  if (!sess) return;
  life.session = null;
  const tally = startTally();
  const attending = life.clients.filter((c) => sess.clients.includes(c.id));
  const pay = Math.round(sessionPay(s, attending) * completion);
  s.gold += pay;
  tally.money += pay;
  life.stats.earned += pay;
  life.stats.sessions += 1;
  for (const c of attending) {
    c.fat = clamp(c.fat - 0.04 * completion, -0.4, 1);
    c.muscle = clamp(c.muscle + 0.03 * completion, -0.6, 0.85);
    c.sessions += 1;
    c.loyalty = clamp(c.loyalty + (completion >= 1 ? 6 : -4), 0, 100);
  }
  passTime(s, 60, false, tally);
  applyEffect(s, { needs: { energy: -12, hygiene: -20, fun: 8, social: 15 }, skills: { charisma: 8 } }, tally);
  if (completion < 1) tally.notes.push(t('Занятие прервано — оплата за выполненную часть.', 'The class was cut short — paid for the part done.'));
  recruit(s, tally.notes);
  const minutes = 60 + collapse(s, tally);
  finish(s, '📣', t(`Занятие: ${attending.length} уч., +${pay} ◈`, `Class: ${attending.length} clients, +${pay} ◈`), completion >= 1, minutes, tally);
}

/** Закончить занятие досрочно (выход из тренировки). */
export function endSession(state: GameState): GameState {
  const sess = state.life.session;
  if (!sess) return state;
  const s = structuredClone(state);
  if (sess.progress <= 0) s.life.session = null;
  else completeSession(s, Math.min(1, sess.progress / sess.target));
  return s;
}

// ─── Связь с тренировками ──────────────────────────────────────────────

const CARDIO: readonly ExerciseId[] = ['jumping_jack', 'high_knees'];

/** Повтор перед камерой: тело устаёт, лишний вес уходит, занятие и норма продвигаются (s уже скопировано). */
export function lifeOnRep(s: GameState, exercise: ExerciseId, events: GameEvent[]): void {
  const life = s.life;
  const cardio = CARDIO.includes(exercise);
  bump(life, 'energy', cardio ? -0.12 : -0.2);
  bump(life, 'hygiene', -0.25);
  bump(life, 'food', -0.1);
  bump(life, 'fun', 0.2);
  life.fat = clamp(life.fat - (cardio ? 0.0007 : 0.0005), -1, 1);
  life.stats.workouts += 1;
  const sess = life.session;
  if (sess && sess.exercise === exercise) {
    sess.progress += 1;
    if (sess.progress >= sess.target) {
      const before = s.gold;
      completeSession(s, 1);
      events.push({ kind: 'sessionDone', pay: s.gold - before });
    }
  }
  if (s.today && life.quotaDay !== s.today && repsOn(s, s.today) >= dailyQuota(s)) {
    life.quotaDay = s.today;
    events.push({ kind: 'quotaDone', quota: dailyQuota(s) });
  }
}

/**
 * Смена реального дня: если вчера норма не выполнена — штраф и недовольство учеников
 * (за каждый пропущенный день, не больше трёх). Ученики с нулевой лояльностью уходят.
 */
export function lifeNewRealDay(s: GameState, prev: string, today: string, events: GameEvent[]): void {
  if (prev === today) return;
  const quota = dailyQuota(s);
  s.life.quota = quotaFor(s);
  if (!prev || daysBetween(prev, today) <= 0) return;
  const gap = Math.min(3, daysBetween(prev, today));
  let missed = 0;
  for (let i = 0; i < gap; i += 1) if (repsOn(s, addDays(prev, i)) < quota) missed += 1;
  if (!missed) return;
  const fine = Math.min(s.gold, (20 + 8 * trainerLevel(s)) * missed);
  s.gold -= fine;
  s.life.stats.fines += fine;
  for (const c of s.life.clients) c.loyalty = clamp(c.loyalty - 15 * missed, 0, 100);
  const left = s.life.clients.filter((c) => c.loyalty <= 0).length;
  s.life.clients = s.life.clients.filter((c) => c.loyalty > 0);
  events.push({ kind: 'quotaMissed', fine, left, days: missed });
}

// ─── Событие, мебель, зал ──────────────────────────────────────────────

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
  // Деньги приносят только занятия: убранная вещь ничего не возвращает.
  s.life.furniture = s.life.furniture.filter((x) => x !== id);
  return s;
}

// ─── Кошки ──────────────────────────────────────────────────────────────

export type CatBlocker = 'max' | 'money' | null;

export function catBlocker(s: GameState, breed: CatBreed): CatBlocker {
  if (catsReserved(s.life) >= maxCats(s.life)) return 'max';
  if (s.gold < catBreedById(breed).price) return 'money';
  return null;
}

/** Взять кошку: имя выбирается так, чтобы не повторяться. */
export function adoptCat(state: GameState, breed: CatBreed, sex?: 'f' | 'm'): GameState {
  if (catBlocker(state, breed)) return state;
  const s = structuredClone(state);
  const life = s.life;
  s.gold -= catBreedById(breed).price;
  const r = rng(`${s.character.id}:cat:${life.cats.length}:${breed}`);
  const name = freeCatName(life, r);
  const id = nextCatId(life);
  // Из приюта — молодая кошка от 8 месяцев до 2 лет.
  const age = CAT_AGE.ADULT + Math.floor(r() * 16);
  const gender = sex ?? (r() < 0.5 ? 'f' : 'm');
  // С первой кошкой появляются миски (полные корма и воды) и чистый лоток.
  if (life.cats.length === 0) {
    life.bowl = BOWL_MAX;
    life.water = 100;
    life.litter = 0;
  }
  life.cats.push({ id, breed, name, adopted: life.day, fed: 80, play: 70, toilet: 90, sex: gender, born: life.day - age });
  return s;
}

/** Цена котёнка в добрые руки: породистый — половина цены породы, метис — треть средней. */
export function kittenPrice(c: Cat, day: number): number {
  if (!isKitten(c, day)) return 0;
  const p = catBreedById(c.breed).price;
  return c.mix ? Math.round((p + catBreedById(c.mix).price) / 6) : Math.round(p / 2);
}

/** Отдать кошку в добрые руки (за котят платят, за взрослых — нет). */
export function rehomeCat(state: GameState, id: string): GameState {
  const c = state.life.cats.find((x) => x.id === id);
  if (!c) return state;
  const s = structuredClone(state);
  s.gold += kittenPrice(c, s.life.day);
  s.life.cats = s.life.cats.filter((x) => x.id !== id);
  return s;
}

export const catName = (c: { name: number }): Txt => CAT_NAMES[c.name % CAT_NAMES.length]!;

export type GymBlocker = 'max' | 'level' | 'money' | null;

export function gymBlocker(s: GameState): GymBlocker {
  const next = GYMS[s.life.gym + 1];
  if (!next) return 'max';
  if (trainerLevel(s) < next.level) return 'level';
  if (s.gold < next.cost) return 'money';
  return null;
}

/** Улучшить зал: больше мест для учеников, дороже занятия, новые удобства. */
export function upgradeGym(state: GameState): GameState {
  if (gymBlocker(state)) return state;
  const s = structuredClone(state);
  s.life.gym += 1;
  s.gold -= GYMS[s.life.gym]!.cost;
  const tally = startTally();
  recruit(s, tally.notes);
  finish(s, GYMS[s.life.gym]!.icon, GYMS[s.life.gym]!.name, true, 0, tally);
  return s;
}

// ─── Удобства зала ──────────────────────────────────────────────────────

export type ExtraBlocker = 'owned' | 'gym' | 'money' | null;

export function extraBlocker(s: GameState, id: GymExtraId): ExtraBlocker {
  const def = gymExtraById(id);
  if (!def || s.life.gymExtras.includes(id)) return 'owned';
  if (s.life.gym < def.gym) return 'gym';
  if (s.gold < def.price) return 'money';
  return null;
}

/** Купить удобство в зал: растёт комфорт, а с ним — оплата каждого занятия. */
export function buyExtra(state: GameState, id: GymExtraId): GameState {
  if (extraBlocker(state, id)) return state;
  const s = structuredClone(state);
  s.gold -= gymExtraById(id)!.price;
  s.life.gymExtras.push(id);
  return s;
}

// ─── Жильё ─────────────────────────────────────────────────────────────

/** Сколько кошек помещается в жильё. */
export const maxCats = (life: LifeState): number => HOUSES[life.house]?.cats ?? MAX_CATS;

export type HouseBlocker = 'max' | 'level' | 'money' | null;

export function houseBlocker(s: GameState): HouseBlocker {
  const next = HOUSES[s.life.house + 1];
  if (!next) return 'max';
  if (trainerLevel(s) < next.level) return 'level';
  if (s.gold < next.cost) return 'money';
  return null;
}

/**
 * Расширить жильё: комната больше, мест для мебели и декора больше; вещи переезжают с вами.
 * Старьё из убитой однушки (облезлые обои, линолеум, лампочка) в новом жилье заменяет простой ремонт.
 */
export function upgradeHouse(state: GameState): GameState {
  if (houseBlocker(state)) return state;
  const s = structuredClone(state);
  s.life.house += 1;
  const h = HOUSES[s.life.house]!;
  s.gold -= h.cost;
  const tally = startTally();
  for (const k of DECOR_KINDS) {
    if (!finishById(s.life.decor[k])?.old) continue;
    s.life.decor[k] = BASIC_DECOR[k];
    if (!s.life.finishes.includes(BASIC_DECOR[k])) s.life.finishes.push(BASIC_DECOR[k]);
    tally.notes.push(t(`Новое жильё: ${finishById(BASIC_DECOR[k])!.name.ru.toLowerCase()}`, `New home: ${finishById(BASIC_DECOR[k])!.name.en.toLowerCase()}`));
  }
  finish(s, h.icon, h.name, true, 0, tally);
  return s;
}

// ─── Ремонт ────────────────────────────────────────────────────────────

export type FinishBlocker = 'current' | 'level' | 'money' | null;

/** Можно ли выбрать отделку: уже стоит, рано по уровню, не хватает денег (купленную — бесплатно). */
export function finishBlocker(s: GameState, id: string): FinishBlocker {
  const def = finishById(id);
  if (!def || s.life.decor[def.kind] === id) return 'current';
  if (s.life.finishes.includes(id)) return null;
  if (def.old) return 'current';
  if (trainerLevel(s) < (def.level ?? 1)) return 'level';
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

/** Сколько всего ещё можно улучшить (для подсказки): старьё в доме. */
export function oldStuff(life: LifeState): number {
  return DECOR_KINDS.filter((k) => finishById(life.decor[k])?.old).length + KITS.filter((k) => !life.kit[k.id]).length;
}


export function dismissResult(state: GameState): GameState {
  if (!state.life.last) return state;
  return { ...state, life: { ...state.life, last: null } };
}

// ─── Самостоятельность сима ────────────────────────────────────────────

/** Насколько важно поднять потребность: чем ниже, тем срочнее. */
const urgency = (v: number): number => ((100 - v) / 100) ** 2 * 4 + 0.05;

/** Польза действия для сима: прибавка потребностей с учётом срочности, деньги, вред фигуре. */
function actionValue(state: GameState, a: ActionDef): number {
  const after = act(state, a.id).state;
  if (after === state) return -Infinity;
  const before = state.life;
  let v = 0;
  for (const n of NEEDS) v += urgency(before.needs[n]) * (after.life.needs[n] - before.needs[n]);
  v += (after.gold - state.gold) * 0.08;
  v -= Math.max(0, after.life.fat - before.fat) * 300;
  const xp = SKILLS.reduce((acc, k) => acc + (after.life.skills[k] - before.skills[k]), 0);
  v += xp * 0.05;
  // Ночью сим ложится спать, а не дремлет урывками.
  const h = hourOf(before.minute);
  const night = h >= 22 || h < 5;
  if (a.id === 'sleep') v += night && before.needs.energy < 75 ? 40 : -20;
  if (a.id === 'nap' && night) v -= 20;
  return v;
}

/** Сколько денег сим не тратит сам (кроме еды, когда очень голоден, и корма кошкам). */
export const AUTO_RESERVE = 40;
/** Сколько последних дел сим помнит, чтобы не повторять одно и то же. */
export const AUTO_MEMORY = 6;

/** Можно ли симу самому заплатить за действие. */
function affordable(state: GameState, a: ActionDef): boolean {
  const cost = a.cost ?? 0;
  if (!cost) return true;
  const food = state.life.needs.food;
  // Последние деньги — только на еду, когда совсем голоден, и на корм кошкам.
  const essential = a.id === 'fill_bowl' || ((a.id === 'groceries' || a.id === 'order' || a.id === 'smoothie' || a.id === 'salad') && food < 15);
  return essential ? state.gold >= cost : state.gold - cost >= AUTO_RESERVE;
}

/** Досуг, когда срочных нужд нет: чем заняться, чтобы не стоять (без трат и без вреда фигуре). */
function leisureValue(state: GameState, a: ActionDef): number {
  const life = state.life;
  const e = a.effect;
  if (a.cost || a.sleep || a.id === 'groceries' || a.id === 'call_cat' || a.id === 'pair_cats') return -Infinity;
  if (e.needs?.food && life.needs.food > 70) return -Infinity;
  if ((e.fat ?? 0) > 0 && life.fat > 0.2) return -Infinity;
  const spend = Math.min(0, e.needs?.energy ?? 0);
  if (spend < 0 && life.needs.energy < 35) return -Infinity;
  const fun = Math.max(0, e.needs?.fun ?? 0);
  const social = Math.max(0, e.needs?.social ?? 0);
  const xp = Object.values(e.skills ?? {}).reduce((x, n) => x + (n ?? 0), 0);
  const money = Math.max(0, e.money ?? 0);
  // Уборка лотка заранее, пока он не стал грязным.
  const tidy = e.litter && e.litter < 0 && life.litter >= 40 ? life.litter * 0.06 : 0;
  // Душ, перекус и прочие «нужды» — не досуг.
  if (!fun && !social && !xp && !money && !e.catPlay && !tidy) return -Infinity;
  let v = 3 + fun * 0.08 + social * 0.06 + xp * 0.08 + money * 0.04 + tidy;
  // Кошки рады вниманию — особенно заскучавшие.
  if (e.catPlay) v += 0.5 + Math.max(0, 60 - Math.min(...life.cats.map((c) => c.play), 100)) * 0.08;
  return v;
}

/**
 * Что сим сделает сам: самое полезное действие у предметов текущей локации, а если срочных
 * нужд нет — досуг (кошка, книга, кино, музыка, хобби), чтобы не стоять. Камерные тренировки
 * и занятия сим без игрока не начинает, денег сам почти не тратит (запас AUTO_RESERVE),
 * недавние дела (recent, последние — в конце) повторяет неохотно. Из зала уходит домой,
 * если пора спать или нужно поесть, а в зале нечем. null — делать нечего.
 */
export function autoAction(state: GameState, recent: readonly string[] = []): ActionDef | null {
  return autoChoice(state, recent)?.action ?? null;
}

/** С какой пользы дело срочное (голод, ночь и усталость, пустая миска) — его сим делает и между делами. */
export const AUTO_URGENT = 25;
/** Потребность ниже этого — срочно. */
const CRITICAL = 35;

/** Срочное ли дело: поднимает почти пустую потребность, ночной сон уставшего, пустые миски. */
function pressing(life: LifeState, a: ActionDef): boolean {
  if (a.id === 'fill_bowl') return true;
  if (a.id === 'groceries') return life.needs.food < CRITICAL;
  if (a.id === 'sleep') {
    const h = hourOf(life.minute);
    return (h >= 22 || h < 5) && life.needs.energy < 75;
  }
  return NEEDS.some((n) => life.needs[n] < CRITICAL && (a.effect.needs?.[n] ?? 0) > 0);
}

/**
 * То же, что autoAction, но с пометкой, досуг ли это (leisure — не срочная нужда, а занятие).
 * urgentOnly — только срочное (польза больше AUTO_URGENT): между делами сим прохаживается,
 * не тратя игрового времени, и прерывается лишь на срочное.
 */
export function autoChoice(state: GameState, recent: readonly string[] = [], urgentOnly = false): { action: ActionDef; leisure: boolean } | null {
  const life = state.life;
  if (life.event || life.session) return null;
  const mem = recent.slice(-AUTO_MEMORY);
  const repeats = (id: string): number => mem.reduce((n, x, i) => n + (x === id ? 0.5 + (i + 1) / mem.length : 0), 0);
  let best: ActionDef | null = null;
  // Порог: сим не бросается к холодильнику из-за пары пунктов сытости.
  let score = urgentOnly ? AUTO_URGENT : 14;
  let fun: ActionDef | null = null;
  let funScore = 0;
  const jitter = rng(`${life.day}:${life.minute}:${mem.length}`);
  for (const a of ACTIONS) {
    if (a.train || a.open || a.go || !hasObject(state, a.at) || blocker(state, a) || !affordable(state, a)) continue;
    if (urgentOnly && !pressing(life, a)) continue;
    let v: number;
    if (a.id === 'groceries') v = life.groceries === 0 && life.needs.food < 70 ? urgency(life.needs.food) * 25 : -Infinity;
    else if (a.id === 'fill_bowl') v = life.bowl === 0 || life.water < 10 ? 30 : life.bowl === 1 || life.water < 30 ? 12 : -Infinity;
    else if (a.id === 'clean_litter') v = life.litter >= LITTER_DIRTY ? 18 + (life.litter - LITTER_DIRTY) * 0.3 : -Infinity;
    else if (a.id === 'call_cat' || a.id === 'pair_cats') v = -Infinity;
    else v = actionValue(state, a);
    v -= repeats(a.id) * 9;
    if (v > score) {
      score = v;
      best = a;
    }
    const lv = leisureValue(state, a) - repeats(a.id) * 4 + jitter() * 2;
    if (lv > funScore) {
      funScore = lv;
      fun = a;
    }
  }
  if (life.scene === 'gym') {
    const h = hourOf(life.minute);
    const late = h >= 22 || h < 6 || !gymOpen(life.minute);
    const tired = life.needs.energy < 30;
    const hungry = life.needs.food < 35 && !GYMS[life.gym]!.bar;
    if (late || tired || hungry || (!best && life.needs.hygiene < 30 && !urgentOnly)) {
      const home = actionById('go_home');
      return home ? { action: home, leisure: false } : null;
    }
  }
  if (best) return { action: best, leisure: false };
  return !urgentOnly && fun ? { action: fun, leisure: true } : null;
}

export { SKILLS, NEEDS };
