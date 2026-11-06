import type { ExerciseId } from '../tracking/exercise';
import type { GymExtraId } from './lifeContent';
import type { StatId } from './config';
import type { Figure, HairStyle } from './state';

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

/** Две локации: свой дом и фитнес-зал. */
export type SceneId = 'home' | 'gym';

/** Предметы, у которых есть действия (в доме и в зале). */
export type ObjectId =
  // Дом.
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
  | 'easel'
  // Мебель и техника из магазина.
  | 'armchair'
  | 'massage_chair'
  | 'treadmill'
  | 'punching_bag'
  | 'big_tv'
  | 'smart_speaker'
  | 'blender'
  | 'microwave'
  | 'vr_headset'
  // Пассивная техника и декор (без действий: уют и меньше расход потребностей).
  | 'robot_vacuum'
  | 'air_conditioner'
  | 'painting'
  | 'wall_clock'
  | 'neon_sign'
  | 'photo_wall'
  | 'house_plant'
  | 'floor_lamp'
  | 'flower_vase'
  | 'palm'
  // Кошки (любая из своих кошек рядом), их миски и лоток (появляются с первой кошкой).
  | 'cat'
  | 'cat_bowl'
  | 'litter'
  // Зал.
  | 'coach'
  | 'reception'
  | 'gym_door'
  | 'gym_shower'
  | 'smoothie';

/** Изменения от действия (до ограничений). */
export interface LifeEffect {
  needs?: Partial<Record<NeedId, number>>;
  money?: number;
  skills?: Partial<Record<SkillId, number>>;
  groceries?: number;
  /** Сдвиг «лишнего веса» героя: −1 (сухой) … 1 (полный). */
  fat?: number;
  /** Лояльность всех учеников. */
  loyalty?: number;
  /** Новый ученик. */
  client?: boolean;
  /** Корм в миске (порций, до полной миски). */
  bowl?: number;
  /** Вода в миске (0…100). */
  water?: number;
  /** Грязь в лотке (−100 — убрать начисто). */
  litter?: number;
  /** Кошке, которой это нужнее всех: игра и сытость. */
  catPlay?: number;
  catFed?: number;
}

export interface Requirement {
  groceries?: number;
  money?: number;
  need?: [NeedId, number];
  skill?: [SkillId, number];
}

export interface ActionDef {
  id: string;
  icon: string;
  label: Txt;
  at: ObjectId;
  minutes: number;
  cost?: number;
  effect: LifeEffect;
  requires?: Requirement;
  /** Сон: до утра (7:00) или не меньше minutes. */
  sleep?: boolean;
  /** Открыть свою тренировку перед камерой. */
  train?: boolean;
  /** Переход в другую локацию. */
  go?: SceneId;
  /** Открыть экран: мебель, выбор занятия, зал. */
  open?: 'furniture' | 'session' | 'gym';
}

/** Породы кошек. */
export type CatBreed = 'ginger' | 'black' | 'british' | 'siamese' | 'scottish_fold' | 'bengal' | 'persian' | 'maine_coon' | 'sphynx';

export interface Cat {
  id: string;
  breed: CatBreed;
  /** Индекс имени в списке. */
  name: number;
  adopted: number;
  /** Потребности кошки 0…100: сытость, игра и «туалет» (100 — только что сходила). */
  fed: number;
  play: number;
  toilet: number;
}

/** Ученик: внешность из зерна, форма улучшается с занятиями. */
export interface Client {
  id: string;
  seed: number;
  figure: Figure;
  hair: HairStyle;
  skin: number;
  hairColor: number;
  /** Индекс имени в списке. */
  name: number;
  /** Полнота −0,4…1 и мышцы −0,6…0,8 (ползунки тела). */
  fat: number;
  muscle: number;
  sessions: number;
  /** Лояльность 0…100: при нуле ученик уходит. */
  loyalty: number;
  joined: number;
}

/** Идущее занятие: тренер выполняет упражнение на камеру, ученики повторяют. */
export interface Session {
  exercise: ExerciseId;
  target: number;
  progress: number;
  clients: string[];
}

/** Итог последнего действия — для всплывающей карточки. */
export interface LifeResult {
  icon: string;
  text: Txt;
  ok: boolean;
  needs: Partial<Record<NeedId, number>>;
  money: number;
  minutes: number;
  skills?: Partial<Record<SkillId, number>>;
  notes: Txt[];
}

export interface ActiveEvent {
  id: string;
}

export interface LifeState {
  /** Игровой день (с 1) и минуты от полуночи. */
  day: number;
  minute: number;
  needs: Record<NeedId, number>;
  scene: SceneId;
  /** Порции продуктов в холодильнике. */
  groceries: number;
  /** Опыт навыков. */
  skills: Record<SkillId, number>;
  /** Купленная мебель, техника и декор для дома. */
  furniture: ObjectId[];
  /** Свои кошки. */
  cats: Cat[];
  /** Порций корма в кошачьей миске. */
  bowl: number;
  /** Вода в кошачьей миске 0…100. */
  water: number;
  /** Грязь в лотке 0…100. */
  litter: number;
  /** «Лишний вес» героя: −1…1. */
  fat: number;
  /** Уровень зала 0…4. */
  gym: number;
  /** Купленные удобства зала. */
  gymExtras: GymExtraId[];
  /** Ступень жилья 0…3. */
  house: number;
  clients: Client[];
  /** Счётчик для id новых учеников. */
  nextClient: number;
  session: Session | null;
  event: ActiveEvent | null;
  last: LifeResult | null;
  /** Реальный день, за который уже выдано сообщение о выполненной норме. */
  quotaDay: string;
  /** Норма повторов на текущий реальный день. */
  quota: number;
  stats: { sessions: number; earned: number; meals: number; workouts: number; fines: number; graduated: number };
}

export type { ExerciseId, StatId };
