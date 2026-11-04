import { NPC_BOSS_CHOICES, NPC_EVENTS } from './storyNpcs';
import type { Choice, CompanionId, EventDef, Faction, MonsterId, Txt } from './storyTypes';

/**
 * Содержимое режима истории: регионы, спутники, титулы и события.
 * События выбираются случайно (с учётом региона, флагов и спутников), а решения
 * игрока ставят флаги, меняют репутацию и открывают продолжения.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

export interface RegionDef {
  id: string;
  icon: string;
  name: Txt;
  intro: Txt;
}

export const REGIONS: readonly RegionDef[] = [
  { id: 'forest', icon: '🌲', name: t('Шепчущий лес', 'Whispering Forest'), intro: t('Тропа уходит под своды вековых деревьев. Где-то воет волк.', 'The path disappears under ancient trees. Somewhere a wolf howls.') },
  { id: 'mountains', icon: '⛰️', name: t('Грозовые горы', 'Thunder Peaks'), intro: t('Холодный ветер, узкие уступы и гром над перевалом.', 'Cold wind, narrow ledges and thunder over the pass.') },
  { id: 'swamp', icon: '🌫️', name: t('Туманные топи', 'Misty Marsh'), intro: t('Туман скрывает тропу, под ногами чавкает трясина.', 'Fog hides the path, the bog squelches underfoot.') },
  { id: 'desert', icon: '🏜️', name: t('Солнечная пустыня', 'Sunscorch Desert'), intro: t('Раскалённые дюны до горизонта и миражи в мареве.', 'Scorching dunes to the horizon and mirages in the haze.') },
  { id: 'citadel', icon: '🏰', name: t('Цитадель Тени', 'Shadow Citadel'), intro: t('Чёрные башни цитадели. Здесь закончится ваш путь.', 'The black towers of the citadel. Your journey ends here.') },
];

/** Сколько обычных событий в регионе до его хранителя. */
export const REGION_STEPS = 6;

export const FACTION_NAME: Record<Faction, Txt> = {
  forest: t('Лесной народ', 'Forest folk'),
  guild: t('Гильдия торговцев', 'Merchant guild'),
  order: t('Орден стражей', 'Order of Wardens'),
};

export interface CompanionDef {
  icon: string;
  name: Txt;
  perk: Txt;
  /** Прибавка к шансу проверок по характеристикам. */
  bonus: Partial<Record<'strength' | 'legs' | 'core' | 'endurance', number>>;
}

export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  wolf: { icon: '🐺', name: t('Серый волк', 'Grey wolf'), perk: t('+15% к ловкости и выносливости', '+15% to agility and endurance checks'), bonus: { legs: 0.15, endurance: 0.15 } },
  squire: { icon: '🛡️', name: t('Оруженосец Тим', 'Tim the squire'), perk: t('+15% к проверкам силы', '+15% to strength checks'), bonus: { strength: 0.15 } },
  fairy: { icon: '🧚', name: t('Фея Искра', 'Spark the fairy'), perk: t('+15% к собранности, лечит на привале', '+15% to focus checks, heals at camp'), bonus: { core: 0.15 } },
  golem: { icon: '🗿', name: t('Голем Валун', 'Boulder the golem'), perk: t('+10% к силе и собранности', '+10% to strength and focus'), bonus: { strength: 0.1, core: 0.1 } },
};

export const MAX_COMPANIONS = 3;

export const STORY_TITLES: Record<string, Txt> = {
  forest_friend: t('Друг леса', 'Friend of the Forest'),
  pass_breaker: t('Покоритель перевала', 'Pass Breaker'),
  marsh_walker: t('Ходящий по топям', 'Marsh Walker'),
  dune_runner: t('Бегущий по дюнам', 'Dune Runner'),
  legend: t('Легенда', 'Legend'),
  peacemaker: t('Миротворец', 'Peacemaker'),
  ballad: t('Герой баллад', 'Hero of Ballads'),
  outlaw: t('Вне закона', 'Outlaw'),
  wrestler: t('Борец пустыни', 'Desert Wrestler'),
  frog_friend: t('Лягушачий рыцарь', 'Frog Knight'),
};

/** Названия флагов, которые открывают варианты выбора. */
export const FLAG_NAME: Record<string, Txt> = {
  outlaw: t('слава разбойника', 'outlaw reputation'),
  hero: t('слава героя', 'hero\'s fame'),
  rumor: t('слух о тайной тропе', 'rumor of a hidden trail'),
  blessed: t('благословение', 'blessing'),
  cursed: t('проклятие', 'curse'),
};

const NPC: readonly Txt[] = [t('Мирон', 'Miron'), t('Агата', 'Agatha'), t('Бран', 'Bran'), t('Ясна', 'Yasna'), t('Корвин', 'Corvin'), t('Лада', 'Lada')];

const ok = (ru: string, en: string, effect: EventDef['choices'][number]['success']['effect']) => ({ text: t(ru, en), effect });

// ─── События в любом регионе ───────────────────────────────────────────

