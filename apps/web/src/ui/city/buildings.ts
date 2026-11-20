import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TINTS } from '../../game/city/city';
import { buildingById } from '../../game/city/content';
import { BED, HOUSE_BEDS, HOUSE_TABLE, bedsOf } from '../../game/city/spots';
import type { Building, BuildingId, Profession } from '../../game/city/types';
import { addOutlines } from '../game/three/outline';

/**
 * Мультяшные здания города кошек (в осях клетки 4×4 м, фасад — на +z, к камере): домики четырёх
 * уровней, мастерские с вывеской, полосатым навесом и обстановкой по профессии, храм богов,
 * скверы, фонтан, развлечения и пепелище. Неподвижные части слиты в одну сетку с цветами вершин;
 * движущиеся (качели, карусель, вода, огонь) — отдельные объекты с именем для анимации.
 */

type G = THREE.BufferGeometry;
const T = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function paint(geo: G, color: string, m?: THREE.Matrix4): G {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Общие материалы: стены и всё прочее (цвета вершин), окна (светятся ночью), вода, огонь. */
export const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  window: new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.3, emissive: new THREE.Color('#ffc864'), emissiveIntensity: 0 }),
  glow: new THREE.MeshStandardMaterial({ color: '#fff1c0', emissive: new THREE.Color('#ffbf47'), emissiveIntensity: 0.2 }),
  water: new THREE.MeshStandardMaterial({ color: '#66c7ef', roughness: 0.15, transparent: true, opacity: 0.85 }),
  fire: new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0.9, depthWrite: false }),
  fireCore: new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.95, depthWrite: false }),
  smoke: new THREE.MeshBasicMaterial({ color: '#6b6b70', transparent: true, opacity: 0.4, depthWrite: false }),
  ember: new THREE.MeshBasicMaterial({ color: '#ff5a1f' }),
};

/** Темнее/светлее цвета (k < 1 — темнее). */
const shade = (hex: string, k: number): string => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

const ROOFS = ['#e8735a', '#5c8fd6', '#7cbf6b', '#c77dd6', '#f2a33a', '#d95f8b', '#5fb7a8', '#b5835a'];

/** Сборщик сетки: части с цветами → одна сетка; окна — отдельной сеткой. */
class Kit {
  parts: G[] = [];
  wins: G[] = [];
  extra: THREE.Object3D[] = [];
  /** Крыша и фасад: при взгляде внутрь становятся прозрачными (группа «cut»). */
  cutParts: G[] = [];
  cutWins: G[] = [];
  cutExtra: THREE.Object3D[] = [];
  private cutting = false;
  add(geo: G, color: string, m: THREE.Matrix4): this {
    (this.cutting ? this.cutParts : this.parts).push(paint(geo, color, m));
    return this;
  }
  /** Всё, что добавлено внутри fn, — съёмная часть (крыша, передняя стена, навес). */
  cut(fn: () => void): this {
    this.cutting = true;
    fn();
    this.cutting = false;
    return this;
  }
  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, T(x, y + h / 2, z, 1, 1, 1, rx, ry, rz));
  }
  ball(r: number, color: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx): this {
    return this.add(new THREE.SphereGeometry(r, 14, 10), color, T(x, y, z, sx, sy, sz));
  }
  cyl(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, seg = 16, rx = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, T(x, y + h / 2, z, 1, 1, 1, rx, 0, rz));
  }
  cone(r: number, h: number, color: string, x: number, y: number, z: number, seg = 16): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, T(x, y + h / 2, z));
  }
  /** Двускатная крыша над коробкой w×d на высоте y. */
  roof(w: number, d: number, h: number, color: string, y: number, z = 0): this {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.15, 0);
    shape.lineTo(0, h);
    shape.lineTo(w / 2 + 0.15, 0);
    shape.lineTo(-w / 2 - 0.15, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.3, bevelEnabled: false });
    return this.add(geo, color, T(0, y, z - d / 2 - 0.15));
  }
  window(x: number, y: number, z: number, w = 0.34, h = 0.36, round = false): this {
    const g = round ? new THREE.CircleGeometry(w / 2, 18) : new THREE.PlaneGeometry(w, h);
    (this.cutting ? this.cutWins : this.wins).push(g.applyMatrix4(T(x, y, z + 0.012)));
    // Рамка.
    if (round) this.add(new THREE.TorusGeometry(w / 2, 0.035, 6, 20), '#ffffff', T(x, y, z + 0.01));
    else this.box(w + 0.08, 0.05, 0.05, '#ffffff', x, y - h / 2 - 0.05, z + 0.02).box(0.04, h, 0.03, '#ffffff', x, y - h / 2, z + 0.015);
    return this;
  }
  build(name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    if (this.parts.length) {
      const m = new THREE.Mesh(mergeGeometries(this.parts)!, MAT.solid);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const winMesh = (list: G[]): THREE.Mesh => {
      const nonIdx = list.map((w) => (w.index ? w.toNonIndexed() : w));
      nonIdx.forEach((w) => w.getAttribute('uv') && w.deleteAttribute('uv'));
      return new THREE.Mesh(mergeGeometries(nonIdx)!, MAT.window);
    };
    if (this.wins.length) g.add(winMesh(this.wins));
    for (const e of this.extra) g.add(e);
    if (this.cutParts.length || this.cutWins.length || this.cutExtra.length) {
      // Своя копия материала: прозрачность у каждого здания своя.
      const cut = new THREE.Group();
      cut.name = 'cut';
      if (this.cutParts.length) {
        const mat = MAT.solid.clone();
        const m = new THREE.Mesh(mergeGeometries(this.cutParts)!, mat);
        m.name = 'cutShell';
        m.castShadow = true;
        m.receiveShadow = true;
        cut.add(m);
      }
      if (this.cutWins.length) cut.add(winMesh(this.cutWins));
      for (const e of this.cutExtra) cut.add(e);
      g.add(cut);
    }
    addOutlines(g, { thickness: 0.03, color: '#3b2a26', maxFlat: 6 });
    return g;
  }
}

