import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Figure } from '../../../game/state';
import { anatomy, band, bodyGeometry, frontZ, legOuterX, onTorso, section, skirt, type GarmentId } from './anatomy';
import { HEAD_R, HEAD_Y, NECK_WORLD, TORSO_Y, type BodyShape } from './body';
import { landmarks } from './bodyMesh';
import { at as faceAt } from './head';
import { eyeAnchor } from './headMesh';
import { HS, cape, dome, headArc, headBand, headR, onHead, star, type ItemCtx, type Outfit, type OutfitPlan } from './items3d';
import { M, cone, limb, mat, mesh, phys, ring, shade, taperTube, tex, v, type Mat } from './kit';

/**
 * Гардероб современного города: одежда (верх и низ), обувь, перчатки и браслеты,
 * украшения на шее, вещи на спине и головные уборы — плюс сборка всей одежды героя.
 * Одежда — оболочки тела по рецепту: слои, материалы и детали поверх (пояса, юбки,
 * пуговицы, лампасы, карманы). Откровенные вещи (купальники, корсеты, чулки, портупея)
 * всегда закрывают грудь и пах — без наготы.
 */

// ─── Материалы ──────────────────────────────────────────────────────────

type MatKind = 'cloth' | 'denim' | 'knit' | 'silk' | 'satin' | 'velvet' | 'leather' | 'latex' | 'net' | 'lace' | 'fur' | 'gold' | 'silver' | 'chrome' | 'gem' | 'glow' | 'pearl' | 'feather' | 'sequin' | 'rubber';
/** Материал рецепта; c — цвет (по умолчанию — цвет героя). */
interface MS {
  k: MatKind;
  c?: string;
}

function mk(ms: MS, color: string): Mat {
  const c = ms.c ?? color;
  switch (ms.k) {
    case 'cloth':
      return M.cloth(c, 8, 0.85);
    case 'denim':
      return M.cloth(c, 14, 0.92);
    case 'knit':
      return M.cloth(c, 4, 0.97);
    case 'silk':
      return phys(c, 0.34, { sheen: 0.8, sheenRoughness: 0.3, sheenColor: shade(c, 1.4) });
    case 'satin':
      return phys(c, 0.22, { sheen: 0.6, sheenRoughness: 0.2, sheenColor: shade(c, 1.5), clearcoat: 0.2 });
    case 'velvet':
      return phys(c, 0.85, { sheen: 1, sheenRoughness: 0.5, sheenColor: shade(c, 1.7) });
    case 'leather':
      return M.leather(c, 3);
    case 'latex':
      return phys(c, 0.12, { clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
    case 'net':
    case 'lace': {
      // Сетка и кружево: нити по карте прозрачности, сквозь просветы видна кожа.
      const m = mat(c, 0.6);
      const t = tex(ms.k, ms.k === 'net' ? 1.6 : 1.2);
      if (t) {
        m.alphaMap = t;
        m.alphaTest = 0.5;
      }
      m.side = THREE.DoubleSide;
      return m;
    }
    case 'fur': {
      const m = mat(c, 0.95);
      const t = tex('hair', 6, 2);
      if (t) {
        m.bumpMap = t;
        m.bumpScale = 3;
      }
      return m;
    }
    case 'gold':
      return M.gold();
    case 'silver':
      return M.silver();
    case 'chrome':
      return M.chrome();
    case 'gem':
      return M.gem(c, 0.5);
    case 'glow':
      return M.glow(c, 1.4);
    case 'pearl':
      return phys('#f4eee4', 0.18, { clearcoat: 0.9, sheen: 0.6, sheenColor: new THREE.Color('#ffe6f0') });
    case 'feather':
      return mat(c, 0.85, 0, { side: THREE.DoubleSide });
    case 'sequin': {
      // Пайетки: металлический блеск с мелкой «чешуёй» по карте рельефа.
      const m = mat(c, 0.28, 0.85, { envMapIntensity: 1.8 });
      const t = tex('net', 10);
      if (t) {
        m.bumpMap = t;
        m.bumpScale = 2;
      }
      return m;
    }
    case 'rubber':
      return mat(c, 0.9);
  }
}

const C = (c?: string): MS => ({ k: 'cloth', c });
const DENIM = '#3b5a85';

// ─── Измерения тела для деталей ─────────────────────────────────────────

/** Точка на поверхности тела (z) при движении от оси вперёд (dir = 1) или назад (−1). */
function surfaceZ(figure: Figure, x: number, y: number, dir: number, off: number): number {
  const a = anatomy(figure);
  const f = (z: number): number => Math.min(a.torso(x, y, z), a.leg(x, y, z)) - off;
  let z = dir > 0 ? -0.05 : 0.05;
  while (Math.abs(z) < 0.5 && f(z) < 0) z += 0.004 * dir;
  return z;
}

/** Передняя поверхность ноги (z) в точке (x, y) с отступом. */
function legFrontZ(figure: Figure, x: number, y: number, off: number): number {
  const a = anatomy(figure);
  let z = -0.1;
  while (z < 0.4 && a.leg(x, y, z) - off >= 0) z += 0.004;
  while (z < 0.4 && a.leg(x, y, z) - off < 0) z += 0.003;
  return z;
}

/**
 * Лоскут на передней поверхности корпуса (карман, рисунок): сетка от x0 до x1 и от y0 до y1
 * с отступом off; keep(u, w) — какие ячейки оставить (u, w от 0 до 1).
 */
function torsoPatch(figure: Figure, x0: number, x1: number, y0: number, y1: number, off: number, keep: (u: number, w: number) => boolean = () => true): THREE.BufferGeometry {
  const N = 16;
  const P: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = y0 + ((y1 - y0) * j) / N;
      P.push(x, y, frontZ(figure, x, y, off));
    }
  }
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      if (!keep((i + 0.5) / N, (j + 0.5) / N)) continue;
      const a = j * (N + 1) + i;
      idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

interface Foot {
  /** Центр стопы по x (у ноги с x > 0), полуширина, пятка и носок по z. */
  x: number;
  w: number;
  heel: number;
  toe: number;
}
const footCache = new Map<Figure, Foot>();

/** Размеры стопы по сетке тела (для каблуков, платформы, ремешков). */
function foot(figure: Figure): Foot {
  const hit = footCache.get(figure);
  if (hit) return hit;
  const p = bodyGeometry(figure).getAttribute('position');
  let x0 = 9;
  let x1 = -9;
  let z0 = 9;
  let z1 = -9;
  for (let i = 0; i < p.count; i += 1) {
    if (p.getY(i) > 0.05 || p.getX(i) < 0) continue;
    x0 = Math.min(x0, p.getX(i));
    x1 = Math.max(x1, p.getX(i));
    z0 = Math.min(z0, p.getZ(i));
    z1 = Math.max(z1, p.getZ(i));
  }
  const f = { x: (x0 + x1) / 2, w: (x1 - x0) / 2, heel: z0, toe: z1 };
  footCache.set(figure, f);
  return f;
}

/** Высота верха стопы в точке (x, z) с отступом. */
function footTopY(figure: Figure, x: number, z: number, off: number): number {
  const a = anatomy(figure);
  let y = 0.3;
  while (y > 0 && a.leg(x, y, z) - off > 0) y -= 0.003;
  return y;
}

/** Наружный край стопы (x) на высоте y в точке z с отступом. */
function footSideX(figure: Figure, z: number, y: number, off: number, dir: number): number {
  const a = anatomy(figure);
  const f = foot(figure);
  let x = f.x;
  while (Math.abs(x - f.x) < 0.2 && a.leg(x, y, z) - off < 0) x += 0.002 * dir;
  return x;
}

// ─── Одежда: верх и низ ─────────────────────────────────────────────────

type Deco =
  | { d: 'belt'; y: number; tube: number; m: MS; off: number; buckle?: MS }
  | { d: 'skirt'; pts: Array<[number, number]>; m: MS; pleats?: number; slit?: boolean }
  | { d: 'garter'; m: MS }
  | { d: 'coins'; m: MS; y: number }
  | { d: 'gem'; m: MS; at: 'chest' | 'belly' | 'hips' }
  /** Пуговицы по центру спереди от y0 до y1 (над талией), off — толщина ткани. */
  | { d: 'buttons'; m: MS; y0: number; y1: number; off: number; collar?: MS }
  /** Капюшон за спиной, карман-кенгуру и шнурки худи. */
  | { d: 'hood'; m: MS }
  /** Молния спереди по центру. */
  | { d: 'zip'; m: MS; y0: number; y1: number; off: number }
  /** Лампасы по бокам ног (и рукавов). */
  | { d: 'stripes'; m: MS; arms?: boolean; legs?: boolean; short?: boolean }
  /** Накладные карманы карго на бёдрах. */
  | { d: 'pockets'; m: MS }
  /** Потёртости и дыры на коленях. */
  | { d: 'rips'; m: MS }
  /** Резинки у щиколоток. */
  | { d: 'cuffs'; m: MS }
  /** Завязки на поясе. */
  | { d: 'strings'; m: MS; y: number }
  /** Рисунок на груди (круг с полосками). */
  | { d: 'print'; m: MS };

/** Значение, зависящее от фигуры. */
type ByFig<T> = T | { male: T; female: T };
const pick = <T,>(x: ByFig<T>, figure: Figure): T => (x !== null && typeof x === 'object' && 'male' in (x as object) ? (x as { male: T; female: T })[figure] : (x as T));

interface Wear {
  top?: ByFig<GarmentId | null>;
  bottom?: GarmentId;
  /** Материал верха (по умолчанию — ткань цвета героя). */
  m?: MS;
  /** Материал низа (по умолчанию — как у верха). */
  bm?: MS;
  layers?: Array<{ g: GarmentId; m: MS; only?: Figure }>;
  deco?: Deco[];
}

const W = (y: number): number => TORSO_Y + y;

/** Рецепты одежды для слотов «верх» и «низ». */
const WEAR: Record<string, Wear> = {
  // Верх
  basic_tee: { top: { male: 'tee', female: 'tee_fitted' }, m: C('#f4f6fa'), deco: [{ d: 'print', m: C() }] },
  tank_top: { top: { male: 'tank', female: 'crop_top' }, m: C('#f2f3f5') },
  bandeau_top: { top: 'tube_top', m: { k: 'satin', c: '#16161a' } },
  string_bikini_top: { top: 'bikini_top', m: C() },
  crop_top: { top: 'crop_top', m: C() },
  sports_bra: { top: { male: 'tank', female: 'sports_bra' }, m: { k: 'latex', c: '#22252b' } },
  hoodie: { top: 'tee_long', m: { k: 'knit' }, deco: [{ d: 'hood', m: { k: 'knit' } }] },
  lace_bralette: { top: 'bikini_top', m: C('#1b1b22'), layers: [{ g: 'sports_bra', m: { k: 'lace', c: '#1b1b22' }, only: 'female' }] },
  denim_crop: { top: 'crop_top', m: { k: 'denim', c: DENIM }, deco: [{ d: 'buttons', m: { k: 'silver' }, y0: 0.42, y1: 0.12, off: 0.016 }] },
  button_shirt: { top: 'tee_long', m: C('#f4f6fa'), deco: [{ d: 'buttons', m: { k: 'pearl' }, y0: 0.52, y1: -0.02, off: 0.022, collar: C('#d5dde8') }] },
  mesh_top: { top: { male: null, female: 'bikini_top' }, m: { k: 'satin', c: '#111114' }, layers: [{ g: 'crop_top', m: { k: 'net', c: '#111114' }, only: 'female' }, { g: 'tee_fitted', m: { k: 'net', c: '#111114' }, only: 'male' }] },
  halter_top: { top: 'breastplate', m: { k: 'satin' } },
  tracksuit: { top: 'tee_long', bottom: 'pants', m: { k: 'satin', c: '#1d2a5a' }, deco: [{ d: 'zip', m: { k: 'chrome' }, y0: 0.5, y1: -0.04, off: 0.022 }, { d: 'stripes', m: C('#f2f3f5'), arms: true, legs: true }] },
  leather_harness: { top: { male: null, female: 'tube_top' }, m: { k: 'leather', c: '#1d1a1a' }, layers: [{ g: 'harness', m: { k: 'leather', c: '#1d1a1a' } }] },
  open_vest: { top: { male: 'tee_fitted', female: 'tube_top' }, m: C('#26262b'), layers: [{ g: 'vest', m: C('#b9a58a') }] },
  kimono: { top: 'robe_top', bottom: 'pants', m: C('#f6f4ef'), deco: [{ d: 'belt', y: 0.04, tube: 0.022, m: C('#141418'), off: 0.03 }, { d: 'strings', m: C('#141418'), y: 0.04 }] },
  swimsuit: { top: 'bodysuit', bottom: 'bikini_bottom', m: { k: 'latex' } },
  leather_corset: { top: 'tube_top', m: C('#e8dcc4'), layers: [{ g: 'corset', m: { k: 'leather', c: '#2a1d17' } }] },
  chain_bikini: { top: 'bikini_top', bottom: 'bikini_bottom', m: { k: 'satin', c: '#141418' }, deco: [{ d: 'coins', m: { k: 'gold' }, y: -1 }] },
  velvet_bodysuit: { top: 'bodysuit', bottom: 'bikini_bottom', m: { k: 'velvet', c: '#5b0f2e' } },
  latex_corset: { top: 'tube_top', m: { k: 'latex', c: '#111114' }, layers: [{ g: 'corset', m: { k: 'latex', c: '#b0124a' } }] },
  latex_catsuit: { top: 'tee_long', bottom: 'leggings', m: { k: 'latex', c: '#111114' }, deco: [{ d: 'zip', m: { k: 'chrome' }, y0: 0.5, y1: -0.02, off: 0.022 }] },
  gold_bikini: { top: 'bikini_top', bottom: 'bikini_bottom', m: { k: 'gold' }, deco: [{ d: 'gem', m: { k: 'gem', c: '#e53935' }, at: 'chest' }] },
  diamond_bikini: { top: 'bikini_top', bottom: 'bikini_bottom', m: { k: 'sequin', c: '#e4e8ee' }, deco: [{ d: 'coins', m: { k: 'gem', c: '#e8f4ff' }, y: -1 }, { d: 'gem', m: { k: 'gem', c: '#bfe6ff' }, at: 'chest' }] },
  // Низ
  bikini_bottom: { bottom: 'bikini_bottom', bm: C() },
  gym_shorts: { bottom: 'shorts', bm: C('#2a2d33'), deco: [{ d: 'strings', m: C('#f2f3f5'), y: -0.01 }, { d: 'stripes', m: C(), legs: true, short: true }] },
  sweatpants: { bottom: 'pants', bm: { k: 'knit', c: '#8a8f98' }, deco: [{ d: 'strings', m: C('#f2f3f5'), y: -0.01 }, { d: 'cuffs', m: { k: 'knit', c: '#7a7f88' } }] },
  jeans: { bottom: 'pants', bm: { k: 'denim', c: DENIM }, deco: [{ d: 'belt', y: -0.02, tube: 0.011, m: { k: 'leather', c: '#3b2a1e' }, off: 0.016, buckle: { k: 'silver' } }, { d: 'cuffs', m: { k: 'denim', c: '#5a7aa5' } }] },
  yoga_leggings: { bottom: 'leggings', bm: { k: 'satin', c: '#3a2e5a' }, deco: [{ d: 'belt', y: -0.01, tube: 0.016, m: { k: 'satin', c: '#2a2140' }, off: 0.008 }] },
  denim_micro_shorts: { bottom: 'micro_shorts', bm: { k: 'denim', c: '#6d8fb8' } },
  mini_skirt: { bottom: 'bikini_bottom', bm: C('#16161a'), deco: [{ d: 'skirt', m: { k: 'leather', c: '#3a2418' }, pts: [[0.205, 0.0], [0.24, -0.1], [0.27, -0.2]] }] },
  ripped_jeans: { bottom: 'pants', bm: { k: 'denim', c: '#6d8fb8' }, deco: [{ d: 'rips', m: C('#e8eef5') }] },
  pleated_skirt: { bottom: 'bikini_bottom', bm: C('#141418'), deco: [{ d: 'skirt', m: C('#2b3a67'), pleats: 18, pts: [[0.205, 0.0], [0.25, -0.1], [0.3, -0.26]] }] },
  fishnet_stockings: { bottom: 'bikini_bottom', bm: { k: 'satin', c: '#111114' }, layers: [{ g: 'stockings', m: { k: 'net', c: '#111114' } }], deco: [{ d: 'garter', m: { k: 'satin', c: '#111114' } }] },
  cargo_pants: { bottom: 'pants', bm: C('#6b6a4a'), deco: [{ d: 'pockets', m: C('#5e5d40') }, { d: 'belt', y: -0.02, tube: 0.011, m: C('#26262b'), off: 0.016, buckle: { k: 'chrome' } }] },
  latex_leggings: { bottom: 'leggings', bm: { k: 'latex', c: '#111114' }, deco: [{ d: 'belt', y: 0.0, tube: 0.008, m: { k: 'latex', c: '#111114' }, off: 0.012, buckle: { k: 'chrome' } }] },
  pencil_skirt: { bottom: 'bikini_bottom', bm: C('#16161a'), deco: [{ d: 'skirt', m: C('#5a6070'), pts: [[0.205, 0.0], [0.245, -0.12], [0.25, -0.3], [0.24, -0.52]] }] },
  lace_garters: { bottom: 'bikini_bottom', bm: { k: 'satin', c: '#16161a' }, layers: [{ g: 'stockings', m: { k: 'lace', c: '#16161a' } }], deco: [{ d: 'garter', m: { k: 'satin', c: '#16161a' } }] },
  silk_sarong: { bottom: 'bikini_bottom', bm: { k: 'silk' }, deco: [{ d: 'skirt', m: { k: 'silk' }, slit: true, pts: [[0.2, 0.0], [0.26, -0.2], [0.3, -0.45], [0.31, -0.55]] }] },
  hot_pants: { bottom: 'micro_shorts', bm: { k: 'satin', c: '#e91e63' } },
  leather_pants: { bottom: 'leggings', bm: { k: 'leather', c: '#1d1a1a' }, deco: [{ d: 'belt', y: -0.01, tube: 0.009, m: { k: 'leather', c: '#111' }, off: 0.014, buckle: { k: 'silver' } }] },
  sequin_skirt: { bottom: 'bikini_bottom', bm: C('#141418'), deco: [{ d: 'skirt', m: { k: 'sequin', c: '#e8b84a' }, pts: [[0.205, 0.0], [0.24, -0.1], [0.265, -0.22]] }] },
};

/** Слои, которых нет у мужской фигуры (без них торс открыт). */
const FEMALE_ONLY = new Set<GarmentId>(['bikini_top', 'tube_top', 'breastplate', 'sports_bra']);

const forFigure = (g: GarmentId | null | undefined, figure: Figure): GarmentId | null | undefined => (g && figure === 'male' && FEMALE_ONLY.has(g) ? null : g);
const layersFor = (w: Wear, figure: Figure): Array<{ g: GarmentId; m: MS }> => (w.layers ?? []).filter((l) => (!l.only || l.only === figure) && forFigure(l.g, figure));

/** План слоёв для предмета верха или низа. */
export function wearPlan(id: string | undefined, figure: Figure): OutfitPlan {
  const w = id ? WEAR[id] : undefined;
  if (!w) return {};
  const layers = layersFor(w, figure).map((l) => l.g);
  const plan: OutfitPlan = {};
  if (w.top !== undefined) plan.top = forFigure(pick(w.top, figure), figure) ?? null;
  if (w.bottom) plan.bottom = w.bottom;
  if (layers.length) plan.layers = layers;
  return plan;
}

/** Кольцо вокруг конечности: центр c, ось dir, радиус r. */
function cuffRing(c: THREE.Vector3, dir: THREE.Vector3, r: number, tube: number, m: Mat): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 28), m);
  b.position.copy(c);
  b.quaternion.setFromUnitVectors(v(0, 0, 1), dir.clone().normalize());
  return b;
}

