import type { Appearance } from './state';
import type { ActionDef, HomeId, JobId, LifeEffect, LocationId, ObjectId, PersonActionDef, PersonId, SkillId, Txt } from './lifeTypes';
import type { Slot } from './items';

/**
 * Содержимое симулятора жизни: места города, предметы квартиры, мебель, жильё,
 * профессии, жители города, действия и случайные события. Тексты — на двух языках.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

// ─── Город ─────────────────────────────────────────────────────────────

export interface LocationDef {
  id: LocationId;
  icon: string;
  name: Txt;
  /** Часы работы [с, до); до может быть больше 24 (ночью). Нет — всегда. */
  hours?: [number, number];
  /** Положение двери на улице (x). */
  x: number;
  color: string;
}

export const LOCATIONS: Record<LocationId, LocationDef> = {
  park: { id: 'park', icon: '🌳', name: t('Парк', 'Park'), x: -66, color: '#3f7a3a' },
  gym: { id: 'gym', icon: '🏋️', name: t('Фитнес-клуб', 'Gym'), hours: [6, 23], x: -46, color: '#c0392b' },
  realty: { id: 'realty', icon: '🏢', name: t('Агентство недвижимости', 'Real estate agency'), hours: [9, 19], x: -31, color: '#5d6d7e' },
  furniture: { id: 'furniture', icon: '🛋️', name: t('Мебельный', 'Furniture store'), hours: [9, 21], x: -18, color: '#a0522d' },
  home: { id: 'home', icon: '🏠', name: t('Мой дом', 'My home'), x: 0, color: '#d8c3a5' },
  market: { id: 'market', icon: '🛒', name: t('Супермаркет', 'Supermarket'), hours: [7, 23], x: 16, color: '#27ae60' },
  cafe: { id: 'cafe', icon: '☕', name: t('Кофейня', 'Café'), hours: [7, 22], x: 30, color: '#b9770e' },
  office: { id: 'office', icon: '💼', name: t('Бизнес-центр', 'Office tower'), hours: [8, 20], x: 46, color: '#2e86c1' },
  mall: { id: 'mall', icon: '🛍️', name: t('Торговый центр', 'Mall'), hours: [10, 22], x: 63, color: '#8e44ad' },
  studio: { id: 'studio', icon: '📸', name: t('Фотостудия', 'Photo studio'), hours: [10, 20], x: 79, color: '#e84393' },
  club: { id: 'club', icon: '🪩', name: t('Ночной клуб', 'Night club'), hours: [20, 28], x: 95, color: '#6c3483' },
};
export const LOCATION_IDS = Object.keys(LOCATIONS) as LocationId[];

// ─── Квартира ──────────────────────────────────────────────────────────

export interface ObjectDef {
  id: ObjectId;
  icon: string;
  name: Txt;
  /** Покупается в мебельном (базовые предметы есть в любой квартире). */
  price?: number;
  /** Минимальное жильё, где помещается. */
  minHome?: HomeId;
  desc?: Txt;
}

export const OBJECTS: Record<ObjectId, ObjectDef> = {
  bed: { id: 'bed', icon: '🛏️', name: t('Кровать', 'Bed') },
  fridge: { id: 'fridge', icon: '🧊', name: t('Холодильник', 'Fridge') },
  stove: { id: 'stove', icon: '🍳', name: t('Плита', 'Stove') },
  shower: { id: 'shower', icon: '🚿', name: t('Душ', 'Shower') },
  sofa: { id: 'sofa', icon: '🛋️', name: t('Диван и телевизор', 'Sofa and TV') },
  door: { id: 'door', icon: '🚪', name: t('Входная дверь', 'Front door') },
  mirror: { id: 'mirror', icon: '🪞', name: t('Зеркало', 'Mirror') },
  computer: { id: 'computer', icon: '💻', name: t('Компьютер', 'Computer'), price: 450, desc: t('Подработка, учёба и игры', 'Side gigs, study and games') },
  bookshelf: { id: 'bookshelf', icon: '📚', name: t('Книжный шкаф', 'Bookshelf'), price: 200, desc: t('Чтение развивает логику', 'Reading builds logic') },
  yoga_mat: { id: 'yoga_mat', icon: '🧘', name: t('Коврик для йоги', 'Yoga mat'), price: 60, desc: t('Тренировки дома', 'Workouts at home') },
  dumbbells: { id: 'dumbbells', icon: '🏋️', name: t('Стойка с гантелями', 'Dumbbell rack'), price: 300, desc: t('Силовые тренировки дома', 'Strength workouts at home') },
  coffee_machine: { id: 'coffee_machine', icon: '☕', name: t('Кофемашина', 'Coffee machine'), price: 180, desc: t('Бодрящий кофе без похода в кафе', 'A boost without going out') },
  console: { id: 'console', icon: '🎮', name: t('Игровая приставка', 'Game console'), price: 380, minHome: 'flat', desc: t('Лучший отдых', 'The best way to unwind') },
  piano: { id: 'piano', icon: '🎹', name: t('Пианино', 'Piano'), price: 900, minHome: 'loft', desc: t('Творчество и настроение', 'Creativity and mood') },
  bathtub: { id: 'bathtub', icon: '🛁', name: t('Ванна', 'Bathtub'), price: 650, minHome: 'flat', desc: t('Чистота и отдых сразу', 'Clean and relaxed at once') },
  aquarium: { id: 'aquarium', icon: '🐠', name: t('Аквариум', 'Aquarium'), price: 350, minHome: 'flat', desc: t('Спокойствие', 'Calm') },
  easel: { id: 'easel', icon: '🎨', name: t('Мольберт', 'Easel'), price: 150, desc: t('Рисование развивает творчество', 'Painting builds creativity') },
};

