import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityCat, Coat, ItemId, Profession } from '../../game/city/types';
import { addOutlines } from '../game/three/outline';

/**
 * Милая мультяшная кошка на двух лапках (чиби): большая круглая голова, огромные блестящие глаза,
 * румянец, мордочка-«ω», круглое тельце с животиком, коротенькие лапки и хвост из трёх звеньев.
 * Окрасы — рыжая, серая полосатая, во фраке, белая, трёхцветная, сиамская и другие. На голове —
 * шапка по профессии, на теле — купленные вещи. Части неподвижные друг относительно друга
 * слиты в одну сетку с цветами вершин (мало отрисовок на кошку).
 * Анимации — процедурные: шаг вперевалочку, дыхание, моргание, ушки, хвост, работа по профессии.
 */

export type ChibiPose =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'work'
  | 'hammer'
  | 'pray'
  | 'eat'
  | 'shop'
  | 'fish'
  | 'swing'
  | 'slide'
  | 'ride'
  | 'climb'
  | 'play'
  | 'dance'
  | 'sleep';

interface CoatLook {
  base: string;
  /** Полоски, пятна, «маска». */
  dark: string;
  /** Животик, мордочка, лапки. */
  light: string;
  eye: string;
  stripes: boolean;
  /** Белая грудка и лапки (фрак). */
  bib: boolean;
  /** Сиамские «точки»: тёмные уши, маска, лапки, хвост. */
  points: boolean;
  /** Трёхцветные пятна. */
  patches?: [string, string];
}

const COAT: Record<Coat, CoatLook> = {
  ginger: { base: '#f6a85b', dark: '#e07b33', light: '#fff1de', eye: '#5aa04f', stripes: true, bib: false, points: false },
  grey: { base: '#b2b8c2', dark: '#78808c', light: '#f2f2f4', eye: '#d9a72e', stripes: true, bib: false, points: false },
  tuxedo: { base: '#34343f', dark: '#22222b', light: '#fbfbfd', eye: '#78c25a', stripes: false, bib: true, points: false },
  white: { base: '#fbf8f2', dark: '#e9e2d6', light: '#ffffff', eye: '#4f9de0', stripes: false, bib: false, points: false },
  calico: { base: '#fbf7ef', dark: '#3b3436', light: '#ffffff', eye: '#d9a72e', stripes: false, bib: false, points: false, patches: ['#f09a4a', '#3b3436'] },
  siamese: { base: '#f4e6cf', dark: '#6b4c3b', light: '#fff8ec', eye: '#4b9be8', stripes: false, bib: false, points: true },
  cream: { base: '#f7deb7', dark: '#e4b781', light: '#fff6e8', eye: '#c98a2e', stripes: true, bib: false, points: false },
  brown: { base: '#b98757', dark: '#7a5333', light: '#f6e6d2', eye: '#7cb342', stripes: true, bib: false, points: false },
  blue: { base: '#93a3b8', dark: '#77879b', light: '#dfe6ef', eye: '#e3a33a', stripes: false, bib: false, points: false },
  black: { base: '#2c2c35', dark: '#1d1d24', light: '#4a4a56', eye: '#f2c230', stripes: false, bib: false, points: false },
};
export const coatColor = (c: Coat): string => COAT[c].base;

// ─── Сборка сеток с цветами вершин ─────────────────────────────────────

/** Геометрия с одним цветом вершин (для слияния). */
function paint(geo: THREE.BufferGeometry, color: string, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const T = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const sphere = (r: number, w = 18, h = 14): THREE.BufferGeometry => new THREE.SphereGeometry(r, w, h);
const shadeHex = (c: string, k: number): string => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();

/** Общие материалы: мех (мульт-свет), глаза и румянец (без света). */
const FUR = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const FLAT = new THREE.MeshBasicMaterial({ vertexColors: true });
const BLUSH = new THREE.MeshBasicMaterial({ color: '#ff8fa8', transparent: true, opacity: 0.55, depthWrite: false });
const meshOf = (parts: THREE.BufferGeometry[], m: THREE.Material): THREE.Mesh => new THREE.Mesh(mergeGeometries(parts)!, m);

// ─── Аксессуары ────────────────────────────────────────────────────────

function hatFor(p: Profession): THREE.BufferGeometry[] {
  switch (p) {
    case 'baker':
      return [paint(new THREE.CylinderGeometry(0.085, 0.09, 0.07, 18), '#ffffff', T(0, 0.16, -0.01)), paint(sphere(0.095), '#ffffff', T(0, 0.23, -0.01, 1.15, 0.75, 1.1))];
    case 'confectioner':
      return [paint(new THREE.CylinderGeometry(0.14, 0.15, 0.05, 20), '#ff9cc2', T(0, 0.12, -0.01, 1, 1, 0.95, -0.12)), paint(sphere(0.03), '#ff5d8f', T(0, 0.17, 0.08))];
    case 'fisher':
      return [paint(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 18), '#ffd23f', T(0, 0.17, 0, 1, 1, 1, -0.1)), paint(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 22), '#ffc21a', T(0, 0.135, 0.01, 1, 1, 1, -0.1))];
    case 'painter':
      return [paint(sphere(0.13), '#e0453c', T(0.02, 0.15, -0.02, 1.1, 0.35, 1.1, -0.15, 0, 0.25)), paint(sphere(0.018), '#a3261f', T(0.05, 0.2, -0.02))];
    case 'carpenter':
      return [paint(sphere(0.15, 18, 10), '#ffc928', T(0, 0.1, -0.005, 1.02, 0.6, 1.02)), paint(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 22), '#f5b400', T(0, 0.1, 0.02))];
    case 'potter':
      return [paint(sphere(0.155, 18, 10), '#7fb6d9', T(0, 0.085, -0.01, 1.04, 0.55, 1.04)), paint(sphere(0.035), '#5d97bd', T(0.1, 0.06, -0.12))];
    case 'florist':
      return Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return paint(sphere(0.026, 10, 8), ['#ff7eb6', '#ffd93d', '#ffffff', '#b28dff'][i % 4]!, T(Math.sin(a) * 0.1, 0.15 + Math.cos(a) * 0.012, Math.cos(a) * 0.09 - 0.01));
      });
    case 'tailor':
      return [paint(new THREE.TorusGeometry(0.11, 0.012, 6, 24), '#ffcf48', T(0, -0.16, 0.02, 1, 1, 1, Math.PI / 2))];
  }
}