/** Точки вдоль наружной стороны руки (от плеча к запястью) с отступом. */
function armOuter(shape: BodyShape, sx: number, off: number): THREE.Vector3[] {
  const a = anatomy(shape.figure);
  const s = v(shape.shoulder.x * sx, shape.shoulder.y, shape.shoulder.z);
  const e = v(shape.elbow.x * sx, shape.elbow.y, shape.elbow.z);
  const w = v(shape.wrist.x * sx, shape.wrist.y, shape.wrist.z);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = 0.15 + (i / 10) * 1.7;
    const c = t <= 1 ? s.clone().lerp(e, t) : e.clone().lerp(w, t - 1);
    let q = 0;
    while (q < 0.15 && a.arm(c.x + q * sx, c.y, c.z) - off < 0) q += 0.002;
    out.push(v(c.x + q * sx, c.y, c.z));
  }
  return out;
}

function decoObjects(dc: Deco, shape: BodyShape, color: string): THREE.Object3D[] {
  const figure = shape.figure;
  const L = landmarks(figure);
  const tube = (pts: THREE.Vector3[], r: number, m: Mat): THREE.Mesh => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 4, r, 6), m);
  switch (dc.d) {
    case 'belt': {
      const y = W(dc.y);
      const out: THREE.Object3D[] = [band(shape, y, dc.tube, mk(dc.m, color), dc.off)];
      if (dc.buckle) out.push(mesh(new THREE.BoxGeometry(0.06, 0.045, 0.014), mk(dc.buckle, color), [0, y, frontZ(figure, 0, y, dc.off + dc.tube) + 0.006]));
      return out;
    }
    case 'skirt': {
      const m = mk(dc.m, color);
      m.side = THREE.DoubleSide;
      const sk = skirt(shape, m, dc.pts.map(([r, y]) => [r, y - 0.05]), 1.04);
      const pos = sk.geometry.getAttribute('position');
      const top = dc.pts[0]![1] - 0.05;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const a = Math.atan2(x, z);
        const k = Math.min(1, Math.max(0, (top - y) / 0.12));
        // Складки плиссе: радиус «гармошкой», сильнее книзу.
        const f = dc.pleats ? 1 + 0.035 * k * Math.abs(Math.sin(a * dc.pleats)) : 1 + 0.02 * k * Math.sin(a * 7);
        pos.setXYZ(i, x * f, y, z * f);
      }
      if (dc.slit) {
        // Разрез сбоку: убираем треугольники в узком секторе на левом бедре ниже середины.
        const idx = sk.geometry.index;
        if (idx) {
          const keep: number[] = [];
          for (let t = 0; t < idx.count; t += 3) {
            const vs = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
            const cut = vs.every((j) => Math.abs(Math.atan2(pos.getX(j), pos.getZ(j)) - 1.2) < 0.22 && pos.getY(j) < top - 0.12);
            if (!cut) keep.push(...vs);
          }
          sk.geometry.setIndex(keep);
        }
      }
      sk.geometry.computeVertexNormals();
      return [sk];
    }
    case 'garter': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [band(shape, W(-0.03), 0.009, m, 0.016)];
      const yTop = W(-0.04);
      const yBot = L.knee[1] + 0.24;
      for (const sx of [-1, 1]) {
        for (const dir of [1, -1]) {
          const x = (L.hip[0] + 0.02) * sx;
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 6; i += 1) {
            const y = yTop + ((yBot - yTop) * i) / 6;
            pts.push(v(x, y, surfaceZ(figure, x, y, dir, 0.01) + 0.002 * dir));
          }
          out.push(tube(pts, 0.005, m));
        }
      }
      return out;
    }
    case 'coins': {
      // Бахрома из цепочек с подвесками под лифом.
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [];
      const y0 = (L.nipple ? L.nipple[1] : L.armpit - 0.07) - 0.085;
      for (let i = -6; i <= 6; i += 1) {
        const x = i * 0.024;
        const len = 0.02 + (i % 2 === 0 ? 0 : 0.016);
        const z = frontZ(figure, x, y0, 0.016) + 0.004;
        out.push(limb(v(x, y0, z), v(x, y0 - len, z), 0.0018, m, 4));
        out.push(mesh(new THREE.OctahedronGeometry(0.008), m, [x, y0 - len - 0.006, z], [1, 1.3, 0.6]));
      }
      return out;
    }
    case 'gem': {
      const y = dc.at === 'chest' ? (L.nipple ? L.nipple[1] : L.armpit - 0.07) : dc.at === 'belly' ? W(0.12) : W(-0.06);
      const z = frontZ(figure, 0, y, 0.02);
      return [mesh(new THREE.OctahedronGeometry(0.022), mk(dc.m, color), [0, y, z + 0.012], [1, 1.3, 0.6])];
    }
    case 'buttons': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [];
      const n = Math.max(2, Math.round((dc.y0 - dc.y1) / 0.07));
      for (let i = 0; i <= n; i += 1) {
        const y = W(dc.y0 + ((dc.y1 - dc.y0) * i) / n);
        const p = onTorso(shape, 0, y, dc.off, 0.002);
        out.push(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), m, [p.x, p.y, p.z]).rotateX(Math.PI / 2));
      }
      if (dc.collar) {
        // Отложной воротник: два заострённых лоскута на груди у выреза.
        const cm = mk(dc.collar, color);
        cm.side = THREE.DoubleSide;
        const y = L.clavicle[1] - 0.01;
        for (const sx of [-1, 1]) {
          const x0 = sx < 0 ? -0.1 : 0.008;
          const x1 = sx < 0 ? -0.008 : 0.1;
          // Треугольник: широкий у плеча, остриё — вниз к центру.
          out.push(new THREE.Mesh(torsoPatch(figure, x0, x1, y - 0.09, y + 0.02, 0.028, (u, w) => {
            const t = sx < 0 ? 1 - u : u;
            return w > 1 - t * 1.3 && w > 0.1 * t;
          }), cm));
        }
      }
      return out;
    }
    case 'hood': {
      const m = mk(dc.m, color);
      m.side = THREE.DoubleSide;
      const out: THREE.Object3D[] = [];
      // Капюшон лежит на спине: валик вокруг шеи сзади и мягкий «мешок» на лопатках.
      const y = (L.clavicle[1] + 0.035 + NECK_WORLD) / 2 - 0.01;
      const s = section(figure, y);
      const zc = (s.zFront + s.zBack) / 2;
      const rim = neckLoop(figure, y, 0, 0.03, 48).filter((p) => p.z < zc + 0.02);
      rim.sort((p, q) => Math.atan2(p.x, -(p.z - zc)) - Math.atan2(q.x, -(q.z - zc)));
      out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 48, 0.026, 10), m));
      const hy = L.clavicle[1] - 0.09;
      out.push(mesh(new THREE.SphereGeometry(1, 28, 18), m, [0, hy, surfaceZ(figure, 0, hy, -1, 0.02) - 0.018], [0.15, 0.12, 0.035]));
      // Карман-кенгуру по форме живота и шнурки.
      const py = W(0.08);
      out.push(new THREE.Mesh(torsoPatch(figure, -0.13, 0.13, py - 0.065, py + 0.055, 0.03, (u, w) => w < 0.85 || Math.abs(u - 0.5) < 0.5 - (w - 0.85) * 1.2), m));
      const str = M.cloth('#f2f3f5', 3);
      for (const sx of [-1, 1]) {
        const a = onTorso(shape, 0.045 * sx, L.clavicle[1] - 0.02, 0.03, 0.004);
        out.push(limb(a, a.clone().add(v(0.004 * sx, -0.13, 0.01)), 0.004, str, 6));
        out.push(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), M.chrome(), [a.x + 0.004 * sx, a.y - 0.14, a.z + 0.011]));
      }
      return out;
    }
    case 'zip': {
      const m = mk(dc.m, color);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i += 1) pts.push(onTorso(shape, 0, W(dc.y0 + ((dc.y1 - dc.y0) * i) / 10), dc.off, 0.001));
      const out: THREE.Object3D[] = [tube(pts, 0.004, m)];
      out.push(mesh(new THREE.BoxGeometry(0.014, 0.03, 0.006), m, [pts[1]!.x, pts[1]!.y, pts[1]!.z + 0.004]));
      return out;
    }
    case 'stripes': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [];
      for (const sx of [-1, 1]) {
        if (dc.legs) {
          const pts: THREE.Vector3[] = [];
          const end = dc.short ? L.knee[1] + 0.22 : L.ankle[1] + 0.09;
          for (let i = 0; i <= 14; i += 1) {
            const y = W(-0.06) - (i / 14) * (W(-0.06) - end);
            pts.push(v(legOuterX(figure, y, 0.014) * sx, y, 0));
          }
          for (const dz of [-0.012, 0.012]) out.push(tube(pts.map((p) => p.clone().add(v(0, 0, dz))), 0.005, m));
        }
        if (dc.arms) for (const dz of [-0.01, 0.01]) out.push(tube(armOuter(shape, sx, 0.022).map((p) => p.add(v(0, 0, dz))), 0.0045, m));
      }
      return out;
    }
    case 'pockets': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [];
      const y = L.knee[1] + 0.2;
      for (const sx of [-1, 1]) {
        const x = legOuterX(figure, y, 0.014) * sx;
        const p = mesh(new THREE.BoxGeometry(0.02, 0.13, 0.11), m, [x + 0.006 * sx, y, 0.0]);
        out.push(p, mesh(new THREE.BoxGeometry(0.024, 0.035, 0.115), m, [x + 0.008 * sx, y + 0.07, 0.0]));
      }
      return out;
    }
    case 'rips': {
      // Светлые потёртости с нитками поперёк — на коленях и бёдрах.
      const m = mk(dc.m, color);
      m.side = THREE.DoubleSide;
      const out: THREE.Object3D[] = [];
      const thread = M.cloth('#f4f6fa', 2);
      for (const sx of [-1, 1]) {
        for (const [dy, w, h] of [[0.0, 0.07, 0.035], [0.24, 0.05, 0.022]] as const) {
          const y = L.knee[1] + dy;
          const x = L.knee[0] * sx + (dy > 0 ? 0.01 * sx : 0);
          const z = legFrontZ(figure, x, y, 0.016);
          out.push(mesh(new THREE.CircleGeometry(1, 16), m, [x, y, z], [w / 2, h / 2, 1]));
          for (let i = -1; i <= 1; i += 1) out.push(limb(v(x - w * 0.4, y + i * h * 0.25, z + 0.002), v(x + w * 0.4, y + i * h * 0.25, z + 0.002), 0.0018, thread, 4));
        }
      }
      return out;
    }
    case 'cuffs': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [];
      const y = L.ankle[1] + 0.09;
      for (const sx of [-1, 1]) {
        const k = (y - shape.ankle.y) / (shape.knee.y - shape.ankle.y);
        const c = shape.ankle.clone().lerp(shape.knee, k);
        out.push(ring(shape.ankleR + (shape.calfR - shape.ankleR) * k + 0.02, 0.018, m, y).translateX(c.x * sx).translateZ(c.z));
      }
      return out;
    }
    case 'print': {
      // Рисунок на груди: круг по форме ткани и три полоски-«надписи».
      const y = (L.nipple ? L.nipple[1] : L.armpit - 0.08) + (figure === 'female' ? 0.1 : 0.03);
      const out: THREE.Object3D[] = [new THREE.Mesh(torsoPatch(figure, -0.055, 0.055, y - 0.055, y + 0.055, 0.019, (u, w) => (u - 0.5) ** 2 + (w - 0.5) ** 2 < 0.25), mk(dc.m, color))];
      const white = mat('#f4f6fa', 0.8);
      white.side = THREE.DoubleSide;
      for (let i = 0; i < 3; i += 1) out.push(new THREE.Mesh(torsoPatch(figure, -0.035 + i * 0.006, 0.035 - i * 0.006, y + 0.018 - i * 0.02, y + 0.026 - i * 0.02, 0.0205), white));
      return out;
    }
    case 'strings': {
      const m = mk(dc.m, color);
      const y = W(dc.y);
      const z = frontZ(figure, 0.02, y, 0.03);
      return [mesh(new THREE.SphereGeometry(0.012, 10, 8), m, [0.0, y, z]), limb(v(0.0, y, z), v(0.02, y - 0.1, z + 0.01), 0.005, m, 6), limb(v(0.0, y, z), v(-0.015, y - 0.09, z + 0.01), 0.005, m, 6)];
    }
  }
}

