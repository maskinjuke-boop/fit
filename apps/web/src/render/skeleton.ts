import { DRAWN_POINTS, SKELETON } from '../tracking/landmarks';
import type { Pose, RawPose } from '../tracking/types';

export interface SkeletonStyle {
  visibilityThreshold: number;
  /** Цвет костей, участвующих в упражнении. */
  accent: string;
}

const OK = '#3ddc84';
const BAD = '#ff4d4f';
const BONE = 'rgba(255, 255, 255, 0.55)';

interface NPoint {
  x: number;
  y: number;
  v: number;
}

/**
 * Рисует скелет на canvas размером с кадр видео. Сглаженные точки приходят
 * в пространстве с исправленными пропорциями — переводим обратно в нормированные.
 * Зелёная точка — видна, красная — нет; кости упражнения выделены цветом.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  raw: RawPose | null,
  smoothed: Pose | null,
  aspect: number,
  highlight: readonly number[],
  style: SkeletonStyle,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!raw) return;

  const pts: NPoint[] = raw.map((l, i) => {
    const s = smoothed?.[i];
    return s ? { x: s.x / aspect, y: s.y, v: l.visibility } : { x: l.x, y: l.y, v: l.visibility };
  });
  const hl = new Set(highlight);
  const unit = Math.max(2, Math.min(w, h) / 160);

  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON) {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa || !pb) continue;
    if (pa.v < 0.3 || pb.v < 0.3) continue;
    const strong = hl.has(a) && hl.has(b);
    ctx.strokeStyle = strong ? style.accent : BONE;
    ctx.lineWidth = strong ? unit * 2.2 : unit * 1.2;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }

  for (const i of DRAWN_POINTS) {
    const p = pts[i];
    if (!p) continue;
    const visible = p.v >= style.visibilityThreshold;
    if (!visible && !hl.has(i)) continue;
    ctx.fillStyle = visible ? OK : BAD;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, hl.has(i) ? unit * 2.2 : unit * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
