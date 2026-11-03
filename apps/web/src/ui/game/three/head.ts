import * as THREE from 'three';
import { FACE_PARTS, sliderValue, type Appearance, type FacePart, type Figure } from '../../../game/state';
import { HEAD_R, HEAD_SCALE, HEAD_Y } from './body';
import { M, mat, mesh, phys, shade, taperTube, tex, v } from './kit';
import { blend, ellipsoid, mergeGeometries, roundCone, smin } from './sdf';
import { strands } from './strands';

/**
 * Голова с вылепленным лицом: череп деформируется (надбровье, глазницы, скулы,
 * сужение челюсти, подбородок), поверх — глаза с радужкой и веками, нос с крыльями
 * и ноздрями, губы с «луком Купидона», уши. Координаты — собственные координаты головы:
 * центр в (0, HEAD_Y, 0), лицо смотрит на +Z.
 */

export interface Lid {
  obj: THREE.Object3D;
  open: number;
  closed: number;
}

export interface HeadParts {
  group: THREE.Group;
  lids: Lid[];
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Анатомическая форма головы — поле расстояний из костей и мягких тканей
 * (координаты относительно центра головы, лицо смотрит на +Z):
 * свод черепа, лобная, теменные и затылочная кости, надбровные дуги, скулы со скуловыми
 * дугами, верхняя челюсть, нижняя челюсть с углом и ветвью, подбородок, щёки и губной отдел.
 * У мужской фигуры — массивнее надбровье, квадратнее челюсть и выраженнее подбородок,
 * у женской — округлый высокий лоб, мягкая узкая челюсть и острый подбородок.
 */
// ─── Черты лица из ползунков ──────────────────────────────────────────────

/** Текущие черты лица (−1 … 1). Задаются перед сборкой головы и причёски (сборка синхронная). */
let F: Record<FacePart, number> = Object.fromEntries(FACE_PARTS.map((k) => [k, 0])) as Record<FacePart, number>;
let FKEY = '0';

export function setFace(face: Appearance['face']): void {
  F = Object.fromEntries(FACE_PARTS.map((k) => [k, Math.round(sliderValue(face?.[k]) * 100) / 100])) as Record<FacePart, number>;
  FKEY = FACE_PARTS.some((k) => F[k] !== 0) ? FACE_PARTS.map((k) => F[k]).join(',') : '0';
}

/** Ключ черт лица для кэшей; '0' — лицо по умолчанию. */
export const faceKey = (): string => FKEY;
export const faceNeutral = (): boolean => FKEY === '0';

function headField(female: boolean): (x: number, y: number, z: number) => number {
  const { faceWidth: fw, cheekbones: cb, jaw: jw, chin: ch } = F;
  const f = female;
  const cranium = blend(
    [
      ellipsoid([0, 0.065, -0.03], [f ? 0.168 : 0.176, f ? 0.214 : 0.222, f ? 0.226 : 0.236]), // свод
      ellipsoid([0, f ? 0.105 : 0.1, 0.07], [f ? 0.146 : 0.152, f ? 0.155 : 0.145, 0.13]), // лоб
      ellipsoid([0.06, 0.115, -0.075], [0.128, 0.13, 0.155]), // теменные бугры
      ellipsoid([0, -0.005, -0.17], [0.118, 0.11, 0.1]), // затылок
      ellipsoid([0.12, 0.02, -0.03], [0.06, 0.07, 0.1]), // височная область
    ],
    0.06,
  );
  const face = blend(
    [
      roundCone([0.03, 0.068, 0.18], [0.092, 0.074, 0.158], f ? 0.02 : 0.028, f ? 0.016 : 0.024), // надбровная дуга
      ellipsoid([0, 0.045, 0.165], [0.045, 0.05, 0.05]), // переносица
      ellipsoid([0, -0.06, 0.098], [f ? 0.1 : 0.11, 0.092, 0.118]), // верхняя челюсть
      ellipsoid([0.1 + 0.012 * cb, -0.012, 0.098 + 0.006 * cb], [0.058 * (1 + 0.2 * cb), 0.038 * (1 + 0.2 * cb), 0.062 * (1 + 0.15 * cb)]), // скула
      roundCone([0.118 + 0.01 * cb, -0.006, 0.07], [0.152 + 0.008 * cb, 0.004, -0.03], 0.022, 0.019), // скуловая дуга
      ellipsoid([0.07, -0.085, 0.095], f ? [0.078, 0.085, 0.092] : [0.072, 0.08, 0.085]), // щека
      ellipsoid([0.09 + 0.012 * jw, -0.1, 0.02], [0.05 * (1 + 0.15 * jw), 0.08, 0.085]), // жевательная мышца
      ellipsoid([0.06, -0.06, 0.06], [0.08, 0.07, 0.08]), // мягкие ткани щеки
      ellipsoid([0, f ? -0.143 : -0.148, 0.122], [0.068, 0.062, f ? 0.088 : 0.092]), // губной отдел
      ellipsoid([0, (f ? -0.218 : -0.228) - 0.008 * ch, 0.148 + 0.012 * ch], [(f ? 0.032 : 0.05) * (1 + 0.25 * ch), (f ? 0.037 : 0.042) * (1 + 0.2 * ch), (f ? 0.044 : 0.05) * (1 + 0.2 * ch)]), // подбородок
      roundCone([f ? 0.024 : 0.028, f ? -0.222 : -0.232, 0.142], [(f ? 0.087 : 0.102) + 0.016 * jw, f ? -0.155 : -0.168, 0.0], f ? 0.03 : 0.036, (f ? 0.027 : 0.034) + 0.004 * jw), // тело челюсти
      roundCone([(f ? 0.087 : 0.102) + 0.016 * jw, f ? -0.155 : -0.168, 0.0], [0.115, -0.04, -0.035], (f ? 0.027 : 0.034) + 0.004 * jw, 0.03), // угол и ветвь
      ellipsoid([0, -0.195, 0.045], [0.085, 0.055, 0.1]), // под челюстью
      ellipsoid([0, -0.15, -0.06], [0.1, 0.13, 0.11]), // переход в шею
    ],
    // Женское лицо мягче: ткани сливаются плавнее, без резких переходов.
    f ? 0.062 : 0.05,
  );
  // Голова чуть выдвинута вперёд относительно шеи: центр свода — над осью шеи.
  return (x, y, z) => {
    // Гладкий модуль: без «шва» посередине лица.
    const ax = Math.sqrt(x * x + 0.00004);
    const zz = z - 0.03;
    return smin(cranium(ax, y, zz), face(ax / (1 + 0.07 * fw), y, zz), 0.05);
  };
}

/** Радиус поверхности по направлениям (таблица θ×φ, по лучам от центра к поверхности). */
const NT = 120;
const NP = 240;
const radiusTables = new Map<string, Float32Array>();

function radiusTable(female: boolean): Float32Array {
  const key = `${female}|${FKEY}`;
  let tab = radiusTables.get(key);
  if (tab) return tab;
  const field = headField(female);
  tab = new Float32Array((NT + 1) * (NP + 1));
  for (let i = 0; i <= NT; i += 1) {
    const th = (Math.PI * i) / NT;
    const st = Math.sin(th);
    const ct = Math.cos(th);
    for (let j = 0; j <= NP; j += 1) {
      const ph = -Math.PI + (2 * Math.PI * j) / NP;
      const dx = st * Math.sin(ph);
      const dz = st * Math.cos(ph);
      // Идём по лучу снаружи внутрь: первая встреченная поверхность — внешняя.
      let t = 0.42;
      for (let k = 0; k < 48; k += 1) {
        const d = field(dx * t, ct * t, dz * t);
        if (Math.abs(d) < 1e-4) break;
        t -= d * 0.85;
      }
      tab[i * (NP + 1) + j] = t;
    }
  }
  radiusTables.set(key, tab);
  // Держим только несколько последних вариантов лица (ползунки меняются часто).
  while (radiusTables.size > 6) radiusTables.delete(radiusTables.keys().next().value!);
  return tab;
}

/** Расстояние от центра до поверхности черепа в направлении d (без деталей лица). */
function baseRadius(d: THREE.Vector3, female: boolean): number {
  const tab = radiusTable(female);
  const u = (Math.acos(Math.max(-1, Math.min(1, d.y))) / Math.PI) * NT;
  const w = ((Math.atan2(d.x, d.z) + Math.PI) / (2 * Math.PI)) * NP;
  const i0 = Math.min(NT - 1, Math.floor(u));
  const j0 = Math.min(NP - 1, Math.floor(w));
  const fu = u - i0;
  const fw = w - j0;
  const a = tab[i0 * (NP + 1) + j0]!;
  const b = tab[i0 * (NP + 1) + j0 + 1]!;
  const c = tab[(i0 + 1) * (NP + 1) + j0]!;
  const e = tab[(i0 + 1) * (NP + 1) + j0 + 1]!;
  return (a * (1 - fw) + b * fw) * (1 - fu) + (c * (1 - fw) + e * fw) * fu;
}

const g2 = (x: number, y: number, cx: number, cy: number, sx: number, sy: number): number => Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);

