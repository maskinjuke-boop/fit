import type { Txt } from './lifeTypes';

/**
 * Ремонт дома: отделка (обои, пол, панели, шторы, ковёр, свет) и базовая мебель
 * (кровать, диван, кухня, душ). Игра начинается в убитой квартире: облезлые обои,
 * старый линолеум, голая лампочка, продавленный диван. Отделку можно купить и
 * менять — купленная остаётся в запасе, вернуть её можно бесплатно.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

export type DecorKind = 'wall' | 'floor' | 'trim' | 'curtains' | 'rug' | 'light' | 'kitchen' | 'window' | 'door';
export const DECOR_KINDS: readonly DecorKind[] = ['wall', 'floor', 'trim', 'kitchen', 'window', 'curtains', 'door', 'rug', 'light'];

export const DECOR_KIND_NAME: Record<DecorKind, Txt> = {
  wall: t('Стены', 'Walls'),
  floor: t('Пол', 'Floor'),
  trim: t('Панели и плинтус', 'Panels & skirting'),
  curtains: t('Шторы', 'Curtains'),
  rug: t('Ковёр', 'Rug'),
  light: t('Свет', 'Lighting'),
  kitchen: t('Кухня: плитка и фартук', 'Kitchen tiles & backsplash'),
  window: t('Окна', 'Windows'),
  door: t('Входная дверь', 'Front door'),
};

export const DECOR_KIND_ICON: Record<DecorKind, string> = { wall: '🧱', floor: '🪵', trim: '📏', curtains: '🎀', rug: '🟫', light: '💡', kitchen: '🍽️', window: '🪟', door: '🚪' };

/** Как выглядит отделка: рисунок и цвета (рисует 3D-сцена и образцы в магазине). */
export interface FinishLook {
  style: string;
  color: string;
  accent?: string;
}

export interface FinishDef {
  id: string;
  kind: DecorKind;
  name: Txt;
  price: number;
  /** Уют (у старой отделки — отрицательный). */
  comfort: number;
  /** С какого уровня тренера продаётся. */
  level?: number;
  /** Старьё из стартовой квартиры: при переезде заменяется простой новой отделкой. */
  old?: boolean;
  look: FinishLook;
}

const f = (id: string, kind: DecorKind, name: Txt, price: number, comfort: number, look: FinishLook, extra: Partial<FinishDef> = {}): FinishDef => ({ id, kind, name, price, comfort, look, ...extra });

