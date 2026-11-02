import { streakGoldBonus, type StatId } from './config';
import type { GameEvent } from './engine';
import { levelOf } from './levels';
import type { GameState } from './state';

/** Начисляет опыт персонажу (и характеристике), отмечая новые уровни. */
export function addXp(s: GameState, amount: number, stat: StatId | null, events: GameEvent[]): void {
  const before = levelOf(s.totalXp);
  s.totalXp += amount;
  const after = levelOf(s.totalXp);
  if (after > before) events.push({ kind: 'levelUp', level: after });
  if (stat) {
    const sb = levelOf(s.statXp[stat]);
    s.statXp[stat] += amount;
    const sa = levelOf(s.statXp[stat]);
    if (sa > sb) events.push({ kind: 'statLevelUp', stat, level: sa });
  }
}

/** Золото с бонусом стрика (+5% за каждые 7 дней, до +25%). */
export function grantReward(s: GameState, reward: { xp: number; gold: number }, events: GameEvent[]): { xp: number; gold: number } {
  const gold = Math.round(reward.gold * (1 + streakGoldBonus(s.streak.count)));
  s.gold += gold;
  addXp(s, reward.xp, null, events);
  return { xp: reward.xp, gold };
}