/** Линия смыкания губ (y) — на трети расстояния от основания носа до подбородка. */
const mouthY = (female: boolean): number => (female ? -0.144 : -0.15);
const lipW = (female: boolean): number => (female ? 0.037 : 0.039) * (1 + 0.06 * F.lips);

/** Высота верхней губы над линией рта: «лук Купидона» с ложбинкой посередине. */
function upperLip(ax: number, female: boolean): number {
  const q = Math.max(0, 1 - (ax / lipW(female)) ** 2);
  return (female ? 0.0105 : 0.0085) * (1 + 0.3 * F.lips) * q ** 0.55 + 0.0022 * Math.exp(-(((ax - 0.0085) / 0.005) ** 2)) * q - 0.0016 * Math.exp(-((ax / 0.0035) ** 2));
}

/** Высота нижней губы под линией рта (она полнее и мягче очерчена). */
function lowerLip(ax: number, female: boolean): number {
  const q = Math.max(0, 1 - (ax / (lipW(female) * 0.93)) ** 2);
  return (female ? 0.0155 : 0.012) * (1 + 0.3 * F.lips) * q ** 0.75;
}

/** Объём губ, линия смыкания и уголки рта. */
function lips(x: number, y: number, female: boolean): number {
  const ax = Math.abs(x);
  const my = mouthY(female);
  const W = lipW(female);
  const qx = Math.max(0, 1 - (ax / W) ** 2);
  if (qx <= 0 && Math.abs(y - my) > 0.02) return 0;
  const full = 1 + 0.4 * F.lips;
  let b = 0;
  const hU = upperLip(ax, female);
  if (hU > 0.0005) b += (female ? 0.0062 : 0.0042) * full * qx ** 0.5 * Math.exp(-((((y - my) / hU - 0.45) / 0.42) ** 2));
  const hL = lowerLip(ax, female);
  if (hL > 0.0005) b += (female ? 0.0085 : 0.0058) * full * qx ** 0.6 * Math.exp(-((((my - y) / hL - 0.5) / 0.45) ** 2));
  b -= 0.0022 * Math.max(0, 1 - (ax / (W + 0.004)) ** 2) * Math.exp(-(((y - my) / 0.0016) ** 2));
  b -= 0.0014 * g2(ax, y, W + 0.003, my + 0.001, 0.0035, 0.004);
  return b;
}