const GENERIC: EventDef[] = [
  {
    id: 'merchant',
    icon: '🧳',
    title: t('Торговец на тропе', 'Roadside merchant'),
    text: t('Странствующий торговец {npc} раскладывает товары у дороги и хитро улыбается.', 'A travelling merchant named {npc} lays out goods by the road with a sly smile.'),
    vars: { npc: NPC },
    choices: [
      { id: 'buy', label: t('Купить припасы', 'Buy supplies'), cost: 50, success: ok('Свежий хлеб и мази — силы возвращаются.', 'Fresh bread and salves — your strength returns.', { resolve: 3, rep: { guild: 1 } }) },
      {
        id: 'talk',
        label: t('Расспросить о дороге', 'Ask about the road'),
        success: ok('Торговец шепчет о тайной тропе впереди.', 'The merchant whispers about a hidden trail ahead.', { flag: ['rumor'], rep: { guild: 1 } }),
      },
      {
        id: 'rob',
        label: t('Отобрать товар', 'Take the goods by force'),
        check: { stat: 'strength', diff: 3 },
        success: ok('Торговец убегает, бросив кошель. Гильдия этого не забудет.', 'The merchant flees, dropping his purse. The guild will remember this.', { gold: 80, flag: ['outlaw'], rep: { guild: -2 }, title: 'outlaw' }),
        fail: ok('Торговец оказался крепким малым и дал отпор.', 'The merchant turned out to be tough and fought back.', { resolve: -2, rep: { guild: -1 } }),
      },
    ],
  },
  {
    id: 'campfire',
    icon: '🔥',
    title: t('Старое кострище', 'An old campfire'),
    text: t('Вечереет. Под раскидистым деревом — следы чужого костра и сухие дрова.', 'Evening falls. Under a wide tree are the remains of a campfire and dry wood.'),
    choices: [
      { id: 'rest', label: t('Отдохнуть у огня', 'Rest by the fire'), success: ok('Тёплая ночь у костра — вы набрались сил.', 'A warm night by the fire restores you.', { resolve: 2 }) },
      {
        id: 'train',
        label: t('Размяться перед сном', 'Work out before sleep'),
        trial: { exercise: 'pushup', reps: 10 },
        success: ok('Тело горит, голова ясная. Отличная тренировка!', 'Your body burns, your mind is clear. Great workout!', { resolve: 3, xp: 60 }),
        fail: ok('Вы задремали, так и не размявшись.', 'You dozed off without training.', {}),
      },
      {
        id: 'search',
        label: t('Обыскать окрестности', 'Search the area'),
        check: { stat: 'endurance', diff: 2 },
        success: ok('В дупле спрятан мешочек монет!', 'A pouch of coins was hidden in a hollow!', { gold: 50 }),
        fail: ok('Вы блуждали в темноте и подвернули ногу.', 'You wandered in the dark and twisted an ankle.', { resolve: -1 }),
      },
    ],
  },
  {
    id: 'cart',
    icon: '🛒',
    title: t('Перевёрнутая повозка', 'An overturned cart'),
    text: t('{npc} застрял под опрокинутой повозкой и зовёт на помощь.', '{npc} is pinned under an overturned cart and calls for help.'),
    vars: { npc: NPC },
    choices: [
      {
        id: 'lift',
        label: t('Поднять повозку', 'Lift the cart'),
        trial: { exercise: 'squat', reps: 15 },
        success: ok('Повозка поднята! Спасённый щедро благодарит, а молва о вас бежит впереди.', 'The cart is up! The grateful traveller rewards you, and word of your deed spreads.', { gold: 40, rep: { order: 1 }, flag: ['hero'] }),
        fail: ok('Вы ушли за подмогой, но вернулись слишком поздно.', 'You went for help but came back too late.', { resolve: -1 }),
      },
      {
        id: 'friends',
        label: t('Позвать спутников', 'Call your companions'),
        requires: { anyCompanion: true },
        success: ok('Вместе вы легко поставили повозку на колёса.', 'Together you easily set the cart upright.', { rep: { order: 1 }, flag: ['hero'], xp: 40 }),
      },
      { id: 'pass', label: t('Пройти мимо', 'Walk past'), success: ok('Крики за спиной долго не стихают. На душе тяжело.', 'The cries behind you linger. Your heart is heavy.', { resolve: -1 }) },
    ],
  },
  {
    id: 'bandits',
    icon: '🗡️',
    title: t('Разбойники', 'Bandits'),
    text: t('Из кустов выходят трое: «Кошелёк или жизнь!»', 'Three figures step out of the bushes: "Your money or your life!"'),
    choices: [
      {
        id: 'brothers',
        label: t('«Я свой» — показать знак', '"I\'m one of you" — show the sign'),
        requires: { flag: 'outlaw' },
        success: ok('Разбойники узнали собрата и поделились добычей.', 'The bandits recognize a fellow outlaw and share their loot.', { gold: 40 }),
      },
      {
        id: 'fight',
        label: t('Драться', 'Fight'),
        check: { stat: 'strength', diff: 3 },
        success: ok('Разбойники разбежались, бросив награбленное.', 'The bandits scatter, leaving their loot behind.', { gold: 70, xp: 80, rep: { order: 1 } }),
        fail: ok('Вас крепко помяли и обчистили карманы.', 'You took a beating and lost some coins.', { resolve: -3, gold: -20 }),
      },
      {
        id: 'run',
        label: t('Убежать', 'Run away'),
        trial: { exercise: 'high_knees', reps: 40 },
        success: ok('Вы скрылись, разбойники отстали на первом же холме.', 'You got away; the bandits gave up at the first hill.', { xp: 40 }),
        fail: ok('Догнали. Пришлось расстаться с монетами.', 'They caught you. You lost some coins.', { gold: -30, resolve: -1 }),
      },
      { id: 'pay', label: t('Заплатить', 'Pay them'), cost: 40, success: ok('Разбойники пересчитали монеты и ушли.', 'The bandits count the coins and leave.', {}) },
    ],
  },
  {
    id: 'shrine',
    icon: '⛩️',
    title: t('Древнее святилище', 'Ancient shrine'),
    text: t('Каменная чаша с ключевой водой и полустёртые руны.', 'A stone bowl of spring water and half-faded runes.'),
    once: true,
    choices: [
      { id: 'drink', label: t('Испить воды', 'Drink the water'), success: ok('Вода холодна и чиста — усталость уходит.', 'The water is cold and pure — fatigue fades away.', { resolve: 3 }) },
      {
        id: 'meditate',
        label: t('Помедитировать у рун', 'Meditate by the runes'),
        trial: { exercise: 'situp', reps: 12 },
        success: ok('Руны вспыхнули. Вы чувствуете благословение.', 'The runes glow. You feel blessed.', { flag: ['blessed'], resolve: 2, xp: 50 }),
        fail: ok('Сосредоточиться не вышло.', 'You could not focus.', {}),
      },
      { id: 'offer', label: t('Оставить подношение', 'Leave an offering'), cost: 30, success: ok('Руны приняли дар. Удача на вашей стороне.', 'The runes accept your gift. Luck is on your side.', { flag: ['blessed'] }) },
    ],
  },
  {
    id: 'chest',
    icon: '🎁',
    title: t('Окованный сундук', 'An iron-bound chest'),
    text: t('Под корнями виднеется окованный сундук с ржавым замком.', 'An iron-bound chest with a rusty lock peeks out from under the roots.'),
    choices: [
      {
        id: 'force',
        label: t('Сорвать замок', 'Break the lock'),
        check: { stat: 'strength', diff: 2 },
        success: ok('Крышка поддалась — внутри добыча!', 'The lid gives way — there is loot inside!', { loot: true }),
        fail: ok('Сработала ловушка с иглами.', 'A needle trap went off.', { resolve: -2 }),
      },
      {
        id: 'pick',
        label: t('Аккуратно вскрыть', 'Pick the lock carefully'),
        check: { stat: 'core', diff: 2 },
        success: ok('Щелчок — и сундук открыт.', 'Click — the chest is open.', { loot: true }),
        fail: ok('Отмычка сломалась, а пальцы исколоты.', 'The pick broke and your fingers are pricked.', { resolve: -1 }),
      },
      { id: 'leave', label: t('Не трогать', 'Leave it'), success: ok('Мало ли что там. Вы идёте дальше.', 'Who knows what is inside. You move on.', {}) },
    ],
  },
  {
    id: 'river',
    icon: '🌊',
    title: t('Бурная река', 'A raging river'),
    text: t('Река вышла из берегов и преграждает путь.', 'A flooded river blocks the way.'),
    choices: [
      {
        id: 'swim',
        label: t('Переплыть', 'Swim across'),
        check: { stat: 'endurance', diff: 2 },
        success: ok('Вы выбрались на берег, мокрый, но довольный.', 'You climb out on the other bank, wet but pleased.', { xp: 60 }),
        fail: ok('Течение утащило вас далеко вниз.', 'The current dragged you far downstream.', { resolve: -2 }),
      },
      { id: 'bridge', label: t('Искать брод', 'Look for a ford'), success: ok('Брод нашёлся, но на поиски ушёл целый день.', 'You found a ford, but it took the whole day.', { energy: -1 }) },
      {
        id: 'raft',
        label: t('Связать плот с напарником', 'Build a raft with a friend'),
        requires: { anyCompanion: true },
        success: ok('Плот получился на славу!', 'The raft turned out great!', { xp: 50 }),
      },
    ],
  },
  {
    id: 'rival',
    icon: '🤺',
    title: t('Соперник', 'A rival'),
    text: t('Атлет {npc} бросает вызов: кто сделает больше отжиманий?', 'An athlete named {npc} challenges you: who can do more push-ups?'),
    vars: { npc: NPC },
    choices: [
      {
        id: 'accept',
        label: t('Принять вызов', 'Accept the challenge'),
        trial: { exercise: 'pushup', reps: 12 },
        success: ok('Победа! Соперник жмёт руку и отдаёт ставку.', 'Victory! Your rival shakes your hand and pays the bet.', { gold: 70, xp: 60, rep: { order: 1 } }),
        fail: ok('Соперник оказался сильнее. В следующий раз!', 'Your rival was stronger. Next time!', { resolve: -1 }),
      },
      { id: 'decline', label: t('Отказаться', 'Decline'), success: ok('«Струсил!» — смеётся соперник вслед.', '"Chicken!" laughs the rival behind you.', {}) },
    ],
  },
  {
    id: 'pilgrim',
    icon: '🧭',
    title: t('Заблудившийся паломник', 'A lost pilgrim'),
    text: t('Паломник сбился с пути и просит проводить его до тракта.', 'A pilgrim has lost his way and asks you to guide him to the road.'),
    choices: [
      {
        id: 'guide',
        label: t('Проводить', 'Guide him'),
        trial: { exercise: 'lunge', reps: 12 },
        success: ok('Паломник благословил вас на прощание.', 'The pilgrim blesses you as you part.', { resolve: 2, rep: { order: 1 }, flag: ['hero'] }),
        fail: ok('Вы показали дорогу на словах.', 'You just pointed the way.', {}),
      },
      { id: 'map', label: t('Нарисовать карту', 'Draw him a map'), success: ok('Паломник благодарит и делится сухарями.', 'The pilgrim thanks you and shares some rusks.', { resolve: 1 }) },
    ],
  },
  {
    id: 'storm',
    icon: '⛈️',
    title: t('Буря', 'Storm'),
    text: t('Небо чернеет, ветер срывает плащ — надвигается буря.', 'The sky turns black and the wind tears at your cloak — a storm is coming.'),
    choices: [
      {
        id: 'push',
        label: t('Идти сквозь бурю', 'Push through the storm'),
        check: { stat: 'endurance', diff: 2 },
        success: ok('Вы прошли там, где другие повернули бы назад, и сократили путь.', 'You went where others would turn back and shortened the way.', { skip: 1, xp: 50 }),
        fail: ok('Ветер сбил с ног, вы промокли до нитки.', 'The wind knocked you down; you are soaked to the bone.', { resolve: -2 }),
      },
      { id: 'shelter', label: t('Переждать в укрытии', 'Wait it out'), success: ok('Буря утихла к утру. Вы выспались.', 'The storm calmed by morning. You slept well.', { energy: -1, resolve: 1 }) },
    ],
  },
  {
    id: 'fortune',
    icon: '🔮',
    title: t('Гадалка', 'Fortune teller'),
    text: t('Старуха с хрустальным шаром предлагает заглянуть в будущее.', 'An old woman with a crystal ball offers to look into your future.'),
    choices: [
      {
        id: 'pay',
        label: t('Заплатить за гадание', 'Pay for a reading'),
        cost: 20,
        gamble: true,
        success: ok('«Удача улыбнётся тебе», — говорит гадалка. И правда легче на душе.', '"Fortune will smile on you," she says. You feel lighter.', { flag: ['blessed'], resolve: 1 }),
        fail: ok('Шар потемнел. «Берегись…» — шепчет гадалка. Вас преследует дурное предчувствие.', 'The ball darkens. "Beware…" she whispers. A bad feeling follows you.', { flag: ['cursed'] }),
      },
      { id: 'refuse', label: t('Вежливо отказаться', 'Politely refuse'), success: ok('Гадалка пожимает плечами.', 'The fortune teller shrugs.', {}) },
    ],
  },
  {
    id: 'bard',
    icon: '🎶',
    title: t('Бард у дороги', 'A roadside bard'),
    text: t('Бард {npc} сочиняет балладу о героях и ищет сюжет.', 'A bard named {npc} is writing a ballad about heroes and needs a story.'),
    vars: { npc: NPC },
    choices: [
      {
        id: 'tell',
        label: t('Рассказать о своих подвигах', 'Tell of your deeds'),
        requires: { flag: 'hero' },
        success: ok('Баллада о вас разлетится по всем тавернам!', 'The ballad about you will spread to every tavern!', { rep: { order: 2 }, title: 'ballad', xp: 80 }),
      },
      { id: 'sing', label: t('Подпеть припев', 'Sing the chorus'), success: ok('Вы смеётесь и поёте до хрипоты.', 'You laugh and sing until your voice is hoarse.', { resolve: 1 }) },
      { id: 'tip', label: t('Дать монету', 'Tip a coin'), cost: 10, success: ok('Бард посвящает вам куплет.', 'The bard dedicates a verse to you.', { rep: { guild: 1 }, resolve: 1 }) },
    ],
  },
  {
    id: 'squire',
    icon: '🛡️',
    title: t('Юный оруженосец', 'A young squire'),
    text: t('Оруженосец Тим ищет наставника и просит взять его с собой.', 'Tim the squire is looking for a mentor and asks to come along.'),
    once: true,
    when: { notFlag: 'squire_met' },
    choices: [
      {
        id: 'test',
        label: t('Показать, как тренироваться', 'Show him how to train'),
        trial: { exercise: 'pushup', reps: 10 },
        success: ok('Тим в восторге и клянётся следовать за вами.', 'Tim is thrilled and swears to follow you.', { companion: 'squire', flag: ['squire_met'] }),
        fail: ok('Тим разочарованно уходит.', 'Tim leaves, disappointed.', { flag: ['squire_met'] }),
      },
      { id: 'refuse', label: t('Отказать', 'Refuse'), success: ok('«Я ещё докажу!» — кричит Тим.', '"I\'ll prove myself!" shouts Tim.', { flag: ['squire_met'] }) },
    ],
  },
];