/** Вывеска с картинкой-эмодзи (canvas). */
const signCache = new Map<string, THREE.Texture>();
function signTexture(icon: string, bg: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const key = icon + bg;
  const hit = signCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.font = '72px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  signCache.set(key, t);
  return t;
}
function sign(icon: string, bg: string, x: number, y: number, z: number, r = 0.32): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ map: signTexture(icon, bg), color: signTexture(icon, bg) ? '#ffffff' : bg }));
  m.position.set(x, y, z);
  return m;
}

// ─── Домики ────────────────────────────────────────────────────────────

function house(level: number, tint: number): THREE.Group {
  const k = new Kit();
  const wall = TINTS[tint % TINTS.length]!;
  const roof = ROOFS[tint % ROOFS.length]!;
  const w = [1.6, 2.0, 2.2, 2.4][level - 1]!;
  const d = [1.3, 1.6, 1.8, 1.9][level - 1]!;
  const h = [1.05, 1.25, 2.1, 2.2][level - 1]!;
  const z0 = -0.2;
  const fz = z0 + d / 2;
  const bz = z0 - d / 2;
  const t = 0.08;
  // Основание-фундамент и газон-участок.
  k.box(2.9, 0.06, 2.7, '#a8d98a', 0, 0, 0.15);
  k.box(w + 0.1, 0.12, d + 0.1, '#d9cbb8', 0, 0.02, z0);
  // Пол и три стены; передняя стена с дверью и окнами — съёмная (вид внутрь).
  k.box(w - 0.04, 0.02, d - 0.04, '#d8b07e', 0, 0.14, z0);
  for (let i = 1; i < 6; i += 1) k.box(0.015, 0.005, d - 0.06, '#c49a6c', -w / 2 + (i * w) / 6, 0.16, z0);
  k.box(w, h, t, wall, 0, 0.12, bz + t / 2);
  k.box(t, h, d, wall, -w / 2 + t / 2, 0.12, z0).box(t, h, d, wall, w / 2 - t / 2, 0.12, z0);
  // Обои-полоса и картинка на задней стене.
  k.box(w - 2 * t, 0.06, 0.01, shade(wall, 0.86), 0, 0.62, bz + t + 0.005);
  k.box(0.32, 0.24, 0.02, '#ffffff', 0.38, 0.78, bz + t + 0.01).box(0.26, 0.18, 0.025, ['#7fb6d9', '#ffb36b', '#9ad08d'][tint % 3]!, 0.38, 0.81, bz + t + 0.01);
  k.ball(0.06, '#ffd93d', 0.46, 0.94, bz + t + 0.03, 1, 1, 0.3);
  // Коврик.
  k.cyl(0.36, 0.36, 0.012, '#f6c6d6', 0.05, 0.16, z0 + 0.15, 24).cyl(0.26, 0.26, 0.014, '#fde4ec', 0.05, 0.16, z0 + 0.15, 24);
  // Кровати — по жильцам; подушка у стены, одеяло свёрнуто в ногах.
  const blankets = ['#7fb6d9', '#ff9fb8', '#9ad08d'];
  HOUSE_BEDS.slice(0, bedsOf(level)).forEach((p, i) => {
    const mid = p.z + BED.len / 2;
    k.box(BED.w + 0.06, 0.08, BED.len, '#9b6b43', p.x, 0.16, mid);
    k.box(BED.w + 0.06, 0.34, 0.05, '#9b6b43', p.x, 0.16, p.z + 0.025).ball(0.035, '#9b6b43', p.x - BED.w / 2, 0.52, p.z + 0.025).ball(0.035, '#9b6b43', p.x + BED.w / 2, 0.52, p.z + 0.025);
    k.box(BED.w, 0.08, BED.len - 0.06, '#ffffff', p.x, 0.24, mid + 0.02);
    k.ball(0.1, '#fffaf0', p.x, BED.top + 0.03, p.z + 0.14, 1.5, 0.45, 0.85);
    k.box(BED.w + 0.02, 0.07, 0.17, blankets[(tint + i) % 3]!, p.x, BED.top - 0.02, p.z + BED.len - 0.1);
  });
  // Столик с миской рыбки и подушки вокруг.
  const tb = HOUSE_TABLE;
  k.cyl(0.035, 0.05, tb.h, '#9b6b43', tb.x, 0.16, tb.z, 8).cyl(tb.r, tb.r, 0.03, '#e8c39a', tb.x, 0.16 + tb.h, tb.z, 18);
  k.cyl(0.06, 0.045, 0.04, '#7fb6d9', tb.x, 0.19 + tb.h, tb.z, 12).ball(0.035, '#ff9a5a', tb.x, 0.24 + tb.h, tb.z, 1.5, 0.6, 0.8);
  for (const sp of [[tb.x - 0.3, tb.z + 0.02], [tb.x + 0.3, tb.z + 0.02], [tb.x, tb.z + 0.32]] as const) k.cyl(0.11, 0.12, 0.05, '#ff9fb8', sp[0], 0.15, sp[1], 14);
  // Горшок с цветком в углу.
  k.cyl(0.07, 0.055, 0.12, '#c96f4a', w / 2 - 0.2, 0.16, fz - 0.22, 10).ball(0.1, '#6dbb5e', w / 2 - 0.2, 0.36, fz - 0.22);
  k.cut(() => {
    k.box(w, h, t, wall, 0, 0.12, fz - t / 2);
    k.roof(w, d, 0.55 + level * 0.08, roof, 0.12 + h, z0);
    // Дверь (полукруглая).
    k.box(0.42, 0.55, 0.06, '#8b5a3c', 0, 0.12, fz);
    k.add(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 16, 1, false, 0, Math.PI), '#8b5a3c', T(0, 0.67, fz + 0.03, 1, 1, 1, Math.PI / 2, 0, -Math.PI / 2));
    k.ball(0.025, '#f2c94c', 0.13, 0.42, fz + 0.05);
    // Окна по уровню.
    if (level === 1) k.window(0.5, 0.65, fz, 0.32, 0.32, true);
    else {
      k.window(-w / 2 + 0.38, 0.62, fz).window(w / 2 - 0.38, 0.62, fz);
      // Ящики с цветами под окнами.
      for (const sx of [-1, 1]) {
        k.box(0.42, 0.1, 0.12, '#9b6b43', sx * (w / 2 - 0.38), 0.32, fz + 0.06);
        for (let i = -1; i <= 1; i += 1) k.ball(0.05, ['#ff7eb6', '#ffd93d', '#ff6b6b'][i + 1]!, sx * (w / 2 - 0.38) + i * 0.12, 0.45, fz + 0.06);
      }
    }
    if (level >= 3) {
      k.window(-0.5, 1.6, fz).window(0.5, 1.6, fz);
      // Балкончик.
      k.box(0.9, 0.06, 0.3, '#ffffff', 0, 1.25, fz + 0.15).box(0.9, 0.22, 0.04, '#ffffff', 0, 1.31, fz + 0.3);
    }
    if (level >= 2) k.box(0.22, 0.5, 0.22, '#b5654a', w / 2 - 0.45, 0.12 + h + 0.15, -0.5);
  });
  k.box(0.6, 0.08, 0.25, '#cdb9a0', 0, 0, fz + 0.12);
  if (level >= 2) {
    // Почтовый ящик.
    k.box(0.06, 0.35, 0.06, '#7a5236', 1.15, 0.06, 1.2).box(0.18, 0.14, 0.24, '#5c8fd6', 1.15, 0.41, 1.2);
  }
  if (level >= 4) {
    // Башенка с конусной крышей и флажок (сбоку, снаружи стены).
    const tx = -w / 2 - 0.3;
    k.cyl(0.42, 0.42, 2.5, wall, tx, 0.12, -0.55, 20);
    k.cone(0.58, 0.9, roof, tx, 2.62, -0.55, 20);
    k.window(tx, 1.6, -0.12, 0.26, 0.26, true);
    k.cyl(0.015, 0.015, 0.5, '#555555', tx, 3.5, -0.55, 6).box(0.25, 0.15, 0.02, '#ff5d73', tx + 0.13, 3.82, -0.55);
    // Заборчик перед домом и кусты.
    for (let i = -6; i <= 6; i += 1) if (Math.abs(i) > 1) k.box(0.06, 0.28, 0.04, '#ffffff', i * 0.21, 0.06, 1.5);
    k.box(2.8, 0.04, 0.04, '#ffffff', 0, 0.26, 1.5);
    k.ball(0.25, '#5fae5a', 1.2, 0.25, 0.4).ball(0.22, '#69b864', -1.25, 0.22, 0.6);
  }
  // Цветочный горшок у двери.
  k.cyl(0.08, 0.06, 0.14, '#c96f4a', -0.38, 0.06, fz + 0.15, 10).ball(0.09, '#ff7eb6', -0.38, 0.27, fz + 0.15);
  return k.build(`house${level}`);
}

