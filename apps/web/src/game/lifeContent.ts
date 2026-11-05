import type { ExerciseId } from '../tracking/exercise';
import type { ActionDef, CatBreed, LifeEffect, NeedId, ObjectId, Txt } from './lifeTypes';

/**
 * Содержимое симулятора фитнес-тренера: две локации (свой дом и фитнес-зал),
 * предметы и мебель, уровни зала, упражнения для занятий, имена учеников,
 * действия и утренние события. Тексты — на двух языках.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

// ─── Предметы ──────────────────────────────────────────────────────────

/** Раздел магазина для дома: мебель, техника, декор. */
export type HomeKind = 'furniture' | 'tech' | 'decor';

export interface ObjectDef {
  id: ObjectId;
  icon: string;
  name: Txt;
  /** Продаётся в магазине (раздел «Дом»). */
  price?: number;
  desc?: Txt;
  kind?: HomeKind;
  /** Где стоит: у стены на полу (по умолчанию), на стене или где угодно (робот-пылесос). */
  mount?: 'slot' | 'wall' | 'floor' | 'free';
  /** Уют: замедляет падение отдыха и общения дома. */
  comfort?: number;
  /** Пассивно: во сколько раз медленнее падает потребность (0,2 — на 20%). */
  slows?: Partial<Record<NeedId, number>>;
}

