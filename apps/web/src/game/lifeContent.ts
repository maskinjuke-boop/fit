import type { ExerciseId } from '../tracking/exercise';
import type { ActionDef, CatBreed, LifeEffect, ObjectId, Txt } from './lifeTypes';

/**
 * Содержимое котокафе: предметы и мебель, ступени кафе (расширение — по числу кошек),
 * кошки, упражнения демона, действия и утренние события. Тексты — на двух языках.
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
  door: { id: 'door', icon: '🚪', name: t('Вход в кафе', 'Café entrance') },
  counter: { id: 'counter', icon: '🍰', name: t('Стойка с витриной', 'Counter and display case') },
  sofa: { id: 'sofa', icon: '🛋️', name: t('Гостевой диван', 'Guest sofa') },
  table: { id: 'table', icon: '☕', name: t('Столик для гостей', 'Guest table') },
  play_zone: { id: 'play_zone', icon: '🧶', name: t('Игровая зона для кошек', 'Cat play area'), desc: t('Домик-когтеточка с полками, столбик, тоннель и помпон: кошки играют сами, гостям есть на что посмотреть', 'A cat tree with shelves, a scratching post, a tunnel and a pom-pom: the cats play on their own and guests love to watch'), comfort: 2 },
  bookshelf: { id: 'bookshelf', icon: '📚', name: t('Книжный шкаф', 'Bookshelf'), price: 200, desc: t('Сказки вслух — кошки засыпают, гости умиляются', 'Bedtime stories — cats doze, guests melt'), comfort: 1, kind: 'furniture' },
  easel: { id: 'easel', icon: '🎨', name: t('Мольберт', 'Easel'), price: 150, desc: t('Портреты котиков на продажу', 'Cat portraits for sale'), kind: 'furniture' },
  armchair: { id: 'armchair', icon: '🪑', name: t('Мягкое кресло', 'Cosy armchair'), price: 220, desc: t('Ещё одно уютное место для гостей', 'One more cosy seat for guests'), comfort: 2, kind: 'furniture' },
  piano: { id: 'piano', icon: '🎹', name: t('Пианино', 'Piano'), price: 900, desc: t('Живая музыка собирает гостей', 'Live music draws guests'), comfort: 2, kind: 'furniture' },
  aquarium: { id: 'aquarium', icon: '🐠', name: t('Аквариум', 'Aquarium'), price: 350, desc: t('Кошки часами смотрят на рыбок', 'Cats watch the fish for hours'), comfort: 2, kind: 'decor' },
  console: { id: 'console', icon: '🎮', name: t('Игровая приставка', 'Game console'), price: 380, desc: t('Вечерние турниры для гостей', 'Evening tournaments for guests'), comfort: 1, kind: 'tech' },
  smart_speaker: { id: 'smart_speaker', icon: '🔊', name: t('Умная колонка', 'Smart speaker'), price: 160, desc: t('Мурлыкающий плейлист', 'A purring playlist'), comfort: 1, kind: 'tech' },
  big_tv: { id: 'big_tv', icon: '📺', name: t('Большой экран', 'Big screen'), price: 1500, desc: t('Кино про котиков для гостей', 'Cat movies for guests'), comfort: 3, kind: 'tech' },
  robot_vacuum: { id: 'robot_vacuum', icon: '🤖', name: t('Робот-пылесос', 'Robot vacuum'), price: 500, desc: t('Собирает шерсть: лоток пачкается медленнее', 'Picks up fur: the litter box gets dirty slower'), mount: 'free', comfort: 1, kind: 'tech' },
  air_conditioner: { id: 'air_conditioner', icon: '❄️', name: t('Кондиционер', 'Air conditioner'), price: 700, desc: t('Свежо и без запахов', 'Fresh and odour-free'), mount: 'wall', comfort: 2, kind: 'tech' },
  painting: { id: 'painting', icon: '🖼️', name: t('Картина', 'Painting'), price: 180, desc: t('Яркий акцент на стене', 'A bright accent on the wall'), mount: 'wall', comfort: 2, kind: 'decor' },
  wall_clock: { id: 'wall_clock', icon: '🕰️', name: t('Часы-кошка', 'Cat clock'), price: 90, desc: t('Тикают по игровому времени', 'Ticks with game time'), mount: 'wall', comfort: 1, kind: 'decor' },
  neon_sign: { id: 'neon_sign', icon: '💡', name: t('Неоновая вывеска', 'Neon sign'), price: 260, desc: t('«CATS» светится вечером', '“CATS” glows at night'), mount: 'wall', comfort: 2, kind: 'decor' },
  photo_wall: { id: 'photo_wall', icon: '📸', name: t('Стена с фото', 'Photo wall'), price: 120, desc: t('Гости с котиками', 'Guests with the cats'), mount: 'wall', comfort: 2, kind: 'decor' },
  house_plant: { id: 'house_plant', icon: '🪴', name: t('Монстера', 'Monstera'), price: 70, desc: t('Зелень в кафе', 'Greenery in the café'), mount: 'floor', comfort: 1, kind: 'decor' },
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

/** Предметы, которые есть в кафе всегда. */
export const HOME_OBJECTS: readonly ObjectId[] = ['door', 'counter', 'sofa', 'table', 'play_zone'];
/** Всё для кафе из магазина — в порядке показа. */
export const FURNITURE: readonly ObjectId[] = [
  // Мебель.
  'easel', 'armchair', 'bookshelf', 'piano',
  // Техника.
  'smart_speaker', 'console', 'robot_vacuum', 'air_conditioner', 'big_tv',
  // Декор.
  'flower_vase', 'house_plant', 'wall_clock', 'photo_wall', 'floor_lamp', 'painting', 'palm', 'neon_sign', 'aquarium',
];