// ─── Мастерские ────────────────────────────────────────────────────────

const AWNING: Record<Profession, [string, string]> = {
  baker: ['#f6c177', '#ffffff'],
  fisher: ['#5c8fd6', '#ffffff'],
  tailor: ['#c77dd6', '#ffffff'],
  carpenter: ['#b5835a', '#f3e0c0'],
  potter: ['#d9824a', '#fff3e0'],
  florist: ['#7cbf6b', '#ffffff'],
  painter: ['#ff6b6b', '#ffe066'],
  confectioner: ['#ff8fc1', '#ffffff'],
};

function stuff(k: Kit, p: Profession): void {
  switch (p) {
    case 'baker':
      // Печь-купол, прилавок с хлебом, полки с булочками.
      k.ball(0.55, '#c9785a', -0.85, 0.12, -0.7, 1, 0.9, 1).add(new THREE.CircleGeometry(0.22, 16, 0, Math.PI), '#3a1d14', T(-0.85, 0.2, -0.17));
      k.box(2.2, 0.32, 0.38, '#e8c39a', 0, 0.12, 0.75);
      for (let i = -3; i <= 3; i += 1) k.ball(0.07, '#d98f3e', i * 0.28, 0.5, 0.75, 1.5, 0.7, 0.8);
      k.box(1.2, 0.04, 0.3, '#9b6b43', 0.65, 0.95, -0.95).box(1.2, 0.04, 0.3, '#9b6b43', 0.65, 1.3, -0.95);
      for (let i = 0; i < 4; i += 1) k.ball(0.07, '#e2a25a', 0.25 + i * 0.27, 1.05, -0.95).ball(0.06, '#c9783e', 0.25 + i * 0.27, 1.4, -0.95);
      break;
    case 'fisher':
      for (const [x, z] of [[-1.1, -0.8], [-0.75, -0.95]] as const) k.cyl(0.22, 0.2, 0.45, '#9b6b43', x, 0.12, z, 14);
      k.box(2.2, 0.3, 0.38, '#7a9eb8', 0, 0.12, 0.75);
      for (let i = -3; i <= 3; i += 1) k.ball(0.07, '#9ec7e8', i * 0.28, 0.5, 0.75, 1.7, 0.6, 0.7).cone(0.05, 0.08, '#9ec7e8', i * 0.28 + 0.15, 0.46, 0.75, 4);
      k.box(1.4, 0.04, 0.04, '#7a5236', 0.5, 1.3, -1.0);
      for (let i = 0; i < 4; i += 1) k.ball(0.06, '#e8a05c', 0.0 + i * 0.32, 1.15, -1.0, 0.6, 1.6, 0.6);
      break;
    case 'tailor':
      k.box(2.2, 0.3, 0.38, '#f3d6ec', 0, 0.12, 0.75);
      k.cyl(0.13, 0.1, 0.55, '#f4e6d7', 1.05, 0.12, -0.8, 12).ball(0.2, '#f4e6d7', 1.05, 0.9, -0.8, 1, 1.3, 0.8);
      for (let i = 0; i < 5; i += 1) k.ball(0.09, ['#ff7eb6', '#7fb6d9', '#ffd93d', '#9ad08d', '#c77dd6'][i]!, -1.0 + i * 0.22, 0.52, 0.75);
      for (let i = 0; i < 3; i += 1) k.cyl(0.08, 0.08, 0.7, ['#ff9a8a', '#8ac7ff', '#ffe08a'][i]!, -0.9 + i * 0.2, 0.12, -1.0, 12);
      break;
    case 'carpenter':
      k.box(2.2, 0.36, 0.4, '#c49a6c', 0, 0.12, 0.75);
      for (let i = 0; i < 3; i += 1) k.box(1.1, 0.05, 0.16, '#e2c08f', -0.2, 0.48 + i * 0.05, 0.75);
      for (let i = 0; i < 4; i += 1) k.cyl(0.12, 0.12, 0.9, '#9b6b43', -1.0, 0.24 + (i % 2) * 0.2, -0.75 + i * 0.12, 12, 0, Math.PI / 2);
      k.box(0.4, 0.4, 0.4, '#b5835a', 0.9, 0.12, -0.8).box(0.4, 0.5, 0.06, '#b5835a', 0.9, 0.52, -0.98);
      break;
    case 'potter':
      k.box(2.2, 0.3, 0.38, '#d9b38c', 0, 0.12, 0.75);
      k.cyl(0.2, 0.2, 0.04, '#8a6a4c', -0.6, 0.44, 0.75).cyl(0.2, 0.2, 0.04, '#8a6a4c', 0.6, 0.44, 0.75);
      k.cyl(0.32, 0.42, 0.9, '#b8573c', -0.95, 0.12, -0.85, 16).add(new THREE.CircleGeometry(0.16, 14), '#ff9a3c', T(-0.95, 0.4, -0.45));
      for (let i = 0; i < 4; i += 1) k.cyl(0.07, 0.1, 0.22, ['#c7774a', '#7fb6d9', '#e2a25a', '#9ad08d'][i]!, 0.35 + i * 0.25, 1.0, -0.98, 12);
      k.box(1.2, 0.04, 0.3, '#9b6b43', 0.7, 0.95, -0.98);
      break;
    case 'florist':
      k.box(2.2, 0.28, 0.38, '#bfe0b0', 0, 0.12, 0.75);
      for (let i = -3; i <= 3; i += 1) {
        k.cyl(0.09, 0.07, 0.18, '#9aa3ad', i * 0.3, 0.4, 0.75, 10);
        for (let j = 0; j < 3; j += 1) k.ball(0.055, ['#ff7eb6', '#ffd93d', '#ff6b6b', '#b28dff', '#ffffff'][(i + j + 5) % 5]!, i * 0.3 + (j - 1) * 0.05, 0.66 + (j % 2) * 0.05, 0.75);
      }
      for (let i = 0; i < 4; i += 1) k.cyl(0.13, 0.1, 0.25, '#c96f4a', -1.0 + i * 0.3, 0.12, -0.9, 12).ball(0.17, '#6dbb5e', -1.0 + i * 0.3, 0.48, -0.9);
      break;
    case 'painter':
      k.box(2.2, 0.28, 0.38, '#f7e3c6', 0, 0.12, 0.75);
      for (const x of [-0.95, 0.95]) {
        k.box(0.05, 1.1, 0.05, '#9b6b43', x, 0.12, -0.6, 0.15).box(0.6, 0.5, 0.04, '#ffffff', x, 0.75, -0.6, 0.15);
        k.box(0.5, 0.4, 0.045, x < 0 ? '#7fb6d9' : '#ffb36b', x, 0.8, -0.585, 0.15);
      }
      for (let i = 0; i < 5; i += 1) k.cyl(0.06, 0.06, 0.12, ['#ff6b6b', '#ffd93d', '#5c8fd6', '#7cbf6b', '#c77dd6'][i]!, -0.6 + i * 0.3, 0.4, 0.75, 10);
      break;
    case 'confectioner':
      k.box(2.2, 0.3, 0.38, '#ffd6e8', 0, 0.12, 0.75);
      k.cyl(0.3, 0.25, 0.4, '#8a8f99', -0.95, 0.12, -0.8, 16).cyl(0.27, 0.27, 0.02, '#ff8fc1', -0.95, 0.5, -0.8);
      for (let i = 0; i < 4; i += 1) {
        k.cyl(0.1, 0.1, 0.25, '#e8f6ff', -0.75 + i * 0.5, 0.42, 0.75, 12);
        for (let j = 0; j < 3; j += 1) k.ball(0.035, ['#ff6b6b', '#ffd93d', '#7fb6d9', '#9ad08d'][(i + j) % 4]!, -0.75 + i * 0.5 + (j - 1) * 0.04, 0.5 + j * 0.04, 0.75);
      }
      // Торт на полке.
      k.cyl(0.25, 0.25, 0.18, '#fff0f6', 0.8, 0.9, -0.95, 18).cyl(0.18, 0.18, 0.14, '#ff9fc8', 0.8, 1.08, -0.95, 18).ball(0.05, '#ff3b6b', 0.8, 1.28, -0.95);
      k.box(1.0, 0.04, 0.3, '#9b6b43', 0.8, 0.86, -0.95);
      break;
  }
}