export const OBJECTS: Record<ObjectId, ObjectDef> = {
  bed: { id: 'bed', icon: '🛏️', name: t('Кровать', 'Bed') },
  fridge: { id: 'fridge', icon: '🧊', name: t('Холодильник', 'Fridge') },
  stove: { id: 'stove', icon: '🍳', name: t('Плита', 'Stove') },
  shower: { id: 'shower', icon: '🚿', name: t('Душ', 'Shower') },
  sofa: { id: 'sofa', icon: '🛋️', name: t('Диван и телевизор', 'Sofa and TV') },
  door: { id: 'door', icon: '🚪', name: t('Входная дверь', 'Front door') },
  mirror: { id: 'mirror', icon: '🪞', name: t('Зеркало', 'Mirror') },
  computer: { id: 'computer', icon: '💻', name: t('Компьютер', 'Computer'), price: 450, desc: t('Онлайн-консультации, учёба и игры', 'Online coaching, study and games'), kind: 'tech' },
  bookshelf: { id: 'bookshelf', icon: '📚', name: t('Книжный шкаф', 'Bookshelf'), price: 200, desc: t('Книги о спорте и питании', 'Books on sport and nutrition'), kind: 'furniture' },
  yoga_mat: { id: 'yoga_mat', icon: '🧘', name: t('Коврик для йоги', 'Yoga mat'), price: 60, desc: t('Своя тренировка дома', 'Your own workout at home'), kind: 'furniture' },
  dumbbells: { id: 'dumbbells', icon: '🏋️', name: t('Стойка с гантелями', 'Dumbbell rack'), price: 300, desc: t('Силовые дома', 'Strength work at home'), kind: 'furniture' },
  coffee_machine: { id: 'coffee_machine', icon: '☕', name: t('Кофемашина', 'Coffee machine'), price: 180, desc: t('Бодрость перед занятиями', 'A boost before classes'), kind: 'tech' },
  console: { id: 'console', icon: '🎮', name: t('Игровая приставка', 'Game console'), price: 380, desc: t('Лучший отдых', 'The best way to unwind'), kind: 'tech' },
  piano: { id: 'piano', icon: '🎹', name: t('Пианино', 'Piano'), price: 900, desc: t('Творчество и настроение', 'Creativity and mood'), kind: 'furniture' },
  bathtub: { id: 'bathtub', icon: '🛁', name: t('Ванна', 'Bathtub'), price: 650, desc: t('Восстановление после занятий', 'Recovery after classes'), kind: 'furniture' },
  aquarium: { id: 'aquarium', icon: '🐠', name: t('Аквариум', 'Aquarium'), price: 350, desc: t('Спокойствие', 'Calm'), kind: 'decor' },
  easel: { id: 'easel', icon: '🎨', name: t('Мольберт', 'Easel'), price: 150, desc: t('Программы тренировок и рисование', 'Training plans and painting'), kind: 'furniture' },
  armchair: { id: 'armchair', icon: '🪑', name: t('Кресло для чтения', 'Reading armchair'), price: 220, desc: t('Уютный отдых с книгой', 'Cosy rest with a book'), comfort: 1, kind: 'furniture' },
  massage_chair: { id: 'massage_chair', icon: '💆', name: t('Массажное кресло', 'Massage chair'), price: 1200, desc: t('Восстанавливает силы после занятий', 'Restores energy after classes'), comfort: 1, kind: 'furniture' },
  treadmill: { id: 'treadmill', icon: '🏃', name: t('Беговая дорожка', 'Treadmill'), price: 800, desc: t('Кардио дома перед камерой', 'Cardio at home in front of the camera'), kind: 'tech' },
  punching_bag: { id: 'punching_bag', icon: '🥊', name: t('Боксёрская груша', 'Punching bag'), price: 350, desc: t('Сбросить стресс', 'Blow off steam'), kind: 'furniture' },
  big_tv: { id: 'big_tv', icon: '📺', name: t('Домашний кинотеатр', 'Home cinema'), price: 1500, desc: t('Большой экран и кресло-мешок', 'A huge screen and a bean bag'), comfort: 1, kind: 'tech' },
  smart_speaker: { id: 'smart_speaker', icon: '🔊', name: t('Умная колонка', 'Smart speaker'), price: 160, desc: t('Музыка и танцы', 'Music and dancing'), kind: 'tech' },
  blender: { id: 'blender', icon: '🥤', name: t('Блендер', 'Blender'), price: 120, desc: t('Протеиновые коктейли дома', 'Protein shakes at home'), kind: 'tech' },
  microwave: { id: 'microwave', icon: '♨️', name: t('Микроволновка', 'Microwave'), price: 140, desc: t('Быстрый горячий ужин', 'A quick hot dinner'), kind: 'tech' },
  vr_headset: { id: 'vr_headset', icon: '🥽', name: t('VR-шлем', 'VR headset'), price: 950, desc: t('Виртуальные миры и фитнес-игры', 'Virtual worlds and fitness games'), kind: 'tech' },
  robot_vacuum: { id: 'robot_vacuum', icon: '🤖', name: t('Робот-пылесос', 'Robot vacuum'), price: 500, desc: t('Сам убирает дом: гигиена падает медленнее', 'Cleans by itself: hygiene drops slower'), mount: 'free', slows: { hygiene: 0.25 }, kind: 'tech' },
  air_conditioner: { id: 'air_conditioner', icon: '❄️', name: t('Кондиционер', 'Air conditioner'), price: 700, desc: t('Прохлада: энергия тратится медленнее', 'Cool air: energy drains slower'), mount: 'wall', slows: { energy: 0.15 }, kind: 'tech' },
  painting: { id: 'painting', icon: '🖼️', name: t('Картина', 'Painting'), price: 180, desc: t('Яркий акцент на стене', 'A bright accent on the wall'), mount: 'wall', comfort: 2, kind: 'decor' },
  wall_clock: { id: 'wall_clock', icon: '🕰️', name: t('Настенные часы', 'Wall clock'), price: 90, desc: t('Тикают по игровому времени', 'Ticks with game time'), mount: 'wall', comfort: 1, kind: 'decor' },
  neon_sign: { id: 'neon_sign', icon: '💡', name: t('Неоновая вывеска', 'Neon sign'), price: 260, desc: t('«FIT» светится вечером', '“FIT” glows at night'), mount: 'wall', comfort: 2, kind: 'decor' },
  photo_wall: { id: 'photo_wall', icon: '📸', name: t('Стена с фото', 'Photo wall'), price: 120, desc: t('Фото с учениками', 'Photos with your clients'), mount: 'wall', comfort: 2, kind: 'decor' },
  house_plant: { id: 'house_plant', icon: '🪴', name: t('Монстера', 'Monstera'), price: 70, desc: t('Зелень в доме', 'Greenery at home'), mount: 'floor', comfort: 1, kind: 'decor' },
  floor_lamp: { id: 'floor_lamp', icon: '🛋️', name: t('Торшер', 'Floor lamp'), price: 150, desc: t('Тёплый свет по вечерам', 'Warm light in the evening'), mount: 'floor', comfort: 2, kind: 'decor' },
  flower_vase: { id: 'flower_vase', icon: '💐', name: t('Ваза с цветами', 'Vase of flowers'), price: 60, desc: t('Свежие цветы', 'Fresh flowers'), mount: 'floor', comfort: 1, kind: 'decor' },
  palm: { id: 'palm', icon: '🌴', name: t('Пальма в кадке', 'Potted palm'), price: 240, desc: t('Курорт дома', 'A resort at home'), mount: 'floor', comfort: 2, kind: 'decor' },
  cat: { id: 'cat', icon: '🐈', name: t('Кошка', 'Cat') },
  cat_bowl: { id: 'cat_bowl', icon: '🥣', name: t('Миски кошки', 'Cat bowls') },
  litter: { id: 'litter', icon: '🧻', name: t('Кошачий лоток', 'Litter box') },
  coach: { id: 'coach', icon: '📣', name: t('Место тренера', 'Coach’s spot') },
  reception: { id: 'reception', icon: '🛎️', name: t('Ресепшен', 'Reception') },
  gym_door: { id: 'gym_door', icon: '🚪', name: t('Выход', 'Exit') },
  gym_shower: { id: 'gym_shower', icon: '🚿', name: t('Душевая', 'Showers') },
  smoothie: { id: 'smoothie', icon: '🥤', name: t('Фитнес-бар', 'Fitness bar') },
};