/** Предметы, которые есть в любой квартире. */
export const BASE_OBJECTS: readonly ObjectId[] = ['bed', 'fridge', 'stove', 'shower', 'sofa', 'door', 'mirror'];
/** Мебель из магазина в порядке показа. */
export const FURNITURE: readonly ObjectId[] = ['yoga_mat', 'easel', 'coffee_machine', 'bookshelf', 'dumbbells', 'aquarium', 'console', 'computer', 'bathtub', 'piano'];

export interface HomeDef {
  id: HomeId;
  icon: string;
  name: Txt;
  /** Аренда за неделю (7 игровых дней). */
  rent: number;
  /** Сколько купленной мебели помещается. */
  slots: number;
  /** Уют: потребность «отдых» падает медленнее. */
  comfort: number;
}

export const HOMES: Record<HomeId, HomeDef> = {
  studio: { id: 'studio', icon: '🏚️', name: t('Студия', 'Studio'), rent: 120, slots: 3, comfort: 0 },
  flat: { id: 'flat', icon: '🏠', name: t('Квартира', 'Apartment'), rent: 320, slots: 5, comfort: 0.1 },
  loft: { id: 'loft', icon: '🏙️', name: t('Лофт', 'Loft'), rent: 750, slots: 7, comfort: 0.2 },
  penthouse: { id: 'penthouse', icon: '🌆', name: t('Пентхаус', 'Penthouse'), rent: 1600, slots: 10, comfort: 0.3 },
};
export const HOME_IDS: readonly HomeId[] = ['studio', 'flat', 'loft', 'penthouse'];

// ─── Работа ────────────────────────────────────────────────────────────

export interface JobLevel {
  title: Txt;
  /** Оплата за смену. */
  pay: number;
  /** Требования к должности. */
  skill?: [SkillId, number];
  /** Средний уровень характеристик (тренировки перед камерой). */
  fitness?: number;
  /** Привлекательность 0…100. */
  looks?: number;
}

export interface JobDef {
  id: JobId;
  icon: string;
  name: Txt;
  desc: Txt;
  location: LocationId;
  /** Начало смены не раньше и конец не позже (часы). */
  hours: [number, number];
  /** Длина смены, минуты. */
  shift: number;
  /** Смен до повышения (при выполненных требованиях). */
  promoteAfter: number;
  /** Навык, который растёт на работе. */
  grows: SkillId;
  levels: JobLevel[];
}

export const JOBS: Record<JobId, JobDef> = {
  barista: {
    id: 'barista',
    icon: '☕',
    name: t('Кофейня', 'Café'),
    desc: t('Лёгкий старт: смены по 6 часов, общение с гостями.', 'An easy start: 6-hour shifts, lots of guests.'),
    location: 'cafe',
    hours: [7, 22],
    shift: 360,
    promoteAfter: 4,
    grows: 'charisma',
    levels: [
      { title: t('Бариста', 'Barista'), pay: 70 },
      { title: t('Старший бариста', 'Senior barista'), pay: 95, skill: ['charisma', 2] },
      { title: t('Управляющий кофейней', 'Café manager'), pay: 140, skill: ['charisma', 4] },
      { title: t('Владелец сети кофеен', 'Coffee chain owner'), pay: 230, skill: ['charisma', 6] },
    ],
  },
  office: {
    id: 'office',
    icon: '💼',
    name: t('Офис', 'Office'),
    desc: t('Смены по 8 часов; растёт логика, растёт и зарплата.', '8-hour shifts; logic grows and so does the pay.'),
    location: 'office',
    hours: [8, 20],
    shift: 480,
    promoteAfter: 5,
    grows: 'logic',
    levels: [
      { title: t('Стажёр', 'Intern'), pay: 80 },
      { title: t('Специалист', 'Specialist'), pay: 130, skill: ['logic', 2] },
      { title: t('Руководитель отдела', 'Team lead'), pay: 210, skill: ['logic', 4] },
      { title: t('Директор', 'Director'), pay: 330, skill: ['logic', 6] },
      { title: t('Генеральный директор', 'CEO'), pay: 500, skill: ['logic', 8] },
    ],
  },
  trainer: {
    id: 'trainer',
    icon: '🏋️',
    name: t('Фитнес-тренер', 'Fitness coach'),
    desc: t('Растёт только с вашей настоящей формой: тренируйтесь перед камерой.', 'Grows only with your real fitness: train in front of the camera.'),
    location: 'gym',
    hours: [6, 23],
    shift: 360,
    promoteAfter: 4,
    grows: 'charisma',
    levels: [
      { title: t('Помощник тренера', 'Assistant coach'), pay: 85, fitness: 2 },
      { title: t('Тренер', 'Coach'), pay: 140, fitness: 4 },
      { title: t('Старший тренер', 'Head coach'), pay: 220, fitness: 6, skill: ['charisma', 3] },
      { title: t('Звезда фитнеса', 'Fitness star'), pay: 380, fitness: 9, skill: ['charisma', 5] },
    ],
  },
  model: {
    id: 'model',
    icon: '📸',
    name: t('Модель', 'Model'),
    desc: t('Съёмки по 4 часа; нужны внешность, форма и обаяние.', '4-hour shoots; looks, fitness and charm matter.'),
    location: 'studio',
    hours: [10, 20],
    shift: 240,
    promoteAfter: 4,
    grows: 'charisma',
    levels: [
      { title: t('Модель каталогов', 'Catalog model'), pay: 110, looks: 45 },
      { title: t('Модель рекламы', 'Commercial model'), pay: 190, looks: 55, fitness: 3 },
      { title: t('Подиумная модель', 'Runway model'), pay: 320, looks: 65, fitness: 5, skill: ['charisma', 4] },
      { title: t('Топ-модель', 'Top model'), pay: 520, looks: 78, fitness: 7, skill: ['charisma', 6] },
    ],
  },
};
export const JOB_IDS = Object.keys(JOBS) as JobId[];

