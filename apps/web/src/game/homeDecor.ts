import type { Txt } from './lifeTypes';

/**
 * Ремонт котокафе: отделка (стены, пол, панели, шторы, ковёр, свет, плитка у стойки) и базовая
 * мебель (гостевой диван). Кафе начинается простым: кремовые стены, зелёные панели, плитка,
 * витринные окна и потёртый диван. Отделку можно купить и менять — купленная остаётся
 * в запасе, вернуть её можно бесплатно.
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
  kitchen: t('Плитка у стойки', 'Counter tiles'),
  window: t('Окна', 'Windows'),
  door: t('Входная дверь кафе', 'Café front door'),
};

export const DECOR_KIND_ICON: Record<DecorKind, string> = { wall: '🧱', floor: '🪵', trim: '📏', curtains: '🎀', rug: '🟫', light: '💡', kitchen: '🛎️', window: '🪟', door: '🚪' };

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
  /** С какого уровня героя продаётся. */
  level?: number;
  look: FinishLook;
}

const f = (id: string, kind: DecorKind, name: Txt, price: number, comfort: number, look: FinishLook, extra: Partial<FinishDef> = {}): FinishDef => ({ id, kind, name, price, comfort, look, ...extra });

export const FINISHES: readonly FinishDef[] = [
  // Стены.
  f('wall_cafe', 'wall', t('Сливочные стены с розовыми арками', 'Cream walls with blush arches'), 0, 0, { style: 'arches', color: '#f8eee4', accent: '#f3d3cc' }),
  f('wall_sage_arch', 'wall', t('Шалфейные арки', 'Sage arches'), 160, 2, { style: 'arches', color: '#f4f1ea', accent: '#c9dccd' }),
  f('wall_paws', 'wall', t('Обои с лапками и мордочками', 'Paw & kitty wallpaper'), 180, 2, { style: 'paws', color: '#fbf3ee', accent: '#f0c9c2' }),
  f('wall_dots', 'wall', t('Обои в горошек', 'Polka-dot wallpaper'), 140, 2, { style: 'dots', color: '#f6efe6', accent: '#e8c46a' }),
  f('wall_lilac', 'wall', t('Лавандовая краска', 'Lavender paint'), 120, 1, { style: 'plaster', color: '#e3dbf0' }),
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
  f('floor_cafe', 'floor', t('Светлый терраццо', 'Light terrazzo'), 0, 0, { style: 'terrazzo', color: '#f1ebe3', accent: '#efb3a8,#a9cdb9,#f2d48f,#cfc5ea' }),
  f('floor_checker_old', 'floor', t('Плитка крем-терракота', 'Cream & terracotta tiles'), 120, 1, { style: 'checker', color: '#f1e5cf', accent: '#c98a62' }),
  f('floor_hex', 'floor', t('Пастельные шестигранники', 'Pastel hex tiles'), 380, 3, { style: 'hexes', color: '#f2cdc6', accent: '#b9d6c4' }, { level: 2 }),
  f('floor_oak_light', 'floor', t('Светлая дубовая ёлочка', 'Light oak herringbone'), 520, 3, { style: 'herring', color: '#dcbf96' }, { level: 3 }),
  f('floor_terrazzo_pink', 'floor', t('Розовый терраццо', 'Pink terrazzo'), 600, 3, { style: 'terrazzo', color: '#f3d9d3', accent: '#ffffff,#c97a74,#9cc3b0,#f2d08a' }, { level: 4 }),
  f('floor_laminate', 'floor', t('Светлый ламинат', 'Light laminate'), 150, 1, { style: 'planks', color: '#d2b48a' }),
  f('floor_parquet', 'floor', t('Паркет', 'Parquet'), 300, 2, { style: 'parquet', color: '#b0805a' }),
  f('floor_dark', 'floor', t('Тёмный дуб', 'Dark oak'), 450, 2, { style: 'planks', color: '#6b4a32' }, { level: 3 }),
  f('floor_tile', 'floor', t('Плитка-шахматка', 'Chequered tiles'), 350, 2, { style: 'checker', color: '#efece6', accent: '#3d4148' }, { level: 2 }),
  f('floor_herring', 'floor', t('Паркет-ёлочка', 'Herringbone'), 650, 3, { style: 'herring', color: '#b98a5c' }, { level: 4 }),
  f('floor_concrete', 'floor', t('Полированный бетон', 'Polished concrete'), 500, 2, { style: 'concrete', color: '#a9a7a2' }, { level: 5 }),
  f('floor_marble', 'floor', t('Мрамор', 'Marble'), 1200, 4, { style: 'marble', color: '#f1eee9', accent: '#a9a39a' }, { level: 9 }),
  // Панели и плинтус.
  f('trim_cafe', 'trim', t('Белый плинтус', 'White skirting'), 0, 1, { style: 'base', color: '#fbf8f3' }),
  f('trim_sage_cafe', 'trim', t('Зелёные панели кафе', 'Green café panels'), 120, 1, { style: 'panels', color: '#557a63' }),
  f('trim_white', 'trim', t('Белый плинтус', 'White skirting'), 40, 0, { style: 'base', color: '#f7f5f0' }),
  f('trim_beige', 'trim', t('Бежевые панели', 'Beige panels'), 160, 1, { style: 'panels', color: '#d8cbb6' }),
  f('trim_wood', 'trim', t('Деревянные панели', 'Wooden panels'), 260, 2, { style: 'panels', color: '#9c6b43' }, { level: 2 }),
  f('trim_sage', 'trim', t('Шалфейные панели', 'Sage panels'), 260, 2, { style: 'panels', color: '#7f9a86' }, { level: 2 }),
  f('trim_molding', 'trim', t('Белые панели с молдингом', 'White moulded panels'), 380, 2, { style: 'molding', color: '#f4f2ec' }, { level: 4 }),
  // Шторы.
  f('curt_cafe', 'curtains', t('Лёгкие льняные шторы', 'Light linen curtains'), 0, 0, { style: 'drape', color: '#f7efe6' }),
  f('curt_linen', 'curtains', t('Льняные шторы', 'Linen curtains'), 60, 1, { style: 'drape', color: '#e9dcc7' }),
  f('curt_blue', 'curtains', t('Синие шторы', 'Blue curtains'), 90, 1, { style: 'drape', color: '#4a6fa5' }),
  f('curt_terra', 'curtains', t('Терракотовые шторы', 'Terracotta curtains'), 90, 1, { style: 'drape', color: '#c0643e' }),
  f('curt_blinds', 'curtains', t('Жалюзи', 'Blinds'), 150, 1, { style: 'blinds', color: '#f2f2f0' }),
  f('curt_velvet', 'curtains', t('Изумрудный бархат', 'Emerald velvet'), 300, 2, { style: 'drape', color: '#1f5c4a', accent: '#d4af37' }, { level: 4 }),
  // Ковёр.
  f('rug_none', 'rug', t('Без ковра', 'No rug'), 0, 0, { style: 'none', color: '#000000' }),
  f('rug_red', 'rug', t('Красный овальный', 'Red oval rug'), 120, 1, { style: 'oval', color: '#a24b45', accent: '#e3c7a0' }),
  f('rug_grey', 'rug', t('Серый круглый', 'Grey round rug'), 140, 1, { style: 'round', color: '#8d9196', accent: '#c9ccd0' }),
  f('rug_stripes', 'rug', t('Полосатый', 'Striped rug'), 180, 1, { style: 'stripes', color: '#e8dfcf', accent: '#3f5f7a' }),
  f('rug_fluffy', 'rug', t('Пушистый белый', 'Fluffy white rug'), 320, 2, { style: 'fluffy', color: '#f4f1ea' }, { level: 3 }),
  f('rug_persian', 'rug', t('Персидский ковёр', 'Persian rug'), 700, 3, { style: 'persian', color: '#7d1f24', accent: '#d9b46a' }, { level: 6 }),
  // Свет.
  f('light_cafe', 'light', t('Подвесные шары', 'Globe pendants'), 0, 1, { style: 'globes', color: '#ffdcae' }),
  f('light_warm', 'light', t('Тёплые плафоны', 'Warm ceiling lights'), 150, 1, { style: 'warm', color: '#ffd9a0' }),
  f('light_day', 'light', t('Дневной свет', 'Daylight lamps'), 200, 1, { style: 'warm', color: '#f2f6ff' }),
  f('light_led', 'light', t('Светодиодная подсветка', 'LED cove lighting'), 450, 2, { style: 'led', color: '#ffe2b8', accent: '#8a6cff' }, { level: 3 }),
  f('light_chandelier', 'light', t('Люстра', 'Chandelier'), 600, 2, { style: 'chandelier', color: '#ffe0ae', accent: '#d4af37' }, { level: 4 }),
  // Зона за стойкой: плитка на полу и фартук на стене.
  f('ktile_cafe', 'kitchen', t('Розовый «кабанчик»', 'Blush subway tiles'), 0, 0, { style: 'subway', color: '#f5d5d2', accent: '#fbf3ef' }),
  f('ktile_blue', 'kitchen', t('Голубая плитка', 'Pale blue tiles'), 100, 1, { style: 'square', color: '#a7c7d9', accent: '#e9eef1' }),
  f('ktile_subway', 'kitchen', t('Белый «кабанчик»', 'White subway tiles'), 140, 1, { style: 'subway', color: '#f4f2ee', accent: '#c4beb3' }),
  f('ktile_green', 'kitchen', t('Зелёный «кабанчик»', 'Green subway tiles'), 180, 1, { style: 'subway', color: '#6f9c84', accent: '#e8eee9' }, { level: 2 }),
  f('ktile_terra', 'kitchen', t('Терракота', 'Terracotta'), 220, 1, { style: 'square', color: '#c2734f', accent: '#ead8c6' }, { level: 2 }),
  f('ktile_mosaic', 'kitchen', t('Морская мозаика', 'Sea-glass mosaic'), 320, 2, { style: 'mosaic', color: '#2f7f8a', accent: '#bfe3e6' }, { level: 3 }),
  f('ktile_marble', 'kitchen', t('Мраморный фартук', 'Marble backsplash'), 650, 2, { style: 'marble', color: '#f1eee9', accent: '#a9a39a' }, { level: 6 }),
  // Окна: рамы и подоконник.
  f('win_cafe', 'window', t('Белые витринные окна', 'White shop windows'), 0, 0, { style: 'pvc', color: '#ffffff' }),
  f('win_pvc', 'window', t('Белые пластиковые', 'White PVC'), 150, 1, { style: 'pvc', color: '#ffffff' }),
  f('win_wood', 'window', t('Деревянные рамы', 'Wooden frames'), 260, 1, { style: 'wood', color: '#8a5a36' }, { level: 2 }),
  f('win_loft', 'window', t('Чёрные лофт-рамы', 'Black loft frames'), 380, 2, { style: 'loft', color: '#22252a' }, { level: 3 }),
  f('win_garden', 'window', t('Широкий подоконник с цветами', 'Deep sill with plants'), 520, 2, { style: 'garden', color: '#f4f1ea', accent: '#4f8a4a' }, { level: 5 }),
  // Входная дверь.
  f('door_cafe', 'door', t('Стеклянная дверь кафе', 'Glass café door'), 0, 0, { style: 'glass', color: '#9bb8a5', accent: '#e3f3f7' }),
  f('door_white', 'door', t('Белая филёнчатая', 'White panelled'), 140, 1, { style: 'panel', color: '#f2f0ea' }),
  f('door_oak', 'door', t('Дубовая', 'Oak door'), 240, 1, { style: 'wood', color: '#7a4e2d' }),
  f('door_steel', 'door', t('Стальная с отделкой', 'Steel security door'), 320, 1, { style: 'steel', color: '#3a3f46', accent: '#c9ced4' }, { level: 2 }),
  f('door_glass', 'door', t('Со стеклянными вставками', 'Glazed door'), 480, 2, { style: 'glass', color: '#2d3a3a', accent: '#bfe6f2' }, { level: 5 }),
];

