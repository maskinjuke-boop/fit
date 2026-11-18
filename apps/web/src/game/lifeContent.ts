import type { ExerciseId } from '../tracking/exercise';
import type { ActionDef, CatBreed, LifeEffect, ObjectId, PlayItemId, Txt } from './lifeTypes';

/**
 * Содержимое кошачьего дома: предметы и мебель, ступени дома (расширение — по числу кошек),
 * кошки, упражнения демона, действия кошки игрока и утренние события. Людей в доме нет.
 * Тексты — на двух языках.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

// ─── Предметы ──────────────────────────────────────────────────────────

/** Раздел магазина для кафе: мебель, техника, декор. */
export type HomeKind = 'furniture' | 'tech' | 'decor';

export interface ObjectDef {
  id: ObjectId;
  icon: string;
  name: Txt;
  /** Продаётся в магазине (раздел «Для кафе»). */
  price?: number;
  desc?: Txt;
  kind?: HomeKind;
  /** Где стоит: у стены на полу (по умолчанию), на стене или где угодно (робот-пылесос). */
  mount?: 'slot' | 'wall' | 'floor' | 'free';
  /** Уют: каждая единица — больше гостей и дороже вход. */
  comfort?: number;
}

export const OBJECTS: Record<ObjectId, ObjectDef> = {
  door: { id: 'door', icon: '🚪', name: t('Входная дверь', 'Front door') },
  sofa: { id: 'sofa', icon: '🛋️', name: t('Диван', 'Sofa') },
  play_zone: { id: 'play_zone', icon: '🧶', name: t('Игровая зона', 'Play area'), desc: t('Домик-когтеточка с полками, столбик, тоннель и помпон', 'A cat tree with shelves, a scratching post, a tunnel and a pom-pom'), comfort: 2 },
  bookshelf: { id: 'bookshelf', icon: '📚', name: t('Книжный стеллаж', 'Bookshelf'), price: 200, desc: t('Охотиться на корешки книг и спать наверху', 'Hunt book spines and nap on top'), comfort: 1, kind: 'furniture' },
  easel: { id: 'easel', icon: '🎨', name: t('Мольберт с красками', 'Easel with paints'), price: 150, desc: t('Картины лапками — их покупают', 'Paw-painted pictures that sell'), kind: 'furniture' },
  armchair: { id: 'armchair', icon: '🪑', name: t('Мягкое кресло', 'Cosy armchair'), price: 220, desc: t('Свернуться клубком', 'For curling up'), comfort: 2, kind: 'furniture' },
  piano: { id: 'piano', icon: '🎹', name: t('Пианино', 'Piano'), price: 900, desc: t('Пройтись по клавишам', 'Walk across the keys'), comfort: 2, kind: 'furniture' },
  aquarium: { id: 'aquarium', icon: '🐠', name: t('Аквариум', 'Aquarium'), price: 350, desc: t('Часами смотреть на рыбок', 'Watch the fish for hours'), comfort: 2, kind: 'decor' },
  console: { id: 'console', icon: '🎮', name: t('Игровая приставка', 'Game console'), price: 380, desc: t('Гонять джойстик лапой', 'Bat the gamepad around'), comfort: 1, kind: 'tech' },
  smart_speaker: { id: 'smart_speaker', icon: '🔊', name: t('Умная колонка', 'Smart speaker'), price: 160, desc: t('Мурлыкающий плейлист', 'A purring playlist'), comfort: 1, kind: 'tech' },
  big_tv: { id: 'big_tv', icon: '📺', name: t('Большой экран', 'Big screen'), price: 1500, desc: t('Мультики про птичек', 'Cartoons about birds'), comfort: 3, kind: 'tech' },
  robot_vacuum: { id: 'robot_vacuum', icon: '🤖', name: t('Робот-пылесос', 'Robot vacuum'), price: 500, desc: t('Собирает шерсть: лоток пачкается медленнее', 'Picks up fur: the litter box gets dirty slower'), mount: 'free', comfort: 1, kind: 'tech' },
  air_conditioner: { id: 'air_conditioner', icon: '❄️', name: t('Кондиционер', 'Air conditioner'), price: 700, desc: t('Свежо и без запахов', 'Fresh and odour-free'), mount: 'wall', comfort: 2, kind: 'tech' },
  painting: { id: 'painting', icon: '🖼️', name: t('Картина', 'Painting'), price: 180, desc: t('Яркий акцент на стене', 'A bright accent on the wall'), mount: 'wall', comfort: 2, kind: 'decor' },
  wall_clock: { id: 'wall_clock', icon: '🕰️', name: t('Часы-кошка', 'Cat clock'), price: 90, desc: t('Тикают по игровому времени', 'Ticks with game time'), mount: 'wall', comfort: 1, kind: 'decor' },
  neon_sign: { id: 'neon_sign', icon: '💡', name: t('Неоновая вывеска', 'Neon sign'), price: 260, desc: t('«CATS» светится вечером', '“CATS” glows at night'), mount: 'wall', comfort: 2, kind: 'decor' },
  photo_wall: { id: 'photo_wall', icon: '📸', name: t('Стена с фото', 'Photo wall'), price: 120, desc: t('Фотографии котиков', 'Photos of the cats'), mount: 'wall', comfort: 2, kind: 'decor' },
  house_plant: { id: 'house_plant', icon: '🪴', name: t('Монстера', 'Monstera'), price: 70, desc: t('Зелень в доме', 'Greenery at home'), mount: 'floor', comfort: 1, kind: 'decor' },
  floor_lamp: { id: 'floor_lamp', icon: '🛋️', name: t('Торшер', 'Floor lamp'), price: 150, desc: t('Тёплый свет по вечерам', 'Warm light in the evening'), mount: 'floor', comfort: 2, kind: 'decor' },
  flower_vase: { id: 'flower_vase', icon: '💐', name: t('Ваза с цветами', 'Vase of flowers'), price: 60, desc: t('Свежие цветы', 'Fresh flowers'), mount: 'floor', comfort: 1, kind: 'decor' },
  palm: { id: 'palm', icon: '🌴', name: t('Пальма в кадке', 'Potted palm'), price: 240, desc: t('Курорт для котиков', 'A resort for cats'), mount: 'floor', comfort: 2, kind: 'decor' },
  cat: { id: 'cat', icon: '🐈', name: t('Кошка', 'Cat') },
  cat_bowl: { id: 'cat_bowl', icon: '🥣', name: t('Миски', 'Bowls') },
  litter: { id: 'litter', icon: '🧻', name: t('Кошачий лоток', 'Litter box') },
  demon: { id: 'demon', icon: '😈', name: t('Демон в кресле', 'The demon in his armchair') },
  belt: { id: 'belt', icon: '🐾', name: t('Лента к жерлу', 'The belt to the pit') },
  graves: { id: 'graves', icon: '🪦', name: t('Могилки', 'The graves') },
  demon_door: { id: 'demon_door', icon: '🚪', name: t('Выход из лавки', 'Shop exit') },
};

