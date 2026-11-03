import * as THREE from 'three';
import { FACE_PARTS, sliderValue, type Appearance, type FacePart, type Figure } from '../../../game/state';
import { HEAD_R, HEAD_SCALE, HEAD_Y } from './body';
import { M, mat, mesh, shade, taperTube, tex, v } from './kit';
import { mergeGeometries } from './sdf';
import { applyRingNormals, eyeAnchor, eyeScale, headRing, headPositions, headTris, lipWeights, loopSubdivide, mouthAnchor, rayRadiusTable } from './headMesh';
import { strands } from './strands';

/**
 * Голова — готовая модель MakeHuman (CC0, см. headMesh): форма черепа, лицо, нос, губы и уши.
 * Поверх неё — наши глаза с радужкой и моргающими веками, брови, ресницы и борода.
 * Координаты — собственные координаты головы: центр в (0, HEAD_Y, 0), лицо смотрит на +Z.
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
/** Текущие значения ползунков лица. */
export const faceValues = (): Record<FacePart, number> => F;

/** Радиус поверхности по направлениям (таблица θ×φ, по лучам от центра к поверхности). */
const NT = 120;
const NP = 240;
const radiusTables = new Map<string, Float32Array>();

function radiusTable(female: boolean): Float32Array {
  const key = `${female}|${FKEY}`;
  let tab = radiusTables.get(key);
  if (tab) return tab;
  tab = rayRadiusTable(headPositions(female, F), NT, NP);
  radiusTables.set(key, tab);
  // Держим только несколько последних вариантов лица (ползунки меняются часто).
  while (radiusTables.size > 6) radiusTables.delete(radiusTables.keys().next().value!);
  return tab;
}

/** Расстояние от центра до поверхности головы в направлении d (без ушей). */
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

/** Точка поверхности головы для направления d (единичный вектор). */
function surface(d: THREE.Vector3, female: boolean, out = new THREE.Vector3()): THREE.Vector3 {
  const r = baseRadius(d, female);
  return out.set(d.x * r, d.y * r, d.z * r);
}

/** Точка на поверхности черепа в направлении d с отступом off (координаты относительно центра головы). */
export function skullPoint(d: THREE.Vector3, female: boolean, off = 0): THREE.Vector3 {
  const n = d.clone().normalize();
  return surface(n, female).addScaledVector(n, off);
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
export function at(x: number, y: number, lift: number, female: boolean): THREE.Vector3 {
  const { p, n } = facePoint(x, y, female);
  return p.addScaledVector(n, lift).add(v(0, HEAD_Y, 0));
}

/** Радиус века относительно глаза и угол открытого века (край — по краю века модели). */
const LID_R = 1.03;
const LID_OPEN = 0.24;

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
  const lw = lipWeights(female);
  const ring = headRing(female);
  const fixed = new Uint8Array(lw.length);
  for (const i of ring.idx) fixed[i] = 1;
  const sub = loopSubdivide(headPositions(female, F), headTris(), Float32Array.from(lw, (x) => x / 255), fixed);
  const pos = sub.pos;
  const lip = sub.scalar;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(pos.length / 3 < 65536 ? Uint16Array.from(sub.tris) : sub.tris, 1));
  geo.computeVertexNormals();
  // Шов шеи: нормали кольца — как у тела в тех же точках.
  applyRingNormals(geo, ring.idx, ring.n);
  // Цвет вершин (множитель к цвету кожи): румянец на щеках, тень в глазницах, губы.
  const { c: eye } = eyeAnchor(female);
  const lipTint = female ? [0.84, 0.5, 0.58] : [0.9, 0.7, 0.68];
  const colors = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i += 1) {
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    const front = smooth(0.06, 0.14, z);
    const cheek = Math.max(g2(x, y, eye.x, -0.062, 0.035, 0.028), g2(x, y, -eye.x, -0.062, 0.035, 0.028)) * blush * front;
    const socket = Math.max(g2(x, y, eye.x, eye.y + 0.012, 0.036, 0.026), g2(x, y, -eye.x, eye.y + 0.012, 0.036, 0.026)) * 0.07 * front;
    const l = smooth(0.25, 0.75, lip[i]!);
    colors[i * 3] = (1 - socket * 0.5) * (1 + (lipTint[0]! - 1) * l);
    colors[i * 3 + 1] = (1 - cheek * 0.16 - socket) * (1 + (lipTint[1]! - 1) * l);
    colors[i * 3 + 2] = (1 - cheek * 0.14 - socket * 0.9) * (1 + (lipTint[2]! - 1) * l);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Край верхнего века модели (для левого глаза, координаты головы): вершины век у
 * поверхности глазного яблока спереди, по одной самой верхней на каждый участок по ширине глаза.
 */
function lidMargin(pos: ArrayLike<number>, c: THREE.Vector3, er: number): THREE.Vector3[] {
  const BINS = 14;
  const best: Array<THREE.Vector3 | null> = new Array(BINS).fill(null);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.length / 3; i += 1) {
    p.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
    const rx = (p.x - c.x) / er;
    const ry = (p.y - c.y) / er;
    const rz = (p.z - c.z) / er;
    const d = Math.hypot(rx, ry, rz);
    if (rz < 0.25 || ry < -0.15 || d < 0.99 || d > 1.075 || Math.abs(rx) > 0.95) continue;
    const b = Math.min(BINS - 1, Math.floor(((rx + 0.95) / 1.9) * BINS));
    if (!best[b] || p.y > best[b]!.y) best[b] = p.clone();
  }
  return best.filter((q): q is THREE.Vector3 => q !== null);
}

