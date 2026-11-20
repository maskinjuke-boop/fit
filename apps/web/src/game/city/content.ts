import type { ExerciseId } from '../../tracking/exercise';
import type { BuildingId, BuildingKind, Coat, ItemId, Profession, Txt } from './types';

const t = (ru: string, en: string): Txt => ({ ru, en });

// ─── Время ─────────────────────────────────────────────────────────────

/** Игровые минуты в сутках. Одна реальная секунда — одна игровая минута: сутки ≈ 24 мин. */
export const DAY_MIN = 1440;
/** Сколько игровых минут досчитывается за раз, пока игра была закрыта (≈ 3 игровых дня). */
export const CATCH_UP_MAX = 3 * DAY_MIN;

// ─── Карта ─────────────────────────────────────────────────────────────

/** Размер клетки (м); в ней здание, по краям — дорожки. */
export const TILE = 4;
/** Карта — квадрат клеток от −MAP до MAP. */
export const MAP = 6;

/** Ступени поселения: сколько жителей нужно, название и сколько клеток от храма можно застраивать. */
export const TOWNS: ReadonlyArray<{ pop: number; name: Txt; radius: number; icon: string }> = [
  { pop: 0, name: t('Поселение', 'Settlement'), radius: 2, icon: '🏕️' },
  { pop: 4, name: t('Деревня', 'Village'), radius: 3, icon: '🏡' },
  { pop: 10, name: t('Посёлок', 'Hamlet'), radius: 4, icon: '🏘️' },
  { pop: 18, name: t('Городок', 'Small town'), radius: 5, icon: '🏙️' },
  { pop: 30, name: t('Город', 'City'), radius: 6, icon: '🌆' },
];

// ─── Профессии ─────────────────────────────────────────────────────────

export interface ProfessionDef {
  id: Profession;
  icon: string;
  name: Txt;
  /** Где работает. */
  workshop: BuildingId;
  /** Заработок в час при среднем настроении. */
  wage: number;
  /** Что делает на работе (для сводки). */
  doing: Txt;
}

export const PROFESSIONS: readonly ProfessionDef[] = [
  { id: 'baker', icon: '🥖', name: t('Пекарь', 'Baker'), workshop: 'bakery', wage: 7, doing: t('месит тесто и печёт булочки', 'kneads dough and bakes buns') },
  { id: 'fisher', icon: '🎣', name: t('Рыбак', 'Fisher'), workshop: 'fishery', wage: 6, doing: t('ловит и коптит рыбку', 'catches and smokes fish') },
  { id: 'tailor', icon: '🧵', name: t('Портной', 'Tailor'), workshop: 'atelier', wage: 8, doing: t('шьёт шарфики и бантики', 'sews scarves and bows') },
  { id: 'carpenter', icon: '🔨', name: t('Плотник', 'Carpenter'), workshop: 'carpentry', wage: 8, doing: t('строгает доски и мастерит мебель', 'planes boards and makes furniture') },
  { id: 'potter', icon: '🏺', name: t('Гончар', 'Potter'), workshop: 'pottery', wage: 7, doing: t('лепит миски и вазы', 'shapes bowls and vases') },
  { id: 'florist', icon: '🌷', name: t('Цветочник', 'Florist'), workshop: 'flowershop', wage: 6, doing: t('поливает и собирает букеты', 'waters flowers and makes bouquets') },
  { id: 'painter', icon: '🎨', name: t('Художник', 'Painter'), workshop: 'artstudio', wage: 9, doing: t('рисует картины', 'paints pictures') },
  { id: 'confectioner', icon: '🍬', name: t('Кондитер', 'Confectioner'), workshop: 'sweets', wage: 9, doing: t('варит леденцы и взбивает крем', 'boils candy and whips cream') },
];
export const professionById = (id: Profession): ProfessionDef => PROFESSIONS.find((p) => p.id === id)!;

// ─── Здания ────────────────────────────────────────────────────────────

export interface BuildingDef {
  id: BuildingId;
  kind: BuildingKind;
  icon: string;
  name: Txt;
  desc: Txt;
  /** Цена для игрока (◈). */
  cost: number;
  /** С какой ступени поселения можно строить. */
  town: number;
  /** Мастерская: чья, сколько мест по уровням. */
  profession?: Profession;
  jobs?: readonly number[];
  /** Благоустройство: прибавка к настроению кошек, у которых дом или работа рядом (в клетках). */
  mood?: number;
  radius?: number;
  /** Развлечение: веселье и общение в час, билет, мест. */
  fun?: number;
  social?: number;
  ticket?: number;
  capacity?: number;
  /** Кафе кормит, рынок продаёт вещи. */
  food?: number;
  /** Названия уровней (дом и мастерские). */
  levels?: readonly Txt[];
}

