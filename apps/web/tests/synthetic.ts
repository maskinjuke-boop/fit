/**
 * Генератор синтетических поз для тестов. Строит 33 точки MediaPipe по заданным
 * углам суставов, чтобы проверять автоматы на предсказуемых движениях.
 * Реальные записи (JSON из инструмента записи) кладутся в tests/fixtures и
 * прогоняются тем же способом — см. tests/fixtures.test.ts.
 */
import type { Landmark, RawPose } from '../src/tracking/types';
import { LM } from '../src/tracking/landmarks';
import { RepCounter, type FrameResult } from '../src/tracking/repCounter';
import type { ExerciseDef } from '../src/tracking/exercise';
import type { Metrics } from '../src/tracking/types';

export interface V {
  x: number;
  y: number;
}

const rad = (d: number): number => (d * Math.PI) / 180;

/** Точка на расстоянии len от from в направлении dirDeg (0 — вниз, 90 — вправо, 180 — вверх). */
export function polar(from: V, dirDeg: number, len: number): V {
  return { x: from.x + len * Math.sin(rad(dirDeg)), y: from.y + len * Math.cos(rad(dirDeg)) };
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Собирает позу: указанные точки видны (0,99), остальные — нет (0,2). */
export function makePose(points: Partial<Record<number, V>>, vis = 0.99): RawPose {
  const out: Landmark[] = [];
  for (let i = 0; i < 33; i += 1) {
    const p = points[i];
    out.push(p ? { x: p.x, y: p.y, z: 0, visibility: vis } : { x: 0.5, y: 0.5, z: 0, visibility: 0.2 });
  }
  return out;
}

// ─── Позы по упражнениям ──────────────────────────────────────────────

/** Отжимание сбоку (левая сторона к камере). */
export function pushupPose(elbowDeg: number, bodyDeg = 180, shoulderY = 0.5): RawPose {
  const S = { x: 0.3, y: shoulderY };
  const upperDir = 20;
  const E = polar(S, upperDir, 0.12);
  const W = polar(E, upperDir + 180 - elbowDeg, 0.12);
  const H = polar(S, 90, 0.25);
  const A = polar(H, -90 + bodyDeg, 0.35);
  return makePose({
    [LM.LEFT_SHOULDER]: S,
    [LM.LEFT_ELBOW]: E,
    [LM.LEFT_WRIST]: W,
    [LM.LEFT_HIP]: H,
    [LM.LEFT_ANKLE]: A,
  });
}

/** Приседание сбоку. torsoDeg — наклон корпуса к полу (90 — вертикально). */
export function squatPose(kneeDeg: number, torsoDeg = 80): RawPose {
  const A = { x: 0.5, y: 0.9 };
  const K = polar(A, 170, 0.2);
  const H = polar(K, -10 + kneeDeg, 0.22);
  const S = polar(H, 90 + torsoDeg, 0.28);
  return makePose({
    [LM.LEFT_ANKLE]: A,
    [LM.LEFT_KNEE]: K,
    [LM.LEFT_HIP]: H,
    [LM.LEFT_SHOULDER]: S,
  });
}

/** Выпад сбоку: обе ноги видны. */
export function lungePose(frontKneeDeg: number, backKneeDeg: number, torsoDev = 5): RawPose {
  const H = { x: 0.5, y: 0.5 };
  const FK = polar(H, 180 - frontKneeDeg, 0.22);
  const FA = polar(FK, 0, 0.22);
  const BK = polar(H, -10, 0.22);
  const BA = polar(BK, 170 + backKneeDeg, 0.22);
  const S = polar(H, 180 - torsoDev, 0.28);
  return makePose({
    [LM.LEFT_HIP]: H,
    [LM.RIGHT_HIP]: { x: H.x + 0.005, y: H.y },
    [LM.LEFT_KNEE]: FK,
    [LM.LEFT_ANKLE]: FA,
    [LM.RIGHT_KNEE]: BK,
    [LM.RIGHT_ANKLE]: BA,
    [LM.LEFT_SHOULDER]: S,
  });
}

/** Скручивание сбоку: лёжа, колени согнуты. ankleShift — сдвиг стоп (для проверки «ноги неподвижны»). */
export function situpPose(hipDeg: number, ankleShift = 0): RawPose {
  const H = { x: 0.5, y: 0.8 };
  const K = polar(H, 135, 0.2);
  const A = { x: 0.75 + ankleShift, y: 0.85 - Math.abs(ankleShift) };
  const S = polar(H, 135 + hipDeg, 0.28);
  return makePose({
    [LM.LEFT_HIP]: H,
    [LM.LEFT_KNEE]: K,
    [LM.LEFT_ANKLE]: A,
    [LM.LEFT_SHOULDER]: S,
  });
}

/** Джампинг-джек спереди. arms: 0 — внизу, 1 — над головой; feet — расстояние между стопами в ширинах плеч. */
export function jackPose(arms: number, feet: number, armSkew = 0): RawPose {
  const shoulderW = 0.16;
  const wy = (k: number): number => lerp(0.62, 0.08, k);
  return makePose({
    [LM.NOSE]: { x: 0.5, y: 0.2 },
    [LM.LEFT_SHOULDER]: { x: 0.42, y: 0.3 },
    [LM.RIGHT_SHOULDER]: { x: 0.58, y: 0.3 },
    [LM.LEFT_WRIST]: { x: lerp(0.38, 0.3, arms), y: wy(arms) },
    [LM.RIGHT_WRIST]: { x: lerp(0.62, 0.7, arms), y: wy(Math.max(0, arms - armSkew)) },
    [LM.LEFT_HIP]: { x: 0.45, y: 0.55 },
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.55 },
    [LM.LEFT_ANKLE]: { x: 0.5 - (feet * shoulderW) / 2, y: 0.92 },
    [LM.RIGHT_ANKLE]: { x: 0.5 + (feet * shoulderW) / 2, y: 0.92 },
  });
}

