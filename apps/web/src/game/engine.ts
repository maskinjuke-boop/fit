import type { ExerciseId } from '../tracking/exercise';
import { cityNewRealDay, cityOnRep, cityRepMoney } from './city/city';
import { START_GOLD } from './city/content';
import { EXERCISE_GAME, NEWBIE_DAYS, NEWBIE_LIMIT_FACTOR } from './config';
import { dayKey, daysBetween } from './dates';
import { emptyDay, type Character, type DayStats, type GameState } from './state';

/**
 * Игровые правила вокруг упражнений: повтор приносит деньги (в пределах дневного лимита
 * упражнения) и засчитывается в подношение богам; смена реального дня — проверка
 * подношения (пожар) и новое подношение.
 */

export type GameEvent =
  | { kind: 'gold'; amount: number }
  | { kind: 'limit'; exercise: ExerciseId }
  | { kind: 'offering'; exercise: ExerciseId; done: number; target: number }
  | { kind: 'offeringDone' }
  | { kind: 'cityFire'; houses: number; cats: string[] };

export interface Result {
  state: GameState;
  events: GameEvent[];
}

/** Деньги за засчитанный повтор. */
export const REP_MONEY = 1;
/** Сколько дней хранится статистика. */
const HISTORY_DAYS = 30;

export function todayStats(s: GameState): DayStats {
  let d = s.days[s.today];
  if (!d) {
    d = emptyDay();
    s.days[s.today] = d;
  }
  return d;
}

/** Переход на новый реальный день: подношение за вчера (иначе пожар), новое на сегодня. */
export function ensureDay(state: GameState, now: Date): Result {
  const today = dayKey(now);
  if (state.today === today && state.city.offering?.day === today) return { state, events: [] };
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  const fire = cityNewRealDay(s, s.today, today);
  if (fire.houses > 0) events.push({ kind: 'cityFire', ...fire });
  s.today = today;
  for (const day of Object.keys(s.days)) if (daysBetween(day, today) > HISTORY_DAYS) delete s.days[day];
  todayStats(s);
  return { state: s, events };
}

/** Новичок: первые две недели лимиты ниже. */
export const isNewbie = (s: GameState): boolean => daysBetween(s.character.createdDay, s.today) < NEWBIE_DAYS;

/** Дневной лимит упражнения (сверх него повторы не приносят денег). */
export function dailyLimit(s: GameState, exercise: ExerciseId): number {
  const base = EXERCISE_GAME[exercise].dailyLimit;
  return Math.round(base * (isNewbie(s) ? NEWBIE_LIMIT_FACTOR : 1));
}

function repsInLimitGroup(stats: DayStats, exercise: ExerciseId): number {
  const g = EXERCISE_GAME[exercise].limitGroup;
  return (Object.entries(stats.reps) as Array<[ExerciseId, number]>).filter(([ex]) => EXERCISE_GAME[ex].limitGroup === g).reduce((a, [, n]) => a + n, 0);
}

/** Засчитанный повтор: деньги и подношение. */
export function applyRep(state: GameState, rep: { exercise: ExerciseId; quality: number }, now: Date): Result {
  const day = ensureDay(state, now);
  const s = day.state === state ? structuredClone(state) : day.state;
  const events: GameEvent[] = [...day.events];
  const stats = todayStats(s);
  const before = repsInLimitGroup(stats, rep.exercise);
  const limit = dailyLimit(s, rep.exercise);
  const over = before >= limit;
  if (before === limit) events.push({ kind: 'limit', exercise: rep.exercise });
  stats.reps[rep.exercise] = (stats.reps[rep.exercise] ?? 0) + 1;
  if (rep.quality >= 80) stats.goodReps[rep.exercise] = (stats.goodReps[rep.exercise] ?? 0) + 1;
  s.lifetimeReps[rep.exercise] = (s.lifetimeReps[rep.exercise] ?? 0) + 1;
  if (!over) {
    cityRepMoney(s, REP_MONEY);
    events.push({ kind: 'gold', amount: REP_MONEY });
  }
  const o = s.city.offering;
  const wasDone = !!o?.complete;
  if (cityOnRep(s, rep.exercise) || (o && !wasDone && o.complete)) events.push({ kind: 'offeringDone' });
  else {
    const task = o && !o.complete && o.day === s.today ? o.tasks.find((x) => x.exercise === rep.exercise) : undefined;
    if (task) events.push({ kind: 'offering', exercise: rep.exercise, done: task.done, target: task.target });
  }
  return { state: s, events };
}

/** Новая игра: стартовые деньги, подношение на сегодня. */
export function newGameState(character: Omit<Character, 'id' | 'createdDay'>, now: Date, create: (c: Character) => GameState): GameState {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Date.now()}${Math.random()}`;
  const s = create({ ...character, id, createdDay: dayKey(now) });
  s.gold = START_GOLD;
  return ensureDay(s, now).state;
}

/** Для администратора: деньги напрямую. */
export function grant(state: GameState, gold: number): Result {
  const s = structuredClone(state);
  s.gold = Math.max(0, s.gold + gold);
  return { state: s, events: [] };
}
