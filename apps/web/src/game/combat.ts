import type { ExerciseId } from '../tracking/exercise';
import { itemCombat } from './items';
import { levelOf } from './levels';
import type { GameState } from './state';
import type { Battle, BattleAction, BattleLine, MonsterId, Txt } from './storyTypes';

/**
 * Бои с монстрами: пошаговая схватка героя с монстром. Сила героя — из уровней
 * характеристик (тренировок) и экипировки. Главный приём — «мощный удар»: он
 * наносится, когда герой сделает несколько повторов упражнения в тренировке.
 */

export type MonsterSpecial = 'poison' | 'lifesteal' | 'regen' | 'enrage' | 'armor';

export interface MonsterDef {
  id: MonsterId;
  icon: string;
  name: Txt;
  /** Короткое описание для экрана боя. */
  lore: Txt;
  region: number;
  boss?: boolean;
  hp: number;
  atk: number;
  def: number;
  special?: MonsterSpecial;
  /** Шанс увернуться от удара героя. */
  evade?: number;
}

const t = (ru: string, en: string): Txt => ({ ru, en });

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  wolf: { id: 'wolf', icon: '🐺', region: 0, hp: 39, atk: 8, def: 1, evade: 0.08, name: t('Серый волк', 'Grey wolf'), lore: t('Голодный и быстрый — кусает и отскакивает.', 'Hungry and fast — bites and leaps away.') },
  giant_spider: { id: 'giant_spider', icon: '🕷️', region: 0, hp: 34, atk: 7, def: 1, special: 'poison', name: t('Гигантский паук', 'Giant spider'), lore: t('Укус ядовит: яд жжёт несколько ходов.', 'Its bite is venomous and burns for several turns.') },
  goblin: { id: 'goblin', icon: '👺', region: 0, hp: 44, atk: 9, def: 2, name: t('Лесной гоблин', 'Forest goblin'), lore: t('Мелкий, злобный и с ржавым ножом.', 'Small, vicious and armed with a rusty knife.') },
  bear: { id: 'bear', icon: '🐻', region: 0, boss: true, hp: 95, atk: 11, def: 3, special: 'enrage', name: t('Древний медведь', 'Ancient bear'), lore: t('Хранитель леса. Раненый — свирепеет.', 'Guardian of the forest. Grows furious when wounded.') },
  bandit: { id: 'bandit', icon: '🗡️', region: 1, hp: 68, atk: 13, def: 3, evade: 0.1, name: t('Горный разбойник', 'Mountain bandit'), lore: t('Ловкий головорез с перевала.', 'A nimble cutthroat from the pass.') },
  troll: { id: 'troll', icon: '🧌', region: 1, hp: 82, atk: 14, def: 4, special: 'regen', name: t('Пещерный тролль', 'Cave troll'), lore: t('Раны затягиваются на глазах — бейте сильно.', 'Wounds close before your eyes — hit hard.') },
  stone_giant: { id: 'stone_giant', icon: '🗿', region: 1, boss: true, hp: 150, atk: 15, def: 7, special: 'armor', name: t('Каменный великан', 'Stone giant'), lore: t('Обычные удары скользят по камню; мощный удар раскалывает.', 'Normal blows glance off the stone; a power strike splits it.') },
  bog_zombie: { id: 'bog_zombie', icon: '🧟', region: 2, hp: 91, atk: 16, def: 4, special: 'lifesteal', name: t('Болотный мертвец', 'Bog zombie'), lore: t('Пьёт силы живых, чтобы держаться на ногах.', 'Drains the living to stay on its feet.') },
  giant_toad: { id: 'giant_toad', icon: '🐸', region: 2, hp: 81, atk: 15, def: 3, special: 'poison', name: t('Гигантская жаба', 'Giant toad'), lore: t('Ядовитая слизь на языке.', 'Venomous slime on its tongue.') },
  slime: { id: 'slime', icon: '🟢', region: 2, hp: 75, atk: 14, def: 2, special: 'regen', name: t('Трясинная слизь', 'Mire slime'), lore: t('Студень, который снова собирается в целое.', 'A jelly that keeps pulling itself back together.') },
  witch: { id: 'witch', icon: '🧙', region: 2, boss: true, hp: 175, atk: 19, def: 5, special: 'lifesteal', name: t('Болотная ведьма', 'Marsh witch'), lore: t('Её чары крадут здоровье.', 'Her spells steal your health.') },
  scorpion: { id: 'scorpion', icon: '🦂', region: 3, hp: 114, atk: 21, def: 7, special: 'poison', name: t('Пустынный скорпион', 'Desert scorpion'), lore: t('Панцирь крепок, жало ядовито.', 'Hard shell, venomous sting.') },
  mummy: { id: 'mummy', icon: '🧻', region: 3, hp: 135, atk: 21, def: 5, special: 'lifesteal', name: t('Мумия', 'Mummy'), lore: t('Древнее проклятие в бинтах.', 'An ancient curse wrapped in linen.') },
  sand_serpent: { id: 'sand_serpent', icon: '🐍', region: 3, boss: true, hp: 235, atk: 23, def: 7, special: 'enrage', evade: 0.08, name: t('Песчаный змей', 'Sand serpent'), lore: t('Исполин дюн. Раненый — бьёт вдвое злее.', 'Giant of the dunes. Wounded, it strikes in fury.') },
  skeleton_knight: { id: 'skeleton_knight', icon: '💀', region: 4, hp: 159, atk: 26, def: 10, special: 'armor', name: t('Рыцарь-скелет', 'Skeleton knight'), lore: t('Латы держат обычные удары.', 'Its plate shrugs off ordinary blows.') },
  wraith: { id: 'wraith', icon: '👻', region: 4, hp: 135, atk: 29, def: 4, special: 'lifesteal', evade: 0.15, name: t('Призрак', 'Wraith'), lore: t('Бесплотен: удары часто проходят насквозь.', 'Incorporeal: blows often pass right through.') },
  dark_champion: { id: 'dark_champion', icon: '👑', region: 4, boss: true, hp: 330, atk: 29, def: 11, special: 'enrage', name: t('Тёмный чемпион', 'Dark Champion'), lore: t('Последний страж Цитадели.', 'The last guardian of the Citadel.') },
};