/** Бег на месте спереди: угол подъёма каждого бедра к вертикали. */
export function kneesPose(leftLiftDeg: number, rightLiftDeg: number): RawPose {
  const L = 0.2;
  const lh = { x: 0.45, y: 0.55 };
  const rh = { x: 0.55, y: 0.55 };
  const lk = { x: lh.x, y: lh.y + L * Math.cos(rad(leftLiftDeg)) };
  const rk = { x: rh.x, y: rh.y + L * Math.cos(rad(rightLiftDeg)) };
  return makePose({
    [LM.LEFT_SHOULDER]: { x: 0.42, y: 0.3 },
    [LM.RIGHT_SHOULDER]: { x: 0.58, y: 0.3 },
    [LM.LEFT_HIP]: lh,
    [LM.RIGHT_HIP]: rh,
    [LM.LEFT_KNEE]: lk,
    [LM.RIGHT_KNEE]: rk,
    [LM.LEFT_ANKLE]: { x: lk.x, y: lk.y + 0.2 },
    [LM.RIGHT_ANKLE]: { x: rk.x, y: rk.y + 0.2 },
  });
}

/**
 * Подтягивание спереди: кисти на турнике (y = 0,2).
 * pull: 0 — вис (руки прямые), 1 — подбородок над турником. hipShift — раскачка.
 */
