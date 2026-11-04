/**
 * Предметы магазина. Покупаются за золото из квестов и ежедневок,
 * надеваются в один из девяти слотов и видны на портрете персонажа.
 * Бонус — прибавка к опыту за повторы; суммарно не больше 25%,
 * чтобы экипировка помогала, но не заменяла тренировки.
 */
export type Slot = 'head' | 'neck' | 'body' | 'back' | 'hands' | 'legs' | 'feet' | 'weapon' | 'offhand';
/** Слоты экипировки в порядке показа: сверху вниз по фигуре, затем руки. */
export const SLOTS: readonly Slot[] = ['head', 'neck', 'body', 'back', 'hands', 'legs', 'feet', 'weapon', 'offhand'];

/** Ячеек в рюкзаке (сумке): хватает на все предметы магазина. */
export const BAG_CAPACITY = 160;

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
  { id: 'feathered_cap', slot: 'head', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
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
  { id: 'gambeson', slot: 'body', price: 200, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'monk_habit', slot: 'body', price: 600, level: 4, xpBonus: 0.05, rarity: 'uncommon' },
  { id: 'scale_mail', slot: 'body', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'champion_armor', slot: 'body', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  { id: 'dragon_armor', slot: 'body', price: 5000, level: 15, xpBonus: 0.1, rarity: 'legendary' },
  { id: 'huntress_leathers', slot: 'body', price: 180, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'ranger_garb', slot: 'body', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'gladiator_armor', slot: 'body', price: 2400, level: 9, xpBonus: 0.09, rarity: 'epic' },
  // Оружие
  { id: 'wooden_club', slot: 'weapon', price: 120, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'mace', slot: 'weapon', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'bronze_sword', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'hunter_bow', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'oak_staff', slot: 'weapon', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'flail', slot: 'weapon', price: 100, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'spear', slot: 'weapon', price: 600, level: 4, xpBonus: 0.05, rarity: 'uncommon' },
  { id: 'battle_axe', slot: 'weapon', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'magic_wand', slot: 'weapon', price: 1300, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'steel_sword', slot: 'weapon', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  // Вторая рука
  { id: 'wooden_shield', slot: 'offhand', price: 150, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'war_horn', slot: 'offhand', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'spell_tome', slot: 'offhand', price: 400, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'healing_flask', slot: 'offhand', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'torch', slot: 'offhand', price: 350, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'iron_shield', slot: 'offhand', price: 900, level: 5, xpBonus: 0.06, rarity: 'rare' },
  { id: 'tower_shield', slot: 'offhand', price: 2200, level: 10, xpBonus: 0.09, rarity: 'epic' },
  { id: 'crystal_orb', slot: 'offhand', price: 2200, level: 10, xpBonus: 0.09, rarity: 'epic' },
  // ─── Новые предметы (100) ───
  // Голова
  { id: 'bandana', slot: 'head', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'beret', slot: 'head', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'jester_cap', slot: 'head', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'hennin', slot: 'head', price: 390, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'plague_mask', slot: 'head', price: 490, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'pilgrim_hat', slot: 'head', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'devil_horns', slot: 'head', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'masquerade_mask', slot: 'head', price: 1070, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'lace_veil', slot: 'head', price: 1280, level: 7, xpBonus: 0.06, rarity: 'rare' },
  { id: 'kettle_hat', slot: 'head', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'angel_halo', slot: 'head', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'gold_circlet', slot: 'head', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  // Шея
  { id: 'gold_chain', slot: 'neck', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'leather_choker', slot: 'neck', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'pearl_necklace', slot: 'neck', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'lace_choker', slot: 'neck', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'silk_scarf', slot: 'neck', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'spiked_collar', slot: 'neck', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'crystal_pendant', slot: 'neck', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'feather_boa', slot: 'neck', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'silver_torc', slot: 'neck', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  { id: 'ruby_amulet', slot: 'neck', price: 4350, level: 14, xpBonus: 0.1, rarity: 'legendary' },
  // Верх
  { id: 'cloth_breastband', slot: 'body', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'leather_bandeau', slot: 'body', price: 130, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'silk_crop_top', slot: 'body', price: 180, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'linen_crop', slot: 'body', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'lace_bralette', slot: 'body', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'mail_crop', slot: 'body', price: 340, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'halter_top', slot: 'body', price: 410, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'leather_harness', slot: 'body', price: 470, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'open_vest', slot: 'body', price: 540, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'fur_bikini', slot: 'body', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'leather_bodysuit', slot: 'body', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'leather_corset', slot: 'body', price: 1010, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'chain_bikini', slot: 'body', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'dancer_top', slot: 'body', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'velvet_corset', slot: 'body', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'assassin_leathers', slot: 'body', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'gold_bikini_armor', slot: 'body', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  { id: 'silver_bikini_armor', slot: 'body', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  { id: 'dragon_bikini', slot: 'body', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  { id: 'goddess_wrap', slot: 'body', price: 5200, level: 16, xpBonus: 0.1, rarity: 'legendary' },
  // Спина
  { id: 'travel_satchel', slot: 'back', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'red_cape', slot: 'back', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'quiver', slot: 'back', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'shadow_cloak', slot: 'back', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'fairy_wings', slot: 'back', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'bat_wings', slot: 'back', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'royal_mantle', slot: 'back', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'feather_wings', slot: 'back', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  { id: 'dragon_wings', slot: 'back', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  { id: 'angel_wings', slot: 'back', price: 5200, level: 16, xpBonus: 0.1, rarity: 'legendary' },
  // Руки
  { id: 'leather_gloves', slot: 'hands', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'linen_wraps', slot: 'hands', price: 160, level: 2, xpBonus: 0.01, rarity: 'common' },
  { id: 'archer_gloves', slot: 'hands', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'gold_bracelets', slot: 'hands', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'lace_gloves', slot: 'hands', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'fur_cuffs', slot: 'hands', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'silk_opera_gloves', slot: 'hands', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'leather_opera_gloves', slot: 'hands', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'spiked_bracers', slot: 'hands', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'steel_gauntlets', slot: 'hands', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  // Низ
  { id: 'short_braies', slot: 'legs', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'linen_shorts', slot: 'legs', price: 130, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'squire_breeches', slot: 'legs', price: 180, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'riding_breeches', slot: 'legs', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'leather_shorts', slot: 'legs', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'leather_skirt', slot: 'legs', price: 360, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'pleated_kilt', slot: 'legs', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'silk_stockings', slot: 'legs', price: 520, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'harem_pants', slot: 'legs', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'leather_hose', slot: 'legs', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'lace_garters', slot: 'legs', price: 1010, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'silk_sarong', slot: 'legs', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'velvet_shorts', slot: 'legs', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'loincloth', slot: 'legs', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'gold_armor_skirt', slot: 'legs', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'chain_loincloth', slot: 'legs', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  // Обувь
  { id: 'silk_slippers', slot: 'feet', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'leather_shoes', slot: 'feet', price: 160, level: 2, xpBonus: 0.01, rarity: 'common' },
  { id: 'lace_sandals', slot: 'feet', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'anklets', slot: 'feet', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'soldier_boots', slot: 'feet', price: 390, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'knee_boots', slot: 'feet', price: 490, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'fur_boots', slot: 'feet', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'poulaines', slot: 'feet', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'suede_thigh_boots', slot: 'feet', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'leather_thigh_boots', slot: 'feet', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'gold_sandals', slot: 'feet', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  { id: 'steel_sabatons', slot: 'feet', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  // Оружие
  { id: 'dagger', slot: 'weapon', price: 160, level: 2, xpBonus: 0.01, rarity: 'common' },
  { id: 'leather_whip', slot: 'weapon', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'longsword', slot: 'weapon', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'war_hammer', slot: 'weapon', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'trident', slot: 'weapon', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  { id: 'reaper_scythe', slot: 'weapon', price: 4350, level: 14, xpBonus: 0.1, rarity: 'legendary' },
  // Вторая рука
  { id: 'buckler', slot: 'offhand', price: 160, level: 2, xpBonus: 0.01, rarity: 'common' },
  { id: 'lute', slot: 'offhand', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'lantern', slot: 'offhand', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'love_potion', slot: 'offhand', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
];

export const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);

/** Прежние (современные) предметы, заменённые средневековыми: старые сохранения переходят на новые. */
export const RENAMED_ITEMS: Readonly<Record<string, string>> = {'sports_cap': 'feathered_cap', 'tracksuit': 'gambeson', 'sport_set': 'huntress_leathers', 'fitness_set': 'ranger_garb', 'kimono': 'monk_habit', 'jump_rope': 'flail', 'iron_dumbbell': 'mace', 'kettlebell': 'war_horn', 'shaker': 'healing_flask', 'cat_ears': 'jester_cap', 'bunny_ears': 'hennin', 'aviator_goggles': 'plague_mask', 'cowboy_hat': 'pilgrim_hat', 'top_hat': 'kettle_hat', 'string_bikini_top': 'cloth_breastband', 'denim_crop': 'linen_crop', 'mesh_top': 'mail_crop', 'swimsuit': 'leather_bodysuit', 'latex_corset': 'leather_corset', 'latex_catsuit': 'assassin_leathers', 'bikini_bottom': 'short_braies', 'denim_micro_shorts': 'linen_shorts', 'yoga_shorts': 'squire_breeches', 'ripped_jeans': 'riding_breeches', 'mini_skirt': 'leather_skirt', 'pleated_skirt': 'pleated_kilt', 'fishnet_stockings': 'silk_stockings', 'latex_leggings': 'leather_hose', 'hot_pants': 'velvet_shorts', 'canvas_sneakers': 'leather_shoes', 'combat_boots': 'soldier_boots', 'platform_sneakers': 'poulaines', 'latex_thigh_boots': 'leather_thigh_boots', 'boxing_wraps': 'linen_wraps', 'fingerless_gloves': 'archer_gloves', 'latex_opera_gloves': 'leather_opera_gloves', 'gym_backpack': 'travel_satchel', 'katana': 'longsword', 'war_fan': 'lute'};

export const renamedItem = (id: string): string => RENAMED_ITEMS[id] ?? id;

// ─── Боевые свойства ───────────────────────────────────────────────────

/** Боевые свойства предмета: атака, защита, запас здоровья. */
export interface CombatStats {
  atk: number;
  def: number;
  hp: number;
}

const TIER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const SHIELDS = new Set(['wooden_shield', 'iron_shield', 'tower_shield', 'buckler']);
const WEAPON_ATK = [3, 5, 8, 12, 16];
const SHIELD_DEF = [2, 3, 5, 7, 10];
const OFFHAND_ATK = [1, 2, 3, 5, 7];
const ARMOR_DEF = [1, 1, 2, 3, 4];
const TRINKET_HP = [5, 8, 12, 18, 25];

/** Боевые свойства выводятся из слота и редкости: оружие бьёт, щиты и броня защищают, украшения и плащи дают здоровье. */
export function itemCombat(id: string): CombatStats {
  const it = itemById(id);
  const out: CombatStats = { atk: 0, def: 0, hp: 0 };
  if (!it) return out;
  const r = TIER[it.rarity];
  switch (it.slot) {
    case 'weapon':
      out.atk = WEAPON_ATK[r]!;
      break;
    case 'offhand':
      if (SHIELDS.has(id)) out.def = SHIELD_DEF[r]!;
      else out.atk = OFFHAND_ATK[r]!;
      break;
    case 'neck':
    case 'back':
      out.hp = TRINKET_HP[r]!;
      break;
    case 'body':
      out.def = ARMOR_DEF[r]! * 2;
      break;
    default:
      out.def = ARMOR_DEF[r]!;
  }
  return out;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8bec7',
  uncommon: '#3ddc84',
  rare: '#4da3ff',
  epic: '#b57bff',
  legendary: '#ffb020',
};