/** Одежда предмета верха или низа. */
export function buildWear(id: string, ctx: ItemCtx): Outfit {
  const g = new THREE.Group();
  const w = WEAR[id];
  if (!w) return { group: g, plan: {}, layers: [] };
  const figure = ctx.shape.figure;
  const plan = wearPlan(id, figure);
  const top = mk(w.m ?? C(), ctx.color);
  const out: Outfit = { group: g, plan, top, bottom: w.bm ? mk(w.bm, ctx.color) : top, layers: layersFor(w, figure).map((l) => mk(l.m, ctx.color)) };
  // Без лифа (у мужской фигуры) украшения на груди не рисуем.
  const bare = w.top !== undefined && !plan.top;
  for (const dc of w.deco ?? []) {
    if (bare && (dc.d === 'coins' || (dc.d === 'gem' && dc.at === 'chest'))) continue;
    for (const o of decoObjects(dc, ctx.shape, ctx.color)) g.add(o);
  }
  return out;
}

// ─── Обувь ──────────────────────────────────────────────────────────────

type ShoeKind = 'boots' | 'sneakers' | 'sandals' | 'knee' | 'thigh' | 'flat' | 'none';
interface ShoeRecipe {
  shoe: ShoeKind;
  m: MS;
  sole?: MS;
  cuff?: MS;
  anklets?: MS;
  /** Шнуровка или ремешки поверх голенища. */
  straps?: MS;
  /** Шпилька под пяткой. */
  heel?: MS;
  /** Толстая подошва-платформа. */
  platform?: MS;
  /** Ремешок-перемычка шлёпанцев. */
  thong?: MS;
  /** Шнурки на подъёме. */
  laces?: MS;
  /** Полоса-«галочка» по боку кроссовка. */
  stripe?: MS;
  /** Помпон на носке тапочек. */
  pom?: MS;
  /** Резинки по бокам и ушко сзади (челси). */
  elastic?: MS;
}

const SHOES: Record<string, ShoeRecipe> = {
  house_slippers: { shoe: 'sneakers', m: { k: 'fur', c: '#f3c6d6' }, sole: C('#e9e2da'), pom: { k: 'fur', c: '#ffffff' } },
  flip_flops: { shoe: 'flat', m: { k: 'rubber', c: '#2a9df4' }, thong: { k: 'rubber', c: '#2a9df4' } },
  sneakers: { shoe: 'sneakers', m: C('#f4f6fa'), sole: { k: 'rubber', c: '#ffffff' }, laces: C('#ffffff'), stripe: { k: 'rubber', c: '#1d1f24' } },
  running_shoes: { shoe: 'sneakers', m: { k: 'knit', c: '#ff5a3c' }, sole: { k: 'rubber', c: '#f4f6fa' }, laces: C('#ffffff'), stripe: { k: 'rubber', c: '#ffffff' } },
  sandals: { shoe: 'sandals', m: { k: 'leather', c: '#8a5a3a' } },
  anklets: { shoe: 'none', m: { k: 'gold' }, anklets: { k: 'gold' } },
  platform_sneakers: { shoe: 'sneakers', m: C('#16161a'), sole: { k: 'rubber', c: '#ffffff' }, platform: { k: 'rubber', c: '#ffffff' }, laces: C('#ffffff') },
  chelsea_boots: { shoe: 'boots', m: { k: 'leather', c: '#6b4428' }, sole: { k: 'rubber', c: '#2a1f1a' }, elastic: { k: 'rubber', c: '#1d1a1a' } },
  combat_boots: { shoe: 'boots', m: { k: 'leather', c: '#1d1d1f' }, sole: { k: 'rubber', c: '#111' }, straps: { k: 'chrome' }, platform: { k: 'rubber', c: '#111' } },
  knee_boots: { shoe: 'knee', m: { k: 'leather', c: '#5a3a22' }, sole: C('#1d1f24'), heel: { k: 'leather', c: '#3a2418' } },
  high_heels: { shoe: 'sneakers', m: { k: 'latex', c: '#c8102e' }, sole: { k: 'latex', c: '#111114' }, heel: { k: 'latex', c: '#c8102e' } },
  suede_thigh_boots: { shoe: 'thigh', m: { k: 'velvet', c: '#3a2630' }, sole: C('#1d1f24'), heel: { k: 'velvet', c: '#3a2630' } },
  latex_thigh_boots: { shoe: 'thigh', m: { k: 'latex', c: '#111114' }, sole: { k: 'latex', c: '#0d0d0f' }, heel: { k: 'latex', c: '#111114' } },
  gold_sandals: { shoe: 'sandals', m: { k: 'gold' }, anklets: { k: 'gold' }, heel: { k: 'gold' } },
  designer_heels: { shoe: 'sneakers', m: { k: 'latex', c: '#111114' }, sole: { k: 'latex', c: '#d50032' }, heel: { k: 'gold' } },
};

