import type { ExerciseId } from '../tracking/exercise';

/**
 * Игровые константы из ТЗ (раздел 4). Все числа баланса — в этом файле.
 */

/** Характеристики персонажа — по группам мышц (ТЗ: лимиты и восстановление по группам). */
export type StatId = 'strength' | 'legs' | 'core' | 'endurance';
export const STATS: readonly StatId[] = ['strength', 'legs', 'core', 'endurance'];

export type MuscleGroup = 'back' | 'chest' | 'legs' | 'core' | 'cardio';

export interface ExerciseGameInfo {
  /** Множитель XP и урона (ТЗ, раздел 4). Для кардио — за одно движение (0,5 за 10 → 0,05). */
  multiplier: number;
  stat: StatId;
  group: MuscleGroup;
  /** Дневной лимит повторов (ТЗ: «Защита от перетренированности»). */
  dailyLimit: number;
  /** Лимит считается вместе с другими упражнениями (подтягивания и облегчённые). */
  limitGroup: string;
}

export const EXERCISE_GAME: Record<ExerciseId, ExerciseGameInfo> = {
  pullup: { multiplier: 3, stat: 'strength', group: 'back', dailyLimit: 50, limitGroup: 'pullups' },
  pullup_negative: { multiplier: 1.5, stat: 'strength', group: 'back', dailyLimit: 50, limitGroup: 'pullups' },
  pullup_australian: { multiplier: 1.5, stat: 'strength', group: 'back', dailyLimit: 50, limitGroup: 'pullups' },
  pushup: { multiplier: 2, stat: 'strength', group: 'chest', dailyLimit: 150, limitGroup: 'pushup' },
  squat: { multiplier: 1.2, stat: 'legs', group: 'legs', dailyLimit: 200, limitGroup: 'squat' },
  lunge: { multiplier: 1.5, stat: 'legs', group: 'legs', dailyLimit: 150, limitGroup: 'lunge' },
  situp: { multiplier: 1.2, stat: 'core', group: 'core', dailyLimit: 200, limitGroup: 'situp' },
  jumping_jack: { multiplier: 0.05, stat: 'endurance', group: 'cardio', dailyLimit: 1000, limitGroup: 'cardio' },
  high_knees: { multiplier: 0.05, stat: 'endurance', group: 'cardio', dailyLimit: 1000, limitGroup: 'cardio' },
};

/** Базовый XP за повтор: XP = 10 × множитель × бонус качества. */
export const XP_PER_REP = 10;
/** Сверх дневного лимита XP за упражнение падает вдвое. */
export const OVER_LIMIT_FACTOR = 0.5;
/** Первые 14 дней лимиты новичка снижены на 30%. */
export const NEWBIE_DAYS = 14;
export const NEWBIE_LIMIT_FACTOR = 0.7;

/** Бонус качества: оценка 0–100 → множитель 0,8–1,2. */
export const qualityBonus = (quality: number): number => 0.8 + (0.4 * Math.min(100, Math.max(0, quality))) / 100;

/** Уровни 1–99: суммарный опыт для уровня L = floor(40 × (L − 1)^2.2). */
export const MAX_LEVEL = 99;

/** Стрик: день засчитан при одной выполненной ежедневке или 100 XP с камеры. */
export const STREAK_MIN_CAMERA_XP = 100;
/** +5% золота за каждые 7 дней стрика, максимум +25%. */
export const streakGoldBonus = (streak: number): number => Math.min(0.25, Math.floor(streak / 7) * 0.05);
export const MAX_FREEZES = 2;

/** Награда за все три ежедневки. */
export const DAILY_BONUS = { xp: 200, gold: 100 };

/** Сколько квестов может быть активно одновременно. */
export const MAX_ACTIVE_QUESTS = 5;

export type Archetype = 'guardian' | 'ranger' | 'mystic';
export const ARCHETYPES: readonly Archetype[] = ['guardian', 'ranger', 'mystic'];
export const COLORS = ['#ffb020', '#3ddc84', '#4da3ff', '#ff5a5f', '#b57bff', '#ff8ad8'] as const;

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
