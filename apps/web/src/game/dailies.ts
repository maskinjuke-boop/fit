import type { ExerciseId } from '../tracking/exercise';
import { EXERCISE_GAME, type FitnessLevel, type MuscleGroup } from './config';
import { addDays } from './dates';
import { pick, rng } from './random';
import type { DailyTask, DayStats, GameState } from './state';

/**
 * Ежедневные задания (ТЗ, раздел 6): три задания в день —
 * силовое, «игровое» и на технику или разнообразие.
 *
 * Боя, крафта и экспедиций пока нет, поэтому игровой слот — это кардио
 * или «набери N опыта за день». Прогресс заданий считается из статистики дня,
 * поэтому он не теряется при замене задания и не может разойтись с фактом.
 */

const STRENGTH: readonly ExerciseId[] = ['pushup', 'squat', 'lunge', 'situp', 'pullup'];
const CARDIO: readonly ExerciseId[] = ['jumping_jack', 'high_knees'];

/** Стартовые объёмы по уровню подготовки (ТЗ: новичкам — минимальные значения шаблона). */
const BASE: Record<FitnessLevel, Partial<Record<ExerciseId, number>>> = {
  beginner: { pushup: 10, squat: 15, lunge: 10, situp: 15, pullup: 3, pullup_australian: 8, jumping_jack: 30, high_knees: 40 },
  intermediate: { pushup: 20, squat: 30, lunge: 20, situp: 25, pullup: 6, pullup_australian: 12, jumping_jack: 50, high_knees: 60 },
  advanced: { pushup: 30, squat: 45, lunge: 30, situp: 40, pullup: 10, pullup_australian: 20, jumping_jack: 80, high_knees: 100 },
};
const XP_TARGET: Record<FitnessLevel, number> = { beginner: 300, intermediate: 500, advanced: 800 };

/** Награды шаблонов — из примера пула в ТЗ. */
const REWARD = {
  reps: { xp: 150, gold: 50 },
  pullups: { xp: 300, gold: 100 },
  cardio: { xp: 150, gold: 50 },
  xp: { xp: 120, gold: 60 },
  technique: { xp: 200, gold: 75 },
  variety: { xp: 250, gold: 80 },
} as const;

export const VARIETY_EXERCISES = 3;
export const VARIETY_REPS = 10;
export const TECHNIQUE_QUALITY = 80;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function roundNice(n: number): number {
  if (n <= 10) return Math.max(1, Math.round(n));
  return Math.round(n / 5) * 5;
}

/** Без турника подтягивания заменяются австралийскими (ТЗ: только облегчённые варианты). */
function withBar(ex: ExerciseId, state: GameState): ExerciseId {
  return ex === 'pullup' && !state.character.hasBar ? 'pullup_australian' : ex;
}

/** Объём: медиана повторов за последние 7 дней × 0,8–1,2; без истории — стартовое значение. */
export function targetFor(state: GameState, ex: ExerciseId, day: string, rand: () => number): number {
  const base = BASE[state.character.fitness][ex] ?? 10;
  const history: number[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const reps = state.days[addDays(day, -i)]?.reps[ex];
    if (reps) history.push(reps);
  }
  const raw = history.length >= 2 ? median(history) * (0.8 + 0.4 * rand()) : base;
  const limit = EXERCISE_GAME[ex].dailyLimit;
  return roundNice(Math.min(Math.max(raw, base * 0.5), limit * 0.6));
}

/** Группы мышц, которые вчера получили больше 70% дневного лимита, сегодня отдыхают. */
export function tiredGroups(yesterday: DayStats | undefined): Set<MuscleGroup> {
  const tired = new Set<MuscleGroup>();
  if (!yesterday) return tired;
  for (const [ex, reps] of Object.entries(yesterday.reps) as Array<[ExerciseId, number]>) {
    const info = EXERCISE_GAME[ex];
    if (reps > info.dailyLimit * 0.7) tired.add(info.group);
  }
  return tired;
}

type Slot = 0 | 1 | 2;

