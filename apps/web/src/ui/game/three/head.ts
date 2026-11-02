import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { HEAD_R, HEAD_SCALE, HEAD_Y } from './body';
import { M, mat, mesh, phys, shade, taperTube, tex, v } from './kit';
import { mergeGeometries } from './sdf';
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

const gauss = (d: THREE.Vector3, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): number =>
  Math.exp(-(((d.x - cx) / sx) ** 2) - ((d.y - cy) / sy) ** 2 - ((d.z - cz) / sz) ** 2);

function bump(d: THREE.Vector3, female: boolean): number {
  let b = 0;
  const nose = female ? 0.85 : 1;
  b += 0.03 * gauss(d, 0, 0.3, -0.95, 0.6, 0.5, 0.5); // затылок
  b += (female ? 0.014 : 0.035) * gauss(d, 0, 0.31, 0.95, 0.42, 0.07, 0.3); // надбровье
  for (const sx of [-1, 1]) {
    b -= 0.055 * gauss(d, sx * 0.33, 0.07, 0.94, 0.12, 0.085, 0.3); // глазницы
    b += (female ? 0.045 : 0.04) * gauss(d, sx * 0.52, -0.13, 0.82, 0.15, 0.1, 0.25); // скулы
    b -= (female ? 0.022 : 0.012) * gauss(d, sx * 0.56, -0.42, 0.76, 0.13, 0.11, 0.3); // впадина под скулой
    b -= 0.02 * gauss(d, sx * 0.78, 0.3, 0.5, 0.15, 0.15, 0.25); // виски
    b += 0.07 * nose * gauss(d, sx * 0.105, -0.34, 0.93, 0.05, 0.05, 0.25); // крылья носа
    b += (female ? 0.018 : 0.04) * gauss(d, sx * 0.66, -0.6, 0.45, 0.16, 0.1, 0.3); // угол челюсти
  }
  // Нос вылеплен прямо на лице: спинка от переносицы к кончику.
  b += 0.075 * nose * gauss(d, 0, -0.08, 0.97, 0.06, 0.2, 0.25);
  b += 0.17 * nose * gauss(d, 0, -0.29, 0.95, 0.075, 0.08, 0.25);
  b -= 0.012 * gauss(d, 0, -0.44, 0.92, 0.05, 0.05, 0.2); // ложбинка над губой
  b += (female ? 0.035 : 0.055) * gauss(d, 0, -0.86, 0.5, 0.2, 0.12, 0.3); // подбородок
  b += 0.03 * gauss(d, 0, -0.58, 0.85, 0.3, 0.15, 0.2); // область рта
  return b;
}

/** Точка поверхности головы для направления d (единичный вектор). */
function surface(d: THREE.Vector3, female: boolean, out = new THREE.Vector3()): THREE.Vector3 {
  const r = HEAD_R * (1 + bump(d, female));
  let x = d.x;
  let z = d.z;
  // Лицо широкое до скул, ниже челюсть сужается к подбородку (у женской фигуры — мягче и уже).
  if (d.y < -0.2) x *= 1 - smooth(-0.2, -0.95, d.y) * (female ? 0.33 : 0.24);
  // Затылок внизу переходит в шею, лоб чуть скошен назад.
  if (z < 0 && d.y < 0) z *= 1 - 0.32 * smooth(0, -0.85, d.y);
  if (z > 0 && d.y > 0.2) z *= 1 - 0.05 * smooth(0.2, 0.85, d.y);
  // Профиль: подбородок и рот выдвинуты вперёд, лицо — почти вертикальная плоскость, а не шар.
  if (z > 0) z += (female ? 0.085 : 0.1) * gauss(d, 0, -0.78, 0.6, 0.3, 0.2, 0.45) + 0.03 * gauss(d, 0, -0.5, 0.85, 0.25, 0.15, 0.3);
  // Нижняя часть лица чуть короче — подбородок не вытянут; макушка чуть ниже.
  const y = d.y < 0 ? d.y * (1 - 0.08 * smooth(0, -1, d.y)) : d.y * (1 - 0.04 * smooth(0.4, 1, d.y));
  return out.set(x * r * HEAD_SCALE.x * (female ? 0.97 : 1), y * r * HEAD_SCALE.y, z * r * HEAD_SCALE.z);
}

/** Точка на поверхности черепа в направлении d с отступом off (координаты относительно центра головы). */
export function skullPoint(d: THREE.Vector3, female: boolean, off = 0): THREE.Vector3 {
  return surface(d.clone().normalize(), female).multiplyScalar((HEAD_R + off) / HEAD_R);
}

/**
 * Подгоняет сферический сегмент (единичного радиуса) под форму черепа с отступом off —
 * так волосы и шапочки облегают голову, а не висят шаром.
 */