/**
 * Цвет губ: тонкий слой поверх кожи строго по контуру губ, края мягкие,
 * по линии смыкания — темнее. Форму губ задаёт сама поверхность лица.
 */
const lipCache = new Map<boolean, THREE.BufferGeometry>();

function lipPatch(female: boolean, m: THREE.MeshStandardMaterial): THREE.Mesh {
  m.vertexColors = true;
  m.transparent = true;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -4;
  const hit = faceNeutral() ? lipCache.get(female) : undefined;
  if (hit) return new THREE.Mesh(hit, m);
  const geo = lipGeometry(female);
  if (faceNeutral()) {
    geo.userData.shared = true;
    lipCache.set(female, geo);
  }
  return new THREE.Mesh(geo, m);
}

function lipGeometry(female: boolean): THREE.BufferGeometry {
  const my = mouthY(female);
  const W = lipW(female) + 0.004;
  const NX = 44;
  const NY = 28;
  const y0 = my - 0.022;
  const y1 = my + 0.018;
  const pos: number[] = [];
  const col: number[] = [];
  const alpha: number[] = [];
  const cl = (t: number): number => Math.min(1, Math.max(0, t));
  const e = 0.0009;
  for (let j = 0; j <= NY; j += 1) {
    const y = y0 + ((y1 - y0) * j) / NY;
    for (let i = 0; i <= NX; i += 1) {
      const x = -W + (2 * W * i) / NX;
      const ax = Math.abs(x);
      const { p, n } = facePoint(x, y, female);
      p.addScaledVector(n, 0.0005).add(v(0, HEAD_Y, 0));
      pos.push(p.x, p.y, p.z);
      const side = cl((lipW(female) - ax) / 0.002);
      const hU = upperLip(ax, female);
      const hL = lowerLip(ax, female);
      const au = cl((y - my) / e + 0.5) * cl((hU - (y - my)) / e + 0.5) * side;
      const al = cl((my - y) / e + 0.5) * cl((hL - (my - y)) / e + 0.5) * side;
      const a = Math.max(au, al);
      const dark = 1 - 0.5 * Math.exp(-(((y - my) / 0.0017) ** 2));
      col.push(dark, dark, dark, a);
      alpha.push(a);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      if (Math.max(alpha[a]!, alpha[b]!, alpha[c]!, alpha[d]!) <= 0.01) continue;
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Мелкие детали лица поверх костей (в координатах лица): глазницы, нос, ложбинка над губой. */
/** Расстояние от точки (x, y) до отрезка a–b на плоскости лица. */
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

/**
 * Нос по анатомии: спинка от переносицы, кончик из двух долек, колумелла, крылья
 * со складкой вокруг. Части сливаются мягким максимумом (без «бугров» в местах стыка).
 */
function nose(x: number, y: number, female: boolean): number {
  const n = 1 + 0.4 * F.nose;
  const wide = 1 + 0.2 * F.nose;
  const ax = Math.abs(x);
  // Спинка: невысокая у переносицы, к кончику выше и чуть шире.
  const along = smooth(0.045, -0.05, y);
  const ridgeH = (0.004 + (female ? 0.015 : 0.019) * along) * n;
  const ridgeW = ((female ? 0.0085 : 0.0105) + 0.004 * along) * wide;
  const ridge = ridgeH * Math.exp(-((ax / ridgeW) ** 2)) * smooth(0.055, 0.035, y) * smooth(-0.088, -0.06, y);
  // Кончик: две дольки, снизу закругляется быстрее, чем сверху.
  const ty = female ? -0.068 : -0.071;
  const sy = y < ty ? 0.011 : 0.017;
  const lobule = (female ? 0.033 : 0.04) * n * Math.exp(-(((ax - 0.004) / (0.0125 * wide)) ** 2) - ((y - ty) / sy) ** 2);
  // Колумелла — перегородка под кончиком.
  const col = 0.014 * n * Math.exp(-((ax / 0.0055) ** 2) - ((y + 0.083) / 0.007) ** 2);
  // Крылья носа.
  const wx = (female ? 0.0165 : 0.02) * wide;
  const ala = (female ? 0.0072 : 0.0092) * n * Math.exp(-(((ax - wx) / 0.0092) ** 2) - ((y + 0.079) / 0.0082) ** 2);
  const p = 4;
  return (ridge ** p + lobule ** p + col ** p + ala ** p) ** (1 / p);
}

/** Мелкие детали лица поверх костей (в координатах лица): глазницы, нос, щёки, складки. */
function faceDetail(x: number, y: number, z: number, female: boolean): number {
  if (z < 0.08) return 0;
  const k = smooth(0.08, 0.15, z);
  const ax = Math.abs(x);
  let b = nose(x, y, female) + lips(x, y, female);
  // Складка вокруг крыла носа отделяет его от щеки.
  const wx = (female ? 0.0165 : 0.02) * (1 + 0.2 * F.nose);
  const r = Math.hypot(ax - wx, (y + 0.08) * 0.95);
  b -= 0.0015 * Math.exp(-(((r - 0.011) / 0.003) ** 2)) * smooth(wx - 0.006, wx + 0.004, ax);
  b -= 0.003 * Math.exp(-((x / 0.022) ** 2) - ((y - 0.05) / 0.014) ** 2); // переносица чуть глубже
  b -= 0.013 * g2(ax, y, 0.084, 0.022, 0.034, 0.024); // глазницы
  b -= 0.002 * g2(ax, y, 0.06, -0.006, 0.026, 0.008); // носослёзная борозда
  // Скуловая «подушечка» — объём щеки под глазом.
  b += (female ? 0.0075 : 0.005) * g2(ax, y, 0.058, -0.038, 0.03, 0.026);
  // Носогубная складка — от крыла носа к уголку рта, у женской фигуры мягче.
  const fold = segDist(ax, y, 0.028, -0.084, 0.048, -0.146);
  b -= (female ? 0.0016 : 0.0026) * Math.exp(-((fold / 0.0055) ** 2));
  if (!female) b -= 0.0025 * g2(ax, y, 0.085, -0.075, 0.03, 0.025); // впадина под скулой
  b -= 0.003 * g2(ax, y, 0, -0.116, 0.008, 0.011); // ложбинка над губой
  b += 0.0012 * g2(ax, y, 0.0065, -0.116, 0.003, 0.011); // её края (фильтрум)
  return b * k;
}

/** Точка поверхности головы для направления d (единичный вектор). */
function surface(d: THREE.Vector3, female: boolean, out = new THREE.Vector3()): THREE.Vector3 {
  const r = baseRadius(d, female);
  const r2 = r + faceDetail(d.x * r, d.y * r, d.z * r, female);
  return out.set(d.x * r2, d.y * r2, d.z * r2);
}

/** Точка на поверхности черепа в направлении d с отступом off (координаты относительно центра головы). */
export function skullPoint(d: THREE.Vector3, female: boolean, off = 0): THREE.Vector3 {
  const n = d.clone().normalize();
  return surface(n, female).addScaledVector(n, off);
}

/**
 * Подгоняет сферический сегмент (единичного радиуса) под форму черепа с отступом off —
 * так волосы и шапочки облегают голову, а не висят шаром.
 */
export function skullShell(geo: THREE.BufferGeometry, off: number, female: boolean): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    d.fromBufferAttribute(pos, i).normalize();
    surface(d, female, p).addScaledVector(d, off);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Линия роста волос: доля π от макушки в зависимости от направления (0 — лоб, 1 — затылок). */
export type Hairline = Array<[number, number]>;
export const HAIRLINE: Record<'short' | 'long' | 'pony', Hairline> = {
  short: [[0, 0.27], [0.16, 0.31], [0.3, 0.44], [0.5, 0.47], [0.75, 0.56], [1, 0.6]],
  long: [[0, 0.25], [0.16, 0.3], [0.3, 0.42], [1, 0.45]],
  pony: [[0, 0.26], [0.16, 0.31], [0.3, 0.43], [0.5, 0.47], [0.75, 0.55], [1, 0.58]],
};

export function lineAt(line: Hairline, t: number): number {
  for (let i = 1; i < line.length; i += 1) {
    const [t0, v0] = line[i - 1]!;
    const [t1, v1] = line[i]!;
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return (v0 + (v1 - v0) * k * k * (3 - 2 * k)) * Math.PI;
    }
  }
  return line[line.length - 1]![1] * Math.PI;
}

/**
 * Волосы по форме черепа с естественной линией роста: от макушки до линии hairline
 * (или полоса от угла from до линии — то, что видно из-под шапки).
 */
/** taper — насколько волосы тоньше у линии роста, чем на макушке (0 — одинаковой толщины). */
export function hairCap(off: number, line: Hairline, female: boolean, from = 0, taper = 0): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 72, 24, 0, Math.PI * 2, 0, 1);
  const pos = geo.getAttribute('position');
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t0 = Math.acos(Math.max(-1, Math.min(1, y)));
    const phi = Math.atan2(x, z);
    const end = Math.max(from + 0.001, lineAt(line, Math.abs(phi) / Math.PI));
    const th = from + t0 * (end - from);
    d.set(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));
    surface(d, female, p).addScaledVector(d, off * (1 - taper * t0 * t0));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Точка на лице по координатам (x, y) относительно центра головы и нормаль к поверхности. */