export function pullupPose(pull: number, hipShift = 0, mouthVisible = true): RawPose {
  const barY = 0.2;
  const l = 0.11;
  const shoulderY = lerp(barY + 2 * l, 0.24, pull);
  const elbow = (wx: number, sx: number, out: number): V => {
    const d = shoulderY - barY;
    const h = Math.sqrt(Math.max(0, l * l - (d / 2) * (d / 2)));
    return { x: (wx + sx) / 2 + out * h, y: (barY + shoulderY) / 2 };
  };
  const mouthY = shoulderY - 0.06;
  const pts: Partial<Record<number, V>> = {
    [LM.LEFT_WRIST]: { x: 0.4, y: barY },
    [LM.RIGHT_WRIST]: { x: 0.6, y: barY },
    [LM.LEFT_SHOULDER]: { x: 0.42, y: shoulderY },
    [LM.RIGHT_SHOULDER]: { x: 0.58, y: shoulderY },
    [LM.LEFT_ELBOW]: elbow(0.4, 0.42, -1),
    [LM.RIGHT_ELBOW]: elbow(0.6, 0.58, 1),
    [LM.LEFT_HIP]: { x: 0.45 + hipShift, y: shoulderY + 0.2 },
    [LM.RIGHT_HIP]: { x: 0.55 + hipShift, y: shoulderY + 0.2 },
    [LM.LEFT_EAR]: { x: 0.46, y: mouthY - 0.03 },
    [LM.RIGHT_EAR]: { x: 0.54, y: mouthY - 0.03 },
  };
  if (mouthVisible) {
    pts[LM.MOUTH_LEFT] = { x: 0.48, y: mouthY };
    pts[LM.MOUTH_RIGHT] = { x: 0.52, y: mouthY };
  }
  return makePose(pts);
}

// ─── Анимация и прогон ────────────────────────────────────────────────

export interface Frame {
  t: number;
  raw: RawPose | null;
}

/** Ключевые кадры [время мс, параметр] → кадры с частотой fps (линейная интерполяция). */
export function animate(gen: (p: number) => RawPose, keys: ReadonlyArray<readonly [number, number]>, fps = 30): Frame[] {
  const frames: Frame[] = [];
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return frames;
  const step = 1000 / fps;
  let seg = 0;
  for (let t = first[0]; t <= last[0]; t += step) {
    while (seg < keys.length - 2 && (keys[seg + 1] as readonly [number, number])[0] < t) seg += 1;
    const a = keys[seg] as readonly [number, number];
    const b = (keys[seg + 1] ?? a) as readonly [number, number];
    const k = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
    frames.push({ t, raw: gen(lerp(a[1], b[1], k)) });
  }
  return frames;
}

/** Последовательность ключевых кадров «старт → пик → старт» n раз. */
export function repKeys(opts: { n: number; start: number; peak: number; downMs: number; upMs: number; holdMs?: number; t0?: number; leadMs?: number }): Array<[number, number]> {
  const { n, start, peak, downMs, upMs } = opts;
  const hold = opts.holdMs ?? 150;
  let t = opts.t0 ?? 0;
  const keys: Array<[number, number]> = [[t, start]];
  t += opts.leadMs ?? 500;
  keys.push([t, start]);
  for (let i = 0; i < n; i += 1) {
    t += downMs;
    keys.push([t, peak]);
    t += hold;
    keys.push([t, peak]);
    t += upMs;
    keys.push([t, start]);
    t += hold;
    keys.push([t, start]);
  }
  return keys;
}

/** Склеивает отрезки ключевых кадров, сдвигая время каждого следующего. */
export function concatKeys(...parts: Array<Array<[number, number]>>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let offset = 0;
  for (const part of parts) {
    const base = part[0]?.[0] ?? 0;
    for (const [t, p] of part) out.push([t - base + offset, p]);
    offset = (out.at(-1)?.[0] ?? 0) + 34;
  }
  return out;
}

export interface RunResult {
  count: number;
  rejected: number;
  reasons: string[];
  qualities: number[];
  results: FrameResult[];
}

export function run(def: ExerciseDef<Metrics>, frames: readonly Frame[], aspect = 1): RunResult {
  const counter = new RepCounter(def);
  const reasons: string[] = [];
  const qualities: number[] = [];
  const results: FrameResult[] = [];
  for (const f of frames) {
    const r = counter.process(f.raw, f.t, aspect);
    results.push(r);
    for (const e of r.events) {
      if (e.kind === 'rep') qualities.push(e.quality);
      else reasons.push(e.reason);
    }
  }
  const s = counter.snapshot;
  return { count: s.count, rejected: s.rejected, reasons, qualities, results };
}