const SHOE_LAYERS: Record<ShoeKind, GarmentId[]> = { boots: ['boots', 'sole'], sneakers: ['sneakers', 'sole'], sandals: ['sandals', 'sole'], knee: ['knee_boots', 'sole'], thigh: ['thigh_boots', 'sole'], flat: ['sole'], none: [] };

/** Обувь по умолчанию — простые кеды. */
const DEFAULT_SHOES: ShoeRecipe = { shoe: 'sneakers', m: C('#2d3440'), sole: { k: 'rubber', c: '#f4f6fa' } };

const shoeRecipe = (equipped: Partial<Record<Slot, string>>): ShoeRecipe => (equipped.feet ? SHOES[equipped.feet] : undefined) ?? DEFAULT_SHOES;

/** Радиус голени на высоте y (по модели ноги, с запасом). */
const shinR = (shape: BodyShape, y: number): number => {
  const y0 = shape.ankle.y + 0.04;
  const y1 = shape.knee.y - 0.1;
  const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return shape.ankleR + (shape.calfR - shape.ankleR) * k + 0.004;
};

/** Высота верха обуви. */
function shoeTopY(shape: BodyShape, kind: ShoeKind): number {
  if (kind === 'knee') return shape.knee.y - 0.03;
  if (kind === 'thigh') return shape.knee.y + 0.22;
  if (kind === 'boots') return shape.ankle.y + 0.27;
  if (kind === 'sneakers') return shape.ankle.y + 0.045;
  return shape.ankle.y;
}

/** Обувь (слои-оболочки ноги) и детали: каблуки, платформа, шнурки, браслеты. */
export function buildShoes(shape: BodyShape, equipped: Partial<Record<Slot, string>>, color: string, garment: (id: GarmentId, m: Mat) => THREE.Object3D): THREE.Object3D[] {
  const r = shoeRecipe(equipped);
  const figure = shape.figure;
  const out: THREE.Object3D[] = [];
  const layers = SHOE_LAYERS[r.shoe];
  if (r.shoe === 'flat') out.push(garment('sole', mk(r.sole ?? r.m, color)));
  else if (layers.length) {
    out.push(garment(layers[0]!, mk(r.m, color)));
    out.push(garment('sole', mk(r.sole ?? r.m, color)));
  }
  const ringAt = (y: number, extra: number, tube: number, m: Mat): void => {
    for (const sx of [-1, 1]) {
      const k = (y - shape.ankle.y) / (shape.knee.y - shape.ankle.y);
      const c = shape.ankle.clone().lerp(shape.knee, k);
      const rr = k > 1 ? shinR(shape, shape.knee.y) * 1.25 : shinR(shape, y);
      out.push(ring(rr + extra, tube, m, y, 1, 1).translateX(c.x * sx).translateZ(c.z));
    }
  };
  if (r.cuff && r.shoe !== 'none') ringAt(shoeTopY(shape, r.shoe) - 0.004, r.shoe === 'thigh' ? 0.03 : 0.02, r.cuff.k === 'fur' ? 0.03 : 0.014, mk(r.cuff, color));
  if (r.straps) {
    const m = mk(r.straps, color);
    for (const dy of [0.06, 0.11, 0.16, 0.21]) ringAt(shape.ankle.y + dy, 0.018, 0.005, m);
  }
  if (r.anklets) {
    const m = mk(r.anklets, color);
    ringAt(shape.ankle.y + 0.03, 0.006, 0.005, m);
    ringAt(shape.ankle.y + 0.05, 0.008, 0.004, m);
  }
  const f = foot(figure);
  for (const sx of [-1, 1]) {
    const x = f.x * sx;
    if (r.heel) {
      // Шпилька: тонкий каблук за пяткой, от задника к земле, и набойка.
      const m = mk(r.heel, color);
      const top = v(x, 0.075, f.heel + 0.03);
      const bottom = v(x, 0.004, f.heel - 0.012);
      out.push(cone(top, bottom, 0.017, 0.006, m, 12), mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10), mat('#111', 0.6), [bottom.x, 0.003, bottom.z]));
      out.push(mesh(new THREE.SphereGeometry(0.032, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, [x, 0.05, f.heel + 0.04], [1, 1, 1.1]).rotateX(-0.4));
    }
    if (r.platform) {
      // Платформа: овал подошвы толщиной 4 см.
      const s = new THREE.Shape();
      s.absellipse(0, 0, f.w + 0.018, (f.toe - f.heel) / 2 + 0.018, 0, Math.PI * 2, false, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 24 });
      geo.rotateX(Math.PI / 2);
      geo.translate(x, 0.044, (f.toe + f.heel) / 2);
      out.push(new THREE.Mesh(geo, mk(r.platform, color)));
    }
    if (r.thong) {
      // Перемычка: от промежутка между пальцами к бокам стопы.
      const m = mk(r.thong, color);
      const zt = f.toe - 0.05;
      const zs = f.heel + (f.toe - f.heel) * 0.55;
      const toe = v(x - 0.012 * sx, footTopY(figure, x - 0.012 * sx, zt, 0.006), zt);
      for (const side of [-1, 1]) {
        const sxp = footSideX(figure, zs, 0.03, 0.004, side * sx);
        const mid = v((toe.x + sxp) / 2, footTopY(figure, (toe.x + sxp) / 2, (zt + zs) / 2, 0.008), (zt + zs) / 2);
        out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([toe, mid, v(sxp, 0.025, zs)]), 16, 0.007, 6), m));
      }
    }
    if (r.laces) {
      const m = mk(r.laces, color);
      for (let i = 0; i < 4; i += 1) {
        const z = f.heel + (f.toe - f.heel) * (0.42 + i * 0.075);
        const y = footTopY(figure, x, z, 0.016);
        out.push(limb(v(x - 0.022, y, z), v(x + 0.022, y, z), 0.0035, m, 6));
      }
    }
    if (r.stripe) {
      const m = mk(r.stripe, color);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        const z = f.heel + 0.02 + (f.toe - f.heel) * 0.6 * t;
        const y = 0.04 + 0.025 * Math.sin(t * Math.PI * 0.9);
        pts.push(v(footSideX(figure, z, y, 0.014, sx), y, z));
      }
      out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.006, 6), m));
    }
    if (r.pom) {
      const z = f.toe - 0.07;
      out.push(mesh(new THREE.SphereGeometry(0.03, 14, 10), mk(r.pom, color), [x, footTopY(figure, x, z, 0.02) + 0.012, z]));
    }
    if (r.elastic) {
      const m = mk(r.elastic, color);
      m.side = THREE.DoubleSide;
      const y = shape.ankle.y + 0.08;
      const zc = shape.ankle.z;
      for (const side of [-1, 1]) {
        const ex = x + side * (shinR(shape, y) + 0.016);
        out.push(mesh(new THREE.PlaneGeometry(0.05, 0.09), m, [ex, y, zc]).rotateY(Math.PI / 2));
      }
      out.push(mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12, Math.PI), m, [x, shape.ankle.y + 0.27, zc - shinR(shape, shape.ankle.y + 0.27) - 0.012]).rotateY(Math.PI / 2));
    }
  }
  return out;
}

// ─── Руки: перчатки, браслеты, часы ─────────────────────────────────────

type HandRegion = 'hand' | 'fingerless' | 'wrap' | 'forearm' | 'opera' | 'bracer';
interface HandRecipe {
  region?: HandRegion;
  m: MS;
  off?: number;
  bangles?: MS;
  beads?: string[];
  /** Застёжка-липучка на запястье. */
  strap?: MS;
  /** Заклёпки на напульсниках. */
  studs?: MS;
  /** Часы или фитнес-браслет на левой руке: циферблат и цвет экрана. */
  watch?: { band: MS; face: MS; round: boolean };
  /** Браслет-дорожка из камней на левой руке. */
  tennis?: MS;
}

const HANDS: Record<string, HandRecipe> = {
  bead_bracelets: { m: C(), beads: ['#e53935', '#ffb020', '#3ddc84', '#4da3ff', '#b57bff', '#f2f3f5'] },
  fingerless_gloves: { region: 'fingerless', m: { k: 'leather', c: '#141416' }, strap: { k: 'rubber', c: '#2a2d33' } },
  fitness_tracker: { m: { k: 'rubber', c: '#16171a' }, watch: { band: { k: 'rubber' }, face: { k: 'glow', c: '#3ddc84' }, round: false } },
  boxing_wraps: { region: 'wrap', m: C('#c8102e') },
  gold_bracelets: { m: { k: 'gold' }, bangles: { k: 'gold' } },
  wrist_watch: { m: { k: 'leather', c: '#5a3a22' }, watch: { band: { k: 'leather', c: '#5a3a22' }, face: { k: 'pearl' }, round: true } },
  lace_gloves: { region: 'forearm', m: { k: 'lace', c: '#16161a' } },
  silk_opera_gloves: { region: 'opera', m: { k: 'satin' } },
  latex_opera_gloves: { region: 'opera', m: { k: 'latex', c: '#111114' } },
  studded_cuffs: { region: 'bracer', m: { k: 'leather', c: '#16161a' }, off: 0.01, studs: { k: 'chrome' } },
  diamond_bracelet: { m: { k: 'silver' }, tennis: { k: 'gem', c: '#e8f4ff' } },
};

/**
 * Слой «на коже» рук: участок сетки тела (с той же позой кистей), немного отодвинутый
 * наружу. Перчатки сидят точно по руке и по сжатому кулаку.
 */