// ─── Жители города ─────────────────────────────────────────────────────

export interface PersonDef {
  id: PersonId;
  icon: string;
  name: Txt;
  role: Txt;
  bio: Txt;
  color: string;
  appearance: Appearance;
  equipped: Partial<Record<Slot, string>>;
  /** Где бывает: место и часы [с, до). */
  schedule: Array<[LocationId, number, number]>;
  /** Реплики при встрече: неприязнь, знакомые, друзья, близкие. */
  lines: [Txt, Txt, Txt, Txt];
  /** Что любит (подарок или совместное занятие — сильнее радует). */
  likes: Txt;
}

const look = (a: Partial<Appearance>): Appearance => ({ figure: 'male', skin: 1, hair: 'short', hairColor: 1, beard: false, eyes: 0, ...a });

export const PEOPLE: Record<PersonId, PersonDef> = {
  alex: {
    id: 'alex',
    icon: '☕',
    name: t('Алекс', 'Alex'),
    role: t('Бариста', 'Barista'),
    bio: t('Знает всех постоянных гостей по имени и рисует сердечки на капучино.', 'Knows every regular by name and draws hearts on cappuccinos.'),
    color: '#b9770e',
    appearance: look({ skin: 2, hair: 'curly', hairColor: 0, beard: true, eyes: 1 }),
    equipped: { head: 'beanie', body: 'button_shirt', legs: 'jeans', feet: 'sneakers', weapon: 'coffee_cup', hands: 'wrist_watch' },
    schedule: [['cafe', 8, 17], ['park', 17, 20], ['club', 22, 25]],
    lines: [
      t('Кофе сам себе налей.', 'Pour your own coffee.'),
      t('О, снова вы! Как обычно?', 'Oh, you again! The usual?'),
      t('Для своих — двойная пенка. Как день?', 'Double foam for friends. How was your day?'),
      t('Я берёг для тебя лучшее зерно. И вечер свободен.', 'I saved the best beans for you. And my evening is free.'),
    ],
    likes: t('кофе и прогулки', 'coffee and walks'),
  },
  mia: {
    id: 'mia',
    icon: '💪',
    name: t('Мия', 'Mia'),
    role: t('Фитнес-тренер', 'Fitness coach'),
    bio: t('Ведёт утренние группы и верит, что любое утро начинается с приседаний.', 'Runs morning classes and believes every morning starts with squats.'),
    color: '#e74c3c',
    appearance: look({ figure: 'female', skin: 1, hair: 'ponytail', hairColor: 2, eyes: 2, body: { muscle: 0.6, weight: -0.3 } }),
    equipped: { head: 'headband', body: 'sports_bra', legs: 'yoga_leggings', feet: 'running_shoes', hands: 'fitness_tracker', weapon: 'water_bottle' },
    schedule: [['gym', 7, 15], ['park', 16, 19], ['cafe', 19, 21]],
    lines: [
      t('Сначала разминка, потом разговоры.', 'Warm-up first, talk later.'),
      t('Привет! Сегодня тренировались?', 'Hi! Did you train today?'),
      t('Классная форма! Видно, что занимаетесь.', 'Great shape! I can tell you train.'),
      t('С тобой даже бёрпи — свидание.', 'With you even burpees feel like a date.'),
    ],
    likes: t('совместные тренировки', 'training together'),
  },
  dan: {
    id: 'dan',
    icon: '💻',
    name: t('Дэн', 'Dan'),
    role: t('Программист', 'Programmer'),
    bio: t('Пишет игры по ночам, а днём чинит чужой код в бизнес-центре.', 'Writes games at night and fixes other people’s code by day.'),
    color: '#2e86c1',
    appearance: look({ skin: 0, hair: 'short', hairColor: 3, eyes: 0, body: { weight: 0.2 } }),
    equipped: { head: 'headphones', body: 'hoodie', legs: 'cargo_pants', feet: 'sneakers', back: 'mini_backpack', neck: 'lanyard_badge' },
    schedule: [['office', 9, 18], ['cafe', 18, 20], ['club', 21, 25]],
    lines: [
      t('Я занят. Очень.', 'I’m busy. Very.'),
      t('Привет. Код компилируется — можно поболтать.', 'Hi. Code’s compiling, so I can chat.'),
      t('Смотри, что я собрал! Хочешь протестировать?', 'Look what I built! Want to play-test it?'),
      t('Ты — лучшее, что случилось с моим расписанием.', 'You’re the best thing that ever happened to my schedule.'),
    ],
    likes: t('игры и умные разговоры', 'games and smart talk'),
  },
  sofia: {
    id: 'sofia',
    icon: '🎨',
    name: t('София', 'Sofia'),
    role: t('Художница', 'Artist'),
    bio: t('Рисует город с натуры и продаёт картины прямо в парке.', 'Paints the city from life and sells her work right in the park.'),
    color: '#16a085',
    appearance: look({ figure: 'female', skin: 3, hair: 'curly', hairColor: 0, eyes: 1 }),
    equipped: { head: 'beret', body: 'crop_top', legs: 'pleated_skirt', feet: 'platform_sneakers', back: 'crossbody_bag', hands: 'bead_bracelets' },
    schedule: [['park', 10, 15], ['cafe', 15, 19], ['club', 22, 26]],
    lines: [
      t('Вы загораживаете мне свет.', 'You’re blocking my light.'),
      t('Привет! Нравится закат на холсте?', 'Hi! Like the sunset on the canvas?'),
      t('Я нарисовала тебя на заднем плане. Не против?', 'I painted you in the background. Do you mind?'),
      t('Хочу написать твой портрет. Только твой.', 'I want to paint your portrait. Only yours.'),
    ],
    likes: t('искусство и прогулки', 'art and walks'),
  },
  max: {
    id: 'max',
    icon: '🎧',
    name: t('Макс', 'Max'),
    role: t('Диджей', 'DJ'),
    bio: t('Звезда ночного клуба: днём качается, ночью ставит пластинки.', 'The club’s star: lifts by day, spins records by night.'),
    color: '#8e44ad',
    appearance: look({ skin: 4, hair: 'buzz', hairColor: 0, eyes: 1, beard: true, body: { muscle: 0.8 } }),
    equipped: { head: 'sunglasses', body: 'tank_top', legs: 'leather_pants', feet: 'combat_boots', neck: 'neck_headphones', back: 'leather_jacket' },
    schedule: [['gym', 13, 17], ['club', 21, 28]],
    lines: [
      t('Фейсконтроль не прошли.', 'You didn’t pass the door check.'),
      t('Йо! Как музыка?', 'Yo! How’s the music?'),
      t('Для тебя — место у пульта.', 'For you, a spot by the decks.'),
      t('Следующий трек — для тебя.', 'Next track is for you.'),
    ],
    likes: t('музыку и танцы', 'music and dancing'),
  },
  eva: {
    id: 'eva',
    icon: '📸',
    name: t('Ева', 'Eva'),
    role: t('Модель', 'Model'),
    bio: t('Снимается для журналов и знает все модные места города.', 'Shoots for magazines and knows every trendy place in town.'),
    color: '#e84393',
    appearance: look({ figure: 'female', skin: 0, hair: 'long', hairColor: 3, eyes: 2, body: { weight: -0.4, legs: 0.5 } }),
    equipped: { head: 'sunglasses', body: 'halter_top', legs: 'mini_skirt', feet: 'high_heels', neck: 'pearl_necklace', offhand: 'handbag' },
    schedule: [['studio', 10, 16], ['mall', 16, 19], ['club', 22, 27]],
    lines: [
      t('Без записи не общаюсь.', 'No appointment, no talk.'),
      t('Милый образ. Где брали?', 'Cute look. Where did you get it?'),
      t('Пойдём на шопинг? Я знаю скидки.', 'Shopping? I know where the sales are.'),
      t('С тобой я забываю про камеры.', 'With you I forget about the cameras.'),
    ],
    likes: t('шопинг и комплименты', 'shopping and compliments'),
  },
  rita: {
    id: 'rita',
    icon: '📖',
    name: t('Рита', 'Rita'),
    role: t('Соседка, студентка', 'Neighbour, student'),
    bio: t('Учится на врача, бегает по утрам и вечно занимает сахар.', 'Studies medicine, runs every morning and keeps borrowing sugar.'),
    color: '#f39c12',
    appearance: look({ figure: 'female', skin: 2, hair: 'bob', hairColor: 1, eyes: 0 }),
    equipped: { head: 'sports_cap', body: 'basic_tee', legs: 'gym_shorts', feet: 'running_shoes', back: 'gym_backpack', weapon: 'phone' },
    schedule: [['park', 7, 9], ['market', 17, 19], ['park', 12, 15]],
    lines: [
      t('Сахар больше не прошу. Довольны?', 'I won’t ask for sugar anymore. Happy?'),
      t('Привет, сосед! Не одолжишь соль?', 'Hi, neighbour! Got some salt?'),
      t('Бежим завтра вместе? Ты отлично держишь темп.', 'Run together tomorrow? You keep a great pace.'),
      t('Знаешь, я переехала бы поближе. Ещё ближе.', 'You know, I’d move closer. Even closer.'),
    ],
    likes: t('бег и сладкое', 'running and sweets'),
  },
};
export const PERSON_IDS = Object.keys(PEOPLE) as PersonId[];

