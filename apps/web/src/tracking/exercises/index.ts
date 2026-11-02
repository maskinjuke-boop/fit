import type { ExerciseDef, ExerciseId } from '../exercise';
import type { Metrics } from '../types';
import { highKnees } from './highKnees';
import { jumpingJack } from './jumpingJack';
import { lunge } from './lunge';
import { pullup, pullupAustralian, pullupNegative } from './pullup';
import { pushup } from './pushup';
import { situp } from './situp';
import { squat } from './squat';

/** Порядок — как в списке выбора упражнения. */
export const EXERCISES: ReadonlyArray<ExerciseDef<Metrics>> = [
  pullup,
  pullupNegative,
  pullupAustralian,
  pushup,
  squat,
  lunge,
  situp,
  jumpingJack,
  highKnees,
] as ReadonlyArray<ExerciseDef<Metrics>>;

export function getExercise(id: ExerciseId): ExerciseDef<Metrics> {
  const def = EXERCISES.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown exercise: ${id}`);
  return def;
}

export { highKnees, jumpingJack, lunge, pullup, pullupAustralian, pullupNegative, pushup, situp, squat };
