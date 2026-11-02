import type { ExerciseId } from '../tracking/exercise';
import type { StatId } from './config';

/** Текст на двух языках (содержимое истории хранится рядом с логикой, а не в общем словаре). */
export interface Txt {
  ru: string;
  en: string;
}

export type Faction = 'forest' | 'guild' | 'order';
export const FACTIONS: readonly Faction[] = ['forest', 'guild', 'order'];

export type CompanionId = 'wolf' | 'squire' | 'fairy' | 'golem';

/** Последствия выбора. Золото и опыт масштабируются регионом. */
export interface Effect {
  resolve?: number;
  gold?: number;
  xp?: number;
  energy?: number;
  /** Сдвинуться по тропе на N шагов (короткий путь). */
  skip?: number;
  flag?: string[];
  unflag?: string[];
  rep?: Partial<Record<Faction, number>>;
  companion?: CompanionId;
  loseCompanion?: CompanionId;
  /** Найденный предмет из магазина (случайный, по редкости региона). */
  loot?: boolean;
  title?: string;
  /** Регион пройден (для финального испытания региона). */
  clear?: boolean;
  /** Путешествие завершено победой. */
  victory?: boolean;
}

export interface Outcome {
  text: Txt;
  effect: Effect;
}

export interface Requirement {
  flag?: string;
  notFlag?: string;
  gold?: number;
  companion?: CompanionId;
  anyCompanion?: boolean;
  minCompanions?: number;
  rep?: [Faction, number];
  /** Нужен предмет в инвентаре. */
  item?: string;
}

export interface Choice {
  id: string;
  label: Txt;
  requires?: Requirement;
  /** Цена выбора золотом (списывается сразу). */
  cost?: number;
  /** Проверка характеристики: сложность относительно уровня характеристики. */
  check?: { stat: StatId; diff: number };
  /** Физическое испытание: сделать повторы упражнения во время тренировки. */
  trial?: { exercise: ExerciseId; reps: number };
  /** Исход решает случай 50/50 (гадалка, грибы, огоньки). */
  gamble?: boolean;
  success: Outcome;
  fail?: Outcome;
}

export interface EventDef {
  id: string;
  icon: string;
  title: Txt;
  text: Txt;
  /** Регионы, где встречается событие; нет — в любом. */
  regions?: number[];
  boss?: boolean;
  /** Условия появления: флаги, спутники. */
  when?: Requirement;
  weight?: number;
  /** Не повторяется в одном путешествии. */
  once?: boolean;
  /** Подстановки: {npc} и т. п. — случайный вариант из списка. */
  vars?: Record<string, readonly Txt[]>;
  choices: Choice[];
}

export interface ActiveEvent {
  id: string;
  vars: Record<string, number>;
}

export interface Trial {
  event: string;
  choice: string;
  exercise: ExerciseId;
  target: number;
  progress: number;
}

export interface LogEntry {
  region: number;
  event: string;
  choice: string;
  ok: boolean;
  vars: Record<string, number>;
}

/** Что произошло после выбора — для экрана исхода. */
export interface OutcomeView extends LogEntry {
  /** Фактические изменения (после масштабирования). */
  effect: Effect;
  loot?: string;
}

export type StoryStatus = 'idle' | 'event' | 'trial' | 'outcome' | 'ended';

export interface StoryState {
  run: number;
  region: number;
  step: number;
  stepsTotal: number;
  resolve: number;
  maxResolve: number;
  energy: number;
  /** Опыт тренировок, накопленный к следующему шагу пути. */
  energyXp: number;
  energyDay: string;
  flags: string[];
  rep: Record<Faction, number>;
  companions: CompanionId[];
  seen: string[];
  status: StoryStatus;
  event: ActiveEvent | null;
  trial: Trial | null;
  last: OutcomeView | null;
  log: LogEntry[];
  /** Итог путешествия. */
  ending: 'victory' | 'defeat' | null;
  /** Пройдено регионов за всё время (лучший результат). */
  bestRegion: number;
  runsCompleted: number;
  regionsCleared: number;
  titles: string[];
  started: boolean;
}