export const TIER_NAME: readonly Txt[] = [t('Неприязнь', 'Dislike'), t('Знакомые', 'Acquainted'), t('Друзья', 'Friends'), t('Близкие', 'Close')];
export const tierOf = (aff: number): 0 | 1 | 2 | 3 => (aff < 0 ? 0 : aff < 3 ? 1 : aff < 6 ? 2 : 3);

export const PERSON_ACTIONS: readonly PersonActionDef[] = [
  { id: 'talk', icon: '💬', label: t('Поболтать', 'Chat'), minutes: 20, success: { needs: { social: 18, fun: 4 }, aff: 1, skills: { charisma: 4 } } },
  { id: 'joke', icon: '😄', label: t('Пошутить', 'Tell a joke'), minutes: 10, check: 0.55, success: { needs: { social: 10, fun: 10 }, aff: 1, skills: { charisma: 6 } }, fail: { needs: { social: 4, fun: -4 }, aff: -1, skills: { charisma: 2 } } },
  { id: 'compliment', icon: '🌷', label: t('Сделать комплимент', 'Pay a compliment'), minutes: 5, check: 0.6, success: { needs: { social: 8 }, aff: 1, skills: { charisma: 4 } }, fail: { needs: { social: 3 }, aff: 0 } },
  { id: 'gift', icon: '🎁', label: t('Подарить подарок', 'Give a gift'), minutes: 10, cost: 35, minAff: 0, success: { needs: { social: 10, fun: 5 }, aff: 2 } },
  { id: 'coffee', icon: '☕', label: t('Угостить кофе', 'Buy them a coffee'), minutes: 40, cost: 12, minAff: 1, where: ['cafe'], success: { needs: { social: 22, energy: 10, fun: 8 }, aff: 1 } },
  { id: 'train', icon: '🏋️', label: t('Потренироваться вместе', 'Train together'), minutes: 60, minAff: 1, where: ['gym', 'park'], train: true, success: { needs: { social: 20, fun: 12, energy: -15, hygiene: -20 }, aff: 2, fat: -0.02 } },
  { id: 'dance', icon: '💃', label: t('Потанцевать', 'Dance'), minutes: 60, minAff: 1, where: ['club'], success: { needs: { social: 25, fun: 25, energy: -15 }, aff: 1, skills: { charisma: 6 } } },
  { id: 'flirt', icon: '😉', label: t('Флиртовать', 'Flirt'), minutes: 15, minAff: 3, check: 0.45, success: { needs: { social: 15, fun: 12 }, aff: 2, skills: { charisma: 8 } }, fail: { needs: { fun: -6 }, aff: -1, skills: { charisma: 3 } } },
  { id: 'date', icon: '🌹', label: t('Позвать на свидание', 'Ask on a date'), minutes: 150, cost: 60, minAff: 5, where: ['cafe', 'club', 'park'], check: 0.6, success: { needs: { social: 40, fun: 35, food: 20 }, aff: 2 }, fail: { needs: { social: 10, fun: -10 }, aff: -1 } },
  { id: 'romance', icon: '💞', label: t('Предложить встречаться', 'Ask to be together'), minutes: 20, minAff: 8, partner: false, check: 0.7, romance: true, success: { needs: { social: 30, fun: 30 }, aff: 1 }, fail: { needs: { fun: -15 }, aff: -2 } },
  { id: 'hug', icon: '🤗', label: t('Обнять', 'Hug'), minutes: 5, partner: true, success: { needs: { social: 15, fun: 10 }, aff: 1 } },
  { id: 'kiss', icon: '💋', label: t('Поцеловать', 'Kiss'), minutes: 5, partner: true, success: { needs: { social: 15, fun: 15 }, aff: 1 } },
];