function itemParts(items: readonly ItemId[], look: CoatLook): { head: THREE.BufferGeometry[]; body: THREE.BufferGeometry[] } {
  const head: THREE.BufferGeometry[] = [];
  const body: THREE.BufferGeometry[] = [];
  for (const id of items) {
    if (id === 'bow') head.push(paint(sphere(0.035), '#ff4f86', T(-0.11, 0.12, 0.02, 1.3, 0.8, 0.6, 0, 0, 0.5)), paint(sphere(0.035), '#ff4f86', T(-0.065, 0.15, 0.02, 1.3, 0.8, 0.6, 0, 0, -0.4)), paint(sphere(0.018), '#d92b62', T(-0.088, 0.135, 0.03)));
    if (id === 'flower') head.push(...[0, 1, 2, 3, 4].map((i) => paint(sphere(0.02, 8, 6), '#ffffff', T(0.11 + Math.sin(i * 1.26) * 0.022, 0.1 + Math.cos(i * 1.26) * 0.022, 0.06))), paint(sphere(0.015, 8, 6), '#ffd23f', T(0.11, 0.1, 0.07)));
    if (id === 'glasses') head.push(paint(new THREE.TorusGeometry(0.04, 0.006, 6, 18), '#3a2c26', T(-0.068, 0.012, 0.168)), paint(new THREE.TorusGeometry(0.04, 0.006, 6, 18), '#3a2c26', T(0.068, 0.012, 0.168)), paint(new THREE.BoxGeometry(0.03, 0.008, 0.008), '#3a2c26', T(0, 0.02, 0.172)));
    if (id === 'crown') head.push(paint(new THREE.CylinderGeometry(0.075, 0.07, 0.05, 6, 1, true), '#f7c638', T(0, 0.205, 0)), ...[0, 1, 2, 3, 4, 5].map((i) => paint(new THREE.ConeGeometry(0.018, 0.04, 4), '#f7c638', T(Math.sin((i * Math.PI) / 3) * 0.072, 0.245, Math.cos((i * Math.PI) / 3) * 0.072))), paint(sphere(0.013), '#ff3b6b', T(0, 0.21, 0.075)));
    if (id === 'bell') body.push(paint(new THREE.TorusGeometry(0.085, 0.014, 8, 22), '#e2344e', T(0, 0.255, 0.0, 1, 1, 0.9, Math.PI / 2)), paint(sphere(0.022), '#f7c638', T(0, 0.235, 0.085)));
    if (id === 'scarf') body.push(paint(new THREE.TorusGeometry(0.088, 0.024, 8, 22), '#4cb6a8', T(0, 0.255, 0, 1, 1, 0.92, Math.PI / 2)), paint(new THREE.BoxGeometry(0.045, 0.1, 0.02), '#4cb6a8', T(0.045, 0.2, 0.085, 1, 1, 1, 0.2, 0, 0.2)));
    if (id === 'backpack') body.push(paint(new THREE.BoxGeometry(0.13, 0.13, 0.07), '#f08a3c', T(0, 0.17, -0.105)), paint(new THREE.BoxGeometry(0.1, 0.05, 0.03), '#d66d22', T(0, 0.13, -0.145)));
    if (id === 'cape') body.push(paint(new THREE.CylinderGeometry(0.06, 0.16, 0.22, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8), '#8e5bd6', T(0, 0.16, -0.02)));
  }
  void look;
  return { head, body };
}

// ─── Одежда ────────────────────────────────────────────────────────────

/** Что надето: рабочая форма (только на работе), обычная одежда, пижама (во сне). */
export type Outfit = 'work' | 'casual' | 'sleep';

/** Рубашка-оболочка поверх тельца (верх тела до пояса). */
const shell = (color: string, len = 1.9, grow = 1.07): THREE.BufferGeometry => paint(new THREE.SphereGeometry(0.125 * grow, 20, 12, 0, Math.PI * 2, 0, len), color, T(0, 0.1, 0, 1, 1.08, 0.93));
/** Рукавчик на плече лапки. */
const sleeve = (color: string): THREE.BufferGeometry => paint(new THREE.CylinderGeometry(0.041, 0.044, 0.05, 12), color, T(0, -0.02, 0));
/** Точка на поверхности тельца спереди (узоры, пуговицы). */
const onBody = (r: number, color: string, x: number, y: number, z = 0.123): THREE.BufferGeometry => paint(sphere(r, 8, 6), color, T(x, y, z, 1, 1, 0.45));

