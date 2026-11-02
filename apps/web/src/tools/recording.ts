import type { ExerciseId } from '../tracking/exercise';
import type { Landmark, RawPose } from '../tracking/types';

/**
 * Формат записи последовательности точек. Такие файлы кладутся в tests/fixtures
 * и прогоняются тестами: так пороги проверяются на реальных движениях.
 */
export interface Recording {
  version: 1;
  exercise: ExerciseId;
  /** Сколько повторов на самом деле сделано (заполняет человек). */
  expectedReps: number | null;
  /** Ширина / высота кадра. */
  aspect: number;
  source: 'camera' | 'video';
  recordedAt: string;
  /** t — мс от начала записи; lm — 33 точки [x, y, z, visibility] или null. */
  frames: Array<{ t: number; lm: Array<[number, number, number, number]> | null }>;
}

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

export class Recorder {
  private frames: Recording['frames'] = [];
  private t0: number | null = null;
  private aspect = 1;

  constructor(
    private readonly exercise: ExerciseId,
    private readonly source: Recording['source'],
  ) {}

  get frameCount(): number {
    return this.frames.length;
  }

  add(raw: RawPose | null, tMs: number, aspect: number): void {
    if (this.t0 === null) this.t0 = tMs;
    this.aspect = aspect;
    this.frames.push({
      t: Math.round(tMs - this.t0),
      lm: raw ? raw.map((l) => [r4(l.x), r4(l.y), r4(l.z), r4(l.visibility)] as [number, number, number, number]) : null,
    });
  }

  finish(expectedReps: number | null): Recording {
    return {
      version: 1,
      exercise: this.exercise,
      expectedReps,
      aspect: r4(this.aspect),
      source: this.source,
      recordedAt: new Date().toISOString(),
      frames: this.frames,
    };
  }
}

export function recordingToFrames(rec: Recording): Array<{ t: number; raw: RawPose | null }> {
  return rec.frames.map((f) => ({
    t: f.t,
    raw: f.lm ? f.lm.map(([x, y, z, visibility]): Landmark => ({ x, y, z, visibility })) : null,
  }));
}
