import type { ExerciseId } from '../tracking/exercise';
import {
  DAILY_BONUS,
  EXERCISE_GAME,
  MAX_ACTIVE_QUESTS,
  MAX_FREEZES,
  NEWBIE_DAYS,
  NEWBIE_LIMIT_FACTOR,
  OVER_LIMIT_FACTOR,
  STATS,
  STREAK_MIN_CAMERA_XP,
  XP_PER_REP,
  qualityBonus,
  streakGoldBonus,
  type StatId,
} from './config';
import { generateDailies, rerollTask, taskProgress } from './dailies';
import { addDays, dayKey, daysBetween, weekKey } from './dates';
import { MAX_EQUIPMENT_BONUS, itemById, type Slot } from './items';
import { levelOf, xpForLevel } from './levels';
import { QUESTS, effectiveObjective, objectiveTarget, questById, type QuestDef } from './quests';
import { checkAchievements } from './achievements';
import { addXp, grantReward } from './progress';
import { lifeNewRealDay, lifeOnRep } from './life';
import { emptyDay, type Character, type DayStats, type GameState } from './state';

export type GameEvent =
  | { kind: 'xp'; amount: number; stat: StatId; overLimit: boolean }
  | { kind: 'limit'; exercise: ExerciseId }
  | { kind: 'levelUp'; level: number }
  | { kind: 'statLevelUp'; stat: StatId; level: number }
  | { kind: 'questDone'; questId: string; xp: number; gold: number }
  | { kind: 'questNew'; questId: string }
  | { kind: 'dailyDone'; key: string; xp: number; gold: number }
  | { kind: 'dailyBonus'; xp: number; gold: number }
  | { kind: 'streak'; count: number }
  | { kind: 'freezeUsed'; days: number }
  | { kind: 'streakLost' }
  | { kind: 'achievement'; id: string; xp: number; gold: number }
  | { kind: 'sessionDone'; pay: number }
  | { kind: 'quotaDone'; quota: number }
  | { kind: 'quotaMissed'; fine: number; left: number; days: number };

export type ShopError = 'owned' | 'level' | 'gold' | 'unknown';

/** Деньги на старте жизни. */
export const START_MONEY = 100;

const STARTER_ITEM: Record<Character['archetype'], string> = {
  guardian: 'dumbbell',
  ranger: 'running_shoes',
  mystic: 'yoga_mat',
};

export interface Result {
  state: GameState;
  events: GameEvent[];
}

const HISTORY_DAYS = 30;

function todayStats(s: GameState): DayStats {
  let d = s.days[s.today];
  if (!d) {
    d = emptyDay();
    s.days[s.today] = d;
  }
  return d;
}

// ─── Квесты ────────────────────────────────────────────────────────────

function requirementsMet(s: GameState, q: QuestDef): boolean {
  const req = q.requires;
  if (!req) return true;
  if (req.level !== undefined && levelOf(s.totalXp) < req.level) return false;
  return (req.quests ?? []).every((id) => s.quests[id]?.status === 'done');
}

/** Открывает доступные квесты, пока активных меньше пяти (ТЗ). Еженедельные испытания открываются заново каждую неделю. */
export function refreshQuests(s: GameState, events: GameEvent[] = []): void {
  const week = weekKey(s.today);
  let active = Object.values(s.quests).filter((q) => q.status === 'active').length;
  for (const def of QUESTS) {
    if (active >= MAX_ACTIVE_QUESTS) break;
    const existing = s.quests[def.id];
    const reopen = existing?.status === 'done' && def.repeat === 'weekly' && existing.doneWeek !== week;
    if (existing && !reopen) continue;
    if (!requirementsMet(s, def)) continue;
    s.quests[def.id] = { id: def.id, status: 'active', progress: def.objectives.map(() => 0) };
    events.push({ kind: 'questNew', questId: def.id });
    active += 1;
  }
}

