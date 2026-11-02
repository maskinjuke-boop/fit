/**
 * Предметы магазина. Покупаются за золото из квестов и ежедневок,
 * надеваются в один из четырёх слотов и видны на портрете персонажа.
 * Бонус — прибавка к опыту за повторы; суммарно не больше 25%,
 * чтобы экипировка помогала, но не заменяла тренировки.
 */
export type Slot = 'head' | 'body' | 'weapon' | 'offhand';
export const SLOTS: readonly Slot[] = ['head', 'body', 'weapon', 'offhand'];

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  id: string;
  slot: Slot;
  price: number;
  /** Минимальный уровень персонажа для покупки. */
  level: number;
  /** Прибавка к опыту за повтор, доля (0,04 = +4%). */
  xpBonus: number;
  rarity: Rarity;
}

export const MAX_EQUIPMENT_BONUS = 0.25;

export const ITEMS: readonly ItemDef[] = [
  // Голова
  { id: 'headband', slot: 'head', price: 80, level: 1, xpBonus: 0, rarity: 'common' },
  { id: 'leather_cap', slot: 'head', price: 150, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'ranger_hood', slot: 'head', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'wizard_hat', slot: 'head', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'iron_helm', slot: 'head', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'champion_crown', slot: 'head', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Тело
  { id: 'leather_vest', slot: 'body', price: 150, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'traveler_cloak', slot: 'body', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'chainmail', slot: 'body', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'mystic_robe', slot: 'body', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'plate_armor', slot: 'body', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'champion_armor', slot: 'body', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Оружие
  { id: 'wooden_club', slot: 'weapon', price: 120, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'iron_dumbbell', slot: 'weapon', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'bronze_sword', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'hunter_bow', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'oak_staff', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'steel_sword', slot: 'weapon', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  // Вторая рука
  { id: 'wooden_shield', slot: 'offhand', price: 150, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'kettlebell', slot: 'offhand', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'spell_tome', slot: 'offhand', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'iron_shield', slot: 'offhand', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
];

export const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8bec7',
  uncommon: '#3ddc84',
  rare: '#4da3ff',
  epic: '#b57bff',
  legendary: '#ffb020',
};