/** Предметы, которые есть в доме всегда. */
export const HOME_OBJECTS: readonly ObjectId[] = ['bed', 'fridge', 'stove', 'shower', 'sofa', 'door', 'mirror'];
/** Всё для дома из магазина — в порядке показа. */
export const FURNITURE: readonly ObjectId[] = [
  // Мебель.
  'yoga_mat', 'easel', 'armchair', 'bookshelf', 'dumbbells', 'punching_bag', 'bathtub', 'piano', 'massage_chair',
  // Техника.
  'blender', 'microwave', 'smart_speaker', 'coffee_machine', 'console', 'computer', 'robot_vacuum', 'air_conditioner', 'treadmill', 'vr_headset', 'big_tv',
  // Декор.
  'flower_vase', 'house_plant', 'wall_clock', 'photo_wall', 'floor_lamp', 'painting', 'palm', 'neon_sign', 'aquarium',
];
/** Места в доме: у стен для мебели и техники, на стенах, на полу для декора. */
export const HOUSE_SLOTS = 12;
export const WALL_SLOTS = 5;
export const FLOOR_SLOTS = 5;
/** Где стоит предмет (у стены — по умолчанию). */
export const mountOf = (id: ObjectId): 'slot' | 'wall' | 'floor' | 'free' => OBJECTS[id].mount ?? 'slot';
export const slotsFor = (mount: 'slot' | 'wall' | 'floor' | 'free'): number => (mount === 'wall' ? WALL_SLOTS : mount === 'floor' ? FLOOR_SLOTS : mount === 'free' ? 1 : HOUSE_SLOTS);

// ─── Кошки ─────────────────────────────────────────────────────────────

export interface CatBreedDef {
  id: CatBreed;
  name: Txt;
  desc: Txt;
  price: number;
}

