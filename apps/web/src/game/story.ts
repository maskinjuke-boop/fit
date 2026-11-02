import type { ExerciseId } from '../tracking/exercise';
import type { StatId } from './config';
import type { GameEvent } from './engine';
import { ITEMS, type Rarity } from './items';
import { levelOf } from './levels';
import { addXp } from './progress';
import { rng } from './random';
import type { GameState } from './state';
import { COMPANIONS, MAX_COMPANIONS, REGIONS, REGION_STEPS, STORY_EVENTS, storyEvent } from './storyContent';
import type { ActiveEvent, Choice, Effect, EventDef, Faction, OutcomeView, Requirement, StoryState } from './storyTypes';

/**
 * Режим истории: путешествие по пяти регионам. Каждый шаг — случайное событие,
 * выбор игрока ведёт к проверке характеристики, физическому испытанию (повторы в
 * тренировке) или к прямому исходу. Решения ставят флаги, меняют репутацию и
 * приводят спутников — от этого зависят следующие события. Шаги пути даёт тренировка.
 */

export const MAX_ENERGY = 6;
export const DAILY_ENERGY = 3;
/** Опыт тренировок за один шаг пути. */
export const ENERGY_XP = 60;
export const START_ENERGY = 3;
export const MAX_RESOLVE = 10;
const LOG_SIZE = 40;

export function newStory(): StoryState {
  return {
    run: 0,
    region: 0,
    step: 0,
    stepsTotal: 0,
    resolve: MAX_RESOLVE,
    maxResolve: MAX_RESOLVE,
    energy: START_ENERGY,
    energyXp: 0,
    energyDay: '',
    flags: [],
    rep: { forest: 0, guild: 0, order: 0 },
    companions: [],
    seen: [],
    status: 'idle',
    event: null,
    trial: null,
    last: null,
    log: [],
    ending: null,
    bestRegion: 0,
    runsCompleted: 0,
    regionsCleared: 0,
    titles: [],
    started: false,
  };
}

export function migrateStory(raw: Partial<StoryState> | undefined): StoryState {
  const base = newStory();
  if (!raw) return base;
  return { ...base, ...raw, rep: { ...base.rep, ...(raw.rep ?? {}) } };
}

// ─── Масштабирование ───────────────────────────────────────────────────

/** Награды растут с каждым регионом. */
export const regionScale = (region: number): number => 1 + region * 0.4;

const FITNESS_FACTOR = { beginner: 0.7, intermediate: 1, advanced: 1.3 } as const;

/** Реальное упражнение и число повторов испытания: учёт турника, подготовки и региона. */
export function trialPlan(s: GameState, trial: { exercise: ExerciseId; reps: number }): { exercise: ExerciseId; target: number } {
  const st = s.story;
  let exercise = trial.exercise;
  let reps = trial.reps;
  if (exercise === 'pullup' && !s.character.hasBar) {
    exercise = 'pullup_australian';
    reps *= 3;
  }
  const k = FITNESS_FACTOR[s.character.fitness] * (1 + st.region * 0.15);
  return { exercise, target: Math.max(1, Math.round(reps * k)) };
}

const ARCHETYPE_BONUS: Record<GameState['character']['archetype'], Partial<Record<StatId, number>>> = {
  guardian: { strength: 0.1 },
  ranger: { legs: 0.1, endurance: 0.1 },
  mystic: { core: 0.1 },
};

/** Шанс успеха проверки: уровень характеристики против сложности (растёт с регионом), спутники, путь, благословение. */
export function checkChance(s: GameState, check: { stat: StatId; diff: number }): number {
  const st = s.story;
  const lvl = levelOf(s.statXp[check.stat]);
  const diff = check.diff + st.region;
  let p = 0.5 + 0.1 * (lvl - diff);
  for (const c of st.companions) p += COMPANIONS[c].bonus[check.stat] ?? 0;
  p += ARCHETYPE_BONUS[s.character.archetype][check.stat] ?? 0;
  if (st.flags.includes('blessed')) p += 0.1;
  if (st.flags.includes('cursed')) p -= 0.1;
  return Math.min(0.95, Math.max(0.1, p));
}