/** Предметы, которые есть в доме всегда. */
export const HOME_OBJECTS: readonly ObjectId[] = ['door', 'sofa', 'play_zone'];
/** Всё для дома из магазина — в порядке показа. */
export const FURNITURE: readonly ObjectId[] = [
  // Мебель.
  'easel', 'armchair', 'bookshelf', 'piano',
  // Техника.
  'smart_speaker', 'console', 'robot_vacuum', 'air_conditioner', 'big_tv',
  // Декор.
  'flower_vase', 'house_plant', 'wall_clock', 'photo_wall', 'floor_lamp', 'painting', 'palm', 'neon_sign', 'aquarium',
];

// ─── Ступени дома ──────────────────────────────────────────────────────

/**
 * Ступени дома: размеры (м), места у стен, на стенах и на полу, уют от простора, сколько
 * кошек вмещает, цена и сколько кошек нужно, чтобы расшириться.
 */
export interface HouseDef {
  icon: string;
  name: Txt;
  desc: Txt;
  w: number;
  d: number;
  slots: number;
  wall: number;
  floor: number;
  comfort: number;
  cats: number;
  cost: number;
  /** Сколько кошек должно жить в доме, чтобы расшириться до этой ступени. */
  needCats: number;
}

export const HOUSES: readonly HouseDef[] = [
  { icon: '🐾', name: t('Комнатка', 'Little room'), desc: t('Светлая комнатка: диван, миски, лоток и игровой уголок. Всё впереди!', 'A bright little room: a sofa, bowls, a litter box and a play corner. Up from here!'), w: 9.5, d: 9, slots: 3, wall: 2, floor: 2, comfort: 0, cats: 2, cost: 0, needCats: 0 },
  { icon: '🏠', name: t('Квартира', 'Flat'), desc: t('Просторная квартира: место для мебели и четырёх кошек.', 'A roomy flat: space for furniture and four cats.'), w: 15, d: 11, slots: 12, wall: 5, floor: 5, comfort: 1, cats: 4, cost: 500, needCats: 2 },
  { icon: '🏡', name: t('Дом', 'House'), desc: t('Свой дом: шесть кошек и больше места для игр.', 'A house of their own: six cats and more room to play.'), w: 18, d: 12, slots: 15, wall: 5, floor: 5, comfort: 2, cats: 6, cost: 1500, needCats: 4 },
  { icon: '🏰', name: t('Большой дом', 'Big house'), desc: t('Большой дом: восемь кошек.', 'A big house: eight cats.'), w: 21, d: 13, slots: 19, wall: 5, floor: 5, comfort: 4, cats: 8, cost: 4000, needCats: 6 },
  { icon: '👑', name: t('Кошачий дворец', 'Cat palace'), desc: t('Дворец для десяти кошек и максимум уюта.', 'A palace for ten cats and maximum comfort.'), w: 24, d: 14, slots: 19, wall: 5, floor: 5, comfort: 7, cats: 10, cost: 9000, needCats: 8 },
];
/** Где стоит предмет (у стены — по умолчанию). */
export const mountOf = (id: ObjectId): 'slot' | 'wall' | 'floor' | 'free' => OBJECTS[id].mount ?? 'slot';
/** Сколько мест этого вида в кафе ступени house. */
export const slotsFor = (mount: 'slot' | 'wall' | 'floor' | 'free', house = 0): number => {
  const h = HOUSES[Math.max(0, Math.min(HOUSES.length - 1, house))]!;
  return mount === 'wall' ? h.wall : mount === 'floor' ? h.floor : mount === 'free' ? 1 : h.slots;
};