function facePoint(x: number, y: number, female: boolean): { p: THREE.Vector3; n: THREE.Vector3 } {
  const sx = HEAD_R * HEAD_SCALE.x;
  const sy = HEAD_R * HEAD_SCALE.y;
  const d = v(x / sx, y / sy, 0);
  d.z = Math.sqrt(Math.max(0.05, 1 - d.x * d.x - d.y * d.y));
  d.normalize();
  const p = new THREE.Vector3();
  for (let i = 0; i < 6; i += 1) {
    surface(d, female, p);
    d.x += (x - p.x) / sx;
    d.y += (y - p.y) / sy;
    d.z = Math.sqrt(Math.max(0.05, 1 - d.x * d.x - d.y * d.y));
    d.normalize();
  }
  surface(d, female, p);
  const e = 0.01;
  const p1 = surface(v(d.x + e, d.y, d.z).normalize(), female);
  const p2 = surface(v(d.x, d.y + e, d.z).normalize(), female);
  const n = new THREE.Vector3().subVectors(p1, p).cross(new THREE.Vector3().subVectors(p2, p)).normalize();
  if (n.dot(d) < 0) n.negate();
  return { p, n };
}

/** Точка на лице в координатах головы (с HEAD_Y) с отступом вдоль нормали. */
function at(x: number, y: number, lift: number, female: boolean): THREE.Vector3 {
  const { p, n } = facePoint(x, y, female);
  return p.addScaledVector(n, lift).add(v(0, HEAD_Y, 0));
}