export function requirementMet(s: GameState, req: Requirement | undefined): boolean {
  if (!req) return true;
  const st = s.story;
  if (req.flag && !st.flags.includes(req.flag)) return false;
  if (req.notFlag && st.flags.includes(req.notFlag)) return false;
  if (req.gold !== undefined && s.gold < req.gold) return false;
  if (req.companion && !st.companions.includes(req.companion)) return false;
  if (req.anyCompanion && st.companions.length === 0) return false;
  if (req.minCompanions !== undefined && st.companions.length < req.minCompanions) return false;
  if (req.rep && st.rep[req.rep[0]] < req.rep[1]) return false;
  if (req.item && !s.inventory.includes(req.item)) return false;
  return true;
}

/** Выборы, доступные игроку сейчас (по требованиям); цена проверяется отдельно. */
export function availableChoices(s: GameState, ev: EventDef): Choice[] {
  return ev.choices.filter((c) => requirementMet(s, c.requires));
}

export const canAfford = (s: GameState, c: Choice): boolean => (c.cost ?? 0) <= s.gold;

// ─── Выбор события ─────────────────────────────────────────────────────

function pickEvent(s: GameState): ActiveEvent {
  const st = s.story;
  const r = rng(`${s.character.id}:story:${st.run}:${st.stepsTotal}:${st.region}:${st.step}`);
  const last = st.log[st.log.length - 1]?.event;
  let pool: EventDef[];
  if (st.step >= REGION_STEPS) {
    pool = STORY_EVENTS.filter((e) => e.boss && e.regions?.includes(st.region));
  } else {
    pool = STORY_EVENTS.filter(
      (e) => !e.boss && (!e.regions || e.regions.includes(st.region)) && requirementMet(s, e.when) && !(e.once && st.seen.includes(e.id)) && e.id !== last,
    );
  }
  const weightOf = (e: EventDef): number => (e.weight ?? 1) * (e.regions ? 1.6 : 1);
  const total = pool.reduce((a, e) => a + weightOf(e), 0);
  let roll = r() * total;
  let chosen = pool[pool.length - 1];
  for (const e of pool) {
    roll -= weightOf(e);
    if (roll <= 0) {
      chosen = e;
      break;
    }
  }
  if (!chosen) chosen = STORY_EVENTS[0]!;
  const vars: Record<string, number> = {};
  for (const [key, list] of Object.entries(chosen.vars ?? {})) vars[key] = Math.floor(r() * list.length);
  return { id: chosen.id, vars };
}

// ─── Исходы ────────────────────────────────────────────────────────────

const RARITY_BY_REGION: readonly Rarity[][] = [
  ['common', 'uncommon'],
  ['common', 'uncommon', 'rare'],
  ['uncommon', 'rare'],
  ['rare', 'epic'],
  ['epic', 'legendary'],
];

function rollLoot(s: GameState, r: () => number): string | null {
  const st = s.story;
  const tiers = RARITY_BY_REGION[Math.min(st.region, RARITY_BY_REGION.length - 1)] ?? ['common'];
  const pool = ITEMS.filter((i) => !s.inventory.includes(i.id) && tiers.includes(i.rarity));
  if (pool.length === 0) return null;
  return pool[Math.floor(r() * pool.length)]?.id ?? null;
}

function clampRep(v: number): number {
  return Math.max(-5, Math.min(5, v));
}