export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];

/** Обычные монстры региона (для засад и охоты). */
export const regionMonsters = (region: number): MonsterId[] => MONSTER_IDS.filter((id) => MONSTERS[id].region === region && !MONSTERS[id].boss);
/** Хранитель региона. */
export const regionBoss = (region: number): MonsterId => MONSTER_IDS.find((id) => MONSTERS[id].region === region && MONSTERS[id].boss) ?? 'dark_champion';

// ─── Герой ─────────────────────────────────────────────────────────────

export interface HeroCombat {
  maxHp: number;
  atk: number;
  def: number;
  crit: number;
  dodge: number;
  potions: number;
}

const POTION_OFFHANDS = new Set(['healing_flask', 'love_potion']);

/** Боевые качества героя: выносливость — здоровье, сила — атака, кор — крит, ноги — уворот; плюс экипировка и спутники. */
export function heroCombat(s: GameState): HeroCombat {
  const lv = (k: keyof GameState['statXp']): number => levelOf(s.statXp[k]);
  const gear = { atk: 0, def: 0, hp: 0 };
  for (const id of Object.values(s.equipped)) {
    if (!id) continue;
    const c = itemCombat(id);
    gear.atk += c.atk;
    gear.def += c.def;
    gear.hp += c.hp;
  }
  const comp = s.story.companions;
  return {
    maxHp: 40 + 6 * lv('endurance') + gear.hp + (comp.includes('golem') ? 12 : 0),
    atk: Math.round(6 + 1.5 * lv('strength')) + gear.atk + (comp.includes('wolf') ? 2 : 0),
    def: gear.def + (comp.includes('squire') ? 2 : 0),
    crit: Math.min(0.35, 0.05 + 0.02 * lv('core')),
    dodge: Math.min(0.3, 0.03 + 0.015 * lv('legs')),
    potions: 1 + (s.equipped.offhand && POTION_OFFHANDS.has(s.equipped.offhand) ? 1 : 0) + (comp.includes('fairy') ? 1 : 0),
  };
}