/** Обычная одежда — у каждой кошки своя (цвет и фасон по номеру). */
const CASUAL = ['#7fb6d9', '#ff9fb8', '#9ad08d', '#ffcf6b', '#c7a4ff', '#ff8a7a', '#6fd0c4', '#f6efe4'];
function casualParts(seed: number): { body: THREE.BufferGeometry[]; sleeve: string; head: THREE.BufferGeometry[] } {
  const c = CASUAL[(seed * 3) % CASUAL.length]!;
  const d = shadeHex(c, 0.82);
  const style = seed % 4;
  const body = [shell(c, 1.75)];
  const head: THREE.BufferGeometry[] = [];
  if (style === 0) {
    // Футболка с воротничком и кармашком.
    body.push(paint(new THREE.TorusGeometry(0.075, 0.012, 6, 20), '#ffffff', T(0, 0.225, 0.01, 1, 1, 0.9, Math.PI / 2 - 0.2)), paint(new THREE.BoxGeometry(0.035, 0.03, 0.01), d, T(0.045, 0.16, 0.122)));
  } else if (style === 1) {
    // Тельняшка в полоску.
    for (let i = 0; i < 3; i += 1) body.push(paint(new THREE.TorusGeometry(0.129 - Math.abs(i - 1) * 0.012, 0.009, 6, 24), '#ffffff', T(0, 0.08 + i * 0.045, 0, 1, 1, 0.93, Math.PI / 2)));
  } else if (style === 2) {
    // Свитер с сердечком и горлом.
    body.push(paint(new THREE.TorusGeometry(0.08, 0.02, 8, 20), d, T(0, 0.228, 0, 1, 1, 0.9, Math.PI / 2)));
    body.push(onBody(0.022, '#ff4f86', -0.014, 0.15), onBody(0.022, '#ff4f86', 0.014, 0.15), paint(new THREE.ConeGeometry(0.027, 0.035, 8), '#ff4f86', T(0, 0.128, 0.122, 1, 1, 0.45, Math.PI)));
  } else {
    // Рубашка на пуговках и кепка-панамка.
    for (let i = 0; i < 3; i += 1) body.push(onBody(0.009, '#ffffff', 0, 0.09 + i * 0.04, 0.128));
    body.push(paint(new THREE.TorusGeometry(0.075, 0.012, 6, 20), d, T(0, 0.225, 0.01, 1, 1, 0.9, Math.PI / 2 - 0.2)));
    head.push(paint(sphere(0.13, 16, 8), d, T(0, 0.12, -0.01, 1.05, 0.5, 1.05)), paint(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), d, T(0, 0.11, 0.08, 1, 1, 0.8, -0.15)));
  }
  return { body, sleeve: c, head };
}

/** Рабочая форма по профессии: фартук, жилет или блуза (шапка — отдельно, hatFor). */
function workParts(p: Profession): { body: THREE.BufferGeometry[]; sleeve: string | null } {
  const apron = (c: string, pocket = true): THREE.BufferGeometry[] => {
    const out = [paint(sphere(0.096, 16, 12), c, T(0, 0.08, 0.078, 1, 1.12, 0.5)), paint(new THREE.TorusGeometry(0.119, 0.009, 6, 24), c, T(0, 0.1, 0, 1, 1, 0.93, Math.PI / 2))];
    out.push(paint(new THREE.TorusGeometry(0.07, 0.007, 4, 18, Math.PI), c, T(0, 0.18, 0.02, 1, 1, 1, -0.3)));
    if (pocket) out.push(paint(new THREE.BoxGeometry(0.05, 0.03, 0.01), shadeHex(c, 0.85), T(0.035, 0.06, 0.122)));
    return out;
  };
  switch (p) {
    case 'baker':
      return { body: [shell('#ffffff', 1.9), ...apron('#f3efe6')], sleeve: '#ffffff' };
    case 'confectioner':
      return { body: [shell('#fff0f6', 1.9), ...apron('#ffc4dc'), onBody(0.01, '#ff4f86', -0.03, 0.12, 0.128), onBody(0.01, '#7fb6d9', 0.02, 0.07, 0.128)], sleeve: '#fff0f6' };
    case 'potter':
      return { body: [...apron('#a9865f'), onBody(0.016, '#7a5a3a', -0.03, 0.05, 0.126), onBody(0.012, '#7a5a3a', 0.04, 0.11, 0.124)], sleeve: null };
    case 'carpenter':
      // Кожаный фартук и пояс с инструментом.
      return { body: [...apron('#8b5e34'), paint(new THREE.TorusGeometry(0.124, 0.014, 6, 24), '#5c3a20', T(0, 0.05, 0, 1, 1, 0.93, Math.PI / 2)), paint(new THREE.BoxGeometry(0.02, 0.06, 0.02), '#c49a6c', T(-0.1, 0.03, 0.06)), paint(new THREE.BoxGeometry(0.04, 0.02, 0.02), '#8a8f99', T(-0.1, 0.065, 0.06))], sleeve: null };
    case 'florist':
      return { body: [...apron('#6dbb5e'), paint(sphere(0.016, 8, 6), '#ff7eb6', T(0.035, 0.085, 0.13))], sleeve: null };
    case 'fisher':
      // Жёлтый непромокаемый жилет со светлыми полосками.
      return { body: [shell('#ffd23f', 1.85, 1.08), paint(new THREE.TorusGeometry(0.133, 0.01, 6, 24), '#f6f6f6', T(0, 0.08, 0, 1, 1, 0.93, Math.PI / 2)), paint(new THREE.TorusGeometry(0.128, 0.01, 6, 24), '#f6f6f6', T(0, 0.14, 0, 1, 1, 0.93, Math.PI / 2))], sleeve: '#ffd23f' };
    case 'tailor':
      return { body: [shell('#ffffff', 1.9), paint(new THREE.SphereGeometry(0.135, 20, 12, Math.PI * 0.62, Math.PI * 1.76, 0, 1.85), '#9b7fd6', T(0, 0.1, 0, 1, 1.08, 0.93)), ...[0, 1, 2].map((i) => onBody(0.008, '#f7c638', 0.03, 0.08 + i * 0.04, 0.128))], sleeve: '#ffffff' };
    case 'painter':
      // Блуза в пятнах краски.
      return { body: [shell('#f4f1ea', 1.95, 1.09), onBody(0.018, '#ff6b6b', -0.05, 0.1, 0.13), onBody(0.014, '#5c8fd6', 0.04, 0.15, 0.128), onBody(0.016, '#ffd93d', 0.02, 0.05, 0.13), onBody(0.012, '#7cbf6b', -0.02, 0.17, 0.125)], sleeve: '#f4f1ea' };
  }
}