/** Применяет исход выбора к состоянию (s уже скопировано). */
function applyOutcome(s: GameState, ev: EventDef, choice: Choice, ok: boolean, vars: Record<string, number>, events: GameEvent[]): void {
  const st = s.story;
  const out = ok ? choice.success : (choice.fail ?? choice.success);
  const e = out.effect;
  const k = regionScale(st.region);
  const applied: Effect = {};
  const r = rng(`${s.character.id}:loot:${st.run}:${st.stepsTotal}`);

  if (e.resolve) {
    const before = st.resolve;
    st.resolve = Math.max(0, Math.min(st.maxResolve, st.resolve + e.resolve));
    applied.resolve = st.resolve - before;
  }
  if (e.gold) {
    const g = Math.round(e.gold * (e.gold > 0 ? k : 1));
    const before = s.gold;
    s.gold = Math.max(0, s.gold + g);
    applied.gold = s.gold - before;
  }
  if (e.xp) {
    const x = Math.round(e.xp * k);
    addXp(s, x, null, events);
    applied.xp = x;
  }
  if (e.energy) {
    st.energy = Math.max(0, Math.min(MAX_ENERGY, st.energy + e.energy));
    applied.energy = e.energy;
  }
  for (const f of e.flag ?? []) if (!st.flags.includes(f)) st.flags.push(f);
  for (const f of e.unflag ?? []) st.flags = st.flags.filter((x) => x !== f);
  if (e.flag) applied.flag = e.flag;
  if (e.rep) {
    applied.rep = {};
    for (const [f, d] of Object.entries(e.rep) as Array<[Faction, number]>) {
      st.rep[f] = clampRep(st.rep[f] + d);
      applied.rep[f] = d;
    }
  }
  if (e.companion && !st.companions.includes(e.companion) && st.companions.length < MAX_COMPANIONS) {
    st.companions.push(e.companion);
    applied.companion = e.companion;
  }
  if (e.loseCompanion) st.companions = st.companions.filter((c) => c !== e.loseCompanion);
  let loot: string | undefined;
  if (e.loot) {
    const id = rollLoot(s, r);
    if (id) {
      s.inventory.push(id);
      loot = id;
    } else {
      const g = Math.round(120 * k);
      s.gold += g;
      applied.gold = (applied.gold ?? 0) + g;
    }
  }
  if (e.title && !st.titles.includes(e.title)) {
    st.titles.push(e.title);
    applied.title = e.title;
  }

  // Продвижение по тропе.
  st.stepsTotal += 1;
  if (e.skip) {
    st.step = Math.min(REGION_STEPS, st.step + e.skip);
    applied.skip = e.skip;
  }
  if (!ev.boss) st.step = Math.min(REGION_STEPS, st.step + 1);
  if (e.clear) {
    // Хранитель региона повержен: награда и переход в следующий регион.
    const gold = Math.round(150 * (1 + st.region * 0.5));
    const xp = Math.round(300 * (1 + st.region * 0.5));
    s.gold += gold;
    addXp(s, xp, null, events);
    applied.gold = (applied.gold ?? 0) + gold;
    applied.xp = (applied.xp ?? 0) + xp;
    applied.clear = true;
    st.regionsCleared += 1;
    st.region += 1;
    st.step = 0;
    st.bestRegion = Math.max(st.bestRegion, st.region);
    st.flags = st.flags.filter((f) => f !== 'rumor');
  }
  if (e.victory) {
    const gold = 600;
    const xp = 1500;
    s.gold += gold;
    addXp(s, xp, null, events);
    applied.gold = (applied.gold ?? 0) + gold;
    applied.xp = (applied.xp ?? 0) + xp;
    applied.victory = true;
    st.regionsCleared += 1;
    st.bestRegion = REGIONS.length;
    st.runsCompleted += 1;
    st.ending = 'victory';
  } else if (st.resolve <= 0) {
    st.ending = 'defeat';
  }

  if (!st.seen.includes(ev.id)) st.seen.push(ev.id);
  const entry = { region: Math.min(st.region, REGIONS.length - 1), event: ev.id, choice: choice.id, ok, vars };
  if (e.clear) entry.region = st.region - 1;
  st.log.push(entry);
  if (st.log.length > LOG_SIZE) st.log.splice(0, st.log.length - LOG_SIZE);
  const view: OutcomeView = { ...entry, effect: applied };
  if (loot) view.loot = loot;
  st.last = view;
  st.event = null;
  st.trial = null;
  st.status = 'outcome';
}

// ─── Действия игрока ───────────────────────────────────────────────────

export interface StoryResult {
  state: GameState;
  events: GameEvent[];
}

const unchanged = (state: GameState): StoryResult => ({ state, events: [] });

/** Новое путешествие (первое или после финала). Спутники, флаги и репутация обнуляются; титулы остаются. */
export function startJourney(state: GameState): StoryResult {
  const s = structuredClone(state);
  const prev = s.story;
  const st = newStory();
  st.run = prev.started ? prev.run + 1 : 0;
  st.energy = Math.max(START_ENERGY, prev.energy);
  st.energyXp = prev.energyXp;
  st.energyDay = prev.energyDay;
  st.bestRegion = prev.bestRegion;
  st.runsCompleted = prev.runsCompleted;
  st.regionsCleared = prev.regionsCleared;
  st.titles = prev.titles;
  st.started = true;
  s.story = st;
  return { state: s, events: [] };
}

/** Сделать шаг по тропе: тратится шаг пути, выпадает событие. */
export function travel(state: GameState): StoryResult {
  const st = state.story;
  if (!st.started || st.status !== 'idle' || st.energy <= 0 || st.ending) return unchanged(state);
  const s = structuredClone(state);
  s.story.energy -= 1;
  s.story.event = pickEvent(s);
  s.story.status = 'event';
  return { state: s, events: [] };
}

