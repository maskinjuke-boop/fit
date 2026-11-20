import type { ExerciseId } from '../tracking/exercise';
import { migrateCity, newCity } from './city/city';
import type { CityState } from './city/types';
import type { FitnessLevel } from './config';

/**
 * Сохранение игры: игрок — бог поселения кошек. Упражнения перед камерой приносят деньги
 * и закрывают ежедневное подношение богам; всё остальное — город (см. city/).
 */

export interface Character {
  id: string;
  /** Название поселения при создании. */
  name: string;
  /** Есть турник (подтягивания в списке упражнений). */
  hasBar: boolean;
  fitness: FitnessLevel;
  createdDay: string;
}

/** Статистика одного дня. */
export interface DayStats {
  reps: Partial<Record<ExerciseId, number>>;
  /** Повторы с качеством ≥ 80. */
  goodReps: Partial<Record<ExerciseId, number>>;
}

export interface GameState {
  version: 1;
  character: Character;
  /** Деньги бога (◈): за упражнения и подношения. */
  gold: number;
  /** Последние 30 дней. */
  days: Record<string, DayStats>;
  lifetimeReps: Partial<Record<ExerciseId, number>>;
  /** Текущий реальный день. */
  today: string;
  /** Город кошек. */
  city: CityState;
  /** Состояние меняли через режим администратора. */
  adminTouched?: boolean;
}

export const emptyDay = (): DayStats => ({ reps: {}, goodReps: {} });

export function createState(character: Character, now = Date.now()): GameState {
  return {
    version: 1,
    character,
    gold: 0,
    days: {},
    lifetimeReps: {},
    today: '',
    city: newCity(character.name || 'Мурлыкино', character.createdDay, now),
  };
}

/** Приводит старое сохранение к текущей схеме: старые миры (кафе, герой, квесты) уходят, деньги и повторы остаются. */
export function migrate(raw: GameState): GameState {
  const r = raw as GameState & Record<string, unknown>;
  const ch = (r.character ?? {}) as Partial<Character>;
  const character: Character = {
    id: typeof ch.id === 'string' ? ch.id : `c${Date.now()}`,
    name: typeof ch.name === 'string' && ch.name ? ch.name : 'Мурлыкино',
    hasBar: !!ch.hasBar,
    fitness: ch.fitness === 'intermediate' || ch.fitness === 'advanced' ? ch.fitness : 'beginner',
    createdDay: typeof ch.createdDay === 'string' ? ch.createdDay : '',
  };
  const days: GameState['days'] = {};
  for (const [k, v] of Object.entries(r.days ?? {})) days[k] = { reps: { ...(v?.reps ?? {}) }, goodReps: { ...(v?.goodReps ?? {}) } };
  const out: GameState = {
    version: 1,
    character,
    gold: typeof r.gold === 'number' && Number.isFinite(r.gold) ? Math.max(0, r.gold) : 0,
    days,
    lifetimeReps: { ...(r.lifetimeReps ?? {}) },
    today: typeof r.today === 'string' ? r.today : '',
    city: migrateCity(r.city, typeof r.today === 'string' && r.today ? r.today : character.createdDay),
  };
  if (r.adminTouched) out.adminTouched = true;
  return out;
}