// ─── Кошки ─────────────────────────────────────────────────────────────

export interface CatBreedDef {
  id: CatBreed;
  name: Txt;
  desc: Txt;
  /** Цена чистокровной кошки породы (метис стоит меньше — по чистоте крови). */
  value: number;
}

export const CAT_BREEDS: readonly CatBreedDef[] = [
  { id: 'ginger', name: t('Рыжий дворовый', 'Ginger moggy'), desc: t('Солнечный и вечно голодный.', 'Sunny and always hungry.'), value: 40 },
  { id: 'black', name: t('Чёрная дворовая', 'Black moggy'), desc: t('К удаче! Глаза как янтарь.', 'For luck! Amber eyes.'), value: 50 },
  { id: 'british', name: t('Британская короткошёрстная', 'British Shorthair'), desc: t('Плюшевая и невозмутимая.', 'Plush and unflappable.'), value: 300 },
  { id: 'siamese', name: t('Сиамская', 'Siamese'), desc: t('Разговорчивая, с голубыми глазами.', 'Chatty, with blue eyes.'), value: 260 },
  { id: 'scottish_fold', name: t('Скоттиш-фолд', 'Scottish Fold'), desc: t('Вислоухая и любопытная.', 'Folded ears, endless curiosity.'), value: 360 },
  { id: 'bengal', name: t('Бенгальская', 'Bengal'), desc: t('Леопардовые пятна и много энергии.', 'Leopard spots and lots of energy.'), value: 520 },
  { id: 'persian', name: t('Персидская', 'Persian'), desc: t('Пушистое облако, любит поспать.', 'A fluffy cloud that loves naps.'), value: 400 },
  { id: 'maine_coon', name: t('Мейн-кун', 'Maine Coon'), desc: t('Огромный ласковый великан с кисточками.', 'A huge gentle giant with ear tufts.'), value: 560 },
  { id: 'sphynx', name: t('Сфинкс', 'Sphynx'), desc: t('Тёплый, бархатный и без шерсти.', 'Warm, velvety and hairless.'), value: 460 },
  { id: 'ragdoll', name: t('Рэгдолл', 'Ragdoll'), desc: t('Обмякает на руках, как тряпичная кукла.', 'Goes limp in your arms like a rag doll.'), value: 480 },
  { id: 'russian_blue', name: t('Русская голубая', 'Russian Blue'), desc: t('Серебристая шубка и изумрудные глаза.', 'A silvery coat and emerald eyes.'), value: 320 },
  { id: 'abyssinian', name: t('Абиссинская', 'Abyssinian'), desc: t('Тёплая тикированная шерсть, вечно в движении.', 'A warm ticked coat, always on the move.'), value: 380 },
  { id: 'norwegian', name: t('Норвежская лесная', 'Norwegian Forest'), desc: t('Густой воротник и хвост-метёлка.', 'A thick ruff and a bushy tail.'), value: 420 },
  { id: 'siberian', name: t('Сибирская', 'Siberian'), desc: t('Крепкая, пушистая, не боится холода.', 'Sturdy, fluffy and cold-proof.'), value: 340 },
  { id: 'devon_rex', name: t('Девон-рекс', 'Devon Rex'), desc: t('Огромные уши и кудрявая шёрстка.', 'Huge ears and a curly coat.'), value: 400 },
];
export const catBreedById = (id: CatBreed): CatBreedDef => CAT_BREEDS.find((b) => b.id === id) ?? CAT_BREEDS[0]!;
/** Полная миска корма (порций): одна порция — одна кормёжка кошки. */
export const BOWL_MAX = 6;
/** С какой грязи лоток считается грязным: кошкам неуютно, гостей меньше. */
export const LITTER_DIRTY = 60;
/** Как быстро падают потребности кошки (в час игрового времени). */
export const CAT_RATES = { fed: 5, play: 4, toilet: 8, drink: 7 } as const;
/** Сколько игровых часов кошка выживает без еды или без воды. */
export const STARVE_HOURS = 24;
/** С какого числа часов без еды и воды тревога. */
export const STARVE_WARN = 6;
/** Сколько воды из миски выпивает кошка за раз. */
export const SIP = 10;
/** Отношения: с какого — дружат (котята), с какого — не ладят (шипят). */
export const BOND_FRIEND = 60;
export const BOND_ENEMY = -30;
/** Беременность (игровых дней) и сколько котят (до места в доме). */
export const PREGNANCY_DAYS = 2;
export const LITTER_SIZE = [1, 3] as const;
/** Игровая зона: кошки играют сами — скучают медленнее (доля от обычного; с каждой игрушкой — ещё медленнее). */
export const PLAY_ZONE_BOREDOM = 0.75;
export const PLAY_BOREDOM_MIN = 0.5;

