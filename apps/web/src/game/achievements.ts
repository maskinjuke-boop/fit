import type { ExerciseId } from '../tracking/exercise';
import { STATS } from './config';
import type { GameEvent } from './engine';
import { ITEMS } from './items';
import { levelOf } from './levels';
import { addXp } from './progress';
import type { GameState } from './state';
import { GYMS } from './lifeContent';
import type { Txt } from './lifeTypes';

/**
 * Достижения: разовые награды за вехи в тренировках, серии, уровни, коллекцию и историю.
 * Некоторые дают титул — его можно показать под именем героя.
 */

const t = (ru: string, en: string): Txt => ({ ru, en });

export interface AchievementDef {
  id: string;
  icon: string;
  name: Txt;
  desc: Txt;
  /** Текущее значение и цель — для полоски прогресса. */
  progress(s: GameState): [number, number];
  reward: { xp: number; gold: number };
  title?: string;
}

const reps = (s: GameState, ...ids: ExerciseId[]): number => ids.reduce((a, id) => a + (s.lifetimeReps[id] ?? 0), 0);
const allReps = (s: GameState): number => Object.values(s.lifetimeReps).reduce((a, n) => a + (n ?? 0), 0);
const pullups = (s: GameState): number => reps(s, 'pullup', 'pullup_negative') + Math.floor(reps(s, 'pullup_australian') / 3);
const doneQuests = (s: GameState): number => Object.values(s.quests).filter((q) => q.status === 'done').length;
const minStat = (s: GameState): number => Math.min(...STATS.map((x) => levelOf(s.statXp[x])));

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_rep', icon: '🎉', name: t('Первый шаг', 'First step'), desc: t('Сделайте первый повтор', 'Do your first rep'), progress: (s) => [allReps(s), 1], reward: { xp: 50, gold: 20 } },
  { id: 'reps_100', icon: '💯', name: t('Сотня', 'A hundred'), desc: t('100 повторов всего', '100 reps in total'), progress: (s) => [allReps(s), 100], reward: { xp: 150, gold: 50 } },
  { id: 'reps_1000', icon: '🏋️', name: t('Тысячник', 'Thousand'), desc: t('1000 повторов всего', '1,000 reps in total'), progress: (s) => [allReps(s), 1000], reward: { xp: 500, gold: 200 }, title: 'tireless' },
  { id: 'reps_5000', icon: '⚙️', name: t('Железный', 'Made of iron'), desc: t('5000 повторов всего', '5,000 reps in total'), progress: (s) => [allReps(s), 5000], reward: { xp: 1500, gold: 600 }, title: 'iron' },
  { id: 'pushups_100', icon: '💪', name: t('Отжимания: 100', 'Push-ups: 100'), desc: t('100 отжиманий', '100 push-ups'), progress: (s) => [reps(s, 'pushup'), 100], reward: { xp: 200, gold: 80 } },
  { id: 'pushups_500', icon: '🦾', name: t('Мастер отжиманий', 'Push-up master'), desc: t('500 отжиманий', '500 push-ups'), progress: (s) => [reps(s, 'pushup'), 500], reward: { xp: 600, gold: 250 }, title: 'pushup_master' },
  { id: 'squats_200', icon: '🦵', name: t('Приседания: 200', 'Squats: 200'), desc: t('200 приседаний', '200 squats'), progress: (s) => [reps(s, 'squat'), 200], reward: { xp: 200, gold: 80 } },
  { id: 'squats_1000', icon: '🏔️', name: t('Стальные ноги', 'Legs of steel'), desc: t('1000 приседаний', '1,000 squats'), progress: (s) => [reps(s, 'squat'), 1000], reward: { xp: 800, gold: 300 }, title: 'steel_legs' },
  { id: 'lunges_300', icon: '🚶', name: t('Длинный шаг', 'Long stride'), desc: t('300 выпадов', '300 lunges'), progress: (s) => [reps(s, 'lunge'), 300], reward: { xp: 300, gold: 120 } },
  { id: 'pullups_25', icon: '🧗', name: t('Турник: 25', 'Bar: 25'), desc: t('25 подтягиваний (или 75 облегчённых)', '25 pull-ups (or 75 assisted)'), progress: (s) => [pullups(s), 25], reward: { xp: 300, gold: 120 } },
  { id: 'pullups_100', icon: '🏅', name: t('Покоритель турника', 'Bar conqueror'), desc: t('100 подтягиваний', '100 pull-ups'), progress: (s) => [pullups(s), 100], reward: { xp: 900, gold: 350 }, title: 'bar_master' },
  { id: 'core_300', icon: '🧘', name: t('Крепкий пресс', 'Solid core'), desc: t('300 скручиваний', '300 sit-ups'), progress: (s) => [reps(s, 'situp'), 300], reward: { xp: 300, gold: 120 } },
  { id: 'cardio_1000', icon: '🏃', name: t('Марафонец', 'Marathoner'), desc: t('1000 движений кардио', '1,000 cardio moves'), progress: (s) => [reps(s, 'jumping_jack', 'high_knees'), 1000], reward: { xp: 400, gold: 150 }, title: 'marathon' },
  { id: 'streak_3', icon: '🔥', name: t('Три дня подряд', 'Three in a row'), desc: t('Серия 3 дня', '3-day streak'), progress: (s) => [s.streak.best, 3], reward: { xp: 150, gold: 60 } },
  { id: 'streak_7', icon: '📅', name: t('Дисциплина', 'Discipline'), desc: t('Серия 7 дней', '7-day streak'), progress: (s) => [s.streak.best, 7], reward: { xp: 400, gold: 150 }, title: 'discipline' },
  { id: 'streak_30', icon: '🗓️', name: t('Несгибаемый', 'Unbreakable'), desc: t('Серия 30 дней', '30-day streak'), progress: (s) => [s.streak.best, 30], reward: { xp: 2000, gold: 800 }, title: 'unbreakable' },
  { id: 'level_5', icon: '⭐', name: t('Уровень 5', 'Level 5'), desc: t('Достигните 5 уровня', 'Reach level 5'), progress: (s) => [levelOf(s.totalXp), 5], reward: { xp: 0, gold: 100 } },
  { id: 'level_10', icon: '🌟', name: t('Уровень 10', 'Level 10'), desc: t('Достигните 10 уровня', 'Reach level 10'), progress: (s) => [levelOf(s.totalXp), 10], reward: { xp: 0, gold: 300 } },
  { id: 'level_20', icon: '✨', name: t('Ветеран', 'Veteran'), desc: t('Достигните 20 уровня', 'Reach level 20'), progress: (s) => [levelOf(s.totalXp), 20], reward: { xp: 0, gold: 1000 }, title: 'veteran' },
  { id: 'all_stats_5', icon: '🏆', name: t('Всесторонний', 'All-rounder'), desc: t('Все характеристики 5 уровня', 'All stats at level 5'), progress: (s) => [minStat(s), 5], reward: { xp: 500, gold: 200 }, title: 'all_rounder' },
  { id: 'items_5', icon: '🎒', name: t('Снаряжён', 'Geared up'), desc: t('5 предметов в сумке', '5 items in your bag'), progress: (s) => [s.inventory.length, 5], reward: { xp: 150, gold: 50 } },
  { id: 'items_15', icon: '🧳', name: t('Запасливый', 'Well stocked'), desc: t('15 предметов в сумке', '15 items in your bag'), progress: (s) => [s.inventory.length, 15], reward: { xp: 400, gold: 150 } },
  { id: 'items_all', icon: '👑', name: t('Коллекционер', 'Collector'), desc: t('Все предметы', 'Every item'), progress: (s) => [s.inventory.length, ITEMS.length], reward: { xp: 2000, gold: 0 }, title: 'collector' },
  { id: 'quests_10', icon: '📜', name: t('Искатель заданий', 'Quest seeker'), desc: t('Выполните 10 квестов', 'Complete 10 quests'), progress: (s) => [doneQuests(s), 10], reward: { xp: 300, gold: 120 } },
  { id: 'life_class', icon: '📣', name: t('Первое занятие', 'First class'), desc: t('Проведите занятие', 'Run a class'), progress: (s) => [s.life.stats.sessions, 1], reward: { xp: 50, gold: 30 } },
  { id: 'life_classes', icon: '⏱️', name: t('Трудоголик', 'Workaholic'), desc: t('Проведите 30 занятий', 'Run 30 classes'), progress: (s) => [s.life.stats.sessions, 30], reward: { xp: 400, gold: 200 }, title: 'workaholic' },
  { id: 'life_group', icon: '👥', name: t('Своя группа', 'Your own group'), desc: t('5 учеников одновременно', '5 clients at once'), progress: (s) => [s.life.clients.length, 5], reward: { xp: 300, gold: 150 }, title: 'social' },
  { id: 'life_gym', icon: '🌟', name: t('Лучший зал города', 'Best gym in town'), desc: t('Улучшите зал до премиум-центра', 'Upgrade to a premium centre'), progress: (s) => [s.life.gym, GYMS.length - 1], reward: { xp: 800, gold: 0 }, title: 'tycoon' },
  { id: 'life_rich', icon: '💰', name: t('Карьерист', 'Go-getter'), desc: t('Заработайте 5000 на занятиях', 'Earn 5,000 from classes'), progress: (s) => [s.life.stats.earned, 5000], reward: { xp: 500, gold: 250 }, title: 'career' },
  { id: 'life_chef', icon: '👨‍🍳', name: t('Шеф', 'Chef'), desc: t('Приготовьте 20 блюд', 'Cook 20 meals'), progress: (s) => [s.life.stats.meals, 20], reward: { xp: 200, gold: 80 } },
];