function handLayer(shape: BodyShape, grips: readonly [boolean, boolean], region: HandRegion, off: number, m: Mat): THREE.Mesh {
  const src = bodyGeometry(shape.figure, grips);
  const pos = src.getAttribute('position');
  const nor = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const s = shape.shoulder;
  const e = shape.elbow;
  const w = shape.wrist;
  const fore = new THREE.Vector3().subVectors(w, e);
  const fl = fore.lengthSq();
  const up = new THREE.Vector3().subVectors(e, s);
  const ul = up.lengthSq();
  const handEnd = w.clone().addScaledVector(fore.clone().normalize(), 0.22);
  const p = new THREE.Vector3();
  const segDist = (a: THREE.Vector3, b: THREE.Vector3): number => {
    const ab = new THREE.Vector3().subVectors(b, a);
    const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq()));
    return a.clone().addScaledVector(ab, t).distanceTo(p);
  };
  const inside = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i);
    p.x = Math.abs(p.x);
    if (p.x < 0.14) continue;
    const near = Math.min(segDist(e, w), segDist(w, handEnd));
    const tf = new THREE.Vector3().subVectors(p, e).dot(fore) / fl;
    const tu = new THREE.Vector3().subVectors(p, s).dot(up) / ul;
    const nearUp = segDist(s, e) < 0.085 && tu > 0.45;
    let ok = false;
    if (near < 0.085) {
      if (region === 'hand') ok = tf > 0.96;
      else if (region === 'fingerless') ok = tf > 0.96 && tf < 1.13;
      else if (region === 'wrap') ok = tf > 0.78 && tf < 1.12;
      else if (region === 'forearm') ok = tf > 0.05;
      else if (region === 'opera') ok = true;
      else if (region === 'bracer') ok = tf > 0.68 && tf < 0.95;
    }
    if (region === 'opera' && nearUp) ok = true;
    inside[i] = ok ? 1 : 0;
  }
  const idx = src.index!;
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (inside[a] && inside[b] && inside[c]) keep.push(a, b, c);
  }
  const used = [...new Set(keep)].sort((x, y) => x - y);
  const map = new Map(used.map((o, n) => [o, n]));
  const P = new Float32Array(used.length * 3);
  const N = new Float32Array(used.length * 3);
  const UV = new Float32Array(used.length * 2);
  used.forEach((o, n) => {
    P[n * 3] = pos.getX(o) + nor.getX(o) * off;
    P[n * 3 + 1] = pos.getY(o) + nor.getY(o) * off;
    P[n * 3 + 2] = pos.getZ(o) + nor.getZ(o) * off;
    N[n * 3] = nor.getX(o);
    N[n * 3 + 1] = nor.getY(o);
    N[n * 3 + 2] = nor.getZ(o);
    if (uv) {
      UV[n * 2] = uv.getX(o);
      UV[n * 2 + 1] = uv.getY(o);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setIndex(keep.map((o) => map.get(o)!));
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, m);
}

/** Предмет слота «руки»; grips — какие кисти сжаты (держат предмет). */
export function buildHands(id: string, ctx: ItemCtx, grips: readonly [boolean, boolean]): THREE.Group {
  const g = new THREE.Group();
  const r = HANDS[id];
  if (!r) return g;
  const { shape, color } = ctx;
  if (r.region) g.add(handLayer(shape, grips, r.region, r.off ?? 0.0035, mk(r.m, color)));
  const e = shape.elbow;
  const w = shape.wrist;
  const at = (t: number, sx: number): THREE.Vector3 => v(e.x * sx, e.y, e.z).lerp(v(w.x * sx, w.y, w.z), t);
  const dir = (sx: number): THREE.Vector3 => v(w.x * sx, w.y, w.z).sub(v(e.x * sx, e.y, e.z)).normalize();
  /** Наружу от руки (тыльная сторона запястья у опущенной руки). */
  const side = (sx: number): THREE.Vector3 => {
    const d = dir(sx);
    return v(sx, 0, 0).sub(d.clone().multiplyScalar(d.x * sx)).normalize();
  };
  const bangle = (t: number, rad: number, tube: number, m: Mat, sides: number[] = [-1, 1]): void => {
    for (const sx of sides) g.add(cuffRing(at(t, sx), dir(sx), rad, tube, m));
  };
  const R = shape.foreR;
  if (r.bangles) {
    const m = mk(r.bangles, color);
    bangle(0.86, R * 0.78 + 0.012, 0.006, m);
    bangle(0.9, R * 0.76 + 0.012, 0.005, m);
    bangle(0.94, R * 0.74 + 0.012, 0.006, m);
  }
  if (r.beads) {
    const geo = new THREE.SphereGeometry(0.0075, 8, 6);
    r.beads.forEach((c, k) => {
      const m = phys(c, 0.3, { clearcoat: 0.8 });
      for (const sx of [-1, 1]) {
        for (const t of [0.87, 0.92]) {
          const c0 = at(t, sx);
          const d = dir(sx);
          const u = side(sx);
          const wv = new THREE.Vector3().crossVectors(d, u);
          const rad = R * 0.76 + 0.012;
          for (let i = k; i < 28; i += r.beads!.length) {
            const a = (i / 28) * Math.PI * 2 + t * 3;
            g.add(mesh(geo, m, c0.clone().addScaledVector(u, Math.cos(a) * rad).addScaledVector(wv, Math.sin(a) * rad).toArray() as [number, number, number]));
          }
        }
      }
    });
  }
  if (r.strap) bangle(0.97, R * 0.72 + 0.014, 0.01, mk(r.strap, color));
  if (r.studs) {
    const m = mk(r.studs, color);
    for (const sx of [-1, 1]) {
      const d = dir(sx);
      const u = side(sx);
      const wv = new THREE.Vector3().crossVectors(d, u);
      for (const t of [0.75, 0.88]) {
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          const n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(wv, Math.sin(a));
          const base = at(t, sx).addScaledVector(n, R * 0.85 + 0.018);
          g.add(cone(base, base.clone().addScaledVector(n, 0.016), 0.007, 0.001, m, 8));
        }
      }
    }
  }
  if (r.watch) {
    // Часы — на левой руке (x > 0): ремешок и корпус на тыльной стороне запястья.
    const sx = 1;
    const c = at(0.9, sx);
    bangle(0.9, R * 0.76 + 0.012, 0.008, mk(r.watch.band, color), [sx]);
    const u = side(sx);
    const base = c.clone().addScaledVector(u, R * 0.76 + 0.02);
    const body = r.watch.round ? new THREE.CylinderGeometry(0.022, 0.022, 0.012, 28) : new THREE.BoxGeometry(0.03, 0.01, 0.022);
    const caseM = r.watch.round ? M.gold() : mat('#16171a', 0.4);
    const watch = mesh(body, caseM, base.toArray() as [number, number, number]);
    watch.quaternion.setFromUnitVectors(v(0, 1, 0), u);
    g.add(watch);
    const face = mesh(r.watch.round ? new THREE.CircleGeometry(0.018, 28) : new THREE.PlaneGeometry(0.024, 0.016), mk(r.watch.face, color), base.clone().addScaledVector(u, 0.0065).toArray() as [number, number, number]);
    face.quaternion.setFromUnitVectors(v(0, 0, 1), u);
    g.add(face);
    if (r.watch.round) {
      for (const [len, ang] of [[0.012, 0.6], [0.009, 2.2]] as const) {
        const hand = mesh(new THREE.BoxGeometry(0.0018, len, 0.001), mat('#111', 0.5), [0, len / 2, 0]);
        const pivot = new THREE.Group();
        pivot.add(hand);
        pivot.position.copy(base).addScaledVector(u, 0.007);
        pivot.quaternion.setFromUnitVectors(v(0, 0, 1), u);
        pivot.rotateZ(ang);
        g.add(pivot);
      }
    }
  }
  if (r.tennis) {
    const sx = 1;
    const m = mk(r.tennis, color);
    bangle(0.9, R * 0.76 + 0.012, 0.004, mk(r.m, color), [sx]);
    const d = dir(sx);
    const u = side(sx);
    const wv = new THREE.Vector3().crossVectors(d, u);
    const c = at(0.9, sx);
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2;
      const n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(wv, Math.sin(a));
      g.add(mesh(new THREE.OctahedronGeometry(0.0065), m, c.clone().addScaledVector(n, R * 0.76 + 0.017).toArray() as [number, number, number]));
    }
  }
  return g;
}

// ─── Шея: украшения ─────────────────────────────────────────────────────

type NeckKind = 'chain' | 'choker' | 'pearls' | 'scarf' | 'collar' | 'pendant' | 'boa' | 'badge' | 'phones' | 'medal' | 'diamonds';
interface NeckRecipe {
  kind: NeckKind;
  m: MS;
  gem?: MS;
}

const NECK: Record<string, NeckRecipe> = {
  gold_chain: { kind: 'chain', m: { k: 'gold' } },
  lanyard_badge: { kind: 'badge', m: C() },
  leather_choker: { kind: 'choker', m: { k: 'leather', c: '#1b1714' }, gem: { k: 'silver' } },
  pearl_necklace: { kind: 'pearls', m: { k: 'pearl' } },
  neck_headphones: { kind: 'phones', m: { k: 'rubber', c: '#1d1f24' } },
  lace_choker: { kind: 'choker', m: { k: 'satin', c: '#141418' }, gem: { k: 'gem', c: '#b0124a' } },
  silk_scarf: { kind: 'scarf', m: { k: 'silk' } },
  spiked_collar: { kind: 'collar', m: { k: 'leather', c: '#141416' }, gem: { k: 'chrome' } },
  crystal_pendant: { kind: 'pendant', m: { k: 'silver' }, gem: { k: 'glow', c: '#7fd8ff' } },
  feather_boa: { kind: 'boa', m: { k: 'fur', c: '#ff7ab8' } },
  marathon_medal: { kind: 'medal', m: C(), gem: { k: 'gold' } },
  diamond_necklace: { kind: 'diamonds', m: { k: 'silver' }, gem: { k: 'gem', c: '#e8f4ff' } },
};

/** Петля вокруг шеи по поверхности тела; на груди спереди опускается на drop. */
function neckLoop(figure: Figure, y0: number, drop: number, off: number, n = 64): THREE.Vector3[] {
  const a = anatomy(figure);
  const sec = section(figure, y0);
  const zc = (sec.zFront + sec.zBack) / 2;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const dx = Math.sin(t);
    const dz = Math.cos(t);
    const y = y0 - drop * Math.max(0, dz) ** 2.2;
    let q = 0.02;
    while (q < 0.5 && a.torso(dx * q, y, zc + dz * q) - off < 0) q += 0.003;
    pts.push(v(dx * q, y, zc + dz * q));
  }
  return pts;
}