// ─── Игровая зона ──────────────────────────────────────────────────────

/** Вид места в зоне: большое (домик, башня, колесо), малое (столбик, гамак, коробки), длинное (тоннель, трек). */
export type PlaySlotKind = 'big' | 'small' | 'long';

export interface PlaySizeDef {
  name: Txt;
  /** Коврик, м. */
  w: number;
  d: number;
  /** Места: вид и где (от середины зоны, м). */
  slots: ReadonlyArray<{ kind: PlaySlotKind; x: number; z: number }>;
  cost: number;
  /** С какой ступени кафе помещается. */
  needHouse: number;
  comfort: number;
}

export const PLAY_SIZES: readonly PlaySizeDef[] = [
  {
    name: t('Игровой уголок', 'Play corner'),
    w: 5.6,
    d: 4.4,
    slots: [
      { kind: 'big', x: -1.9, z: -1.35 },
      { kind: 'small', x: 0.2, z: -1.55 },
      { kind: 'long', x: -1.2, z: 1.2 },
      { kind: 'small', x: 1.8, z: 0.6 },
    ],
    cost: 0,
    needHouse: 0,
    comfort: 0,
  },
  {
    name: t('Игровая комната', 'Play room'),
    w: 7.6,
    d: 5.2,
    slots: [
      { kind: 'big', x: -2.9, z: -1.6 },
      { kind: 'small', x: -1.0, z: -1.8 },
      { kind: 'big', x: 0.6, z: -1.6 },
      { kind: 'small', x: 2.6, z: -1.8 },
      { kind: 'long', x: -2.4, z: 1.5 },
      { kind: 'small', x: 0.2, z: 1.3 },
    ],
    cost: 600,
    needHouse: 2,
    comfort: 1,
  },
  {
    name: t('Котоплощадка', 'Cat playground'),
    w: 9.6,
    d: 6.0,
    slots: [
      { kind: 'big', x: -3.9, z: -1.9 },
      { kind: 'small', x: -2.0, z: -2.1 },
      { kind: 'big', x: -0.4, z: -1.9 },
      { kind: 'small', x: 1.5, z: -2.1 },
      { kind: 'big', x: 3.0, z: -1.9 },
      { kind: 'long', x: -3.2, z: 1.7 },
      { kind: 'long', x: 1.4, z: 1.8 },
      { kind: 'small', x: -0.8, z: 1.2 },
    ],
    cost: 1800,
    needHouse: 3,
    comfort: 2,
  },
];

export interface PlayItemDef {
  id: PlayItemId;
  icon: string;
  name: Txt;
  desc: Txt;
  kind: PlaySlotKind;
  price: number;
  comfort: number;
  /** На сколько медленнее скучают кошки (доля). */
  fun: number;
}

