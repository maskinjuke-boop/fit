import type { ExerciseId } from '../../tracking/exercise';

/**
 * Город кошек. Игрок — бог: строит дома, мастерские, благоустройство и развлечения на деньги
 * за упражнения; кошки живут сами: работают, зарабатывают, тратят на себя, улучшают дома и
 * мастерские, отдыхают. Каждый день до полуночи — подношение богам (комплекс упражнений),
 * иначе часть домов сгорает вместе с жителями.
 */

export interface Txt {
  ru: string;
  en: string;
}

export type Profession = 'baker' | 'fisher' | 'tailor' | 'carpenter' | 'potter' | 'florist' | 'painter' | 'confectioner';

export type BuildingKind = 'temple' | 'house' | 'workshop' | 'amenity' | 'fun' | 'ash';

export type BuildingId =
  | 'temple'
  | 'house'
  | 'bakery'
  | 'fishery'
  | 'atelier'
  | 'carpentry'
  | 'pottery'
  | 'flowershop'
  | 'artstudio'
  | 'sweets'
  | 'garden'
  | 'flowerbed'
  | 'fountain'
  | 'lanterns'
  | 'statue'
  | 'playground'
  | 'cafe'
  | 'pond'
  | 'carousel'
  | 'cinema'
  | 'cattower'
  | 'market'
  | 'ash';

/** Вещи, которые кошки покупают себе на рынке (видны на модели). */
export type ItemId = 'bow' | 'bell' | 'scarf' | 'glasses' | 'backpack' | 'flower' | 'cape' | 'crown';

/** Окрас кошки. */
export type Coat = 'ginger' | 'grey' | 'tuxedo' | 'white' | 'calico' | 'siamese' | 'cream' | 'brown' | 'blue' | 'black';

/** Чем кошка занята. */
export type ActivityKind =
  | 'arrive'
  | 'sleep'
  | 'eat'
  | 'work'
  | 'fun'
  | 'shop'
  | 'stroll'
  | 'relax'
  | 'upgrade'
  | 'jobhunt'
  | 'pray';

/** Какое место здания занимает кошка. */
export type SpotUse = 'inside' | 'bed' | 'table' | 'porch' | 'hammer' | 'visit';

export interface Activity {
  kind: ActivityKind;
  /** Где (id здания); null — на улице. */
  at: number | null;
  /** До какого игрового времени (минуты от начала мира). */
  until: number;
  /** Идёт к месту (путь в точках) — занятие начнётся по приходу. */
  path?: Array<[number, number]>;
  /** Номер места в здании (см. spots.ts) и как: внутри, на крыльце, с молотком. */
  spot?: number;
  /** inside — старое «в доме» (как bed); bed — кровать, table — стол дома. */
  use?: SpotUse;
  /** Сколько длится само занятие (минуты) — отсчёт с прихода. */
  dur?: number;
}

export interface Needs {
  /** Сытость, бодрость, веселье, общение: 0…100. */
  food: number;
  energy: number;
  fun: number;
  social: number;
}

export interface CityCat {
  id: number;
  name: number;
  coat: Coat;
  sex: 'f' | 'm';
  /** Когда родилась (игровые минуты от начала мира, может быть отрицательным). */
  born: number;
  profession: Profession;
  /** Дом и мастерская (id зданий). */
  home: number | null;
  work: number | null;
  money: number;
  /** Сколько всего заработала. */
  earned: number;
  mood: number;
  needs: Needs;
  items: ItemId[];
  /** Где стоит (м) и куда смотрит. */
  x: number;
  z: number;
  heading: number;
  act: Activity;
  /** Грусть после пожара (игровые минуты до). */
  sadUntil?: number;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  type: BuildingId;
  /** Клетка (центр города — 0, 0). */
  gx: number;
  gz: number;
  level: number;
  /** Копилка мастерской на улучшение (вносят работники). */
  fund: number;
  /** Сколько кошек побывало (для развлечений) или сколько раз улучшали. */
  visits: number;
  /** Цвет стен (номер в палитре). */
  tint: number;
  /** Горит до этого реального времени (мс) — потом пепел. */
  fireUntil?: number;
  /** Кто жил в сгоревшем доме (для таблички). */
  ashOf?: number[];
}

export interface OfferingTask {
  exercise: ExerciseId;
  target: number;
  done: number;
}

export interface Offering {
  /** Реальный день (ключ YYYY-MM-DD). */
  day: string;
  tasks: OfferingTask[];
  complete: boolean;
}

export type CityNewsKind = 'arrive' | 'upgradeHome' | 'upgradeWork' | 'buy' | 'hired' | 'fire' | 'offering' | 'build' | 'town';

export interface CityNews {
  /** Игровое время. */
  t: number;
  kind: CityNewsKind;
  icon: string;
  text: Txt;
}

export interface CityState {
  /** Название поселения. */
  name: string;
  /** Игровое время: минуты от начала мира (1 реальная секунда = 1 игровая минута). */
  clock: number;
  /** Реальное время последнего шага симуляции (мс). */
  lastReal: number;
  buildings: Building[];
  cats: CityCat[];
  nextId: number;
  offering: Offering | null;
  /** День, с которого подношение обязательно (в первый день пожара нет). */
  graceDay: string;
  news: CityNews[];
  /** Погибшие в пожарах (имя, окрас, когда). */
  lost: Array<{ name: number; coat: Coat; day: string }>;
  stats: { arrived: number; burned: number; offerings: number; repMoney: number };
  /** Наивысшая ступень поселения (не уменьшается). */
  town: number;
  /** Когда приедет следующая кошка в пустой дом (игровое время; null — некуда). */
  arriveAt: number | null;
}