/**
 * Ресницы по краю верхнего века (координаты головы): тонкие изогнутые волоски,
 * к внешнему уголку длиннее и сильнее загнуты. sx — сторона (+1 — левый глаз).
 */
function lashes(margin: THREE.Vector3[], c: THREE.Vector3, female: boolean, sx: number): THREE.BufferGeometry | null {
  if (margin.length < 4) return null;
  const curve = new THREE.CatmullRomCurve3(margin.map((q) => v(q.x * sx, q.y, q.z)));
  const cc = v(c.x * sx, c.y, c.z);
  const n = female ? 26 : 18;
  const parts: THREE.BufferGeometry[] = [];
  const up = v(0, 1, 0);
  for (let k = 0; k < n; k += 1) {
    const t = 0.06 + (0.9 * k) / (n - 1);
    const root = curve.getPoint(t);
    const out = root.clone().sub(cc).normalize();
    // К внешнему уголку (от переносицы) ресницы длиннее.
    const outer = Math.max(0, ((root.x - cc.x) * sx) / 0.03);
    const len = (female ? 0.012 : 0.007) * (0.75 + 0.45 * Math.min(1, outer)) * (0.9 + 0.2 * Math.sin(k * 7.3));
    root.addScaledVector(out, 0.0006);
    const mid = root.clone().addScaledVector(out, len * 0.55).addScaledVector(up, len * 0.2);
    const tip = root.clone().addScaledVector(out, len * 0.75).addScaledVector(up, len * (0.65 + 0.15 * Math.min(1, outer)));
    parts.push(taperTube(new THREE.CatmullRomCurve3([root, mid, tip]), female ? 0.0009 : 0.0007, 0.0002, 5, 4));
  }
  // Линия роста ресниц — тонкая тёмная полоска по краю века.
  parts.push(taperTube(curve, female ? 0.0012 : 0.0007, female ? 0.0008 : 0.0005, 24, 5));
  return mergeGeometries(parts);
}