function workshop(type: BuildingId, level: number, tint: number): THREE.Group {
  const def = buildingById(type);
  const p = def.profession!;
  const [a, b] = AWNING[p];
  const k = new Kit();
  const wall = TINTS[(tint + 3) % TINTS.length]!;
  const W = 3.0;
  const D = 2.6;
  const H = 1.7;
  // Пол, задняя и боковые стены, крыша-плита; фасад открыт.
  k.box(3.2, 0.12, 3.0, '#e4d6c3', 0, 0, 0);
  k.box(W, H, 0.14, wall, 0, 0.12, -D / 2);
  k.box(0.14, H, D, wall, -W / 2, 0.12, 0).box(0.14, H, D, wall, W / 2, 0.12, 0);
  k.cut(() => {
    k.box(W + 0.3, 0.16, D + 0.2, ROOFS[(tint + 2) % ROOFS.length]!, 0, 0.12 + H, -0.05);
    // Полосатый навес над входом.
    for (let i = 0; i < 8; i += 1) k.add(new THREE.BoxGeometry(W / 8, 0.05, 0.75), i % 2 ? b : a, T(-W / 2 + W / 16 + (i * W) / 8, 0.12 + H - 0.1, D / 2 + 0.3, 1, 1, 1, 0.42));
    for (let i = 0; i < 8; i += 1) k.ball(W / 16, i % 2 ? b : a, -W / 2 + W / 16 + (i * W) / 8, 0.12 + H - 0.28, D / 2 + 0.64, 1, 0.6, 0.4);
  });
  stuff(k, p);
  if (level >= 2) {
    // Фонари по бокам входа и цветочные ящики.
    for (const sx of [-1, 1]) k.cyl(0.03, 0.03, 1.1, '#555b66', sx * 1.45, 0.12, 1.45, 6).ball(0.1, '#fff1c0', sx * 1.45, 1.3, 1.45);
  }
  k.cut(() => {
    if (level >= 3) {
      // Второй этаж с окнами и флажками.
      k.box(W - 0.4, 1.0, D - 0.6, wall, 0, 0.28 + H, -0.3);
      k.roof(W - 0.4, D - 0.6, 0.6, a, 1.28 + H, -0.3);
      k.window(-0.6, H + 0.8, -0.3 + (D - 0.6) / 2).window(0.6, H + 0.8, -0.3 + (D - 0.6) / 2);
      for (let i = 0; i < 6; i += 1) k.cone(0.08, 0.14, i % 2 ? a : b, -1.25 + i * 0.5, H + 0.04, D / 2 + 0.66, 3);
    }
  });
  // Вывеска над навесом (тоже прячется при взгляде внутрь).
  k.cutExtra.push(sign(def.icon, a, 0, 0.12 + H + (level >= 3 ? 1.1 : 0.32), D / 2 + 0.08, level >= 2 ? 0.38 : 0.3));
  return k.build(`work_${type}`);
}