// ─── Продолжения: появляются после решений игрока ───────────────────────

const FOLLOW_UPS: EventDef[] = [
  {
    id: 'hunters',
    icon: '🏹',
    title: t('Охотники гильдии', 'Guild hunters'),
    text: t('Гильдия назначила награду за вашу голову. Охотники окружают вас.', 'The guild put a bounty on your head. Hunters surround you.'),
    when: { flag: 'outlaw' },
    weight: 3,
    choices: [
      {
        id: 'fight',
        label: t('Прорваться с боем', 'Fight your way out'),
        check: { stat: 'strength', diff: 4 },
        success: ok('Охотники отступили. Надолго ли?', 'The hunters retreat. For how long?', { xp: 100 }),
        fail: ok('Вас схватили и отпустили лишь за выкуп.', 'They caught you and let you go only for a ransom.', { resolve: -3, gold: -50 }),
      },
      {
        id: 'run',
        label: t('Бежать', 'Run'),
        trial: { exercise: 'high_knees', reps: 50 },
        success: ok('Вы оторвались от погони.', 'You escaped the chase.', { xp: 50 }),
        fail: ok('Догнали.', 'They caught up.', { resolve: -2, gold: -30 }),
      },
      {
        id: 'repent',
        label: t('Вернуть долг гильдии', 'Repay the guild'),
        cost: 100,
        success: ok('Гильдия сняла награду. Вы снова честный путник.', 'The guild lifts the bounty. You are an honest traveller again.', { unflag: ['outlaw'], rep: { guild: 2 } }),
      },
    ],
  },
  {
    id: 'shortcut',
    icon: '🗺️',
    title: t('Тайная тропа', 'The hidden trail'),
    text: t('Вот она — тропа, о которой шептал торговец.', 'There it is — the trail the merchant whispered about.'),
    when: { flag: 'rumor' },
    weight: 2,
    choices: [
      { id: 'take', label: t('Свернуть на тропу', 'Take the trail'), success: ok('Тропа срезала добрую часть пути!', 'The trail cut off a good part of the way!', { skip: 1, unflag: ['rumor'], xp: 40 }) },
      { id: 'ignore', label: t('Держаться дороги', 'Stay on the road'), success: ok('Надёжнее по дороге.', 'The road is safer.', { unflag: ['rumor'] }) },
    ],
  },
  {
    id: 'wolf_return',
    icon: '🐺',
    title: t('Старый знакомый', 'An old friend'),
    text: t('Из чащи выходит волк, которого вы освободили. Он виляет хвостом.', 'The wolf you freed steps out of the thicket, wagging its tail.'),
    when: { flag: 'wolf_helped' },
    weight: 3,
    once: true,
    choices: [
      { id: 'welcome', label: t('Позвать с собой', 'Invite him along'), success: ok('Серый волк теперь идёт рядом.', 'The grey wolf now walks beside you.', { companion: 'wolf', unflag: ['wolf_helped'] }) },
      { id: 'farewell', label: t('Попрощаться', 'Say goodbye'), success: ok('Волк воет вам вслед — на удачу.', 'The wolf howls after you — for luck.', { unflag: ['wolf_helped'], flag: ['blessed'] }) },
    ],
  },
  {
    id: 'hermit_gift',
    icon: '🛖',
    title: t('Подарок отшельника', 'The hermit\'s gift'),
    text: t('Отшельник догоняет вас с узелком: «Пригодится в дороге».', 'The hermit catches up with a bundle: "This will help on the road."'),
    when: { flag: 'hermit_friend' },
    weight: 2,
    once: true,
    choices: [{ id: 'take', label: t('Принять подарок', 'Accept the gift'), success: ok('Целебные травы и немного монет.', 'Healing herbs and some coins.', { resolve: 4, gold: 40, unflag: ['hermit_friend'] }) }],
  },
  {
    id: 'curse',
    icon: '🌑',
    title: t('Проклятие', 'The curse'),
    text: t('Дурное предчувствие сбывается: всё валится из рук.', 'The bad feeling comes true: everything goes wrong.'),
    when: { flag: 'cursed' },
    weight: 3,
    choices: [
      {
        id: 'break',
        label: t('Изгнать уныние тренировкой', 'Burn it off with training'),
        trial: { exercise: 'situp', reps: 15 },
        success: ok('Проклятие развеялось вместе с потом!', 'The curse lifts along with the sweat!', { unflag: ['cursed'], resolve: 2 }),
        fail: ok('Проклятие держится.', 'The curse holds on.', { resolve: -2 }),
      },
      { id: 'endure', label: t('Терпеть', 'Endure'), success: ok('Вы стиснули зубы. Проклятие ослабло.', 'You grit your teeth. The curse weakens.', { resolve: -2, unflag: ['cursed'] }) },
    ],
  },
];