/** Пижама в горошек и ночной колпак с помпоном. */
function sleepParts(seed: number): { body: THREE.BufferGeometry[]; head: THREE.BufferGeometry[]; sleeve: string } {
  const c = ['#bcd8ff', '#ffd6e8', '#d9f2c9'][seed % 3]!;
  const body = [shell(c, 2.2)];
  for (let i = 0; i < 6; i += 1) body.push(onBody(0.012, '#ffffff', Math.sin(i * 2.4) * 0.06, 0.06 + (i % 3) * 0.05, 0.124));
  const head = [paint(new THREE.ConeGeometry(0.1, 0.24, 14), c, T(0.03, 0.2, -0.03, 1, 1, 1, -0.35, 0, -0.45)), paint(new THREE.TorusGeometry(0.095, 0.02, 6, 18), '#ffffff', T(0, 0.1, -0.005, 1, 1, 1, Math.PI / 2 - 0.25, 0, 0)), paint(sphere(0.035, 8, 6), '#ffffff', T(0.14, 0.27, -0.12))];
  return { body, head, sleeve: c };
}

/** Что надето на кошке по её занятию: форма — на рабочем месте, пижама — в кровати, иначе своя одежда. */
export function catOutfit(k: Pick<CityCat, 'act'>): Outfit {
  const settled = !k.act.path?.length;
  if (settled && k.act.kind === 'work') return 'work';
  if (settled && k.act.kind === 'sleep') return 'sleep';
  return 'casual';
}

/** Надеть одежду: показывает нужный комплект, остальные прячет. */
export function setOutfit(ch: Chibi, o: Outfit): void {
  if (ch.outfit === o) return;
  ch.outfit = o;
  for (const [k, list] of Object.entries(ch.outfits)) for (const m of list) m.visible = k === o;
}

// ─── Модель ────────────────────────────────────────────────────────────

export interface Chibi {
  root: THREE.Group;
  /** Корпус над бёдрами (наклоны, покачивание). */
  torso: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  tail: THREE.Group[];
  eyes: THREE.Mesh;
  earL: THREE.Mesh;
  earR: THREE.Mesh;
  /** Предметы в правой лапке (молоток, удочка, кисть…). */
  props: Partial<Record<PropId, THREE.Object3D>>;
  /** Фаза шага, время моргания, подёргивание уха. */
  gait: number;
  blinkAt: number;
  twitchAt: number;
  key: string;
  /** Комплекты одежды (сетки на тельце, голове и лапках) и что надето сейчас. */
  outfits: Record<Outfit, THREE.Object3D[]>;
  outfit: Outfit | null;
}

type PropId = 'hammer' | 'rod' | 'brush' | 'whisk' | 'can' | 'needle' | 'rolling' | 'clay' | 'bun';

function propModel(id: PropId): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  switch (id) {
    case 'hammer':
      parts.push(paint(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), '#9a6a3c', T(0, -0.04, 0.03, 1, 1, 1, Math.PI / 2)), paint(new THREE.BoxGeometry(0.06, 0.03, 0.03), '#9aa3ad', T(0, -0.04, 0.09)));
      break;
    case 'rod':
      parts.push(paint(new THREE.CylinderGeometry(0.005, 0.008, 0.5, 6), '#8a5a33', T(0, 0.12, 0.2, 1, 1, 1, 0.9)));
      break;
    case 'brush':
      parts.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), '#c58b4f', T(0, -0.02, 0.04, 1, 1, 1, Math.PI / 2.4)), paint(new THREE.ConeGeometry(0.012, 0.03, 6), '#3d7be0', T(0, 0.005, 0.09, 1, 1, 1, Math.PI / 2.4)));
      break;
    case 'whisk':
      parts.push(paint(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 6), '#d9d9e0', T(0, -0.02, 0.03, 1, 1, 1, Math.PI / 2)), paint(sphere(0.025, 8, 6), '#e5e5ec', T(0, -0.02, 0.075, 0.8, 0.8, 1.4)));
      break;
    case 'can':
      parts.push(paint(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 12), '#5bb3e6', T(0, -0.04, 0.05)), paint(new THREE.CylinderGeometry(0.006, 0.009, 0.07, 6), '#5bb3e6', T(0, -0.025, 0.1, 1, 1, 1, 1.1)));
      break;
    case 'needle':
      parts.push(paint(sphere(0.03, 10, 8), '#ff6f91', T(0, -0.03, 0.05)));
      break;
    case 'rolling':
      parts.push(paint(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), '#e2b07c', T(-0.07, -0.03, 0.06, 1, 1, 1, 0, 0, Math.PI / 2)));
      break;
    case 'clay':
      parts.push(paint(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 12), '#c7774a', T(-0.07, -0.05, 0.08)));
      break;
    case 'bun':
      parts.push(paint(sphere(0.03, 10, 8), '#e2a25a', T(0, -0.02, 0.04, 1, 0.7, 1)));
      break;
  }
  const m = meshOf(parts, FUR);
  addOutlines(m, { thickness: 0.006 });
  return m;
}