/** Дом: уровни, цена улучшения (платит хозяйка из своих денег) и сколько кошек живёт. */
export const HOUSE_LEVELS: ReadonlyArray<{ name: Txt; upgrade: number; capacity: number; comfort: number }> = [
  { name: t('Домик', 'Cottage'), upgrade: 120, capacity: 1, comfort: 0 },
  { name: t('Уютный дом', 'Cosy house'), upgrade: 300, capacity: 1, comfort: 6 },
  { name: t('Двухэтажный дом', 'Two-storey house'), upgrade: 650, capacity: 2, comfort: 12 },
  { name: t('Особнячок', 'Little mansion'), upgrade: 0, capacity: 3, comfort: 20 },
];
/** Мастерская: цена следующего уровня (из копилки работников) и прибавка к выработке. */
export const WORKSHOP_LEVELS: ReadonlyArray<{ name: Txt; upgrade: number; output: number }> = [
  { name: t('Мастерская', 'Workshop'), upgrade: 220, output: 1 },
  { name: t('Большая мастерская', 'Big workshop'), upgrade: 520, output: 1.25 },
  { name: t('Мануфактура', 'Manufactory'), upgrade: 0, output: 1.5 },
];
/** Доля заработка, которую кошка отдаёт в копилку своей мастерской. */
export const FUND_SHARE = 0.15;

const workshop = (id: BuildingId, profession: Profession, icon: string, name: Txt, desc: Txt, cost: number, town: number): BuildingDef => ({
  id,
  kind: 'workshop',
  icon,
  name,
  desc,
  cost,
  town,
  profession,
  jobs: [2, 3, 4],
});

