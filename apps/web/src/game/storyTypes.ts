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

/** Персонажи истории, с которыми герой встречается и выстраивает отношения. */
export type NpcId = 'lira' | 'bram' | 'sylvie' | 'cassian' | 'morwen' | 'zara' | 'valerian';
export const NPC_IDS: readonly NpcId[] = ['lira', 'bram', 'sylvie', 'cassian', 'morwen', 'zara', 'valerian'];
/** Границы отношения с персонажем. */
export const NPC_MIN = -5;
export const NPC_MAX = 10;

/** Монстры: обычные в каждом регионе и хранители регионов. */
export type MonsterId =
  | 'wolf'
  | 'giant_spider'
  | 'goblin'
  | 'bear'
  | 'bandit'
  | 'troll'
  | 'stone_giant'
  | 'bog_zombie'
  | 'giant_toad'
  | 'slime'
  | 'witch'
  | 'scorpion'
  | 'mummy'
  | 'sand_serpent'
  | 'skeleton_knight'
  | 'wraith'
  | 'dark_champion';

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
  /** Отношение персонажей к герою (знакомство — при первом изменении). */
  npc?: Partial<Record<NpcId, number>>;
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
  /** Персонаж знаком и относится к герою не хуже, чем на N. */
  npc?: [NpcId, number];
  /** Персонаж ещё не знаком. */
  notMet?: NpcId;
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
  /** Бой с монстром (true — с монстром события, см. EventDef.monsters). Победа — успех. */
  fight?: MonsterId | true;
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
  /** Персонаж, с которым идёт разговор (портрет и отношение на карточке события). */
  npc?: NpcId;
  /** Монстры события: один выбирается случайно и подставляется в {monster}. */
  monsters?: MonsterId[];
  /** Событие не продвигает по тропе (охота). */
  noStep?: boolean;
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
  /** Бой, которым закончилось событие. */
  monster?: MonsterId;
}

export type BattleAction = 'attack' | 'power' | 'block' | 'potion' | 'flee';

/** Строка журнала боя (текст — в словаре интерфейса). */
export interface BattleLine {
  who: 'hero' | 'monster';
  kind: 'hit' | 'crit' | 'power' | 'miss' | 'dodge' | 'blocked' | 'poison' | 'poisoned' | 'heal' | 'regen' | 'drain' | 'enrage' | 'charge' | 'heavy' | 'stun' | 'flee' | 'fleeFail' | 'armor';
  n?: number;
}

/** Идущий бой. Пока идёт «мощный удар», монстр ждёт: удар наносится после повторов в тренировке. */
export interface Battle {
  monster: MonsterId;
  hp: number;
  maxHp: number;
  heroHp: number;
  heroMax: number;
  round: number;
  potions: number;
  /** Ходов отравления героя. */
  poison: number;
  /** Монстр пропускает следующую атаку. */
  stunned: boolean;
  /** Хранитель готовит сокрушительный удар (на следующем ходу). */
  charging: boolean;
  enraged: boolean;
  power: { exercise: ExerciseId; target: number; progress: number } | null;
  log: BattleLine[];
  /** Событие, из которого начался бой; null — охота. */
  source: { event: string; choice: string } | null;
  result: 'won' | 'lost' | 'fled' | null;
}

export type StoryStatus = 'idle' | 'event' | 'trial' | 'battle' | 'outcome' | 'ended';

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
  /** Отношение знакомых персонажей к герою (сохраняется между путешествиями). */
  npcs: Partial<Record<NpcId, number>>;
  battle: Battle | null;
  /** Побеждённые монстры за всё время: id → число побед. */
  bestiary: Partial<Record<MonsterId, number>>;
}