/** Что в лапке по профессии на работе. */
export const WORK_PROP: Record<Profession, PropId> = { baker: 'rolling', fisher: 'rod', tailor: 'needle', carpenter: 'hammer', potter: 'clay', florist: 'can', painter: 'brush', confectioner: 'whisk' };

/** Новая кошка: окрас, профессия (шапка), купленные вещи. */
export function buildChibi(coat: Coat, profession: Profession, items: readonly ItemId[] = [], seed = 1): Chibi {
  const L = COAT[coat];
  const root = new THREE.Group();
  root.name = 'chibi';

  // Ножки: от бедра вниз, стопа-подушечка вперёд.
  const leg = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(side * 0.058, 0.12, 0);
    const pawC = L.points ? L.dark : L.bib || coat === 'calico' ? L.light : L.base;
    const parts = [paint(new THREE.CapsuleGeometry(0.042, 0.06, 4, 12), L.base, T(0, -0.055, 0)), paint(sphere(0.05, 14, 10), pawC, T(0, -0.1, 0.022, 0.95, 0.62, 1.2))];
    g.add(meshOf(parts, FUR));
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);
  root.add(legL, legR);

  // Тельце: круглое, с животиком (и пятнами у трёхцветной).
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  root.add(torso);
  // Животик.
  const bodyParts = [paint(sphere(0.125, 20, 16), L.base, T(0, 0.1, 0, 1, 1.08, 0.93)), paint(sphere(0.09, 16, 12), L.light, T(0, 0.085, 0.075, 0.95, 1.05, 0.5))];
  if (L.bib) bodyParts.push(paint(sphere(0.08, 14, 10), L.light, T(0, 0.16, 0.065, 0.9, 0.9, 0.6)));
  if (L.patches) bodyParts.push(paint(sphere(0.07, 12, 10), L.patches[0], T(-0.06, 0.15, -0.07, 1, 0.8, 0.8)), paint(sphere(0.06, 12, 10), L.patches[1], T(0.07, 0.07, -0.08, 1, 0.8, 0.8)));
  if (L.stripes) for (let i = 0; i < 3; i += 1) bodyParts.push(paint(new THREE.TorusGeometry(0.11 - i * 0.008, 0.012, 6, 16, Math.PI * 0.8), L.dark, T(0, 0.14 - i * 0.045, -0.015, 1, 1.05, 1, Math.PI / 2 + 0.1, 0, Math.PI * 1.1)));
  const items3 = itemParts(items, L);
  torso.add(meshOf(bodyParts, FUR));
  // Одежда: три комплекта, виден один (setOutfit). Вещи с рынка (шарф, бубенчик) — поверх любой.
  const outfits: Record<Outfit, THREE.Object3D[]> = { work: [], casual: [], sleep: [] };
  const wear = (o: Outfit, parent: THREE.Object3D, parts: THREE.BufferGeometry[]): void => {
    if (!parts.length) return;
    const m = meshOf(parts, FUR);
    m.visible = false;
    parent.add(m);
    outfits[o].push(m);
  };
  const work = workParts(profession);
  const casual = casualParts(seed);
  const pj = sleepParts(seed);
  wear('work', torso, work.body);
  wear('casual', torso, casual.body);
  wear('sleep', torso, pj.body);
  if (items3.body.length) torso.add(meshOf(items3.body, FUR));

  // Лапки-ручки от плеч.
  const arm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(side * 0.105, 0.2, 0.0);
    const pawC = L.points ? L.dark : L.bib || coat === 'calico' || coat === 'white' ? L.light : L.base;
    g.add(meshOf([paint(new THREE.CapsuleGeometry(0.034, 0.06, 4, 10), L.base, T(0, -0.045, 0)), paint(sphere(0.04, 12, 10), pawC, T(0, -0.09, 0.005))], FUR));
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  for (const a of [armL, armR]) {
    if (work.sleeve) wear('work', a, [sleeve(work.sleeve)]);
    wear('casual', a, [sleeve(casual.sleeve)]);
    wear('sleep', a, [sleeve(pj.sleeve)]);
  }
  armL.rotation.z = -0.25;
  armR.rotation.z = 0.25;
  torso.add(armL, armR);

  // Голова: большая, круглая; ушки, мордочка, носик, «ω».
  const head = new THREE.Group();
  head.position.y = 0.245;
  torso.add(head);
  const H = 0.165;
  const hc = 0.13;
  const headParts = [paint(sphere(H, 24, 18), L.base, T(0, hc, 0, 1.12, 0.96, 1))];
  // Щёчки-пушки по бокам.
  headParts.push(paint(sphere(0.07, 14, 10), L.base, T(-0.13, hc - 0.06, 0.03, 1, 0.8, 0.9)), paint(sphere(0.07, 14, 10), L.base, T(0.13, hc - 0.06, 0.03, 1, 0.8, 0.9)));
  // Мордочка (две подушечки) и подбородок.
  const muzzle = L.points ? '#b08a70' : L.light;
  headParts.push(paint(sphere(0.045, 14, 10), muzzle, T(-0.032, hc - 0.055, 0.145, 1, 0.85, 0.7)), paint(sphere(0.045, 14, 10), muzzle, T(0.032, hc - 0.055, 0.145, 1, 0.85, 0.7)), paint(sphere(0.03, 12, 8), muzzle, T(0, hc - 0.09, 0.14, 1, 0.7, 0.6)));
  if (L.points) headParts.push(paint(sphere(0.085, 14, 10), '#9c7660', T(0, hc - 0.035, 0.1, 1.05, 0.85, 0.55)));
  if (L.bib) headParts.push(paint(sphere(0.07, 14, 10), L.light, T(0, hc - 0.07, 0.12, 1.15, 0.8, 0.6)));
  headParts.push(paint(sphere(0.019, 10, 8), '#ff8aa0', T(0, hc - 0.03, 0.172, 1.25, 0.8, 0.8)));
  if (L.stripes) for (let i = -1; i <= 1; i += 1) headParts.push(paint(new THREE.BoxGeometry(0.014, 0.05, 0.014), L.dark, T(i * 0.03, hc + 0.105, 0.11, 1, 1, 1, -0.75, 0, i * 0.15)));
  if (L.patches) headParts.push(paint(sphere(0.07, 12, 10), L.patches[0], T(-0.08, hc + 0.07, 0.07, 1, 0.9, 0.7)), paint(sphere(0.055, 12, 10), L.patches[1], T(0.09, hc + 0.09, 0.05, 1, 0.9, 0.7)));
  headParts.push(...items3.head.map((g) => g.applyMatrix4(T(0, hc, 0))));
  head.add(meshOf(headParts, FUR));
  wear('work', head, hatFor(profession).map((g) => g.applyMatrix4(T(0, hc, 0))));
  wear('casual', head, casual.head.map((g) => g.applyMatrix4(T(0, hc, 0))));
  wear('sleep', head, pj.head.map((g) => g.applyMatrix4(T(0, hc, 0))));
  // Ушки — отдельно (подёргиваются).
  const ear = (side: number): THREE.Mesh => {
    const earC = L.points ? L.dark : coat === 'calico' ? (side < 0 ? L.patches![0] : L.patches![1]) : L.base;
    const e = meshOf([paint(new THREE.ConeGeometry(0.062, 0.115, 14), earC, T(0, 0.04, 0, 1, 1, 0.55)), paint(new THREE.ConeGeometry(0.038, 0.08, 12), '#ffb3c4', T(0, 0.03, 0.02, 1, 1, 0.3))], FUR);
    e.position.set(side * 0.105, hc + 0.12, -0.005);
    e.rotation.z = -side * 0.38;
    head.add(e);
    return e;
  };
  const earL = ear(-1);
  const earR = ear(1);
  // Глаза: большие, радужка, зрачок, два блика; румянец; «ω».
  const eyeParts: THREE.BufferGeometry[] = [];
  const mouthParts: THREE.BufferGeometry[] = [];
  // Глаза собраны вокруг своей высоты (моргание — сжатие по высоте на месте).
  const EY = hc + 0.012;
  for (const side of [-1, 1]) {
    const ex = side * 0.068;
    const ey = 0;
    eyeParts.push(paint(sphere(0.046, 16, 12), '#1d1a2a', T(ex, ey, 0.142, 0.86, 1.05, 0.42)));
    eyeParts.push(paint(sphere(0.036, 14, 10), L.eye, T(ex, ey - 0.008, 0.153, 0.78, 0.82, 0.3)));
    eyeParts.push(paint(sphere(0.024, 12, 8), '#14111c', T(ex, ey - 0.004, 0.159, 0.75, 0.95, 0.25)));
    eyeParts.push(paint(sphere(0.014, 10, 8), '#ffffff', T(ex + side * -0.012 + 0.008, ey + 0.017, 0.166, 1, 1, 0.4)));
    eyeParts.push(paint(sphere(0.007, 8, 6), '#ffffff', T(ex - 0.012, ey - 0.018, 0.166, 1, 1, 0.4)));
    // Ротик «ω»: две дуги.
    mouthParts.push(paint(new THREE.TorusGeometry(0.014, 0.0035, 5, 12, Math.PI), '#4a2b2e', T(side * 0.014, hc - 0.058, 0.176, 1, 1, 1, 0, 0, Math.PI)));
  }
  const eyes = meshOf(eyeParts, FLAT);
  eyes.position.y = EY;
  head.add(eyes, meshOf(mouthParts, FLAT));
  const blush = new THREE.Mesh(mergeGeometries([new THREE.SphereGeometry(0.03, 12, 8).applyMatrix4(T(-0.11, hc - 0.045, 0.125, 1, 0.55, 0.3)), new THREE.SphereGeometry(0.03, 12, 8).applyMatrix4(T(0.11, hc - 0.045, 0.125, 1, 0.55, 0.3))])!, BLUSH);
  head.add(blush);
  // Усики.
  const wpts: number[] = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i += 1) {
      wpts.push(side * 0.07, hc - 0.05 + i * 0.012, 0.16, side * 0.16, hc - 0.045 + (i - 1) * 0.03, 0.15);
    }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpts, 3));
  head.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: coat === 'black' || coat === 'tuxedo' ? '#e8e8f0' : '#6b5a52' })));

  // Хвост: три звена от спины, кончик темнее у сиамской.
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = torso;
  for (let i = 0; i < 3; i += 1) {
    const g = new THREE.Group();
    if (i === 0) g.position.set(0, 0.04, -0.105);
    else g.position.set(0, 0.075, 0);
    g.rotation.x = i === 0 ? -0.9 : -0.35;
    const c = i === 2 ? (L.points ? L.dark : L.stripes ? L.dark : coat === 'calico' ? L.patches![1] : L.base) : L.base;
    g.add(meshOf([paint(new THREE.CapsuleGeometry(0.026 - i * 0.002, 0.06, 4, 10), c, T(0, 0.04, 0))], FUR));
    parent.add(g);
    tail.push(g);
    parent = g;
  }

  addOutlines(root, { thickness: 0.008, color: '#3a2a2a' });
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.outlineHull) m.castShadow = m.material !== BLUSH && m.material !== FLAT;
  });
  const ch: Chibi = { root, torso, head, legL, legR, armL, armR, tail, eyes, earL, earR, props: {}, gait: seed, blinkAt: 2 + seed % 3, twitchAt: 4 + (seed * 1.7) % 5, key: `${coat}|${profession}|${items.join(',')}`, outfits, outfit: null };
  setOutfit(ch, 'casual');
  return ch;
}