export const PLAY_ITEMS: readonly PlayItemDef[] = [
  { id: 'tree', icon: '🏠', name: t('Домик-когтеточка', 'Cat tree house'), desc: t('Домик, полка и лежанка наверху, помпон на верёвочке', 'A house, a shelf, a bed on top and a pom-pom on a string'), kind: 'big', price: 0, comfort: 0, fun: 0 },
  { id: 'post', icon: '🪵', name: t('Столбик-когтеточка', 'Scratching post'), desc: t('Точить когти и сидеть на полочке', 'For scratching and sitting on the little top'), kind: 'small', price: 0, comfort: 0, fun: 0 },
  { id: 'tunnel', icon: '🌀', name: t('Тоннель', 'Tunnel'), desc: t('Шуршащий тоннель — пробегать насквозь', 'A rustling tunnel to dash through'), kind: 'long', price: 0, comfort: 0, fun: 0 },
  { id: 'boxes', icon: '📦', name: t('Коробки', 'Boxes'), desc: t('Две картонные коробки: кошки сидят в них и выглядывают', 'Two cardboard boxes: the cats sit inside and peek out'), kind: 'small', price: 40, comfort: 1, fun: 0.02 },
  { id: 'hammock', icon: '🛏️', name: t('Гамак', 'Hammock'), desc: t('Кошачий гамак на стойках — спать и качаться', 'A cat hammock on stands for naps and swaying'), kind: 'small', price: 180, comfort: 1, fun: 0.03 },
  { id: 'track', icon: '🎾', name: t('Трек с мячиками', 'Ball track'), desc: t('Мячики катаются по кругу — кошки гоняют их лапой', 'Balls roll in a ring — the cats bat them around'), kind: 'long', price: 120, comfort: 1, fun: 0.04 },
  { id: 'tower', icon: '🗼', name: t('Высокая башня', 'Tall tower'), desc: t('Три полки ступеньками до самого верха', 'Three shelves stepping up to the very top'), kind: 'big', price: 380, comfort: 2, fun: 0.04 },
  { id: 'wheel', icon: '🎡', name: t('Беговое колесо', 'Cat wheel'), desc: t('Большое колесо: кошки бегают в нём, гости в восторге', 'A big wheel the cats run in — guests love it'), kind: 'big', price: 450, comfort: 3, fun: 0.06 },
];
export const playItemById = (id: PlayItemId): PlayItemDef => PLAY_ITEMS.find((x) => x.id === id)!;
/** Что стоит в зоне сначала. */
export const PLAY_DEFAULT: readonly PlayItemId[] = ['tree', 'post', 'tunnel'];

/** Цвета коврика игровой зоны. */
export const PLAY_RUGS: ReadonlyArray<{ id: string; name: Txt; color: string; edge: string; paw: string }> = [
  { id: 'mint', name: t('Мятный', 'Mint'), color: '#bfe0cf', edge: '#7fb59a', paw: '#8fc4aa' },
  { id: 'pink', name: t('Розовый', 'Pink'), color: '#f6cfd9', edge: '#d98ea3', paw: '#e7a9ba' },
  { id: 'sky', name: t('Небесный', 'Sky'), color: '#c9def5', edge: '#86a9d4', paw: '#9dbbe0' },
  { id: 'lilac', name: t('Сиреневый', 'Lilac'), color: '#dccdf0', edge: '#a991cf', paw: '#bba7dc' },
  { id: 'sand', name: t('Песочный', 'Sand'), color: '#efdfbf', edge: '#c9ad78', paw: '#d9c193' },
];
/** Сколько воды (из 100) выпивает кошка за час игрового времени. */
/** Вода в миске испаряется (в час). */
export const WATER_RATE = 0.6;
export const CAT_NAMES: readonly Txt[] = [
  t('Мурка', 'Murka'), t('Барсик', 'Barsik'), t('Пушок', 'Fluffy'), t('Луна', 'Luna'), t('Симба', 'Simba'), t('Тиша', 'Tisha'),
  t('Персик', 'Peach'), t('Оскар', 'Oscar'), t('Соня', 'Sonya'), t('Феликс', 'Felix'), t('Багира', 'Bagheera'), t('Кекс', 'Muffin'),
  t('Зефир', 'Marshmallow'), t('Булочка', 'Bun'), t('Уголёк', 'Ember'), t('Снежок', 'Snowball'), t('Ириска', 'Toffee'), t('Тигра', 'Tigger'),
  t('Пуговка', 'Button'), t('Рыжик', 'Rusty'), t('Масяня', 'Masya'), t('Котлета', 'Meatball'), t('Плюша', 'Plushy'), t('Черныш', 'Shadow'),
];
/** Возраст кошки в месяцах (один игровой день — месяц): до KITTEN — котёнок, с ADULT — взрослая. */
export const CAT_AGE = { KITTEN: 6, ADULT: 8, GROWN: 12 } as const;

