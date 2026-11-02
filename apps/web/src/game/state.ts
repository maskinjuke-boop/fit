import type { ExerciseId } from '../tracking/exercise';
import type { Archetype, FitnessLevel, MuscleGroup, StatId } from './config';

export interface Character {
  id: string;
  name: string;
  archetype: Archetype;
  color: string;
  /** Есть турник: без него подтягивания в квестах и ежедневках заменяются облегчёнными. */
  hasBar: boolean;
  fitness: FitnessLevel;
  createdDay: string;
}

/** Статистика одного дня. Прогресс ежедневок считается из неё. */
export interface DayStats {
  reps: Partial<Record<ExerciseId, number>>;
  /** Повторы с качеством ≥ 80 (для заданий на технику). */
  goodReps: Partial<Record<ExerciseId, number>>;
  cameraXp: number;
  dailiesDone: number;
}

export interface QuestState {
  id: string;
  status: 'active' | 'done';
  /** Прогресс по каждой цели квеста. */
  progress: number[];
  /** Неделя завершения — для еженедельных испытаний. */
  doneWeek?: string;
}

export type DailyTemplate = 'reps' | 'cardio' | 'xp' | 'technique' | 'variety';

export interface DailyTask {
  /** Уникальный ключ шаблона: 'reps:squat', 'xp', 'variety'. Не повторяется два дня подряд. */
  key: string;
  template: DailyTemplate;
  exercise?: ExerciseId;
  group?: MuscleGroup;
  target: number;
  minQuality?: number;
  reward: { xp: number; gold: number };
  done: boolean;
}

export interface DailyState {
  day: string;
  tasks: DailyTask[];
  rerollUsed: boolean;
  bonusClaimed: boolean;
}

export interface StreakState {
  count: number;
  best: number;
  /** Последний засчитанный день. */
  lastDay: string | null;
  freezes: number;
  /** Неделя, за которую уже выдана бесплатная заморозка. */
  freezeWeek: string | null;
}

export interface GameState {
  version: 1;
  character: Character;
  totalXp: number;
  statXp: Record<StatId, number>;
  gold: number;
  /** Последние 30 дней. */
  days: Record<string, DayStats>;
  quests: Record<string, QuestState>;
  dailies: DailyState | null;
  /** Ключи ежедневок вчерашнего дня (чтобы шаблон не повторялся). */
  prevDailyKeys: string[];
  streak: StreakState;
  lifetimeReps: Partial<Record<ExerciseId, number>>;
  /** Текущий игровой день. */
  today: string;
}

export const emptyDay = (): DayStats => ({ reps: {}, goodReps: {}, cameraXp: 0, dailiesDone: 0 });

export function createState(character: Character): GameState {
  return {
    version: 1,
    character,
    totalXp: 0,
    statXp: { strength: 0, legs: 0, core: 0, endurance: 0 },
    gold: 0,
    days: {},
    quests: {},
    dailies: null,
    prevDailyKeys: [],
    streak: { count: 0, best: 0, lastDay: null, freezes: 0, freezeWeek: null },
    lifetimeReps: {},
    today: '',
  };
}