// ─── События регионов ──────────────────────────────────────────────────

const REGIONAL: EventDef[] = [
  // Лес
  {
    id: 'trapped_wolf',
    icon: '🐺',
    regions: [0],
    once: true,
    title: t('Волк в капкане', 'Wolf in a trap'),
    text: t('В капкане бьётся раненый волк. Он рычит, но в глазах — мольба.', 'A wounded wolf thrashes in a trap. It growls, but its eyes plead.'),
    choices: [
      {
        id: 'free',
        label: t('Освободить', 'Free it'),
        check: { stat: 'core', diff: 1 },
        success: ok('Волк исчез в чаще, оглянувшись на прощание.', 'The wolf vanishes into the woods, glancing back at you.', { flag: ['wolf_helped'], rep: { forest: 1 } }),
        fail: ok('Волк в испуге укусил вас и убежал.', 'The frightened wolf bit you and ran off.', { resolve: -1, flag: ['wolf_helped'] }),
      },
      { id: 'leave', label: t('Обойти стороной', 'Walk around it'), success: ok('Вой ещё долго слышен за спиной.', 'The howling follows you for a long time.', {}) },
    ],
  },
  {
    id: 'hermit',
    icon: '🛖',
    regions: [0, 1],
    once: true,
    title: t('Хижина отшельника', 'The hermit\'s hut'),
    text: t('Седой отшельник просит наколоть дров в обмен на ночлег.', 'A grey-haired hermit asks you to chop wood in exchange for a night\'s rest.'),
    choices: [
      {
        id: 'chop',
        label: t('Наколоть дров', 'Chop the wood'),
        trial: { exercise: 'squat', reps: 15 },
        success: ok('Отшельник накормил вас и пообещал не забыть доброту.', 'The hermit feeds you and promises to remember your kindness.', { resolve: 3, flag: ['hermit_friend'], rep: { forest: 1 } }),
        fail: ok('Вы ушли, не дождавшись ужина.', 'You left before dinner.', {}),
      },
      { id: 'decline', label: t('Отказаться', 'Decline'), success: ok('Отшельник молча закрыл дверь.', 'The hermit silently closes the door.', {}) },
    ],
  },
  {
    id: 'dryad',
    icon: '🌳',
    regions: [0],
    once: true,
    title: t('Дриада древнего дуба', 'The dryad of the old oak'),
    text: t('Из коры дуба проступает лицо: «Ответь на загадку или докажи силу».', 'A face appears in the oak bark: "Answer my riddle or prove your strength."'),
    choices: [
      {
        id: 'riddle',
        label: t('Отгадать загадку', 'Solve the riddle'),
        check: { stat: 'core', diff: 2 },
        success: ok('«Мудро». Дриада благословляет вас.', '"Wise." The dryad blesses you.', { flag: ['blessed'], rep: { forest: 2 } }),
        fail: ok('«Не то». Ветви больно хлестнули вас.', '"Wrong." The branches lash you.', { resolve: -2 }),
      },
      {
        id: 'climb',
        label: t('Забраться на вершину', 'Climb to the top'),
        trial: { exercise: 'pullup', reps: 3 },
        success: ok('На вершине — гнездо с блестящей находкой!', 'At the top is a nest with a shiny find!', { loot: true, rep: { forest: 1 } }),
        fail: ok('Сорвались с нижней ветки.', 'You slipped off the lowest branch.', { resolve: -1 }),
      },
      { id: 'bow', label: t('Поклониться и уйти', 'Bow and leave'), success: ok('Дриада провожает вас шелестом листвы.', 'The dryad sees you off with rustling leaves.', { rep: { forest: 1 } }) },
    ],
  },
  {
    id: 'mushrooms',
    icon: '🍄',
    regions: [0, 2],
    title: t('Светящиеся грибы', 'Glowing mushrooms'),
    text: t('Поляна грибов, светящихся мягким голубым светом.', 'A glade of mushrooms glowing with a soft blue light.'),
    choices: [
      {
        id: 'eat',
        label: t('Попробовать', 'Taste one'),
        gamble: true,
        success: ok('Вкусно и бодрит!', 'Tasty and energizing!', { resolve: 3 }),
        fail: ok('Голова закружилась, полдня как в тумане.', 'Your head spins — half a day in a fog.', { resolve: -2 }),
      },
      { id: 'gather', label: t('Собрать на продажу', 'Gather to sell'), success: ok('Алхимики хорошо платят за такие грибы.', 'Alchemists pay well for these.', { gold: 35 }) },
    ],
  },
  {
    id: 'poachers',
    icon: '🏹',
    regions: [0],
    title: t('Браконьеры', 'Poachers'),
    text: t('Браконьеры ставят силки у священной рощи.', 'Poachers are setting snares near the sacred grove.'),
    choices: [
      {
        id: 'stop',
        label: t('Прогнать их', 'Drive them off'),
        check: { stat: 'strength', diff: 2 },
        success: ok('Браконьеры удрали. Лес благодарен.', 'The poachers fled. The forest is grateful.', { rep: { forest: 2 }, xp: 60 }),
        fail: ok('Их было слишком много.', 'There were too many of them.', { resolve: -2 }),
      },
      { id: 'join', label: t('Войти в долю', 'Take a cut'), success: ok('Звонкая монета, но лес запомнит.', 'Good coin, but the forest will remember.', { gold: 50, rep: { forest: -2 } }) },
    ],
  },

  // Горы
  {
    id: 'goat',
    icon: '🐐',
    regions: [1],
    title: t('Козёл на уступе', 'A goat on a ledge'),
    text: t('Горный козёл застрял на уступе и жалобно блеет.', 'A mountain goat is stuck on a ledge, bleating sadly.'),
    choices: [
      {
        id: 'rescue',
        label: t('Спасти', 'Rescue it'),
        trial: { exercise: 'lunge', reps: 12 },
        success: ok('Козёл спасён и показывает вам безопасную тропу.', 'The goat is saved and shows you a safe path.', { rep: { forest: 1 }, xp: 50, skip: 1 }),
        fail: ok('Уступ слишком крут.', 'The ledge is too steep.', {}),
      },
      { id: 'leave', label: t('Идти дальше', 'Move on'), success: ok('Козлы — горные жители, справится.', 'Goats live in the mountains; it\'ll manage.', {}) },
    ],
  },
  {
    id: 'dwarves',
    icon: '⛏️',
    regions: [1],
    title: t('Гномы-рудокопы', 'Dwarven miners'),
    text: t('Гномы предлагают поработать в шахте за плату.', 'Dwarves offer you paid work in the mine.'),
    choices: [
      {
        id: 'work',
        label: t('Поработать киркой', 'Swing a pickaxe'),
        trial: { exercise: 'pushup', reps: 15 },
        success: ok('Гномы уважительно хлопают по плечу и платят серебром.', 'The dwarves pat you on the shoulder and pay in silver.', { gold: 120, xp: 60 }),
        fail: ok('Работа оказалась тяжелее, чем казалось.', 'The work was harder than it looked.', { resolve: -1 }),
      },
      { id: 'trade', label: t('Купить находку', 'Buy a find'), cost: 80, success: ok('Гномы отдают вещицу из глубин.', 'The dwarves hand over something from the depths.', { loot: true }) },
      { id: 'leave', label: t('Уйти', 'Leave'), success: ok('Гномы пожимают плечами.', 'The dwarves shrug.', {}) },
    ],
  },
  {
    id: 'avalanche',
    icon: '🏔️',
    regions: [1],
    title: t('Лавина', 'Avalanche'),
    text: t('С вершины срывается лавина!', 'An avalanche thunders down from the peak!'),
    choices: [
      {
        id: 'run',
        label: t('Бежать изо всех сил', 'Run as fast as you can'),
        trial: { exercise: 'high_knees', reps: 40 },
        success: ok('Снег прошёл стороной. Вы целы!', 'The snow passes you by. You are safe!', { xp: 60 }),
        fail: ok('Вас засыпало, едва выбрались.', 'You were buried and barely dug out.', { resolve: -3 }),
      },
      {
        id: 'hide',
        label: t('Укрыться за скалой', 'Shelter behind a rock'),
        check: { stat: 'core', diff: 3 },
        success: ok('Скала выдержала.', 'The rock held.', {}),
        fail: ok('Скала не спасла.', 'The rock didn\'t help.', { resolve: -3 }),
      },
    ],
  },
  {
    id: 'little_golem',
    icon: '🗿',
    regions: [1],
    once: true,
    title: t('Маленький голем', 'A little golem'),
    text: t('Маленький каменный голем потерял дорогу домой и грустно гудит.', 'A little stone golem lost its way home and hums sadly.'),
    choices: [
      { id: 'help', label: t('Помочь найти дом', 'Help it find home'), success: ok('Дома его нет — и голем решает остаться с вами.', 'Its home is gone — so the golem decides to stay with you.', { companion: 'golem' }) },
      { id: 'leave', label: t('Пройти мимо', 'Walk past'), success: ok('Гудение долго эхом звучит в горах.', 'The humming echoes in the mountains.', {}) },
    ],
  },
  {
    id: 'monk',
    icon: '🧘',
    regions: [1, 3],
    once: true,
    title: t('Монах на вершине', 'The mountain monk'),
    text: t('Монах учит путников дыханию и стойкости.', 'A monk teaches travellers breath and resilience.'),
    choices: [
      {
        id: 'learn',
        label: t('Учиться', 'Learn'),
        trial: { exercise: 'situp', reps: 15 },
        success: ok('Ваш дух окреп: запас стойкости вырос.', 'Your spirit grows stronger: resolve increased.', { resolve: 4, xp: 80, flag: ['monk_trained'] }),
        fail: ok('Монах улыбается: «Приходи, когда будешь готов».', 'The monk smiles: "Come back when you are ready."', {}),
      },
      { id: 'tea', label: t('Выпить чаю', 'Have tea'), success: ok('Тёплый чай и тишина.', 'Warm tea and silence.', { resolve: 2 }) },
    ],
  },

  // Топи
  {
    id: 'witch_hut',
    icon: '🏚️',
    regions: [2],
    title: t('Избушка на сваях', 'A hut on stilts'),
    text: t('Избушка на сваях, из трубы валит зелёный дым.', 'A hut on stilts with green smoke pouring from the chimney.'),
    choices: [
      { id: 'buy', label: t('Купить зелье', 'Buy a potion'), cost: 40, success: ok('Горькое зелье, но силы прибыло.', 'A bitter potion, but you feel stronger.', { resolve: 4 }) },
      {
        id: 'steal',
        label: t('Стащить зелье', 'Steal a potion'),
        check: { stat: 'legs', diff: 3 },
        success: ok('Удачно! Зелье бодрит.', 'Success! The potion invigorates you.', { resolve: 4 }),
        fail: ok('Хозяйка заметила и прокляла вас вслед.', 'The owner noticed and cursed you.', { flag: ['cursed'] }),
      },
      { id: 'avoid', label: t('Обойти', 'Avoid it'), success: ok('От греха подальше.', 'Better safe than sorry.', {}) },
    ],
  },
  {
    id: 'bog',
    icon: '🫧',
    regions: [2],
    title: t('Трясина', 'Quagmire'),
    text: t('Тропа уходит прямо в трясину.', 'The path leads straight into the quagmire.'),
    choices: [
      {
        id: 'wade',
        label: t('Пробираться по колено в грязи', 'Wade knee-deep in mud'),
        trial: { exercise: 'lunge', reps: 14 },
        success: ok('Выбрались! Ноги гудят, но вы на твёрдой земле.', 'You made it! Your legs ache, but you are on solid ground.', { xp: 60 }),
        fail: ok('Трясина забрала сапог и силы.', 'The bog took a boot and your strength.', { resolve: -2 }),
      },
      {
        id: 'jump',
        label: t('Прыгать по кочкам', 'Hop across the tussocks'),
        check: { stat: 'legs', diff: 3 },
        success: ok('Ловко! Ни капли грязи.', 'Nimble! Not a drop of mud.', { xp: 40 }),
        fail: ok('Плюх!', 'Splash!', { resolve: -2 }),
      },
    ],
  },
  {
    id: 'wisps',
    icon: '✨',
    regions: [2],
    title: t('Блуждающие огоньки', 'Will-o\'-wisps'),
    text: t('Огоньки манят свернуть с тропы.', 'Glowing wisps beckon you off the path.'),
    choices: [
      {
        id: 'follow',
        label: t('Последовать за ними', 'Follow them'),
        gamble: true,
        success: ok('Огоньки привели к спрятанному кладу!', 'The wisps led you to a hidden treasure!', { loot: true }),
        fail: ok('Огоньки водили вас кругами до утра.', 'The wisps led you in circles until dawn.', { energy: -1, resolve: -1 }),
      },
      { id: 'ignore', label: t('Не сходить с тропы', 'Stay on the path'), success: ok('Огоньки обиженно гаснут.', 'The wisps fade, offended.', {}) },
    ],
  },
  {
    id: 'frog_king',
    icon: '🐸',
    regions: [2],
    once: true,
    title: t('Лягушачий король', 'The Frog King'),
    text: t('Лягушачий король требует дань за проход по его болоту.', 'The Frog King demands a toll to cross his marsh.'),
    choices: [
      { id: 'pay', label: t('Заплатить дань', 'Pay the toll'), cost: 30, success: ok('Король довольно квакает.', 'The king croaks contentedly.', { rep: { forest: 1 } }) },
      {
        id: 'jumps',
        label: t('Вызвать на состязание в прыжках', 'Challenge him to a jumping contest'),
        trial: { exercise: 'jumping_jack', reps: 40 },
        success: ok('Король признал поражение и посвятил вас в рыцари!', 'The king admits defeat and knights you!', { gold: 60, title: 'frog_friend', xp: 60 }),
        fail: ok('Король прыгает выше. Придётся платить.', 'The king jumps higher. You have to pay.', { gold: -30 }),
      },
    ],
  },
  {
    id: 'web_fairy',
    icon: '🧚',
    regions: [2, 3],
    once: true,
    title: t('Фея в паутине', 'A fairy in a web'),
    text: t('Крошечная фея запуталась в паутине и звенит о помощи.', 'A tiny fairy is tangled in a web, chiming for help.'),
    choices: [
      {
        id: 'free',
        label: t('Аккуратно распутать', 'Carefully untangle her'),
        check: { stat: 'core', diff: 2 },
        success: ok('Фея Искра благодарит и остаётся рядом.', 'Spark the fairy thanks you and stays by your side.', { companion: 'fairy' }),
        fail: ok('Паутина порвалась, фея улетела в испуге.', 'The web tore and the fairy flew off in fright.', {}),
      },
      { id: 'ignore', label: t('Пройти мимо', 'Walk past'), success: ok('Звон затихает за спиной.', 'The chiming fades behind you.', {}) },
    ],
  },

  // Пустыня
  {
    id: 'caravan',
    icon: '🐪',
    regions: [3],
    title: t('Караван', 'A caravan'),
    text: t('Караван гильдии ищет охрану через дюны.', 'A guild caravan needs guards across the dunes.'),
    choices: [
      {
        id: 'guard',
        label: t('Охранять караван', 'Guard the caravan'),
        trial: { exercise: 'pushup', reps: 15 },
        success: ok('Караван дошёл без потерь. Щедрая плата!', 'The caravan arrived safely. Generous pay!', { gold: 150, rep: { guild: 2 } }),
        fail: ok('Охрана из вас вышла так себе.', 'You were not much of a guard.', { rep: { guild: -1 } }),
      },
      {
        id: 'raid',
        label: t('Ограбить караван', 'Raid the caravan'),
        requires: { flag: 'outlaw' },
        check: { stat: 'strength', diff: 5 },
        success: ok('Богатая добыча! Но гильдия в ярости.', 'Rich loot! But the guild is furious.', { gold: 200, loot: true, rep: { guild: -3 } }),
        fail: ok('Охрана каравана отбилась.', 'The caravan guards fought you off.', { resolve: -3 }),
      },
      { id: 'decline', label: t('Отказаться', 'Decline'), success: ok('Караван уходит в марево.', 'The caravan disappears into the haze.', {}) },
    ],
  },
  {
    id: 'mirage',
    icon: '🏝️',
    regions: [3],
    title: t('Оазис или мираж?', 'Oasis or mirage?'),
    text: t('На горизонте пальмы и вода. Или это мираж?', 'Palm trees and water on the horizon. Or is it a mirage?'),
    choices: [
      {
        id: 'go',
        label: t('Идти к воде', 'Head for the water'),
        gamble: true,
        success: ok('Настоящий оазис! Прохлада и тень.', 'A real oasis! Coolness and shade.', { resolve: 4 }),
        fail: ok('Мираж. Лишний день по жаре.', 'A mirage. An extra day in the heat.', { resolve: -2, energy: -1 }),
      },
      {
        id: 'look',
        label: t('Присмотреться', 'Look closely'),
        check: { stat: 'core', diff: 3 },
        success: ok('Вы разглядели настоящий оазис чуть в стороне!', 'You spotted the real oasis a little to the side!', { resolve: 4 }),
        fail: ok('Глаза слезятся от солнца.', 'Your eyes water in the sun.', {}),
      },
    ],
  },
  {
    id: 'scorpion',
    icon: '🦂',
    regions: [3],
    title: t('Гигантский скорпион', 'Giant scorpion'),
    text: t('Из песка выползает скорпион размером с телегу.', 'A scorpion the size of a cart crawls out of the sand.'),
    choices: [
      {
        id: 'fight',
        label: t('Сражаться', 'Fight'),
        check: { stat: 'strength', diff: 4 },
        success: ok('Скорпион повержен!', 'The scorpion is defeated!', { xp: 120, gold: 60 }),
        fail: ok('Жало задело вас.', 'The stinger grazed you.', { resolve: -3 }),
      },
      {
        id: 'dodge',
        label: t('Уворачиваться', 'Dodge'),
        trial: { exercise: 'high_knees', reps: 50 },
        success: ok('Скорпион устал и зарылся в песок.', 'The scorpion tired and burrowed into the sand.', { xp: 70 }),
        fail: ok('Не увернулись.', 'You failed to dodge.', { resolve: -3 }),
      },
    ],
  },
  {
    id: 'ruins',
    icon: '🏛️',
    regions: [3],
    title: t('Руины храма', 'Temple ruins'),
    text: t('Из песка торчат колонны древнего храма.', 'Columns of an ancient temple rise from the sand.'),
    choices: [
      {
        id: 'explore',
        label: t('Исследовать', 'Explore'),
        check: { stat: 'core', diff: 3 },
        success: ok('В тайнике — древняя реликвия!', 'An ancient relic in a hidden cache!', { loot: true, xp: 60 }),
        fail: ok('Потолок обрушился, едва успели выскочить.', 'The ceiling collapsed; you barely escaped.', { resolve: -2 }),
      },
      {
        id: 'dig',
        label: t('Раскопать вход', 'Dig out the entrance'),
        trial: { exercise: 'squat', reps: 20 },
        success: ok('За дверью — сокровищница с монетами.', 'Behind the door is a vault of coins.', { gold: 120 }),
        fail: ok('Песок засыпает яму быстрее, чем вы копаете.', 'Sand fills the hole faster than you dig.', {}),
      },
    ],
  },
  {
    id: 'nomads',
    icon: '⛺',
    regions: [3],
    title: t('Кочевники', 'Nomads'),
    text: t('Кочевники приглашают к костру. Их чемпион ищет соперника по борьбе.', 'Nomads invite you to their fire. Their champion is looking for a wrestling opponent.'),
    choices: [
      { id: 'stories', label: t('Обменяться историями', 'Share stories'), success: ok('Вы смеётесь до утра.', 'You laugh until dawn.', { resolve: 2, rep: { guild: 1 } }) },
      {
        id: 'wrestle',
        label: t('Бороться с чемпионом', 'Wrestle the champion'),
        check: { stat: 'strength', diff: 4 },
        success: ok('Вы уложили чемпиона! Племя ликует.', 'You pinned the champion! The tribe cheers.', { title: 'wrestler', gold: 80, xp: 100 }),
        fail: ok('Чемпион силён. Но вы держались достойно.', 'The champion is strong. But you held your own.', { resolve: -1, xp: 40 }),
      },
    ],
  },

  // Цитадель
  {
    id: 'gate',
    icon: '🚪',
    regions: [4],
    once: true,
    title: t('Врата цитадели', 'The citadel gate'),
    text: t('Ворота охраняют стражи-тени.', 'Shadow guards stand at the gate.'),
    choices: [
      {
        id: 'sneak',
        label: t('Прокрасться', 'Sneak past'),
        check: { stat: 'legs', diff: 5 },
        success: ok('Тени не заметили вас.', 'The shadows didn\'t notice you.', { xp: 100 }),
        fail: ok('Тревога! Пришлось прорываться.', 'Alarm! You had to fight through.', { resolve: -3 }),
      },
      {
        id: 'fight',
        label: t('Атаковать стражу', 'Attack the guards'),
        trial: { exercise: 'pushup', reps: 20 },
        success: ok('Стражи рассеялись дымом.', 'The guards dissolve into smoke.', { xp: 150 }),
        fail: ok('Стражи отбросили вас.', 'The guards threw you back.', { resolve: -3 }),
      },
      {
        id: 'password',
        label: t('Назвать пароль от торговца', 'Say the merchant\'s password'),
        requires: { flag: 'rumor' },
        success: ok('Ворота открылись сами.', 'The gate opens by itself.', { unflag: ['rumor'] }),
      },
    ],
  },
  {
    id: 'prisoner',
    icon: '⛓️',
    regions: [4],
    once: true,
    title: t('Пленник', 'The prisoner'),
    text: t('В темнице томится пленник {npc}.', 'A prisoner named {npc} languishes in a cell.'),
    vars: { npc: NPC },
    choices: [
      {
        id: 'free',
        label: t('Выломать решётку', 'Break the bars'),
        trial: { exercise: 'pullup', reps: 4 },
        success: ok('Пленник свободен и указывает тайный ход.', 'The prisoner is free and shows you a secret passage.', { skip: 1, rep: { order: 2 }, flag: ['hero'] }),
        fail: ok('Решётка не поддалась.', 'The bars didn\'t budge.', { resolve: -1 }),
      },
      { id: 'leave', label: t('Обещать вернуться', 'Promise to return'), success: ok('Пленник смотрит вам вслед.', 'The prisoner watches you go.', { resolve: -1 }) },
    ],
  },
  {
    id: 'mirror_hall',
    icon: '🪞',
    regions: [4],
    once: true,
    title: t('Зал зеркал', 'Hall of mirrors'),
    text: t('Зеркала показывают ваши сомнения и страхи.', 'The mirrors show your doubts and fears.'),
    choices: [
      {
        id: 'face',
        label: t('Встретить страх лицом к лицу', 'Face your fears'),
        trial: { exercise: 'situp', reps: 20 },
        success: ok('Отражения рассыпались. Вы сильнее, чем думали.', 'The reflections shatter. You are stronger than you thought.', { resolve: 5, xp: 120 }),
        fail: ok('Сомнения грызут вас.', 'Doubts gnaw at you.', { resolve: -2 }),
      },
      { id: 'away', label: t('Отвернуться', 'Turn away'), success: ok('Вы прошли зал, не поднимая глаз.', 'You crossed the hall with your eyes down.', { resolve: -1 }) },
    ],
  },
  {
    id: 'armory',
    icon: '🛡️',
    regions: [4],
    title: t('Оружейная', 'The armory'),
    text: t('Заброшенная оружейная цитадели.', 'The citadel\'s abandoned armory.'),
    choices: [
      {
        id: 'search',
        label: t('Обыскать стойки', 'Search the racks'),
        check: { stat: 'core', diff: 3 },
        success: ok('Среди хлама — достойное снаряжение!', 'Among the junk is some worthy gear!', { loot: true }),
        fail: ok('Ржавчина и паутина.', 'Rust and cobwebs.', {}),
      },
      { id: 'leave', label: t('Не задерживаться', 'Don\'t linger'), success: ok('Время дорого.', 'Time is precious.', {}) },
    ],
  },
];

