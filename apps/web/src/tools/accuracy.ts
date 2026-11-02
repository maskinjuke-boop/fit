import type { ExerciseId } from '../tracking/exercise';

/** Один замер: видео или живой подход с известным числом повторов. */
export interface AccuracyRun {
  exercise: ExerciseId;
  expected: number;
  counted: number;
  source: 'camera' | 'video';
  at: string;
}

export interface AccuracySummary {
  runs: number;
  expected: number;
  counted: number;
  /** Точность подсчёта: 1 − (пропуски + ложные) / ожидаемые. ТЗ: ≥ 95%. */
  accuracy: number;
  /** Доля ложных засчётов от ожидаемых. ТЗ: ≤ 2%. */
  falsePositiveRate: number;
  /** Доля пропущенных повторов. */
  missRate: number;
}

/**
 * Без покадровой разметки лишний и пропущенный повтор в одном подходе
 * взаимно гасятся, поэтому оценка точности здесь — верхняя граница.
 * Для финальной приёмки нужна разметка времени каждого повтора.
 */
export function summarize(runs: readonly AccuracyRun[]): AccuracySummary {
  let expected = 0;
  let counted = 0;
  let extra = 0;
  let missed = 0;
  for (const r of runs) {
    expected += r.expected;
    counted += r.counted;
    extra += Math.max(0, r.counted - r.expected);
    missed += Math.max(0, r.expected - r.counted);
  }
  const denom = Math.max(expected, 1);
  return {
    runs: runs.length,
    expected,
    counted,
    accuracy: expected === 0 ? 0 : Math.max(0, 1 - (extra + missed) / denom),
    falsePositiveRate: extra / denom,
    missRate: missed / denom,
  };
}

export function summarizeByExercise(runs: readonly AccuracyRun[]): Map<ExerciseId, AccuracySummary> {
  const groups = new Map<ExerciseId, AccuracyRun[]>();
  for (const r of runs) {
    const list = groups.get(r.exercise) ?? [];
    list.push(r);
    groups.set(r.exercise, list);
  }
  const out = new Map<ExerciseId, AccuracySummary>();
  for (const [id, list] of groups) out.set(id, summarize(list));
  return out;
}

const STORAGE_KEY = 'fitness-rpg.accuracy-runs.v1';

/** Замеры хранятся только в этом браузере; для отчёта их можно выгрузить в JSON. */
export function loadRuns(): AccuracyRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AccuracyRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRuns(runs: readonly AccuracyRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // Хранилище недоступно (приватный режим) — замеры живут до перезагрузки.
  }
}