/** Обновляет прогресс целей, не связанных с повторами (уровень, характеристика, стрик). */
function syncPassiveObjectives(s: GameState): void {
  for (const qs of Object.values(s.quests)) {
    if (qs.status !== 'active') continue;
    const def = questById(qs.id);
    if (!def) continue;
    def.objectives.forEach((o, i) => {
      if (o.type === 'reach_level') qs.progress[i] = Math.min(o.level, levelOf(s.totalXp));
      if (o.type === 'stat_level') qs.progress[i] = Math.min(o.level, levelOf(s.statXp[o.stat]));
      if (o.type === 'streak') qs.progress[i] = Math.min(o.days, s.streak.count);
    });
  }
}

/** Завершает выполненные квесты; награда может дать уровень и открыть новые квесты — поэтому цикл. */
function settleQuests(s: GameState, events: GameEvent[]): void {
  for (let guard = 0; guard < 20; guard += 1) {
    syncPassiveObjectives(s);
    let changed = false;
    for (const qs of Object.values(s.quests)) {
      if (qs.status !== 'active') continue;
      const def = questById(qs.id);
      if (!def) continue;
      const done = def.objectives.every((o, i) => (qs.progress[i] ?? 0) >= objectiveTarget(effectiveObjective(o, s.character)));
      if (!done) continue;
      qs.status = 'done';
      qs.doneWeek = weekKey(s.today);
      const r = grantReward(s, def.reward, events);
      events.push({ kind: 'questDone', questId: def.id, ...r });
      changed = true;
    }
    refreshQuests(s, events);
    if (!changed) break;
  }
}

function questRepProgress(s: GameState, exercise: ExerciseId, quality: number): void {
  for (const qs of Object.values(s.quests)) {
    if (qs.status !== 'active') continue;
    const def = questById(qs.id);
    if (!def) continue;
    def.objectives.forEach((raw, i) => {
      const o = effectiveObjective(raw, s.character);
      if (o.type !== 'reps' || o.exercise !== exercise) return;
      if (o.minQuality !== undefined && quality < o.minQuality) return;
      qs.progress[i] = Math.min(o.count, (qs.progress[i] ?? 0) + 1);
    });
  }
}

// ─── Ежедневки и стрик ─────────────────────────────────────────────────

function settleDailies(s: GameState, events: GameEvent[]): void {
  const d = s.dailies;
  if (!d || d.day !== s.today) return;
  const stats = todayStats(s);
  for (const task of d.tasks) {
    if (task.done || taskProgress(task, stats) < task.target) continue;
    task.done = true;
    stats.dailiesDone += 1;
    const r = grantReward(s, task.reward, events);
    events.push({ kind: 'dailyDone', key: task.key, ...r });
  }
  if (!d.bonusClaimed && d.tasks.length > 0 && d.tasks.every((t) => t.done)) {
    d.bonusClaimed = true;
    const r = grantReward(s, DAILY_BONUS, events);
    events.push({ kind: 'dailyBonus', ...r });
  }
}

function settleStreak(s: GameState, events: GameEvent[]): void {
  const stats = todayStats(s);
  const qualifies = stats.dailiesDone > 0 || stats.cameraXp >= STREAK_MIN_CAMERA_XP;
  if (!qualifies || s.streak.lastDay === s.today) return;
  s.streak.count = s.streak.lastDay === addDays(s.today, -1) ? s.streak.count + 1 : 1;
  s.streak.best = Math.max(s.streak.best, s.streak.count);
  s.streak.lastDay = s.today;
  events.push({ kind: 'streak', count: s.streak.count });
}

/**
 * Переход на новый день: бесплатная заморозка раз в неделю (копится до 2),
 * пропущенные дни закрываются заморозками, иначе стрик сгорает;
 * новые ежедневки; старая статистика удаляется.
 */
