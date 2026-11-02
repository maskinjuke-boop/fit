import type { FrameHint, RawPose } from './types';

export interface FrameCheck {
  ok: boolean;
  hint?: FrameHint;
  /** Индексы ключевых точек, которые не видны. */
  missing: number[];
}

/** Запас от края кадра: точка ближе к краю считается вышедшей за кадр. */
const EDGE = 0.02;

/**
 * Проверяет, что в кадре есть человек и все ключевые точки упражнения видны.
 * Если невидимые точки лежат за краем кадра — просим отойти дальше,
 * иначе, скорее всего, не хватает света.
 */
export function checkFrame(raw: RawPose | null, required: readonly number[], threshold: number): FrameCheck {
  if (!raw || raw.length === 0) return { ok: false, hint: 'noPerson', missing: [...required] };

  const missing: number[] = [];
  let outOfFrame = false;
  for (const idx of required) {
    const lm = raw[idx];
    if (!lm || lm.visibility < threshold) {
      missing.push(idx);
      if (lm && (lm.x < EDGE || lm.x > 1 - EDGE || lm.y < EDGE || lm.y > 1 - EDGE)) outOfFrame = true;
    }
  }
  if (missing.length === 0) return { ok: true, missing };
  return { ok: false, hint: outOfFrame ? 'stepBack' : 'moreLight', missing };
}