export function newBattle(s: GameState, monster: MonsterId, source: Battle['source']): Battle {
  const h = heroCombat(s);
  const m = MONSTERS[monster];
  return {
    monster,
    hp: m.hp,
    maxHp: m.hp,
    heroHp: h.maxHp,
    heroMax: h.maxHp,
    round: 0,
    potions: h.potions,
    poison: 0,
    stunned: false,
    charging: false,
    enraged: false,
    power: null,
    log: [],
    source,
    result: null,
  };
}

// ─── Ход боя ───────────────────────────────────────────────────────────

const LOG_SIZE = 8;
const POWER_FACTOR = 2.3;
const CRIT_FACTOR = 1.75;
const BLOCK_FACTOR = 0.35;
const HEAVY_FACTOR = 2.2;
const POTION_HEAL = 0.45;

/** Упражнения для мощного удара и базовое число повторов. */
const POWER_MOVES: ReadonlyArray<[ExerciseId, number]> = [
  ['squat', 8],
  ['pushup', 6],
  ['situp', 8],
  ['lunge', 8],
  ['jumping_jack', 20],
];

export function powerMove(round: number, roll: number): [ExerciseId, number] {
  return POWER_MOVES[Math.floor(roll * POWER_MOVES.length + round) % POWER_MOVES.length]!;
}

const spread = (r: () => number): number => 0.85 + r() * 0.3;

function push(b: Battle, line: BattleLine): void {
  b.log.push(line);
  if (b.log.length > LOG_SIZE) b.log.splice(0, b.log.length - LOG_SIZE);
}

/** Удар героя по монстру; power — мощный удар (сквозь броню). */
function heroStrike(b: Battle, h: HeroCombat, r: () => number, power: boolean): void {
  const m = MONSTERS[b.monster];
  if (!power && m.evade && r() < m.evade) {
    push(b, { who: 'hero', kind: 'miss' });
    return;
  }
  const crit = r() < h.crit;
  let dmg = h.atk * spread(r) * (power ? POWER_FACTOR : 1) * (crit ? CRIT_FACTOR : 1);
  if (!power) dmg -= m.def * 0.6;
  if (!power && m.special === 'armor') dmg *= 0.5;
  const n = Math.max(1, Math.round(dmg));
  b.hp = Math.max(0, b.hp - n);
  push(b, { who: 'hero', kind: power ? 'power' : crit ? 'crit' : 'hit', n });
  if (!power && m.special === 'armor') push(b, { who: 'monster', kind: 'armor' });
  if (b.hp === 0) b.result = 'won';
}