export const BUILDINGS: readonly BuildingDef[] = [
  { id: 'temple', kind: 'temple', icon: '⛩️', name: t('Храм богов', 'Temple of the gods'), desc: t('Сюда кошки несут подношение. Не сделаете упражнения до полуночи — боги разгневаются.', 'The cats bring offerings here. Skip the exercises before midnight and the gods get angry.'), cost: 0, town: 99 },
  { id: 'house', kind: 'house', icon: '🏠', name: t('Пустой домик', 'Empty cottage'), desc: t('В новый дом скоро переедет кошка. Потом она сама его улучшит на свои деньги.', 'A cat will soon move into a new house and later upgrade it with her own money.'), cost: 60, town: 0 },
  workshop('bakery', 'baker', '🥖', t('Пекарня', 'Bakery'), t('Печь, тесто и полки с булочками. Работа для пекарей.', 'An oven, dough and shelves of buns. Work for bakers.'), 150, 0),
  workshop('fishery', 'fisher', '🎣', t('Рыбная лавка', 'Fish shop'), t('Удочки, бочки и коптильня. Работа для рыбаков.', 'Rods, barrels and a smokehouse. Work for fishers.'), 140, 0),
  workshop('atelier', 'tailor', '🧵', t('Ателье', 'Atelier'), t('Швейная машинка, клубки и манекен. Работа для портных.', 'A sewing machine, yarn and a mannequin. Work for tailors.'), 180, 1),
  workshop('carpentry', 'carpenter', '🔨', t('Столярная', 'Carpentry'), t('Верстак, доски и пила. Работа для плотников.', 'A workbench, boards and a saw. Work for carpenters.'), 170, 1),
  workshop('pottery', 'potter', '🏺', t('Гончарная', 'Pottery'), t('Гончарный круг, печь и вазы. Работа для гончаров.', 'A wheel, a kiln and vases. Work for potters.'), 170, 2),
  workshop('flowershop', 'florist', '🌷', t('Цветочная лавка', 'Flower shop'), t('Вёдра с цветами и лейки. Работа для цветочников.', 'Buckets of flowers and watering cans. Work for florists.'), 150, 2),
  workshop('artstudio', 'painter', '🎨', t('Мастерская художника', 'Art studio'), t('Мольберты, холсты и краски. Работа для художников.', 'Easels, canvases and paints. Work for painters.'), 220, 3),
  workshop('sweets', 'confectioner', '🍬', t('Кондитерская', 'Sweet shop'), t('Котёл для леденцов, банки и торты. Работа для кондитеров.', 'A candy pot, jars and cakes. Work for confectioners.'), 240, 3),
  { id: 'garden', kind: 'amenity', icon: '🌳', name: t('Сквер', 'Garden square'), desc: t('Деревья и скамейки: кошки гуляют и болтают, рядом жить приятнее.', 'Trees and benches: cats stroll and chat, living nearby is nicer.'), cost: 50, town: 0, mood: 6, radius: 2, social: 12 },
  { id: 'flowerbed', kind: 'amenity', icon: '🌼', name: t('Клумбы', 'Flower beds'), desc: t('Яркие клумбы радуют соседей.', 'Bright flower beds cheer up the neighbours.'), cost: 30, town: 0, mood: 4, radius: 1 },
  { id: 'lanterns', kind: 'amenity', icon: '🏮', name: t('Аллея фонарей', 'Lantern alley'), desc: t('Тёплый свет по вечерам — кошкам спокойнее.', 'Warm light in the evening calms the cats.'), cost: 45, town: 1, mood: 5, radius: 2 },
  { id: 'fountain', kind: 'amenity', icon: '⛲', name: t('Фонтан', 'Fountain'), desc: t('Площадь с фонтаном: место встреч всего поселения.', 'A square with a fountain: the meeting place of the whole town.'), cost: 120, town: 1, mood: 8, radius: 3, social: 18 },
  { id: 'statue', kind: 'amenity', icon: '🗿', name: t('Статуя кота-основателя', 'Founder cat statue'), desc: t('Гордость поселения: настроение растёт у всех вокруг.', 'The pride of the town: everyone around feels better.'), cost: 200, town: 3, mood: 12, radius: 3 },
  { id: 'playground', kind: 'fun', icon: '🛝', name: t('Игровая площадка', 'Playground'), desc: t('Горка и качели — бесплатное веселье.', 'A slide and swings — free fun.'), cost: 90, town: 0, fun: 30, social: 10, ticket: 0, capacity: 4 },
  { id: 'cafe', kind: 'fun', icon: '☕', name: t('Кафе', 'Café'), desc: t('Кошки обедают и болтают за столиками.', 'Cats have lunch and chat at the tables.'), cost: 130, town: 0, fun: 12, social: 25, ticket: 6, capacity: 6, food: 60 },
  { id: 'pond', kind: 'fun', icon: '🐟', name: t('Пруд с мостками', 'Pond with a pier'), desc: t('Посидеть с удочкой у воды.', 'Sit by the water with a fishing rod.'), cost: 110, town: 1, fun: 26, social: 6, ticket: 0, capacity: 4 },
  { id: 'cattower', kind: 'fun', icon: '🗼', name: t('Башня-когтеточка', 'Scratching tower'), desc: t('Лазать, точить когти и прыгать с полки на полку.', 'Climb, scratch and jump from shelf to shelf.'), cost: 160, town: 2, fun: 34, social: 8, ticket: 3, capacity: 4 },
  { id: 'market', kind: 'fun', icon: '🛍️', name: t('Рынок', 'Market'), desc: t('Кошки покупают себе бантики, шарфы, очки и короны.', 'Cats buy bows, scarves, glasses and crowns.'), cost: 180, town: 1, fun: 10, social: 12, ticket: 0, capacity: 6 },
  { id: 'carousel', kind: 'fun', icon: '🎠', name: t('Карусель', 'Carousel'), desc: t('Весёлые лошадки-рыбки по кругу.', 'Merry fish-horses going round.'), cost: 260, town: 2, fun: 42, social: 10, ticket: 8, capacity: 6 },
  { id: 'cinema', kind: 'fun', icon: '🎬', name: t('Кинотеатр', 'Cinema'), desc: t('Мультики про птичек на большом экране.', 'Bird cartoons on the big screen.'), cost: 380, town: 3, fun: 50, social: 14, ticket: 12, capacity: 8 },
  { id: 'ash', kind: 'ash', icon: '🪨', name: t('Пепелище', 'Ashes'), desc: t('Здесь стоял дом, сгоревший от гнева богов. Расчистите место, чтобы строить снова.', 'A house burned here by the wrath of the gods. Clear it to build again.'), cost: 0, town: 99 },
];
export const buildingById = (id: BuildingId): BuildingDef => BUILDINGS.find((b) => b.id === id)!;
/** Сколько стоит расчистить пепелище. */
export const CLEAR_ASH = 15;
/** Сколько возвращается при сносе (доля цены). */
export const DEMOLISH_REFUND = 0.4;

// ─── Вещи ──────────────────────────────────────────────────────────────

