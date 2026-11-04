import type { ExerciseId } from '../tracking/exercise';
import type { Archetype, FitnessLevel, MuscleGroup, StatId } from './config';
import { renamedItem, type Slot } from './items';
import { migrateStory, newStory } from './story';
import type { StoryState } from './storyTypes';

export type HairStyle = 'short' | 'long' | 'bun' | 'buzz' | 'curly' | 'ponytail' | 'bob';
export type Figure = 'male' | 'female';

/** Внешность персонажа. */
export interface Appearance {
  /** Телосложение: мужское или женское. */
  figure: Figure;
  /** Индекс в палитре оттенков кожи. */
  skin: number;
  hair: HairStyle;
  hairColor: number;
  beard: boolean;
  /** Индекс в палитре цветов глаз. */
  eyes: number;
  /** Настройки тела по группам: −1 … 1 (0 — как задумано для фигуры). */
  body?: Partial<Record<BodyPart, number>>;
  /** Настройки черт лица: −1 … 1. */
  face?: Partial<Record<FacePart, number>>;
}

/** Ползунки тела: общие (рост, вес, мышцы) и отдельные группы. */
export const BODY_PARTS = ['height', 'weight', 'muscle', 'shoulders', 'chest', 'arms', 'neck', 'waist', 'belly', 'hips', 'glutes', 'legs'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];
/** Ползунки лица. */
export const FACE_PARTS = ['faceWidth', 'cheekbones', 'jaw', 'chin', 'nose', 'lips', 'eyes', 'brows'] as const;
export type FacePart = (typeof FACE_PARTS)[number];

/** Значение ползунка в допустимых пределах (для старых и испорченных сохранений). */
export const sliderValue = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

export const DEFAULT_APPEARANCE: Appearance = { figure: 'male', skin: 1, hair: 'short', hairColor: 1, beard: false, eyes: 0 };

/** Смена телосложения с разумной подстройкой причёски и бороды. */
export function withFigure(a: Appearance, figure: Figure): Appearance {
  if (figure === a.figure) return a;
  if (figure === 'female') return { ...a, figure, beard: false, hair: a.hair === 'short' || a.hair === 'buzz' ? 'long' : a.hair };
  return { ...a, figure, hair: a.hair === 'ponytail' || a.hair === 'bob' ? 'short' : a.hair };
}

export interface Character {
  id: string;
  name: string;
  archetype: Archetype;
  color: string;
  /** Есть турник: без него подтягивания в квестах и ежедневках заменяются облегчёнными. */
  hasBar: boolean;
  fitness: FitnessLevel;
  createdDay: string;
  appearance: Appearance;
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
  /** Купленные предметы. */
  inventory: string[];
  equipped: Partial<Record<Slot, string>>;
  /** Состояние меняли через режим администратора (для будущих рейтингов). */
  adminTouched?: boolean;
  /** Режим истории. */
  story: StoryState;
  /** Открытые достижения: id → день открытия. */
  achievements: Record<string, string>;
  /** Выбранный титул под именем героя. */
  title?: string;
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
    inventory: [],
    equipped: {},
    story: newStory(),
    achievements: {},
  };
}

/** Приводит старое сохранение к текущей схеме (новые поля — значения по умолчанию). */
export function migrate(raw: GameState): GameState {
  const s = raw as GameState & Partial<Pick<GameState, 'inventory' | 'equipped' | 'story' | 'achievements'>>;
  return {
    ...s,
    character: { ...s.character, appearance: { ...DEFAULT_APPEARANCE, ...(s.character.appearance ?? {}) } },
    // Современные вещи заменены средневековыми — переводим старые id.
    inventory: [...new Set((s.inventory ?? []).map(renamedItem))],
    equipped: Object.fromEntries(Object.entries(s.equipped ?? {}).map(([slot, id]) => [slot, id ? renamedItem(id) : id])) as GameState['equipped'],
    story: migrateStory(s.story),
    achievements: s.achievements ?? {},
  };
}