export function skullShell(geo: THREE.BufferGeometry, off: number, female: boolean): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const k = (HEAD_R + off) / HEAD_R;
  for (let i = 0; i < pos.count; i += 1) {
    d.fromBufferAttribute(pos, i).normalize();
    surface(d, female, p).multiplyScalar(k);
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

function lineAt(line: Hairline, t: number): number {
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
export function hairCap(off: number, line: Hairline, female: boolean, from = 0): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 72, 24, 0, Math.PI * 2, 0, 1);
  const pos = geo.getAttribute('position');
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  const k = (HEAD_R + off) / HEAD_R;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t0 = Math.acos(Math.max(-1, Math.min(1, y)));
    const phi = Math.atan2(x, z);
    const end = Math.max(from + 0.001, lineAt(line, Math.abs(phi) / Math.PI));
    const th = from + t0 * (end - from);
    d.set(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));
    surface(d, female, p).multiplyScalar(k);
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
  const W = 144;
  const H = 108;
  const geo = new THREE.SphereGeometry(1, W, H);
  const pos = geo.getAttribute('position');
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i += 1) {
    d.fromBufferAttribute(pos, i).normalize();
    surface(d, female, p);
    pos.setXYZ(i, p.x, p.y, p.z);
    // Лёгкий румянец на щеках и тень в глазницах — цветом вершин.
    const cheek = Math.max(gauss(d, 0.5, -0.18, 0.82, 0.18, 0.14, 0.3), gauss(d, -0.5, -0.18, 0.82, 0.18, 0.14, 0.3)) * blush;
    const socket = Math.max(gauss(d, 0.33, 0.1, 0.94, 0.16, 0.12, 0.3), gauss(d, -0.33, 0.1, 0.94, 0.16, 0.12, 0.3)) * 0.12;
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
  const er = female ? 0.038 : 0.036;
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
  const open = female ? -0.44 : -0.36;
  upper.rotation.x = open;
  g.add(upper);
  lids.push({ obj: upper, open, closed: 0.62 });
  // Нижнее веко — нижняя полусфера: края обоих век сходятся в уголках глаза (миндалевидный разрез).
  const lower = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lowerSkin ?? skin);
  lower.rotation.x = female ? 0.36 : 0.33;
  g.add(lower);
  return g;
}

function ear(female: boolean, skin: THREE.Material, skinShade: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const helix = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.011, 8, 28, Math.PI * 1.65), skin);
  helix.rotation.z = -Math.PI * 0.55;
  helix.scale.set(0.78, 1.25, 0.7);
  g.add(helix);
  g.add(mesh(new THREE.SphereGeometry(0.027, 16, 12), skinShade, [0, 0.002, -0.004], [0.75, 1.15, 0.35]));
  g.add(mesh(new THREE.SphereGeometry(female ? 0.014 : 0.016, 12, 10), skin, [0.006, -0.048, 0], [1, 1.15, 0.55]));
  g.add(mesh(new THREE.SphereGeometry(0.01, 10, 8), skin, [0.026, -0.008, 0.004]));
  g.scale.setScalar(female ? 0.92 : 1);
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
  if (beardCache) return beardCache;
  const C = v(0, HEAD_Y, 0);
  const P = (th: number, phi: number, off: number): THREE.Vector3 => surface(dirTP(th, phi).normalize(), false).multiplyScalar((HEAD_R + off) / HEAD_R).add(C);
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
  beardCache = mergeGeometries([base, locks]);
  beardCache.userData.shared = true;
  return beardCache;
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
    const { p, n } = facePoint(0.088 * sx, 0.02, female);
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
          [0.035, 0.088],
          [0.07, 0.104],
          [0.11, 0.108],
          [0.142, 0.09],
        ]
      : [
          [0.03, 0.092],
          [0.07, 0.1],
          [0.11, 0.1],
          [0.145, 0.085],
        ]
    ).map(([x, y]) => at(x! * sx, y!, 0.004, female));
    group.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), female ? 0.0075 : 0.012, female ? 0.003 : 0.006, 20, 8), browM));
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
  const my = -0.15;
  for (const sx of [-1, 1]) {
    const upperPts = [
      [0, my + 0.011],
      [0.011, my + 0.014],
      [0.026, my + 0.009],
      [0.042, my + 0.004],
    ].map(([x, y]) => at(x! * sx, y!, 0.0015, female));
    group.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(upperPts), female ? 0.0078 : 0.006, female ? 0.003 : 0.0025, 16, 8), lipM));
  }
  const lowerC = facePoint(0, my - 0.011, female);
  const lower = mesh(new THREE.SphereGeometry(1, 20, 12), lipM, undefined, female ? [0.032, 0.012, 0.012] : [0.028, 0.008, 0.009]);
  lower.position.copy(lowerC.p).addScaledVector(lowerC.n, 0.001).add(v(0, HEAD_Y, 0));
  lower.lookAt(lower.position.clone().add(lowerC.n));
  lower.rotateX(Math.PI / 2);
  // y — насколько губа выступает над лицом, z — её высота.
  lower.scale.set(female ? 0.031 : 0.027, female ? 0.0085 : 0.006, female ? 0.0115 : 0.008);
  group.add(lower);
  const line = [-0.044, -0.022, 0, 0.022, 0.044].map((x) => at(x, my + 0.003 + Math.abs(x) * 0.12, 0.003, female));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), 20, female ? 0.0032 : 0.0026, 6), mat(female ? '#5a2a26' : '#6e3a32', 0.8)));

  // Уши.
  for (const sx of [-1, 1]) {
    const e = ear(female, skin, shadeM);
    const p = surface(v(sx, -0.02, -0.08).normalize(), female);
    e.position.copy(p).add(v(0.006 * sx, HEAD_Y, 0));
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
