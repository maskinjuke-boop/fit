import type { Slot } from './items';
import type { Appearance } from './state';
import type { Choice, EventDef, Faction, NpcId, Txt } from './storyTypes';

/**
 * Персонажи истории: торговка Лира, кузнец Брам, охотница Сильвия, бард Кассиан, ведьма
 * Морвена, гладиаторша Зара и рыцарь Тени Валериан. С каждым герой знакомится в своём
 * регионе, а дальше отношение (от −5 до 10) открывает новые встречи: просьбы, тайны,
 * испытания и помощь в битве с хранителем региона. Отношение сохраняется между путешествиями.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });
const ok = (ru: string, en: string, effect: Choice['success']['effect']) => ({ text: t(ru, en), effect });

export interface NpcDef {
  id: NpcId;
  icon: string;
  name: Txt;
  role: Txt;
  bio: Txt;
  /** Цвет героя (оттенки одежды) и внешность для 3D-портрета. */
  color: string;
  appearance: Appearance;
  equipped: Partial<Record<Slot, string>>;
  faction?: Faction;
  /** Что говорит при встрече: враждебно, нейтрально, по-дружески, близко. */
  lines: [Txt, Txt, Txt, Txt];
}

const look = (a: Partial<Appearance> & Pick<Appearance, 'figure'>): Appearance => ({ skin: 1, hair: 'short', hairColor: 1, beard: false, eyes: 0, ...a });

export const NPCS: Record<NpcId, NpcDef> = {
  lira: {
    id: 'lira',
    icon: '💰',
    name: t('Лира', 'Lira'),
    role: t('Торговка и контрабандистка', 'Trader and smuggler'),
    bio: t('Весёлая и рисковая. Возит товары Гильдии туда, куда не ходят караваны, и знает все тайные тропы.', 'Cheerful and reckless. Carries Guild goods where caravans never go and knows every hidden trail.'),
    color: '#ffb020',
    appearance: look({ figure: 'female', skin: 1, hair: 'long', hairColor: 4, eyes: 2 }),
    equipped: { body: 'dancer_top', legs: 'harem_pants', feet: 'gold_sandals', hands: 'gold_bracelets', neck: 'gold_chain', offhand: 'lantern' },
    faction: 'guild',
    lines: [
      t('«Тебе тут не рады, дружок. Проваливай».', '"You\'re not welcome here, pal. Get lost."'),
      t('«Смотри, но не трогай руками, если не платишь».', '"Look, but don\'t touch unless you\'re paying."'),
      t('«Ах, это ты! Для тебя — скидка и улыбка».', '"Oh, it\'s you! A discount and a smile for you."'),
      t('«Я скучала. Ты же знаешь, что для тебя у меня всегда найдётся место у костра?»', '"I missed you. You know there\'s always a spot by my fire for you?"'),
    ],
  },
  bram: {
    id: 'bram',
    icon: '🔨',
    name: t('Брам', 'Bram'),
    role: t('Кузнец, бывший страж Ордена', 'Blacksmith, former Warden'),
    bio: t('Ворчливый великан с золотыми руками. Двадцать лет назад ушёл из Ордена и не любит об этом говорить.', 'A grumpy giant with golden hands. Left the Order twenty years ago and hates talking about it.'),
    color: '#b5651d',
    appearance: look({ figure: 'male', skin: 3, hair: 'buzz', hairColor: 5, beard: true }),
    equipped: { body: 'open_vest', legs: 'ripped_jeans', feet: 'combat_boots', hands: 'leather_gloves', weapon: 'war_hammer' },
    faction: 'order',
    lines: [
      t('«Ещё шаг — и узнаешь, каков молот в деле».', '"One more step and you\'ll learn what a hammer is for."'),
      t('«Чего надо? Подковы, клинки, советы — всё за деньги».', '"What d\'you want? Horseshoes, blades, advice — all for coin."'),
      t('«А, это ты. Заходи, грейся у горна».', '"Ah, it\'s you. Come in, warm up by the forge."'),
      t('«Ты мне как семья. Мой молот — твой молот».', '"You\'re like family to me. My hammer is your hammer."'),
    ],
  },
  sylvie: {
    id: 'sylvie',
    icon: '🏹',
    name: t('Сильвия', 'Sylvie'),
    role: t('Охотница и хранительница леса', 'Huntress and forest warden'),
    bio: t('Дикая, гордая и быстрая как ветер. Говорит со зверями лучше, чем с людьми.', 'Wild, proud and fast as the wind. Talks to beasts better than to people.'),
    color: '#3ddc84',
    appearance: look({ figure: 'female', skin: 2, hair: 'ponytail', hairColor: 3, eyes: 2 }),
    equipped: { head: 'flower_wreath', body: 'fur_bikini', legs: 'loincloth', feet: 'lace_sandals', back: 'quiver', weapon: 'hunter_bow' },
    faction: 'forest',
    lines: [
      t('«Ещё шаг — и стрела найдёт твоё сердце».', '"One more step and an arrow will find your heart."'),
      t('«Ступай тише. Лес слушает».', '"Walk softly. The forest is listening."'),
      t('«Ты бегаешь почти как я. Почти».', '"You run almost as fast as me. Almost."'),
      t('«Останься со мной до рассвета. Лес красивее, когда ты рядом».', '"Stay with me until dawn. The forest is lovelier when you\'re near."'),
    ],
  },
  cassian: {
    id: 'cassian',
    icon: '🎻',
    name: t('Кассиан', 'Cassian'),
    role: t('Бард и сердцеед', 'Bard and heartbreaker'),
    bio: t('Поёт в каждой таверне от леса до пустыни и в каждой оставляет разбитое сердце.', 'Sings in every tavern from forest to desert and leaves a broken heart in each.'),
    color: '#b57bff',
    appearance: look({ figure: 'male', skin: 0, hair: 'long', hairColor: 3, eyes: 1 }),
    equipped: { head: 'beret', body: 'open_vest', legs: 'harem_pants', feet: 'silk_slippers', neck: 'silk_scarf', offhand: 'war_fan' },
    lines: [
      t('«О тебе я сложу злую песенку».', '"I\'ll write a nasty little song about you."'),
      t('«Монетку барду — и песня станет громче!»', '"A coin for the bard — and the song gets louder!"'),
      t('«Мой герой! Новая баллада почти готова — про тебя, конечно».', '"My hero! The new ballad is almost done — about you, of course."'),
      t('«Все песни теперь только о тебе. Это уже не вдохновение, это любовь».', '"Every song is about you now. That\'s not inspiration anymore, that\'s love."'),
    ],
  },
  morwen: {
    id: 'morwen',
    icon: '🔮',
    name: t('Морвена', 'Morwen'),
    role: t('Ведьма туманных топей', 'Witch of the Misty Marsh'),
    bio: t('Загадочная и опасная. Сестра болотной ведьмы и её давняя соперница.', 'Mysterious and dangerous. Sister of the marsh witch and her old rival.'),
    color: '#7c4dff',
    appearance: look({ figure: 'female', skin: 0, hair: 'long', hairColor: 0, eyes: 3 }),
    equipped: { head: 'lace_veil', body: 'latex_corset', legs: 'lace_garters', feet: 'latex_thigh_boots', hands: 'lace_gloves', neck: 'crystal_pendant', offhand: 'crystal_orb' },
    lines: [
      t('«Я превращу тебя в жабу, и никто не заметит разницы».', '"I\'ll turn you into a toad, and no one will notice the difference."'),
      t('«Любопытная душа… Чего ищешь в моих топях?»', '"A curious traveller… What do you seek in my marsh?"'),
      t('«Ты мне нравишься. Это опасно — для тебя».', '"I like you. That\'s dangerous — for you."'),
      t('«Мои чары на тебя не действуют. Зато твои на меня — ещё как».', '"My spells don\'t work on you. Yours on me, though — very much so."'),
    ],
  },
  zara: {
    id: 'zara',
    icon: '🔱',
    name: t('Зара', 'Zara'),
    role: t('Чемпионка арены пустыни', 'Desert arena champion'),
    bio: t('Непобедимая гладиаторша. Сражается ради свободы, которую у неё отняли хозяева арены.', 'An undefeated gladiator. Fights for the freedom the arena masters took from her.'),
    color: '#ff5a5f',
    appearance: look({ figure: 'female', skin: 4, hair: 'bun', hairColor: 0, eyes: 0 }),
    equipped: { head: 'gold_circlet', body: 'gold_bikini_armor', legs: 'gold_armor_skirt', feet: 'gold_sandals', hands: 'spiked_bracers', back: 'red_cape', weapon: 'trident' },
    lines: [
      t('«Выйдешь на арену — уйдёшь на носилках».', '"Step into the arena and you\'ll leave on a stretcher."'),
      t('«Ещё один, кто пришёл поглазеть. Сражаться умеешь?»', '"Another one come to gawk. Can you even fight?"'),
      t('«С тобой интересно драться. Это редкость».', '"You\'re a worthy rival. That\'s rare."'),
      t('«Рядом с тобой я впервые чувствую себя свободной».', '"Next to you I feel free for the first time."'),
    ],
  },
  valerian: {
    id: 'valerian',
    icon: '🗡️',
    name: t('Валериан', 'Valerian'),
    role: t('Рыцарь Тени', 'Knight of Shadow'),
    bio: t('Лучший мечник Ордена, перешедший на сторону Тёмного чемпиона. Холоден, но в нём осталась честь.', 'The Order\'s finest blade, who went over to the Dark Champion. Cold, yet honour still lives in him.'),
    color: '#455a64',
    appearance: look({ figure: 'male', skin: 1, hair: 'short', hairColor: 0, eyes: 3 }),
    equipped: { body: 'plate_armor', back: 'shadow_cloak', hands: 'steel_gauntlets', feet: 'steel_sabatons', weapon: 'steel_sword', offhand: 'tower_shield' },
    faction: 'order',
    lines: [
      t('«Ты — пыль под сапогами Тени».', '"You are dust beneath the boots of Shadow."'),
      t('«Поверни назад, пока можешь».', '"Turn back while you still can."'),
      t('«Ты сражаешься честно. Я это уважаю».', '"You fight with honour. I respect that."'),
      t('«Ради тебя я снова стал тем, кем был. Спасибо».', '"For your sake I became who I once was. Thank you."'),
    ],
  },
};