/** Привал: шаг пути за +2 стойкости (с феей +3). */
export function camp(state: GameState): StoryResult {
  const st = state.story;
  if (!st.started || st.status !== 'idle' || st.energy <= 0 || st.resolve >= st.maxResolve) return unchanged(state);
  const s = structuredClone(state);
  s.story.energy -= 1;
  s.story.resolve = Math.min(s.story.maxResolve, s.story.resolve + (s.story.companions.includes('fairy') ? 3 : 2));
  return { state: s, events: [] };
}

/** Выбор варианта в текущем событии. */
export function choose(state: GameState, choiceId: string): StoryResult {
  const st = state.story;
  if (st.status !== 'event' || !st.event) return unchanged(state);
  const ev = storyEvent(st.event.id);
  const choice = ev?.choices.find((c) => c.id === choiceId);
  if (!ev || !choice || !requirementMet(state, choice.requires) || !canAfford(state, choice)) return unchanged(state);
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  const vars = s.story.event?.vars ?? {};
  if (choice.cost) s.gold -= choice.cost;
  if (choice.trial) {
    const plan = trialPlan(s, choice.trial);
    s.story.trial = { event: ev.id, choice: choice.id, exercise: plan.exercise, target: plan.target, progress: 0 };
    s.story.status = 'trial';
    return { state: s, events };
  }
  let ok = true;
  const r = rng(`${s.character.id}:roll:${s.story.run}:${s.story.stepsTotal}:${choice.id}`);
  if (choice.check) ok = r() < checkChance(s, choice.check);
  else if (choice.gamble) ok = r() < 0.5 + (s.story.flags.includes('blessed') ? 0.15 : 0) - (s.story.flags.includes('cursed') ? 0.15 : 0);
  applyOutcome(s, ev, choice, ok, vars, events);
  return { state: s, events };
}

/** Отказ от испытания — засчитывается неудачный исход. */
export function abandonTrial(state: GameState): StoryResult {
  const st = state.story;
  if (st.status !== 'trial' || !st.trial || !st.event) return unchanged(state);
  const ev = storyEvent(st.trial.event);
  const choice = ev?.choices.find((c) => c.id === st.trial?.choice);
  if (!ev || !choice) return unchanged(state);
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  applyOutcome(s, ev, choice, false, s.story.event?.vars ?? {}, events);
  return { state: s, events };
}

/** Закрыть экран исхода: дальше по тропе или к итогам путешествия. */
export function proceed(state: GameState): StoryResult {
  const st = state.story;
  if (st.status !== 'outcome') return unchanged(state);
  const s = structuredClone(state);
  s.story.status = s.story.ending ? 'ended' : 'idle';
  return { state: s, events: [] };
}

// ─── Связь с тренировками ──────────────────────────────────────────────

const PULLUP_FAMILY: readonly ExerciseId[] = ['pullup', 'pullup_negative'];

/** Повтор в тренировке: копит шаги пути и продвигает испытание (s уже скопировано). */
export function storyOnRep(s: GameState, exercise: ExerciseId, xp: number, events: GameEvent[]): void {
  const st = s.story;
  if (st.energy < MAX_ENERGY) {
    st.energyXp += xp;
    while (st.energyXp >= ENERGY_XP && st.energy < MAX_ENERGY) {
      st.energyXp -= ENERGY_XP;
      st.energy += 1;
      events.push({ kind: 'storyEnergy', energy: st.energy });
    }
    if (st.energy >= MAX_ENERGY) st.energyXp = 0;
  }
  const trial = st.trial;
  if (st.status !== 'trial' || !trial) return;
  const counts = exercise === trial.exercise || (PULLUP_FAMILY.includes(trial.exercise) && PULLUP_FAMILY.includes(exercise));
  if (!counts) return;
  trial.progress += 1;
  if (trial.progress < trial.target) return;
  const ev = storyEvent(trial.event);
  const choice = ev?.choices.find((c) => c.id === trial.choice);
  if (!ev || !choice) return;
  applyOutcome(s, ev, choice, true, st.event?.vars ?? {}, events);
  events.push({ kind: 'storyTrialDone', event: ev.id });
}

/** Новый день: бесплатные шаги пути (s уже скопировано). */
export function storyNewDay(s: GameState, today: string): void {
  const st = s.story;
  if (st.energyDay === today) return;
  st.energyDay = today;
  st.energy = Math.min(MAX_ENERGY, st.energy + DAILY_ENERGY);
}