// ─── Лавка демона ──────────────────────────────────────────────────────

/**
 * Упражнения, за которые демон отдаёт кошку, и число повторов за первую кошку. Каждая
 * спасённая кошка поднимает цену следующей (см. demonTarget).
 */
export const DEMON_EXERCISES: ReadonlyArray<[ExerciseId, number]> = [
  ['squat', 20],
  ['lunge', 16],
  ['pushup', 10],
  ['situp', 20],
  ['jumping_jack', 40],
  ['high_knees', 40],
];
/** Сколько могилок помнит лавка (последние). */
export const GRAVES_MAX = 24;
/** На сколько дорожает каждая следующая кошка (доля от начальной цены) и предел роста. */
export const DEMON_STEP = 0.2;
export const DEMON_MAX_FACTOR = 4;

/** Деньги за засчитанный повтор (в пределах дневного лимита упражнения). */
export const REP_MONEY = 1;

// ─── Действия ──────────────────────────────────────────────────────────

const fx = (e: LifeEffect): LifeEffect => e;

export const ACTIONS: readonly ActionDef[] = [
  // Миски и лоток.
  { id: 'eat', icon: '🍽️', label: t('Поесть из миски', 'Eat from the bowl'), at: 'cat_bowl', minutes: 10, needBowl: true, effect: fx({ bowl: -1, self: { fed: 55 } }) },
  { id: 'drink', icon: '💧', label: t('Попить воды', 'Drink some water'), at: 'cat_bowl', minutes: 5, effect: fx({ water: -10, self: { drink: 70 } }) },
  { id: 'ask_food', icon: '🔔', label: t('Мяукнуть у кормушки — насыплет корм', 'Meow at the feeder — it fills the bowls'), at: 'cat_bowl', minutes: 5, cost: 8, effect: fx({ bowl: BOWL_MAX, water: 100 }) },
  { id: 'use_litter', icon: '🚽', label: t('Сходить в лоток', 'Use the litter box'), at: 'litter', minutes: 10, effect: fx({ litter: 20, self: { toilet: 100 } }) },
  { id: 'clean_litter', icon: '🧹', label: t('Нажать кнопку автолотка', 'Press the self-cleaning button'), at: 'litter', minutes: 5, effect: fx({ litter: -100 }) },
  // Дом.
  { id: 'go_demon', icon: '😈', label: t('Пойти в лавку демона', 'Go to the demon’s shop'), at: 'door', minutes: 20, go: 'demon', effect: fx({}) },
  { id: 'nap_sofa', icon: '💤', label: t('Поспать на диване', 'Nap on the sofa'), at: 'sofa', minutes: 60, effect: fx({ self: { play: 6 } }) },
  { id: 'play_setup', icon: '🛠️', label: t('Игровая зона: расширить и обставить', 'Play area: expand and furnish'), at: 'play_zone', minutes: 0, open: 'play', effect: fx({}) },
  { id: 'climb_tree', icon: '🏠', label: t('Залезть на лежанку домика', 'Climb to the cat-tree bed'), at: 'play_zone', needItem: 'tree', minutes: 30, effect: fx({ self: { play: 18 } }) },
  { id: 'house_nap', icon: '😴', label: t('Поспать в домике', 'Nap in the cat house'), at: 'play_zone', needItem: 'tree', minutes: 45, effect: fx({ self: { play: 10 } }) },
  { id: 'pompom', icon: '🎀', label: t('Поиграть с помпоном', 'Bat the pom-pom'), at: 'play_zone', needItem: 'tree', minutes: 15, effect: fx({ self: { play: 25 } }) },
  { id: 'scratch_post', icon: '🪵', label: t('Поточить когти', 'Sharpen claws'), at: 'play_zone', needItem: 'post', minutes: 10, effect: fx({ self: { play: 15 } }) },
  { id: 'tunnel_run', icon: '🌀', label: t('Пробежать через тоннель', 'Dash through the tunnel'), at: 'play_zone', needItem: 'tunnel', minutes: 10, effect: fx({ self: { play: 22 } }) },
  { id: 'hammock_nap', icon: '🛏️', label: t('Покачаться в гамаке', 'Sway in the hammock'), at: 'play_zone', needItem: 'hammock', minutes: 40, effect: fx({ self: { play: 14 } }) },
  { id: 'box_sit', icon: '📦', label: t('Посидеть в коробке', 'Sit in a box'), at: 'play_zone', needItem: 'boxes', minutes: 20, effect: fx({ self: { play: 16 } }) },
  { id: 'tower_climb', icon: '🗼', label: t('Забраться на башню', 'Climb the tower'), at: 'play_zone', needItem: 'tower', minutes: 30, effect: fx({ self: { play: 24 } }) },
  { id: 'wheel_run', icon: '🎡', label: t('Побегать в колесе', 'Run in the wheel'), at: 'play_zone', needItem: 'wheel', minutes: 20, effect: fx({ self: { play: 35 } }) },
  { id: 'track_play', icon: '🎾', label: t('Погонять мячики', 'Chase the balls'), at: 'play_zone', needItem: 'track', minutes: 15, effect: fx({ self: { play: 26 } }) },
  // Мебель.
  { id: 'books', icon: '📚', label: t('Поохотиться на корешки книг', 'Hunt the book spines'), at: 'bookshelf', minutes: 15, effect: fx({ self: { play: 10 } }) },
  { id: 'armchair', icon: '🪑', label: t('Свернуться в кресле', 'Curl up in the armchair'), at: 'armchair', minutes: 40, effect: fx({ self: { play: 6 } }) },
  { id: 'fish', icon: '🐠', label: t('Смотреть на рыбок', 'Watch the fish'), at: 'aquarium', minutes: 20, effect: fx({ self: { play: 16 } }) },
  { id: 'piano', icon: '🎹', label: t('Пройтись по клавишам', 'Walk across the keys'), at: 'piano', minutes: 10, effect: fx({ self: { play: 14 } }) },
  { id: 'cinema', icon: '🐦', label: t('Смотреть мультики про птичек', 'Watch bird cartoons'), at: 'big_tv', minutes: 60, effect: fx({ self: { play: 14 } }) },
  { id: 'dance', icon: '🎶', label: t('Включить мурлыкающий плейлист', 'Play the purring playlist'), at: 'smart_speaker', minutes: 30, effect: fx({ catsPlay: 8 }) },
  { id: 'console', icon: '🎮', label: t('Погонять джойстик лапой', 'Bat the gamepad around'), at: 'console', minutes: 20, effect: fx({ self: { play: 14 } }) },
  { id: 'paint', icon: '🎨', label: t('Нарисовать картину лапками', 'Paint a picture with your paws'), at: 'easel', minutes: 90, effect: fx({ money: 35 }) },
  // Другие кошки.
  { id: 'rub_cat', icon: '🤗', label: t('Потереться о кошку', 'Rub against the cat'), at: 'cat', needOther: true, minutes: 5, effect: fx({ catPlay: 8, self: { play: 6 }, bond: 8 }) },
  { id: 'play_cats', icon: '🧶', label: t('Поиграть вместе', 'Play together'), at: 'cat', needOther: true, minutes: 20, effect: fx({ catPlay: 25, self: { play: 25 }, bond: 6 }) },
  { id: 'groom_cat', icon: '👅', label: t('Умыть кошку', 'Groom the cat'), at: 'cat', needOther: true, minutes: 10, effect: fx({ catPlay: 12, self: { play: 5 }, bond: 10 }) },
  { id: 'sniff_cat', icon: '👃', label: t('Обнюхаться носами', 'Touch noses'), at: 'cat', needOther: true, minutes: 2, effect: fx({ bond: 4 }) },
  { id: 'chase_cat', icon: '🏃', label: t('Играть в догонялки', 'Play tag'), at: 'cat', needOther: true, minutes: 15, effect: fx({ catPlay: 30, self: { play: 30 }, bond: 6 }) },
  { id: 'nap_cat', icon: '😴', label: t('Поспать в обнимку', 'Nap curled up together'), at: 'cat', needOther: true, minutes: 60, effect: fx({ catPlay: 8, self: { play: 8 }, bond: 12 }) },
  { id: 'hiss_cat', icon: '😾', label: t('Зашипеть', 'Hiss'), at: 'cat', needOther: true, minutes: 2, effect: fx({ bond: -15 }) },
  { id: 'mate_cat', icon: '💞', label: t('Завести котят', 'Have kittens'), at: 'cat', needOther: true, needMate: true, minutes: 30, effect: fx({ bond: 5 }) },
  // Лавка демона.
  { id: 'rescue', icon: '🏋️', label: t('Спасти кошку (упражнение)', 'Save the cat (exercise)'), at: 'demon', minutes: 0, rescue: true, effect: fx({}) },
  { id: 'demon_info', icon: '📜', label: t('Условия демона', 'The demon’s terms'), at: 'demon', minutes: 0, open: 'demon', effect: fx({}) },
  { id: 'comfort_cat', icon: '💬', label: t('Мяукнуть кошке на ленте', 'Meow to the cat on the belt'), at: 'belt', minutes: 5, effect: fx({}) },
  { id: 'mourn', icon: '💐', label: t('Посидеть у могилок', 'Sit by the graves'), at: 'graves', minutes: 10, effect: fx({}) },
  { id: 'go_cafe', icon: '🏠', label: t('Вернуться домой', 'Back home'), at: 'demon_door', minutes: 20, go: 'cafe', effect: fx({}) },
];

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((a) => a.id === id);