const skullCache = new Map<string, THREE.BufferGeometry>();

/** Череп с лицом: одна сетка на фигуру, переиспользуется всеми героями (не освобождается). */
function skullGeometry(female: boolean, blush: number): THREE.BufferGeometry {
  // Изменённое ползунками лицо строится для каждого героя отдельно (и освобождается вместе с ним).
  if (!faceNeutral()) return buildSkull(female, blush);
  const key = `${female}|${blush}`;
  let g = skullCache.get(key);
  if (!g) {
    g = buildSkull(female, blush);
    g.userData.shared = true;
    skullCache.set(key, g);
  }
  return g;
}

function buildSkull(female: boolean, blush: number): THREE.BufferGeometry {
  const W = 200;
  const H = 150;
  const geo = new THREE.SphereGeometry(1, W, H);
  const pos = geo.getAttribute('position');
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const colors: number[] = [];
  // Вершины сгущены к лицу (в ~3 раза плотнее спереди), реже — на затылке:
  // нос, губы и складки получают подробную сетку без лишних вершин сзади.
  const FRONT_U = 0.25;
  const FACE_V = 0.56;
  for (let i = 0; i < pos.count; i += 1) {
    const ix = i % (W + 1);
    const iy = Math.floor(i / (W + 1));
    let su = ix / W - FRONT_U;
    su -= Math.round(su);
    const u = FRONT_U + su - (0.7 / (2 * Math.PI)) * Math.sin(2 * Math.PI * su);
    const vv = iy / H;
    const v2 = vv - (0.6 / (2 * Math.PI)) * Math.sin(2 * Math.PI * (vv - FACE_V)) * Math.sin(Math.PI * vv);
    const ph = u * Math.PI * 2;
    const th = v2 * Math.PI;
    d.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)).normalize();
    surface(d, female, p);
    pos.setXYZ(i, p.x, p.y, p.z);
    // Лёгкий румянец на щеках и тень в глазницах — цветом вершин.
    const front = smooth(0.06, 0.14, p.z);
    const cheek = Math.max(g2(p.x, p.y, 0.075, -0.045, 0.04, 0.032), g2(p.x, p.y, -0.075, -0.045, 0.04, 0.032)) * blush * front;
    const socket = Math.max(g2(p.x, p.y, 0.084, 0.03, 0.04, 0.03), g2(p.x, p.y, -0.084, 0.03, 0.04, 0.03)) * 0.12 * front;
    colors.push(1 - socket, 1 - cheek * 0.16 - socket, 1 - cheek * 0.14 - socket);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Шов развёртки сферы: усредняем нормали совпадающих вершин, чтобы не было «складки».
  const nor = geo.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let iy = 0; iy <= H; iy += 1) {
    const a = iy * (W + 1);
    const b = a + W;
    n.fromBufferAttribute(nor, a).add(new THREE.Vector3().fromBufferAttribute(nor, b)).normalize();
    nor.setXYZ(a, n.x, n.y, n.z);
    nor.setXYZ(b, n.x, n.y, n.z);
  }
  return geo;
}

