import { MAX_LEVEL } from './config';

/** Суммарный опыт, нужный для уровня L (ТЗ: floor(40 × (L − 1)^2.2)). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(40 * Math.pow(level - 1, 2.2));
}

export interface LevelInfo {
  level: number;
  /** Опыт, набранный внутри текущего уровня. */
  into: number;
  /** Сколько опыта нужно от начала текущего уровня до следующего (0 на максимуме). */
  span: number;
  /** Доля прогресса до следующего уровня, 0..1. */
  progress: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= xpForLevel(level + 1)) level += 1;
  const base = xpForLevel(level);
  if (level >= MAX_LEVEL) return { level, into: totalXp - base, span: 0, progress: 1 };
  const span = xpForLevel(level + 1) - base;
  const into = totalXp - base;
  return { level, into, span, progress: span > 0 ? into / span : 0 };
}

export const levelOf = (totalXp: number): number => levelInfo(totalXp).level;