function eye(iris: THREE.ColorRepresentation, skin: THREE.Material, lids: Lid[], er: number): THREE.Group {
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

  // Верхнее веко для моргания: полусфера по глазу, открытая — прячется под веко модели,
  // её край совпадает с краем века.
  const R = er * LID_R;
  const upper = new THREE.Group();
  upper.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin));
  const open = -LID_OPEN;
  upper.rotation.x = open;
  g.add(upper);
  lids.push({ obj: upper, open, closed: 0.5 });
  return g;
}

/** Направление от центра головы: th — от макушки, phi — от лица (+Z) вокруг вертикали. */
const dirTP = (th: number, phi: number): THREE.Vector3 => v(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));

/** Линия бороды: на щеках выше, у рта — ниже нижней губы (рот открыт). */
const beardTop = (phi: number): number => Math.PI * (0.57 + 0.185 * Math.max(0, 1 - Math.abs(phi) / (Math.PI * 0.56)) ** 1.5);

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
    const th1 = Math.PI * (Math.abs(phi) < Math.PI * 0.3 ? 0.87 : 0.83);
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
    const th1 = Math.PI * (Math.abs(phi) < Math.PI * 0.3 ? 0.85 : 0.8);
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

export function buildHead(figure: Figure, skinBase: string, _skinShade: string, hair: string, eyeColor: string, beard: boolean): HeadParts {
  const female = figure === 'female';
  const group = new THREE.Group();
  const lids: Lid[] = [];
  const skin = M.skin(skinBase);

  // Веки: у женской фигуры — лёгкие тени (чуть темнее и теплее кожи).
  const lidSkin = female ? M.skin(new THREE.Color(skinBase).lerp(new THREE.Color('#7d4d5c'), 0.2)) : skin;

  const headMat = M.skin(skinBase);
  headMat.vertexColors = true;
  const skull = skullGeometry(female, female ? 1 : 0.35);
  group.add(mesh(skull, headMat, [0, HEAD_Y, 0]));

  // Глаза — на месте глазных яблок модели; веки модели ложатся поверх.
  const anchor = eyeAnchor(female);
  const margin = lidMargin(skull.getAttribute('position').array, anchor.c, anchor.r * eyeScale(F.eyes));
  const lashM = mat('#160f0d', 0.55);
  for (const sx of [-1, 1]) {
    const e = eye(eyeColor, lidSkin, lids, anchor.r * eyeScale(F.eyes));
    e.position.set(anchor.c.x * sx, anchor.c.y + HEAD_Y, anchor.c.z);
    group.add(e);
    const lg = lashes(margin, anchor.c, female, sx);
    if (lg) group.add(mesh(lg, lashM, [0, HEAD_Y, 0]));
  }

  // Брови вдоль надбровной дуги.
  const browM = M.hair(hair, 1);
  for (const sx of [-1, 1]) {
    const pts = (female
      ? [
          [0.028, 0.038],
          [0.055, 0.048],
          [0.088, 0.053],
          [0.118, 0.042],
        ]
      : [
          [0.024, 0.04],
          [0.058, 0.047],
          [0.092, 0.048],
          [0.122, 0.04],
        ]
    ).map(([x, y]) => at(x! * sx, anchor.c.y + y!, 0.002, female));
    const brow = taperTube(new THREE.CatmullRomCurve3(pts), (female ? 0.0058 : 0.0075) * (1 + 0.45 * F.brows), (female ? 0.0014 : 0.0035) * (1 + 0.45 * F.brows), 20, 8);
    group.add(new THREE.Mesh(brow, browM));
  }

  const my = mouthAnchor(female).y;

  if (beard && !female) {
    const bm = M.hair(hair, 2);
    bm.side = THREE.DoubleSide;
    group.add(new THREE.Mesh(beardGeometry(), bm));
    const stache = [-0.055, -0.028, 0, 0.028, 0.055].map((x) => at(x, my + 0.024 - Math.abs(x) * 0.3, 0.008, false));
    group.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(stache), 0.011, 0.011, 20, 8), bm));
  }
  return { group, lids };
}