export function buildNeck(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const r = NECK[id];
  if (!r) return g;
  const figure = ctx.shape.figure;
  const L = landmarks(figure);
  const m = mk(r.m, ctx.color);
  const base = L.clavicle[1] + 0.035;
  const mid = (base + NECK_WORLD) / 2;
  const tube = (pts: THREE.Vector3[], rad: number, mm: Mat): THREE.Mesh => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length * 2, rad, 8, true), mm);
  const lowest = (pts: THREE.Vector3[]): THREE.Vector3 => pts.reduce((a, b) => (b.z > a.z && Math.abs(b.x) < 0.02 ? b : a), pts[0]!);
  switch (r.kind) {
    case 'chain':
    case 'pendant': {
      const pts = neckLoop(figure, base, r.kind === 'chain' ? 0.07 : 0.1, 0.006);
      g.add(tube(pts, r.kind === 'chain' ? 0.0045 : 0.003, m));
      const low = lowest(pts);
      if (r.kind === 'pendant' && r.gem) g.add(mesh(new THREE.OctahedronGeometry(0.022), mk(r.gem, ctx.color), [low.x, low.y - 0.026, low.z + 0.012], [0.8, 1.4, 0.6]));
      break;
    }
    case 'diamonds': {
      // Колье: дорожка камней по ключицам и капля по центру.
      const pts = neckLoop(figure, base, 0.08, 0.01, 44);
      const gm = mk(r.gem!, ctx.color);
      g.add(tube(pts, 0.002, m));
      for (const p of pts) if (p.z > 0) g.add(mesh(new THREE.OctahedronGeometry(0.0085), gm, [p.x, p.y, p.z]));
      const low = lowest(pts);
      g.add(mesh(new THREE.OctahedronGeometry(0.02), gm, [low.x, low.y - 0.03, low.z + 0.01], [0.8, 1.5, 0.6]));
      break;
    }
    case 'pearls': {
      const pts = neckLoop(figure, base, 0.06, 0.012, 40);
      const geo = new THREE.SphereGeometry(0.009, 10, 8);
      for (const p of pts) g.add(mesh(geo, m, [p.x, p.y, p.z]));
      break;
    }
    case 'choker':
    case 'collar': {
      const rad = r.kind === 'collar' ? 0.014 : 0.009;
      g.add(band(ctx.shape, mid, rad, m, 0.006 + rad * 0.6));
      const front = frontZ(figure, 0, mid, 0.02);
      if (r.gem && r.kind === 'choker') g.add(mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 20), mk(r.gem, ctx.color), [0, mid - 0.018, front + 0.004]));
      if (r.gem && r.kind === 'collar') {
        const pts = neckLoop(figure, mid, 0, 0.02, 14);
        const sm = mk(r.gem, ctx.color);
        const s = section(figure, mid);
        for (const p of pts) {
          const out = v(p.x, 0, p.z - (s.zFront + s.zBack) / 2).normalize();
          g.add(cone(p, p.clone().addScaledVector(out, 0.03), 0.009, 0.001, sm, 8));
        }
      }
      break;
    }
    case 'scarf': {
      g.add(band(ctx.shape, mid, 0.022, m, 0.025));
      const front = frontZ(figure, 0.03, mid, 0.04);
      g.add(limb(v(0.03, mid - 0.02, front), v(0.06, mid - 0.24, front + 0.02), 0.022, m), limb(v(0.0, mid - 0.02, front), v(-0.01, mid - 0.2, front + 0.03), 0.02, m));
      break;
    }
    case 'boa': {
      g.add(tube(neckLoop(figure, base - 0.01, 0.11, 0.03, 48), 0.032, m));
      break;
    }
    case 'badge':
    case 'medal': {
      // Лента вокруг шеи глубоким «V», внизу — бейдж или медаль.
      const drop = r.kind === 'badge' ? 0.3 : 0.2;
      const pts = neckLoop(figure, base, drop, 0.012, 56);
      const low = lowest(pts);
      const ribbon = r.kind === 'medal' ? M.cloth('#c8102e', 3, 0.6) : m;
      g.add(tube(pts, r.kind === 'medal' ? 0.007 : 0.0045, ribbon));
      if (r.kind === 'badge') {
        g.add(mesh(new THREE.BoxGeometry(0.012, 0.025, 0.006), M.chrome(), [low.x, low.y - 0.012, low.z + 0.004]));
        const card = mesh(new THREE.BoxGeometry(0.07, 0.1, 0.004), mat('#f4f6fa', 0.4), [low.x, low.y - 0.075, low.z + 0.008]);
        g.add(card, mesh(new THREE.PlaneGeometry(0.07, 0.02), mat(ctx.color, 0.5), [low.x, low.y - 0.04, low.z + 0.0105]), mesh(new THREE.PlaneGeometry(0.026, 0.03), mat('#9aa1ab', 0.6), [low.x - 0.014, low.y - 0.075, low.z + 0.0105]));
      } else {
        const gm = mk(r.gem!, ctx.color);
        const disc = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 32), gm, [low.x, low.y - 0.04, low.z + 0.012]);
        disc.rotation.x = Math.PI / 2;
        const st = star(0.022, 0.009, 0.004, M.gold());
        st.position.set(low.x, low.y - 0.04, low.z + 0.018);
        g.add(disc, st);
      }
      break;
    }
    case 'phones': {
      // Наушники, сдвинутые на шею: дужка сзади, чашки лежат на ключицах.
      const pts = neckLoop(figure, base + 0.02, 0, 0.03, 32).filter((p) => p.z < (section(figure, base).zFront + section(figure, base).zBack) / 2 + 0.02);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.009, 8), m));
      for (const sx of [-1, 1]) {
        const x = 0.1 * sx;
        const y = base - 0.02;
        const z = frontZ(figure, x, y, 0.035);
        const cup = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24), m, [x, y, z]);
        cup.rotation.set(-0.9, 0, 0.4 * sx);
        g.add(cup, mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.032, 24), mat(ctx.color, 0.4), [x, y + 0.004, z + 0.003]).rotateX(-0.9).rotateZ(0.4 * sx));
      }
      break;
    }
  }
  return g;
}

// ─── Спина: рюкзаки, куртки на плечах, крылья ──────────────────────────

type BackKind = 'jacket' | 'backpack' | 'mat' | 'guitar' | 'crossbody' | 'feather_wings' | 'bat_wings' | 'fairy_wings';
interface BackRecipe {
  kind: BackKind;
  m: MS;
  trim?: MS;
  small?: boolean;
}

const BACK: Record<string, BackRecipe> = {
  rolled_mat: { kind: 'mat', m: { k: 'rubber', c: '#7e57c2' }, trim: { k: 'rubber', c: '#26262b' } },
  gym_backpack: { kind: 'backpack', m: { k: 'cloth', c: '#2a2d33' } },
  crossbody_bag: { kind: 'crossbody', m: { k: 'leather', c: '#8a5a3a' }, trim: { k: 'gold' } },
  mini_backpack: { kind: 'backpack', m: { k: 'leather' }, small: true },
  denim_jacket: { kind: 'jacket', m: { k: 'denim', c: DENIM }, trim: { k: 'silver' } },
  guitar_case: { kind: 'guitar', m: { k: 'cloth', c: '#1d1f24' }, trim: { k: 'chrome' } },
  fairy_wings: { kind: 'fairy_wings', m: { k: 'glow', c: '#9ef0ff' } },
  leather_jacket: { kind: 'jacket', m: { k: 'leather', c: '#16161a' }, trim: { k: 'chrome' } },
  bat_wings: { kind: 'bat_wings', m: { k: 'latex', c: '#4a0d18' } },
  feather_wings: { kind: 'feather_wings', m: { k: 'feather', c: '#2a2a32' } },
  angel_wings: { kind: 'feather_wings', m: { k: 'feather', c: '#fbfbff' }, trim: { k: 'glow', c: '#fff3c4' } },
};

/** Точка между лопатками на спине (поверхность с отступом). */
function backPoint(figure: Figure, y: number, off: number): THREE.Vector3 {
  return v(0, y, surfaceZ(figure, 0, y, -1, off));
}

function wing(kind: BackKind, m: Mat, trim: Mat | null, sx: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'feather_wings') {
    // Перья рядами вдоль «руки» крыла: длинные маховые снаружи, кроющие короче.
    const arm = new THREE.CatmullRomCurve3([v(0, 0, 0), v(0.22 * sx, 0.18, -0.12), v(0.5 * sx, 0.3, -0.22), v(0.78 * sx, 0.22, -0.28)]);
    const feather = new THREE.SphereGeometry(1, 10, 6);
    for (let row = 0; row < 3; row += 1) {
      const n = 14 - row * 3;
      for (let i = 0; i < n; i += 1) {
        const t = 0.12 + (0.88 * i) / (n - 1);
        const p = arm.getPoint(t);
        const len = (0.16 + 0.32 * t) * (1 - row * 0.3);
        const f = new THREE.Mesh(feather, m);
        f.scale.set(0.035, len / 2, 0.008);
        f.position.copy(p).add(v(0.02 * sx * row, -len / 2 + 0.02 + row * 0.05, 0.01 * row));
        f.rotation.z = sx * (0.15 + 0.5 * t);
        g.add(f);
      }
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(arm, 24, 0.022, 8), m));
    if (trim) g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), trim, [0.78 * sx, 0.24, -0.28]));
  } else if (kind === 'bat_wings') {
    // Перепонка между «пальцами» крыла с фестончатым нижним краем.
    const tips = [v(0.85 * sx, 0.35, -0.3), v(0.75 * sx, -0.05, -0.28), v(0.5 * sx, -0.3, -0.2), v(0.22 * sx, -0.32, -0.1)];
    const elbow = v(0.4 * sx, 0.38, -0.2);
    const bone = trim ?? mat('#1a1012', 0.6);
    g.add(limb(v(0, 0, 0), elbow, 0.02, bone));
    for (const t of tips) g.add(limb(elbow, t, 0.012, bone));
    const P: number[] = [];
    const add = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
      P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    const ring2 = [v(0, 0, 0), ...tips, v(0.02 * sx, -0.25, -0.05)];
    for (let i = 1; i < ring2.length - 1; i += 1) {
      const a = ring2[i]!;
      const b = ring2[i + 1]!;
      const mid = a.clone().lerp(b, 0.5).lerp(elbow, 0.22);
      add(elbow, a, mid);
      add(elbow, mid, b);
    }
    add(elbow, v(0, 0, 0), tips[0]!);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.computeVertexNormals();
    const mm = m.clone();
    mm.side = THREE.DoubleSide;
    g.add(new THREE.Mesh(geo, mm));
  } else {
    // Крылья феи: две пары прозрачных светящихся лепестков.
    const mm = m.clone();
    mm.transparent = true;
    mm.opacity = 0.45;
    mm.side = THREE.DoubleSide;
    mm.depthWrite = false;
    for (const [len, w, ang, y] of [[0.42, 0.2, 0.6, 0.06], [0.3, 0.14, -0.5, -0.04]] as const) {
      const geo = new THREE.CircleGeometry(1, 32);
      geo.scale(len / 2, w / 2, 1);
      geo.translate(len / 2, 0, 0);
      const me = new THREE.Mesh(geo, mm);
      // Крыло отведено назад и вверх; левое — зеркальная копия правого.
      me.rotation.set(0, 0.35 * sx, ang * sx);
      me.position.y = y;
      if (sx < 0) me.scale.x = -1;
      g.add(me);
    }
  }
  return g;
}

/** Ремень через грудь: от верха вещи на спине через плечо к бедру с другой стороны. */
function chestStrap(figure: Figure, from: THREE.Vector3, to: THREE.Vector3, sx: number, r: number, m: Mat): THREE.Mesh {
  const L = landmarks(figure);
  const s = section(figure, L.clavicle[1]);
  const sTop = v(0.11 * sx, L.clavicle[1] + 0.02, (s.zFront + s.zBack) / 2);
  const pts = [from, sTop, v(-0.02 * sx, L.armpit - 0.05, surfaceZ(figure, -0.02 * sx, L.armpit - 0.05, 1, 0.025)), v(-0.15 * sx, TORSO_Y + 0.15, surfaceZ(figure, -0.15 * sx, TORSO_Y + 0.15, 1, 0.025)), to];
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 6), m);
}

