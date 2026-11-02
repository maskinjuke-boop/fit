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
  { id: 'sports_cap', slot: 'head', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'flower_wreath', slot: 'head', price: 250, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'horned_helm', slot: 'head', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'silver_tiara', slot: 'head', price: 2200, level: 10, xpBonus: 0.09, rarity: 'epic' },
  { id: 'champion_crown', slot: 'head', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Тело
  { id: 'leather_vest', slot: 'body', price: 150, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'traveler_cloak', slot: 'body', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'chainmail', slot: 'body', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'mystic_robe', slot: 'body', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'plate_armor', slot: 'body', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'tracksuit', slot: 'body', price: 200, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'kimono', slot: 'body', price: 600, level: 4, xpBonus: 0.05, rarity: 'uncommon' },
  { id: 'scale_mail', slot: 'body', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'champion_armor', slot: 'body', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  { id: 'dragon_armor', slot: 'body', price: 5000, level: 15, xpBonus: 0.1, rarity: 'legendary' },
  { id: 'sport_set', slot: 'body', price: 180, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'fitness_set', slot: 'body', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'gladiator_armor', slot: 'body', price: 2400, level: 9, xpBonus: 0.09, rarity: 'epic' },
  // Оружие
  { id: 'wooden_club', slot: 'weapon', price: 120, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'iron_dumbbell', slot: 'weapon', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'bronze_sword', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'hunter_bow', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'oak_staff', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'jump_rope', slot: 'weapon', price: 100, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'spear', slot: 'weapon', price: 600, level: 4, xpBonus: 0.05, rarity: 'uncommon' },
  { id: 'battle_axe', slot: 'weapon', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'magic_wand', slot: 'weapon', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'steel_sword', slot: 'weapon', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  // Вторая рука
  { id: 'wooden_shield', slot: 'offhand', price: 150, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'kettlebell', slot: 'offhand', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'spell_tome', slot: 'offhand', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'shaker', slot: 'offhand', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'torch', slot: 'offhand', price: 350, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'iron_shield', slot: 'offhand', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'tower_shield', slot: 'offhand', price: 2200, level: 10, xpBonus: 0.09, rarity: 'epic' },
  { id: 'crystal_orb', slot: 'offhand', price: 2200, level: 10, xpBonus: 0.09, rarity: 'epic' },
];

export const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8bec7',
  uncommon: '#3ddc84',
  rare: '#4da3ff',
  epic: '#b57bff',
  legendary: '#ffb020',
};