export const FINISHES: readonly FinishDef[] = [
  // Стены.
  f('wall_peeling', 'wall', t('Облезлые обои', 'Peeling wallpaper'), 0, -1, { style: 'peeling', color: '#cdbf95', accent: '#9c8d66' }, { old: true }),
  f('wall_plaster', 'wall', t('Светлая штукатурка', 'Light plaster'), 80, 1, { style: 'plaster', color: '#ece4d6' }),
  f('wall_mint', 'wall', t('Мятная краска', 'Mint paint'), 120, 1, { style: 'plaster', color: '#cfe3d6' }),
  f('wall_peach', 'wall', t('Персиковая краска', 'Peach paint'), 120, 1, { style: 'plaster', color: '#f2d6c2' }),
  f('wall_stripes', 'wall', t('Обои в полоску', 'Striped wallpaper'), 180, 2, { style: 'stripes', color: '#efe4d0', accent: '#d8c09a' }),
  f('wall_floral', 'wall', t('Обои с цветами', 'Floral wallpaper'), 220, 2, { style: 'floral', color: '#f3ece2', accent: '#c98a8a' }),
  f('wall_navy', 'wall', t('Глубокий синий', 'Deep navy'), 350, 2, { style: 'plaster', color: '#3b4f6e' }, { level: 3 }),
  f('wall_brick', 'wall', t('Кирпич-лофт', 'Loft brick'), 400, 3, { style: 'brick', color: '#a65a3e', accent: '#d9cfc2' }, { level: 3 }),
  f('wall_wood', 'wall', t('Деревянные панели', 'Wood panelling'), 550, 3, { style: 'boards', color: '#9a6a42' }, { level: 5 }),
  f('wall_marble', 'wall', t('Декоративная штукатурка', 'Venetian plaster'), 900, 4, { style: 'marble', color: '#ece9e3', accent: '#b9b2a6' }, { level: 8 }),
  // Пол.
  f('floor_linoleum', 'floor', t('Старый линолеум', 'Worn linoleum'), 0, -1, { style: 'linoleum', color: '#8a6d4a', accent: '#5e4630' }, { old: true }),
  f('floor_laminate', 'floor', t('Светлый ламинат', 'Light laminate'), 150, 1, { style: 'planks', color: '#d2b48a' }),
  f('floor_parquet', 'floor', t('Паркет', 'Parquet'), 300, 2, { style: 'parquet', color: '#b0805a' }),
  f('floor_dark', 'floor', t('Тёмный дуб', 'Dark oak'), 450, 2, { style: 'planks', color: '#6b4a32' }, { level: 3 }),
  f('floor_tile', 'floor', t('Плитка-шахматка', 'Chequered tiles'), 350, 2, { style: 'checker', color: '#efece6', accent: '#3d4148' }, { level: 2 }),
  f('floor_herring', 'floor', t('Паркет-ёлочка', 'Herringbone'), 650, 3, { style: 'herring', color: '#b98a5c' }, { level: 4 }),
  f('floor_concrete', 'floor', t('Полированный бетон', 'Polished concrete'), 500, 2, { style: 'concrete', color: '#a9a7a2' }, { level: 5 }),
  f('floor_marble', 'floor', t('Мрамор', 'Marble'), 1200, 4, { style: 'marble', color: '#f1eee9', accent: '#a9a39a' }, { level: 9 }),
  // Панели и плинтус.
  f('trim_old', 'trim', t('Обшарпанный плинтус', 'Scuffed skirting'), 0, 0, { style: 'old', color: '#6f5638' }, { old: true }),
  f('trim_white', 'trim', t('Белый плинтус', 'White skirting'), 40, 0, { style: 'base', color: '#f7f5f0' }),
  f('trim_beige', 'trim', t('Бежевые панели', 'Beige panels'), 160, 1, { style: 'panels', color: '#d8cbb6' }),
  f('trim_wood', 'trim', t('Деревянные панели', 'Wooden panels'), 260, 2, { style: 'panels', color: '#9c6b43' }, { level: 2 }),
  f('trim_sage', 'trim', t('Шалфейные панели', 'Sage panels'), 260, 2, { style: 'panels', color: '#7f9a86' }, { level: 2 }),
  f('trim_molding', 'trim', t('Белые панели с молдингом', 'White moulded panels'), 380, 2, { style: 'molding', color: '#f4f2ec' }, { level: 4 }),
  // Шторы.
  f('curt_old', 'curtains', t('Выцветшие шторы', 'Faded curtains'), 0, 0, { style: 'old', color: '#cdbb8a' }, { old: true }),
  f('curt_linen', 'curtains', t('Льняные шторы', 'Linen curtains'), 60, 1, { style: 'drape', color: '#e9dcc7' }),
  f('curt_blue', 'curtains', t('Синие шторы', 'Blue curtains'), 90, 1, { style: 'drape', color: '#4a6fa5' }),
  f('curt_terra', 'curtains', t('Терракотовые шторы', 'Terracotta curtains'), 90, 1, { style: 'drape', color: '#c0643e' }),
  f('curt_blinds', 'curtains', t('Жалюзи', 'Blinds'), 150, 1, { style: 'blinds', color: '#f2f2f0' }),
  f('curt_velvet', 'curtains', t('Изумрудный бархат', 'Emerald velvet'), 300, 2, { style: 'drape', color: '#1f5c4a', accent: '#d4af37' }, { level: 4 }),
  // Ковёр.
  f('rug_old', 'rug', t('Протёртый половик', 'Threadbare mat'), 0, 0, { style: 'old', color: '#7a6250', accent: '#5c4a3c' }, { old: true }),
  f('rug_none', 'rug', t('Без ковра', 'No rug'), 0, 0, { style: 'none', color: '#000000' }),
  f('rug_red', 'rug', t('Красный овальный', 'Red oval rug'), 120, 1, { style: 'oval', color: '#a24b45', accent: '#e3c7a0' }),
  f('rug_grey', 'rug', t('Серый круглый', 'Grey round rug'), 140, 1, { style: 'round', color: '#8d9196', accent: '#c9ccd0' }),
  f('rug_stripes', 'rug', t('Полосатый', 'Striped rug'), 180, 1, { style: 'stripes', color: '#e8dfcf', accent: '#3f5f7a' }),
  f('rug_fluffy', 'rug', t('Пушистый белый', 'Fluffy white rug'), 320, 2, { style: 'fluffy', color: '#f4f1ea' }, { level: 3 }),
  f('rug_persian', 'rug', t('Персидский ковёр', 'Persian rug'), 700, 3, { style: 'persian', color: '#7d1f24', accent: '#d9b46a' }, { level: 6 }),
  // Свет.
  f('light_bulb', 'light', t('Голая лампочка', 'Bare bulb'), 0, 0, { style: 'bulb', color: '#ffc77a' }, { old: true }),
  f('light_warm', 'light', t('Тёплые плафоны', 'Warm ceiling lights'), 150, 1, { style: 'warm', color: '#ffd9a0' }),
  f('light_day', 'light', t('Дневной свет', 'Daylight lamps'), 200, 1, { style: 'warm', color: '#f2f6ff' }),
  f('light_led', 'light', t('Светодиодная подсветка', 'LED cove lighting'), 450, 2, { style: 'led', color: '#ffe2b8', accent: '#8a6cff' }, { level: 3 }),
  f('light_chandelier', 'light', t('Люстра', 'Chandelier'), 600, 2, { style: 'chandelier', color: '#ffe0ae', accent: '#d4af37' }, { level: 4 }),
  // Кухня: плитка на полу кухонной зоны и фартук над плитой.
  f('ktile_old', 'kitchen', t('Битая советская плитка', 'Cracked old tiles'), 0, -1, { style: 'old', color: '#cbc2aa', accent: '#8f8676' }, { old: true }),
  f('ktile_blue', 'kitchen', t('Голубая плитка', 'Pale blue tiles'), 100, 1, { style: 'square', color: '#a7c7d9', accent: '#e9eef1' }),
  f('ktile_subway', 'kitchen', t('Белый «кабанчик»', 'White subway tiles'), 140, 1, { style: 'subway', color: '#f4f2ee', accent: '#c4beb3' }),
  f('ktile_green', 'kitchen', t('Зелёный «кабанчик»', 'Green subway tiles'), 180, 1, { style: 'subway', color: '#6f9c84', accent: '#e8eee9' }, { level: 2 }),
  f('ktile_terra', 'kitchen', t('Терракота', 'Terracotta'), 220, 1, { style: 'square', color: '#c2734f', accent: '#ead8c6' }, { level: 2 }),
  f('ktile_mosaic', 'kitchen', t('Морская мозаика', 'Sea-glass mosaic'), 320, 2, { style: 'mosaic', color: '#2f7f8a', accent: '#bfe3e6' }, { level: 3 }),
  f('ktile_marble', 'kitchen', t('Мраморный фартук', 'Marble backsplash'), 650, 2, { style: 'marble', color: '#f1eee9', accent: '#a9a39a' }, { level: 6 }),
  // Окна: рамы и подоконник.
  f('win_old', 'window', t('Облезлые рамы', 'Peeling frames'), 0, -1, { style: 'old', color: '#d8d0bc' }, { old: true }),
  f('win_pvc', 'window', t('Белые пластиковые', 'White PVC'), 150, 1, { style: 'pvc', color: '#ffffff' }),
  f('win_wood', 'window', t('Деревянные рамы', 'Wooden frames'), 260, 1, { style: 'wood', color: '#8a5a36' }, { level: 2 }),
  f('win_loft', 'window', t('Чёрные лофт-рамы', 'Black loft frames'), 380, 2, { style: 'loft', color: '#22252a' }, { level: 3 }),
  f('win_garden', 'window', t('Широкий подоконник с цветами', 'Deep sill with plants'), 520, 2, { style: 'garden', color: '#f4f1ea', accent: '#4f8a4a' }, { level: 5 }),
  // Входная дверь.
  f('door_old', 'door', t('Обшарпанная дверь', 'Shabby door'), 0, 0, { style: 'old', color: '#6b5440' }, { old: true }),
  f('door_white', 'door', t('Белая филёнчатая', 'White panelled'), 140, 1, { style: 'panel', color: '#f2f0ea' }),
  f('door_oak', 'door', t('Дубовая', 'Oak door'), 240, 1, { style: 'wood', color: '#7a4e2d' }),
  f('door_steel', 'door', t('Стальная с отделкой', 'Steel security door'), 320, 1, { style: 'steel', color: '#3a3f46', accent: '#c9ced4' }, { level: 2 }),
  f('door_glass', 'door', t('Со стеклянными вставками', 'Glazed door'), 480, 2, { style: 'glass', color: '#2d3a3a', accent: '#bfe6f2' }, { level: 5 }),
];