// ─── Храм, благоустройство, развлечения ────────────────────────────────

function temple(): THREE.Group {
  const k = new Kit();
  k.cyl(1.85, 1.95, 0.18, '#e8e1d4', 0, 0, 0, 32).cyl(1.6, 1.7, 0.18, '#f4efe6', 0, 0.18, 0, 32);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    k.cyl(0.12, 0.14, 1.7, '#ffffff', Math.sin(a) * 1.3, 0.36, Math.cos(a) * 1.3, 12);
  }
  k.cyl(1.55, 1.55, 0.16, '#f4efe6', 0, 2.06, 0, 32);
  k.add(new THREE.SphereGeometry(1.45, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), '#f2c14e', T(0, 2.2, 0, 1, 0.75, 1));
  k.ball(0.14, '#ffe08a', 0, 3.35, 0);
  // Алтарь с чашей огня.
  k.cyl(0.32, 0.4, 0.55, '#d9cbb8', 0, 0.36, 0, 16).cyl(0.42, 0.3, 0.18, '#c99a3a', 0, 0.91, 0, 16);
  const g = k.build('temple');
  const flame = new THREE.Group();
  flame.name = 'flame';
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 12), MAT.fire), new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 10), MAT.fireCore));
  flame.position.y = 1.35;
  g.add(flame);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0 }));
  halo.name = 'halo';
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.5;
  g.add(halo);
  return g;
}

