import type { ExerciseId } from '../tracking/exercise';
import type { StatId } from './config';
import { levelOf } from './levels';
import {
  ACTIONS,
  BASE_OBJECTS,
  HOMES,
  HOME_IDS,
  JOBS,
  LIFE_EVENTS,
  LOCATIONS,
  OBJECTS,
  PEOPLE,
  PERSON_ACTIONS,
  PERSON_IDS,
  actionById,
  lifeEventById,
} from './lifeContent';
import { rng } from './random';
import type { Appearance, BodyPart, GameState } from './state';
import {
  NEEDS,
  SKILLS,
  type ActionDef,
  type HomeId,
  type JobId,
  type LifeEffect,
  type LifeResult,
  type LifeState,
  type LocationId,
  type NeedId,
  type ObjectId,
  type PersonId,
  type SkillId,
  type Txt,
} from './lifeTypes';

/**
 * Симулятор жизни: время идёт действиями (каждое занимает игровые минуты),
 * потребности со временем падают, деньги дают работа и тренировки (квесты и
 * ежедневки), отношения строятся разговорами и свиданиями. Настоящие тренировки
 * перед камерой меняют фигуру героя, открывают работу тренера и модели.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

export const DAY = 1440;
export const WAKE_HOUR = 7;
export const RENT_PERIOD = 7;

export function newLife(): LifeState {
  return {
    day: 1,
    minute: 8 * 60,
    needs: { food: 70, energy: 85, hygiene: 75, fun: 65, social: 55 },
    scene: 'home',
    groceries: 3,
    job: null,
    skills: { cooking: 0, charisma: 0, logic: 0, creativity: 0 },
    home: 'studio',
    furniture: [],
    people: {},
    fat: 0,
    rentUntil: 1 + RENT_PERIOD,
    debt: 0,
    event: null,
    last: null,
    stats: { shifts: 0, dates: 0, meals: 0, promotions: 0, workouts: 0 },
  };
}

export function migrateLife(raw: Partial<LifeState> | undefined): LifeState {
  const base = newLife();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    needs: { ...base.needs, ...(raw.needs ?? {}) },
    skills: { ...base.skills, ...(raw.skills ?? {}) },
    stats: { ...base.stats, ...(raw.stats ?? {}) },
    people: { ...(raw.people ?? {}) },
    furniture: [...(raw.furniture ?? [])],
  };
}

// ─── Показатели ────────────────────────────────────────────────────────

/** Уровень навыка 0…10 по опыту (уровень L — 12·L² опыта). */
export const skillLevel = (xp: number): number => Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp) / 12)));
/** Опыт до следующего уровня навыка. */
export const skillNext = (xp: number): number => 12 * (skillLevel(xp) + 1) ** 2;

const STAT_IDS: readonly StatId[] = ['strength', 'legs', 'core', 'endurance'];

/** Спортивная форма: средний уровень характеристик (растут только от тренировок перед камерой). */
export function fitness(s: GameState): number {
  return Math.round((STAT_IDS.reduce((a, k) => a + levelOf(s.statXp[k]), 0) / STAT_IDS.length) * 10) / 10;
}

/** Настроение — среднее потребностей. */
export const mood = (life: LifeState): number => Math.round(NEEDS.reduce((a, n) => a + life.needs[n], 0) / NEEDS.length);

