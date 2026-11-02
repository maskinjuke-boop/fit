import type { GameEvent } from '../../game/engine';
import { effectiveObjective, type Objective } from '../../game/quests';
import type { Character, DailyTask } from '../../game/state';
import type { I18nKey } from '../../i18n';

type T = (k: I18nKey) => string;
type TF = (k: I18nKey, vars: Record<string, string | number>) => string;

export const exName = (t: T, id: string): string => t(`exercise.${id}` as I18nKey);
export const questName = (t: T, id: string): string => t(`quest.${id}` as I18nKey);

export function taskText(t: T, tf: TF, task: DailyTask): string {
  const ex = task.exercise ? exName(t, task.exercise) : '';
  switch (task.template) {
    case 'reps':
      return tf('task.reps', { n: task.target, ex });
    case 'cardio':
      return tf('task.cardio', { n: task.target, ex });
    case 'xp':
      return tf('task.xp', { n: task.target });
    case 'technique':
      return tf('task.technique', { n: task.target, q: task.minQuality ?? 80, ex });
    case 'variety':
      return tf('task.variety', { n: task.target });
  }
}

export function objectiveText(t: T, tf: TF, raw: Objective, character: Character): string {
  const o = effectiveObjective(raw, character);
  switch (o.type) {
    case 'reps':
      return o.minQuality !== undefined
        ? tf('obj.repsQ', { ex: exName(t, o.exercise), n: o.count, q: o.minQuality })
        : tf('obj.reps', { ex: exName(t, o.exercise), n: o.count });
    case 'reach_level':
      return tf('obj.level', { n: o.level });
    case 'stat_level':
      return tf('obj.stat', { stat: t(`stat.${o.stat}` as I18nKey), n: o.level });
    case 'streak':
      return tf('obj.streak', { n: o.days });
  }
}

/** Текст баннера для игрового события; null — событие без баннера (опыт показывается отдельно). */
export function eventText(t: T, tf: TF, e: GameEvent): string | null {
  switch (e.kind) {
    case 'levelUp':
      return tf('ev.levelUp', { n: e.level });
    case 'statLevelUp':
      return tf('ev.statLevelUp', { stat: t(`stat.${e.stat}` as I18nKey), n: e.level });
    case 'questDone':
      return tf('ev.questDone', { q: questName(t, e.questId) });
    case 'questNew':
      return tf('ev.questNew', { q: questName(t, e.questId) });
    case 'dailyDone':
      return t('ev.dailyDone');
    case 'dailyBonus':
      return t('ev.dailyBonus');
    case 'streak':
      return tf('ev.streak', { n: e.count });
    case 'limit':
      return t('ev.limit');
    case 'freezeUsed':
      return t('ev.freezeUsed');
    case 'streakLost':
      return t('ev.streakLost');
    case 'xp':
      return null;
  }
}