export function ensureDay(state: GameState, now: Date): Result {
  const today = dayKey(now);
  if (state.today === today && state.dailies?.day === today) return { state, events: [] };
  const s = structuredClone(state);
  const events: GameEvent[] = [];

  const week = weekKey(today);
  if (s.streak.freezeWeek !== week) {
    s.streak.freezes = Math.min(MAX_FREEZES, s.streak.freezes + 1);
    s.streak.freezeWeek = week;
  }

  if (s.streak.lastDay && s.streak.count > 0) {
    const missed = daysBetween(s.streak.lastDay, today) - 1;
    if (missed > 0) {
      if (s.streak.freezes >= missed) {
        s.streak.freezes -= missed;
        s.streak.lastDay = addDays(today, -1);
        events.push({ kind: 'freezeUsed', days: missed });
      } else {
        s.streak.count = 0;
        events.push({ kind: 'streakLost' });
      }
    }
  }

  if (s.dailies && s.dailies.day !== today) s.prevDailyKeys = s.dailies.tasks.map((t) => t.key);
  // Норма тренера за прошедшие дни: не выполнена — штраф.
  lifeNewRealDay(s, s.today, today, events);
  s.today = today;
  s.dailies = { day: today, tasks: generateDailies(s, today), rerollUsed: false, bonusClaimed: false };

  for (const day of Object.keys(s.days)) if (daysBetween(day, today) > HISTORY_DAYS) delete s.days[day];
  todayStats(s);
  settleQuests(s, events);
  checkAchievements(s, events);
  return { state: s, events };
}

// ─── Главное действие: засчитанный повтор ──────────────────────────────

export function isNewbie(s: GameState): boolean {
  return daysBetween(s.character.createdDay, s.today) < NEWBIE_DAYS;
}

/** Дневной лимит упражнения с учётом поблажки новичкам. */
export function dailyLimit(s: GameState, exercise: ExerciseId): number {
  const base = EXERCISE_GAME[exercise].dailyLimit;
  return Math.round(base * (isNewbie(s) ? NEWBIE_LIMIT_FACTOR : 1));
}

function repsInLimitGroup(stats: DayStats, exercise: ExerciseId): number {
  const g = EXERCISE_GAME[exercise].limitGroup;
  return (Object.entries(stats.reps) as Array<[ExerciseId, number]>)
    .filter(([ex]) => EXERCISE_GAME[ex].limitGroup === g)
    .reduce((a, [, n]) => a + n, 0);
}

/**
 * Засчитанный повтор: опыт (10 × множитель × бонус качества, вдвое меньше сверх лимита),
 * характеристика, квесты, ежедневки, стрик.
 */
export function applyRep(state: GameState, rep: { exercise: ExerciseId; quality: number }, now: Date): Result {
  const day = ensureDay(state, now);
  const s = day.state === state ? structuredClone(state) : day.state;
  const events: GameEvent[] = [...day.events];
  const info = EXERCISE_GAME[rep.exercise];
  const stats = todayStats(s);

  const doneBefore = repsInLimitGroup(stats, rep.exercise);
  const limit = dailyLimit(s, rep.exercise);
  const overLimit = doneBefore >= limit;
  if (doneBefore === limit) events.push({ kind: 'limit', exercise: rep.exercise });

  const xp = XP_PER_REP * info.multiplier * qualityBonus(rep.quality) * (overLimit ? OVER_LIMIT_FACTOR : 1) * (1 + equipmentBonus(s));
  stats.reps[rep.exercise] = (stats.reps[rep.exercise] ?? 0) + 1;
  if (rep.quality >= 80) stats.goodReps[rep.exercise] = (stats.goodReps[rep.exercise] ?? 0) + 1;
  stats.cameraXp += xp;
  s.lifetimeReps[rep.exercise] = (s.lifetimeReps[rep.exercise] ?? 0) + 1;

  events.push({ kind: 'xp', amount: xp, stat: info.stat, overLimit });
  addXp(s, xp, info.stat, events);
  questRepProgress(s, rep.exercise, rep.quality);
  lifeOnRep(s, rep.exercise, events);
  settleDailies(s, events);
  settleStreak(s, events);
  settleQuests(s, events);
  checkAchievements(s, events);
  return { state: s, events };
}

// ─── Магазин и экипировка ──────────────────────────────────────────────

/** Суммарная прибавка к опыту от надетых предметов (не больше 25%). */
export function equipmentBonus(s: GameState): number {
  const total = Object.values(s.equipped).reduce((acc, id) => acc + (id ? (itemById(id)?.xpBonus ?? 0) : 0), 0);
  return Math.min(MAX_EQUIPMENT_BONUS, total);
}