/** Ступень отношения: 0 — враждебно, 1 — нейтрально, 2 — дружба, 3 — близость. */
export const npcTier = (affinity: number): 0 | 1 | 2 | 3 => (affinity < 0 ? 0 : affinity < 3 ? 1 : affinity < 6 ? 2 : 3);

export const NPC_TIER_NAME: readonly Txt[] = [t('Враждебно', 'Hostile'), t('Знакомы', 'Acquainted'), t('Друзья', 'Friends'), t('Близки', 'Close')];

// ─── События с персонажами ─────────────────────────────────────────────

export const NPC_EVENTS: EventDef[] = [
  // Лира — торговка и контрабандистка Гильдии.
  {
    id: 'lira_meet',
    icon: '🛞',
    npc: 'lira',
    regions: [0, 1],
    once: true,
    weight: 1.6,
    when: { notMet: 'lira' },
    title: t('Застрявший фургон', 'The stuck wagon'),
    text: t('Рыжая торговка в звенящих браслетах пытается вытащить фургон из грязи. Увидев вас, она подмигивает: «Поможешь девушке — не пожалеешь».', 'A red-haired trader in jingling bracelets is trying to drag her wagon out of the mud. Seeing you, she winks: "Help a girl out — you won\'t regret it."'),
    choices: [
      {
        id: 'push',
        label: t('Вытолкнуть фургон', 'Push the wagon out'),
        trial: { exercise: 'squat', reps: 12 },
        success: ok('Фургон на дороге! Лира смеётся и целует вас в щёку: «Я Лира. Запомни это имя».', 'The wagon is free! Lira laughs and kisses your cheek: "I\'m Lira. Remember the name."', { npc: { lira: 2 }, gold: 30, rep: { guild: 1 } }),
        fail: ok('Колесо так и не поддалось. Лира вздыхает: «Ну, попытка была».', 'The wheel wouldn\'t budge. Lira sighs: "Well, at least you tried."', { npc: { lira: 0 } }),
      },
      {
        id: 'flirt',
        label: t('Сделать комплимент её браслетам', 'Compliment her bracelets'),
        gamble: true,
        success: ok('Лира краснеет и звенит браслетами: «Льстишь. Мне нравится».', 'Lira blushes and jingles her bracelets: "Flatterer. I like it."', { npc: { lira: 2 } }),
        fail: ok('«Браслеты не продаются, дорогуша», — фыркает Лира.', '"The bracelets aren\'t for sale, darling," Lira snorts.', { npc: { lira: 0 } }),
      },
      {
        id: 'haggle',
        label: t('Предложить помощь за плату', 'Offer help for a fee'),
        check: { stat: 'core', diff: 2 },
        success: ok('Торговались вы отчаянно, и Лира оценила: «Деловой подход! Будем дружить».', 'You haggled hard and Lira approved: "A businessperson! We\'ll get along."', { npc: { lira: 1 }, gold: 60 }),
        fail: ok('Лира отмахивается: «Сама справлюсь, жадина».', 'Lira waves you off: "I\'ll manage myself, cheapskate."', { npc: { lira: -1 } }),
      },
      { id: 'pass', label: t('Пройти мимо', 'Walk past'), success: ok('Вы проходите мимо. Лира кричит вслед что-то обидное.', 'You walk past. Lira shouts something rude after you.', { npc: { lira: -1 } }) },
    ],
  },
  {
    id: 'lira_smuggle',
    icon: '📦',
    npc: 'lira',
    regions: [1, 2, 3],
    once: true,
    weight: 1.4,
    when: { npc: ['lira', 1] },
    title: t('Тайный груз', 'Secret cargo'),
    text: t('Лира протягивает запечатанный ящик: «Нужно пронести мимо патруля Ордена. Не спрашивай, что внутри».', 'Lira hands you a sealed crate: "Need to get this past an Order patrol. Don\'t ask what\'s inside."'),
    choices: [
      {
        id: 'carry',
        label: t('Пронести мимо патруля', 'Sneak it past the patrol'),
        check: { stat: 'legs', diff: 3 },
        success: ok('Патруль даже не обернулся. Лира хлопает в ладоши и щедро делится выручкой.', 'The patrol didn\'t even turn around. Lira claps and shares the profit generously.', { npc: { lira: 2 }, gold: 120, rep: { guild: 1, order: -1 } }),
        fail: ok('Стражи отобрали ящик. Лира мрачнеет, но не винит вас.', 'The guards seized the crate. Lira frowns but doesn\'t blame you.', { resolve: -1, rep: { order: -1 } }),
      },
      { id: 'refuse', label: t('Отказаться: закон есть закон', 'Refuse: the law is the law'), success: ok('Лира пожимает плечами: «Честность… Скучно, но честно».', 'Lira shrugs: "Honest. Boring, but honest."', { rep: { order: 1 } }) },
      {
        id: 'report',
        label: t('Сдать Лиру патрулю', 'Turn Lira in to the patrol'),
        success: ok('Орден благодарит за бдительность. Лира смотрит на вас так, что лучше бы ударила.', 'The Order thanks you for your vigilance. Lira\'s look hurts more than a slap.', { npc: { lira: -4 }, rep: { order: 2, guild: -2 }, gold: 60 }),
      },
    ],
  },
  {
    id: 'lira_debt',
    icon: '⛓️',
    npc: 'lira',
    regions: [2, 3, 4],
    once: true,
    weight: 1.5,
    when: { npc: ['lira', 3] },
    title: t('Долги Лиры', 'Lira\'s debts'),
    text: t('Громилы Гильдии прижали Лиру к стене: «Плати долг или отработаешь его по-другому». Она замечает вас и шепчет: «Помоги…»', 'Guild thugs have Lira pinned to a wall: "Pay the debt or work it off another way." She sees you and whispers: "Help…"'),
    choices: [
      {
        id: 'fight',
        label: t('Раскидать громил', 'Throw the thugs around'),
        trial: { exercise: 'pushup', reps: 15 },
        success: ok('Громилы бегут. Лира бросается вам на шею: «Я твоя должница. Навсегда».', 'The thugs run. Lira throws her arms around you: "I owe you. Forever."', { npc: { lira: 3 }, flag: ['lira_ally'], rep: { guild: -1 } }),
        fail: ok('Громил было слишком много. Лира откупилась сама — и злится.', 'There were too many thugs. Lira paid them off herself — and she\'s angry.', { resolve: -2, npc: { lira: -1 } }),
      },
      { id: 'pay', label: t('Заплатить её долг', 'Pay her debt'), cost: 100, success: ok('Громилы пересчитывают монеты и уходят. Лира не находит слов и просто обнимает вас.', 'The thugs count the coins and leave. Lira is lost for words and just hugs you.', { npc: { lira: 3 }, flag: ['lira_ally'] }) },
      {
        id: 'guild',
        label: t('Договориться через Гильдию', 'Settle it through the Guild'),
        requires: { rep: ['guild', 2] },
        success: ok('Ваше слово в Гильдии весит больше долга. Громилы извиняются перед Лирой.', 'Your word in the Guild outweighs the debt. The thugs apologise to Lira.', { npc: { lira: 2 }, flag: ['lira_ally'] }),
      },
    ],
  },
  {
    id: 'lira_night',
    icon: '🌙',
    npc: 'lira',
    once: true,
    weight: 1.2,
    when: { npc: ['lira', 6] },
    title: t('Ночь у костра с Лирой', 'A night by the fire with Lira'),
    text: t('Лира раскладывает плед у костра и достаёт бутылку вина: «Сегодня никаких сделок. Только мы и звёзды».', 'Lira spreads a blanket by the fire and pulls out a bottle of wine: "No deals tonight. Just us and the stars."'),
    choices: [
      { id: 'stay', label: t('Остаться до утра', 'Stay until morning'), success: ok('Ночь была тёплой, а утро — нежным. Лира оставляет в вашей сумке подарок.', 'The night was warm and the morning tender. Lira leaves a gift in your bag.', { resolve: 4, loot: true, npc: { lira: 1 } }) },
      { id: 'talk', label: t('Проговорить всю ночь', 'Talk all night'), success: ok('Вы узнали о Лире всё — и она о вас.', 'You learned everything about Lira — and she about you.', { resolve: 2, npc: { lira: 1 }, flag: ['rumor'] }) },
    ],
  },

  // Брам — кузнец, бывший страж Ордена.
  {
    id: 'bram_meet',
    icon: '⚒️',
    npc: 'bram',
    regions: [1],
    once: true,
    weight: 1.6,
    when: { notMet: 'bram' },
    title: t('Кузница на перевале', 'The forge on the pass'),
    text: t('В горной кузнице седой великан ругается на сломанные мехи: горн гаснет, а заказ не ждёт.', 'In a mountain forge a grey-haired giant curses at his broken bellows: the forge is dying and the order won\'t wait.'),
    choices: [
      {
        id: 'bellows',
        label: t('Раздувать горн руками', 'Work the bellows by hand'),
        trial: { exercise: 'jumping_jack', reps: 30 },
        success: ok('Горн ревёт! Брам хлопает вас по плечу так, что гудит в ушах: «Есть сила. Выкую тебе кое-что».', 'The forge roars! Bram slaps your shoulder so hard your ears ring: "You\'ve got strength. I\'ll forge you something."', { npc: { bram: 2 }, loot: true }),
        fail: ok('Вы выдохлись раньше горна. Брам ворчит, но наливает вам кружку.', 'You ran out of breath before the forge did. Bram grumbles but pours you a mug.', { npc: { bram: 0 }, resolve: 1 }),
      },
      { id: 'order', label: t('Спросить о гербе Ордена на стене', 'Ask about the Order crest on the wall'), success: ok('«Старая история», — бурчит Брам, но смотрит на вас внимательнее.', '"Old story," Bram grunts, but looks at you more closely.', { npc: { bram: 1 }, rep: { order: 1 } }) },
      { id: 'mock', label: t('Посмеяться над стариком', 'Laugh at the old man'), success: ok('Брам молча берёт молот. Вы предпочитаете уйти.', 'Bram silently picks up his hammer. You decide to leave.', { npc: { bram: -2 }, resolve: -1 }) },
    ],
  },
  {
    id: 'bram_spar',
    icon: '🥊',
    npc: 'bram',
    regions: [1, 2, 3],
    weight: 1.2,
    when: { npc: ['bram', 1] },
    title: t('Урок Брама', 'Bram\'s lesson'),
    text: t('Брам снимает фартук: «Покажу пару приёмов стражей. Если выдержишь».', 'Bram takes off his apron: "I\'ll show you a few Warden moves. If you can take it."'),
    choices: [
      {
        id: 'spar',
        label: t('Спарринг', 'Spar'),
        trial: { exercise: 'pushup', reps: 15 },
        success: ok('Брам доволен: «Руку поставил правильно. Из тебя выйдет толк».', 'Bram is pleased: "Your guard is right. You\'ll amount to something."', { npc: { bram: 2 }, xp: 80 }),
        fail: ok('Брам уложил вас одним движением и помог подняться.', 'Bram put you down with one move and helped you up.', { npc: { bram: 1 }, resolve: -1 }),
      },
      {
        id: 'watch',
        label: t('Смотреть и запоминать', 'Watch and learn'),
        check: { stat: 'core', diff: 2 },
        success: ok('Вы всё схватили с первого раза. Брам одобрительно хмыкает.', 'You picked it all up at once. Bram grunts approvingly.', { npc: { bram: 1 }, xp: 50 }),
        fail: ok('В голове каша. «Повторим», — вздыхает Брам.', 'Your head is a mess. "We\'ll repeat it," Bram sighs.', {}),
      },
    ],
  },
  {
    id: 'bram_secret',
    icon: '📜',
    npc: 'bram',
    regions: [2, 3, 4],
    once: true,
    weight: 1.5,
    when: { npc: ['bram', 4] },
    title: t('Тайна Брама', 'Bram\'s secret'),
    text: t('У костра Брам признаётся: двадцать лет назад он бросил пост и сбежал из Ордена. Его до сих пор ищут как дезертира.', 'By the fire Bram confesses: twenty years ago he deserted his post and fled the Order. They still hunt him as a deserter.'),
    choices: [
      { id: 'keep', label: t('Сохранить его тайну', 'Keep his secret'), success: ok('Брам долго молчит, потом кладёт руку вам на плечо: «Когда понадоблюсь — позови».', 'Bram is silent for a long time, then puts a hand on your shoulder: "When you need me — call."', { npc: { bram: 3 }, flag: ['bram_ally'] }) },
      {
        id: 'return',
        label: t('Уговорить вернуться в Орден', 'Convince him to return to the Order'),
        check: { stat: 'core', diff: 4 },
        success: ok('Брам решается. Орден принимает его, а вас благодарит.', 'Bram makes up his mind. The Order takes him back and thanks you.', { npc: { bram: 2 }, flag: ['bram_ally'], rep: { order: 2 } }),
        fail: ok('«Не дави на меня», — рычит Брам.', '"Don\'t push me," Bram growls.', { npc: { bram: -1 } }),
      },
      { id: 'betray', label: t('Выдать его Ордену', 'Hand him over to the Order'), success: ok('Стражи уводят Брама. Он не оборачивается.', 'The Wardens lead Bram away. He doesn\'t look back.', { npc: { bram: -6 }, rep: { order: 2 }, gold: 100 }) },
    ],
  },

  // Сильвия — охотница и хранительница леса.
  {
    id: 'sylvie_meet',
    icon: '🎯',
    npc: 'sylvie',
    regions: [0],
    once: true,
    weight: 1.8,
    when: { notMet: 'sylvie' },
    title: t('Стрела у виска', 'An arrow at your temple'),
    text: t('Стрела вонзается в дерево у самого лица. Из листвы спускается охотница в мехах: «Ты на земле леса. Назови причину не стрелять снова».', 'An arrow thuds into the tree right by your face. A huntress in furs drops from the leaves: "You\'re on forest land. Give me a reason not to shoot again."'),
    choices: [
      { id: 'peace', label: t('Опустить оружие', 'Lower your weapon'), success: ok('Охотница опускает лук: «Я Сильвия. Иди за мной и не шуми».', 'The huntress lowers her bow: "I\'m Sylvie. Follow me and keep quiet."', { npc: { sylvie: 1 }, rep: { forest: 1 } }) },
      {
        id: 'race',
        label: t('Предложить забег до реки', 'Challenge her to a race to the river'),
        trial: { exercise: 'jumping_jack', reps: 25 },
        success: ok('Вы прибежали почти одновременно. Сильвия впервые улыбается.', 'You arrive almost together. Sylvie smiles for the first time.', { npc: { sylvie: 2 }, rep: { forest: 1 } }),
        fail: ok('Сильвия ждёт вас у реки и насмешливо машет рукой.', 'Sylvie waits for you at the river and waves mockingly.', { npc: { sylvie: 1 } }),
      },
      {
        id: 'flirt',
        label: t('Сказать, что её глаза красивее леса', 'Say her eyes are lovelier than the forest'),
        gamble: true,
        success: ok('Сильвия заливается краской и отворачивается, но лук опускает.', 'Sylvie flushes red and looks away — but lowers the bow.', { npc: { sylvie: 2 } }),
        fail: ok('Вторая стрела проходит в пальце от уха. «Не люблю болтунов».', 'A second arrow passes an inch from your ear. "I don\'t like chatterers."', { npc: { sylvie: -1 }, resolve: -1 }),
      },
      { id: 'threaten', label: t('Пригрозить', 'Threaten her'), success: ok('Из кустов выходят волки. Вам лучше уйти.', 'Wolves step out of the bushes. You\'d better leave.', { npc: { sylvie: -3 }, rep: { forest: -2 }, resolve: -1 }) },
    ],
  },
  {
    id: 'sylvie_hunt',
    icon: '🐗',
    npc: 'sylvie',
    regions: [0, 1, 2],
    weight: 1.2,
    when: { npc: ['sylvie', 1] },
    title: t('Охота с Сильвией', 'A hunt with Sylvie'),
    text: t('Сильвия выслеживает дикого кабана: «Загоним его вместе? Ты гонишь, я стреляю».', 'Sylvie is tracking a wild boar: "Shall we take him together? You drive, I shoot."'),
    choices: [
      {
        id: 'drive',
        label: t('Гнать кабана', 'Drive the boar'),
        trial: { exercise: 'squat', reps: 15 },
        success: ok('Точный выстрел — и у вас ужин. Сильвия делится лучшим куском.', 'One precise shot and dinner is served. Sylvie shares the best cut.', { npc: { sylvie: 2 }, resolve: 2 }),
        fail: ok('Кабан ушёл. Сильвия смеётся: «В следующий раз».', 'The boar got away. Sylvie laughs: "Next time."', { npc: { sylvie: 1 } }),
      },
      {
        id: 'track',
        label: t('Читать следы', 'Read the tracks'),
        check: { stat: 'legs', diff: 2 },
        success: ok('Вы нашли лежбище первым. Сильвия впечатлена.', 'You found the lair first. Sylvie is impressed.', { npc: { sylvie: 1 }, xp: 60 }),
        fail: ok('Следы привели к ручью и пропали.', 'The tracks led to a stream and vanished.', {}),
      },
    ],
  },
  {
    id: 'sylvie_trap',
    icon: '🪤',
    npc: 'sylvie',
    regions: [0, 1, 2, 3],
    once: true,
    weight: 1.5,
    when: { npc: ['sylvie', 3] },
    title: t('Капкан браконьеров', 'The poachers\' trap'),
    text: t('Сильвия попала в капкан браконьеров. Нога в крови, а вдалеке лают их собаки.', 'Sylvie is caught in a poachers\' trap. Her leg is bleeding, and their dogs are barking in the distance.'),
    choices: [
      {
        id: 'carry',
        label: t('Разжать капкан и унести её', 'Pry the trap open and carry her'),
        trial: { exercise: 'squat', reps: 20 },
        success: ok('Вы несёте Сильвию до самого убежища. Она прижимается к вам и шепчет: «Теперь я твоя должница».', 'You carry Sylvie all the way to her hideout. She holds you close and whispers: "Now I owe you."', { npc: { sylvie: 3 }, flag: ['sylvie_ally'], rep: { forest: 2 } }),
        fail: ok('Сил не хватило, и Сильвия выбралась сама. Собаки ушли ни с чем.', 'You weren\'t strong enough, and Sylvie got herself out. The dogs left empty-handed.', { resolve: -2 }),
      },
      {
        id: 'fairy',
        label: t('Фея исцелит рану', 'The fairy heals the wound'),
        requires: { companion: 'fairy' },
        success: ok('Свет феи затягивает рану. Сильвия смотрит на вас иначе.', 'The fairy\'s light closes the wound. Sylvie looks at you differently now.', { npc: { sylvie: 3 }, flag: ['sylvie_ally'] }),
      },
    ],
  },

  // Кассиан — бард и сердцеед.
  {
    id: 'cassian_meet',
    icon: '🎶',
    npc: 'cassian',
    once: true,
    weight: 1.4,
    when: { notMet: 'cassian' },
    title: t('Песня в таверне', 'A song in the tavern'),
    text: t('Светловолосый бард поёт о прекрасных воительницах и отважных героях. Заметив вас, он подмигивает и не прерывает песню.', 'A fair-haired bard sings of beautiful warrior women and brave heroes. Noticing you, he winks without missing a note.'),
    choices: [
      {
        id: 'sing',
        label: t('Подпеть припев', 'Sing along to the chorus'),
        check: { stat: 'core', diff: 2 },
        success: ok('Таверна аплодирует дуэту. «Кассиан, к вашим услугам», — кланяется бард.', 'The tavern applauds the duet. "Cassian, at your service," the bard bows.', { npc: { cassian: 2 }, resolve: 1 }),
        fail: ok('Вы фальшивите. Кассиан смеётся, но приглашает за стол.', 'You sing off-key. Cassian laughs but invites you to his table.', { npc: { cassian: 1 } }),
      },
      {
        id: 'dance',
        label: t('Пуститься в пляс', 'Start dancing'),
        trial: { exercise: 'jumping_jack', reps: 20 },
        success: ok('Вы танцевали до упаду. Кассиан пишет новый куплет — про вас.', 'You danced until you dropped. Cassian writes a new verse — about you.', { npc: { cassian: 2 }, resolve: 2 }),
        fail: ok('Вы запыхались после первого круга.', 'You were out of breath after the first round.', { npc: { cassian: 0 } }),
      },
      { id: 'pay', label: t('Заказать песню о себе', 'Order a song about yourself'), cost: 30, success: ok('Кассиан поёт о вас так, будто вы спасли мир. Слава летит впереди.', 'Cassian sings about you as if you saved the world. Your fame races ahead.', { npc: { cassian: 1 }, flag: ['hero'] }) },
      { id: 'heckle', label: t('Освистать', 'Boo him'), success: ok('Кассиан сочиняет о вас обидную частушку. Таверна хохочет.', 'Cassian makes up a mocking ditty about you. The tavern roars.', { npc: { cassian: -2 }, resolve: -1 }) },
    ],
  },
  {
    id: 'cassian_muse',
    icon: '🖋️',
    npc: 'cassian',
    weight: 1.2,
    when: { npc: ['cassian', 2] },
    title: t('Муза для барда', 'A muse for the bard'),
    text: t('Кассиан грызёт перо: «Мне нужна история для новой баллады. Настоящая. Расскажешь?»', 'Cassian chews his quill: "I need a story for a new ballad. A real one. Will you tell me?"'),
    choices: [
      { id: 'truth', label: t('Рассказать правду о пути', 'Tell the truth about your journey'), success: ok('Кассиан слушает, затаив дыхание. «Это лучше любой выдумки».', 'Cassian listens breathlessly. "This beats any fiction."', { npc: { cassian: 2 }, xp: 50 }) },
      {
        id: 'boast',
        label: t('Приукрасить', 'Embellish it'),
        gamble: true,
        success: ok('Баллада вышла громкой. Слушатели бросают монеты.', 'The ballad is a hit. Listeners throw coins.', { npc: { cassian: 1 }, gold: 60, flag: ['hero'] }),
        fail: ok('Кассиан поднимает бровь: «Драконов в лесу не бывает, дорогуша».', 'Cassian raises an eyebrow: "There are no dragons in the forest, darling."', { npc: { cassian: -1 } }),
      },
      {
        id: 'pose',
        label: t('Позировать для портрета героя', 'Pose for a hero\'s portrait'),
        trial: { exercise: 'lunge', reps: 16 },
        success: ok('Вы стояли неподвижно, как статуя. Кассиан набросал портрет — и долго на него смотрел.', 'You stood still as a statue. Cassian sketched a portrait — and stared at it for a long time.', { npc: { cassian: 2 }, resolve: 1 }),
        fail: ok('Вы шевельнулись — портрет смазан.', 'You moved — the portrait is smudged.', {}),
      },
    ],
  },
  {
    id: 'cassian_duel',
    icon: '🤺',
    npc: 'cassian',
    once: true,
    weight: 1.5,
    when: { npc: ['cassian', 4] },
    title: t('Ревнивый вельможа', 'A jealous nobleman'),
    text: t('Ревнивый вельможа вызывает Кассиана на дуэль — бард явно провёл ночь с его невестой. Кассиан бледен: «Я пою, а не дерусь…»', 'A jealous nobleman challenges Cassian to a duel — the bard clearly spent the night with his bride. Cassian is pale: "I sing, I don\'t fight…"'),
    choices: [
      {
        id: 'stand',
        label: t('Драться вместо Кассиана', 'Fight in Cassian\'s place'),
        trial: { exercise: 'pushup', reps: 18 },
        success: ok('Вельможа повержен и бежит. Кассиан целует вас при всех: «Мой герой!»', 'The nobleman is beaten and flees. Cassian kisses you in front of everyone: "My saviour!"', { npc: { cassian: 3 }, flag: ['cassian_ally'] }),
        fail: ok('Вельможа победил. Кассиан расплатился за честь кошельком.', 'The nobleman won. Cassian paid for his honour with his purse.', { resolve: -2 }),
      },
      {
        id: 'talk',
        label: t('Уладить спор словами', 'Settle it with words'),
        check: { stat: 'core', diff: 3 },
        success: ok('Вы убедили вельможу, что невеста любит его. Кассиан поражён вашим красноречием.', 'You convinced the nobleman his bride loves him. Cassian is amazed by your eloquence.', { npc: { cassian: 2 }, flag: ['cassian_ally'] }),
        fail: ok('Вельможа не слушает. Кассиан сбегает через окно.', 'The nobleman won\'t listen. Cassian escapes through the window.', { npc: { cassian: -1 } }),
      },
      { id: 'leave', label: t('Пусть сам разбирается', 'Let him handle it'), success: ok('Кассиан справился, но запомнил, что вы ушли.', 'Cassian managed, but remembers that you left.', { npc: { cassian: -2 } }) },
    ],
  },

  // Морвена — ведьма туманных топей.
  {
    id: 'morwen_meet',
    icon: '🧪',
    npc: 'morwen',
    regions: [2],
    once: true,
    weight: 1.8,
    when: { notMet: 'morwen' },
    title: t('Хижина в тумане', 'A hut in the fog'),
    text: t('Из тумана появляется женщина в кружевной вуали. Она протягивает флакон с мерцающим зельем: «Выпей — и узнаешь свою судьбу. Или не узнаешь».', 'A woman in a lace veil appears from the fog. She offers a vial of shimmering potion: "Drink — and learn your fate. Or don\'t."'),
    choices: [
      {
        id: 'drink',
        label: t('Выпить зелье', 'Drink the potion'),
        gamble: true,
        success: ok('По телу разливается тепло. Ведьма улыбается: «Морвена. Ты мне подходишь».', 'Warmth spreads through your body. The witch smiles: "Morwen. You\'ll do."', { npc: { morwen: 2 }, flag: ['blessed'] }),
        fail: ok('Голова кружится. Морвена хихикает: «Ой. Не то зелье».', 'Your head spins. Morwen giggles: "Oops. Wrong potion."', { npc: { morwen: 1 }, flag: ['cursed'] }),
      },
      {
        id: 'secret',
        label: t('Обменять зелье на тайну', 'Trade the potion for a secret'),
        check: { stat: 'core', diff: 3 },
        success: ok('Морвена шепчет о тайной тропе через топи. «Береги себя».', 'Morwen whispers of a hidden path through the marsh. "Take care, traveller."', { npc: { morwen: 2 }, flag: ['rumor'] }),
        fail: ok('«Мои тайны стоят дороже», — Морвена растворяется в тумане.', '"My secrets are worth more," Morwen dissolves into the fog.', { npc: { morwen: 0 } }),
      },
      { id: 'refuse', label: t('Вежливо отказаться', 'Politely decline'), success: ok('«Осторожность — это мудро», — кивает Морвена.', '"Cautious. That\'s wise," Morwen nods.', { npc: { morwen: 1 } }) },
      { id: 'burn', label: t('Сжечь ведьмину хижину', 'Burn the witch\'s hut'), success: ok('Хижина горит. Морвена исчезает, оставив проклятие.', 'The hut burns. Morwen vanishes, leaving a curse behind.', { npc: { morwen: -4 }, flag: ['cursed'], rep: { order: 1 } }) },
    ],
  },
  {
    id: 'morwen_herbs',
    icon: '🌿',
    npc: 'morwen',
    regions: [2, 3],
    weight: 1.3,
    when: { npc: ['morwen', 1] },
    title: t('Травы для Морвены', 'Herbs for Morwen'),
    text: t('Морвене нужна лунная трава с самой топкой части болота. «Принесёшь — сварю тебе кое-что приятное».', 'Morwen needs moonwort from the deepest part of the bog. "Bring it — and I\'ll brew you something nice."'),
    choices: [
      {
        id: 'wade',
        label: t('Пробраться через трясину', 'Wade through the bog'),
        trial: { exercise: 'squat', reps: 15 },
        success: ok('Трава собрана. Морвена варит зелье, от которого по телу бегут мурашки.', 'The herbs are gathered. Morwen brews a potion that sends shivers down your spine.', { npc: { morwen: 2 }, resolve: 3 }),
        fail: ok('Трясина едва не утянула вас. Морвена вытаскивает вас за шиворот.', 'The bog nearly swallowed you. Morwen pulls you out by the collar.', { npc: { morwen: 1 }, resolve: -1 }),
      },
      { id: 'buy', label: t('Купить траву у местных', 'Buy herbs from the locals'), cost: 60, success: ok('Морвена фыркает, но зелье варит.', 'Morwen snorts, but brews the potion.', { npc: { morwen: 1 }, resolve: 2 }) },
    ],
  },
  {
    id: 'morwen_pact',
    icon: '🕯️',
    npc: 'morwen',
    regions: [2],
    once: true,
    weight: 1.6,
    when: { npc: ['morwen', 3] },
    title: t('Сделка с Морвеной', 'A pact with Morwen'),
    text: t('Морвена снимает вуаль: «Болотная ведьма — моя сестра. Она держит топи в страхе. Помоги мне, и я помогу тебе в бою с ней».', 'Morwen lifts her veil: "The marsh witch is my sister. She keeps the marsh in fear. Help me, and I\'ll help you fight her."'),
    choices: [
      {
        id: 'blood',
        label: t('Скрепить договор', 'Seal the pact'),
        trial: { exercise: 'situp', reps: 20 },
        success: ok('Свечи вспыхивают. Морвена касается ваших губ холодными пальцами: «Теперь мы связаны».', 'The candles flare. Morwen touches your lips with cold fingers: "Now we are bound."', { npc: { morwen: 3 }, flag: ['morwen_ally'] }),
        fail: ok('Ритуал прервался. «Ещё не время», — шепчет Морвена.', 'The ritual broke off. "Not yet," Morwen whispers.', { npc: { morwen: 0 } }),
      },
      { id: 'refuse', label: t('Не вмешиваться в семейные дела', 'Stay out of family business'), success: ok('Морвена холодно кивает.', 'Morwen nods coldly.', { npc: { morwen: -1 } }) },
    ],
  },

  // Зара — чемпионка арены пустыни.
  {
    id: 'zara_meet',
    icon: '🏟️',
    npc: 'zara',
    regions: [3],
    once: true,
    weight: 1.8,
    when: { notMet: 'zara' },
    title: t('Арена пустыни', 'The desert arena'),
    text: t('Толпа ревёт: на песок выходит Зара в золотых латах. Она указывает трезубцем на вас: «Ты. Выходи».', 'The crowd roars as Zara steps onto the sand in golden armour. She points her trident at you: "You. Step in."'),
    choices: [
      {
        id: 'wrestle',
        label: t('Принять вызов', 'Accept the challenge'),
        trial: { exercise: 'situp', reps: 20 },
        success: ok('Зара на лопатках — впервые за много лет. Она смеётся и протягивает руку: «Наконец-то есть с кем сразиться».', 'Zara is pinned — for the first time in years. She laughs and offers her hand: "Finally, someone worthy."', { npc: { zara: 3 }, xp: 100, title: 'wrestler' }),
        fail: ok('Зара уложила вас за минуту, но уважительно кивнула.', 'Zara pinned you in a minute but gave a respectful nod.', { npc: { zara: 1 }, resolve: -1 }),
      },
      { id: 'bet', label: t('Поставить на Зару', 'Bet on Zara'), cost: 50, gamble: true, success: ok('Зара победила, ставка сыграла.', 'Zara won, and so did your bet.', { gold: 120, npc: { zara: 1 } }), fail: ok('Зара проиграла — впервые. Она злится на весь мир.', 'Zara lost — for the first time. She\'s angry at the whole world.', { npc: { zara: 0 } }) },
      { id: 'decline', label: t('Отказаться', 'Decline'), success: ok('«Жаль. Я думала, ты смелее», — бросает Зара под смех толпы.', '"Pity. I thought you were braver," Zara spits as the crowd laughs.', { npc: { zara: -1 }, resolve: -1 }) },
    ],
  },
  {
    id: 'zara_train',
    icon: '🏋️',
    npc: 'zara',
    regions: [3, 4],
    weight: 1.3,
    when: { npc: ['zara', 2] },
    title: t('Тренировка с Зарой', 'Training with Zara'),
    text: t('На рассвете Зара тренируется на песке: «Встанешь рядом? Посмотрим, кто сдастся первым».', 'At dawn Zara trains on the sand: "Join me? Let\'s see who quits first."'),
    choices: [
      {
        id: 'train',
        label: t('Тренироваться вместе', 'Train together'),
        trial: { exercise: 'pushup', reps: 20 },
        success: ok('Вы закончили одновременно. Зара, тяжело дыша, улыбается: «Мне нравится, как ты держишься».', 'You finish at the same time. Breathing hard, Zara smiles: "I like how you hold up."', { npc: { zara: 2 }, xp: 100 }),
        fail: ok('Зара продолжает без вас. «Завтра снова».', 'Zara keeps going without you. "Again tomorrow."', { npc: { zara: 1 } }),
      },
      {
        id: 'massage',
        label: t('Размять ей плечи после тренировки', 'Massage her shoulders after training'),
        requires: { npc: ['zara', 4] },
        success: ok('Зара закрывает глаза и впервые расслабляется. «Не останавливайся…»', 'Zara closes her eyes and relaxes for the first time. "Don\'t stop…"', { npc: { zara: 2 }, resolve: 2 }),
      },
    ],
  },
  {
    id: 'zara_freedom',
    icon: '🔓',
    npc: 'zara',
    regions: [3],
    once: true,
    weight: 1.6,
    when: { npc: ['zara', 4] },
    title: t('Свобода Зары', 'Zara\'s freedom'),
    text: t('Хозяева арены держат Зару как собственность. Ночью она шепчет: «Помоги мне уйти. Я пойду с тобой до конца».', 'The arena masters keep Zara as property. At night she whispers: "Help me get out. I\'ll follow you to the end."'),
    choices: [
      {
        id: 'escape',
        label: t('Устроить побег', 'Stage an escape'),
        check: { stat: 'legs', diff: 3 },
        success: ok('Ворота открыты, стража спит. Зара оглядывается на арену и берёт вас за руку.', 'The gates are open, the guards asleep. Zara glances back at the arena and takes your hand.', { npc: { zara: 3 }, flag: ['zara_ally'], rep: { guild: -1 } }),
        fail: ok('Побег сорвался. Зару заперли, а вас выгнали из города.', 'The escape failed. Zara was locked up and you were thrown out of town.', { npc: { zara: -1 }, resolve: -2 }),
      },
      { id: 'buy', label: t('Выкупить её свободу', 'Buy her freedom'), cost: 200, success: ok('Хозяева пересчитывают золото. Зара свободна — и выбирает идти с вами.', 'The masters count the gold. Zara is free — and chooses to go with you.', { npc: { zara: 4 }, flag: ['zara_ally'] }) },
    ],
  },

  // Валериан — рыцарь Тени.
  {
    id: 'valerian_bridge',
    icon: '🌉',
    npc: 'valerian',
    regions: [1, 2],
    once: true,
    weight: 1.5,
    when: { notMet: 'valerian' },
    title: t('Рыцарь на мосту', 'The knight on the bridge'),
    text: t('Рыцарь в чёрном плаще преграждает мост: «Именем Тени, путь закрыт. Поверни назад или сразись».', 'A knight in a black cloak blocks the bridge: "In the name of Shadow, the way is closed. Turn back or fight."'),
    choices: [
      {
        id: 'duel',
        label: t('Сразиться', 'Fight'),
        trial: { exercise: 'pushup', reps: 15 },
        success: ok('Ваш удар выбил его меч. Рыцарь отступает: «Валериан запомнит тебя».', 'Your strike knocks his sword away. The knight steps aside: "Valerian will remember you."', { npc: { valerian: 2 }, xp: 120 }),
        fail: ok('Рыцарь отбросил вас: «Слабо. Возвращайся, когда окрепнешь».', 'The knight throws you back: "Weak. Come back stronger."', { npc: { valerian: 0 }, resolve: -2 }),
      },
      {
        id: 'honor',
        label: t('Напомнить о клятве Ордена', 'Remind him of the Order\'s oath'),
        requires: { rep: ['order', 1] },
        success: ok('Рыцарь вздрагивает и опускает меч. «Проходи. Я… помню клятву».', 'The knight flinches and lowers his sword. "Pass. I… remember the oath."', { npc: { valerian: 2 } }),
      },
      { id: 'toll', label: t('Заплатить за проход', 'Pay the toll'), cost: 40, success: ok('Рыцарь презрительно берёт монеты.', 'The knight takes the coins with contempt.', { npc: { valerian: -1 } }) },
    ],
  },
  {
    id: 'valerian_wounded',
    icon: '🩸',
    npc: 'valerian',
    regions: [3, 4],
    once: true,
    weight: 1.6,
    when: { npc: ['valerian', 1] },
    title: t('Раненый рыцарь', 'The wounded knight'),
    text: t('Валериан лежит у дороги — его ранили свои же. «Чемпион не прощает сомнений… А я сомневаюсь».', 'Valerian lies by the road — wounded by his own side. "The Champion doesn\'t forgive doubt… And I doubt."'),
    choices: [
      {
        id: 'heal',
        label: t('Перевязать раны', 'Bandage his wounds'),
        success: ok('Валериан долго смотрит на вас: «Зачем ты помогаешь врагу?» — «Ты не враг». Он молча кивает.', 'Valerian looks at you for a long time: "Why help an enemy?" — "You\'re not one." He nods silently.', { npc: { valerian: 3 }, flag: ['valerian_turn'], resolve: -1 }),
      },
      {
        id: 'carry',
        label: t('Донести до лекаря', 'Carry him to a healer'),
        trial: { exercise: 'squat', reps: 20 },
        success: ok('Лекарь спас Валериана. Рыцарь клянётся вернуться на сторону света.', 'The healer saved Valerian. The knight swears to return to the side of light.', { npc: { valerian: 4 }, flag: ['valerian_turn'], rep: { order: 1 } }),
        fail: ok('Вы не донесли его. Валериан выжил, но ушёл молча.', 'You couldn\'t carry him all the way. Valerian survived but left without a word.', { npc: { valerian: 1 } }),
      },
      { id: 'leave', label: t('Оставить на дороге', 'Leave him on the road'), success: ok('Вы уходите. За спиной слышен стон.', 'You walk away. A groan sounds behind you.', { npc: { valerian: -2 } }) },
    ],
  },
];

