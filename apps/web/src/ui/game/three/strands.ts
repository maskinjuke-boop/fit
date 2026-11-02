import * as THREE from 'three';
import { HEAD_Y } from './body';

/**
 * Пряди (волосы, борода) одной сеткой: сплюснутые ленты вдоль кривых.
 * Координаты — собственные координаты головы.
 */

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Тело в координатах головы: расстояние до кожи и нормаль наружу (чтобы пряди ложились на плечи и спину). */
export interface Drape {
  clearance: number;
  dist(p: THREE.Vector3): number;
  normal(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
}

/** Ниже этой высоты (в координатах головы) пряди огибают тело. */
const DRAPE_FROM = HEAD_Y - 0.1;

/** Точки пряди вдоль кривой; с drape — отодвинуты от тела и сглажены. */
function lockPoints(pts: THREE.Vector3[], seg: number, thick: number, drape?: Drape): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const P = Array.from({ length: seg + 1 }, (_, i) => curve.getPointAt(i / seg));
  if (!drape) return P;
  const nrm = new THREE.Vector3();
  const push = (): void => {
    P.forEach((p, i) => {
      if (i === 0 || p.y > DRAPE_FROM) return;
      const need = thick * (1 - 0.6 * (i / seg)) + drape.clearance;
      const d = drape.dist(p);
      if (d < need) p.addScaledVector(drape.normal(p, nrm), need - d);
    });
  };
  for (let it = 0; it < 3; it += 1) {
    push();
    // Сглаживание, чтобы прядь не ломалась там, где её отодвинули.
    const Q = P.map((p) => p.clone());
    for (let i = 1; i < seg; i += 1) P[i]!.copy(Q[i - 1]!).add(Q[i]!).add(Q[i]!).add(Q[i + 1]!).multiplyScalar(0.25);
  }
  push();
  return P;
}

/**
 * Пряди одной сеткой. Каждая — сплюснутая трубка вдоль кривой: широкая сторона лежит
 * вдоль головы, спины или плеч, к кончику прядь сужается. Развёртка: u — поперёк пряди,
 * v — вдоль, поэтому штрихи текстуры волос идут по пряди.
 */
export function strands(paths: THREE.Vector3[][], widths: number[], thick: number, seg = 22, radial = 10, drape?: Drape): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const O = new THREE.Vector3();
  const B = new THREE.Vector3();
  const S = new THREE.Vector3();
  const N = new THREE.Vector3();
  const n = new THREE.Vector3();
  paths.forEach((pts, li) => {
    const w0 = widths[li] ?? widths[0] ?? 0.03;
    const Ps = lockPoints(pts, seg, thick, drape);
    let len = 0;
    for (let i = 1; i <= seg; i += 1) len += Ps[i]!.distanceTo(Ps[i - 1]!);
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i += 1) {
      const t = i / seg;
      const P = Ps[i]!;
      T.subVectors(Ps[Math.min(seg, i + 1)]!, Ps[Math.max(0, i - 1)]!).normalize();
      // «Наружу»: у головы — от её центра, ниже — по нормали к телу (или от вертикальной оси).
      O.set(P.x, P.y > HEAD_Y ? P.y - HEAD_Y : 0, P.z + 0.03).normalize();
      if (drape && P.y < DRAPE_FROM) {
        const k = smooth(DRAPE_FROM, DRAPE_FROM - 0.2, P.y);
        O.lerp(drape.normal(P, B), k).normalize();
      }
      S.crossVectors(T, O);
      if (S.lengthSq() < 1e-8) S.set(1, 0, 0);
      S.normalize();
      N.crossVectors(S, T).normalize();
      // Прядь выходит из-под волос тонкой (корень не виден ступенькой), расходится и сужается к кончику.
      const w = w0 * (0.25 + 0.75 * smooth(0, 0.2, t)) * (1 - 0.82 * smooth(0.55, 1, t));
      const th = thick * (0.35 + 0.65 * smooth(0, 0.15, t)) * (1 - 0.6 * t);
      const perim = Math.PI * 2 * Math.sqrt((w * w + th * th) / 2);
      for (let j = 0; j <= radial; j += 1) {
        const a = (j / radial) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        pos.push(P.x + S.x * c * w + N.x * s * th, P.y + S.y * c * w + N.y * s * th, P.z + S.z * c * w + N.z * s * th);
        n.set(S.x * c * th + N.x * s * w, S.y * c * th + N.y * s * w, S.z * c * th + N.z * s * w).normalize();
        nor.push(n.x, n.y, n.z);
        uv.push((j / radial) * (perim / 1.6), t * len);
      }
    }
    for (let i = 0; i < seg; i += 1) {
      for (let j = 0; j < radial; j += 1) {
        const a = base + i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