// ─── Действия ──────────────────────────────────────────────────────────

const obj = (object: ObjectId) => ({ object });
const loc = (location: LocationId) => ({ location });
const fx = (e: LifeEffect): LifeEffect => e;

export const ACTIONS: readonly ActionDef[] = [
  // Дом.
  { id: 'sleep', icon: '😴', label: t('Спать до утра', 'Sleep till morning'), at: obj('bed'), minutes: 480, sleep: true, effect: fx({ needs: { energy: 100 } }) },
  { id: 'nap', icon: '💤', label: t('Вздремнуть', 'Take a nap'), at: obj('bed'), minutes: 90, sleep: true, effect: fx({ needs: { energy: 20 } }) },
  { id: 'snack', icon: '🥪', label: t('Перекусить', 'Grab a snack'), at: obj('fridge'), minutes: 15, requires: { groceries: 1 }, effect: fx({ needs: { food: 30 }, groceries: -1 }) },
  { id: 'cook', icon: '🍲', label: t('Приготовить ужин', 'Cook a meal'), at: obj('stove'), minutes: 60, requires: { groceries: 1 }, effect: fx({ needs: { food: 70, fun: 6 }, groceries: -1, skills: { cooking: 12 } }) },
  { id: 'cook_fancy', icon: '🍝', label: t('Блюдо от шефа', 'Chef’s dish'), at: obj('stove'), minutes: 90, requires: { groceries: 2, skill: ['cooking', 3] }, effect: fx({ needs: { food: 90, fun: 18 }, groceries: -2, skills: { cooking: 18 } }) },
  { id: 'order', icon: '🛵', label: t('Заказать доставку', 'Order delivery'), at: obj('fridge'), minutes: 40, cost: 18, effect: fx({ needs: { food: 60 }, fat: 0.01 }) },
  { id: 'shower', icon: '🚿', label: t('Принять душ', 'Take a shower'), at: obj('shower'), minutes: 20, effect: fx({ needs: { hygiene: 100, energy: 5 } }) },
  { id: 'tv', icon: '📺', label: t('Смотреть сериал', 'Watch a show'), at: obj('sofa'), minutes: 60, effect: fx({ needs: { fun: 22, energy: 3 }, fat: 0.003 }) },
  { id: 'relax', icon: '🛋️', label: t('Отдохнуть на диване', 'Relax on the sofa'), at: obj('sofa'), minutes: 30, effect: fx({ needs: { energy: 8, fun: 6 } }) },
  { id: 'call', icon: '📱', label: t('Позвонить другу', 'Call a friend'), at: obj('sofa'), minutes: 30, effect: fx({ needs: { social: 25, fun: 5 }, skills: { charisma: 3 } }) },
  { id: 'pose', icon: '🪞', label: t('Репетировать улыбку', 'Practise your smile'), at: obj('mirror'), minutes: 30, effect: fx({ needs: { fun: 3 }, skills: { charisma: 10 } }) },
  { id: 'go_out', icon: '🏙️', label: t('Выйти в город', 'Go out'), at: obj('door'), minutes: 10, go: 'city', effect: fx({}) },
  { id: 'gig', icon: '💻', label: t('Подработка онлайн', 'Online gig'), at: obj('computer'), minutes: 120, effect: fx({ money: 45, needs: { fun: -8, energy: -10 }, skills: { logic: 8 } }) },
  { id: 'study', icon: '🎓', label: t('Онлайн-курс', 'Online course'), at: obj('computer'), minutes: 90, effect: fx({ needs: { fun: -6, energy: -8 }, skills: { logic: 18 } }) },
  { id: 'games', icon: '🕹️', label: t('Поиграть', 'Play games'), at: obj('computer'), minutes: 60, effect: fx({ needs: { fun: 25, energy: -4 } }) },
  { id: 'read', icon: '📖', label: t('Почитать', 'Read a book'), at: obj('bookshelf'), minutes: 60, effect: fx({ needs: { fun: 8 }, skills: { logic: 12, creativity: 4 } }) },
  { id: 'yoga', icon: '🧘', label: t('Йога (камера)', 'Yoga (camera)'), at: obj('yoga_mat'), minutes: 30, train: true, effect: fx({ needs: { fun: 10, energy: -5 }, fat: -0.01 }) },
  { id: 'lift', icon: '🏋️', label: t('Силовая (камера)', 'Strength (camera)'), at: obj('dumbbells'), minutes: 45, train: true, effect: fx({ needs: { fun: 8, energy: -10, hygiene: -15 }, fat: -0.015 }) },
  { id: 'espresso', icon: '☕', label: t('Сварить эспрессо', 'Brew an espresso'), at: obj('coffee_machine'), minutes: 5, effect: fx({ needs: { energy: 18, fun: 3 } }) },
  { id: 'console', icon: '🎮', label: t('Партия в приставку', 'Console session'), at: obj('console'), minutes: 60, effect: fx({ needs: { fun: 35, energy: -5 } }) },
  { id: 'piano', icon: '🎹', label: t('Играть на пианино', 'Play the piano'), at: obj('piano'), minutes: 60, effect: fx({ needs: { fun: 18 }, skills: { creativity: 16 } }) },
  { id: 'bath', icon: '🛁', label: t('Ванна с пеной', 'Bubble bath'), at: obj('bathtub'), minutes: 60, effect: fx({ needs: { hygiene: 100, fun: 18, energy: 10 } }) },
  { id: 'fish', icon: '🐠', label: t('Смотреть на рыбок', 'Watch the fish'), at: obj('aquarium'), minutes: 20, effect: fx({ needs: { fun: 12, energy: 4 } }) },
  { id: 'paint', icon: '🎨', label: t('Рисовать', 'Paint'), at: obj('easel'), minutes: 90, effect: fx({ needs: { fun: 14 }, skills: { creativity: 18 } }) },
  { id: 'sell_art', icon: '🖼️', label: t('Продать картину онлайн', 'Sell a painting online'), at: obj('easel'), minutes: 120, requires: { skill: ['creativity', 3] }, effect: fx({ money: 90, needs: { fun: 6 }, skills: { creativity: 8 } }) },

  // Город.
  { id: 'go_home', icon: '🏠', label: t('Пойти домой', 'Go home'), at: loc('home'), minutes: 10, go: 'home', effect: fx({}) },
  { id: 'groceries', icon: '🛒', label: t('Купить продукты (×5)', 'Buy groceries (×5)'), at: loc('market'), minutes: 30, cost: 30, effect: fx({ groceries: 5 }) },
  { id: 'ready_meal', icon: '🍱', label: t('Готовая еда', 'Ready meal'), at: loc('market'), minutes: 20, cost: 9, effect: fx({ needs: { food: 45 }, fat: 0.005 }) },
  { id: 'cafe_coffee', icon: '☕', label: t('Выпить кофе', 'Have a coffee'), at: loc('cafe'), minutes: 20, cost: 5, effect: fx({ needs: { energy: 20, fun: 5, social: 5 } }) },
  { id: 'cafe_lunch', icon: '🥗', label: t('Пообедать', 'Have lunch'), at: loc('cafe'), minutes: 45, cost: 16, effect: fx({ needs: { food: 70, fun: 8, social: 10 } }) },
  { id: 'dessert', icon: '🍰', label: t('Десерт', 'Dessert'), at: loc('cafe'), minutes: 20, cost: 8, effect: fx({ needs: { food: 20, fun: 15 }, fat: 0.015 }) },
  { id: 'gym_workout', icon: '🏋️', label: t('Тренировка (камера)', 'Workout (camera)'), at: loc('gym'), minutes: 60, cost: 10, train: true, effect: fx({ needs: { fun: 12, energy: -12, hygiene: -25, social: 8 }, fat: -0.02 }) },
  { id: 'gym_shower', icon: '🚿', label: t('Душ в клубе', 'Club shower'), at: loc('gym'), minutes: 15, effect: fx({ needs: { hygiene: 100 } }) },
  { id: 'jog', icon: '🏃', label: t('Пробежка (камера)', 'Jog (camera)'), at: loc('park'), minutes: 40, train: true, effect: fx({ needs: { fun: 14, energy: -12, hygiene: -20 }, fat: -0.02 }) },
  { id: 'walk', icon: '🚶', label: t('Прогуляться', 'Take a walk'), at: loc('park'), minutes: 45, effect: fx({ needs: { fun: 15, energy: -4, social: 5 }, fat: -0.004 }) },
  { id: 'picnic', icon: '🧺', label: t('Пикник', 'Picnic'), at: loc('park'), minutes: 60, requires: { groceries: 1, hours: [9, 20] }, effect: fx({ needs: { food: 40, fun: 20 }, groceries: -1 }) },
  { id: 'dance', icon: '💃', label: t('Танцевать', 'Dance'), at: loc('club'), minutes: 90, cost: 15, effect: fx({ needs: { fun: 35, social: 30, energy: -18, hygiene: -10 }, fat: -0.006, skills: { charisma: 6 } }) },
  { id: 'cocktail', icon: '🍹', label: t('Коктейль у бара', 'Cocktail at the bar'), at: loc('club'), minutes: 30, cost: 12, effect: fx({ needs: { fun: 15, social: 15 } }) },
  { id: 'browse', icon: '🛍️', label: t('Магазины одежды', 'Clothes shops'), at: loc('mall'), minutes: 30, open: 'shop', effect: fx({ needs: { fun: 8 } }) },
  { id: 'food_court', icon: '🍔', label: t('Фуд-корт', 'Food court'), at: loc('mall'), minutes: 30, cost: 11, effect: fx({ needs: { food: 60, fun: 5 }, fat: 0.012 }) },
  { id: 'furniture', icon: '🛋️', label: t('Выбрать мебель', 'Choose furniture'), at: loc('furniture'), minutes: 20, open: 'furniture', effect: fx({}) },
  { id: 'realty', icon: '🏢', label: t('Варианты жилья', 'Housing options'), at: loc('realty'), minutes: 20, open: 'realty', effect: fx({}) },
  { id: 'job_board', icon: '📋', label: t('Вакансии', 'Job openings'), at: loc('office'), minutes: 10, open: 'jobs', effect: fx({}) },
  { id: 'photoshoot', icon: '📸', label: t('Фотосессия для себя', 'Personal photoshoot'), at: loc('studio'), minutes: 60, cost: 40, effect: fx({ needs: { fun: 20 }, skills: { charisma: 10, creativity: 6 } }) },
  // Смены (место — у профессии; одно действие на каждое место работы).
  { id: 'work_cafe', icon: '☕', label: t('Выйти на смену', 'Start a shift'), at: loc('cafe'), minutes: 0, work: true, effect: fx({}) },
  { id: 'work_office', icon: '💼', label: t('Выйти на смену', 'Start a shift'), at: loc('office'), minutes: 0, work: true, effect: fx({}) },
  { id: 'work_gym', icon: '🏋️', label: t('Провести тренировки', 'Coach a shift'), at: loc('gym'), minutes: 0, work: true, effect: fx({}) },
  { id: 'work_studio', icon: '📸', label: t('Съёмка', 'Photo shoot'), at: loc('studio'), minutes: 0, work: true, effect: fx({}) },
];

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((a) => a.id === id);