// ─── Хранители регионов ────────────────────────────────────────────────

const BOSSES: EventDef[] = [
  {
    id: 'boss_bear',
    icon: '🐻',
    regions: [0],
    boss: true,
    title: t('Древний медведь', 'The ancient bear'),
    text: t('Огромный медведь-хранитель преграждает выход из леса.', 'A huge guardian bear blocks the way out of the forest.'),
    choices: [
      {
        id: 'battle',
        label: t('Сразиться с медведем', 'Fight the bear'),
        fight: 'bear',
        success: ok('Медведь повержен и уходит в чащу зализывать раны. Путь из леса открыт.', 'The bear is beaten and limps into the thicket. The way out of the forest is open.', { clear: true, title: 'forest_friend', xp: 120 }),
        fail: ok('Медведь отшвырнул вас. Нужно набраться сил.', 'The bear threw you back. Gather your strength.', { resolve: -3 }),
      },
      {
        id: 'calm',
        label: t('Попросить пропустить', 'Ask to pass'),
        requires: { rep: ['forest', 2] },
        success: ok('Медведь узнаёт друга леса и отступает.', 'The bear recognizes a friend of the forest and steps aside.', { clear: true, title: 'forest_friend' }),
      },
      {
        id: 'wolf',
        label: t('Пустить вперёд волка', 'Send the wolf ahead'),
        requires: { companion: 'wolf' },
        success: ok('Волк и медведь обменялись взглядами. Путь свободен.', 'The wolf and the bear exchange looks. The way is clear.', { clear: true, title: 'forest_friend' }),
      },
      {
        id: 'fight',
        label: t('Выдержать натиск', 'Withstand the charge'),
        trial: { exercise: 'squat', reps: 20 },
        success: ok('Медведь уважительно рыкнул и ушёл в чащу.', 'The bear growls respectfully and leaves.', { clear: true, xp: 150 }),
        fail: ok('Медведь отбросил вас. Нужно набраться сил.', 'The bear knocked you back. Gather your strength.', { resolve: -3 }),
      },
      {
        id: 'sneak',
        label: t('Обойти по деревьям', 'Sneak around through the trees'),
        check: { stat: 'legs', diff: 4 },
        success: ok('Медведь не заметил вас.', 'The bear didn\'t notice you.', { clear: true }),
        fail: ok('Ветка хрустнула…', 'A branch snapped…', { resolve: -3 }),
      },
    ],
  },
  {
    id: 'boss_giant',
    icon: '🗿',
    regions: [1],
    boss: true,
    title: t('Каменный великан', 'The stone giant'),
    text: t('Каменный великан охраняет перевал.', 'A stone giant guards the pass.'),
    choices: [
      {
        id: 'battle',
        label: t('Расколоть великана', 'Shatter the giant'),
        fight: 'stone_giant',
        success: ok('Великан рассыпался грудой камней. Перевал свободен!', 'The giant crumbles into a heap of stones. The pass is free!', { clear: true, title: 'pass_breaker', xp: 150 }),
        fail: ok('Каменный кулак сбил вас с ног.', 'A stone fist knocked you down.', { resolve: -3 }),
      },
      {
        id: 'golem',
        label: t('Голем поговорит с родичем', 'Let the golem talk to its kin'),
        requires: { companion: 'golem' },
        success: ok('Великан гудит в ответ и отступает.', 'The giant hums back and steps aside.', { clear: true, title: 'pass_breaker' }),
      },
      {
        id: 'climb',
        label: t('Взобраться по его спине', 'Climb up its back'),
        trial: { exercise: 'pullup', reps: 5 },
        success: ok('Вы на вершине перевала! Великан застыл.', 'You reach the top of the pass! The giant freezes.', { clear: true, title: 'pass_breaker', xp: 200 }),
        fail: ok('Сорвались вниз.', 'You fell.', { resolve: -3 }),
      },
      {
        id: 'trick',
        label: t('Перехитрить', 'Outsmart it'),
        check: { stat: 'core', diff: 4 },
        success: ok('Великан запутался в своих мыслях. Путь свободен.', 'The giant got lost in thought. The way is clear.', { clear: true }),
        fail: ok('Великан не так глуп.', 'The giant is not that dumb.', { resolve: -3 }),
      },
    ],
  },
  {
    id: 'boss_witch',
    icon: '🧙',
    regions: [2],
    boss: true,
    title: t('Болотная ведьма', 'The marsh witch'),
    text: t('Ведьма топей требует платы за выход.', 'The marsh witch demands payment to let you out.'),
    choices: [
      {
        id: 'battle',
        label: t('Сразиться с ведьмой', 'Fight the witch'),
        fight: 'witch',
        success: ok('Ведьма с визгом растаяла в тумане. Топи отпускают вас.', 'The witch shrieks and melts into the fog. The marsh lets you go.', { clear: true, title: 'marsh_walker', xp: 150 }),
        fail: ok('Чары ведьмы оказались сильнее.', 'The witch\'s spells were stronger.', { resolve: -3 }),
      },
      {
        id: 'fairy',
        label: t('Фея развеет чары', 'The fairy breaks the spell'),
        requires: { companion: 'fairy' },
        success: ok('Свет феи рассеял туман. Ведьма исчезла.', 'The fairy\'s light disperses the fog. The witch vanishes.', { clear: true, title: 'marsh_walker' }),
      },
      {
        id: 'will',
        label: t('Дуэль воли', 'A duel of will'),
        trial: { exercise: 'situp', reps: 20 },
        success: ok('Ведьма отступила перед вашей стойкостью.', 'The witch backs down before your resolve.', { clear: true, title: 'marsh_walker', xp: 200 }),
        fail: ok('Чары оказались сильнее.', 'The spell was stronger.', { resolve: -3 }),
      },
      { id: 'pay', label: t('Заплатить', 'Pay'), cost: 150, success: ok('Ведьма пересчитала монеты и открыла путь.', 'The witch counts the coins and opens the way.', { clear: true }) },
    ],
  },
  {
    id: 'boss_serpent',
    icon: '🐍',
    regions: [3],
    boss: true,
    title: t('Песчаный змей', 'The sand serpent'),
    text: t('Из дюн поднимается исполинский змей.', 'A gigantic serpent rises from the dunes.'),
    choices: [
      {
        id: 'battle',
        label: t('Биться со змеем', 'Battle the serpent'),
        fight: 'sand_serpent',
        success: ok('Змей повержен и уполз в глубины дюн.', 'The serpent is beaten and sinks into the dunes.', { clear: true, title: 'dune_runner', xp: 200 }),
        fail: ok('Кольца змея едва не задушили вас.', 'The serpent\'s coils nearly crushed you.', { resolve: -3 }),
      },
      {
        id: 'outrun',
        label: t('Обогнать змея', 'Outrun the serpent'),
        trial: { exercise: 'jumping_jack', reps: 50 },
        success: ok('Вы выбежали из пустыни быстрее змея!', 'You ran out of the desert faster than the serpent!', { clear: true, title: 'dune_runner', xp: 200 }),
        fail: ok('Змей отрезал путь.', 'The serpent cut you off.', { resolve: -3 }),
      },
      {
        id: 'fight',
        label: t('Сразиться', 'Fight'),
        check: { stat: 'strength', diff: 5 },
        success: ok('Змей повержен и уполз в глубины.', 'The serpent is beaten and retreats into the depths.', { clear: true, xp: 250 }),
        fail: ok('Кольца змея едва не задушили вас.', 'The serpent\'s coils nearly crushed you.', { resolve: -4 }),
      },
    ],
  },
  {
    id: 'boss_champion',
    icon: '👑',
    regions: [4],
    boss: true,
    title: t('Тёмный чемпион', 'The Dark Champion'),
    text: t('Тёмный чемпион ждёт в тронном зале. Последняя битва!', 'The Dark Champion awaits in the throne room. The final battle!'),
    choices: [
      {
        id: 'battle',
        label: t('Сразиться с чемпионом', 'Fight the champion'),
        fight: 'dark_champion',
        success: ok('Последний удар — и тьма рассеялась. Вы — легенда!', 'One last blow and the darkness is gone. You are a legend!', { victory: true, title: 'legend', xp: 400 }),
        fail: ok('Чемпион отбросил вас. Тьма ещё сильна.', 'The champion threw you back. The darkness is still strong.', { resolve: -3 }),
      },
      {
        id: 'parley',
        label: t('Убедить сдаться', 'Convince him to yield'),
        requires: { rep: ['order', 4] },
        success: ok('Слава о вас дошла и сюда. Чемпион склоняет голову. Мир победил.', 'Your fame has reached even here. The champion bows his head. Peace prevails.', { victory: true, title: 'peacemaker' }),
      },
      {
        id: 'allies',
        label: t('Атаковать вместе со спутниками', 'Attack together with your companions'),
        requires: { minCompanions: 2 },
        check: { stat: 'strength', diff: 4 },
        success: ok('Вместе вы сокрушили тьму!', 'Together you crushed the darkness!', { victory: true, title: 'legend', xp: 500 }),
        fail: ok('Чемпион отбросил вас всех.', 'The champion threw you all back.', { resolve: -4 }),
      },
      {
        id: 'duel',
        label: t('Честный поединок', 'An honest duel'),
        trial: { exercise: 'pushup', reps: 25 },
        success: ok('Последний удар — и тьма рассеялась. Вы — легенда!', 'One last blow and the darkness is gone. You are a legend!', { victory: true, title: 'legend', xp: 500 }),
        fail: ok('Чемпион силён. Нужно больше тренироваться.', 'The champion is strong. You need more training.', { resolve: -4 }),
      },
    ],
  },
];