export function buildBack(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const r = BACK[id];
  if (!r) return g;
  const { shape, color } = ctx;
  const figure = shape.figure;
  const L = landmarks(figure);
  const m = mk(r.m, color);
  const trim = r.trim ? mk(r.trim, color) : null;
  switch (r.kind) {
    case 'jacket': {
      // Куртка, наброшенная на плечи: короткое полотно на спине, воротник и пустые рукава.
      const c = cape(m, shape, 0.5);
      c.scale.x = 1.08;
      g.add(c);
      const s = section(figure, L.clavicle[1]);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(figure === 'female' ? 0.2 : 0.23, 0.03, 10, 40, Math.PI * 1.3), m);
      collar.position.set(0, L.clavicle[1] + 0.03, (s.zFront + s.zBack) / 2 - 0.01);
      collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.85);
      collar.scale.set(1.15, 0.85, 1);
      g.add(collar);
      for (const sx of [-1, 1]) {
        const top = v((shape.shoulder.x + 0.03) * sx, shape.shoulder.y - 0.02, -0.12);
        g.add(cone(top, v((shape.shoulder.x + 0.05) * sx, shape.shoulder.y - 0.5, -0.16), 0.06, 0.05, m, 16));
        if (trim) g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), trim, [0.14 * sx, L.armpit - 0.08, surfaceZ(figure, 0.14 * sx, L.armpit - 0.08, -1, 0.03) - 0.002]));
      }
      break;
    }
    case 'backpack': {
      const k = r.small ? 0.68 : 1;
      const y = L.armpit - (r.small ? 0.02 : 0.1);
      const p = backPoint(figure, y, 0.02);
      const d = 0.13 * k;
      const box = mesh(new THREE.CapsuleGeometry(0.13 * k, 0.16 * k, 8, 20), m, [0, y - 0.02, p.z - d / 2], [1.05, 1, 0.5]);
      g.add(box);
      // Передний карман, молния и петля для переноски.
      g.add(mesh(new THREE.CapsuleGeometry(0.09 * k, 0.04 * k, 6, 16), mk({ k: r.small ? 'leather' : 'cloth', c: r.small ? undefined : '#3a3e46' }, color), [0, y - 0.09 * k, p.z - d - 0.01], [1.1, 1, 0.35]));
      g.add(mesh(new THREE.TorusGeometry(0.12 * k, 0.004, 6, 32, Math.PI), M.chrome(), [0, y - 0.02 + 0.06 * k, p.z - d / 2 - 0.004]).rotateY(Math.PI / 2));
      g.add(mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 16, Math.PI), m, [0, y + 0.22 * k, p.z - d / 2]));
      for (const sx of [-1, 1]) {
        const x = 0.09 * sx;
        const s = section(figure, L.clavicle[1]);
        const top = v(x, L.clavicle[1] + 0.02, (s.zFront + s.zBack) / 2);
        const pts = [v(x, y + 0.15 * k, p.z - 0.01), top, v(x * 1.3, L.armpit - 0.02, surfaceZ(figure, x * 1.3, L.armpit - 0.02, 1, 0.02)), v(x * 1.6, y - 0.1, surfaceZ(figure, x * 1.6, y - 0.1, 1, 0.02) - 0.03)];
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.012, 6), mat('#1d1f24', 0.8)));
      }
      break;
    }
    case 'mat': {
      // Коврик рулоном по диагонали спины на ремне через грудь.
      const y = L.armpit - 0.12;
      const p = backPoint(figure, y, 0.07);
      const a = v(-0.2, y - 0.2, p.z - 0.01);
      const b = v(0.2, y + 0.22, p.z - 0.03);
      g.add(cone(a, b, 0.06, 0.06, m, 28));
      for (const e of [a, b]) {
        const end = mesh(new THREE.CircleGeometry(0.06, 24), mat(shade(r.m.c ?? color, 0.7), 0.85, 0, { side: THREE.DoubleSide }), e.toArray() as [number, number, number]);
        end.quaternion.setFromUnitVectors(v(0, 0, 1), b.clone().sub(a).normalize());
        g.add(end);
      }
      const strap = trim ?? m;
      g.add(chestStrap(figure, b.clone().lerp(a, 0.1), a.clone().lerp(b, 0.1), 1, 0.012, strap));
      break;
    }
    case 'guitar': {
      // Гитара в мягком чехле — по диагонали, гриф над плечом.
      const y = L.armpit - 0.2;
      const p = backPoint(figure, y, 0.08);
      const body = new THREE.Shape();
      body.moveTo(0, 0.27);
      body.bezierCurveTo(0.12, 0.27, 0.16, 0.18, 0.14, 0.1);
      body.bezierCurveTo(0.13, 0.04, 0.12, 0.0, 0.16, -0.06);
      body.bezierCurveTo(0.24, -0.16, 0.22, -0.3, 0, -0.31);
      body.bezierCurveTo(-0.22, -0.3, -0.24, -0.16, -0.16, -0.06);
      body.bezierCurveTo(-0.12, 0.0, -0.13, 0.04, -0.14, 0.1);
      body.bezierCurveTo(-0.16, 0.18, -0.12, 0.27, 0, 0.27);
      const geo = new THREE.ExtrudeGeometry(body, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 16 });
      geo.translate(0, 0, -0.045);
      const holder = new THREE.Group();
      holder.add(new THREE.Mesh(geo, m));
      holder.add(mesh(new THREE.BoxGeometry(0.09, 0.62, 0.07), m, [0, 0.58, 0]));
      holder.add(mesh(new THREE.BoxGeometry(0.11, 0.16, 0.06), m, [0, 0.95, 0]));
      if (trim) holder.add(mesh(new THREE.TorusGeometry(0.1, 0.004, 6, 32), trim, [0, 0, -0.067]));
      holder.position.set(0.04, y - 0.05, p.z - 0.08);
      holder.rotation.z = -0.45;
      holder.scale.setScalar(0.92);
      g.add(holder);
      g.add(chestStrap(figure, v(-0.12, y + 0.42, p.z - 0.04), v(0.17, y - 0.2, p.z - 0.04), 1, 0.012, mat('#2a2d33', 0.8)));
      break;
    }
    case 'crossbody': {
      // Небольшая сумка на бедре справа (у зрителя — слева) на ремне через левое плечо.
      const y = TORSO_Y - 0.04;
      const x = -(section(figure, y).wx + 0.01);
      const z = surfaceZ(figure, x * 0.75, y, 1, 0.04) - 0.03;
      const bag = new THREE.Group();
      bag.add(mesh(new THREE.BoxGeometry(0.17, 0.13, 0.055), m));
      bag.add(mesh(new THREE.BoxGeometry(0.172, 0.07, 0.058), mk({ k: 'leather', c: '#6b4428' }, color), [0, 0.035, 0.002]));
      if (trim) bag.add(mesh(new THREE.BoxGeometry(0.025, 0.018, 0.006), trim, [0, 0.0, 0.032]));
      bag.position.set(x, y, z);
      bag.rotation.y = -0.9;
      g.add(bag);
      const s = section(figure, L.clavicle[1]);
      const pts = [
        v(x + 0.05, y + 0.06, z - 0.03),
        v(-0.14, L.armpit - 0.12, surfaceZ(figure, -0.14, L.armpit - 0.12, -1, 0.02)),
        v(0.02, L.armpit, surfaceZ(figure, 0.02, L.armpit, -1, 0.02)),
        v(0.12, L.clavicle[1] + 0.02, (s.zFront + s.zBack) / 2),
        v(0.06, L.armpit - 0.03, surfaceZ(figure, 0.06, L.armpit - 0.03, 1, 0.02)),
        v(-0.08, TORSO_Y + 0.15, surfaceZ(figure, -0.08, TORSO_Y + 0.15, 1, 0.02)),
        v(x + 0.05, y + 0.06, z + 0.02),
      ];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.007, 6), mk({ k: 'leather', c: '#5a3a22' }, color)));
      break;
    }
    default: {
      const y = L.armpit - 0.02;
      const root = backPoint(figure, y, 0.015);
      for (const sx of [-1, 1]) {
        const w = wing(r.kind, m, trim, sx);
        w.position.set(0.05 * sx, root.y, root.z);
        g.add(w);
      }
      break;
    }
  }
  return g;
}

// ─── Голова ─────────────────────────────────────────────────────────────

/** Что головной убор делает с причёской: шапка прячет макушку (остальные — ничего). */
const COVER: Record<string, 'hat' | 'helm'> = { sports_cap: 'hat', beanie: 'hat', bandana: 'hat', beret: 'hat', cowboy_hat: 'hat' };

export const headCover = (id: string | undefined): 'none' | 'hat' | 'helm' => (id ? COVER[id] ?? 'none' : 'none');

