import type { ExerciseId } from '../tracking/exercise';
import type { Decor, Kit } from './homeDecor';
import type { StatId } from './config';

/** Текст на двух языках (содержимое игры хранится рядом с логикой, а не в общем словаре). */
export interface Txt {
  ru: string;
  en: string;
}

/** Две локации: дом кошек (id «cafe» — из прежних версий) и лавка демона. */
export type SceneId = 'cafe' | 'demon';

/** Предметы, у которых есть действия (в кафе и в лавке). */
export type ObjectId =
  // Кафе: всегда есть.
  | 'door'
  | 'sofa'
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
  | 'belt'
  | 'graves'
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
  /** Кошке, которой управляет игрок: сытость, игра, туалет, вода (до 100). */
  self?: { fed?: number; play?: number; toilet?: number; drink?: number };
  /** Отношения кошки игрока с выбранной кошкой (−100…100). */
  bond?: number;
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
  /** Открыть экран: дом (мебель, расширение), игровая зона или кошка дня. */
  open?: 'cafe' | 'play' | 'demon';
  /** Нужна игрушка в игровой зоне. */
  needItem?: PlayItemId;
  /** Нужна еда в миске. */
  needBowl?: boolean;
  /** Нужна другая кошка рядом (не та, которой управляет игрок). */
  needOther?: boolean;
  /** Завести котят: взрослые кот и кошка, дружат, в доме есть место. */
  needMate?: boolean;
}

/** Породы кошек. */
export type CatBreed =
  | 'ginger'
  | 'black'
  | 'british'
  | 'siamese'
  | 'scottish_fold'
  | 'bengal'
  | 'persian'
  | 'maine_coon'
  | 'sphynx'
  | 'ragdoll'
  | 'russian_blue'
  | 'abyssinian'
  | 'norwegian'
  | 'siberian'
  | 'devon_rex';

/** Кровь кошки: доли пород (в сумме 1). Чистокровная — одна порода целиком. */
export type Blood = Partial<Record<CatBreed, number>>;

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
  /** Напоенность 0…100 (0 — мучает жажда). */
  drink: number;
  /** Сколько игровых часов кошка без еды или без воды (с суток — умирает). */
  starve: number;
  /** Пол: кошка или кот. */
  sex: 'f' | 'm';
  /** Игровой день рождения: один игровой день — месяц жизни кошки. */
  born: number;
  /** Вторая порода у метиса (помесь) — для внешности. */
  mix?: CatBreed;
  /** Родословная: доли пород (breed — главная, mix — вторая по доле). */
  blood: Blood;
  /** Беременна: от кого, к какому игровому дню котята и их кровь. */
  pregnant?: { father: string; due: number };
  /** Родители (если родилась дома). */
  parents?: [string, string];
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
  /** Родословная (у метиса — две породы). */
  blood?: Blood;
  sex: 'f' | 'm';
  name: number;
  /** Возраст в месяцах. */
  age: number;
  exercise: ExerciseId;
  target: number;
  progress: number;
  status: 'waiting' | 'saved' | 'lost';
}

/** Куда игрок переставил предмет кафе: точка на полу и поворот (кратно 90°). */
export interface ItemSpot {
  x: number;
  z: number;
  rot: number;
}

/** Что стоит в игровой зоне для кошек. */
export type PlayItemId = 'tree' | 'post' | 'tunnel' | 'hammock' | 'boxes' | 'tower' | 'wheel' | 'track';

/** Игровая зона: размер (0…2), что в ней стоит, что куплено (можно вернуть бесплатно), цвет коврика. */
export interface PlayZoneState {
  size: number;
  items: PlayItemId[];
  owned: PlayItemId[];
  rug: string;
}

/** Могилка кошки, которую не успели спасти: кто это и в какой день упала в жерло. */
export interface Grave {
  name: number;
  breed: CatBreed;
  mix?: CatBreed;
  sex: 'f' | 'm';
  day: string;
  /** Отчего: упала в жерло (по умолчанию), умерла от голода или от жажды. */
  cause?: 'belt' | 'hunger' | 'thirst';
}

/** Итог последнего действия — для всплывающей карточки. */
export interface LifeResult {
  icon: string;
  text: Txt;
  ok: boolean;
  money: number;
  minutes: number;
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
  /** Купленная мебель, техника и декор для дома. */
  furniture: ObjectId[];
  /** Кошки дома. */
  cats: Cat[];
  /** Порций корма в кошачьей миске. */
  bowl: number;
  /** Вода в кошачьей миске 0…100. */
  water: number;
  /** Грязь в лотке 0…100. */
  litter: number;
  /** Ступень дома 0…4 (0 — комнатка). */
  house: number;
  /** Отделка дома: что выбрано в каждом разделе. */
  decor: Decor;
  /** Купленная отделка (её можно вернуть бесплатно). */
  finishes: string[];
  /** Базовая мебель: 0 — старьё, 1 — новая. */
  kit: Kit;
  /** Кошка, которой управляет игрок (id). */
  pet: string;
  /** Отношения между кошками: ключ «id1|id2» (по алфавиту) → −100 (враги) … 100 (не разлей вода). */
  bonds: Record<string, number>;
  /** Кошка дня в лавке демона. */
  demon: DemonOffer | null;
  /** Могилки кошек, которых не успели спасти или которые умерли от голода и жажды (последние). */
  graves: Grave[];
  /** Игровая зона для кошек. */
  play: PlayZoneState;
  /** Перестановка: куда игрок передвинул предметы кафе (ключ — Placed.key). */
  moved: Record<string, ItemSpot>;
  event: ActiveEvent | null;
  last: LifeResult | null;
  stats: { rescued: number; lost: number; repMoney: number; played: number; born?: number };
}

export type { ExerciseId, StatId };