/**
 * Ресницы вдоль края верхнего века: тонкие изогнутые волоски, к внешнему уголку длиннее.
 * Строятся в координатах века (край — полуокружность радиуса r в плоскости XZ, спереди z > 0).
 */
function lashes(r: number, female: boolean, sx: number): THREE.BufferGeometry {
  const n = female ? 22 : 16;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k += 1) {
    const a = Math.PI * (0.1 + (0.8 * k) / (n - 1));
    const out = v(Math.cos(a), 0, Math.sin(a));
    // К внешнему уголку (x·sx > 0) ресницы длиннее и сильнее загнуты.
    const outer = Math.max(0, Math.cos(a) * sx);
    const len = (female ? 0.017 : 0.009) * (0.75 + 0.7 * outer) * (0.9 + 0.2 * Math.sin(k * 7.3));
    const root = out.clone().multiplyScalar(r * 0.995);
    const mid = root.clone().addScaledVector(out, len * 0.55).add(v(0, len * 0.18, 0));
    const tip = root.clone().addScaledVector(out, len * 0.8).add(v(0, len * (0.55 + outer * 0.2), 0));
    parts.push(taperTube(new THREE.CatmullRomCurve3([root, mid, tip]), female ? 0.0013 : 0.0011, 0.0003, 5, 4));
  }
  return mergeGeometries(parts);
}

function eye(female: boolean, iris: THREE.ColorRepresentation, skin: THREE.Material, sx: number, lids: Lid[], lowerSkin?: THREE.Material): THREE.Group {
  const er = (female ? 0.0395 : 0.036) * (1 + 0.12 * F.eyes);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(er, 32, 24), mat('#f2ede6', 0.18)));
  const irisGeo = new THREE.SphereGeometry(er * 1.004, 40, 12, 0, Math.PI * 2, 0, 0.56);
  irisGeo.rotateX(Math.PI / 2);
  const irisMat = mat(iris, 0.12, 0, { envMapIntensity: 1.2 });
  const t = tex('iris', 1, 1, true);
  if (t) irisMat.map = t;
  else irisMat.color = shade(iris, 0.8);
  g.add(new THREE.Mesh(irisGeo, irisMat));
  if (!t) g.add(mesh(new THREE.SphereGeometry(er * 0.3, 12, 8), mat('#0c0907', 0.2), [0, 0, er * 0.93], [1, 1, 0.3]));
  g.add(mesh(new THREE.SphereGeometry(er * 0.11, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), [er * 0.3, er * 0.32, er * 0.94]));

  // Верхнее веко: полусфера чуть больше глаза; поворот вокруг X открывает и закрывает глаз.
  const upper = new THREE.Group();
  upper.add(new THREE.Mesh(new THREE.SphereGeometry(er * 1.14, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin));
  const lash = mat('#160f0d', 0.55);
  // Линия роста ресниц (у женской фигуры — как тонкая подводка) и сами ресницы.
  const lashGeo = new THREE.TorusGeometry(er * 1.14, female ? 0.0036 : 0.0024, 6, 32, Math.PI);
  lashGeo.rotateX(Math.PI / 2);
  upper.add(new THREE.Mesh(lashGeo, lash));
  upper.add(new THREE.Mesh(lashes(er * 1.14, female, sx), lash));
  const open = female ? -0.48 : -0.38;
  upper.rotation.x = open;
  g.add(upper);
  lids.push({ obj: upper, open, closed: 0.62 });
  // Нижнее веко — нижняя полусфера: края обоих век сходятся в уголках глаза (миндалевидный разрез).
  const lower = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lowerSkin ?? skin);
  lower.rotation.x = female ? 0.36 : 0.33;
  g.add(lower);
  return g;
}

