import type { ExerciseId } from '../tracking/exercise';
import type { Decor, Kit } from './homeDecor';
import type { StatId } from './config';

/** Текст на двух языках (содержимое игры хранится рядом с логикой, а не в общем словаре). */
export interface Txt {
  ru: string;
  en: string;
}

/** Две локации: своё котокафе и лавка демона. */
export type SceneId = 'cafe' | 'demon';

/** Предметы, у которых есть действия (в кафе и в лавке). */
export type ObjectId =
  // Кафе: всегда есть.
  | 'door'
  | 'counter'
  | 'sofa'
  // Столики для гостей (несколько одинаковых — по размеру кафе).
  | 'table'
  // Игровая зона для кошек (домик-когтеточка, столбик, тоннель, помпон).
  | 'play_zone'
  // Мебель, техника и декор из магазина.
  | 'bookshelf'
  | 'console'
  | 'piano'
  | 'aquarium'
  | 'easel'
  | 'armchair'
  | 'big_tv'
  | 'smart_speaker'
  // Пассивная техника и декор (без действий: уют — больше гостей).
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
  // Кошки (любая из кошек кафе рядом), их миски и лоток (появляются с первой кошкой).
  | 'cat'
  | 'cat_bowl'
  | 'litter'
  // Лавка демона.
  | 'demon'
  | 'cage'
  | 'demon_door';

/** Изменения от действия. */
export interface LifeEffect {
  money?: number;
  /** Корм в миске (порций, до полной миски). */
  bowl?: number;
  /** Вода в миске (0…100). */
  water?: number;
  /** Грязь в лотке (−100 — убрать начисто). */
  litter?: number;
  /** Кошке, которой это нужнее всех: игра и сытость. */
  catPlay?: number;
  catFed?: number;
  /** Всем кошкам — игра. */
  catsPlay?: number;
  /** Гости кафе: прибавка к числу гостей на сегодня (реклама, событие). */
  buzz?: number;
  /** Порции еды для гостей на витрине. */
  food?: number;
}

export interface ActionDef {
  id: string;
  icon: string;
  label: Txt;
  at: ObjectId;
  minutes: number;
  cost?: number;
  effect: LifeEffect;
  /** Спасти кошку дня: открыть упражнение демона перед камерой. */
  rescue?: boolean;
  /** Открыть свою тренировку перед камерой (заработать). */
  train?: boolean;
  /** Переход в другую локацию. */
  go?: SceneId;
  /** Открыть экран: кафе (мебель, расширение) или кошка дня. */
  open?: 'cafe' | 'demon';
}

/** Породы кошек. */
export type CatBreed = 'ginger' | 'black' | 'british' | 'siamese' | 'scottish_fold' | 'bengal' | 'persian' | 'maine_coon' | 'sphynx';

export interface Cat {
  id: string;
  breed: CatBreed;
  /** Индекс имени в списке. */
  name: number;
  /** Игровой день, когда кошка появилась в кафе. */
  adopted: number;
  /** Потребности кошки 0…100: сытость, игра и «туалет» (100 — только что сходила). */
  fed: number;
  play: number;
  toilet: number;
  /** Пол: кошка или кот. */
  sex: 'f' | 'm';
  /** Игровой день рождения: один игровой день — месяц жизни кошки. */
  born: number;
  /** Вторая порода у метиса (помесь). */
  mix?: CatBreed;
}

/**
 * Кошка дня в лавке демона: появляется каждый реальный день, её можно спасти до конца
 * этого дня — упражнением, которое назначил демон. Не спасли — кошка пропадает.
 */
export interface DemonOffer {
  /** Реальный день (YYYY-MM-DD), когда кошка появилась. */
  day: string;
  breed: CatBreed;
  mix?: CatBreed;
  sex: 'f' | 'm';
  name: number;
  /** Возраст в месяцах. */
  age: number;
  exercise: ExerciseId;
  target: number;
  progress: number;
  status: 'waiting' | 'saved' | 'lost';
}

/** Итог последнего действия — для всплывающей карточки. */
export interface LifeResult {
  icon: string;
  text: Txt;
  ok: boolean;
  money: number;
  minutes: number;
  guests?: number;
  notes: Txt[];
}

export interface ActiveEvent {
  id: string;
}

export interface LifeState {
  /** Игровой день (с 1) и минуты от полуночи. */
  day: number;
  minute: number;
  scene: SceneId;
  /** Купленная мебель, техника и декор для кафе. */
  furniture: ObjectId[];
  /** Кошки кафе. */
  cats: Cat[];
  /** Порций корма в кошачьей миске. */
  bowl: number;
  /** Вода в кошачьей миске 0…100. */
  water: number;
  /** Грязь в лотке 0…100. */
  litter: number;
  /** Ступень кафе 0…4 (0 — тесный котоуголок). */
  house: number;
  /** Отделка кафе: что выбрано в каждом разделе. */
  decor: Decor;
  /** Купленная отделка (её можно вернуть бесплатно). */
  finishes: string[];
  /** Базовая мебель: 0 — старьё, 1 — новая. */
  kit: Kit;
  /** Порции еды для гостей на витрине (гости заказывают и платят сверху входа). */
  food: number;
  /** Гости в кафе сейчас. */
  guests: number;
  /** Сегодняшняя прибавка к гостям (реклама, события), гаснет к новому дню. */
  buzz: number;
  /** Кошка дня в лавке демона. */
  demon: DemonOffer | null;
  event: ActiveEvent | null;
  last: LifeResult | null;
  stats: { visitors: number; earned: number; rescued: number; lost: number; repMoney: number; meals: number };
}

export type { ExerciseId, StatId };
