import type { ExerciseId } from '../tracking/exercise';
import type { StatId } from './config';

/** Текст на двух языках (содержимое игры хранится рядом с логикой, а не в общем словаре). */
export interface Txt {
  ru: string;
  en: string;
}

/** Потребности героя, 0…100. */
export type NeedId = 'food' | 'energy' | 'hygiene' | 'fun' | 'social';
export const NEEDS: readonly NeedId[] = ['food', 'energy', 'hygiene', 'fun', 'social'];

/** Навыки (опыт копится действиями; уровень 0…10). */
export type SkillId = 'cooking' | 'charisma' | 'logic' | 'creativity';
export const SKILLS: readonly SkillId[] = ['cooking', 'charisma', 'logic', 'creativity'];

export type SceneId = 'home' | 'city';

/** Места в городе (двери на улице). */
export type LocationId = 'home' | 'market' | 'cafe' | 'office' | 'gym' | 'park' | 'club' | 'mall' | 'furniture' | 'realty' | 'studio';

/** Предметы квартиры, у которых есть действия. */
export type ObjectId =
  | 'bed'
  | 'fridge'
  | 'stove'
  | 'shower'
  | 'sofa'
  | 'door'
  | 'mirror'
  | 'computer'
  | 'bookshelf'
  | 'yoga_mat'
  | 'dumbbells'
  | 'coffee_machine'
  | 'console'
  | 'piano'
  | 'bathtub'
  | 'aquarium'
  | 'easel';

export type JobId = 'barista' | 'office' | 'trainer' | 'model';
export type PersonId = 'alex' | 'mia' | 'dan' | 'sofia' | 'max' | 'eva' | 'rita';
export type HomeId = 'studio' | 'flat' | 'loft' | 'penthouse';

/** Изменения от действия (до масштабирования и ограничений). */
export interface LifeEffect {
  needs?: Partial<Record<NeedId, number>>;
  money?: number;
  skills?: Partial<Record<SkillId, number>>;
  groceries?: number;
  /** Сдвиг «лишнего веса»: −1 (сухой) … 1 (полный). */
  fat?: number;
  /** Отношение персонажа (того, с кем действие или событие). */
  aff?: number;
}

export interface Requirement {
  /** Часы, когда действие доступно: [с, до) по игровым часам, до может быть > 24. */
  hours?: [number, number];
  groceries?: number;
  money?: number;
  /** Нужен минимум потребности (например, энергия для смены). */
  need?: [NeedId, number];
  skill?: [SkillId, number];
}

export interface ActionDef {
  id: string;
  icon: string;
  label: Txt;
  /** Где доступно: предмет квартиры или место в городе. */
  at: { object: ObjectId } | { location: LocationId };
  minutes: number;
  cost?: number;
  effect: LifeEffect;
  requires?: Requirement;
  /** Сон: до утра (7:00) или не меньше minutes. */
  sleep?: boolean;
  /** Открыть настоящую тренировку перед камерой. */
  train?: boolean;
  /** Рабочая смена (работа с этим местом). */
  work?: boolean;
  /** Переход: выйти в город или домой. */
  go?: SceneId;
  /** Открыть экран: магазин одежды, мебель, недвижимость, вакансии. */
  open?: 'shop' | 'furniture' | 'realty' | 'jobs';
}

export interface Relation {
  /** Отношение −5…10. */
  aff: number;
  /** Игровой день знакомства. */
  met: number;
  /** Последний разговор (игровой день). */
  last: number;
  dates: number;
  partner?: boolean;
}

/** Итог последнего действия — для всплывающей карточки. */
export interface LifeResult {
  icon: string;
  text: Txt;
  ok: boolean;
  /** Фактические изменения. */
  needs: Partial<Record<NeedId, number>>;
  money: number;
  minutes: number;
  skills?: Partial<Record<SkillId, number>>;
  aff?: { person: PersonId; delta: number };
  /** Повышение на работе / новый навык / новый день и т. п. */
  notes: Txt[];
}

export interface JobState {
  id: JobId;
  level: number;
  /** Смен на текущей должности. */
  shifts: number;
  /** Рабочая репутация 0…100. */
  perf: number;
}

export interface ActiveEvent {
  id: string;
  /** Персонаж, о котором событие. */
  person?: PersonId;
}

export interface LifeState {
  /** Игровой день (с 1) и минуты от полуночи. */
  day: number;
  minute: number;
  needs: Record<NeedId, number>;
  scene: SceneId;
  /** Порции продуктов в холодильнике. */
  groceries: number;
  job: JobState | null;
  /** Опыт навыков. */
  skills: Record<SkillId, number>;
  home: HomeId;
  /** Купленная мебель. */
  furniture: ObjectId[];
  people: Partial<Record<PersonId, Relation>>;
  /** «Лишний вес»: −1…1 (тренировки уменьшают, переедание увеличивает). */
  fat: number;
  /** Аренда оплачена до этого игрового дня (не включая). */
  rentUntil: number;
  /** Долг по аренде. */
  debt: number;
  event: ActiveEvent | null;
  last: LifeResult | null;
  /** Счётчики для достижений. */
  stats: { shifts: number; dates: number; meals: number; promotions: number; workouts: number };
}

/** Действие с персонажем. */
export interface PersonActionDef {
  id: string;
  icon: string;
  label: Txt;
  minutes: number;
  cost?: number;
  /** Минимальное отношение. */
  minAff?: number;
  /** Только с партнёром / только не с партнёром. */
  partner?: boolean;
  /** Где можно (иначе — везде, где встретили). */
  where?: LocationId[];
  /** Проверка обаяния: шанс зависит от привлекательности, навыка и отношения. */
  check?: number;
  success: LifeEffect;
  fail?: LifeEffect;
  /** Начать отношения. */
  romance?: boolean;
  train?: boolean;
}

export type { ExerciseId, StatId };