/** Сетка по лицу вокруг глаз (маски, очки): x — полуширина, ys — край сверху/снизу, hole — вырез глаза. */
function faceSheet(female: boolean, halfW: number, yTop: (x: number) => number, yBot: (x: number) => number, lift: number, hole: (x: number, y: number) => boolean): THREE.BufferGeometry {
  const NX = 26;
  const NY = 9;
  const P: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= NY; j += 1) {
    for (let i = 0; i <= NX; i += 1) {
      const x = -halfW + (2 * halfW * i) / NX;
      const p = faceAt(x, yBot(x) + ((yTop(x) - yBot(x)) * j) / NY, lift, female);
      P.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const a = j * (NX + 1) + i;
      const cx = (P[a * 3]! + P[(a + 1) * 3]!) / 2;
      const cy = (P[a * 3 + 1]! + P[(a + NX + 1) * 3 + 1]!) / 2 - HEAD_Y;
      if (hole(cx, cy)) continue;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Ушки на ободке: треугольные кошачьи или длинные кроличьи. */
function ears(kind: 'cat' | 'bunny', outer: Mat, inner: Mat): THREE.Group {
  const g = new THREE.Group();
  g.add(headArc(0.02, 0.012, 0.006, outer, 0.05));
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    if (kind === 'cat') {
      e.add(mesh(new THREE.ConeGeometry(0.06, 0.11, 3), outer, [0, 0.05, 0], [1, 1, 0.35]));
      e.add(mesh(new THREE.ConeGeometry(0.038, 0.075, 3), inner, [0, 0.042, 0.012], [1, 1, 0.2]));
    } else {
      e.add(mesh(new THREE.CapsuleGeometry(0.035, 0.24, 6, 12), outer, [0, 0.16, 0], [1, 1, 0.35]));
      e.add(mesh(new THREE.CapsuleGeometry(0.02, 0.2, 6, 10), inner, [0, 0.16, 0.01], [1, 1, 0.2]));
    }
    const y = HEAD_R * HS.y * 0.86;
    e.position.set(0.12 * sx, HEAD_Y + y, -0.05);
    e.rotation.z = -0.25 * sx;
    if (kind === 'bunny') e.rotation.x = -0.15;
    g.add(e);
  }
  return g;
}

function buildHead(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const { color, shape } = ctx;
  const female = shape.figure === 'female';
  switch (id) {
    case 'headband': {
      // Махровая повязка с белыми кантами.
      g.add(headBand(0.075, 0.06, 0.012, M.cloth(color, 14, 0.98)));
      for (const y of [0.046, 0.104]) g.add(ring(headR(y) + 0.013, 0.004, M.cloth('#f2f3f5', 4), HEAD_Y + y, HS.x, HS.z));
      break;
    }
    case 'sports_cap': {
      // Бейсболка: шестиклинка с пуговкой, изогнутый козырёк и застёжка сзади.
      const cm = M.cloth(color, 8, 0.9);
      g.add(dome(HEAD_R + 0.03, Math.PI * 0.48, cm, 0.05));
      g.add(mesh(new THREE.SphereGeometry(0.02, 12, 8), cm, [0, HEAD_Y + 0.35, -0.01]));
      const brim = new THREE.Shape();
      brim.absellipse(0, 0, 0.2, 0.2, 0, Math.PI, false, 0);
      const bg = new THREE.ExtrudeGeometry(brim, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 24 });
      const bp = bg.getAttribute('position');
      // Козырёк изогнут дугой (края ниже середины) и чуть наклонён вниз.
      for (let i = 0; i < bp.count; i += 1) bp.setZ(i, bp.getZ(i) + (bp.getX(i) / 0.2) ** 2 * 0.05);
      bg.computeVertexNormals();
      const b = new THREE.Mesh(bg, M.cloth(shade(color, 0.85), 8, 0.9));
      b.rotation.x = Math.PI / 2 - 0.06;
      b.position.set(0, HEAD_Y + 0.085, headR(0.085) * HS.z - 0.07);
      g.add(b);
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.01), M.chrome(), [0, HEAD_Y + 0.08, -headR(0.08) * HS.z - 0.03]));
      break;
    }
    case 'beanie': {
      // Вязаная шапка с отворотом и помпоном.
      const knit = M.cloth(color, 4, 0.98);
      g.add(dome(HEAD_R + 0.04, Math.PI * 0.5, knit, 0.025));
      g.add(headBand(0.08, 0.075, 0.05, M.cloth(shade(color, 0.8), 3, 0.98)));
      g.add(mesh(new THREE.SphereGeometry(0.065, 16, 12), mk({ k: 'fur', c: '#f2f3f5' }, color), [0, HEAD_Y + 0.35, -0.03]));
      break;
    }
    case 'bandana': {
      const m = M.cloth(color, 8);
      g.add(dome(HEAD_R + 0.03, Math.PI * 0.4, m, 0.02));
      g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), m, [0, HEAD_Y + 0.02, -0.29]));
      g.add(limb(v(0.01, HEAD_Y, -0.3), v(0.06, HEAD_Y - 0.14, -0.31), 0.022, m), limb(v(-0.01, HEAD_Y, -0.3), v(-0.05, HEAD_Y - 0.12, -0.3), 0.02, m));
      break;
    }
    case 'beret': {
      const m = phys(color, 0.9, { sheen: 0.5, sheenColor: shade(color, 1.4) });
      const b = mesh(new THREE.SphereGeometry(HEAD_R + 0.05, 32, 16), m, [0.05, HEAD_Y + 0.18, -0.02], [HS.x * 1.15, 0.38, HS.z * 1.1]);
      b.rotation.z = -0.25;
      g.add(b, ring(headR(0.12) + 0.025, 0.018, m, HEAD_Y + 0.12, HS.x, HS.z), mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6), m, [0.06, HEAD_Y + 0.3, -0.02]));
      break;
    }
    case 'cat_ears':
      g.add(ears('cat', phys('#16161a', 0.6, { sheen: 0.6 }), mat('#ff8ad8', 0.7)));
      break;
    case 'bunny_ears':
      g.add(ears('bunny', mk({ k: 'fur', c: '#f6f2ee' }, color), mat('#ffb3cf', 0.7)));
      break;
    case 'sunglasses': {
      // Очки-«авиаторы»: тонкая оправа, тёмные стёкла по форме лица, дужки к ушам.
      const eye = eyeAnchor(female);
      const frame = M.gold();
      const lens = phys('#141a24', 0.05, { clearcoat: 1, transparent: true, opacity: 0.88, envMapIntensity: 2 });
      lens.side = THREE.DoubleSide;
      const geo = faceSheet(
        female,
        0.13,
        (x) => eye.c.y + 0.032 - 0.01 * (Math.abs(x) / 0.13) ** 2,
        (x) => eye.c.y - 0.042 + 0.022 * Math.max(0, 1 - Math.abs(Math.abs(x) - eye.c.x) / 0.05),
        0.03,
        (x) => Math.abs(x) < 0.012,
      );
      g.add(new THREE.Mesh(geo, lens));
      const bridge = faceAt(0, eye.c.y + 0.02, 0.034, female);
      g.add(limb(faceAt(-0.016, eye.c.y + 0.022, 0.033, female), faceAt(0.016, eye.c.y + 0.022, 0.033, female), 0.003, frame, 6), mesh(new THREE.SphereGeometry(0.004, 6, 4), frame, [bridge.x, bridge.y, bridge.z]));
      for (const sx of [-1, 1]) {
        const a = faceAt(0.128 * sx, eye.c.y + 0.02, 0.03, female);
        const b = v(0.19 * sx * (female ? 0.96 : 1), HEAD_Y + eye.c.y + 0.01, -0.02);
        g.add(limb(a, b, 0.0035, frame, 6));
        const top: THREE.Vector3[] = [];
        for (let i = 0; i <= 8; i += 1) {
          const x = (0.13 * (i - 4)) / 4;
          top.push(faceAt(x, eye.c.y + 0.033 - 0.01 * (Math.abs(x) / 0.13) ** 2, 0.032, female));
        }
        if (sx > 0) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 24, 0.003, 6), frame));
      }
      break;
    }
    case 'headphones': {
      // Накладные наушники: мягкое оголовье через макушку и чашки на ушах.
      const shell = plasticHead(color);
      g.add(headArc(0.02, 0.025, 0.012, shell, 0.0));
      for (const sx of [-1, 1]) {
        const x = (headR(0.0) * HS.x + 0.02) * sx;
        const cup = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 28), shell, [x, HEAD_Y + 0.0, -0.01]);
        cup.rotation.z = Math.PI / 2;
        g.add(cup, mesh(new THREE.TorusGeometry(0.062, 0.016, 8, 24), mat('#1d1f24', 0.9), [x - 0.022 * sx, HEAD_Y, -0.01]).rotateY(Math.PI / 2));
        g.add(mesh(new THREE.CircleGeometry(0.04, 24), M.chrome(), [x + 0.021 * sx, HEAD_Y, -0.01]).rotateY((sx * Math.PI) / 2));
      }
      break;
    }
    case 'cowboy_hat': {
      // Ковбойская шляпа: тулья с заломом, поля загнуты по бокам.
      const m = M.leather('#8a5a3a', 2);
      m.side = THREE.DoubleSide;
      const brim = [
        [0.17, 0.0],
        [0.3, -0.005],
        [0.42, -0.015],
        [0.46, -0.025],
        [0.45, -0.035],
        [0.4, -0.025],
        [0.28, -0.012],
        [0.17, 0.012],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const bg = new THREE.LatheGeometry(brim, 64);
      const bp = bg.getAttribute('position');
      for (let i = 0; i < bp.count; i += 1) {
        const x = bp.getX(i);
        bp.setY(i, bp.getY(i) + Math.max(0, Math.abs(x) - 0.2) ** 2 * 1.4);
      }
      bg.computeVertexNormals();
      g.add(mesh(bg, m, [0, HEAD_Y + 0.14, -0.01], [1, 1, 0.92]));
      const crown = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.2, 32), m, [0, HEAD_Y + 0.24, -0.01], [1, 1, 0.85]);
      g.add(crown, mesh(new THREE.SphereGeometry(0.17, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, [0, HEAD_Y + 0.335, -0.01], [1, 0.25, 0.85]));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.3), M.leather('#6b4428', 2), [0, HEAD_Y + 0.37, -0.01]));
      g.add(ring(0.218, 0.014, M.leather('#2a1f1a'), HEAD_Y + 0.16, 1, 0.86));
      break;
    }
    case 'devil_horns': {
      const m = phys('#c8102e', 0.3, { clearcoat: 0.8 });
      g.add(headArc(0.02, 0.012, 0.005, m, 0.04));
      for (const sx of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([v(0.09 * sx, HEAD_Y + 0.24, 0.06), v(0.14 * sx, HEAD_Y + 0.33, 0.05), v(0.13 * sx, HEAD_Y + 0.42, -0.01), v(0.08 * sx, HEAD_Y + 0.45, -0.05)]);
        g.add(new THREE.Mesh(taperTube(c, 0.035, 0.002, 20, 10), m));
      }
      break;
    }
    case 'angel_halo': {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 10, 48), M.glow('#ffe27a', 2));
      h.position.set(0, HEAD_Y + 0.42, -0.04);
      h.rotation.x = Math.PI / 2 - 0.5;
      g.add(h);
      break;
    }
    case 'masquerade_mask': {
      // Маска по форме лица с вырезами под глаза и звездой сбоку.
      const eye = eyeAnchor(female);
      const geo = faceSheet(
        female,
        0.125,
        (x) => eye.c.y + 0.05 - 0.02 * (Math.abs(x) / 0.125) ** 2 + (0.015 * Math.max(0, Math.abs(x) - 0.08)) / 0.045,
        (x) => eye.c.y - 0.04 + 0.025 * (1 - Math.abs(x) / 0.125),
        0.008,
        (x, y) => ((Math.abs(x) - eye.c.x) / 0.03) ** 2 + ((y - eye.c.y) / 0.02) ** 2 < 1,
      );
      g.add(new THREE.Mesh(geo, phys(color, 0.25, { clearcoat: 0.7, side: THREE.DoubleSide })));
      const s1 = star(0.03, 0.013, 0.006, M.gold());
      s1.position.set(0.11, HEAD_Y + eye.c.y + 0.05, 0.17);
      g.add(s1);
      break;
    }
    case 'lace_veil': {
      const m = mk({ k: 'lace', c: '#f6f2ee' }, color);
      const prof = [
        [0.0, 0.33],
        [0.2, 0.28],
        [0.29, 0.1],
        [0.33, -0.15],
        [0.37, -0.4],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(mesh(new THREE.LatheGeometry(prof, 40, Math.PI * 0.6, Math.PI * 0.8), m, [0, HEAD_Y, -0.03], [HS.x * 1.25, 1, HS.z * 1.15]), ring(headR(0.2) + 0.015, 0.012, M.silver(), HEAD_Y + 0.2, HS.x, HS.z));
      break;
    }
    case 'silver_tiara': {
      // Диадема со стразами: ободок, зубцы и камни.
      const silver = M.silver();
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = -0.6 * Math.PI + (i / 16) * 1.2 * Math.PI;
        const y = 0.13 + 0.03 * Math.cos(a);
        const r = headR(y) + 0.02;
        pts.push(v(Math.sin(a) * r * HS.x, HEAD_Y + y, Math.cos(a) * r * HS.z));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.011, 8), silver));
      const spike = (a: number, h: number, w: number): void => {
        const o = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), M.silver());
        o.scale.z = 0.4;
        onHead(o, 0.16 + 0.03 * Math.cos(a) + h / 2, a, 0.01 - h * 0.12);
        o.rotation.x = -0.25;
        g.add(o);
      };
      spike(0, 0.13, 0.036);
      for (const a of [-0.5, 0.5]) spike(a, 0.08, 0.026);
      for (const a of [-0.95, 0.95]) spike(a, 0.05, 0.02);
      const gem = M.gem('#e8f4ff', 0.5);
      g.add(onHead(mesh(new THREE.OctahedronGeometry(0.026), M.gem('#ff8ad8', 0.5), undefined, [0.9, 1.25, 0.6]), 0.19, 0, 0.035));
      for (let i = -6; i <= 6; i += 1) if (i !== 0) g.add(onHead(mesh(new THREE.OctahedronGeometry(0.008), gem), 0.13 + 0.03 * Math.cos(i * 0.16), i * 0.16, 0.032));
      break;
    }
  }
  return g;
}

const plasticHead = (c: string): Mat => phys(c, 0.35, { clearcoat: 0.6, clearcoatRoughness: 0.2 });

export const headModel = (id: string, ctx: ItemCtx): THREE.Group => buildHead(id, ctx);

// ─── Сборка одежды из всех слотов ───────────────────────────────────────

/** Одежда героя: верх (слот «верх»), низ (слот «низ» или одежда верха), их слои и детали. */
export function composeOutfit(equipped: Partial<Record<Slot, string>>, ctx: ItemCtx): Outfit {
  const body = equipped.body ? buildWear(equipped.body, ctx) : null;
  const legs = equipped.legs ? buildWear(equipped.legs, ctx) : null;
  const group = new THREE.Group();
  if (body) group.add(body.group);
  if (legs) group.add(legs.group);
  const bodyLayers = body?.plan.layers ?? [];
  const legsLayers = legs?.plan.layers ?? [];
  const pad = (o: Outfit | null, n: number): Mat[] => Array.from({ length: n }, (_, i) => o?.layers[i] ?? o?.layers[0] ?? M.cloth('#8a8f98', 8));
  const plan: OutfitPlan = { layers: [...bodyLayers, ...legsLayers] };
  if (body && body.plan.top !== undefined) plan.top = body.plan.top;
  const bottom = legs ? legs.plan.bottom : body?.plan.bottom;
  if (bottom) plan.bottom = bottom;
  const out: Outfit = { group, plan, layers: [...pad(body, bodyLayers.length), ...pad(legs, legsLayers.length)] };
  if (body?.top) out.top = body.top;
  const bm = legs ? legs.bottom : body?.bottom;
  if (bm) out.bottom = bm;
  return out;
}

/** Все слои одежды, которые понадобятся герою (для заблаговременной подготовки сеток). */
export function garmentsFor(figure: Figure, equipped: Partial<Record<Slot, string>>): GarmentId[] {
  const body = wearPlan(equipped.body, figure);
  const legs = wearPlan(equipped.legs, figure);
  const def = figure === 'female' ? { top: 'tee_fitted' as const, bottom: 'leggings' as const } : { top: 'tee' as const, bottom: 'pants' as const };
  const top = body.top === undefined ? def.top : body.top;
  const list: GarmentId[] = [];
  if (top) list.push(top);
  list.push((equipped.legs ? legs.bottom : body.bottom) ?? def.bottom);
  list.push(...(body.layers ?? []), ...(legs.layers ?? []));
  list.push(...SHOE_LAYERS[shoeRecipe(equipped).shoe]);
  return [...new Set(list)];
}

/** Слои одежды самого предмета (для иконки магазина). */
export function itemGarments(id: string, slot: Slot, figure: Figure): GarmentId[] {
  if (slot === 'feet') return SHOE_LAYERS[(SHOES[id] ?? { shoe: 'none' }).shoe];
  if (slot !== 'body' && slot !== 'legs') return [];
  const plan = wearPlan(id, figure);
  return [plan.top, plan.bottom, ...(plan.layers ?? [])].filter((g): g is GarmentId => Boolean(g));
}

/**
 * Фигура для иконки предмета: женский топ без мужского варианта (у мужской фигуры торс открыт)
 * показываем на женской фигуре, чтобы иконка не была пустой.
 */
export function iconFigure(id: string, slot: Slot, figure: Figure): Figure {
  if (figure === 'male' && slot === 'body' && WEAR[id] && itemGarments(id, slot, 'male').length === 0 && !(WEAR[id].deco ?? []).length) return 'female';
  return figure;
}