// ─── Случайные события (утром) ─────────────────────────────────────────

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
  /** {person} — имя знакомого персонажа. */
  text: Txt;
  /** Нужен знакомый персонаж (с отношением не ниже). */
  person?: number;
  /** Только при наличии работы. */
  needsJob?: boolean;
  choices: LifeEventChoice[];
}

export const LIFE_EVENTS: readonly LifeEventDef[] = [
  {
    id: 'found_money',
    icon: '💵',
    title: t('Находка', 'A lucky find'),
    text: t('У подъезда лежит конверт с деньгами. Ни имени, ни адреса.', 'An envelope of cash lies by the entrance. No name, no address.'),
    choices: [
      { id: 'keep', label: t('Оставить себе', 'Keep it'), text: t('Приятный бонус к бюджету.', 'A nice boost to the budget.'), effect: { money: 40, needs: { fun: 5 } } },
      { id: 'return', label: t('Отнести консьержу', 'Hand it to the concierge'), text: t('Хозяйка нашлась и угостила вас пирогом.', 'The owner turned up and treated you to a pie.'), effect: { needs: { food: 30, fun: 10, social: 15 }, skills: { charisma: 10 } } },
    ],
  },
  {
    id: 'leak',
    icon: '💧',
    title: t('Потоп', 'A flood'),
    text: t('Сосед сверху забыл закрыть кран, и с потолка капает.', 'The upstairs neighbour left the tap on, and the ceiling is dripping.'),
    choices: [
      { id: 'fix', label: t('Вызвать мастера', 'Call a plumber'), cost: 40, text: t('Мастер всё починил за час.', 'The plumber fixed it in an hour.'), effect: { needs: { fun: -3 } } },
      { id: 'self', label: t('Починить самому', 'Fix it yourself'), text: t('Получилось, но вы промокли до нитки.', 'It worked, but you got soaked.'), effect: { needs: { hygiene: -40, energy: -15 }, skills: { logic: 6 } } },
    ],
  },
  {
    id: 'party_invite',
    icon: '🎉',
    title: t('Приглашение', 'An invitation'),
    text: t('{person} зовёт на вечеринку у друзей.', '{person} invites you to a party at a friend’s place.'),
    person: 1,
    choices: [
      { id: 'go', label: t('Пойти', 'Go'), text: t('Отличный вечер! Вы познакомились с кучей людей.', 'A great evening! You met lots of people.'), effect: { needs: { fun: 30, social: 40, energy: -20 }, aff: 1, skills: { charisma: 8 } } },
      { id: 'skip', label: t('Остаться дома', 'Stay home'), text: t('Тихий вечер — тоже отдых.', 'A quiet evening is rest too.'), effect: { needs: { energy: 10 }, aff: -1 } },
    ],
  },
  {
    id: 'sale',
    icon: '🏷️',
    title: t('Распродажа', 'A sale'),
    text: t('В торговом центре скидки, а в кармане — купон на продукты.', 'The mall is having a sale, and you have a grocery coupon.'),
    choices: [
      { id: 'food', label: t('Забрать продукты', 'Get groceries'), text: t('Холодильник полон.', 'The fridge is full.'), effect: { groceries: 4 } },
      { id: 'sell', label: t('Продать купон', 'Sell the coupon'), text: t('Пара монет никогда не лишняя.', 'A few coins never hurt.'), effect: { money: 20 } },
    ],
  },
  {
    id: 'bad_sleep',
    icon: '🌙',
    title: t('Беспокойная ночь', 'A restless night'),
    text: t('Под окнами всю ночь шумела стройка.', 'Construction work kept you up all night.'),
    choices: [
      { id: 'coffee', label: t('Выпить двойной кофе', 'Have a double coffee'), text: t('Глаза открылись, но ненадолго.', 'Eyes open, though not for long.'), effect: { needs: { energy: 15, fun: -5 } } },
      { id: 'stretch', label: t('Сделать зарядку', 'Do some stretching'), text: t('Зарядка разогнала сонливость.', 'Stretching chased the drowsiness away.'), effect: { needs: { energy: 10, fun: 5 }, fat: -0.005 } },
    ],
  },
  {
    id: 'compliment_street',
    icon: '😊',
    title: t('Комплимент', 'A compliment'),
    text: t('Незнакомец на улице сказал, что вы отлично выглядите.', 'A stranger in the street said you look great.'),
    choices: [
      { id: 'thanks', label: t('Поблагодарить', 'Say thanks'), text: t('Настроение — на высоте.', 'Your mood is sky-high.'), effect: { needs: { fun: 15, social: 10 }, skills: { charisma: 5 } } },
      { id: 'number', label: t('Спросить номер', 'Ask for their number'), text: t('Номер не дали, но улыбнулись.', 'No number, but a smile.'), effect: { needs: { fun: 8 }, skills: { charisma: 10 } } },
    ],
  },
  {
    id: 'friend_help',
    icon: '📦',
    title: t('Просьба друга', 'A friend’s request'),
    text: t('{person} переезжает и просит помочь с коробками.', '{person} is moving and asks for help with the boxes.'),
    person: 2,
    choices: [
      { id: 'help', label: t('Помочь', 'Help out'), text: t('Тяжело, но весело. Друзья такое помнят.', 'Heavy but fun. Friends remember this.'), effect: { needs: { energy: -25, social: 30, hygiene: -20 }, aff: 2, fat: -0.01 } },
      { id: 'decline', label: t('Сослаться на дела', 'Say you’re busy'), text: t('Обиделись, но поймут.', 'A little hurt, but they’ll understand.'), effect: { aff: -1 } },
    ],
  },
  {
    id: 'bonus',
    icon: '🎊',
    needsJob: true,
    title: t('Премия', 'A bonus'),
    text: t('Начальство отметило вашу работу.', 'The boss noticed your work.'),
    choices: [
      { id: 'save', label: t('Отложить', 'Save it'), text: t('Копилка стала толще.', 'Your savings grew.'), effect: { money: 60 } },
      { id: 'treat', label: t('Устроить себе праздник', 'Treat yourself'), text: t('Праздник удался!', 'What a celebration!'), effect: { money: 20, needs: { fun: 30, food: 30 } } },
    ],
  },
];

export const lifeEventById = (id: string): LifeEventDef | undefined => LIFE_EVENTS.find((e) => e.id === id);