// ─── Монстры: засады и охота ────────────────────────────────────────────

const AMBUSH_TEXT: readonly Txt[] = [
  t('Из чащи на тропу выходит {monster}. Отступать некуда.', '{monster} steps out of the thicket onto the path. There is nowhere to retreat.'),
  t('На узком уступе вас поджидает {monster}.', '{monster} lies in wait on a narrow ledge.'),
  t('Из тумана над трясиной поднимается {monster}.', '{monster} rises from the fog over the bog.'),
  t('Песок вздымается, и из-под дюны выбирается {monster}.', 'The sand heaves and {monster} crawls out of a dune.'),
  t('В тёмном коридоре цитадели путь преграждает {monster}.', '{monster} bars the way in a dark corridor of the citadel.'),
];
const AMBUSH_ICON = ['🌲', '⛰️', '🌫️', '🏜️', '🏰'];
const AMBUSH_MONSTERS: Record<number, MonsterId[]> = {
  0: ['wolf', 'giant_spider', 'goblin'],
  1: ['bandit', 'troll'],
  2: ['bog_zombie', 'giant_toad', 'slime'],
  3: ['scorpion', 'mummy'],
  4: ['skeleton_knight', 'wraith'],
};

const ambushChoices = (region: number): Choice[] => [
  {
    id: 'fight',
    label: t('Принять бой', 'Fight'),
    fight: true,
    success: ok('Монстр повержен. Вы обыскиваете его логово.', 'The monster is slain. You search its lair.', { gold: 25, xp: 40, ...(region === 0 ? { rep: { forest: 1 } } : region === 4 ? { rep: { order: 1 } } : {}) }),
    fail: ok('Монстр взял верх. Вы еле унесли ноги.', 'The monster got the upper hand. You barely escaped.', { resolve: -2 }),
  },
  {
    id: 'sneak',
    label: t('Проскользнуть мимо', 'Slip past'),
    check: { stat: 'legs', diff: 3 },
    success: ok('Вы бесшумно обошли монстра.', 'You crept past the monster without a sound.', {}),
    fail: ok('Монстр заметил вас и задел, прежде чем вы скрылись.', 'The monster spotted you and struck before you got away.', { resolve: -2 }),
  },
  {
    id: 'bait',
    label: t('Бросить приманку', 'Throw some bait'),
    cost: 30,
    success: ok('Монстр занят приманкой, а вы уже далеко.', 'The monster is busy with the bait, and you are long gone.', {}),
  },
];