function candidates(state: GameState, slot: Slot, day: string, rand: () => number, used: Set<MuscleGroup>, tired: Set<MuscleGroup>): DailyTask[] {
  const out: DailyTask[] = [];
  const ok = (g: MuscleGroup): boolean => !used.has(g) && !tired.has(g);

  if (slot === 0) {
    for (const base of STRENGTH) {
      const ex = withBar(base, state);
      const group = EXERCISE_GAME[ex].group;
      if (!ok(group)) continue;
      const isPull = group === 'back';
      out.push({ key: `reps:${ex}`, template: 'reps', exercise: ex, group, target: targetFor(state, ex, day, rand), reward: isPull ? REWARD.pullups : REWARD.reps, done: false });
    }
  } else if (slot === 1) {
    for (const ex of CARDIO) {
      if (!ok('cardio')) break;
      out.push({ key: `cardio:${ex}`, template: 'cardio', exercise: ex, group: 'cardio', target: targetFor(state, ex, day, rand), reward: REWARD.cardio, done: false });
    }
    out.push({ key: 'xp', template: 'xp', target: XP_TARGET[state.character.fitness], reward: REWARD.xp, done: false });
  } else {
    for (const base of STRENGTH) {
      const ex = withBar(base, state);
      const group = EXERCISE_GAME[ex].group;
      if (!ok(group)) continue;
      const target = Math.max(5, roundNice((BASE[state.character.fitness][ex] ?? 10) / 2));
      out.push({ key: `technique:${ex}`, template: 'technique', exercise: ex, group, target, minQuality: TECHNIQUE_QUALITY, reward: REWARD.technique, done: false });
    }
    out.push({ key: 'variety', template: 'variety', target: VARIETY_EXERCISES, reward: REWARD.variety, done: false });
  }
  return out;
}

function choose(list: DailyTask[], avoid: Set<string>, rand: () => number): DailyTask | undefined {
  const fresh = list.filter((t) => !avoid.has(t.key));
  return pick(rand, fresh.length > 0 ? fresh : list);
}

/** Три задания на день: без повторов вчерашних шаблонов и без одной группы мышц дважды. */
export function generateDailies(state: GameState, day: string, salt = ''): DailyTask[] {
  const rand = rng(`${state.character.id}:${day}${salt}`);
  const tired = tiredGroups(state.days[addDays(day, -1)]);
  const avoid = new Set(state.prevDailyKeys);
  const used = new Set<MuscleGroup>();
  const tasks: DailyTask[] = [];
  for (const slot of [0, 1, 2] as const) {
    let list = candidates(state, slot, day, rand, used, tired);
    // Если после отдыха групп выбрать нечего — отдых важнее, но задание нужно: снимаем ограничение «устали».
    if (list.length === 0) list = candidates(state, slot, day, rand, used, new Set());
    const task = choose(list, avoid, rand);
    if (!task) continue;
    tasks.push(task);
    if (task.group) used.add(task.group);
  }
  return tasks;
}

/** Замена одного невыполненного задания (1 раз в день). */
export function rerollTask(state: GameState, index: number): DailyTask | undefined {
  const d = state.dailies;
  const current = d?.tasks[index];
  if (!d || !current || current.done) return undefined;
  const slot = (current.template === 'reps' ? 0 : current.template === 'cardio' || current.template === 'xp' ? 1 : 2) as Slot;
  const rand = rng(`${state.character.id}:${d.day}:reroll`);
  const used = new Set<MuscleGroup>(d.tasks.filter((_, i) => i !== index).flatMap((t) => (t.group ? [t.group] : [])));
  const avoid = new Set([...state.prevDailyKeys, ...d.tasks.map((t) => t.key)]);
  const list = candidates(state, slot, d.day, rand, used, tiredGroups(state.days[addDays(d.day, -1)])).filter((t) => t.key !== current.key);
  return choose(list, avoid, rand);
}

/** Текущий прогресс задания по статистике дня. */
export function taskProgress(task: DailyTask, day: DayStats | undefined): number {
  if (!day) return 0;
  switch (task.template) {
    case 'reps':
    case 'cardio':
      return task.exercise ? (day.reps[task.exercise] ?? 0) : 0;
    case 'technique':
      return task.exercise ? (day.goodReps[task.exercise] ?? 0) : 0;
    case 'xp':
      return Math.floor(day.cameraXp);
    case 'variety':
      return Object.values(day.reps).filter((n) => (n ?? 0) >= VARIETY_REPS).length;
  }
}