export function canBuy(s: GameState, id: string): ShopError | null {
  const item = itemById(id);
  if (!item) return 'unknown';
  if (s.inventory.includes(id)) return 'owned';
  if (levelOf(s.totalXp) < item.level) return 'level';
  if (s.gold < item.price) return 'gold';
  return null;
}

/** Покупка: списывает золото, кладёт предмет в инвентарь и сразу надевает (прежний остаётся в инвентаре). */
export function buyItem(state: GameState, id: string): { state: GameState; error: ShopError | null } {
  const error = canBuy(state, id);
  const item = itemById(id);
  if (error || !item) return { state, error: error ?? 'unknown' };
  const s = structuredClone(state);
  s.gold -= item.price;
  s.inventory.push(id);
  s.equipped[item.slot] = id;
  checkAchievements(s, []);
  return { state: s, error: null };
}

export function equipItem(state: GameState, id: string): GameState {
  const item = itemById(id);
  if (!item || !state.inventory.includes(id)) return state;
  const s = structuredClone(state);
  s.equipped[item.slot] = id;
  return s;
}

export function unequipSlot(state: GameState, slot: Slot): GameState {
  if (!state.equipped[slot]) return state;
  const s = structuredClone(state);
  delete s.equipped[slot];
  return s;
}

export function reroll(state: GameState, index: number): GameState {
  if (!state.dailies || state.dailies.rerollUsed) return state;
  const replacement = rerollTask(state, index);
  if (!replacement) return state;
  const s = structuredClone(state);
  const d = s.dailies;
  if (!d) return state;
  d.tasks[index] = replacement;
  d.rerollUsed = true;
  return s;
}

export function newCharacterState(character: Omit<Character, 'id' | 'createdDay'>, now: Date, createState: (c: Character) => GameState): GameState {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Date.now()}${Math.random()}`;
  const s = createState({ ...character, id, createdDay: dayKey(now) });
  // Стартовый предмет по выбранному пути — чтобы экипировка была видна сразу.
  // Немного денег на первые продукты в симуляторе жизни.
  s.gold = START_MONEY;
  const starter = STARTER_ITEM[character.archetype];
  s.inventory.push(starter);
  const slot = itemById(starter)?.slot;
  if (slot) s.equipped[slot] = starter;
  return ensureDay(s, now).state;
}

export { STATS };

/** После действий в жизни: квесты и достижения. */
export function settleAfterLife(state: GameState, events: GameEvent[]): Result {
  const s = structuredClone(state);
  settleQuests(s, events);
  checkAchievements(s, events);
  return { state: s, events };
}

// ─── Для режима администратора ─────────────────────────────────────────

/** Начисляет опыт и золото напрямую (без бонуса серии) и закрывает квесты, условия которых выполнились. */
export function grant(state: GameState, reward: { xp?: number; gold?: number }): Result {
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  s.gold = Math.max(0, s.gold + (reward.gold ?? 0));
  if (reward.xp) addXp(s, reward.xp, null, events);
  settleQuests(s, events);
  return { state: s, events };
}

/** Ставит уровень персонажа (в обе стороны): опыт = порог уровня. */
export function setLevel(state: GameState, level: number): Result {
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  const target = xpForLevel(Math.max(1, Math.min(99, Math.round(level))));
  if (target > s.totalXp) addXp(s, target - s.totalXp, null, events);
  else s.totalXp = target;
  settleQuests(s, events);
  return { state: s, events };
}

/** Закрывает все активные квесты с наградой; открываются следующие. */
export function completeActiveQuests(state: GameState): Result {
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  for (const qs of Object.values(s.quests)) {
    if (qs.status !== 'active') continue;
    const def = questById(qs.id);
    if (!def) continue;
    qs.status = 'done';
    qs.doneWeek = weekKey(s.today);
    qs.progress = def.objectives.map((o) => objectiveTarget(effectiveObjective(o, s.character)));
    const r = grantReward(s, def.reward, events);
    events.push({ kind: 'questDone', questId: def.id, ...r });
  }
  settleQuests(s, events);
  return { state: s, events };
}