const AMBUSHES: EventDef[] = [0, 1, 2, 3, 4].map((region) => ({
  id: `ambush_${region}`,
  icon: AMBUSH_ICON[region]!,
  regions: [region],
  weight: 1.3,
  title: t('Засада!', 'Ambush!'),
  text: AMBUSH_TEXT[region]!,
  monsters: AMBUSH_MONSTERS[region]!,
  choices: ambushChoices(region),
}));

/** Охота: бой вне тропы (событие не выпадает случайно — только по кнопке «Охота»). */
const HUNT: EventDef = {
  id: 'hunt',
  icon: '🏹',
  regions: [],
  noStep: true,
  title: t('Охота', 'Hunt'),
  text: t('Вы сходите с тропы в поисках добычи.', 'You leave the path in search of prey.'),
  choices: [
    {
      id: 'fight',
      label: t('Охота', 'Hunt'),
      success: ok('Добыча ваша: трофеи и пара монет.', 'The prey is yours: trophies and a few coins.', { gold: 30, xp: 45 }),
      fail: ok('Охотник стал добычей. Вы еле доползли до лагеря.', 'The hunter became the prey. You barely crawled back to camp.', { resolve: -2 }),
    },
    { id: 'flee', label: t('Бегство', 'Flee'), success: ok('Вы отступили, потеряв немного сил.', 'You retreated, losing some strength.', { resolve: -1 }) },
  ],
};

/** Хранители с помощью знакомых персонажей: выборы союзников идут первыми. */
const BOSSES_WITH_ALLIES: EventDef[] = BOSSES.map((b) => ({ ...b, choices: [...(NPC_BOSS_CHOICES[b.id] ?? []), ...b.choices] }));

export const STORY_EVENTS: readonly EventDef[] = [...GENERIC, ...FOLLOW_UPS, ...REGIONAL, ...AMBUSHES, ...NPC_EVENTS, ...BOSSES_WITH_ALLIES, HUNT];

export const storyEvent = (id: string): EventDef | undefined => STORY_EVENTS.find((e) => e.id === id);