/** Помощь знакомых в битвах с хранителями: дополнительные выборы, если персонаж стал союзником. */
export const NPC_BOSS_CHOICES: Record<string, Choice[]> = {
  boss_bear: [
    {
      id: 'sylvie',
      label: t('Сильвия поговорит с медведем', 'Sylvie talks to the bear'),
      requires: { flag: 'sylvie_ally' },
      success: ok('Сильвия кладёт ладонь на морду медведя и что-то шепчет. Хранитель уходит в чащу.', 'Sylvie lays her palm on the bear\'s muzzle and whispers. The guardian walks into the thicket.', { clear: true, title: 'forest_friend', npc: { sylvie: 1 } }),
    },
  ],
  boss_giant: [
    {
      id: 'bram',
      label: t('Брам расколет камень молотом', 'Bram splits the stone with his hammer'),
      requires: { flag: 'bram_ally' },
      success: ok('Один удар молота Брама — и великан рассыпается грудой камней.', 'One blow of Bram\'s hammer and the giant crumbles into rubble.', { clear: true, title: 'pass_breaker', npc: { bram: 1 } }),
    },
  ],
  boss_witch: [
    {
      id: 'morwen',
      label: t('Морвена запечатает сестру', 'Morwen seals her sister'),
      requires: { flag: 'morwen_ally' },
      success: ok('Сёстры сходятся в вихре чар. Морвена побеждает и запечатывает сестру в старом зеркале.', 'The sisters clash in a storm of spells. Morwen wins and seals her sister in an old mirror.', { clear: true, title: 'marsh_walker', npc: { morwen: 1 } }),
    },
    {
      id: 'cassian',
      label: t('Кассиан споёт колыбельную', 'Cassian sings a lullaby'),
      requires: { flag: 'cassian_ally' },
      success: ok('Ведьма засыпает под песню Кассиана. Вы тихо проходите мимо.', 'The witch falls asleep to Cassian\'s song. You quietly walk past.', { clear: true, npc: { cassian: 1 } }),
    },
  ],
  boss_serpent: [
    {
      id: 'zara',
      label: t('Зара пригвоздит змея трезубцем', 'Zara pins the serpent with her trident'),
      requires: { flag: 'zara_ally' },
      success: ok('Зара в прыжке вонзает трезубец в змея. Песок затихает.', 'Zara leaps and drives her trident into the serpent. The sand falls silent.', { clear: true, title: 'dune_runner', npc: { zara: 1 } }),
    },
    {
      id: 'lira',
      label: t('Лира бросит дымовую бомбу', 'Lira throws a smoke bomb'),
      requires: { flag: 'lira_ally' },
      success: ok('Змей мечется в дыму, а Лира уводит вас тайной тропой контрабандистов.', 'The serpent thrashes in the smoke while Lira leads you along a smugglers\' trail.', { clear: true, npc: { lira: 1 } }),
    },
  ],
  boss_champion: [
    {
      id: 'valerian',
      label: t('Валериан встанет рядом с вами', 'Valerian stands beside you'),
      requires: { flag: 'valerian_turn' },
      success: ok('Валериан обнажает меч против бывшего господина. Вдвоём вы побеждаете Тёмного чемпиона.', 'Valerian draws his sword against his former master. Together you defeat the Dark Champion.', { victory: true, title: 'legend', npc: { valerian: 2 } }),
    },
  ],
};