export const finishById = (id: string): FinishDef | undefined => FINISHES.find((x) => x.id === id);
export const finishesOf = (kind: DecorKind): FinishDef[] => FINISHES.filter((x) => x.kind === kind);

export type Decor = Record<DecorKind, string>;

/** Стартовая отделка кафе (есть с самого начала). */
export const CAFE_DECOR: Decor = { wall: 'wall_cafe', floor: 'floor_cafe', trim: 'trim_cafe', curtains: 'curt_cafe', rug: 'rug_none', light: 'light_cafe', kitchen: 'ktile_cafe', window: 'win_cafe', door: 'door_cafe' };
/**
 * Отделка, которую прежние версии ставили сами (квартира: простой ремонт при переезде). В кафе
 * её сменяет стартовая отделка кафе — один раз, при переходе на кафе.
 */
export const APARTMENT_DECOR: Decor = { wall: 'wall_plaster', floor: 'floor_parquet', trim: 'trim_beige', curtains: 'curt_linen', rug: 'rug_red', light: 'light_warm', kitchen: 'ktile_blue', window: 'win_pvc', door: 'door_oak' };

/** Внешний вид кафе для сцены: отделка и состояние базовой мебели. */
export interface HomeLook {
  decor: Decor;
  kit: Kit;
}

// ─── Базовая мебель ────────────────────────────────────────────────────

export type KitId = 'sofa';
export const KIT_IDS: readonly KitId[] = ['sofa'];
/** 0 — старьё из стартового помещения, 1 — новое. */
export type Kit = Record<KitId, number>;
export const OLD_KIT: Kit = { sofa: 0 };
export const NEW_KIT: Kit = { sofa: 1 };

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
  { id: 'sofa', icon: '🛋️', old: t('Потёртый диван', 'A worn sofa'), name: t('Новый гостевой диван', 'New guest sofa'), desc: t('Гостям уютнее — их больше.', 'Guests are cosier — more of them come.'), price: 280, objects: ['sofa'] },
]
export const kitById = (id: KitId): KitDef => KITS.find((k) => k.id === id)!;
/** К какой базовой мебели относится предмет кафе. */
export const kitOf = (object: string): KitId | undefined => KITS.find((k) => k.objects.includes(object))?.id;
/** Уют от старой базовой мебели (за каждую): старьё отнимает уют. */
export const OLD_KIT_COMFORT = -1;