export const finishById = (id: string): FinishDef | undefined => FINISHES.find((x) => x.id === id);
export const finishesOf = (kind: DecorKind): FinishDef[] => FINISHES.filter((x) => x.kind === kind);

export type Decor = Record<DecorKind, string>;

/** Стартовая убитая квартира. */
export const OLD_DECOR: Decor = { wall: 'wall_peeling', floor: 'floor_linoleum', trim: 'trim_old', curtains: 'curt_old', rug: 'rug_old', light: 'light_bulb', kitchen: 'ktile_old', window: 'win_old', door: 'door_old' };
/** Простой новый ремонт (так выглядел дом до ремонтов; им же заменяется старьё при переезде). */
export const BASIC_DECOR: Decor = { wall: 'wall_plaster', floor: 'floor_parquet', trim: 'trim_beige', curtains: 'curt_linen', rug: 'rug_red', light: 'light_warm', kitchen: 'ktile_blue', window: 'win_pvc', door: 'door_oak' };

/** Внешний вид дома для сцены: отделка и состояние базовой мебели. */
export interface HomeLook {
  decor: Decor;
  kit: Kit;
}

// ─── Базовая мебель ────────────────────────────────────────────────────

export type KitId = 'bed' | 'sofa' | 'kitchen' | 'bath';
export const KIT_IDS: readonly KitId[] = ['bed', 'sofa', 'kitchen', 'bath'];
/** 0 — старьё из стартовой квартиры, 1 — новое. */
export type Kit = Record<KitId, number>;
export const OLD_KIT: Kit = { bed: 0, sofa: 0, kitchen: 0, bath: 0 };
export const NEW_KIT: Kit = { bed: 1, sofa: 1, kitchen: 1, bath: 1 };