/**
 * Ушная раковина (в своих координатах: +X — к затылку, +Y — вверх, +Z — наружу):
 * основа, завиток по краю, противозавиток, козелок, тёмная чаша раковины и мочка.
 */
function ear(female: boolean, skin: THREE.Material, skinShade: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const tube = (pts: Array<[number, number, number]>, r0: number, r1: number, m: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => v(x, y, z))), r0, r1, 24, 8), m);
  g.add(mesh(new THREE.SphereGeometry(1, 20, 16), skin, [0.006, 0.004, -0.006], [0.026, 0.045, 0.009]));
  g.add(
    tube(
      [
        [-0.012, 0.01, 0.002],
        [-0.016, 0.032, 0.004],
        [0.0, 0.048, 0.005],
        [0.02, 0.041, 0.005],
        [0.03, 0.016, 0.004],
        [0.026, -0.016, 0.003],
        [0.014, -0.034, 0.002],
      ],
      0.0075,
      0.0055,
      skin,
    ),
  );
  g.add(tube([[0.012, 0.03, 0.004], [0.017, 0.008, 0.005], [0.01, -0.014, 0.004]], 0.0045, 0.004, skin));
  g.add(mesh(new THREE.SphereGeometry(1, 14, 10), skinShade, [0.004, -0.004, 0.0], [0.014, 0.02, 0.005]));
  g.add(mesh(new THREE.SphereGeometry(0.006, 10, 8), skin, [-0.013, -0.006, 0.006]));
  g.add(mesh(new THREE.SphereGeometry(1, 12, 10), skin, [0.009, -0.043, 0.0], [0.013, female ? 0.013 : 0.015, 0.007]));
  g.scale.setScalar(female ? 1.25 : 1.35);
  return g;
}

/** Направление от центра головы: th — от макушки, phi — от лица (+Z) вокруг вертикали. */
const dirTP = (th: number, phi: number): THREE.Vector3 => v(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));

/** Линия бороды: на щеках выше, у рта — ниже нижней губы (рот открыт). */
const beardTop = (phi: number): number => Math.PI * (0.57 + 0.17 * Math.max(0, 1 - Math.abs(phi) / (Math.PI * 0.56)) ** 1.5);

let beardCache: THREE.BufferGeometry | null = null;

/**
 * Короткая борода: плотная основа по линии бороды (с вырезом для рта) и пряди поверх —
 * от скул и подбородка вниз, под челюсть.
 */