// ─── Утренние события ──────────────────────────────────────────────────

export interface LifeEventChoice {
  id: string;
  label: Txt;
  cost?: number;
  text: Txt;
  effect: LifeEffect;
}

export interface LifeEventDef {
  id: string;
  icon: string;
  title: Txt;
  text: Txt;
  /** Нужна хотя бы одна кошка. */
  needsCats?: boolean;
  choices: LifeEventChoice[];
}

export const LIFE_EVENTS: readonly LifeEventDef[] = [
  {
    id: 'sunbeam',
    icon: '☀️',
    title: t('Солнечный зайчик', 'A sunbeam'),
    text: t('По полу бегает солнечный зайчик.', 'A sunbeam is dancing across the floor.'),
    choices: [
      { id: 'chase', label: t('Ловить!', 'Chase it!'), text: t('Все кошки носятся за зайчиком.', 'All the cats chase the sunbeam.'), effect: { catsPlay: 20 } },
      { id: 'bask', label: t('Греться в луче', 'Bask in it'), text: t('Тёплый луч — лучшая лежанка.', 'A warm beam is the best bed.'), effect: { self: { play: 8 } } },
    ],
  },
  {
    id: 'parcel',
    icon: '📦',
    title: t('Посылка', 'A parcel'),
    text: t('У двери стоит большая картонная коробка.', 'A big cardboard box is standing by the door.'),
    choices: [
      { id: 'inside', label: t('Залезть внутрь', 'Climb inside'), text: t('Лучшая игрушка — коробка.', 'The best toy is a box.'), effect: { catsPlay: 15 } },
      { id: 'shred', label: t('Разодрать на клочки', 'Shred it'), text: t('Клочки картона по всему дому — весело!', 'Bits of cardboard all over — fun!'), effect: { self: { play: 20 }, litter: 10 } },
    ],
  },
  {
    id: 'bird',
    icon: '🐦',
    title: t('Птичка за окном', 'A bird at the window'),
    text: t('На подоконник за стеклом села птичка.', 'A bird has landed on the sill outside.'),
    choices: [
      { id: 'watch', label: t('Смотреть и стрекотать', 'Watch and chatter'), text: t('Хвосты ходят ходуном.', 'Tails twitch like mad.'), effect: { catsPlay: 12 } },
      { id: 'nap', label: t('Не обращать внимания', 'Ignore it'), text: t('Сон важнее.', 'Sleep is more important.'), effect: {} },
    ],
  },
  {
    id: 'storm',
    icon: '⛈️',
    title: t('Гроза', 'A thunderstorm'),
    text: t('Гремит гром, кошки насторожились.', 'Thunder rumbles; the cats are on edge.'),
    choices: [
      { id: 'cuddle', label: t('Прижаться друг к другу', 'Cuddle together'), text: t('Вместе не страшно.', 'Together it isn’t scary.'), effect: { catsPlay: 8 } },
      { id: 'hide', label: t('Спрятаться под диван', 'Hide under the sofa'), text: t('Переждали под диваном.', 'Waited it out under the sofa.'), effect: {} },
    ],
  },
  {
    id: 'catnip',
    icon: '🌿',
    title: t('Мятная игрушка', 'A catnip toy'),
    text: t('За диваном нашлась игрушка с кошачьей мятой.', 'A catnip toy turned up behind the sofa.'),
    needsCats: true,
    choices: [
      { id: 'share', label: t('Поделиться со всеми', 'Share it with everyone'), text: t('Все кошки катаются от счастья.', 'All the cats roll about in bliss.'), effect: { catsPlay: 25 } },
      { id: 'keep', label: t('Оставить себе', 'Keep it'), text: t('Своя игрушка — своя радость.', 'Your toy, your joy.'), effect: { self: { play: 30 } } },
    ],
  },
];

export const lifeEventById = (id: string): LifeEventDef | undefined => LIFE_EVENTS.find((e) => e.id === id);