export const CAT_BREEDS: readonly CatBreedDef[] = [
  { id: 'ginger', name: t('Рыжий кот', 'Ginger tabby'), desc: t('Солнечный и вечно голодный.', 'Sunny and always hungry.'), price: 150 },
  { id: 'black', name: t('Чёрная кошка', 'Black cat'), desc: t('К удаче! Глаза как янтарь.', 'For luck! Amber eyes.'), price: 180 },
  { id: 'british', name: t('Британская короткошёрстная', 'British Shorthair'), desc: t('Плюшевая и невозмутимая.', 'Plush and unflappable.'), price: 420 },
  { id: 'siamese', name: t('Сиамская', 'Siamese'), desc: t('Разговорчивая, с голубыми глазами.', 'Chatty, with blue eyes.'), price: 450 },
  { id: 'scottish_fold', name: t('Скоттиш-фолд', 'Scottish Fold'), desc: t('Вислоухая и любопытная.', 'Folded ears, endless curiosity.'), price: 520 },
  { id: 'bengal', name: t('Бенгальская', 'Bengal'), desc: t('Леопардовые пятна и много энергии.', 'Leopard spots and lots of energy.'), price: 650 },
  { id: 'persian', name: t('Персидская', 'Persian'), desc: t('Пушистое облако, любит поспать.', 'A fluffy cloud that loves naps.'), price: 600 },
  { id: 'maine_coon', name: t('Мейн-кун', 'Maine Coon'), desc: t('Огромный ласковый великан с кисточками.', 'A huge gentle giant with ear tufts.'), price: 800 },
  { id: 'sphynx', name: t('Сфинкс', 'Sphynx'), desc: t('Тёплый, бархатный и без шерсти.', 'Warm, velvety and hairless.'), price: 750 },
];
export const catBreedById = (id: CatBreed): CatBreedDef => CAT_BREEDS.find((b) => b.id === id) ?? CAT_BREEDS[0]!;
export const MAX_CATS = 3;
/** Полная миска корма (порций): одна порция — одна кормёжка кошки. */
export const BOWL_MAX = 6;
/** С какой грязи лоток считается грязным: дома хуже гигиена и уют, кошкам неуютно. */
export const LITTER_DIRTY = 60;
/** Как быстро падают потребности кошки (в час игрового времени). */
export const CAT_RATES = { fed: 5, play: 4, toilet: 8 } as const;
/** Сколько воды (из 100) выпивает кошка за час игрового времени. */
export const WATER_RATE = 2.5;
export const CAT_NAMES: readonly Txt[] = [t('Мурка', 'Murka'), t('Барсик', 'Barsik'), t('Пушок', 'Fluffy'), t('Луна', 'Luna'), t('Симба', 'Simba'), t('Тиша', 'Tisha'), t('Персик', 'Peach'), t('Оскар', 'Oscar'), t('Соня', 'Sonya'), t('Феликс', 'Felix'), t('Багира', 'Bagheera'), t('Кекс', 'Muffin')];

// ─── Зал ───────────────────────────────────────────────────────────────

export interface GymDef {
  icon: string;
  name: Txt;
  desc: Txt;
  /** Сколько учеников вмещает. */
  cap: number;
  /** Множитель цены занятия. */
  mult: number;
  /** Цена улучшения до этого уровня и нужный уровень героя. */
  cost: number;
  level: number;
  /** Есть душевая / фитнес-бар. */
  shower: boolean;
  bar: boolean;
}

export const GYMS: readonly GymDef[] = [
  { icon: '🏚️', name: t('Гаражный зал', 'Garage gym'), desc: t('Коврики и пара гантелей.', 'A few mats and dumbbells.'), cap: 2, mult: 1, cost: 0, level: 1, shower: false, bar: false },
  { icon: '🏠', name: t('Зал у дома', 'Neighbourhood gym'), desc: t('Стойка, скамьи и душевая.', 'A rack, benches and showers.'), cap: 4, mult: 1.3, cost: 600, level: 3, shower: true, bar: false },
  { icon: '🏢', name: t('Фитнес-студия', 'Fitness studio'), desc: t('Беговые дорожки и фитнес-бар.', 'Treadmills and a fitness bar.'), cap: 6, mult: 1.7, cost: 1800, level: 6, shower: true, bar: true },
  { icon: '🏟️', name: t('Фитнес-клуб', 'Fitness club'), desc: t('Тренажёры и ринг.', 'Machines and a ring.'), cap: 8, mult: 2.2, cost: 4500, level: 9, shower: true, bar: true },
  { icon: '🌟', name: t('Премиум-центр', 'Premium centre'), desc: t('Лучший зал города.', 'The best gym in town.'), cap: 10, mult: 3, cost: 10000, level: 12, shower: true, bar: true },
];

/** Часы работы зала [с, до). */
export const GYM_HOURS: [number, number] = [6, 23];

// ─── Занятия ───────────────────────────────────────────────────────────

/** Упражнения для групповых занятий и базовое число повторов. */
export const SESSION_EXERCISES: ReadonlyArray<[ExerciseId, number]> = [
  ['squat', 12],
  ['lunge', 10],
  ['pushup', 8],
  ['situp', 12],
  ['jumping_jack', 30],
  ['high_knees', 30],
];

/** Имена учеников (по фигуре). */
export const CLIENT_NAMES: Record<'male' | 'female', readonly Txt[]> = {
  male: [t('Борис', 'Boris'), t('Олег', 'Oleg'), t('Артём', 'Artem'), t('Игорь', 'Igor'), t('Виктор', 'Victor'), t('Денис', 'Denis'), t('Павел', 'Pavel'), t('Руслан', 'Ruslan'), t('Тимур', 'Timur'), t('Глеб', 'Gleb')],
  female: [t('Тамара', 'Tamara'), t('Ольга', 'Olga'), t('Света', 'Sveta'), t('Ника', 'Nika'), t('Алина', 'Alina'), t('Вера', 'Vera'), t('Даша', 'Dasha'), t('Кира', 'Kira'), t('Лиза', 'Liza'), t('Яна', 'Yana')],
};