/** Ход монстра: яд, восстановление, ярость, подготовка и удар. */
function monsterTurn(b: Battle, h: HeroCombat, r: () => number, blocking: boolean): void {
  const m = MONSTERS[b.monster];
  if (b.poison > 0) {
    const n = 2 + m.region * 2;
    b.heroHp = Math.max(0, b.heroHp - n);
    b.poison -= 1;
    push(b, { who: 'hero', kind: 'poisoned', n });
    if (b.heroHp === 0) {
      b.result = 'lost';
      return;
    }
  }
  if (m.special === 'regen' && b.hp < b.maxHp) {
    const n = Math.min(b.maxHp - b.hp, Math.round(b.maxHp * 0.04));
    b.hp += n;
    push(b, { who: 'monster', kind: 'regen', n });
  }
  if (m.special === 'enrage' && !b.enraged && b.hp < b.maxHp * 0.4) {
    b.enraged = true;
    push(b, { who: 'monster', kind: 'enrage' });
  }
  if (b.stunned) {
    b.stunned = false;
    push(b, { who: 'monster', kind: 'stun' });
    return;
  }
  // Хранители раз в три хода готовят сокрушительный удар — время поднять щит.
  const heavy = b.charging;
  if (m.boss && !heavy && b.round % 3 === 2) {
    b.charging = true;
    push(b, { who: 'monster', kind: 'charge' });
    return;
  }
  b.charging = false;
  if (r() < h.dodge) {
    push(b, { who: 'hero', kind: 'dodge' });
    return;
  }
  const atk = m.atk * (b.enraged ? 1.4 : 1) * (heavy ? HEAVY_FACTOR : 1);
  let dmg = atk * spread(r) - h.def * 0.6;
  if (blocking) dmg *= BLOCK_FACTOR;
  const n = Math.max(1, Math.round(dmg));
  b.heroHp = Math.max(0, b.heroHp - n);
  push(b, { who: 'monster', kind: blocking ? 'blocked' : heavy ? 'heavy' : 'hit', n });
  if (m.special === 'lifesteal') {
    const heal = Math.min(b.maxHp - b.hp, Math.round(n * 0.5));
    if (heal > 0) {
      b.hp += heal;
      push(b, { who: 'monster', kind: 'drain', n: heal });
    }
  }
  if (m.special === 'poison' && !blocking && r() < 0.45) {
    b.poison = 3;
    push(b, { who: 'monster', kind: 'poison' });
  }
  if (b.heroHp === 0) b.result = 'lost';
}

export type BattleError = 'boss' | 'noPotion' | 'power' | 'over';

/**
 * Действие героя. Мощный удар только готовится (нужны повторы), остальные действия —
 * ход героя и ответ монстра. Возвращает ошибку, если действие невозможно.
 */
export function battleTurn(b: Battle, h: HeroCombat, action: BattleAction, r: () => number, region: number, fitness = 1): BattleError | null {
  if (b.result) return 'over';
  const m = MONSTERS[b.monster];
  if (action === 'power') {
    if (b.power) return 'power';
    const [exercise, reps] = powerMove(b.round, r());
    b.power = { exercise, target: Math.max(3, Math.round(reps * fitness * (1 + region * 0.1))), progress: 0 };
    return null;
  }
  if (action === 'potion' && b.potions <= 0) return 'noPotion';
  if (action === 'flee' && m.boss) return 'boss';
  // Любое другое действие отменяет подготовку мощного удара.
  b.power = null;
  b.round += 1;
  let blocking = false;
  switch (action) {
    case 'attack':
      heroStrike(b, h, r, false);
      break;
    case 'block':
      blocking = true;
      break;
    case 'potion': {
      b.potions -= 1;
      const n = Math.min(b.heroMax - b.heroHp, Math.round(b.heroMax * POTION_HEAL));
      b.heroHp += n;
      b.poison = 0;
      push(b, { who: 'hero', kind: 'heal', n });
      break;
    }
    case 'flee':
      if (r() < 0.45 + h.dodge) {
        push(b, { who: 'hero', kind: 'flee' });
        b.result = 'fled';
        return null;
      }
      push(b, { who: 'hero', kind: 'fleeFail' });
      break;
  }
  if (!b.result) monsterTurn(b, h, r, blocking);
  return null;
}

/** Мощный удар после повторов: урон сквозь броню, монстр оглушён и пропускает ответ. */
export function powerStrike(b: Battle, h: HeroCombat, r: () => number): void {
  if (b.result || !b.power) return;
  b.power = null;
  b.round += 1;
  heroStrike(b, h, r, true);
  if (!b.result) {
    b.stunned = true;
    monsterTurn(b, h, r, false);
  }
}