export interface KitDef {
  id: KitId;
  icon: string;
  /** Название старой и новой вещи. */
  old: Txt;
  name: Txt;
  desc: Txt;
  price: number;
  /** Предметы дома, к которым относится. */
  objects: readonly string[];
}

export const KITS: readonly KitDef[] = [
  { id: 'bed', icon: '🛏️', old: t('Скрипучая раскладушка', 'Creaky camp bed'), name: t('Новая кровать', 'New bed'), desc: t('Сон восстанавливает больше сил.', 'Sleep restores more energy.'), price: 220, objects: ['bed'] },
  { id: 'sofa', icon: '🛋️', old: t('Продавленный диван и старый телевизор', 'Saggy sofa and an old TV'), name: t('Новый диван и телевизор', 'New sofa and TV'), desc: t('Отдых на диване приятнее.', 'Resting on the sofa is nicer.'), price: 280, objects: ['sofa'] },
  { id: 'kitchen', icon: '🍳', old: t('Ржавая плита и гудящий холодильник', 'Rusty stove and a humming fridge'), name: t('Новая кухня', 'New kitchen'), desc: t('Еда сытнее.', 'Meals are more filling.'), price: 350, objects: ['stove', 'fridge'] },
  { id: 'bath', icon: '🚿', old: t('Душ со шторкой и ржавчиной', 'Rusty shower with a curtain'), name: t('Душевая кабина', 'Shower cabin'), desc: t('Душ освежает лучше.', 'Showers freshen you up better.'), price: 200, objects: ['shower'] },
];
export const kitById = (id: KitId): KitDef => KITS.find((k) => k.id === id)!;
/** К какой базовой мебели относится предмет дома. */
export const kitOf = (object: string): KitId | undefined => KITS.find((k) => k.objects.includes(object))?.id;
/** Старая вещь: польза от неё меньше. */
export const OLD_KIT_FACTOR = 0.75;
/** Уют от старой базовой мебели (за каждую): старьё не уютно, но и не отнимает уют — оно просто хуже работает. */
export const OLD_KIT_COMFORT = 0;