// ─── Действия ──────────────────────────────────────────────────────────

const fx = (e: LifeEffect): LifeEffect => e;

export const ACTIONS: readonly ActionDef[] = [
  // Дом.
  { id: 'sleep', icon: '😴', label: t('Спать до утра', 'Sleep till morning'), at: 'bed', minutes: 480, sleep: true, effect: fx({}) },
  { id: 'nap', icon: '💤', label: t('Вздремнуть', 'Take a nap'), at: 'bed', minutes: 90, sleep: true, effect: fx({}) },
  { id: 'snack', icon: '🥪', label: t('Перекусить', 'Grab a snack'), at: 'fridge', minutes: 15, requires: { groceries: 1 }, effect: fx({ needs: { food: 30 }, groceries: -1 }) },
  { id: 'groceries', icon: '🛒', label: t('Заказать продукты (×5)', 'Order groceries (×5)'), at: 'fridge', minutes: 30, cost: 30, effect: fx({ groceries: 5 }) },
  { id: 'order', icon: '🛵', label: t('Заказать фастфуд', 'Order fast food'), at: 'fridge', minutes: 40, cost: 18, effect: fx({ needs: { food: 60, fun: 6 }, fat: 0.02 }) },
  { id: 'cook', icon: '🍲', label: t('Приготовить ужин', 'Cook a meal'), at: 'stove', minutes: 60, requires: { groceries: 1 }, effect: fx({ needs: { food: 70, fun: 6 }, groceries: -1, skills: { cooking: 12 } }) },
  { id: 'cook_fit', icon: '🥗', label: t('Спортивное меню', 'Athlete’s meal'), at: 'stove', minutes: 75, requires: { groceries: 2, skill: ['cooking', 2] }, effect: fx({ needs: { food: 85, fun: 10, energy: 10 }, groceries: -2, fat: -0.01, skills: { cooking: 16 } }) },
  { id: 'shower', icon: '🚿', label: t('Принять душ', 'Take a shower'), at: 'shower', minutes: 20, effect: fx({ needs: { hygiene: 100, energy: 5 } }) },
  { id: 'tv', icon: '📺', label: t('Смотреть сериал', 'Watch a show'), at: 'sofa', minutes: 60, effect: fx({ needs: { fun: 22, energy: 3 }, fat: 0.003 }) },
  { id: 'relax', icon: '🛋️', label: t('Отдохнуть на диване', 'Relax on the sofa'), at: 'sofa', minutes: 30, effect: fx({ needs: { energy: 8, fun: 6 } }) },
  { id: 'call', icon: '📱', label: t('Позвонить друзьям', 'Call friends'), at: 'sofa', minutes: 30, effect: fx({ needs: { social: 25, fun: 5 }, skills: { charisma: 3 } }) },
  { id: 'pose', icon: '🪞', label: t('Отрепетировать речь тренера', 'Rehearse your coach talk'), at: 'mirror', minutes: 30, effect: fx({ needs: { fun: 3 }, skills: { charisma: 10 } }) },
  { id: 'go_gym', icon: '🏋️', label: t('Поехать в зал', 'Go to the gym'), at: 'door', minutes: 30, go: 'gym', effect: fx({}) },
  { id: 'consult', icon: '💻', label: t('Онлайн-консультация', 'Online consultation'), at: 'computer', minutes: 90, effect: fx({ money: 45, needs: { fun: -6, energy: -8, social: 8 }, skills: { charisma: 6, logic: 4 } }) },
  { id: 'study', icon: '🎓', label: t('Курс по спортивной медицине', 'Sports medicine course'), at: 'computer', minutes: 90, effect: fx({ needs: { fun: -6, energy: -8 }, skills: { logic: 18 } }) },
  { id: 'games', icon: '🕹️', label: t('Поиграть', 'Play games'), at: 'computer', minutes: 60, effect: fx({ needs: { fun: 25, energy: -4 } }) },
  { id: 'read', icon: '📖', label: t('Почитать о питании', 'Read about nutrition'), at: 'bookshelf', minutes: 60, effect: fx({ needs: { fun: 8 }, skills: { cooking: 6, logic: 10 } }) },
  { id: 'yoga', icon: '🧘', label: t('Своя тренировка (камера)', 'Own workout (camera)'), at: 'yoga_mat', minutes: 30, train: true, effect: fx({ needs: { fun: 10, energy: -5 } }) },
  { id: 'lift', icon: '🏋️', label: t('Силовая (камера)', 'Strength (camera)'), at: 'dumbbells', minutes: 45, train: true, effect: fx({ needs: { fun: 8, energy: -10, hygiene: -15 } }) },
  { id: 'espresso', icon: '☕', label: t('Сварить эспрессо', 'Brew an espresso'), at: 'coffee_machine', minutes: 5, effect: fx({ needs: { energy: 18, fun: 3 } }) },
  { id: 'console', icon: '🎮', label: t('Партия в приставку', 'Console session'), at: 'console', minutes: 60, effect: fx({ needs: { fun: 35, energy: -5 } }) },
  { id: 'piano', icon: '🎹', label: t('Играть на пианино', 'Play the piano'), at: 'piano', minutes: 60, effect: fx({ needs: { fun: 18 }, skills: { creativity: 16 } }) },
  { id: 'bath', icon: '🛁', label: t('Ванна с солью', 'Salt bath'), at: 'bathtub', minutes: 60, effect: fx({ needs: { hygiene: 100, fun: 18, energy: 15 } }) },
  { id: 'fish', icon: '🐠', label: t('Смотреть на рыбок', 'Watch the fish'), at: 'aquarium', minutes: 20, effect: fx({ needs: { fun: 12, energy: 4 } }) },
  { id: 'paint', icon: '🎨', label: t('Рисовать', 'Paint'), at: 'easel', minutes: 90, effect: fx({ needs: { fun: 14 }, skills: { creativity: 18 } }) },
  { id: 'plan', icon: '📝', label: t('Составить программу тренировок', 'Write a training plan'), at: 'easel', minutes: 60, requires: { skill: ['creativity', 2] }, effect: fx({ needs: { fun: 6 }, loyalty: 6, skills: { creativity: 8, logic: 6 } }) },
  { id: 'armchair_read', icon: '📖', label: t('Почитать в кресле', 'Read in the armchair'), at: 'armchair', minutes: 45, effect: fx({ needs: { fun: 14, energy: 6 }, skills: { logic: 8 } }) },
  { id: 'massage', icon: '💆', label: t('Массаж', 'Massage'), at: 'massage_chair', minutes: 30, effect: fx({ needs: { energy: 22, fun: 10 } }) },
  { id: 'treadmill_run', icon: '🏃', label: t('Пробежка (камера)', 'Run (camera)'), at: 'treadmill', minutes: 30, train: true, effect: fx({ needs: { fun: 8, energy: -8, hygiene: -15 } }) },
  { id: 'boxing', icon: '🥊', label: t('Побоксировать', 'Hit the bag'), at: 'punching_bag', minutes: 30, effect: fx({ needs: { fun: 16, energy: -10, hygiene: -12 }, fat: -0.004 }) },
  { id: 'cinema', icon: '🍿', label: t('Кино на большом экране', 'Movie on the big screen'), at: 'big_tv', minutes: 120, effect: fx({ needs: { fun: 45, energy: 6 }, fat: 0.003 }) },
  { id: 'dance', icon: '💃', label: t('Потанцевать под музыку', 'Dance to music'), at: 'smart_speaker', minutes: 30, effect: fx({ needs: { fun: 18, energy: -6 }, fat: -0.002, skills: { creativity: 4 } }) },
  { id: 'shake', icon: '🥤', label: t('Протеиновый коктейль', 'Protein shake'), at: 'blender', minutes: 10, requires: { groceries: 1 }, effect: fx({ needs: { food: 40, energy: 10 }, groceries: -1 }) },
  { id: 'microwave_meal', icon: '♨️', label: t('Разогреть ужин', 'Heat up dinner'), at: 'microwave', minutes: 10, requires: { groceries: 1 }, effect: fx({ needs: { food: 55 }, groceries: -1 }) },
  { id: 'vr', icon: '🥽', label: t('VR-приключение', 'VR adventure'), at: 'vr_headset', minutes: 60, effect: fx({ needs: { fun: 40, energy: -6 } }) },
  { id: 'pet_cat', icon: '🤲', label: t('Погладить кошку', 'Pet the cat'), at: 'cat', minutes: 10, effect: fx({ needs: { fun: 12, social: 10 }, catPlay: 12 }) },
  { id: 'play_cat', icon: '🧶', label: t('Поиграть с кошкой', 'Play with the cat'), at: 'cat', minutes: 20, effect: fx({ needs: { fun: 22, social: 8, energy: -4 }, catPlay: 45 }) },
  { id: 'feed_cat', icon: '🐟', label: t('Угостить кошку', 'Give the cat a treat'), at: 'cat', minutes: 5, cost: 5, effect: fx({ needs: { fun: 6, social: 6 }, catFed: 25, catPlay: 5 }) },
  { id: 'call_cat', icon: '📣', label: t('Позвать кошку', 'Call the cat'), at: 'cat', minutes: 2, effect: fx({ needs: { social: 2 }, catPlay: 3 }) },
  { id: 'fill_bowl', icon: '🥣', label: t('Насыпать корм и налить воды', 'Fill the food and water bowls'), at: 'cat_bowl', minutes: 5, cost: 8, effect: fx({ bowl: BOWL_MAX, water: 100 }) },
  { id: 'clean_litter', icon: '🧹', label: t('Убрать лоток', 'Clean the litter box'), at: 'litter', minutes: 10, effect: fx({ litter: -100, needs: { hygiene: -3 } }) },
  // Зал.
  { id: 'session', icon: '📣', label: t('Провести занятие', 'Run a class'), at: 'coach', minutes: 0, open: 'session', effect: fx({}) },
  { id: 'own_workout', icon: '💪', label: t('Своя тренировка (камера)', 'Own workout (camera)'), at: 'coach', minutes: 45, train: true, effect: fx({ needs: { fun: 10, energy: -8, hygiene: -15 } }) },
  { id: 'gym_info', icon: '🛎️', label: t('Зал и ученики', 'Gym and clients'), at: 'reception', minutes: 0, open: 'gym', effect: fx({}) },
  { id: 'chat_clients', icon: '💬', label: t('Поболтать с учениками', 'Chat with clients'), at: 'coach', minutes: 20, effect: fx({ needs: { social: 12, fun: 4, energy: -2 }, loyalty: 1, skills: { charisma: 3 } }) },
  { id: 'ads', icon: '📢', label: t('Раздать флаеры', 'Hand out flyers'), at: 'reception', minutes: 60, cost: 20, effect: fx({ needs: { social: 15, energy: -6 }, loyalty: 3, skills: { charisma: 8 } }) },
  { id: 'go_home', icon: '🏠', label: t('Поехать домой', 'Go home'), at: 'gym_door', minutes: 30, go: 'home', effect: fx({}) },
  { id: 'gym_shower', icon: '🚿', label: t('Душ после занятий', 'Post-class shower'), at: 'gym_shower', minutes: 15, effect: fx({ needs: { hygiene: 100 } }) },
  { id: 'smoothie', icon: '🥤', label: t('Протеиновый коктейль', 'Protein shake'), at: 'smoothie', minutes: 10, cost: 7, effect: fx({ needs: { food: 35, energy: 12 } }) },
  { id: 'salad', icon: '🥗', label: t('Фитнес-салат', 'Fitness salad'), at: 'smoothie', minutes: 20, cost: 10, effect: fx({ needs: { food: 55, fun: 5 }, fat: -0.005 }) },
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
  /** Нужен хотя бы один ученик. */
  needsClients?: boolean;
  choices: LifeEventChoice[];
}