export const CAT_ITEMS: ReadonlyArray<{ id: ItemId; icon: string; name: Txt; price: number; mood: number }> = [
  { id: 'bow', icon: '🎀', name: t('Бантик', 'Bow'), price: 25, mood: 2 },
  { id: 'bell', icon: '🔔', name: t('Ошейник с колокольчиком', 'Bell collar'), price: 30, mood: 2 },
  { id: 'flower', icon: '🌸', name: t('Цветок за ушком', 'Flower behind the ear'), price: 20, mood: 2 },
  { id: 'scarf', icon: '🧣', name: t('Шарфик', 'Scarf'), price: 45, mood: 3 },
  { id: 'glasses', icon: '👓', name: t('Очки', 'Glasses'), price: 55, mood: 3 },
  { id: 'backpack', icon: '🎒', name: t('Рюкзачок', 'Backpack'), price: 70, mood: 4 },
  { id: 'cape', icon: '🦸', name: t('Плащ', 'Cape'), price: 110, mood: 5 },
  { id: 'crown', icon: '👑', name: t('Корона', 'Crown'), price: 220, mood: 8 },
];
export const itemDef = (id: ItemId) => CAT_ITEMS.find((i) => i.id === id)!;

// ─── Кошки ─────────────────────────────────────────────────────────────

export const COATS: ReadonlyArray<{ id: Coat; name: Txt }> = [
  { id: 'ginger', name: t('рыжая', 'ginger') },
  { id: 'grey', name: t('серая полосатая', 'grey tabby') },
  { id: 'tuxedo', name: t('чёрная во фраке', 'tuxedo') },
  { id: 'white', name: t('белая', 'white') },
  { id: 'calico', name: t('трёхцветная', 'calico') },
  { id: 'siamese', name: t('сиамская', 'siamese') },
  { id: 'cream', name: t('кремовая', 'cream') },
  { id: 'brown', name: t('коричневая полосатая', 'brown tabby') },
  { id: 'blue', name: t('голубая', 'blue') },
  { id: 'black', name: t('чёрная', 'black') },
];

export const CAT_NAMES: readonly Txt[] = [
  t('Мурка', 'Murka'), t('Барсик', 'Barsik'), t('Пушок', 'Fluffy'), t('Луна', 'Luna'), t('Симба', 'Simba'), t('Тиша', 'Tisha'),
  t('Персик', 'Peach'), t('Оскар', 'Oscar'), t('Соня', 'Sonya'), t('Феликс', 'Felix'), t('Багира', 'Bagheera'), t('Кекс', 'Muffin'),
  t('Зефир', 'Marshmallow'), t('Булочка', 'Bun'), t('Уголёк', 'Ember'), t('Снежок', 'Snowball'), t('Ириска', 'Toffee'), t('Тигра', 'Tigger'),
  t('Пуговка', 'Button'), t('Рыжик', 'Rusty'), t('Масяня', 'Masya'), t('Котлета', 'Meatball'), t('Плюша', 'Plushy'), t('Черныш', 'Shadow'),
  t('Маркиз', 'Marquis'), t('Ромашка', 'Daisy'), t('Пельмень', 'Dumpling'), t('Кнопка', 'Pip'), t('Мармелад', 'Jelly'), t('Тимоша', 'Timmy'),
  t('Сырник', 'Cheesecake'), t('Вафля', 'Waffle'), t('Лапка', 'Paws'), t('Шарик', 'Bubble'), t('Ватрушка', 'Pastry'), t('Боня', 'Bonnie'),
  t('Карамелька', 'Caramel'), t('Дымок', 'Smokey'), t('Фунтик', 'Funtik'), t('Крошка', 'Crumb'), t('Гоша', 'Gosha'), t('Милка', 'Milka'),
];

/** Игровых дней в кошачьем году (для возраста). */
export const CAT_YEAR_DAYS = 30;

/** Потребности: на сколько в час падают (днём) и восстанавливаются. */
export const NEED_RATES = { food: 5, energy: 5, fun: 4, social: 3, sleepEnergy: 13, sleepFood: 2 } as const;
/** Еда дома: сколько стоит и насколько насыщает. */
export const MEAL = { price: 3, food: 55 } as const;

// ─── Подношение богам ──────────────────────────────────────────────────

/** Упражнения подношения и базовое число повторов (растёт с населением). */
export const OFFERING_POOL: ReadonlyArray<[ExerciseId, number]> = [
  ['squat', 15],
  ['lunge', 12],
  ['pushup', 8],
  ['situp', 15],
  ['jumping_jack', 30],
  ['high_knees', 30],
];
/** Сколько упражнений в подношении. */
export const OFFERING_SIZE = 3;
/** Награда за подношение (◈). */
export const OFFERING_REWARD = 40;
/** Доля жилых домов, которая сгорает без подношения (не меньше одного). */
export const FIRE_SHARE = 1 / 3;
/** Сколько реальных миллисекунд дом горит, прежде чем стать пеплом. */
export const FIRE_MS = 45_000;

/** Стартовые деньги игрока. */
export const START_GOLD = 150;
