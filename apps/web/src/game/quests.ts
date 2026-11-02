import type { ExerciseId } from '../tracking/exercise';
import type { StatId } from './config';
import type { Character } from './state';

export type Objective =
  | {
      type: 'reps';
      exercise: ExerciseId;
      count: number;
      /** Засчитываются только повторы с таким качеством и выше. */
      minQuality?: number;
      /** Облегчённая альтернатива для тех, у кого нет турника (ТЗ: поле alt). */
      alt?: { exercise: ExerciseId; count: number };
    }
  | { type: 'reach_level'; level: number }
  | { type: 'stat_level'; stat: StatId; level: number }
  | { type: 'streak'; days: number };

export interface QuestDef {
  id: string;
  kind: 'tutorial' | 'story' | 'challenge';
  requires?: { quests?: string[]; level?: number };
  objectives: Objective[];
  reward: { xp: number; gold: number };
  repeat?: 'weekly';
}

/**
 * Квесты описаны данными (ТЗ, раздел 5). Боя, крафта и экспедиций пока нет,
 * поэтому цели — повторы, качество, уровни и стрик. Названия — в i18n: quest.<id>.
 */
export const QUESTS: readonly QuestDef[] = [
  // Стартовая цепочка
  { id: 'first_steps', kind: 'tutorial', objectives: [{ type: 'reps', exercise: 'squat', count: 5 }], reward: { xp: 50, gold: 20 } },
  { id: 'warmup', kind: 'tutorial', requires: { quests: ['first_steps'] }, objectives: [{ type: 'reps', exercise: 'jumping_jack', count: 20 }], reward: { xp: 50, gold: 20 } },
  { id: 'push_off', kind: 'tutorial', requires: { quests: ['warmup'] }, objectives: [{ type: 'reps', exercise: 'pushup', count: 5 }], reward: { xp: 80, gold: 30 } },
  { id: 'iron_core', kind: 'tutorial', requires: { quests: ['push_off'] }, objectives: [{ type: 'reps', exercise: 'situp', count: 10 }], reward: { xp: 80, gold: 30 } },
  { id: 'steady_steps', kind: 'tutorial', requires: { quests: ['iron_core'] }, objectives: [{ type: 'reps', exercise: 'lunge', count: 10 }], reward: { xp: 80, gold: 30 } },
  { id: 'rising', kind: 'tutorial', requires: { quests: ['steady_steps'] }, objectives: [{ type: 'reach_level', level: 3 }], reward: { xp: 100, gold: 50 } },
  {
    id: 'the_bar',
    kind: 'tutorial',
    requires: { quests: ['rising'] },
    objectives: [{ type: 'reps', exercise: 'pullup', count: 1, alt: { exercise: 'pullup_australian', count: 5 } }],
    reward: { xp: 150, gold: 50 },
  },
  { id: 'clean_form', kind: 'tutorial', requires: { quests: ['the_bar'] }, objectives: [{ type: 'reps', exercise: 'pushup', count: 10, minQuality: 80 }], reward: { xp: 150, gold: 60 } },
  { id: 'habit', kind: 'tutorial', requires: { quests: ['clean_form'] }, objectives: [{ type: 'streak', days: 3 }], reward: { xp: 200, gold: 100 } },

  // Глава 1
  { id: 'ch1_legs', kind: 'story', requires: { quests: ['habit'], level: 5 }, objectives: [{ type: 'reps', exercise: 'squat', count: 30 }, { type: 'reps', exercise: 'lunge', count: 20 }], reward: { xp: 300, gold: 120 } },
  { id: 'ch1_arms', kind: 'story', requires: { quests: ['ch1_legs'] }, objectives: [{ type: 'reps', exercise: 'pushup', count: 30 }], reward: { xp: 300, gold: 120 } },
  {
    id: 'ch1_bar',
    kind: 'story',
    requires: { quests: ['ch1_arms'] },
    objectives: [{ type: 'reps', exercise: 'pullup', count: 5, alt: { exercise: 'pullup_australian', count: 15 } }],
    reward: { xp: 400, gold: 150 },
  },
  { id: 'ch1_engine', kind: 'story', requires: { quests: ['ch1_bar'] }, objectives: [{ type: 'reps', exercise: 'high_knees', count: 100 }], reward: { xp: 250, gold: 100 } },
  { id: 'ch1_core', kind: 'story', requires: { quests: ['ch1_engine'] }, objectives: [{ type: 'reps', exercise: 'situp', count: 40 }], reward: { xp: 300, gold: 120 } },
  { id: 'ch1_strong', kind: 'story', requires: { quests: ['ch1_core'] }, objectives: [{ type: 'stat_level', stat: 'strength', level: 8 }], reward: { xp: 400, gold: 150 } },
  { id: 'ch1_level10', kind: 'story', requires: { quests: ['ch1_strong'] }, objectives: [{ type: 'reach_level', level: 10 }], reward: { xp: 500, gold: 200 } },

  // Глава 2
  { id: 'ch2_legs', kind: 'story', requires: { quests: ['ch1_level10'], level: 10 }, objectives: [{ type: 'reps', exercise: 'squat', count: 60 }], reward: { xp: 500, gold: 200 } },
  { id: 'ch2_push', kind: 'story', requires: { quests: ['ch2_legs'] }, objectives: [{ type: 'reps', exercise: 'pushup', count: 50 }], reward: { xp: 550, gold: 220 } },
  {
    id: 'ch2_bar',
    kind: 'story',
    requires: { quests: ['ch2_push'] },
    objectives: [{ type: 'reps', exercise: 'pullup', count: 10, alt: { exercise: 'pullup_australian', count: 30 } }],
    reward: { xp: 650, gold: 260 },
  },
  { id: 'ch2_core', kind: 'story', requires: { quests: ['ch2_bar'] }, objectives: [{ type: 'reps', exercise: 'situp', count: 60 }], reward: { xp: 500, gold: 200 } },
  { id: 'ch2_cardio', kind: 'story', requires: { quests: ['ch2_core'] }, objectives: [{ type: 'reps', exercise: 'jumping_jack', count: 200 }], reward: { xp: 450, gold: 180 } },
  { id: 'ch2_form', kind: 'story', requires: { quests: ['ch2_cardio'] }, objectives: [{ type: 'reps', exercise: 'lunge', count: 30, minQuality: 85 }], reward: { xp: 600, gold: 240 } },
  { id: 'ch2_streak', kind: 'story', requires: { quests: ['ch2_form'] }, objectives: [{ type: 'streak', days: 7 }], reward: { xp: 700, gold: 300 } },
  { id: 'ch2_endurance', kind: 'story', requires: { quests: ['ch2_streak'] }, objectives: [{ type: 'stat_level', stat: 'endurance', level: 8 }], reward: { xp: 700, gold: 300 } },
  { id: 'ch2_level15', kind: 'story', requires: { quests: ['ch2_endurance'] }, objectives: [{ type: 'reach_level', level: 15 }], reward: { xp: 1000, gold: 400 } },

  // Еженедельные испытания техники (по одному на упражнение)
  ...(
    [
      ['ch_pushup', 'pushup', 10],
      ['ch_squat', 'squat', 15],
      ['ch_lunge', 'lunge', 10],
      ['ch_situp', 'situp', 15],
      ['ch_jack', 'jumping_jack', 30],
      ['ch_knees', 'high_knees', 40],
    ] as const
  ).map(
    ([id, exercise, count]): QuestDef => ({
      id,
      kind: 'challenge',
      repeat: 'weekly',
      requires: { quests: ['habit'], level: 5 },
      objectives: [{ type: 'reps', exercise, count, minQuality: 85 }],
      reward: { xp: 200, gold: 80 },
    }),
  ),
  {
    id: 'ch_pullup',
    kind: 'challenge',
    repeat: 'weekly',
    requires: { quests: ['habit'], level: 5 },
    objectives: [{ type: 'reps', exercise: 'pullup', count: 5, minQuality: 85, alt: { exercise: 'pullup_australian', count: 10 } }],
    reward: { xp: 200, gold: 80 },
  },
];

export const questById = (id: string): QuestDef | undefined => QUESTS.find((q) => q.id === id);

const PULLUP_FAMILY: readonly ExerciseId[] = ['pullup', 'pullup_negative'];

/** Цель с учётом турника: без турника берётся облегчённая альтернатива. */
export function effectiveObjective(o: Objective, character: Character): Objective {
  if (o.type === 'reps' && o.alt && !character.hasBar && PULLUP_FAMILY.includes(o.exercise)) {
    return { ...o, exercise: o.alt.exercise, count: o.alt.count };
  }
  return o;
}

export function objectiveTarget(o: Objective): number {
  switch (o.type) {
    case 'reps':
      return o.count;
    case 'reach_level':
    case 'stat_level':
      return o.level;
    case 'streak':
      return o.days;
  }
}