// ─── Ступени кафе ──────────────────────────────────────────────────────

/**
 * Ступени кафе: размеры зала (м), места у стен, на стенах и на полу, уют от простора,
 * сколько кошек и гостей вмещает, цена и сколько кошек нужно, чтобы расшириться.
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
  seats: number;
  cost: number;
  /** Сколько кошек должно жить в кафе, чтобы расшириться до этой ступени. */
  needCats: number;
  /** Столиков для гостей (по два стула). */
  tables: number;
  /** Сколько порций еды помещается на витрине. */
  food: number;
}

export const HOUSES: readonly HouseDef[] = [
  { icon: '🐾', name: t('Котоуголок', 'Cat corner'), desc: t('Маленький зал: два столика, диван и витрина с пирожными. Всё впереди!', 'A small hall: two tables, a sofa and a cake display. Up from here!'), w: 9.5, d: 9, slots: 3, wall: 2, floor: 2, comfort: 0, cats: 2, seats: 3, cost: 0, needCats: 0, tables: 2, food: 12 },
  { icon: '☕', name: t('Маленькое котокафе', 'Small cat café'), desc: t('Один светлый зал: три столика, место для мебели и четырёх кошек.', 'One bright hall: three tables, room for furniture and four cats.'), w: 15, d: 11, slots: 12, wall: 5, floor: 5, comfort: 1, cats: 4, seats: 6, cost: 500, needCats: 2, tables: 3, food: 20 },
  { icon: '🏡', name: t('Котокафе', 'Cat café'), desc: t('Шире и глубже: шесть кошек, девять гостей, четыре столика.', 'Wider and deeper: six cats, nine guests, four tables.'), w: 18, d: 12, slots: 15, wall: 5, floor: 5, comfort: 2, cats: 6, seats: 9, cost: 1500, needCats: 4, tables: 4, food: 30 },
  { icon: '🏰', name: t('Большое котокафе', 'Grand cat café'), desc: t('Просторный зал: восемь кошек и толпа гостей.', 'A spacious hall: eight cats and a crowd of guests.'), w: 21, d: 13, slots: 19, wall: 5, floor: 5, comfort: 4, cats: 8, seats: 12, cost: 4000, needCats: 6, tables: 5, food: 40 },
  { icon: '👑', name: t('Котодворец', 'Cat palace'), desc: t('Лучшее котокафе города: десять кошек и максимум уюта.', 'The best cat café in town: ten cats and maximum comfort.'), w: 24, d: 14, slots: 19, wall: 5, floor: 5, comfort: 7, cats: 10, seats: 16, cost: 9000, needCats: 8, tables: 6, food: 50 },
];
/** Где стоит предмет (у стены — по умолчанию). */
export const mountOf = (id: ObjectId): 'slot' | 'wall' | 'floor' | 'free' => OBJECTS[id].mount ?? 'slot';
/** Сколько мест этого вида в кафе ступени house. */
export const slotsFor = (mount: 'slot' | 'wall' | 'floor' | 'free', house = 0): number => {
  const h = HOUSES[Math.max(0, Math.min(HOUSES.length - 1, house))]!;
  return mount === 'wall' ? h.wall : mount === 'floor' ? h.floor : mount === 'free' ? 1 : h.slots;
};