/** Привлекательность 0…100: форма, обаяние, опрятность, наряд и вес. */
export function looks(s: GameState): number {
  const life = s.life;
  const outfit = Math.min(14, Object.values(s.equipped).filter(Boolean).length * 1.6);
  const v = 22 + fitness(s) * 4 + skillLevel(life.skills.charisma) * 3 + life.needs.hygiene * 0.12 + outfit - Math.max(0, life.fat) * 18 - Math.max(0, -life.fat - 0.6) * 10;
  return Math.max(0, Math.min(100, Math.round(v)));
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Фигура героя с учётом тренировок и питания: мышцы растут с силой, вес — с «лишним весом». */
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

// ─── Время ─────────────────────────────────────────────────────────────

export const hourOf = (minute: number): number => Math.floor(minute / 60);
export const clock = (minute: number): string => `${String(hourOf(minute)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Час h попадает в окно [a, b) (b может быть больше 24 — до утра). */
export const inHours = (h: number, [a, b]: [number, number]): boolean => (h >= a && h < b) || (h + 24 >= a && h + 24 < b);

export const isOpen = (loc: LocationId, minute: number): boolean => {
  const hours = LOCATIONS[loc].hours;
  return !hours || inHours(hourOf(minute), hours);
};

/** Где персонаж сейчас (null — дома, не на улице). */
export function personPlace(id: PersonId, minute: number): LocationId | null {
  const h = hourOf(minute);
  for (const [loc, a, b] of PEOPLE[id].schedule) if (inHours(h, [a, b])) return loc;
  return null;
}

export const peopleAt = (loc: LocationId, minute: number): PersonId[] => PERSON_IDS.filter((p) => personPlace(p, minute) === loc);

/** Скорость изменения потребностей в час: бодрствование и сон. */
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
}

/** Проходит время: потребности, новый день, аренда, отношения, утреннее событие. */
function passTime(s: GameState, minutes: number, asleep: boolean, tally: Tally): void {
  const life = s.life;
  const comfort = HOMES[life.home].comfort;
  let left = minutes;
  while (left > 0) {
    const step = Math.min(left, DAY - life.minute, 60);
    for (const n of NEEDS) {
      let rate = (asleep ? ASLEEP : AWAKE)[n];
      if (n === 'fun' && rate < 0) rate *= 1 - comfort;
      tally.needs[n] = (tally.needs[n] ?? 0) + bump(life, n, (rate * step) / 60);
    }
    life.minute += step;
    left -= step;
    if (life.minute >= DAY) {
      life.minute -= DAY;
      life.day += 1;
      newDay(s, tally);
    }
  }
}

function newDay(s: GameState, tally: Tally): void {
  const life = s.life;
  // Аренда раз в неделю.
  if (life.day >= life.rentUntil) {
    const rent = HOMES[life.home].rent;
    if (s.gold >= rent) {
      s.gold -= rent;
      tally.money -= rent;
      tally.notes.push(t(`Списана аренда: ${rent}`, `Rent paid: ${rent}`));
    } else {
      life.debt += rent;
      tally.needs.fun = (tally.needs.fun ?? 0) + bump(life, 'fun', -20);
      tally.notes.push(t(`Не хватило на аренду: долг ${life.debt}`, `Couldn’t pay rent: debt ${life.debt}`));
    }
    life.rentUntil += RENT_PERIOD;
  }
  // Без общения отношения остывают (кроме партнёра).
  for (const id of PERSON_IDS) {
    const r = life.people[id];
    if (!r || r.partner || r.aff <= 0) continue;
    if ((life.day - r.last) % 5 === 0 && life.day > r.last) r.aff -= 1;
  }
  // Утреннее событие — примерно через день.
  const roll = rng(`${s.character.id}:life:${life.day}`);
  if (!life.event && roll() < 0.5) {
    const pool = LIFE_EVENTS.filter((e) => (!e.needsJob || life.job) && (e.person === undefined || PERSON_IDS.some((p) => (life.people[p]?.aff ?? -99) >= e.person!)));
    const ev = pool[Math.floor(roll() * pool.length)];
    if (ev) {
      const friends = PERSON_IDS.filter((p) => (life.people[p]?.aff ?? -99) >= (ev.person ?? 0));
      life.event = ev.person !== undefined ? { id: ev.id, person: friends[Math.floor(roll() * friends.length)]! } : { id: ev.id };
    }
  }
}

/** Минуты сна до утра (7:00); если до утра меньше 4 часов — полные 8 часов. */
export function sleepMinutes(minute: number): number {
  const m = (WAKE_HOUR * 60 - minute + DAY) % DAY;
  return m < 240 ? 480 : m;
}

// ─── Эффекты ───────────────────────────────────────────────────────────

function applyEffect(s: GameState, e: LifeEffect, tally: Tally & { skills: Partial<Record<SkillId, number>> }, person?: PersonId): number {
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
  let aff = 0;
  if (person && e.aff) {
    const r = life.people[person];
    if (r) {
      const before = r.aff;
      r.aff = clamp(r.aff + e.aff, -5, 10);
      aff = r.aff - before;
    }
  }
  return aff;
}

export const SKILL_NAME: Record<SkillId, Txt> = {
  cooking: t('Кулинария', 'Cooking'),
  charisma: t('Обаяние', 'Charisma'),
  logic: t('Логика', 'Logic'),
  creativity: t('Творчество', 'Creativity'),
};

// ─── Доступность действий ──────────────────────────────────────────────

export type Blocker = 'closed' | 'money' | 'groceries' | 'need' | 'skill' | 'job' | 'hours' | 'missing' | null;

export const hasObject = (life: LifeState, id: ObjectId): boolean => BASE_OBJECTS.includes(id) || life.furniture.includes(id);

/** Почему действие сейчас недоступно (null — можно). */
export function blocker(s: GameState, a: ActionDef): Blocker {
  const life = s.life;
  if ('object' in a.at) {
    if (life.scene !== 'home' || !hasObject(life, a.at.object)) return 'missing';
  } else {
    if (life.scene !== 'city') return 'missing';
    if (!isOpen(a.at.location, life.minute)) return 'closed';
  }
  if (a.work) {
    const job = life.job;
    if (!job || JOBS[job.id].location !== (a.at as { location: LocationId }).location) return 'job';
    const def = JOBS[job.id];
    const h = life.minute / 60;
    if (h < def.hours[0] || h + def.shift / 60 > def.hours[1]) return 'hours';
    if (life.needs.energy < 25) return 'need';
    return null;
  }
  const r = a.requires;
  if (r?.hours && !inHours(hourOf(life.minute), r.hours)) return 'hours';
  if (r?.groceries && life.groceries < r.groceries) return 'groceries';
  if (r?.need && life.needs[r.need[0]] < r.need[1]) return 'need';
  if (r?.skill && skillLevel(life.skills[r.skill[0]]) < r.skill[1]) return 'skill';
  if ((a.cost ?? 0) > s.gold) return 'money';
  return null;
}

/** Действия у предмета квартиры или у места в городе. */
export const actionsAt = (where: { object: ObjectId } | { location: LocationId }): ActionDef[] =>
  ACTIONS.filter((a) => ('object' in where ? 'object' in a.at && a.at.object === where.object : 'location' in a.at && a.at.location === where.location));

// ─── Действия ──────────────────────────────────────────────────────────

export interface LifeOutcome {
  state: GameState;
  /** Открыть тренировку перед камерой. */
  train?: boolean;
  open?: ActionDef['open'];
}

const same = (state: GameState): LifeOutcome => ({ state });

function startTally(): Tally & { skills: Partial<Record<SkillId, number>> } {
  return { needs: {}, money: 0, notes: [], skills: {} };
}

/** Без сил герой засыпает и просыпается дома. */
function collapse(s: GameState, tally: Tally): number {
  const life = s.life;
  if (life.needs.energy > 0) return 0;
  life.scene = 'home';
  const m = sleepMinutes(life.minute);
  passTime(s, m, true, tally);
  tally.notes.push(t('Силы кончились — вы уснули и проснулись дома.', 'You ran out of energy, fell asleep and woke up at home.'));
  return m;
}

function finish(s: GameState, icon: string, text: Txt, ok: boolean, minutes: number, tally: ReturnType<typeof startTally>, aff?: LifeResult['aff']): void {
  const r: LifeResult = { icon, text, ok, needs: tally.needs, money: tally.money, minutes, notes: tally.notes };
  if (Object.keys(tally.skills).length) r.skills = tally.skills;
  if (aff) r.aff = aff;
  s.life.last = r;
}

/** Выполнить действие у предмета или места. */
export function act(state: GameState, actionId: string): LifeOutcome {
  const a = actionById(actionId);
  if (!a || state.life.event) return same(state);
  if (blocker(state, a)) return same(state);
  const s = structuredClone(state);
  const life = s.life;
  const tally = startTally();
  if (a.work) return { state: work(s, a, tally) };
  if (a.cost) {
    s.gold -= a.cost;
    tally.money -= a.cost;
  }
  let minutes = a.minutes;
  if (a.sleep) {
    if (a.id === 'sleep') minutes = sleepMinutes(life.minute);
    passTime(s, minutes, true, tally);
  } else {
    passTime(s, minutes, false, tally);
    applyEffect(s, a.effect, tally);
  }
  if (a.id === 'cook' || a.id === 'cook_fancy' || a.id === 'cafe_lunch') life.stats.meals += 1;
  if (a.go) life.scene = a.go;
  minutes += collapse(s, tally);
  // Переход между домом и городом — без всплывающего итога (если ничего не случилось).
  if (a.go && tally.notes.length === 0) life.last = null;
  else finish(s, a.icon, a.label, true, minutes, tally);
  const out: LifeOutcome = { state: s };
  if (a.train) out.train = true;
  if (a.open) out.open = a.open;
  return out;
}

/** Рабочая смена: оплата зависит от настроения, после нескольких смен — повышение. */
function work(s: GameState, a: ActionDef, tally: ReturnType<typeof startTally>): GameState {
  const life = s.life;
  const job = life.job!;
  const def = JOBS[job.id];
  const moodBefore = mood(life);
  passTime(s, def.shift, false, tally);
  bump(life, 'energy', -8);
  job.perf = clamp(job.perf + (moodBefore - 50) / 10 + 3, 0, 100);
  const pay = Math.round(def.levels[job.level]!.pay * (0.85 + job.perf / 330));
  s.gold += pay;
  tally.money += pay;
  applyEffect(s, { skills: { [def.grows]: 10 }, needs: { social: 15 } }, tally);
  job.shifts += 1;
  life.stats.shifts += 1;
  const next = def.levels[job.level + 1];
  if (next && job.shifts >= def.promoteAfter && meetsLevel(s, job.id, job.level + 1)) {
    job.level += 1;
    job.shifts = 0;
    life.stats.promotions += 1;
    tally.notes.push(t(`Повышение: ${next.title.ru}!`, `Promotion: ${next.title.en}!`));
  } else if (next && job.shifts >= def.promoteAfter) {
    tally.notes.push(t('Для повышения не хватает требований должности.', 'You don’t meet the requirements for promotion yet.'));
  }
  const minutes = def.shift + collapse(s, tally);
  finish(s, a.icon, t(`Смена: ${def.levels[job.level]!.title.ru}`, `Shift: ${def.levels[job.level]!.title.en}`), true, minutes, tally);
  return s;
}

/** Выполнены ли требования должности. */
export function meetsLevel(s: GameState, job: JobId, level: number): boolean {
  const l = JOBS[job].levels[level];
  if (!l) return false;
  if (l.skill && skillLevel(s.life.skills[l.skill[0]]) < l.skill[1]) return false;
  if (l.fitness !== undefined && fitness(s) < l.fitness) return false;
  if (l.looks !== undefined && looks(s) < l.looks) return false;
  return true;
}

export function applyJob(state: GameState, job: JobId): GameState {
  if (state.life.job?.id === job || !meetsLevel(state, job, 0)) return state;
  const s = structuredClone(state);
  s.life.job = { id: job, level: 0, shifts: 0, perf: 50 };
  const tally = startTally();
  tally.notes.push(t(`Вы приняты: ${JOBS[job].levels[0]!.title.ru}`, `Hired: ${JOBS[job].levels[0]!.title.en}`));
  finish(s, JOBS[job].icon, JOBS[job].name, true, 0, tally);
  return s;
}

export function quitJob(state: GameState): GameState {
  if (!state.life.job) return state;
  const s = structuredClone(state);
  s.life.job = null;
  return s;
}

// ─── Люди ──────────────────────────────────────────────────────────────

/** Шанс проверки обаяния. */
export function charmChance(s: GameState, person: PersonId, base: number): number {
  const r = s.life.people[person];
  const p = base + (looks(s) - 50) / 150 + skillLevel(s.life.skills.charisma) * 0.03 + (r?.aff ?? 0) * 0.02 + (mood(s.life) - 50) / 300;
  return clamp(p, 0.1, 0.95);
}

export type PersonBlocker = 'absent' | 'aff' | 'money' | 'where' | 'partner' | 'taken' | null;

export function personBlocker(s: GameState, person: PersonId, actionId: string, at: LocationId): PersonBlocker {
  const a = PERSON_ACTIONS.find((x) => x.id === actionId);
  const life = s.life;
  if (!a || life.scene !== 'city' || personPlace(person, life.minute) !== at) return 'absent';
  const r = life.people[person];
  if (a.where && !a.where.includes(at)) return 'where';
  if (a.minAff !== undefined && (r?.aff ?? 0) < a.minAff) return 'aff';
  if (a.partner === true && !r?.partner) return 'partner';
  if (a.partner === false && r?.partner) return 'partner';
  if (a.romance && PERSON_IDS.some((p) => p !== person && life.people[p]?.partner)) return 'taken';
  if ((a.cost ?? 0) > s.gold) return 'money';
  return null;
}

/** Действие с персонажем (первое — знакомство). */
export function personAct(state: GameState, person: PersonId, actionId: string, at: LocationId): LifeOutcome {
  if (state.life.event || personBlocker(state, person, actionId, at)) return same(state);
  const a = PERSON_ACTIONS.find((x) => x.id === actionId)!;
  const s = structuredClone(state);
  const life = s.life;
  const tally = startTally();
  if (!life.people[person]) {
    life.people[person] = { aff: 0, met: life.day, last: life.day, dates: 0 };
    tally.notes.push(t(`Новое знакомство: ${PEOPLE[person].name.ru}`, `New acquaintance: ${PEOPLE[person].name.en}`));
  }
  const r = life.people[person]!;
  if (a.cost) {
    s.gold -= a.cost;
    tally.money -= a.cost;
  }
  const roll = rng(`${s.character.id}:charm:${life.day}:${life.minute}:${person}:${a.id}`);
  const ok = a.check === undefined || roll() < charmChance(s, person, a.check);
  passTime(s, a.minutes, false, tally);
  const delta = applyEffect(s, ok ? a.success : (a.fail ?? a.success), tally, person);
  r.last = life.day;
  if (ok && a.id === 'date') {
    r.dates += 1;
    life.stats.dates += 1;
  }
  if (ok && a.romance) {
    r.partner = true;
    tally.notes.push(t(`Теперь вы пара: ${PEOPLE[person].name.ru} ❤`, `You’re a couple now: ${PEOPLE[person].name.en} ❤`));
  }
  const minutes = a.minutes + collapse(s, tally);
  finish(s, a.icon, a.label, ok, minutes, tally, { person, delta });
  const out: LifeOutcome = { state: s };
  if (a.train && ok) out.train = true;
  return out;
}

// ─── Событие, мебель, жильё ────────────────────────────────────────────

export function answerEvent(state: GameState, choiceId: string): GameState {
  const ev = state.life.event ? lifeEventById(state.life.event.id) : undefined;
  const c = ev?.choices.find((x) => x.id === choiceId);
  if (!ev || !c || (c.cost ?? 0) > state.gold) return state;
  const s = structuredClone(state);
  const tally = startTally();
  const person = s.life.event?.person;
  if (c.cost) {
    s.gold -= c.cost;
    tally.money -= c.cost;
  }
  const delta = applyEffect(s, c.effect, tally, person);
  if (person && s.life.people[person]) s.life.people[person]!.last = s.life.day;
  s.life.event = null;
  finish(s, ev.icon, c.text, true, 0, tally, person ? { person, delta } : undefined);
  return s;
}

export const furnitureSlots = (life: LifeState): number => HOMES[life.home].slots;
const homeRank = (h: HomeId): number => HOME_IDS.indexOf(h);

export type FurnitureBlocker = 'owned' | 'money' | 'space' | 'home' | null;

export function furnitureBlocker(s: GameState, id: ObjectId): FurnitureBlocker {
  const o = OBJECTS[id];
  const life = s.life;
  if (o.price === undefined) return 'owned';
  if (life.furniture.includes(id)) return 'owned';
  if (o.minHome && homeRank(life.home) < homeRank(o.minHome)) return 'home';
  if (life.furniture.length >= furnitureSlots(life)) return 'space';
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
  s.life.furniture = s.life.furniture.filter((x) => x !== id);
  s.gold += Math.round((OBJECTS[id].price ?? 0) * 0.4);
  return s;
}

/** Переезд: оплата первой недели; мебель, которая не помещается, продаётся. */
export function moveHome(state: GameState, home: HomeId): GameState {
  const h = HOMES[home];
  if (state.life.home === home || state.gold < h.rent + state.life.debt) return state;
  const s = structuredClone(state);
  s.gold -= h.rent + s.life.debt;
  s.life.debt = 0;
  s.life.home = home;
  s.life.rentUntil = s.life.day + RENT_PERIOD;
  const keep = s.life.furniture.filter((id) => !OBJECTS[id].minHome || homeRank(home) >= homeRank(OBJECTS[id].minHome!)).slice(0, h.slots);
  for (const id of s.life.furniture) if (!keep.includes(id)) s.gold += Math.round((OBJECTS[id].price ?? 0) * 0.4);
  s.life.furniture = keep;
  return s;
}

export function payDebt(state: GameState): GameState {
  const d = state.life.debt;
  if (!d || state.gold < d) return state;
  const s = structuredClone(state);
  s.gold -= d;
  s.life.debt = 0;
  return s;
}

export function dismissResult(state: GameState): GameState {
  if (!state.life.last) return state;
  return { ...state, life: { ...state.life, last: null } };
}

// ─── Связь с тренировками ──────────────────────────────────────────────

const CARDIO: readonly ExerciseId[] = ['jumping_jack', 'high_knees'];

/** Повтор перед камерой: тело устаёт, настроение растёт, лишний вес уходит (s уже скопировано). */
export function lifeOnRep(s: GameState, exercise: ExerciseId): void {
  const life = s.life;
  const cardio = CARDIO.includes(exercise);
  bump(life, 'energy', cardio ? -0.12 : -0.2);
  bump(life, 'hygiene', -0.25);
  bump(life, 'food', -0.1);
  bump(life, 'fun', 0.2);
  life.fat = clamp(life.fat - (cardio ? 0.0007 : 0.0005), -1, 1);
  life.stats.workouts += 1;
}

export { SKILLS, NEEDS };