function tree(k: Kit, x: number, z: number, s = 1, color = '#6dbb5e'): void {
  k.cyl(0.08 * s, 0.11 * s, 0.7 * s, '#8b5a3c', x, 0, z, 8).ball(0.5 * s, color, x, 0.95 * s, z).ball(0.32 * s, color, x + 0.25 * s, 0.75 * s, z + 0.15 * s);
}
function bench(k: Kit, x: number, z: number): void {
  k.box(1.0, 0.06, 0.32, '#c49a6c', x, 0.24, z).box(1.0, 0.25, 0.05, '#c49a6c', x, 0.32, z - 0.16);
  for (const sx of [-1, 1]) k.box(0.06, 0.24, 0.28, '#6b4a33', x + sx * 0.42, 0, z);
}

function amenityOrFun(type: BuildingId): THREE.Group {
  const k = new Kit();
  const name = type;
  const ground = (c = '#a8d98a'): Kit => k.box(3.4, 0.05, 3.4, c, 0, 0, 0);
  switch (type) {
    case 'garden':
      ground();
      k.box(0.7, 0.02, 3.4, '#e8d9bf', 0, 0.05, 0);
      tree(k, -1.0, -0.9, 1.1);
      tree(k, 1.05, -0.8, 1.0, '#7cc46a');
      tree(k, 1.2, 0.2, 0.7, '#5fae5a');
      bench(k, -0.95, 1.0);
      bench(k, 0.95, 1.0);
      break;
    case 'flowerbed':
      ground();
      for (const [x, z, r] of [[-0.8, -0.6, 0.6], [0.8, -0.5, 0.55], [0, 0.5, 0.65]] as const) {
        k.cyl(r, r, 0.14, '#7a5236', x, 0.05, z, 18);
        for (let i = 0; i < 9; i += 1) {
          const a = i * 2.4;
          const rr = (i / 9) * r * 0.8;
          k.cyl(0.012, 0.012, 0.18, '#3f8f3a', x + Math.sin(a) * rr, 0.19, z + Math.cos(a) * rr, 4).ball(0.07, ['#ff7eb6', '#ffd93d', '#ff6b6b', '#b28dff', '#ffffff'][i % 5]!, x + Math.sin(a) * rr, 0.4, z + Math.cos(a) * rr);
        }
      }
      break;
    case 'lanterns':
      ground('#d9cbb8');
      for (const [x, z] of [[-1.2, -1.0], [1.2, -1.0], [-1.2, 1.0], [1.2, 1.0]] as const) {
        k.cyl(0.05, 0.07, 1.4, '#3f4652', x, 0.05, z, 8).box(0.24, 0.05, 0.24, '#3f4652', x, 1.45, z);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), MAT.glow);
        l.position.set(x, 1.62, z);
        l.name = 'lamp';
        k.extra.push(l);
      }
      tree(k, 0, -1.0, 0.7, '#7cc46a');
      break;
    case 'fountain': {
      ground('#e8dcc8');
      k.cyl(1.25, 1.3, 0.3, '#c9d4de', 0, 0.05, -0.1, 28).cyl(0.18, 0.22, 0.9, '#c9d4de', 0, 0.35, -0.1, 12).cyl(0.45, 0.35, 0.12, '#c9d4de', 0, 1.1, -0.1, 18);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.04, 28), MAT.water);
      w.position.set(0, 0.3, -0.1);
      k.extra.push(w);
      const jet = new THREE.Group();
      jet.name = 'jet';
      jet.add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 16, 1, true), MAT.water));
      jet.position.set(0, 1.45, -0.1);
      jet.rotation.x = Math.PI;
      k.extra.push(jet);
      break;
    }
    case 'statue':
      ground('#e8dcc8');
      k.box(1.1, 0.7, 1.1, '#cfc6b8', 0, 0.05, -0.2);
      // Каменный кот-основатель: тельце, голова, ушки, хвост.
      k.ball(0.38, '#b9b2a6', 0, 1.05, -0.2, 1, 1.1, 0.9).ball(0.45, '#c4bdb1', 0, 1.65, -0.2, 1.12, 0.95, 1);
      k.cone(0.15, 0.28, '#b9b2a6', -0.28, 1.95, -0.2, 8).cone(0.15, 0.28, '#b9b2a6', 0.28, 1.95, -0.2, 8);
      k.box(0.6, 0.06, 0.02, '#c99a3a', 0, 0.4, 0.36);
      break;
    case 'playground':
      ground('#f2d9a6');
      // Горка: лесенка, площадка, скат.
      k.box(0.06, 1.0, 0.06, '#ff6b6b', -1.25, 0.05, -0.6).box(0.06, 1.0, 0.06, '#ff6b6b', -0.85, 0.05, -0.6);
      k.box(0.5, 0.06, 0.4, '#ffd93d', -1.05, 1.0, -0.6);
      k.box(0.45, 0.05, 1.3, '#5c8fd6', -1.05, 0.55, 0.0, -0.75);
      // Качели: рама и сиденья на цепях (сиденья качаются).
      k.box(0.08, 1.3, 0.08, '#7cbf6b', 0.3, 0.05, -0.35).box(0.08, 1.3, 0.08, '#7cbf6b', 1.4, 0.05, -0.35).box(1.2, 0.08, 0.08, '#7cbf6b', 0.85, 1.32, -0.35);
      for (const x of [0.55, 1.15]) {
        const sw = new THREE.Group();
        sw.name = 'swing';
        sw.position.set(x, 1.32, -0.35);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: '#ff8fc1' }));
        seat.position.y = -1.0;
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), new THREE.MeshStandardMaterial({ color: '#777' }));
        ch.position.y = -0.5;
        sw.add(seat, ch);
        k.extra.push(sw);
      }
      // Песочница.
      k.box(1.0, 0.12, 0.8, '#c49a6c', -0.2, 0.05, 1.05).box(0.9, 0.04, 0.7, '#f7e3b0', -0.2, 0.13, 1.05);
      break;
    case 'cafe':
      ground('#e8dcc8');
      k.box(2.8, 1.5, 1.0, '#fff1d6', 0, 0.05, -1.1).roof(2.8, 1.0, 0.5, '#d95f8b', 1.55, -1.1);
      k.window(-0.8, 0.85, -0.6).window(0.8, 0.85, -0.6);
      k.box(0.4, 0.7, 0.05, '#8b5a3c', 0, 0.05, -0.58);
      for (const [x, z] of [[-0.85, 0.55], [0.85, 0.55], [0, -0.65]] as const) {
        k.cyl(0.28, 0.28, 0.05, '#ffffff', x, 0.42, z, 16).cyl(0.03, 0.03, 0.42, '#555', x, 0.05, z, 6);
        if (z > 0) k.cyl(0.02, 0.02, 1.2, '#888', x, 0.42, z, 6).cone(0.55, 0.28, x < 0 ? '#ff8fc1' : '#7fb6d9', x, 1.5, z, 12);
        for (const sx of [-1, 1]) k.cyl(0.13, 0.13, 0.05, '#c49a6c', x + sx * 0.4, 0.24, z, 12).cyl(0.025, 0.025, 0.22, '#555', x + sx * 0.4, 0.05, z, 6);
      }
      break;
    case 'pond': {
      ground();
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.04, 32), MAT.water);
      w.scale.set(1.1, 1, 0.8);
      w.position.set(0, 0.06, -0.55);
      k.extra.push(w);
      k.cyl(1.5, 1.5, 0.05, '#c4b49a', 0, 0.02, -0.55, 32);
      // Мостки.
      k.box(1.9, 0.08, 0.5, '#b5835a', 0, 0.12, 0.25);
      for (const x of [-0.85, 0.85]) k.box(0.08, 0.2, 0.08, '#8b5a3c', x, 0, 0.45);
      for (let i = 0; i < 6; i += 1) k.cyl(0.015, 0.02, 0.5, '#5f9e4f', -1.3 + (i % 3) * 0.1, 0.05, -1.0 + Math.floor(i / 3) * 0.15, 4);
      k.cyl(0.18, 0.18, 0.01, '#7cc46a', 0.7, 0.09, -0.9, 12).cyl(0.14, 0.14, 0.01, '#7cc46a', 0.3, 0.09, -1.2, 12);
      break;
    }
    case 'cattower':
      ground('#e8dcc8');
      k.cyl(0.12, 0.12, 2.2, '#e2c08f', 0, 0.05, -0.1, 12);
      for (const [x, y, z, r] of [[-0.2, 0.7, 0.25, 0.42], [0.3, 1.3, -0.05, 0.38], [-0.25, 1.9, -0.2, 0.42]] as const) k.cyl(r, r, 0.08, '#c77dd6', x, y - 0.08, z, 18).cyl(r * 0.95, r * 0.95, 0.03, '#e8c2f2', x, y, z, 18);
      k.box(0.6, 0.45, 0.6, '#c77dd6', 0.75, 0.05, -0.6);
      k.add(new THREE.CircleGeometry(0.16, 14), '#5a3b66', T(0.75, 0.25, -0.29));
      k.ball(0.07, '#ff6b6b', 0.4, 1.0, 0.35);
      break;
    case 'market':
      ground('#e8dcc8');
      for (const [x, c] of [[-1.05, '#ff6b6b'], [0, '#5c8fd6'], [1.05, '#7cbf6b']] as const) {
        k.box(0.9, 0.55, 0.5, '#c49a6c', x, 0.05, 0.4);
        for (const sx of [-1, 1]) k.box(0.05, 1.2, 0.05, '#8b5a3c', x + sx * 0.42, 0.05, 0.15);
        for (let i = 0; i < 4; i += 1) k.add(new THREE.BoxGeometry(0.24, 0.04, 0.7), i % 2 ? '#ffffff' : c, T(x - 0.33 + i * 0.22, 1.3, 0.35, 1, 1, 1, 0.3));
        for (let i = 0; i < 3; i += 1) k.ball(0.07, ['#ff7eb6', '#ffd93d', '#c77dd6', '#7fb6d9'][(i + Math.round(x * 3) + 4) % 4]!, x - 0.25 + i * 0.25, 0.68, 0.45);
      }
      k.box(3.0, 1.0, 0.5, '#f0d7b8', 0, 0.05, -1.2);
      break;
    case 'carousel': {
      ground('#f2d9a6');
      k.cyl(1.5, 1.55, 0.18, '#ffd6e8', 0, 0.05, 0, 32);
      const top = new THREE.Group();
      top.name = 'spin';
      top.position.y = 0.23;
      const tk = new Kit();
      tk.cyl(0.1, 0.1, 1.9, '#ffe08a', 0, 0, 0, 10);
      tk.cone(1.65, 0.8, '#ff6b9d', 0, 1.9, 0, 16).ball(0.12, '#ffe08a', 0, 2.75, 0);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.sin(a) * 1.15;
        const z = Math.cos(a) * 1.15;
        tk.cyl(0.02, 0.02, 1.9, '#ffffff', x, 0, z, 6);
        // Рыбка-лошадка.
        tk.ball(0.18, ['#7fb6d9', '#ffd93d', '#9ad08d'][i % 3]!, x, 0.55, z, 1, 0.8, 1.5);
        tk.cone(0.12, 0.2, ['#7fb6d9', '#ffd93d', '#9ad08d'][i % 3]!, x - Math.cos(a) * 0.3, 0.55, z + Math.sin(a) * 0.3, 4);
      }
      const tg = tk.build('carouselTop');
      top.add(tg);
      k.extra.push(top);
      break;
    }
    case 'cinema':
      ground('#e8dcc8');
      k.box(3.0, 2.2, 2.4, '#5b4b8a', 0, 0.05, -0.4);
      k.box(3.2, 0.25, 2.6, '#3f3366', 0, 2.25, -0.4);
      k.box(2.4, 0.5, 0.1, '#ffe08a', 0, 1.55, 0.82);
      k.box(1.0, 1.0, 0.05, '#2a2340', 0, 0.05, 0.81);
      k.box(0.6, 0.85, 0.05, '#ff6b6b', -1.0, 0.4, 0.82).box(0.6, 0.85, 0.05, '#7fb6d9', 1.0, 0.4, 0.82);
      for (let i = 0; i < 10; i += 1) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), MAT.glow);
        l.position.set(-1.1 + i * 0.245, 1.86, 0.88);
        k.extra.push(l);
      }
      break;
    default:
      ground();
  }
  const g = k.build(name);
  const d = buildingById(type);
  if (d.kind === 'fun' && type !== 'cinema') g.add(sign(d.icon, '#ffffff', 1.45, 1.1, 1.5, 0.22));
  if (type === 'cinema') g.add(sign(d.icon, '#ffe08a', 0, 1.55, 0.88, 0.22));
  return g;
}