/** Кафе работает круглосуточно; ночью [с, до) гостей меньше (доля от дневного). */
export const NIGHT_HOURS: [number, number] = [0, 7];
export const NIGHT_GUESTS = 0.5;

// ─── Кошки ─────────────────────────────────────────────────────────────

export interface CatBreedDef {
  id: CatBreed;
  name: Txt;
  desc: Txt;
}

export const CAT_BREEDS: readonly CatBreedDef[] = [
  { id: 'ginger', name: t('Рыжий кот', 'Ginger tabby'), desc: t('Солнечный и вечно голодный.', 'Sunny and always hungry.') },
  { id: 'black', name: t('Чёрная кошка', 'Black cat'), desc: t('К удаче! Глаза как янтарь.', 'For luck! Amber eyes.') },
  { id: 'british', name: t('Британская короткошёрстная', 'British Shorthair'), desc: t('Плюшевая и невозмутимая.', 'Plush and unflappable.') },
  { id: 'siamese', name: t('Сиамская', 'Siamese'), desc: t('Разговорчивая, с голубыми глазами.', 'Chatty, with blue eyes.') },
  { id: 'scottish_fold', name: t('Скоттиш-фолд', 'Scottish Fold'), desc: t('Вислоухая и любопытная.', 'Folded ears, endless curiosity.') },
  { id: 'bengal', name: t('Бенгальская', 'Bengal'), desc: t('Леопардовые пятна и много энергии.', 'Leopard spots and lots of energy.') },
  { id: 'persian', name: t('Персидская', 'Persian'), desc: t('Пушистое облако, любит поспать.', 'A fluffy cloud that loves naps.') },
  { id: 'maine_coon', name: t('Мейн-кун', 'Maine Coon'), desc: t('Огромный ласковый великан с кисточками.', 'A huge gentle giant with ear tufts.') },
  { id: 'sphynx', name: t('Сфинкс', 'Sphynx'), desc: t('Тёплый, бархатный и без шерсти.', 'Warm, velvety and hairless.') },
];
export const catBreedById = (id: CatBreed): CatBreedDef => CAT_BREEDS.find((b) => b.id === id) ?? CAT_BREEDS[0]!;
/** Полная миска корма (порций): одна порция — одна кормёжка кошки. */
export const BOWL_MAX = 6;
/** С какой грязи лоток считается грязным: кошкам неуютно, гостей меньше. */
export const LITTER_DIRTY = 60;
/** Как быстро падают потребности кошки (в час игрового времени). */
export const CAT_RATES = { fed: 5, play: 4, toilet: 8 } as const;
/** Игровая зона: кошки играют сами — скучают медленнее (доля от обычного). */
export const PLAY_ZONE_BOREDOM = 0.75;
/** Сколько воды (из 100) выпивает кошка за час игрового времени. */
export const WATER_RATE = 2.5;
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

// ─── Гости ─────────────────────────────────────────────────────────────

/** Цена входа: базовая и прибавка за единицу уюта. */
export const TICKET = { base: 15, perComfort: 1 } as const;
/** Сколько гостей в час приводит одна довольная кошка. */
export const GUESTS_PER_CAT = 1.3;
/**
 * Еда для гостей: порции на витрине. Гость заказывает (с шансом chance), если еда есть, и
 * платит price сверху входа. Закупка — партия batch за cost каждая; испечь самому — bake порций
 * бесплатно, но дольше. Без еды гостей меньше (noFood — доля).
 */