function beardGeometry(): THREE.BufferGeometry {
  if (beardCache && faceNeutral()) return beardCache;
  const C = v(0, HEAD_Y, 0);
  const P = (th: number, phi: number, off: number): THREE.Vector3 => {
    const n = dirTP(th, phi).normalize();
    return surface(n, false).addScaledVector(n, off).add(C);
  };
  // Основа: сетка по (phi, th) от линии бороды до горла.
  const U = 40;
  const V = 10;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= U; i += 1) {
    const phi = -Math.PI * 0.56 + (Math.PI * 1.12 * i) / U;
    const th0 = beardTop(phi);
    const th1 = Math.PI * (Math.abs(phi) < Math.PI * 0.3 ? 0.9 : 0.86);
    for (let j = 0; j <= V; j += 1) {
      const t = j / V;
      const p = P(th0 + (th1 - th0) * t, phi, 0.004 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.4)));
      pos.push(p.x, p.y, p.z);
      uv.push((i / U) * 3, t);
    }
  }
  for (let i = 0; i < U; i += 1) {
    for (let j = 0; j < V; j += 1) {
      const a = i * (V + 1) + j;
      const b = a + V + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  base.setIndex(idx);
  base.computeVertexNormals();
  // Пряди поверх основы.
  const paths: THREE.Vector3[][] = [];
  const widths: number[] = [];
  const n = 30;
  for (let i = 0; i < n; i += 1) {
    const phi = -Math.PI * 0.54 + (Math.PI * 1.08 * (i + 0.5)) / n;
    const th0 = beardTop(phi) + 0.03;
    const th1 = Math.PI * (Math.abs(phi) < Math.PI * 0.3 ? 0.88 : 0.82);
    paths.push([P(th0, phi, 0.008), P((th0 + th1) / 2, phi, 0.016), P(th1, phi, 0.014)]);
    widths.push(0.026);
  }
  const locks = strands(paths, widths, 0.007, 10, 6);
  const out = mergeGeometries([base, locks]);
  if (!faceNeutral()) return out;
  out.userData.shared = true;
  beardCache = out;
  return out;
}

export function buildHead(figure: Figure, skinBase: string, skinShade: string, hair: string, eyeColor: string, beard: boolean): HeadParts {
  const female = figure === 'female';
  const group = new THREE.Group();
  const lids: Lid[] = [];
  const skin = M.skin(skinBase);
  const shadeM = M.skin(skinShade);

  // Веки: у женской фигуры — лёгкие тени (чуть темнее и теплее кожи).
  const lidSkin = female ? M.skin(new THREE.Color(skinBase).lerp(new THREE.Color('#7d4d5c'), 0.2)) : skin;

  const headMat = M.skin(skinBase);
  headMat.vertexColors = true;
  group.add(mesh(skullGeometry(female, female ? 1 : 0.35), headMat, [0, HEAD_Y, 0]));

  // Глаза в глазницах.
  for (const sx of [-1, 1]) {
    const { p, n } = facePoint(0.082 * sx, 0.02, female);
    const e = eye(female, eyeColor, lidSkin, sx, lids, skin);
    e.position.copy(p).addScaledVector(n, -0.017).add(v(0, HEAD_Y, 0));
    // Внешний уголок чуть выше внутреннего.
    e.rotation.set(0, 0.06 * sx, 0.07 * sx);
    group.add(e);
  }

  // Брови вдоль надбровной дуги.
  const browM = M.hair(hair, 1);
  for (const sx of [-1, 1]) {
    const pts = (female
      ? [
          [0.032, 0.088],
          [0.064, 0.103],
          [0.1, 0.112],
          [0.132, 0.096],
        ]
      : [
          [0.028, 0.09],
          [0.066, 0.099],
          [0.104, 0.1],
          [0.136, 0.088],
        ]
    ).map(([x, y]) => at(x! * sx, y!, 0.004, female));
    group.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), (female ? 0.0068 : 0.0105) * (1 + 0.45 * F.brows), (female ? 0.0022 : 0.005) * (1 + 0.45 * F.brows), 20, 8), browM));
  }

  // Нос вылеплен на черепе; здесь только ноздри.
  for (const sx of [-1, 1]) {
    const { p, n } = facePoint(0.012 * sx * (female ? 0.85 : 1), -0.088, female);
    const nostril = mesh(new THREE.SphereGeometry(0.0058, 10, 8), mat(shade(skinShade, 0.45), 0.9), undefined, [1.3, 0.45, 0.9]);
    nostril.position.copy(p).addScaledVector(n, -0.0015).add(v(0, HEAD_Y, 0));
    group.add(nostril);
  }

  // Губы: верхняя с «луком Купидона», нижняя полнее, линия рта.
  const lipColor = female ? '#c4566a' : shade(skinShade, 0.88).lerp(new THREE.Color('#a85a50'), 0.35);
  // Губы: у женской фигуры — с блеском (лаковый слой).
  const lipM = female ? phys(lipColor, 0.38, { clearcoat: 0.7, clearcoatRoughness: 0.22, sheen: 0.2, sheenColor: new THREE.Color('#ff9aa8') }) : phys(lipColor, 0.55, { sheen: 0.15 });
  // Рот на трети расстояния от основания носа до подбородка.
  const my = mouthY(female);
  // Губы вылеплены на лице (объём, линия смыкания, уголки), цвет — тонкий слой по их контуру.
  group.add(lipPatch(female, lipM));

  // Уши.
  for (const sx of [-1, 1]) {
    const e = ear(female, skin, shadeM);
    // Ухо — за ветвью челюсти, между линией глаз и основанием носа.
    const p = surface(v(sx * 0.17, -0.035, -0.02).normalize(), female);
    e.position.copy(p).add(v(0.004 * sx, HEAD_Y, 0));
    e.rotation.y = sx * Math.PI * 0.5;
    e.rotation.x = -0.12;
    if (sx < 0) e.scale.x *= -1;
    group.add(e);
  }

  if (beard && !female) {
    const bm = M.hair(hair, 2);
    bm.side = THREE.DoubleSide;
    group.add(new THREE.Mesh(beardGeometry(), bm));
    const stache = [-0.055, -0.028, 0, 0.028, 0.055].map((x) => at(x, my + 0.024 - Math.abs(x) * 0.3, 0.008, false));
    group.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(stache), 0.011, 0.011, 20, 8), bm));
  }
  return { group, lids };
}
