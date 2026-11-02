import type { ExerciseId } from '../tracking/exercise';
import { taskProgress } from './dailies';
import { applyRep, type GameEvent, type Result } from './engine';
import { ITEMS } from './items';
import { MAX_ENERGY } from './story';
import type { GameState } from './state';

/**
 * Инструменты режима администратора: проходят через тот же движок, что и
 * настоящие повторы, поэтому проверяют квесты, ежедневки и серию по-честному.
 * Любое действие помечает состояние флагом adminTouched.
 */
const touched = (s: GameState): GameState => (s.adminTouched ? s : { ...s, adminTouched: true });

export function simulateReps(state: GameState, exercise: ExerciseId, count: number, quality: number, now: Date): Result {
  let s = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = applyRep(s, { exercise, quality }, now);
    s = r.state;
    events.push(...r.events);
  }
  return { state: touched(s), events };
}

/** Выполняет все задания дня настоящими (имитированными) повторами. */
export function completeDailies(state: GameState, now: Date): Result {
  let s = state;
  const events: GameEvent[] = [];
  const run = (ex: ExerciseId, n: number, q = 95): void => {
    const r = simulateReps(s, ex, n, q, now);
    s = r.state;
    events.push(...r.events);
  };
  for (const task of state.dailies?.tasks ?? []) {
    if (task.done) continue;
    const left = (): number => task.target - taskProgress(task, s.days[s.today]);
    if ((task.template === 'reps' || task.template === 'cardio' || task.template === 'technique') && task.exercise) {
      if (left() > 0) run(task.exercise, left());
    } else if (task.template === 'variety') {
      for (const ex of ['squat', 'situp', 'lunge', 'pushup'] as const) if (left() > 0) run(ex, 10);
    } else if (task.template === 'xp') {
      for (let guard = 0; left() > 0 && guard < 100; guard += 1) run('pushup', 5);
    }
  }
  return { state: touched(s), events };
}

export function unlockAllItems(state: GameState): GameState {
  return touched({ ...state, inventory: ITEMS.map((i) => i.id) });
}

export function resetReroll(state: GameState): GameState {
  if (!state.dailies) return state;
  return touched({ ...state, dailies: { ...state.dailies, rerollUsed: false } });
}

export function markTouched(state: GameState): GameState {
  return touched(state);
}

/** История: полный запас шагов пути и стойкости. */
export function refillStory(state: GameState): GameState {
  return touched({ ...state, story: { ...state.story, energy: MAX_ENERGY, resolve: state.story.maxResolve } });
}
