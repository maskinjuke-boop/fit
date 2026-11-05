/**
 * Предметы магазина: современная одежда, аксессуары, вещи «в руке» и сумки.
 * Покупаются за золото из квестов и ежедневок, надеваются в один из девяти слотов
 * и видны на 3D-модели героя.
 * Бонус — прибавка к опыту за повторы; суммарно не больше 25%,
 * чтобы экипировка помогала, но не заменяла тренировки.
 */
export type Slot = 'head' | 'neck' | 'body' | 'back' | 'hands' | 'legs' | 'feet' | 'weapon' | 'offhand';
/** Слоты экипировки в порядке показа: сверху вниз по фигуре, затем руки (weapon — «в руке», offhand — «сумка»). */
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
  { id: 'sports_cap', slot: 'head', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'bandana', slot: 'head', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'beanie', slot: 'head', price: 150, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'beret', slot: 'head', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'cat_ears', slot: 'head', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'sunglasses', slot: 'head', price: 390, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'bunny_ears', slot: 'head', price: 420, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'headphones', slot: 'head', price: 480, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'cowboy_hat', slot: 'head', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'devil_horns', slot: 'head', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'masquerade_mask', slot: 'head', price: 1070, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'lace_veil', slot: 'head', price: 1280, level: 7, xpBonus: 0.06, rarity: 'rare' },
  { id: 'angel_halo', slot: 'head', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'silver_tiara', slot: 'head', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Шея
  { id: 'gold_chain', slot: 'neck', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'lanyard_badge', slot: 'neck', price: 110, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'leather_choker', slot: 'neck', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'pearl_necklace', slot: 'neck', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'neck_headphones', slot: 'neck', price: 420, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'lace_choker', slot: 'neck', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'silk_scarf', slot: 'neck', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'spiked_collar', slot: 'neck', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'crystal_pendant', slot: 'neck', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'feather_boa', slot: 'neck', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'marathon_medal', slot: 'neck', price: 2250, level: 10, xpBonus: 0.09, rarity: 'epic' },
  { id: 'diamond_necklace', slot: 'neck', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Верх
  { id: 'basic_tee', slot: 'body', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'tank_top', slot: 'body', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'bandeau_top', slot: 'body', price: 130, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'string_bikini_top', slot: 'body', price: 160, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'crop_top', slot: 'body', price: 180, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'sports_bra', slot: 'body', price: 200, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'hoodie', slot: 'body', price: 250, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'lace_bralette', slot: 'body', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'denim_crop', slot: 'body', price: 320, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'button_shirt', slot: 'body', price: 350, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'mesh_top', slot: 'body', price: 380, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'halter_top', slot: 'body', price: 410, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'tracksuit', slot: 'body', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'leather_harness', slot: 'body', price: 470, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'open_vest', slot: 'body', price: 540, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'kimono', slot: 'body', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'swimsuit', slot: 'body', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'leather_corset', slot: 'body', price: 1010, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'chain_bikini', slot: 'body', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'velvet_bodysuit', slot: 'body', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'latex_corset', slot: 'body', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'latex_catsuit', slot: 'body', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  { id: 'gold_bikini', slot: 'body', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  { id: 'diamond_bikini', slot: 'body', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Спина
  { id: 'rolled_mat', slot: 'back', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'gym_backpack', slot: 'back', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'crossbody_bag', slot: 'back', price: 200, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'mini_backpack', slot: 'back', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'denim_jacket', slot: 'back', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'guitar_case', slot: 'back', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'fairy_wings', slot: 'back', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'leather_jacket', slot: 'back', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'bat_wings', slot: 'back', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'feather_wings', slot: 'back', price: 2700, level: 11, xpBonus: 0.09, rarity: 'epic' },
  { id: 'angel_wings', slot: 'back', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Руки
  { id: 'bead_bracelets', slot: 'hands', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'fingerless_gloves', slot: 'hands', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'fitness_tracker', slot: 'hands', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'boxing_wraps', slot: 'hands', price: 160, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'gold_bracelets', slot: 'hands', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'wrist_watch', slot: 'hands', price: 400, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'lace_gloves', slot: 'hands', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'silk_opera_gloves', slot: 'hands', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'latex_opera_gloves', slot: 'hands', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'studded_cuffs', slot: 'hands', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'diamond_bracelet', slot: 'hands', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  // Низ
  { id: 'bikini_bottom', slot: 'legs', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'gym_shorts', slot: 'legs', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'sweatpants', slot: 'legs', price: 130, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'jeans', slot: 'legs', price: 150, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'yoga_leggings', slot: 'legs', price: 160, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'denim_micro_shorts', slot: 'legs', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'mini_skirt', slot: 'legs', price: 300, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'ripped_jeans', slot: 'legs', price: 380, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'pleated_skirt', slot: 'legs', price: 440, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'fishnet_stockings', slot: 'legs', price: 520, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'cargo_pants', slot: 'legs', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'latex_leggings', slot: 'legs', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'pencil_skirt', slot: 'legs', price: 1010, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'lace_garters', slot: 'legs', price: 1100, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'silk_sarong', slot: 'legs', price: 1280, level: 7, xpBonus: 0.06, rarity: 'rare' },
  { id: 'hot_pants', slot: 'legs', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'leather_pants', slot: 'legs', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'sequin_skirt', slot: 'legs', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  // Обувь
  { id: 'house_slippers', slot: 'feet', price: 60, level: 1, xpBonus: 0, rarity: 'common' },
  { id: 'flip_flops', slot: 'feet', price: 80, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'sneakers', slot: 'feet', price: 120, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'running_shoes', slot: 'feet', price: 180, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'sandals', slot: 'feet', price: 220, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'anklets', slot: 'feet', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'platform_sneakers', slot: 'feet', price: 390, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'chelsea_boots', slot: 'feet', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'combat_boots', slot: 'feet', price: 540, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'knee_boots', slot: 'feet', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'high_heels', slot: 'feet', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'suede_thigh_boots', slot: 'feet', price: 1500, level: 8, xpBonus: 0.07, rarity: 'rare' },
  { id: 'latex_thigh_boots', slot: 'feet', price: 1800, level: 9, xpBonus: 0.08, rarity: 'epic' },
  { id: 'gold_sandals', slot: 'feet', price: 2250, level: 10, xpBonus: 0.08, rarity: 'epic' },
  { id: 'designer_heels', slot: 'feet', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // В руке
  { id: 'coffee_cup', slot: 'weapon', price: 80, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'water_bottle', slot: 'weapon', price: 90, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'phone', slot: 'weapon', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'dumbbell', slot: 'weapon', price: 120, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'shaker', slot: 'weapon', price: 160, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'umbrella', slot: 'weapon', price: 280, level: 2, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'tennis_racket', slot: 'weapon', price: 380, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'kettlebell', slot: 'weapon', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'flower_bouquet', slot: 'weapon', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'skateboard', slot: 'weapon', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'acoustic_guitar', slot: 'weapon', price: 1180, level: 6, xpBonus: 0.06, rarity: 'rare' },
  { id: 'microphone', slot: 'weapon', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'champagne_glass', slot: 'weapon', price: 1800, level: 8, xpBonus: 0.08, rarity: 'epic' },
  { id: 'gold_trophy', slot: 'weapon', price: 3500, level: 12, xpBonus: 0.1, rarity: 'legendary' },
  // Сумка
  { id: 'grocery_bag', slot: 'offhand', price: 60, level: 1, xpBonus: 0, rarity: 'common' },
  { id: 'tote_bag', slot: 'offhand', price: 100, level: 1, xpBonus: 0.01, rarity: 'common' },
  { id: 'yoga_mat', slot: 'offhand', price: 120, level: 1, xpBonus: 0.02, rarity: 'common' },
  { id: 'gym_bag', slot: 'offhand', price: 200, level: 2, xpBonus: 0.02, rarity: 'common' },
  { id: 'handbag', slot: 'offhand', price: 400, level: 3, xpBonus: 0.03, rarity: 'uncommon' },
  { id: 'briefcase', slot: 'offhand', price: 450, level: 3, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'clutch', slot: 'offhand', price: 600, level: 4, xpBonus: 0.04, rarity: 'uncommon' },
  { id: 'picnic_basket', slot: 'offhand', price: 850, level: 5, xpBonus: 0.05, rarity: 'rare' },
  { id: 'boutique_bags', slot: 'offhand', price: 1340, level: 7, xpBonus: 0.07, rarity: 'rare' },
  { id: 'designer_bag', slot: 'offhand', price: 2250, level: 10, xpBonus: 0.09, rarity: 'epic' },
];

export const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);

/**
 * Прежние id (средневековый каталог и ранние переименования) → современные предметы
 * с похожим смыслом. Предметы без соответствия (оружие, доспехи, щиты) в каталог не
 * переходят и при загрузке сохранения отбрасываются.
 */
export const RENAMED_ITEMS: Readonly<Record<string, string>> = {
  sport_set: 'sports_bra', fitness_set: 'tank_top', iron_dumbbell: 'dumbbell', aviator_goggles: 'sunglasses', yoga_shorts: 'gym_shorts', canvas_sneakers: 'sneakers',
  leather_cap: 'sports_cap', feathered_cap: 'sports_cap', ranger_hood: 'beanie', champion_crown: 'silver_tiara', gold_circlet: 'silver_tiara', jester_cap: 'cat_ears',
  hennin: 'bunny_ears', plague_mask: 'sunglasses', pilgrim_hat: 'cowboy_hat', ruby_amulet: 'diamond_necklace', leather_vest: 'open_vest', gambeson: 'hoodie',
  huntress_leathers: 'sports_bra', ranger_garb: 'basic_tee', mystic_robe: 'kimono', monk_habit: 'kimono', cloth_breastband: 'string_bikini_top',
  fur_bikini: 'string_bikini_top', leather_bandeau: 'bandeau_top', silk_crop_top: 'crop_top', linen_crop: 'denim_crop', mail_crop: 'mesh_top',
  leather_bodysuit: 'swimsuit', dancer_top: 'chain_bikini', velvet_corset: 'leather_corset', assassin_leathers: 'latex_catsuit', gold_bikini_armor: 'gold_bikini',
  silver_bikini_armor: 'gold_bikini', dragon_bikini: 'diamond_bikini', goddess_wrap: 'halter_top', traveler_cloak: 'denim_jacket', travel_satchel: 'gym_backpack',
  red_cape: 'denim_jacket', shadow_cloak: 'leather_jacket', dragon_wings: 'bat_wings', leather_gloves: 'fingerless_gloves', archer_gloves: 'fingerless_gloves',
  linen_wraps: 'boxing_wraps', leather_opera_gloves: 'latex_opera_gloves', spiked_bracers: 'studded_cuffs', short_braies: 'bikini_bottom',
  linen_shorts: 'denim_micro_shorts', squire_breeches: 'gym_shorts', riding_breeches: 'jeans', leather_shorts: 'hot_pants', velvet_shorts: 'hot_pants',
  leather_skirt: 'mini_skirt', pleated_kilt: 'pleated_skirt', silk_stockings: 'fishnet_stockings', harem_pants: 'sweatpants', leather_hose: 'latex_leggings',
  gold_armor_skirt: 'sequin_skirt', silk_slippers: 'house_slippers', leather_shoes: 'sneakers', lace_sandals: 'sandals', soldier_boots: 'combat_boots',
  fur_boots: 'knee_boots', poulaines: 'platform_sneakers', leather_thigh_boots: 'latex_thigh_boots', healing_flask: 'water_bottle', lute: 'acoustic_guitar',
  love_potion: 'champagne_glass',
};

/** Новый id предмета для старого сохранения (или тот же id, если он не менялся). */
export const renamedItem = (id: string): string => RENAMED_ITEMS[id] ?? id;

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8bec7',
  uncommon: '#3ddc84',
  rare: '#4da3ff',
  epic: '#b57bff',
  legendary: '#ffb020',
};