export const LIFE_EVENTS: readonly LifeEventDef[] = [
  {
    id: 'friend',
    icon: '🤝',
    title: t('Сарафанное радио', 'Word of mouth'),
    text: t('Ученик рассказал о вас другу, и тот хочет прийти на пробное занятие.', 'A client told a friend about you, and they want a trial class.'),
    needsClients: true,
    choices: [
      { id: 'yes', label: t('Пригласить', 'Invite them'), text: t('В группе новый человек — если хватит места в зале.', 'A new face in the group — if the gym has room.'), effect: { client: true, needs: { social: 10 } } },
      { id: 'later', label: t('Позже', 'Later'), text: t('Друг подождёт следующего набора.', 'The friend will wait for the next intake.'), effect: { loyalty: 2 } },
    ],
  },
  {
    id: 'broken',
    icon: '🔧',
    title: t('Поломка', 'Breakdown'),
    text: t('В зале сломался тренажёр, ученики недовольны.', 'A machine broke at the gym, and clients are unhappy.'),
    needsClients: true,
    choices: [
      { id: 'fix', label: t('Вызвать мастера', 'Call a technician'), cost: 50, text: t('Всё починили до занятия.', 'Fixed before class.'), effect: { loyalty: 3 } },
      { id: 'skip', label: t('Обойтись без него', 'Work around it'), text: t('Пару дней без тренажёра — ученики ворчат.', 'A couple of days without it — clients grumble.'), effect: { loyalty: -8 } },
    ],
  },
  {
    id: 'blogger',
    icon: '📹',
    title: t('Блогер', 'A blogger'),
    text: t('Фитнес-блогер хочет снять ваше занятие для своего канала.', 'A fitness blogger wants to film your class for their channel.'),
    choices: [
      { id: 'yes', label: t('Согласиться', 'Agree'), text: t('Ролик набрал просмотры — о вас заговорили.', 'The video took off — people are talking about you.'), effect: { loyalty: 8, money: 40, skills: { charisma: 10 } } },
      { id: 'no', label: t('Отказаться', 'Decline'), text: t('Спокойный день без камер.', 'A calm day without cameras.'), effect: { needs: { fun: 5 } } },
    ],
  },
  {
    id: 'sponsor',
    icon: '🧃',
    title: t('Спонсор', 'A sponsor'),
    text: t('Производитель спортпита предлагает рекламу в зале.', 'A sports nutrition brand offers to advertise in your gym.'),
    choices: [
      { id: 'take', label: t('Взять деньги', 'Take the money'), text: t('Реклама висит, деньги на счёте.', 'The ad is up, the money is in.'), effect: { money: 80, loyalty: -3 } },
      { id: 'samples', label: t('Попросить пробники для учеников', 'Ask for samples for clients'), text: t('Ученики в восторге от подарков.', 'Clients love the freebies.'), effect: { loyalty: 6 } },
    ],
  },
  {
    id: 'bad_sleep',
    icon: '🌙',
    title: t('Беспокойная ночь', 'A restless night'),
    text: t('Соседская собака лаяла всю ночь.', 'The neighbour’s dog barked all night.'),
    choices: [
      { id: 'coffee', label: t('Двойной кофе', 'A double coffee'), text: t('Глаза открылись, но ненадолго.', 'Eyes open, though not for long.'), effect: { needs: { energy: 15, fun: -5 } } },
      { id: 'stretch', label: t('Зарядка', 'Morning stretch'), text: t('Зарядка разогнала сонливость.', 'Stretching chased the drowsiness away.'), effect: { needs: { energy: 10, fun: 5 }, fat: -0.005 } },
    ],
  },
  {
    id: 'cake',
    icon: '🎂',
    title: t('Торт от ученицы', 'A cake from a client'),
    text: t('Ученица испекла торт в благодарность за результат.', 'A client baked a cake to thank you for her results.'),
    needsClients: true,
    choices: [
      { id: 'eat', label: t('Съесть кусочек', 'Have a slice'), text: t('Вкусно! Но это лишние калории.', 'Delicious! But extra calories.'), effect: { needs: { food: 30, fun: 15 }, fat: 0.02, loyalty: 4 } },
      { id: 'share', label: t('Угостить всю группу', 'Share it with the group'), text: t('Чаепитие после занятия сплотило группу.', 'Tea after class brought the group together.'), effect: { needs: { social: 20 }, loyalty: 6 } },
    ],
  },
  {
    id: 'found_money',
    icon: '💵',
    title: t('Находка', 'A lucky find'),
    text: t('В раздевалке кто-то забыл конверт с деньгами.', 'Someone left an envelope of cash in the locker room.'),
    choices: [
      { id: 'return', label: t('Найти владельца', 'Find the owner'), text: t('Владелец нашёлся — о вашей честности узнали все.', 'The owner turned up — everyone heard about your honesty.'), effect: { loyalty: 6, needs: { fun: 5 } } },
      { id: 'box', label: t('Отдать на ресепшен', 'Leave it at reception'), text: t('Конверт ждёт владельца.', 'The envelope awaits its owner.'), effect: { needs: { fun: 2 } } },
    ],
  },
];

export const lifeEventById = (id: string): LifeEventDef | undefined => LIFE_EVENTS.find((e) => e.id === id);