const ACHIEVEMENT_TITLES: Record<string, Txt> = {
  tireless: t('Неутомимый', 'Tireless'),
  iron: t('Железный', 'Iron'),
  pushup_master: t('Мастер отжиманий', 'Push-up Master'),
  steel_legs: t('Стальные ноги', 'Legs of Steel'),
  bar_master: t('Покоритель турника', 'Bar Conqueror'),
  marathon: t('Марафонец', 'Marathoner'),
  discipline: t('Дисциплина', 'Discipline'),
  unbreakable: t('Несгибаемый', 'Unbreakable'),
  veteran: t('Ветеран', 'Veteran'),
  all_rounder: t('Всесторонний', 'All-rounder'),
  collector: t('Коллекционер', 'Collector'),
  workaholic: t('Трудоголик', 'Workaholic'),
  career: t('Карьерист', 'Go-getter'),
  social: t('Тренер группы', 'Group Coach'),
  tycoon: t('Магнат', 'Tycoon'),
};

/** Название титула из достижений. */
export function titleText(id: string): Txt | undefined {
  return ACHIEVEMENT_TITLES[id];
}

/** Все открытые титулы героя. */
export function unlockedTitles(s: GameState): string[] {
  const fromAch = ACHIEVEMENTS.filter((a) => a.title && s.achievements[a.id]).map((a) => a.title!);
  return [...new Set(fromAch)];
}

/** Открывает выполненные достижения и выдаёт награды (s уже скопировано). */
export function checkAchievements(s: GameState, events: GameEvent[]): void {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    const [cur, goal] = a.progress(s);
    if (cur < goal) continue;
    s.achievements[a.id] = s.today || 'unlocked';
    s.gold += a.reward.gold;
    if (a.reward.xp) addXp(s, a.reward.xp, null, events);
    events.push({ kind: 'achievement', id: a.id, xp: a.reward.xp, gold: a.reward.gold });
  }
}