export const FOOD = { price: 12, cost: 5, batch: 10, bake: 4, chance: 0.8, noFood: 0.8 } as const;
/** Деньги за засчитанный повтор (в пределах дневного лимита упражнения). */
export const REP_MONEY = 1;

/** Имена гостей (по фигуре). */
export const GUEST_NAMES: Record<'male' | 'female', readonly Txt[]> = {
  male: [t('Борис', 'Boris'), t('Олег', 'Oleg'), t('Артём', 'Artem'), t('Игорь', 'Igor'), t('Виктор', 'Victor'), t('Денис', 'Denis'), t('Павел', 'Pavel'), t('Руслан', 'Ruslan'), t('Тимур', 'Timur'), t('Глеб', 'Gleb')],
  female: [t('Тамара', 'Tamara'), t('Ольга', 'Olga'), t('Света', 'Sveta'), t('Ника', 'Nika'), t('Алина', 'Alina'), t('Вера', 'Vera'), t('Даша', 'Dasha'), t('Кира', 'Kira'), t('Лиза', 'Liza'), t('Яна', 'Yana')],
};

// ─── Действия ──────────────────────────────────────────────────────────

const fx = (e: LifeEffect): LifeEffect => e;

export const ACTIONS: readonly ActionDef[] = [
  // Кафе.
  { id: 'go_demon', icon: '😈', label: t('Пойти в лавку демона', 'Go to the demon’s shop'), at: 'door', minutes: 20, go: 'demon', effect: fx({}) },
  { id: 'cafe_info', icon: '🏠', label: t('Кафе: мебель и расширение', 'Café: furniture and expansion'), at: 'counter', minutes: 0, open: 'cafe', effect: fx({}) },
  { id: 'flyers', icon: '📢', label: t('Раздать флаеры у входа', 'Hand out flyers'), at: 'counter', minutes: 60, cost: 20, effect: fx({ buzz: 2 }) },
  { id: 'post', icon: '📱', label: t('Выложить фото котиков', 'Post cat photos'), at: 'counter', minutes: 30, effect: fx({ buzz: 1 }) },
  { id: 'restock', icon: '🛒', label: t('Закупить продукты (10 порций)', 'Buy groceries (10 servings)'), at: 'counter', minutes: 30, cost: FOOD.batch * FOOD.cost, effect: fx({ food: FOOD.batch }) },
  { id: 'bake', icon: '🧁', label: t('Испечь пирожные', 'Bake some cakes'), at: 'counter', minutes: 60, effect: fx({ food: FOOD.bake }) },
  { id: 'serve', icon: '🍰', label: t('Принести заказ гостям', 'Bring guests their order'), at: 'table', minutes: 15, effect: fx({ money: 6, buzz: 1 }) },
  { id: 'chat_guests', icon: '💬', label: t('Поболтать с гостями', 'Chat with guests'), at: 'sofa', minutes: 30, effect: fx({ buzz: 1 }) },
  { id: 'relax', icon: '🛋️', label: t('Присесть на диван', 'Sit on the sofa'), at: 'sofa', minutes: 20, effect: fx({ catPlay: 6 }) },
  { id: 'read', icon: '📖', label: t('Читать котам сказку', 'Read the cats a story'), at: 'bookshelf', minutes: 40, effect: fx({ catsPlay: 6, buzz: 1 }) },
  { id: 'paint', icon: '🎨', label: t('Нарисовать портрет кошки', 'Paint a cat portrait'), at: 'easel', minutes: 90, effect: fx({ money: 35 }) },
  { id: 'console', icon: '🎮', label: t('Турнир для гостей', 'A tournament for guests'), at: 'console', minutes: 60, effect: fx({ buzz: 2 }) },
  { id: 'piano', icon: '🎹', label: t('Сыграть гостям и котикам', 'Play for guests and cats'), at: 'piano', minutes: 60, effect: fx({ buzz: 2, catsPlay: 5 }) },
  { id: 'fish', icon: '🐠', label: t('Покормить рыбок (кошки смотрят)', 'Feed the fish (cats watch)'), at: 'aquarium', minutes: 15, effect: fx({ catsPlay: 12 }) },
  { id: 'armchair', icon: '🪑', label: t('Посидеть в кресле', 'Sit in the armchair'), at: 'armchair', minutes: 30, effect: fx({ catPlay: 8 }) },
  { id: 'cinema', icon: '🍿', label: t('Кино про котиков', 'A cat movie night'), at: 'big_tv', minutes: 120, effect: fx({ buzz: 3 }) },
  { id: 'dance', icon: '🎶', label: t('Включить мурлыкающий плейлист', 'Play the purring playlist'), at: 'smart_speaker', minutes: 30, effect: fx({ catsPlay: 8 }) },
  { id: 'laser', icon: '🪶', label: t('Поиграть с кошками дразнилкой', 'Play with the cats using a teaser wand'), at: 'play_zone', minutes: 20, effect: fx({ catsPlay: 18 }) },
  { id: 'new_toys', icon: '🪀', label: t('Повесить новые игрушки', 'Hang up new toys'), at: 'play_zone', minutes: 10, cost: 15, effect: fx({ catsPlay: 25 }) },
  { id: 'cat_show', icon: '🎪', label: t('Устроить гостям котошоу', 'Put on a cat show for guests'), at: 'play_zone', minutes: 40, effect: fx({ catsPlay: 10, buzz: 2 }) },
  { id: 'pet_cat', icon: '🤲', label: t('Погладить кошку', 'Pet the cat'), at: 'cat', minutes: 10, effect: fx({ catPlay: 12 }) },
  { id: 'play_cat', icon: '🧶', label: t('Поиграть с кошкой', 'Play with the cat'), at: 'cat', minutes: 20, effect: fx({ catPlay: 45 }) },
  { id: 'feed_cat', icon: '🐟', label: t('Угостить кошку', 'Give the cat a treat'), at: 'cat', minutes: 5, cost: 5, effect: fx({ catFed: 25, catPlay: 5 }) },
  { id: 'call_cat', icon: '📣', label: t('Позвать кошку', 'Call the cat'), at: 'cat', minutes: 2, effect: fx({ catPlay: 3 }) },
  { id: 'fill_bowl', icon: '🥣', label: t('Насыпать корм и налить воды', 'Fill the food and water bowls'), at: 'cat_bowl', minutes: 5, cost: 8, effect: fx({ bowl: BOWL_MAX, water: 100 }) },
  { id: 'clean_litter', icon: '🧹', label: t('Убрать лоток', 'Clean the litter box'), at: 'litter', minutes: 10, effect: fx({ litter: -100 }) },
  // Лавка демона.
  { id: 'rescue', icon: '🏋️', label: t('Спасти кошку (упражнение)', 'Save the cat (exercise)'), at: 'demon', minutes: 0, rescue: true, effect: fx({}) },
  { id: 'demon_info', icon: '📜', label: t('Условия демона', 'The demon’s terms'), at: 'demon', minutes: 0, open: 'demon', effect: fx({}) },
  { id: 'comfort_cat', icon: '🤲', label: t('Погладить кошку на ленте', 'Pet the cat on the belt'), at: 'belt', minutes: 5, effect: fx({}) },
  { id: 'mourn', icon: '💐', label: t('Положить цветы на могилки', 'Lay flowers on the graves'), at: 'graves', minutes: 10, effect: fx({}) },
  { id: 'go_cafe', icon: '🏠', label: t('Вернуться в кафе', 'Back to the café'), at: 'demon_door', minutes: 20, go: 'cafe', effect: fx({}) },
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
    id: 'blogger',
    icon: '📹',
    title: t('Блогер', 'A blogger'),
    text: t('Блогер хочет снять ролик о ваших котиках.', 'A blogger wants to film your cats.'),
    needsCats: true,
    choices: [
      { id: 'yes', label: t('Согласиться', 'Agree'), text: t('Ролик набрал просмотры — сегодня гостей больше.', 'The video took off — more guests today.'), effect: { buzz: 4 } },
      { id: 'no', label: t('Отказаться', 'Decline'), text: t('Спокойный день без камер.', 'A calm day without cameras.'), effect: { catsPlay: 5 } },
    ],
  },
  {
    id: 'gift',
    icon: '🎁',
    title: t('Подарок от гостьи', 'A gift from a guest'),
    text: t('Постоянная гостья принесла подарок для котиков.', 'A regular guest brought a gift for the cats.'),
    needsCats: true,
    choices: [
      { id: 'food', label: t('Мешок корма', 'A bag of food'), text: t('Миски полны.', 'The bowls are full.'), effect: { bowl: BOWL_MAX, water: 100 } },
      { id: 'toy', label: t('Удочку-дразнилку', 'A teaser wand'), text: t('Кошки носятся за пёрышком.', 'The cats chase the feather.'), effect: { catsPlay: 25 } },
    ],
  },
  {
    id: 'rain',
    icon: '🌧️',
    title: t('Дождливый день', 'A rainy day'),
    text: t('С утра льёт дождь — гости могут не прийти.', 'It has been pouring since morning — guests may stay home.'),
    choices: [
      { id: 'cocoa', label: t('Объявить скидку', 'Announce a discount'), cost: 30, text: t('Скидка в дождь — гостей как обычно.', 'A rainy-day discount — the usual crowd.'), effect: { buzz: 2 } },
      { id: 'wait', label: t('Переждать', 'Wait it out'), text: t('Сегодня тише, кошки отсыпаются.', 'A quiet day; the cats catch up on sleep.'), effect: { buzz: -2, catsPlay: 10 } },
    ],
  },
  {
    id: 'vet',
    icon: '🩺',
    title: t('Ветеринар', 'The vet'),
    text: t('Знакомый ветеринар предлагает осмотреть кошек.', 'A vet friend offers to check the cats.'),
    needsCats: true,
    choices: [
      { id: 'yes', label: t('Осмотреть всех', 'Check everyone'), cost: 40, text: t('Все здоровы и бодры.', 'Everyone is healthy and lively.'), effect: { catsPlay: 15, catFed: 20 } },
      { id: 'later', label: t('В другой раз', 'Another time'), text: t('Осмотр перенесли.', 'The check-up is postponed.'), effect: {} },
    ],
  },
  {
    id: 'party',
    icon: '🎂',
    title: t('День рождения', 'A birthday'),
    text: t('Компания хочет отметить день рождения среди котиков.', 'A group wants to celebrate a birthday among the cats.'),
    needsCats: true,
    choices: [
      { id: 'yes', label: t('Принять компанию', 'Host them'), text: t('Шумно, весело и выгодно.', 'Noisy, fun and profitable.'), effect: { money: 80, catsPlay: -10 } },
      { id: 'no', label: t('Отказать', 'Turn them down'), text: t('Котикам спокойнее.', 'The cats stay calm.'), effect: { catsPlay: 5 } },
    ],
  },
  {
    id: 'bakery',
    icon: '🥐',
    title: t('Соседняя пекарня', 'The bakery next door'),
    text: t('Пекарня отдаёт вчерашнюю выпечку со скидкой.', 'The bakery offers yesterday’s pastries at a discount.'),
    choices: [
      { id: 'buy', label: t('Взять партию', 'Take a batch'), cost: 25, text: t('Витрина полна выпечки.', 'The display is full of pastries.'), effect: { food: 10 } },
      { id: 'no', label: t('Не надо', 'No thanks'), text: t('Обойдёмся своим.', 'We’ll manage with our own.'), effect: {} },
    ],
  },
  {
    id: 'wallet',
    icon: '👛',
    title: t('Забытый кошелёк', 'A forgotten wallet'),
    text: t('Вчерашний гость забыл кошелёк на диване.', 'Yesterday’s guest left a wallet on the sofa.'),
    choices: [
      { id: 'return', label: t('Найти владельца', 'Find the owner'), text: t('Владелец рассказал о вашей честности друзьям.', 'The owner told friends about your honesty.'), effect: { buzz: 2 } },
      { id: 'desk', label: t('Оставить на стойке', 'Keep it at the desk'), text: t('Кошелёк ждёт хозяина.', 'The wallet awaits its owner.'), effect: {} },
    ],
  },
];

export const lifeEventById = (id: string): LifeEventDef | undefined => LIFE_EVENTS.find((e) => e.id === id);