// ─── Пепелище и огонь ──────────────────────────────────────────────────

function ash(): THREE.Group {
  const k = new Kit();
  k.box(2.9, 0.05, 2.7, '#6b6660', 0, 0, 0.1);
  k.ball(0.75, '#57524d', -0.2, 0.0, -0.2, 1.3, 0.45, 1.1).ball(0.5, '#6d6863', 0.6, 0.0, 0.3, 1.2, 0.4, 1);
  k.box(1.4, 0.1, 0.12, '#2b2522', -0.1, 0.25, -0.3, 0, 0.4, 0.2).box(1.1, 0.1, 0.12, '#2b2522', 0.2, 0.3, 0.1, 0, -0.8, -0.15);
  const g = k.build('ash');
  for (let i = 0; i < 6; i += 1) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), MAT.ember);
    e.position.set(-0.6 + (i % 3) * 0.5, 0.3, -0.4 + Math.floor(i / 3) * 0.5);
    e.name = 'ember';
    g.add(e);
  }
  return g;
}

/** Языки пламени над горящим домом (анимируются по имени «fire»). */
export function fireModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fire';
  for (let i = 0; i < 7; i += 1) {
    const f = new THREE.Group();
    const a = (i / 7) * Math.PI * 2;
    f.position.set(Math.sin(a) * 0.7, 0.4 + (i % 3) * 0.3, Math.cos(a) * 0.6 - 0.2);
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 10), MAT.fire));
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 8), MAT.fireCore);
    core.position.y = -0.15;
    f.add(core);
    g.add(f);
  }
  for (let i = 0; i < 6; i += 1) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), MAT.smoke);
    s.name = 'smoke';
    s.userData.k = i / 6;
    g.add(s);
  }
  return g;
}

/** Модель здания по типу, уровню и цвету. */
export function buildingModel(b: Pick<Building, 'kind' | 'type' | 'level' | 'tint'>): THREE.Group {
  if (b.kind === 'house') return house(Math.max(1, Math.min(4, b.level)), b.tint);
  if (b.kind === 'workshop') return workshop(b.type, Math.max(1, Math.min(3, b.level)), b.tint);
  if (b.kind === 'temple') return temple();
  if (b.kind === 'ash') return ash();
  return amenityOrFun(b.type);
}

export const modelKey = (b: Pick<Building, 'kind' | 'type' | 'level' | 'tint'>): string => `${b.type}|${b.level}|${b.tint}`;