/** Показать предмет в правой лапке (null — пустые лапки). */
function holdProp(ch: Chibi, id: PropId | null): void {
  for (const [k, o] of Object.entries(ch.props)) if (o) o.visible = k === id;
  if (id && !ch.props[id]) {
    const p = propModel(id);
    p.position.set(0, -0.09, 0.01);
    ch.armR.add(p);
    ch.props[id] = p;
  }
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Поза и движение на кадр. speed — скорость шага (м/с), t — время (с), dt — шаг кадра.
 * Всё плавно подтягивается к цели позы, поверх — дыхание, моргание, ушки, хвост.
 */
export function animateChibi(ch: Chibi, pose: ChibiPose, t: number, dt: number, speed: number, profession: Profession): void {
  const k = 1 - Math.exp(-dt * 12);
  const set = (o: THREE.Object3D, x: number, y: number, z: number): void => {
    o.rotation.x = lerp(o.rotation.x, x, k);
    o.rotation.y = lerp(o.rotation.y, y, k);
    o.rotation.z = lerp(o.rotation.z, z, k);
  };
  // Шаг вперевалочку: фаза идёт по пройденному пути.
  if (pose === 'walk') ch.gait += dt * Math.max(0.6, speed) * 11;
  const g = ch.gait;
  const s = Math.sin(g);
  const breath = Math.sin(t * 2.4) * 0.012;
  let torsoY = 0.12;
  let torsoRx = 0;
  let torsoRz = 0;
  let headRx = 0;
  let headRz = Math.sin(t * 0.7) * 0.05;
  let legL: [number, number] = [0, 0];
  let legR: [number, number] = [0, 0];
  let armL: [number, number, number] = [0, 0, -0.25];
  let armR: [number, number, number] = [0, 0, 0.25];
  let prop: PropId | null = null;
  const sitLegs = (): void => {
    legL = [-1.45, 0.12];
    legR = [-1.45, -0.12];
    torsoY = 0.075;
  };
  switch (pose) {
    case 'walk':
      legL = [s * 0.65, 0];
      legR = [-s * 0.65, 0];
      armL = [-s * 0.55, 0, -0.3];
      armR = [s * 0.55, 0, 0.3];
      torsoY = 0.12 + Math.abs(Math.cos(g)) * 0.018;
      torsoRz = s * 0.09;
      torsoRx = 0.06;
      headRz = -s * 0.06;
      break;
    case 'sit':
    case 'ride':
    case 'swing':
    case 'slide':
    case 'climb':
      sitLegs();
      armL = [-0.5, 0, -0.35];
      armR = [-0.5, 0, 0.35];
      if (pose === 'swing') {
        armL = [-2.6, 0, -0.15];
        armR = [-2.6, 0, 0.15];
      }
      if (pose === 'ride' || pose === 'slide') {
        armL = [-2.4, 0, -0.6];
        armR = [-2.4, 0, 0.6];
        headRz = Math.sin(t * 3) * 0.12;
      }
      break;
    case 'eat': {
      sitLegs();
      const e = Math.max(0, Math.sin(t * 3.2));
      armL = [-1.3 - e * 0.6, 0, -0.1];
      armR = [-1.3 - (1 - e) * 0.6, 0, 0.1];
      headRx = 0.1 + e * 0.08;
      prop = 'bun';
      break;
    }
    case 'pray':
      armL = [-1.25, 0, 0.32];
      armR = [-1.25, 0, -0.32];
      headRx = 0.32 + Math.sin(t * 1.5) * 0.06;
      torsoRx = 0.12;
      break;
    case 'shop':
      armR = [-1.6 + Math.sin(t * 2) * 0.25, 0, 0.1];
      headRz = Math.sin(t * 0.9) * 0.18;
      headRx = 0.1;
      break;
    case 'fish':
      sitLegs();
      armL = [-1.2, 0, 0.15];
      armR = [-1.2 + Math.sin(t * 1.3) * 0.08, 0, -0.15];
      prop = 'rod';
      break;
    case 'play': {
      const j = Math.abs(Math.sin(t * 5));
      torsoY = 0.12 + j * 0.06;
      armL = [-2.7, 0, -0.4];
      armR = [-2.7, 0, 0.4];
      legL = [0.3 * j, 0];
      legR = [0.3 * j, 0];
      break;
    }
    case 'dance':
      torsoRz = Math.sin(t * 4) * 0.18;
      armL = [-2.5 + Math.sin(t * 4) * 0.4, 0, -0.5];
      armR = [-2.5 - Math.sin(t * 4) * 0.4, 0, 0.5];
      headRz = Math.sin(t * 4) * 0.2;
      legL = [Math.max(0, Math.sin(t * 4)) * 0.4, 0];
      legR = [Math.max(0, -Math.sin(t * 4)) * 0.4, 0];
      break;
    case 'hammer': {
      const hm = Math.sin(t * 7);
      armR = [-1.9 - hm * 0.8, 0, 0.1];
      armL = [-1.0, 0, -0.2];
      headRx = 0.2;
      prop = 'hammer';
      break;
    }
    case 'work':
      prop = WORK_PROP[profession];
      switch (profession) {
        case 'baker': {
          const a = Math.sin(t * 5);
          armL = [-1.25 + a * 0.3, 0, 0.1];
          armR = [-1.25 - a * 0.3, 0, -0.1];
          torsoY = 0.12 + Math.abs(a) * 0.01;
          torsoRx = 0.15;
          headRx = 0.25;
          break;
        }
        case 'carpenter': {
          const hm = Math.sin(t * 6.5);
          armR = [-1.9 - hm * 0.75, 0, 0.1];
          armL = [-1.1, 0, -0.15];
          headRx = 0.25;
          break;
        }
        case 'painter':
          armR = [-1.6 + Math.sin(t * 3) * 0.3, Math.cos(t * 3) * 0.3, 0.2];
          armL = [-0.6, 0, -0.3];
          headRz = Math.sin(t * 0.8) * 0.15;
          break;
        case 'confectioner':
          armR = [-1.3 + Math.sin(t * 9) * 0.15, Math.cos(t * 9) * 0.35, 0];
          armL = [-1.2, 0, 0.2];
          headRx = 0.2;
          break;
        case 'tailor':
          armR = [-1.2 + Math.sin(t * 10) * 0.12, 0, -0.1];
          armL = [-1.2 - Math.sin(t * 10) * 0.12, 0, 0.1];
          headRx = 0.3;
          break;
        case 'potter':
          armL = [-1.2, 0, 0.3];
          armR = [-1.2, 0, -0.3];
          torsoRz = Math.sin(t * 2) * 0.06;
          headRx = 0.28;
          break;
        case 'florist':
          armR = [-1.3, 0, 0.1 + Math.max(0, Math.sin(t * 1.6)) * 0.4];
          armL = [-0.3, 0, -0.3];
          headRz = 0.12;
          break;
        case 'fisher':
          sitLegs();
          armL = [-1.2, 0, 0.15];
          armR = [-1.25 + Math.sin(t * 1.3) * 0.08, 0, -0.15];
          break;
      }
      break;
    case 'idle':
    case 'sleep':
    default:
      armL = [Math.sin(t * 1.1) * 0.05, 0, -0.25];
      armR = [-Math.sin(t * 1.1) * 0.05, 0, 0.25];
      break;
  }
  holdProp(ch, prop);
  ch.torso.position.y = lerp(ch.torso.position.y, torsoY, k);
  ch.torso.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
  set(ch.torso, torsoRx, 0, torsoRz);
  set(ch.head, headRx, Math.sin(t * 0.37) * 0.12, headRz);
  set(ch.legL, legL[0], 0, legL[1]);
  set(ch.legR, legR[0], 0, legR[1]);
  set(ch.armL, armL[0], armL[1], armL[2]);
  set(ch.armR, armR[0], armR[1], armR[2]);
  // Хвост: мягкая волна (на бегу — быстрее), звенья запаздывают.
  const wag = pose === 'walk' ? 5 : pose === 'play' || pose === 'dance' ? 6 : 1.6;
  ch.tail.forEach((seg, i) => {
    seg.rotation.z = Math.sin(t * wag - i * 0.8) * (0.25 + i * 0.12);
    seg.rotation.x = (i === 0 ? -0.9 : -0.35) + Math.sin(t * 0.9 - i) * 0.08;
  });
  // Моргание и ушки.
  if (t > ch.blinkAt + 0.14) ch.blinkAt = t + 2.2 + ((ch.gait * 13.7) % 3);
  const blink = t > ch.blinkAt && t < ch.blinkAt + 0.14;
  ch.eyes.scale.y = lerp(ch.eyes.scale.y, blink || pose === 'sleep' ? 0.12 : 1, 0.6);
  if (t > ch.twitchAt + 0.25) ch.twitchAt = t + 3 + ((ch.gait * 7.3) % 5);
  const tw = t > ch.twitchAt && t < ch.twitchAt + 0.25 ? Math.sin((t - ch.twitchAt) * 40) * 0.25 : 0;
  ch.earL.rotation.z = 0.38 + tw;
  ch.earR.rotation.z = -0.38;
}

export function disposeChibi(ch: Chibi): void {
  ch.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
