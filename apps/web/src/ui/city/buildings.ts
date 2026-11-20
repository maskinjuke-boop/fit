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
  /** Цветные лампочки гирлянд (светятся вместе с фонарями). */
  bulb: new THREE.MeshStandardMaterial({ color: '#ffd6e8', emissive: new THREE.Color('#ff7eb6'), emissiveIntensity: 0.2 }),
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
  /** Мелкие детали без контура (черепица, обшивка, плитка, переплёты) — иначе контуры сливаются в чёрные полосы. */
  fineParts: G[] = [];
  cutFineParts: G[] = [];
  private cutting = false;
  private fining = false;
  /** Общий сдвиг/поворот для группы деталей (см. at). */
  private base: THREE.Matrix4 | null = null;
  private M(m: THREE.Matrix4): THREE.Matrix4 {
    return this.base ? this.base.clone().multiply(m) : m;
  }
  add(geo: G, color: string, m: THREE.Matrix4): this {
    const list = this.fining ? (this.cutting ? this.cutFineParts : this.fineParts) : this.cutting ? this.cutParts : this.parts;
    list.push(paint(geo, color, this.M(m)));
    return this;
  }
  /** Детали внутри fn рисуются без контура. */
  fine(fn: () => void): this {
    const prev = this.fining;
    this.fining = true;
    fn();
    this.fining = prev;
    return this;
  }
  /** Светящаяся или особая деталь отдельной сеткой (лампа, огонь в очаге). */
  mesh(geo: G, mat: THREE.Material, m: THREE.Matrix4): this {
    const o = new THREE.Mesh(geo.applyMatrix4(this.M(m)), mat);
    (this.cutting ? this.cutExtra : this.extra).push(o);
    return this;
  }
  /** Всё, что добавлено внутри fn, — съёмная часть (крыша, передняя стена, навес). */
  cut(fn: () => void): this {
    const prev = this.cutting;
    this.cutting = true;
    fn();
    this.cutting = prev;
    return this;
  }
  /** Детали внутри fn ставятся в системе m (например, повёрнутая крыша). */
  at(m: THREE.Matrix4, fn: () => void): this {
    const prev = this.base;
    this.base = prev ? prev.clone().multiply(m) : m;
    fn();
    this.base = prev;
    return this;
  }
  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, T(x, y + h / 2, z, 1, 1, 1, rx, ry, rz));
  }
  /** Коробка по центру (а не по низу). */
  cbox(w: number, h: number, d: number, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, T(x, y, z, 1, 1, 1, rx, ry, rz));
  }
  ball(r: number, color: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx): this {
    const [a, b] = r < 0.06 ? [6, 4] : r < 0.16 ? [8, 6] : r < 0.3 ? [10, 7] : [14, 9];
    return this.add(new THREE.SphereGeometry(r, a, b), color, T(x, y, z, sx, sy, sz));
  }
  cyl(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, seg = 0, rx = 0, rz = 0): this {
    const n = seg || (rt + rb < 0.14 ? 8 : rt + rb < 0.5 ? 12 : 16);
    return this.add(new THREE.CylinderGeometry(rt, rb, h, n), color, T(x, y + h / 2, z, 1, 1, 1, rx, 0, rz));
  }
  /** Цилиндр, лежащий вдоль оси x (бревно, рулон, скалка). */
  log(r: number, len: number, color: string, x: number, y: number, z: number, ry = 0): this {
    return this.add(new THREE.CylinderGeometry(r, r, len, r < 0.06 ? 8 : 12), color, T(x, y, z, 1, 1, 1, 0, ry, Math.PI / 2));
  }
  cone(r: number, h: number, color: string, x: number, y: number, z: number, seg = 0): this {
    return this.add(new THREE.ConeGeometry(r, h, seg || (r < 0.1 ? 8 : 16)), color, T(x, y + h / 2, z));
  }
  ring(r: number, tube: number, color: string, x: number, y: number, z: number, rx = 0, ry = 0): this {
    return this.add(new THREE.TorusGeometry(r, tube, 4, r < 0.1 ? 10 : 16), color, T(x, y, z, 1, 1, 1, rx, ry, 0));
  }
  /** Двускатная крыша (простая, без черепицы). */
  roof(w: number, d: number, h: number, color: string, y: number, z = 0): this {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.15, 0);
    shape.lineTo(0, h);
    shape.lineTo(w / 2 + 0.15, 0);
    shape.lineTo(-w / 2 - 0.15, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.3, bevelEnabled: false });
    return this.add(geo, color, T(0, y, z - d / 2 - 0.15));
  }
  /**
   * Черепичная двускатная крыша над стенами w×d (конёк вдоль z, карниз на высоте 0 —
   * ставится через at): подложка, ряды черепицы со ступенькой, конёк, наличники и фронтоны цвета стен.
   */
  shingles(w: number, d: number, h: number, color: string, gable: string, rows = 5): this {
    const a = w / 2 + 0.16;
    const th = Math.atan2(h, a);
    const L = Math.hypot(a, h);
    const len = d + 0.32;
    const segs = Math.max(3, Math.round(len / 0.3));
    const sl = len / segs;
    for (const side of [-1, 1]) {
      const at = (s: number, off: number): [number, number] => [side * (a - s * Math.cos(th)) - side * Math.sin(th) * off * -1, s * Math.sin(th) + Math.cos(th) * off];
      // Подложка.
      const [ux, uy] = at(L / 2, 0.02);
      this.cbox(L + 0.02, 0.04, len, shade(color, 0.7), ux, uy, 0, 0, 0, -side * th);
      this.fining = true;
      for (let i = 0; i < rows; i += 1) {
        const [x, y] = at(((i + 0.5) * L) / rows, 0.065);
        for (let j = 0; j < segs; j += 1) {
          const c = (i + j) % 2 ? shade(color, 0.9) : color;
          const zz = -len / 2 + (j + 0.5) * sl + (i % 2 ? sl * 0.25 : -sl * 0.25) * 0;
          this.cbox(L / rows + 0.05, 0.035, sl - 0.02, c, x, y, zz, 0, 0, -side * (th - 0.07));
        }
      }
      this.fining = false;
      // Наличники по скатам спереди и сзади.
      for (const ez of [-1, 1]) {
        const [fx, fy] = at(L / 2, 0.06);
        this.cbox(L + 0.06, 0.07, 0.06, '#fff7ec', fx, fy, ez * (len / 2 + 0.01), 0, 0, -side * th);
      }
    }
    // Конёк.
    this.log(0.065, len + 0.08, shade(color, 0.75), 0, h + 0.05, 0, Math.PI / 2);
    // Фронтоны (треугольники стены под скатами).
    const yw = h * (1 - w / 2 / a);
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0);
    sh.lineTo(w / 2, 0);
    sh.lineTo(w / 2, yw);
    sh.lineTo(0, h - 0.03);
    sh.lineTo(-w / 2, yw);
    sh.lineTo(-w / 2, 0);
    for (const ez of [-1, 1]) this.add(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }), gable, T(0, 0, ez * (d / 2) - 0.03));
    return this;
  }
  /**
   * Окно на фасаде (смотрит на +z): стекло, рама с переплётом, подоконник; по желанию — ставни.
   * Через at — на любой стене.
   */
  window(x: number, y: number, z: number, w = 0.34, h = 0.36, round = false, shutters?: string, frame = '#ffffff'): this {
    const g = round ? new THREE.CircleGeometry(w / 2, 18) : new THREE.PlaneGeometry(w, h);
    (this.cutting ? this.cutWins : this.wins).push(g.applyMatrix4(this.M(T(x, y, z + 0.012))));
    if (round) {
      this.ring(w / 2, 0.035, frame, x, y, z + 0.015);
      this.fine(() => this.cbox(0.025, w, 0.03, frame, x, y, z + 0.02).cbox(w, 0.025, 0.03, frame, x, y, z + 0.02));
      return this;
    }
    this.cbox(w + 0.08, 0.045, 0.05, frame, x, y + h / 2 + 0.02, z + 0.02).cbox(0.045, h, 0.05, frame, x - w / 2 - 0.02, y, z + 0.02).cbox(0.045, h, 0.05, frame, x + w / 2 + 0.02, y, z + 0.02);
    this.fine(() => this.cbox(0.025, h, 0.03, frame, x, y, z + 0.02).cbox(w, 0.025, 0.03, frame, x, y + 0.02, z + 0.02));
    this.cbox(w + 0.14, 0.035, 0.1, frame, x, y - h / 2 - 0.03, z + 0.04);
    if (shutters)
      for (const sx of [-1, 1]) {
        const cx = x + sx * (w / 2 + w * 0.27 + 0.03);
        this.cbox(w * 0.5, h + 0.03, 0.025, shutters, cx, y, z + 0.015);
        this.fine(() => {
          for (const dy of [-0.25, 0, 0.25]) this.cbox(w * 0.42, 0.018, 0.03, shade(shutters, 0.8), cx, y + dy * h, z + 0.02);
        });
      }
    return this;
  }
  /** Окно на боковой стене (sx = -1 — левая, 1 — правая). */
  sideWindow(x: number, y: number, z: number, sx: number, w = 0.32, h = 0.34, shutters?: string, frame?: string): this {
    return this.at(T(x, y, z, 1, 1, 1, 0, (sx * Math.PI) / 2, 0), () => this.window(0, 0, 0, w, h, false, shutters, frame));
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
    if (this.fineParts.length) {
      const m = new THREE.Mesh(mergeGeometries(this.fineParts)!, MAT.solid);
      m.receiveShadow = true;
      m.userData.noOutline = true;
      g.add(m);
    }
    if (this.wins.length) g.add(winMesh(this.wins));
    for (const e of this.extra) g.add(e);
    if (this.cutParts.length || this.cutFineParts.length || this.cutWins.length || this.cutExtra.length) {
      // Своя копия материала: прозрачность у каждого здания своя.
      const cut = new THREE.Group();
      cut.name = 'cut';
      const mat = MAT.solid.clone();
      for (const [list, fine] of [[this.cutParts, false], [this.cutFineParts, true]] as const) {
        if (!list.length) continue;
        const m = new THREE.Mesh(mergeGeometries(list)!, mat);
        m.name = 'cutShell';
        m.castShadow = !fine;
        m.receiveShadow = true;
        if (fine) m.userData.noOutline = true;
        cut.add(m);
      }
      if (this.cutWins.length) cut.add(winMesh(this.cutWins));
      for (const e of this.cutExtra) cut.add(e);
      g.add(cut);
    }
    addOutlines(g, { thickness: 0.018, color: '#4a3631', maxFlat: 6 });
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

/** Пол чуть выше земли — всё внутри стоит на нём. */
const FLOOR = 0.16;

/** Куст из трёх шариков. */
function bush(k: Kit, x: number, z: number, s = 1, color = '#62b35c'): void {
  k.ball(0.2 * s, color, x, 0.16 * s, z).ball(0.15 * s, shade(color, 1.1), x + 0.14 * s, 0.13 * s, z + 0.05 * s).ball(0.14 * s, shade(color, 0.9), x - 0.13 * s, 0.12 * s, z + 0.04 * s);
}

/** Фонарь на столбике с тёплым светом (ночью светится). */
function lampPost(k: Kit, x: number, z: number, hgt = 0.9): void {
  k.cyl(0.025, 0.035, hgt, '#4a4f5a', x, 0.03, z).box(0.14, 0.03, 0.14, '#4a4f5a', x, hgt + 0.03, z).cone(0.11, 0.08, '#4a4f5a', x, hgt + 0.2, z, 4);
  k.mesh(new THREE.SphereGeometry(0.065, 10, 8), MAT.glow, T(x, hgt + 0.12, z));
}

function house(level: number, tint: number): THREE.Group {
  const k = new Kit();
  const wall = TINTS[tint % TINTS.length]!;
  const roof = ROOFS[tint % ROOFS.length]!;
  const trim = ['#ffffff', '#fff3e0', '#8b5a3c', '#ffffff', '#6b4a33', '#fff7ec', '#ffffff', '#9b6b43'][tint % 8]!;
  const shutter = shade(roof, 0.85);
  const accent = ['#7fb6d9', '#ff9fb8', '#9ad08d', '#ffcf6b', '#c7a4ff'][tint % 5]!;
  const w = [1.6, 2.0, 2.2, 2.4][level - 1]!;
  const d = [1.3, 1.6, 1.8, 1.9][level - 1]!;
  const h = [1.05, 1.25, 2.1, 2.2][level - 1]!;
  const z0 = -0.2;
  const fz = z0 + d / 2;
  const bz = z0 - d / 2;
  const t = 0.08;
  const top = 0.12 + h;
  const rh = 0.55 + level * 0.08;

  // ── Участок: газон, дорожка из плиток, кусты, клумба.
  k.box(2.9, 0.06, 2.7, '#a8d98a', 0, 0, 0.15);
  for (let i = 0; i < 4; i += 1) k.cyl(0.12, 0.13, 0.025, i % 2 ? '#d9d2c3' : '#e6dfd0', i % 2 ? 0.07 : -0.05, 0.05, fz + 0.42 + i * 0.3);
  bush(k, -w / 2 - 0.28, fz - 0.05, 1, '#5fae5a');
  bush(k, w / 2 + 0.28, fz - 0.25, 0.9, '#6dbb5e');
  if (level >= 2) {
    // Клумба вдоль правой стены и дерево за домом.
    k.box(0.28, 0.06, d * 0.7, '#8b5a3c', w / 2 + 0.25, 0.06, z0 - 0.15);
    for (let i = 0; i < 4; i += 1) k.ball(0.055, ['#ff7eb6', '#ffd93d', '#ff6b6b', '#b28dff'][(i + tint) % 4]!, w / 2 + 0.25, 0.17, z0 - 0.15 - d * 0.3 + i * (d * 0.2));
    k.cyl(0.06, 0.08, 0.6, '#8b5a3c', 1.15, 0.06, -1.15).ball(0.38, '#5aa856', 1.15, 0.9, -1.15).ball(0.26, '#68b863', 1.35, 0.72, -1.0);
  }
  if (level >= 3) lampPost(k, -1.35, 0.95);

  // ── Фундамент из камней, пол из досок.
  k.box(w + 0.12, 0.12, d + 0.12, '#cfc6b8', 0, 0.02, z0);
  k.fine(() => { for (let x = -w / 2 + 0.1; x < w / 2; x += 0.2) k.box(0.17, 0.07, 0.03, Math.round(x * 5) % 2 ? '#b9b0a2' : '#ddd5c7', x, 0.04, fz + 0.075); });
  k.fine(() => { for (const sx of [-1, 1]) for (let z = bz + 0.1; z < fz; z += 0.2) k.box(0.03, 0.07, 0.17, Math.round(z * 5) % 2 ? '#b9b0a2' : '#ddd5c7', sx * (w / 2 + 0.075), 0.04, z); });
  k.box(w - 0.04, 0.02, d - 0.04, '#d8b07e', 0, 0.14, z0);
  k.fine(() => { for (let i = 1; i < 7; i += 1) k.box(0.012, 0.005, d - 0.06, '#c49a6c', -w / 2 + (i * w) / 7, FLOOR, z0); });

  // ── Задняя и боковые стены: обшивка, углы, окна со ставнями.
  k.box(w, h, t, wall, 0, 0.12, bz + t / 2);
  k.box(t, h, d, wall, -w / 2 + t / 2, 0.12, z0).box(t, h, d, wall, w / 2 - t / 2, 0.12, z0);
  const siding = shade(wall, 0.9);
  k.fine(() => { for (let y = 0.3; y < top - 0.05; y += 0.17) {
    k.box(0.012, 0.022, d, siding, -w / 2 - 0.006, y, z0).box(0.012, 0.022, d, siding, w / 2 + 0.006, y, z0);
    k.box(w, 0.022, 0.012, siding, 0, y, bz - 0.006);
  } });
  for (const sx of [-1, 1]) k.box(0.09, h, 0.09, trim, sx * w / 2, 0.12, bz);
  // Карниз-пояс между этажами.
  if (level >= 3) {
    k.box(0.04, 0.06, d + 0.04, trim, -w / 2 - 0.02, 1.2, z0).box(0.04, 0.06, d + 0.04, trim, w / 2 + 0.02, 1.2, z0);
  }
  for (const sx of [-1, 1]) {
    k.sideWindow(sx * (w / 2 + 0.005), 0.66, z0 + 0.05, sx, 0.3, 0.32, level >= 2 ? shutter : undefined);
    if (level >= 3) k.sideWindow(sx * (w / 2 + 0.005), 1.62, z0 + 0.05, sx, 0.3, 0.32, shutter);
  }
  // Башенка у особняка — сбоку, снаружи стены.
  if (level >= 4) {
    const tx = -w / 2 - 0.3;
    k.cyl(0.42, 0.42, 2.5, wall, tx, 0.12, -0.55, 20);
    k.fine(() => { for (let y = 0.4; y < 2.5; y += 0.25) k.ring(0.425, 0.012, siding, tx, y, -0.55, Math.PI / 2); });
    k.cyl(0.47, 0.47, 0.08, trim, tx, 2.6, -0.55, 20).cone(0.58, 0.9, roof, tx, 2.66, -0.55, 20);
    k.window(tx, 1.6, -0.12, 0.26, 0.26, true, undefined, trim).window(tx, 0.8, -0.12, 0.24, 0.3, false, undefined, trim);
    k.cyl(0.015, 0.015, 0.5, '#555555', tx, 3.5, -0.55, 6).box(0.25, 0.15, 0.02, '#ff5d73', tx + 0.13, 3.82, -0.55);
    // Живая изгородь по бокам двора.
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i += 1) k.ball(0.17, '#4f9d4c', sx * 1.32, 0.17, 0.65 + i * 0.32, 1, 0.9, 1.1);
  }

  // ── Внутри: картинка над кроватью, ночник, кухонный уголок, коврик, игрушки.
  const wallIn = bz + t;
  k.box(w - 2 * t, 0.05, 0.01, shade(wall, 0.86), 0, 0.62, wallIn + 0.005);
  k.box(0.3, 0.22, 0.02, '#ffffff', -0.4, 0.74, wallIn + 0.01).box(0.24, 0.16, 0.025, accent, -0.4, 0.77, wallIn + 0.012).ball(0.045, '#ffd93d', -0.34, 0.88, wallIn + 0.03, 1, 1, 0.3);
  // Ночник на тумбочке (ночью светится).
  k.box(0.15, 0.2, 0.14, '#b5835a', -0.1, FLOOR, wallIn + 0.09).cyl(0.025, 0.035, 0.08, '#8b5a3c', -0.1, FLOOR + 0.2, wallIn + 0.09);
  k.cone(0.065, 0.07, accent, -0.1, FLOOR + 0.3, wallIn + 0.09, 10);
  k.mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.glow, T(-0.1, FLOOR + 0.3, wallIn + 0.09));
  // Кухонный уголок: шкафчик с плитой, кастрюлька, полка с банками.
  const kx = level >= 4 ? 0.36 : 0.46;
  k.box(0.44, 0.3, 0.22, '#f1dcc0', kx, FLOOR, wallIn + 0.11).box(0.48, 0.03, 0.25, '#fff7ec', kx, FLOOR + 0.3, wallIn + 0.12);
  k.box(0.18, 0.12, 0.01, '#d9bf9d', kx - 0.11, FLOOR + 0.08, wallIn + 0.225).box(0.18, 0.12, 0.01, '#d9bf9d', kx + 0.11, FLOOR + 0.08, wallIn + 0.225);
  k.cyl(0.045, 0.045, 0.01, '#3a3a3a', kx - 0.1, FLOOR + 0.33, wallIn + 0.12).cyl(0.045, 0.045, 0.01, '#3a3a3a', kx + 0.1, FLOOR + 0.33, wallIn + 0.12);
  k.cyl(0.06, 0.055, 0.07, '#9aa3ad', kx + 0.1, FLOOR + 0.34, wallIn + 0.12).box(0.1, 0.012, 0.012, '#6b6f78', kx + 0.18, FLOOR + 0.39, wallIn + 0.12);
  k.box(0.46, 0.025, 0.12, '#9b6b43', kx, 0.72, wallIn + 0.06);
  for (let i = 0; i < 4; i += 1) k.cyl(0.035, 0.035, 0.09, ['#ffcf6b', '#ff9fb8', '#9ad08d', '#7fb6d9'][(i + tint) % 4]!, kx - 0.16 + i * 0.105, 0.745, wallIn + 0.06);
  // Коврик и клубок.
  k.cyl(0.36, 0.36, 0.012, '#f6c6d6', 0.05, FLOOR, z0 + 0.15, 24).cyl(0.26, 0.26, 0.014, '#fde4ec', 0.05, FLOOR, z0 + 0.15, 24);
  k.ball(0.05, accent, -0.08, FLOOR + 0.05, z0 + 0.32).ring(0.05, 0.008, shade(accent, 0.8), -0.08, FLOOR + 0.05, z0 + 0.32, 0.6, 0.4);
  // Кровати — по жильцам; подушка у стены, одеяло свёрнуто в ногах.
  const blankets = ['#7fb6d9', '#ff9fb8', '#9ad08d'];
  HOUSE_BEDS.slice(0, bedsOf(level)).forEach((p, i) => {
    const mid = p.z + BED.len / 2;
    k.box(BED.w + 0.06, 0.08, BED.len, '#9b6b43', p.x, FLOOR, mid);
    k.box(BED.w + 0.06, 0.34, 0.05, '#9b6b43', p.x, FLOOR, p.z + 0.025).ball(0.035, '#9b6b43', p.x - BED.w / 2, 0.52, p.z + 0.025).ball(0.035, '#9b6b43', p.x + BED.w / 2, 0.52, p.z + 0.025);
    k.box(BED.w + 0.06, 0.16, 0.04, '#9b6b43', p.x, FLOOR, p.z + BED.len - 0.02);
    k.box(BED.w, 0.08, BED.len - 0.06, '#ffffff', p.x, 0.24, mid + 0.02);
    k.ball(0.1, '#fffaf0', p.x, BED.top + 0.03, p.z + 0.14, 1.5, 0.45, 0.85);
    k.box(BED.w + 0.02, 0.07, 0.17, blankets[(tint + i) % 3]!, p.x, BED.top - 0.02, p.z + BED.len - 0.12);
    k.box(BED.w + 0.025, 0.02, 0.04, '#ffffff', p.x, BED.top + 0.03, p.z + BED.len - 0.12);
  });
  // Столик с миской рыбки и подушки вокруг.
  const tb = HOUSE_TABLE;
  k.cyl(0.035, 0.05, tb.h, '#9b6b43', tb.x, FLOOR, tb.z, 8).cyl(tb.r, tb.r, 0.03, '#e8c39a', tb.x, FLOOR + tb.h, tb.z, 18);
  k.cyl(0.06, 0.045, 0.04, '#7fb6d9', tb.x, FLOOR + 0.03 + tb.h, tb.z, 12).ball(0.035, '#ff9a5a', tb.x, FLOOR + 0.08 + tb.h, tb.z, 1.5, 0.6, 0.8);
  k.cyl(0.035, 0.03, 0.05, '#ffffff', tb.x + 0.1, FLOOR + 0.03 + tb.h, tb.z - 0.06, 8);
  for (const sp of [[tb.x - 0.3, tb.z + 0.02], [tb.x + 0.3, tb.z + 0.02], [tb.x, tb.z + 0.32]] as const) k.cyl(0.11, 0.12, 0.05, '#ff9fb8', sp[0], FLOOR - 0.01, sp[1], 14);
  // Горшок с цветком: в домике — слева у двери, дальше — справа.
  const plantX = level === 1 ? -w / 2 + 0.2 : w / 2 - 0.2;
  if (level <= 3) k.cyl(0.07, 0.055, 0.12, '#c96f4a', plantX, FLOOR, fz - 0.2, 10).ball(0.1, '#6dbb5e', plantX, FLOOR + 0.2, fz - 0.2).ball(0.04, '#ff7eb6', plantX + 0.04, FLOOR + 0.28, fz - 0.17);
  // Шкаф у левой стены (с корзинкой наверху).
  if (level >= 2) {
    const wx = -w / 2 + t + 0.12;
    const wz = fz - 0.34;
    k.box(0.22, 0.75, 0.42, '#b5835a', wx, FLOOR, wz).box(0.01, 0.68, 0.005, '#8b5a3c', wx + 0.112, FLOOR + 0.03, wz);
    k.ball(0.022, '#f2c94c', wx + 0.115, FLOOR + 0.42, wz - 0.04).ball(0.022, '#f2c94c', wx + 0.115, FLOOR + 0.42, wz + 0.04);
    k.cyl(0.11, 0.09, 0.07, '#d9b48a', wx, FLOOR + 0.75, wz, 10).ball(0.07, '#ffffff', wx, FLOOR + 0.83, wz, 1.2, 0.4, 1.2);
  }
  // Камин с огнём и кресло (уровни 3–4).
  if (level >= 3) {
    const cxw = w / 2 - t - 0.1;
    const cz = level >= 4 ? 0.25 : -0.55;
    k.box(0.2, 0.56, 0.52, '#c9b8a6', cxw, FLOOR, cz).box(0.24, 0.05, 0.6, '#8b5a3c', cxw - 0.01, FLOOR + 0.56, cz);
    k.box(0.02, 0.26, 0.3, '#3a2a26', cxw - 0.1, FLOOR + 0.05, cz).box(0.08, h - 0.6, 0.3, '#c9b8a6', cxw + 0.03, FLOOR + 0.61, cz);
    k.log(0.03, 0.22, '#8b5a3c', cxw - 0.13, FLOOR + 0.05, cz, Math.PI / 2);
    k.mesh(new THREE.ConeGeometry(0.07, 0.17, 8), MAT.fire, T(cxw - 0.13, FLOOR + 0.15, cz - 0.04));
    k.mesh(new THREE.ConeGeometry(0.05, 0.12, 8), MAT.fireCore, T(cxw - 0.13, FLOOR + 0.13, cz + 0.05));
    for (const dz of [-0.2, 0.2]) k.cyl(0.02, 0.02, 0.08, '#fff7ec', cxw - 0.03, FLOOR + 0.61, cz + dz, 6);
    // Кресло перед камином.
    const ax = cxw - 0.42;
    const az = level >= 4 ? 0.42 : -0.5;
    k.box(0.3, 0.14, 0.3, accent, ax, FLOOR, az).box(0.3, 0.06, 0.28, shade(accent, 1.1), ax, FLOOR + 0.14, az);
    k.box(0.06, 0.3, 0.3, shade(accent, 0.85), ax + 0.16, FLOOR, az).box(0.06, 0.2, 0.3, shade(accent, 0.85), ax - 0.15, FLOOR, az).box(0.06, 0.2, 0.3, shade(accent, 0.85), ax + 0.15 - 0.3, FLOOR, az);
  }
  // Когтеточка-домик в особняке.
  if (level >= 4) {
    k.box(0.32, 0.03, 0.32, '#d9b48a', -0.62, FLOOR, 0.33).cyl(0.045, 0.045, 0.6, '#e8d5b0', -0.62, FLOOR + 0.03, 0.33, 8);
    for (let y = 0.1; y < 0.6; y += 0.06) k.ring(0.047, 0.007, '#c9a77a', -0.62, FLOOR + y, 0.33, Math.PI / 2);
    k.cyl(0.15, 0.15, 0.04, '#d9b48a', -0.62, FLOOR + 0.63, 0.33, 14).ball(0.05, '#ff9fb8', -0.55, FLOOR + 0.54, 0.4);
  }

  // ── Съёмная часть (вид внутрь): фасад с дверью и окнами, крыша, труба.
  k.cut(() => {
    k.box(w, h, t, wall, 0, 0.12, fz - t / 2);
    k.fine(() => { for (let y = 0.3; y < top - 0.05; y += 0.17) k.box(w, 0.022, 0.012, siding, 0, y, fz + 0.006); });
    for (const sx of [-1, 1]) k.box(0.09, h, 0.09, trim, sx * w / 2, 0.12, fz);
    if (level >= 3) k.box(w + 0.04, 0.06, 0.04, trim, 0, 1.2, fz + 0.02);
    // Дверь: рама, филёнки, круглое окошко, ручка, козырёк на кронштейнах и фонарь.
    k.box(0.52, 0.66, 0.05, trim, 0, 0.12, fz + 0.005);
    k.box(0.42, 0.56, 0.06, '#8b5a3c', 0, 0.12, fz + 0.01);
    k.fine(() => { k.box(0.32, 0.18, 0.012, '#7a4c31', 0, 0.2, fz + 0.045).box(0.32, 0.12, 0.012, '#7a4c31', 0, 0.42, fz + 0.045); });
    k.window(0, 0.6, fz + 0.03, 0.14, 0.14, true, undefined, trim);
    k.ball(0.025, '#f2c94c', 0.15, 0.4, fz + 0.06);
    for (const sx of [-1, 1]) {
      k.cbox(0.34, 0.035, 0.34, shade(roof, 0.9), sx * 0.15, 0.98, fz + 0.16, 0, 0, -sx * 0.45);
      k.cbox(0.03, 0.03, 0.26, trim, sx * 0.24, 0.84, fz + 0.12, 0.6);
    }
    k.box(0.05, 0.1, 0.06, '#4a4f5a', 0.36, 0.66, fz + 0.03);
    k.mesh(new THREE.SphereGeometry(0.045, 8, 6), MAT.glow, T(0.36, 0.8, fz + 0.07));
    // Окна по уровню (со ставнями с уровня 2) и ящики с цветами.
    if (level === 1) k.window(0.5, 0.62, fz, 0.3, 0.3, true, undefined, trim);
    else {
      k.window(-w / 2 + 0.42, 0.64, fz, 0.32, 0.34, false, shutter, trim).window(w / 2 - 0.42, 0.64, fz, 0.32, 0.34, false, shutter, trim);
      for (const sx of [-1, 1]) {
        k.box(0.42, 0.09, 0.12, '#9b6b43', sx * (w / 2 - 0.42), 0.36, fz + 0.08);
        for (let i = -1; i <= 1; i += 1) k.ball(0.05, ['#ff7eb6', '#ffd93d', '#ff6b6b'][(i + 1 + tint) % 3]!, sx * (w / 2 - 0.42) + i * 0.12, 0.48, fz + 0.08).ball(0.035, '#62b35c', sx * (w / 2 - 0.42) + i * 0.12 + 0.06, 0.46, fz + 0.1);
      }
    }
    if (level >= 3) {
      k.window(-0.62, 1.62, fz, 0.3, 0.34, false, shutter, trim).window(0.62, 1.62, fz, 0.3, 0.34, false, shutter, trim);
      // Балкончик с решёткой и двустворчатой дверью.
      k.box(0.36, 0.5, 0.03, '#8b5a3c', 0, 1.3, fz + 0.01).box(0.012, 0.46, 0.035, '#5c3a26', 0, 1.32, fz + 0.015);
      k.box(1.0, 0.06, 0.34, trim, 0, 1.24, fz + 0.17);
      k.box(1.0, 0.035, 0.035, trim, 0, 1.52, fz + 0.32).box(0.035, 0.035, 0.34, trim, -0.48, 1.52, fz + 0.17).box(0.035, 0.035, 0.34, trim, 0.48, 1.52, fz + 0.17);
      for (let i = -5; i <= 5; i += 1) k.box(0.02, 0.24, 0.02, trim, i * 0.095, 1.3, fz + 0.32);
      k.cyl(0.06, 0.05, 0.1, '#c96f4a', 0.38, 1.3, fz + 0.2, 8).ball(0.08, '#ff7eb6', 0.38, 1.46, fz + 0.2);
    }
    // Черепичная крыша; круглое окошко на фронтоне; труба; флюгер-рыбка.
    k.at(T(0, top, z0), () => k.shingles(w, d, rh, roof, wall, level >= 3 ? 6 : 5));
    if (level >= 2) k.window(0, top + rh * 0.38, fz + 0.04, 0.2, 0.2, true, undefined, trim);
    if (level >= 2) {
      const chx = w / 2 - 0.45;
      k.box(0.22, 0.62, 0.22, '#b5654a', chx, top + 0.05, -0.5).box(0.28, 0.06, 0.28, '#8a4a36', chx, top + 0.67, -0.5);
      k.fine(() => { for (let y = 0.15; y < 0.6; y += 0.12) k.box(0.225, 0.012, 0.225, '#c97a5e', chx, top + y, -0.5); });
    }
    if (level >= 3) {
      k.cyl(0.012, 0.012, 0.4, '#555b66', 0, top + rh, z0 - d / 4, 6);
      k.ball(0.06, '#f2c14e', 0, top + rh + 0.42, z0 - d / 4, 1.8, 0.8, 0.5).cone(0.05, 0.08, '#f2c14e', 0.13, top + rh + 0.38, z0 - d / 4, 3);
    }
  });
  // Ступенька, горшок у двери, почтовый ящик.
  k.box(0.62, 0.08, 0.26, '#cdb9a0', 0, 0, fz + 0.13);
  k.cyl(0.08, 0.06, 0.14, '#c96f4a', -0.42, 0.06, fz + 0.18, 10).ball(0.09, '#ff7eb6', -0.42, 0.27, fz + 0.18).ball(0.04, '#62b35c', -0.36, 0.22, fz + 0.24);
  if (level >= 2) {
    k.box(0.06, 0.35, 0.06, '#7a5236', 1.15, 0.06, 1.2).box(0.18, 0.14, 0.24, '#5c8fd6', 1.15, 0.41, 1.2).cyl(0.09, 0.09, 0.24, '#5c8fd6', 1.15, 0.55, 1.08, 10, Math.PI / 2);
    k.box(0.08, 0.06, 0.012, '#ff5d73', 1.25, 0.6, 1.2);
  }
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
/** Плитка пола по профессии (две клетки). */
const TILES: Record<Profession, [string, string]> = {
  baker: ['#f3e3c8', '#e2cba6'],
  fisher: ['#e3edf2', '#c8d9e3'],
  tailor: ['#f6e6f2', '#e8d0e4'],
  carpenter: ['#d8b98f', '#c9a678'],
  potter: ['#ead2b8', '#d9b99a'],
  florist: ['#e6f0dc', '#d2e4c4'],
  painter: ['#f5efe4', '#e6dccb'],
  confectioner: ['#fff0f6', '#ffd6e8'],
};

/** Высота пола мастерской. */
const WF = 0.13;

function table(k: Kit, x: number, z: number, w: number, d: number, top = '#c49a6c', hgt = 0.32): void {
  k.box(w, 0.04, d, top, x, WF + hgt - 0.04, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, hgt - 0.04, 0.04, shade(top, 0.75), x + sx * (w / 2 - 0.04), WF, z + sz * (d / 2 - 0.04));
}
function shelf(k: Kit, x: number, y: number, z: number, w: number, color = '#9b6b43'): void {
  k.box(w, 0.035, 0.24, color, x, y, z).box(0.03, 0.1, 0.03, shade(color, 0.8), x - w / 2 + 0.08, y - 0.1, z - 0.08).box(0.03, 0.1, 0.03, shade(color, 0.8), x + w / 2 - 0.08, y - 0.1, z - 0.08);
}
function fish(k: Kit, x: number, y: number, z: number, color = '#9ec7e8', s = 1, ry = 0): void {
  k.at(T(x, y, z, s, s, s, 0, ry, 0), () => {
    k.ball(0.07, color, 0, 0, 0, 1.6, 0.6, 0.7).add(new THREE.ConeGeometry(0.05, 0.08, 4), shade(color, 0.85), T(0.13, 0, 0, 1, 1, 0.4, 0, 0, Math.PI / 2));
    k.ball(0.012, '#2a2a2a', -0.07, 0.015, 0.035);
  });
}
function sack(k: Kit, x: number, z: number, color = '#efe3c8'): void {
  k.ball(0.17, color, x, WF + 0.15, z, 1, 1.15, 1).cyl(0.06, 0.08, 0.08, color, x, WF + 0.3, z, 8).ring(0.065, 0.012, '#b5835a', x, WF + 0.33, z, Math.PI / 2);
}
function jar(k: Kit, x: number, y: number, z: number, fill: string, r = 0.05): void {
  k.cyl(r, r, r * 2.2, '#e8f6ff', x, y, z, 10).cyl(r * 0.85, r * 0.85, r * 1.6, fill, x, y + 0.01, z, 8).cyl(r * 0.7, r * 0.7, 0.025, '#c49a6c', x, y + r * 2.2, z, 8);
}
/** Доска-раскладушка у входа с «ценами» мелом. */
function chalkboard(k: Kit, x: number, z: number, accent: string): void {
  for (const sz of [-1, 1]) k.cbox(0.34, 0.48, 0.03, '#8b5a3c', x, WF + 0.22, z + sz * 0.07, sz * 0.22);
  k.cbox(0.28, 0.4, 0.035, '#2f3437', x, WF + 0.23, z + 0.075, 0.22);
  for (let i = 0; i < 3; i += 1) k.cbox(0.16 - i * 0.03, 0.015, 0.04, i ? '#f3f3f3' : accent, x - 0.02, WF + 0.33 - i * 0.07, z + 0.085 - i * 0.015, 0.22);
}

/**
 * Обстановка мастерской. Рабочие места кошек: спереди (±0.6, 0.35) у прилавка, сзади (±0.6, -0.4)
 * у своих столов (z ≈ -0.12) — проходы к ним оставлены свободными. У задней стены — печи, полки,
 * снаружи у входа — товар на показ.
 */
function stuff(k: Kit, p: Profession, level: number): void {
  const [a, b] = AWNING[p];
  // Прилавок: короб, столешница, полосы цвета навеса спереди.
  const counter = (body: string, topC = '#f6efe4'): void => {
    k.box(2.2, 0.34, 0.36, body, 0, WF, 0.75).box(2.3, 0.04, 0.44, topC, 0, WF + 0.34, 0.75);
    for (let i = -2; i <= 2; i += 1) k.box(0.12, 0.3, 0.012, i % 2 ? b : a, i * 0.45, WF + 0.02, 0.935);
  };
  const back = -1.13;
  switch (p) {
    case 'baker': {
      counter('#e8c39a');
      for (let i = -3; i <= 3; i += 1) {
        if (i % 2) k.ball(0.07, '#d98f3e', i * 0.28, WF + 0.43, 0.75, 1.6, 0.7, 0.8).box(0.015, 0.012, 0.09, '#f3d7a8', i * 0.28 - 0.04, WF + 0.47, 0.75, 0, 0.5).box(0.015, 0.012, 0.09, '#f3d7a8', i * 0.28 + 0.04, WF + 0.47, 0.75, 0, 0.5);
        else k.add(new THREE.TorusGeometry(0.06, 0.035, 6, 12, Math.PI * 1.2), '#e2a25a', T(i * 0.28, WF + 0.42, 0.75, 1, 1, 1, -Math.PI / 2, 0, 0.6));
      }
      // Печь-купол из кирпича в углу с огнём и трубой сквозь крышу; дрова.
      k.ball(0.4, '#c9785a', -1.0, WF, -0.92, 1, 0.95, 1).cyl(0.42, 0.44, 0.12, '#b5654a', -1.0, WF - 0.02, -0.92, 16);
      for (let i = 0; i < 5; i += 1) k.ball(0.06, '#a85a40', -1.0 + Math.cos(i * 1.3) * 0.33, WF + 0.12 + (i % 3) * 0.08, -0.92 + Math.sin(i * 1.3) * 0.33, 1, 0.5, 1);
      k.add(new THREE.CircleGeometry(0.17, 14, 0, Math.PI), '#3a1d14', T(-0.88, WF + 0.06, -0.55, 1, 1, 1, 0, 0.5, 0));
      k.mesh(new THREE.ConeGeometry(0.08, 0.14, 8), MAT.fire, T(-0.86, WF + 0.12, -0.6));
      k.cyl(0.08, 0.08, 1.9, '#8a8f99', -1.05, WF + 0.3, -1.02, 10);
      for (let i = 0; i < 3; i += 1) k.log(0.045, 0.32, '#8b5a3c', -1.3, WF + 0.05 + i * 0.08, -0.25 + (i % 2) * 0.05, Math.PI / 2);
      // Полки с хлебом, мешки муки, тестомесы.
      shelf(k, 0.55, 0.9, back, 1.3);
      shelf(k, 0.55, 1.25, back, 1.3);
      for (let i = 0; i < 5; i += 1) k.ball(0.07, '#e2a25a', 0.05 + i * 0.25, 0.99, back, 1.4, 0.75, 0.9).ball(0.06, '#c9783e', 0.05 + i * 0.25, 1.34, back, 1, 0.9, 1);
      sack(k, 1.15, -0.85);
      sack(k, 1.25, -0.5, '#f6ecd6');
      for (const sx of [-1, 1]) {
        table(k, sx * 0.6, -0.12, 0.52, 0.24, '#e8d5b0');
        k.ball(0.06, '#fff3d6', sx * 0.6 - 0.12, WF + 0.34, -0.12, 1, 0.7, 1).ball(0.05, '#fff3d6', sx * 0.6 + 0.02, WF + 0.33, -0.1, 1, 0.7, 1);
        k.log(0.022, 0.24, '#c49a6c', sx * 0.6 + 0.13, WF + 0.33, -0.12, Math.PI / 2 + 0.3);
      }
      // Снаружи: корзина хлеба на бочке и доска с ценами.
      k.cyl(0.18, 0.16, 0.42, '#9b6b43', -1.15, 0.02, 1.62, 12).cyl(0.2, 0.15, 0.12, '#d9b48a', -1.15, 0.44, 1.62, 12);
      for (let i = 0; i < 3; i += 1) k.ball(0.06, '#d98f3e', -1.2 + i * 0.05, 0.58, 1.58 + (i % 2) * 0.06, 1.5, 0.7, 0.8);
      chalkboard(k, 1.15, 1.6, a);
      break;
    }
    case 'fisher': {
      counter('#7a9eb8', '#eef6fb');
      for (let i = -3; i <= 3; i += 1) {
        k.ball(0.06, '#ffffff', i * 0.28, WF + 0.36, 0.75, 1.8, 0.4, 1.4);
        fish(k, i * 0.28, WF + 0.42, 0.75, ['#9ec7e8', '#e8a05c', '#b8c4cf'][(i + 3) % 3]!, 1, (i % 2) * 0.4);
      }
      // Бочки, сеть на левой стене, удочки у правой, спасательный круг, вяленая рыба.
      k.cyl(0.2, 0.18, 0.45, '#9b6b43', -1.1, WF, -0.85, 12).cyl(0.18, 0.16, 0.42, '#8b5a3c', -0.7, WF, -1.0, 12);
      for (const [x, z] of [[-1.1, -0.85], [-0.7, -1.0]] as const) k.ring(0.195, 0.012, '#5c5f66', x, WF + 0.12, z, Math.PI / 2).ring(0.19, 0.012, '#5c5f66', x, WF + 0.36, z, Math.PI / 2);
      for (let i = 0; i < 6; i += 1) k.box(0.012, 0.6, 0.012, '#d9c9a3', -1.41, 0.75, -0.55 + i * 0.12).box(0.012, 0.012, 0.62, '#d9c9a3', -1.41, 0.78 + i * 0.1, -0.25);
      for (let i = 0; i < 3; i += 1) k.cbox(0.02, 1.3, 0.02, '#7a5236', 1.32 - i * 0.07, 0.8, -0.9 + i * 0.12, 0, 0, 0.12 + i * 0.05);
      k.ring(0.16, 0.05, '#ff5d5d', 0.2, 1.05, back + 0.05).ring(0.16, 0.052, '#ffffff', 0.2, 1.05, back + 0.04, 0, 0);
      k.box(1.0, 0.03, 0.03, '#7a5236', 0.75, 1.42, back);
      for (let i = 0; i < 4; i += 1) fish(k, 0.4 + i * 0.24, 1.28, back + 0.03, '#e8a05c', 0.9, Math.PI / 2);
      for (const sx of [-1, 1]) {
        table(k, sx * 0.6, -0.12, 0.52, 0.24, '#b8c9d6');
        fish(k, sx * 0.6, WF + 0.34, -0.12, '#9ec7e8', 1.1);
        k.cyl(0.08, 0.07, 0.14, '#9aa3ad', sx * 0.6 + sx * 0.36, WF, -0.1, 10);
      }
      // Снаружи: ящик с рыбой на льду и ловушка-корзина.
      k.box(0.46, 0.22, 0.3, '#9b6b43', -1.15, 0.02, 1.62).box(0.42, 0.04, 0.26, '#ffffff', -1.15, 0.24, 1.62);
      for (let i = 0; i < 3; i += 1) fish(k, -1.27 + i * 0.12, 0.3, 1.62, '#9ec7e8', 0.8, Math.PI / 2);
      k.cyl(0.18, 0.18, 0.28, '#c9a77a', 1.15, 0.02, 1.6, 10);
      for (let y = 0.08; y < 0.3; y += 0.07) k.ring(0.185, 0.01, '#8b5a3c', 1.15, y, 1.6, Math.PI / 2);
      break;
    }
    case 'tailor': {
      counter('#f3d6ec');
      for (let i = 0; i < 4; i += 1) for (let j = 0; j < 3; j += 1) k.box(0.22, 0.04, 0.18, ['#ff7eb6', '#7fb6d9', '#ffd93d', '#9ad08d', '#c77dd6'][(i + j) % 5]!, -0.85 + i * 0.52, WF + 0.38 + j * 0.04, 0.75);
      jar(k, 0.95, WF + 0.38, 0.72, '#ff6b6b', 0.04);
      // Рулоны ткани на полках, катушки ниток, манекены, зеркало.
      shelf(k, 0.2, 0.85, back, 2.0, '#b5835a');
      shelf(k, 0.2, 1.22, back, 2.0, '#b5835a');
      for (let i = 0; i < 7; i += 1) {
        k.log(0.06, 0.28, ['#ff9a8a', '#8ac7ff', '#ffe08a', '#c7a4ff', '#9ad08d', '#ff7eb6', '#ffffff'][i]!, -0.6 + i * 0.27, 0.95, back, 0);
        k.cyl(0.035, 0.035, 0.09, ['#ff6b6b', '#5c8fd6', '#ffd93d', '#7cbf6b', '#c77dd6', '#ffffff', '#ff9fb8'][(i + 2) % 7]!, -0.6 + i * 0.27, 1.26, back, 8);
      }
      const dummy = (x: number, z: number, dress: string): void => {
        k.cyl(0.08, 0.1, 0.03, '#8b5a3c', x, WF, z, 10).cyl(0.015, 0.015, 0.42, '#8b5a3c', x, WF + 0.03, z, 6);
        k.ball(0.13, '#f4e6d7', x, WF + 0.62, z, 1, 1.25, 0.8).add(new THREE.ConeGeometry(0.2, 0.32, 14), dress, T(x, WF + 0.47, z));
        k.ball(0.04, '#8b5a3c', x, WF + 0.8, z);
      };
      dummy(1.1, -0.85, '#c77dd6');
      dummy(-1.12, -0.15, '#ff9fb8');
      k.ball(0.22, '#d6ecff', -1.4, 0.95, -0.75, 0.15, 1.3, 1).ring(0.22, 0.025, '#f2c94c', -1.39, 0.95, -0.75, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        table(k, sx * 0.6, -0.12, 0.52, 0.24, '#e8d5b0');
        // Швейная машинка.
        k.box(0.2, 0.06, 0.1, '#3a3f4a', sx * 0.6, WF + 0.32, -0.12).box(0.05, 0.13, 0.08, '#3a3f4a', sx * 0.6 + 0.08, WF + 0.38, -0.12).box(0.2, 0.04, 0.07, '#3a3f4a', sx * 0.6, WF + 0.49, -0.12);
        k.box(0.18, 0.005, 0.16, sx < 0 ? '#ff9fb8' : '#8ac7ff', sx * 0.6 - 0.12, WF + 0.32, -0.1, 0, 0.3);
      }
      // Снаружи: манекен в платье и вешалка с одеждой.
      dummy(-1.15, 1.6, '#7fb6d9');
      k.box(0.03, 0.6, 0.03, '#7a5236', 0.95, 0.02, 1.6).box(0.03, 0.6, 0.03, '#7a5236', 1.35, 0.02, 1.6).box(0.46, 0.025, 0.025, '#7a5236', 1.15, 0.6, 1.6);
      for (let i = 0; i < 3; i += 1) k.add(new THREE.ConeGeometry(0.08, 0.26, 4), ['#ffd93d', '#ff7eb6', '#9ad08d'][i]!, T(1.02 + i * 0.13, 0.46, 1.6, 1, 1, 0.35, 0, 0, Math.PI));
      break;
    }
    case 'carpenter': {
      counter('#c49a6c', '#e2c08f');
      // Табуретки и шкатулки на продажу.
      for (const x of [-0.75, 0.75]) k.box(0.2, 0.03, 0.2, '#e2c08f', x, WF + 0.5, 0.75).box(0.03, 0.12, 0.03, '#b5835a', x - 0.07, WF + 0.38, 0.68).box(0.03, 0.12, 0.03, '#b5835a', x + 0.07, WF + 0.38, 0.82);
      k.box(0.18, 0.1, 0.13, '#9b6b43', 0, WF + 0.38, 0.75).box(0.19, 0.02, 0.14, '#7a5236', 0, WF + 0.48, 0.75);
      // Стена инструментов, брёвна, доски у стены, стружка.
      k.box(1.3, 0.62, 0.03, '#d9b48a', 0.55, 0.75, back);
      k.box(0.36, 0.12, 0.012, '#c8cdd3', 0.1, 1.05, back + 0.03).box(0.1, 0.1, 0.03, '#8b5a3c', -0.12, 1.06, back + 0.03);
      k.box(0.04, 0.24, 0.02, '#8b5a3c', 0.5, 0.9, back + 0.03).box(0.14, 0.05, 0.03, '#8a8f99', 0.5, 1.12, back + 0.03);
      k.box(0.32, 0.03, 0.015, '#ffd93d', 0.85, 1.2, back + 0.03).box(0.03, 0.2, 0.02, '#8a8f99', 1.05, 0.88, back + 0.03);
      for (let i = 0; i < 5; i += 1) k.log(0.11, 0.85, i % 2 ? '#9b6b43' : '#8b5a3c', -1.0, WF + 0.11 + Math.floor(i / 2) * 0.19, -0.95 + (i % 2) * 0.22 - (i >= 4 ? 0.11 : 0), Math.PI / 2);
      for (let i = 0; i < 4; i += 1) k.cbox(0.16, 1.1, 0.03, ['#e2c08f', '#d9b48a', '#c9a678', '#e8d0a8'][i]!, 1.3 - i * 0.03, 0.66, -0.75 + i * 0.12, 0, 0, 0.15);
      for (let i = 0; i < 8; i += 1) k.ball(0.025, '#f3e0c0', -0.3 + ((i * 37) % 60) / 100, WF + 0.01, -0.35 + ((i * 53) % 40) / 100, 1, 0.3, 1);
      for (const sx of [-1, 1]) {
        // Верстак с тисками и доской.
        table(k, sx * 0.6, -0.12, 0.56, 0.26, '#c9a678');
        k.box(0.36, 0.03, 0.12, '#e2c08f', sx * 0.6, WF + 0.32, -0.1).box(0.08, 0.08, 0.06, '#6b6f78', sx * 0.6 + sx * 0.22, WF + 0.32, -0.2);
      }
      // Снаружи: готовый стул и поленница.
      k.box(0.3, 0.04, 0.3, '#c49a6c', -1.15, 0.28, 1.6).box(0.3, 0.34, 0.04, '#c49a6c', -1.15, 0.32, 1.47);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, 0.28, 0.04, '#9b6b43', -1.15 + sx * 0.12, 0.02, 1.6 + sz * 0.12);
      for (let i = 0; i < 6; i += 1) k.log(0.07, 0.42, '#8b5a3c', 1.15, 0.09 + Math.floor(i / 3) * 0.13, 1.47 + (i % 3) * 0.14, 0);
      break;
    }
    case 'potter': {
      counter('#d9b38c');
      for (let i = -3; i <= 3; i += 1) {
        if (i % 2) k.cyl(0.07, 0.04, 0.07, ['#c7774a', '#7fb6d9', '#9ad08d'][(i + 3) % 3]!, i * 0.28, WF + 0.38, 0.75, 10);
        else k.cyl(0.04, 0.07, 0.2, ['#e2a25a', '#c77dd6', '#7fb6d9', '#c7774a'][(i + 6) % 4]!, i * 0.28, WF + 0.38, 0.75, 10).ball(0.065, ['#e2a25a', '#c77dd6', '#7fb6d9', '#c7774a'][(i + 6) % 4]!, i * 0.28, WF + 0.55, 0.75, 1, 0.8, 1);
      }
      // Печь для обжига с огнём, полки с вазами, вёдра глины.
      k.cyl(0.32, 0.42, 0.9, '#b8573c', -0.98, WF, -0.88, 16).cone(0.33, 0.25, '#a04a32', -0.98, WF + 0.9, -0.88, 16).cyl(0.07, 0.07, 1.0, '#8a8f99', -0.98, WF + 1.05, -0.88, 8);
      k.add(new THREE.CircleGeometry(0.15, 14), '#3a1d14', T(-0.92, WF + 0.28, -0.5, 1, 1, 1, 0, 0.3, 0));
      k.mesh(new THREE.ConeGeometry(0.07, 0.13, 8), MAT.fire, T(-0.9, WF + 0.26, -0.48));
      shelf(k, 0.55, 0.9, back, 1.3);
      shelf(k, 0.55, 1.25, back, 1.3);
      for (let i = 0; i < 5; i += 1) {
        k.cyl(0.05, 0.08, 0.2, ['#c7774a', '#7fb6d9', '#e2a25a', '#9ad08d', '#c77dd6'][i]!, 0.05 + i * 0.25, 0.935, back, 10);
        k.cyl(0.08, 0.05, 0.08, ['#9ad08d', '#e2a25a', '#c77dd6', '#7fb6d9', '#c7774a'][i]!, 0.05 + i * 0.25, 1.285, back, 10);
      }
      for (let i = 0; i < 2; i += 1) k.cyl(0.13, 0.11, 0.24, '#9aa3ad', 1.2, WF, -0.85 + i * 0.34, 10).cyl(0.115, 0.115, 0.02, '#a08060', 1.2, WF + 0.22, -0.85 + i * 0.34, 10);
      for (const sx of [-1, 1]) {
        // Гончарный круг с комком глины.
        k.cyl(0.07, 0.12, 0.2, '#8a6a4c', sx * 0.6, WF, -0.12, 10).cyl(0.18, 0.18, 0.04, '#a5a9b0', sx * 0.6, WF + 0.2, -0.12, 16).cyl(0.07, 0.09, 0.12, '#b8805a', sx * 0.6, WF + 0.24, -0.12, 10);
      }
      // Снаружи: скамья с большими вазами.
      k.box(0.6, 0.05, 0.26, '#c49a6c', -1.1, 0.24, 1.6).box(0.05, 0.22, 0.22, '#9b6b43', -1.35, 0.02, 1.6).box(0.05, 0.22, 0.22, '#9b6b43', -0.85, 0.02, 1.6);
      k.cyl(0.07, 0.11, 0.3, '#7fb6d9', -1.22, 0.29, 1.6, 12).ball(0.1, '#7fb6d9', -1.22, 0.6, 1.6, 1, 0.7, 1);
      k.cyl(0.1, 0.07, 0.24, '#c7774a', -0.98, 0.29, 1.6, 12);
      k.cyl(0.12, 0.18, 0.5, '#e2a25a', 1.15, 0.02, 1.6, 14).cyl(0.1, 0.12, 0.08, '#e2a25a', 1.15, 0.52, 1.6, 14);
      break;
    }
    case 'florist': {
      counter('#bfe0b0');
      for (let i = -3; i <= 3; i += 1) {
        k.cyl(0.09, 0.07, 0.18, '#9aa3ad', i * 0.3, WF + 0.38, 0.75, 10);
        for (let j = 0; j < 4; j += 1) k.ball(0.05, ['#ff7eb6', '#ffd93d', '#ff6b6b', '#b28dff', '#ffffff'][(i + j + 5) % 5]!, i * 0.3 + Math.cos(j * 1.6) * 0.05, WF + 0.62 + (j % 2) * 0.05, 0.75 + Math.sin(j * 1.6) * 0.04);
      }
      // Растения в горшках на полках, кадка с деревцем, лейки, подвесные корзины.
      shelf(k, 0.35, 0.9, back, 1.7, '#8b6a4c');
      shelf(k, 0.35, 1.25, back, 1.7, '#8b6a4c');
      for (let i = 0; i < 6; i += 1) {
        k.cyl(0.06, 0.045, 0.1, '#c96f4a', -0.35 + i * 0.28, 0.935, back, 8).ball(0.08, i % 2 ? '#6dbb5e' : '#5aa856', -0.35 + i * 0.28, 1.08, back);
        k.cyl(0.05, 0.04, 0.08, '#e8e0d0', -0.35 + i * 0.28, 1.285, back, 8).ball(0.05, ['#ff7eb6', '#ffd93d', '#b28dff'][i % 3]!, -0.35 + i * 0.28, 1.4, back);
      }
      k.cyl(0.18, 0.14, 0.3, '#c96f4a', -1.1, WF, -0.9, 12).cyl(0.04, 0.05, 0.5, '#8b5a3c', -1.1, WF + 0.3, -0.9, 8).ball(0.32, '#5aa856', -1.1, WF + 0.95, -0.9).ball(0.2, '#68b863', -0.95, WF + 0.8, -0.75);
      for (const [x, z] of [[1.2, -0.85], [1.25, -0.45]] as const) k.cyl(0.08, 0.09, 0.16, '#7fb6d9', x, WF, z, 10).cbox(0.025, 0.025, 0.18, '#7fb6d9', x, WF + 0.13, z + 0.12, 0.6);
      for (const x of [-0.95, 0.95]) k.cyl(0.004, 0.004, 0.3, '#7a5236', x, 1.5, 1.05, 4).cyl(0.1, 0.07, 0.08, '#b5835a', x, 1.42, 1.05, 10).ball(0.11, '#62b35c', x, 1.44, 1.05, 1, 0.6, 1).ball(0.04, '#ff7eb6', x + 0.05, 1.42, 1.13);
      for (const sx of [-1, 1]) {
        table(k, sx * 0.6, -0.12, 0.52, 0.24, '#c9b39a');
        k.cyl(0.06, 0.045, 0.1, '#c96f4a', sx * 0.6 - 0.1, WF + 0.32, -0.12, 8).ball(0.06, '#5aa856', sx * 0.6 - 0.1, WF + 0.45, -0.12);
        for (let j = 0; j < 3; j += 1) k.ball(0.035, ['#ff7eb6', '#ffd93d', '#ffffff'][j]!, sx * 0.6 + 0.08 + j * 0.05, WF + 0.34, -0.1);
      }
      // Снаружи: ступенчатые стойки с горшками.
      for (const x of [-1.15, 1.15])
        for (let s = 0; s < 3; s += 1) {
          k.box(0.5, 0.04, 0.14, '#8b6a4c', x, 0.08 + s * 0.16, 1.82 - s * 0.14);
          for (let i = -1; i <= 1; i += 1) k.cyl(0.045, 0.035, 0.07, '#c96f4a', x + i * 0.15, 0.12 + s * 0.16, 1.82 - s * 0.14, 8).ball(0.05, ['#ff7eb6', '#ffd93d', '#ff6b6b', '#b28dff'][(i + s + 4) % 4]!, x + i * 0.15, 0.24 + s * 0.16, 1.82 - s * 0.14);
        }
      for (let s = 0; s < 3; s += 1) for (const x of [-1.38, -0.92, 0.92, 1.38]) k.box(0.03, 0.08 + s * 0.16, 0.03, '#7a5236', x, 0.02, 1.82 - s * 0.14);
      break;
    }
    case 'painter': {
      counter('#f7e3c6');
      for (let i = 0; i < 5; i += 1) k.cyl(0.035, 0.035, 0.1, ['#ff6b6b', '#ffd93d', '#5c8fd6', '#7cbf6b', '#c77dd6'][i]!, -0.9 + i * 0.12, WF + 0.38, 0.72, 8);
      k.cyl(0.05, 0.05, 0.1, '#7fb6d9', 0.1, WF + 0.38, 0.75, 8);
      for (let i = 0; i < 4; i += 1) k.box(0.01, 0.16, 0.01, '#8b5a3c', 0.08 + i * 0.015, WF + 0.45, 0.75, 0, 0, (i - 1.5) * 0.15);
      for (let i = 0; i < 2; i += 1) k.cbox(0.26, 0.2, 0.025, '#c49a6c', 0.55 + i * 0.32, WF + 0.5, 0.72, -0.25).cbox(0.21, 0.15, 0.03, ['#7fb6d9', '#ffb36b'][i]!, 0.55 + i * 0.32, WF + 0.5, 0.725, -0.25);
      // Галерея картин на задней стене, холсты у стены, кляксы краски.
      for (let i = 0; i < 4; i += 1) {
        const x = -0.95 + i * 0.62;
        k.box(0.44, 0.36, 0.03, ['#f2c94c', '#8b5a3c', '#ffffff', '#c49a6c'][i]!, x, 0.85, back);
        k.box(0.36, 0.28, 0.035, ['#7fb6d9', '#9ad08d', '#ff9fb8', '#ffd93d'][i]!, x, 0.89, back + 0.005);
        k.ball(0.06, ['#ffd93d', '#ff6b6b', '#5c8fd6', '#7cbf6b'][i]!, x + 0.06, 1.05, back + 0.03, 1, 1, 0.3);
      }
      for (let i = 0; i < 4; i += 1) k.cbox(0.5 - i * 0.05, 0.4 - i * 0.04, 0.03, ['#ffffff', '#f6efe4', '#ffe9c8', '#ffffff'][i]!, 1.3 - i * 0.04, WF + 0.23, -0.8 + i * 0.1, 0, Math.PI / 2, 0.14);
      for (let i = 0; i < 7; i += 1) k.cyl(0.06 + (i % 3) * 0.02, 0.06 + (i % 3) * 0.02, 0.006, ['#ff6b6b', '#ffd93d', '#5c8fd6', '#7cbf6b', '#c77dd6'][i % 5]!, -0.8 + ((i * 41) % 160) / 100, WF + 0.005, -0.7 + ((i * 29) % 90) / 100, 10);
      // Мольберты повёрнуты к улице вполоборота — картины видно.
      for (const sx of [-1, 1]) {
        k.at(T(sx * 0.6, WF, -0.1, 1, 1, 1, 0, -sx * 0.5, 0), () => {
          k.cbox(0.03, 0.85, 0.03, '#9b6b43', -0.15, 0.42, 0, 0.12, 0, 0.12).cbox(0.03, 0.85, 0.03, '#9b6b43', 0.15, 0.42, 0, 0.12, 0, -0.12).cbox(0.03, 0.8, 0.03, '#9b6b43', 0, 0.38, -0.15, -0.25);
          k.cbox(0.4, 0.03, 0.06, '#9b6b43', 0, 0.38, 0.06);
          k.cbox(0.44, 0.36, 0.03, '#ffffff', 0, 0.6, 0.08, -0.12).cbox(0.36, 0.28, 0.035, sx < 0 ? '#9ad08d' : '#7fb6d9', 0, 0.6, 0.085, -0.12);
          k.ball(0.06, sx < 0 ? '#ffd93d' : '#ff9fb8', 0.06, 0.65, 0.1, 1, 1, 0.3);
        });
        k.ball(0.07, '#e8c39a', sx * 0.6 + sx * 0.32, WF + 0.33, -0.25, 1.4, 0.2, 1).ball(0.02, '#ff6b6b', sx * 0.6 + sx * 0.3, WF + 0.35, -0.24).ball(0.02, '#5c8fd6', sx * 0.6 + sx * 0.35, WF + 0.35, -0.27);
      }
      // Снаружи: мольберт с картиной для прохожих.
      k.at(T(-1.15, 0.02, 1.6, 1, 1, 1, 0, 0.3, 0), () => {
        k.cbox(0.03, 0.85, 0.03, '#9b6b43', -0.15, 0.42, 0, 0.12, 0, 0.12).cbox(0.03, 0.85, 0.03, '#9b6b43', 0.15, 0.42, 0, 0.12, 0, -0.12).cbox(0.03, 0.8, 0.03, '#9b6b43', 0, 0.38, -0.15, -0.25);
        k.cbox(0.48, 0.38, 0.03, '#f2c94c', 0, 0.6, 0.08, -0.12).cbox(0.4, 0.3, 0.035, '#bfe6ff', 0, 0.6, 0.085, -0.12).cbox(0.4, 0.1, 0.04, '#7cbf6b', 0, 0.48, 0.09, -0.12);
        k.ball(0.05, '#ffd93d', 0.1, 0.7, 0.11, 1, 1, 0.3);
      });
      chalkboard(k, 1.15, 1.6, a);
      break;
    }
    case 'confectioner': {
      counter('#ffd6e8', '#ffffff');
      for (let i = -3; i <= 3; i += 1) {
        const x = i * 0.3;
        if (i % 3 === 0) k.cyl(0.11, 0.11, 0.1, '#fff0f6', x, WF + 0.38, 0.75, 14).cyl(0.08, 0.08, 0.07, '#ff9fc8', x, WF + 0.48, 0.75, 14).ball(0.025, '#ff3b6b', x, WF + 0.57, 0.75);
        else if (i % 2) k.cyl(0.05, 0.04, 0.05, '#ffffff', x, WF + 0.38, 0.75, 10).ball(0.055, ['#ffd6e8', '#c7a4ff', '#fff3b0'][(i + 3) % 3]!, x, WF + 0.46, 0.75, 1, 0.8, 1).ball(0.015, '#ff3b6b', x, WF + 0.51, 0.75);
        else k.ring(0.045, 0.025, ['#e2a25a', '#ff9fc8'][(i + 4) % 2]!, x, WF + 0.4, 0.75, Math.PI / 2);
      }
      // Котёл с карамелью, банки с леденцами, торт на полке.
      k.cyl(0.3, 0.25, 0.4, '#8a8f99', -0.98, WF, -0.85, 16).cyl(0.27, 0.27, 0.02, '#ff8fc1', -0.98, WF + 0.38, -0.85, 16).cyl(0.012, 0.012, 0.4, '#c49a6c', -0.9, WF + 0.4, -0.85, 6, 0.2);
      shelf(k, 0.5, 0.86, back, 1.4);
      shelf(k, 0.5, 1.2, back, 1.4, '#ffffff');
      for (let i = 0; i < 5; i += 1) jar(k, -0.05 + i * 0.27, 0.895, back, ['#ff6b6b', '#ffd93d', '#7fb6d9', '#9ad08d', '#c77dd6'][i]!, 0.055);
      k.cyl(0.2, 0.2, 0.14, '#fff0f6', 0.95, 1.235, back, 18).cyl(0.14, 0.14, 0.11, '#ff9fc8', 0.95, 1.375, back, 18).ball(0.04, '#ff3b6b', 0.95, 1.52, back);
      for (let i = 0; i < 3; i += 1) k.cyl(0.08, 0.08, 0.06, '#e2a25a', 0.2 + i * 0.22, 1.235, back, 10).ball(0.06, '#ffd6e8', 0.2 + i * 0.22, 1.31, back, 1, 0.7, 1);
      for (const sx of [-1, 1]) {
        table(k, sx * 0.6, -0.12, 0.52, 0.24, '#ffffff');
        k.cyl(0.1, 0.1, 0.08, '#fff0f6', sx * 0.6, WF + 0.32, -0.12, 14).ball(0.05, '#ff9fc8', sx * 0.6, WF + 0.42, -0.12, 1.6, 0.4, 1.6);
        k.add(new THREE.ConeGeometry(0.03, 0.12, 8), '#ffffff', T(sx * 0.6 + 0.17, WF + 0.36, -0.1, 1, 1, 1, 0, 0, sx * 2.2));
      }
      // Снаружи: огромные леденцы на палочках.
      for (const [x, c1, c2] of [[-1.15, '#ff6b6b', '#ffffff'], [1.15, '#7fb6d9', '#ffd93d']] as const) {
        k.cyl(0.02, 0.02, 0.7, '#ffffff', x, 0.02, 1.6, 6);
        k.cyl(0.2, 0.2, 0.05, c1, x, 0.72, 1.6, 18, Math.PI / 2).ring(0.13, 0.025, c2, x, 0.745, 1.63).ring(0.06, 0.02, c2, x, 0.745, 1.63);
      }
      break;
    }
  }
  if (level >= 2) {
    // Вторая витрина: ящики с цветами под боковыми окнами и лавочка у входа.
    for (const sx of [-1, 1]) {
      k.box(0.08, 0.08, 0.52, '#9b6b43', sx * 1.58, 0.72, -0.2);
      for (let i = -1; i <= 1; i += 1) k.ball(0.045, ['#ff7eb6', '#ffd93d', '#ff6b6b'][i + 1]!, sx * 1.6, 0.83, -0.2 + i * 0.15);
    }
  }
}

function workshop(type: BuildingId, level: number, tint: number): THREE.Group {
  const def = buildingById(type);
  const p = def.profession!;
  const [a, b] = AWNING[p];
  const k = new Kit();
  const wall = TINTS[(tint + 3) % TINTS.length]!;
  const roofC = ROOFS[(tint + 2) % ROOFS.length]!;
  const beam = '#8b5a3c';
  const W = 3.0;
  const D = 2.6;
  const H = 1.7;
  // Площадка, пол плиткой.
  k.box(3.3, 0.12, 3.1, '#d9cbb8', 0, 0, 0.05);
  const [t1, t2] = TILES[p];
  k.fine(() => { for (let i = 0; i < 6; i += 1) for (let j = 0; j < 5; j += 1) k.box(0.465, 0.012, 0.47, (i + j) % 2 ? t1 : t2, -1.2 + i * 0.48, 0.12, -0.98 + j * 0.48); });
  // Задняя и боковые стены: деревянная панель снизу изнутри, балки по углам, окна по бокам.
  k.box(W, H, 0.14, wall, 0, 0.12, -D / 2);
  k.box(0.14, H, D, wall, -W / 2, 0.12, 0).box(0.14, H, D, wall, W / 2, 0.12, 0);
  const panel = shade(wall, 0.82);
  k.box(W - 0.28, 0.42, 0.02, panel, 0, 0.12, -D / 2 + 0.08).box(W - 0.28, 0.03, 0.04, beam, 0, 0.54, -D / 2 + 0.09);
  for (const sx of [-1, 1]) k.box(0.02, 0.42, D - 0.2, panel, sx * (W / 2 - 0.08), 0.12, 0).box(0.04, 0.03, D - 0.2, beam, sx * (W / 2 - 0.09), 0.54, 0);
  for (const sx of [-1, 1]) {
    k.box(0.13, H + 0.02, 0.13, beam, sx * W / 2, 0.12, -D / 2).box(0.13, H + 0.02, 0.13, beam, sx * W / 2, 0.12, D / 2 - 0.06);
    k.box(0.04, 0.1, D, beam, sx * (W / 2 + 0.07), 0.12 + H - 0.12, 0);
    k.sideWindow(sx * (W / 2 + 0.075), 1.0, -0.2, sx, 0.55, 0.42, a, '#fff7ec');
  }
  k.box(W, 0.1, 0.05, beam, 0, 0.12 + H - 0.12, -D / 2 - 0.08);
  // Балка над входом и подвесной фонарь внутри.
  k.box(W + 0.1, 0.1, 0.1, beam, 0, 0.12 + H - 0.1, D / 2 - 0.06);
  k.box(0.012, 0.25, 0.012, '#4a4f5a', 0, 0.12 + H - 0.25, -0.1).cone(0.09, 0.07, '#f2c14e', 0, 0.12 + H - 0.32, -0.1, 10);
  k.mesh(new THREE.SphereGeometry(0.06, 10, 8), MAT.glow, T(0, 0.12 + H - 0.34, -0.1));
  stuff(k, p, level);
  if (level >= 2) for (const sx of [-1, 1]) lampPost(k, sx * 1.48, 1.45, 1.05);
  // ── Съёмная часть: крыша, навес, вывеска, второй этаж.
  k.cut(() => {
    if (level < 3) {
      // Черепичная крыша коньком вдоль фасада (скаты смотрят на улицу и во двор).
      k.at(T(0, 0.12 + H, -0.05, 1, 1, 1, 0, Math.PI / 2, 0), () => k.shingles(D + 0.1, W, 0.6, roofC, wall, 5));
    } else {
      // Плоская крыша первого этажа — терраса с дощатым полом и перилами.
      k.box(W + 0.3, 0.16, D + 0.2, shade(roofC, 0.8), 0, 0.12 + H, -0.05);
      k.box(W + 0.2, 0.02, D + 0.1, '#c9a678', 0, 0.28 + H, -0.05);
      k.fine(() => { for (let i = 0; i < 10; i += 1) k.box(0.012, 0.005, D + 0.1, '#b08a5e', -W / 2 + 0.15 + i * 0.3, 0.3 + H, -0.05); });
      k.box(W + 0.2, 0.04, 0.04, '#fff7ec', 0, H + 0.58, D / 2 + 0.17);
      for (let i = -7; i <= 7; i += 1) k.box(0.03, 0.28, 0.03, '#fff7ec', i * 0.21, H + 0.3, D / 2 + 0.17);
      // Второй этаж: окна со ставнями, балкон с цветами, черепичная крыша, флажки.
      k.box(W - 0.4, 1.0, D - 0.6, wall, 0, 0.28 + H, -0.3);
      for (const sx of [-1, 1]) k.box(0.1, 1.0, 0.1, beam, sx * (W / 2 - 0.2), 0.28 + H, -0.3 + (D - 0.6) / 2);
      k.window(-0.65, H + 0.8, -0.3 + (D - 0.6) / 2, 0.36, 0.38, false, a).window(0.65, H + 0.8, -0.3 + (D - 0.6) / 2, 0.36, 0.38, false, a);
      for (const x of [-1.3, 1.3]) k.cyl(0.09, 0.07, 0.14, '#c96f4a', x, H + 0.3, 1.2, 8).ball(0.12, '#62b35c', x, H + 0.52, 1.2).ball(0.04, '#ff7eb6', x + 0.06, H + 0.6, 1.26);
      k.box(0.6, 0.04, 0.22, '#c49a6c', 0.4, H + 0.48, 1.0).box(0.04, 0.18, 0.18, '#9b6b43', 0.14, H + 0.3, 1.0).box(0.04, 0.18, 0.18, '#9b6b43', 0.66, H + 0.3, 1.0);
      k.at(T(0, 1.28 + H, -0.3, 1, 1, 1, 0, Math.PI / 2, 0), () => k.shingles(D - 0.6, W - 0.4, 0.62, a, wall, 4));
      for (let i = 0; i < 6; i += 1) k.cone(0.08, 0.14, i % 2 ? a : b, -1.25 + i * 0.5, H + 0.04, D / 2 + 0.66, 3);
    }
    // Труба у пекарни, гончарной и кондитерской — над печью.
    if (p === 'baker' || p === 'potter' || p === 'confectioner') {
      const cx = p === 'baker' ? -1.05 : p === 'potter' ? -0.98 : -0.98;
      k.cyl(0.11, 0.11, 0.9, '#8a8f99', cx, 0.12 + H, p === 'baker' ? -1.02 : -0.88, 10).cyl(0.15, 0.13, 0.08, '#6b6f78', cx, 1.02 + H, p === 'baker' ? -1.02 : -0.88, 10);
    }
    // Полосатый навес с фестонами и стойками.
    for (let i = 0; i < 8; i += 1) k.add(new THREE.BoxGeometry(W / 8, 0.05, 0.75), i % 2 ? b : a, T(-W / 2 + W / 16 + (i * W) / 8, 0.12 + H - 0.1, D / 2 + 0.3, 1, 1, 1, 0.42));
    for (let i = 0; i < 8; i += 1) k.ball(W / 16, i % 2 ? b : a, -W / 2 + W / 16 + (i * W) / 8, 0.12 + H - 0.28, D / 2 + 0.64, 1, 0.6, 0.4);
    k.box(W + 0.05, 0.04, 0.04, beam, 0, 0.12 + H - 0.32, D / 2 + 0.66);
  });
  // Вывеска: над навесом перед скатом крыши (у трёхэтажной — на стене второго этажа). Прячется при взгляде внутрь.
  const sg = level >= 3 ? sign(def.icon, a, 0, H + 0.85, -0.3 + (D - 0.6) / 2 + 0.04, 0.27) : sign(def.icon, a, 0, 0.12 + H + 0.26, D / 2 + 0.45, level >= 2 ? 0.36 : 0.32);
  if (level < 3) sg.rotation.x = -0.35;
  k.cutExtra.push(sg);
  return k.build(`work_${type}`);
}

// ─── Храм, благоустройство, развлечения ────────────────────────────────

function temple(): THREE.Group {
  const k = new Kit();
  // Три ступени-яруса, мощение лучами, бордюр.
  k.cyl(1.95, 2.0, 0.12, '#d9d1c2', 0, 0, 0, 40).cyl(1.8, 1.85, 0.12, '#e8e1d4', 0, 0.12, 0, 40).cyl(1.62, 1.68, 0.12, '#f4efe6', 0, 0.24, 0, 40);
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    k.fine(() => { k.cbox(0.02, 0.01, 1.2, '#ddd4c4', Math.sin(a) * 0.95, 0.365, Math.cos(a) * 0.95, 0, a, 0); });
  }
  k.ring(1.1, 0.02, '#ddd4c4', 0, 0.365, 0, Math.PI / 2);
  // Восемь колонн с базой и капителью.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 1.35;
    const z = Math.cos(a) * 1.35;
    k.cyl(0.17, 0.19, 0.1, '#e8e1d4', x, 0.36, z, 12).cyl(0.11, 0.13, 1.5, '#ffffff', x, 0.46, z, 12);
    k.fine(() => { for (let j = 0; j < 4; j += 1) k.ring(0.12, 0.012, '#efe8dc', x, 0.7 + j * 0.35, z, Math.PI / 2); });
    k.cyl(0.18, 0.13, 0.1, '#f2c14e', x, 1.96, z, 12);
  }
  // Карниз с зубчиками.
  k.cyl(1.6, 1.6, 0.18, '#f4efe6', 0, 2.06, 0, 40).ring(1.6, 0.04, '#f2c14e', 0, 2.24, 0, Math.PI / 2);
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2;
    k.cbox(0.08, 0.06, 0.06, '#e8e1d4', Math.sin(a) * 1.6, 2.1, Math.cos(a) * 1.6, 0, a, 0);
  }
  // Золотой купол с рёбрами, фонарик наверху, шпиль со звездой.
  k.add(new THREE.SphereGeometry(1.45, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), '#f2c14e', T(0, 2.24, 0, 1, 0.75, 1));
  k.at(T(0, 2.24, 0, 1, 0.75, 1), () => {
    for (let i = 0; i < 8; i += 1) k.add(new THREE.TorusGeometry(1.46, 0.03, 4, 20, Math.PI / 2), '#ffd970', T(0, 0, 0, 1, 1, 1, 0, (i / 8) * Math.PI * 2, 0));
  });
  k.cyl(0.22, 0.26, 0.28, '#f4efe6', 0, 3.28, 0, 12).cone(0.3, 0.3, '#f2c14e', 0, 3.56, 0, 12).cyl(0.02, 0.02, 0.3, '#f2c14e', 0, 3.86, 0, 6);
  k.add(new THREE.OctahedronGeometry(0.1, 0), '#ffe08a', T(0, 4.22, 0, 1, 1.4, 0.5));
  // Алтарь с чашей огня и подношениями вокруг (рыбки, цветы, свечи).
  k.cyl(0.32, 0.4, 0.55, '#d9cbb8', 0, 0.36, 0, 16).cyl(0.42, 0.3, 0.18, '#c99a3a', 0, 0.91, 0, 16).ring(0.42, 0.02, '#ffe08a', 0, 1.09, 0, Math.PI / 2);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.sin(a) * 0.62;
    const z = Math.cos(a) * 0.62;
    if (i % 3 === 0) k.cyl(0.1, 0.08, 0.04, '#ffffff', x, 0.36, z, 10).ball(0.05, '#ff9a5a', x, 0.42, z, 1.6, 0.6, 0.8);
    else if (i % 3 === 1) for (let j = 0; j < 3; j += 1) k.ball(0.04, ['#ff7eb6', '#ffd93d', '#ffffff'][j]!, x + (j - 1) * 0.05, 0.4, z);
    else {
      k.cyl(0.025, 0.025, 0.1, '#fff7ec', x, 0.36, z, 6);
      k.mesh(new THREE.ConeGeometry(0.02, 0.05, 6), MAT.fireCore, T(x, 0.49, z));
    }
  }
  // Каменные фонари у входа и сакуры за храмом.
  for (const sx of [-1, 1]) {
    const x = sx * 1.8;
    k.box(0.26, 0.08, 0.26, '#bdb6aa', x, 0, 1.62).cyl(0.06, 0.07, 0.42, '#c9c2b6', x, 0.08, 1.62, 8).box(0.3, 0.05, 0.3, '#bdb6aa', x, 0.5, 1.62).box(0.22, 0.2, 0.22, '#d9d2c6', x, 0.55, 1.62).cone(0.24, 0.16, '#bdb6aa', x, 0.75, 1.62, 4);
    k.mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.glow, T(x, 0.65, 1.62 + 0.08));
    k.cyl(0.07, 0.1, 0.8, '#7a5236', sx * 1.55, 0, -1.55, 8).ball(0.48, '#ffb7d0', sx * 1.55, 1.05, -1.55).ball(0.32, '#ffc9dc', sx * 1.55 + sx * 0.3, 0.85, -1.35).ball(0.3, '#ff9fc0', sx * 1.55 - sx * 0.25, 1.25, -1.75);
  }
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

// ─── Благоустройство и развлечения ─────────────────────────────────────

function tree(k: Kit, x: number, z: number, s = 1, color = '#6dbb5e'): void {
  k.cyl(0.08 * s, 0.12 * s, 0.75 * s, '#8b5a3c', x, 0, z, 8);
  k.ball(0.5 * s, color, x, 1.0 * s, z).ball(0.34 * s, shade(color, 1.12), x + 0.28 * s, 1.18 * s, z + 0.12 * s).ball(0.32 * s, shade(color, 0.88), x - 0.26 * s, 0.82 * s, z + 0.18 * s);
}
function bench(k: Kit, x: number, z: number, color = '#c49a6c'): void {
  for (let i = 0; i < 3; i += 1) k.box(1.0, 0.03, 0.09, color, x, 0.26, z - 0.11 + i * 0.11);
  for (let i = 0; i < 2; i += 1) k.cbox(1.0, 0.08, 0.025, color, x, 0.42 + i * 0.12, z - 0.17, -0.15);
  for (const sx of [-1, 1]) k.box(0.05, 0.26, 0.05, '#3f4652', x + sx * 0.45, 0, z + 0.1).box(0.05, 0.55, 0.05, '#3f4652', x + sx * 0.45, 0, z - 0.15).box(0.05, 0.04, 0.32, '#3f4652', x + sx * 0.47, 0.36, z - 0.02);
}
/** Мощение плиткой в два тона. */
function paving(k: Kit, w: number, d: number, c1: string, c2: string, x = 0, z = 0, cell = 0.42): void {
  k.box(w, 0.05, d, shade(c1, 0.9), x, 0, z);
  const nx = Math.round(w / cell);
  const nz = Math.round(d / cell);
  k.fine(() => { for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) k.box(w / nx - 0.03, 0.012, d / nz - 0.03, (i + j) % 2 ? c1 : c2, x - w / 2 + (i + 0.5) * (w / nx), 0.05, z - d / 2 + (j + 0.5) * (d / nz)); });
}
/** Подстриженная изгородь вдоль x. */
function hedge(k: Kit, x: number, z: number, len: number, color = '#4f9d4c'): void {
  k.box(len, 0.32, 0.3, color, x, 0.05, z);
  for (let i = 0; i < Math.round(len / 0.3); i += 1) k.ball(0.17, shade(color, i % 2 ? 1.08 : 0.95), x - len / 2 + 0.15 + i * 0.3, 0.38, z, 1, 0.55, 1);
}
/** Цветок: стебель, листик и головка (тюльпан, ромашка или колокольчик). */
function flower(k: Kit, x: number, z: number, color: string, kind: number, h = 0.22, y0 = 0.05): void {
  k.cyl(0.01, 0.012, h, '#3f8f3a', x, y0, z, 4).ball(0.03, '#5aa856', x + 0.03, y0 + h * 0.4, z, 1.4, 0.4, 0.8);
  if (kind === 0) k.cone(0.045, 0.08, color, x, y0 + h - 0.02, z, 6);
  else if (kind === 1) {
    for (let i = 0; i < 5; i += 1) k.ball(0.025, color, x + Math.cos(i * 1.256) * 0.04, y0 + h, z + Math.sin(i * 1.256) * 0.04, 1, 0.5, 1);
    k.ball(0.022, '#ffd93d', x, y0 + h + 0.01, z);
  } else k.ball(0.045, color, x, y0 + h, z, 1, 0.8, 1);
}
const PETALS = ['#ff7eb6', '#ffd93d', '#ff6b6b', '#b28dff', '#ffffff', '#ff9a5a'];
/** Гирлянда огоньков между двумя точками (провисает). */
function garland(k: Kit, a: [number, number, number], b: [number, number, number], n = 9): void {
  for (let i = 1; i < n; i += 1) {
    const u = i / n;
    const x = a[0] + (b[0] - a[0]) * u;
    const z = a[2] + (b[2] - a[2]) * u;
    const y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.22;
    k.mesh(new THREE.SphereGeometry(0.035, 6, 4), i % 3 ? MAT.glow : MAT.bulb, T(x, y, z));
  }
}

function amenityOrFun(type: BuildingId): THREE.Group {
  const k = new Kit();
  const name = type;
  const ground = (c = '#a8d98a'): Kit => k.box(3.4, 0.05, 3.4, c, 0, 0, 0);
  switch (type) {
    case 'garden': {
      ground('#a3d688');
      // Дорожка из плит, бордюр из цветов, изгородь сзади, деревья, лавочки, поилка для птиц, фонарь.
      k.box(0.72, 0.02, 3.4, '#d9c9a8', 0, 0.05, 0);
      for (let i = 0; i < 7; i += 1) k.box(0.6, 0.02, 0.38, i % 2 ? '#efe2c6' : '#e6d6b6', 0, 0.065, -1.45 + i * 0.48);
      hedge(k, -1.1, -1.5, 1.0);
      hedge(k, 1.1, -1.5, 1.0);
      for (let i = 0; i < 7; i += 1) for (const sx of [-1, 1]) flower(k, sx * 0.45, -1.3 + i * 0.4, PETALS[(i + (sx > 0 ? 2 : 0)) % PETALS.length]!, i % 3, 0.18);
      tree(k, -1.05, -0.75, 1.1);
      tree(k, 1.1, -0.7, 1.0, '#7cc46a');
      tree(k, 1.3, 0.25, 0.65, '#5fae5a');
      k.cyl(0.08, 0.12, 0.3, '#d9d2c6', 0, 0.05, -0.35, 10).cyl(0.26, 0.18, 0.08, '#d9d2c6', 0, 0.35, -0.35, 14);
      k.mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), MAT.water, T(0, 0.43, -0.35));
      k.ball(0.05, '#5c8fd6', 0.12, 0.47, -0.3, 1.3, 0.9, 0.9).cone(0.02, 0.04, '#ffb347', 0.18, 0.47, -0.3, 4);
      bench(k, -0.95, 1.0);
      bench(k, 0.95, 1.0);
      lampPost(k, -1.5, 0.35, 1.0);
      break;
    }
    case 'flowerbed': {
      ground('#a3d688');
      // Три клумбы с каменным бортиком: тюльпаны, ромашки, подсолнухи; заборчик сзади, лейка.
      for (const [x, z, r, n] of [[-0.8, -0.6, 0.6, 0], [0.8, -0.5, 0.55, 1], [0, 0.45, 0.65, 2]] as const) {
        k.cyl(r + 0.06, r + 0.08, 0.12, '#c9c2b6', x, 0.05, z, 18).cyl(r, r, 0.14, '#7a5236', x, 0.06, z, 18);
        for (let i = 0; i < 14; i += 1) {
          const a = i * 2.4;
          const rr = Math.sqrt((i + 0.5) / 14) * r * 0.82;
          flower(k, x + Math.sin(a) * rr, z + Math.cos(a) * rr, PETALS[(i + n * 2) % PETALS.length]!, n === 2 ? i % 3 : n, 0.18 + (i % 3) * 0.04, 0.2);
        }
      }
      for (let i = 0; i < 3; i += 1) {
        const x = 1.2 + (i - 1) * 0.18;
        k.cyl(0.015, 0.02, 0.8, '#5aa856', x, 0.05, 0.75, 4).cyl(0.11, 0.11, 0.03, '#ffcf33', x, 0.85, 0.82, 12, Math.PI / 2 - 0.3).cyl(0.05, 0.05, 0.035, '#7a5236', x, 0.86, 0.84, 10, Math.PI / 2 - 0.3);
      }
      for (let i = -7; i <= 7; i += 1) k.box(0.06, 0.32, 0.03, '#ffffff', i * 0.22, 0.05, -1.5).cone(0.04, 0.06, '#ffffff', i * 0.22, 0.37, -1.5, 4);
      k.box(3.2, 0.04, 0.03, '#ffffff', 0, 0.25, -1.48);
      k.cyl(0.1, 0.11, 0.16, '#7fb6d9', -1.3, 0.05, 0.9, 10).cbox(0.025, 0.025, 0.2, '#7fb6d9', -1.3, 0.18, 1.05, 0.6).box(0.02, 0.08, 0.14, '#7fb6d9', -1.3, 0.22, 0.85);
      break;
    }
    case 'lanterns': {
      paving(k, 3.4, 3.4, '#e6dccb', '#d9cbb8');
      // Площадь с узорным кругом для танцев, фигурные фонари и гирлянды между ними.
      k.cyl(0.85, 0.85, 0.015, '#f2c14e', 0, 0.065, 0.2, 24).cyl(0.65, 0.65, 0.018, '#fff3d6', 0, 0.065, 0.2, 24).cyl(0.4, 0.4, 0.02, '#ff9fb8', 0, 0.065, 0.2, 24);
      const posts: Array<[number, number]> = [
        [-1.2, -1.0],
        [1.2, -1.0],
        [-1.2, 1.0],
        [1.2, 1.0],
      ];
      for (const [x, z] of posts) {
        k.cyl(0.12, 0.14, 0.12, '#3f4652', x, 0.05, z, 10).cyl(0.04, 0.06, 1.35, '#3f4652', x, 0.17, z, 8).ring(0.06, 0.015, '#f2c14e', x, 0.9, z, Math.PI / 2);
        k.box(0.26, 0.04, 0.26, '#3f4652', x, 1.5, z).cone(0.2, 0.18, '#3f4652', x, 1.86, z, 4).ball(0.03, '#f2c14e', x, 2.06, z);
        for (const [dx, dz] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]] as const) k.box(0.02, 0.32, 0.02, '#3f4652', x + dx, 1.54, z + dz);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), MAT.glow);
        l.position.set(x, 1.7, z);
        l.name = 'lamp';
        k.extra.push(l);
      }
      garland(k, [-1.2, 1.45, -1.0], [1.2, 1.45, -1.0]);
      garland(k, [-1.2, 1.45, 1.0], [1.2, 1.45, 1.0]);
      garland(k, [-1.2, 1.45, -1.0], [-1.2, 1.45, 1.0], 7);
      garland(k, [1.2, 1.45, -1.0], [1.2, 1.45, 1.0], 7);
      tree(k, 0, -1.35, 0.7, '#7cc46a');
      for (const sx of [-1, 1]) k.cyl(0.16, 0.13, 0.22, '#c96f4a', sx * 0.5, 0.05, -1.3, 10).ball(0.16, '#62b35c', sx * 0.5, 0.36, -1.3).ball(0.05, '#ff7eb6', sx * 0.5 + 0.07, 0.46, -1.24);
      break;
    }
    case 'fountain': {
      paving(k, 3.4, 3.4, '#ece2d0', '#ddd0bb');
      // Чаша с каменным бортом, рыбка-статуя наверху, кувшинки и монетки в воде.
      k.cyl(1.25, 1.3, 0.3, '#c9d4de', 0, 0.05, -0.1, 32).ring(1.22, 0.07, '#dfe7ee', 0, 0.36, -0.1, Math.PI / 2);
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        k.cbox(0.02, 0.26, 0.04, '#b4c0cb', Math.sin(a) * 1.3, 0.2, -0.1 + Math.cos(a) * 1.3, 0, a, 0);
      }
      k.cyl(0.18, 0.24, 0.85, '#c9d4de', 0, 0.35, -0.1, 14).ring(0.2, 0.03, '#dfe7ee', 0, 0.7, -0.1, Math.PI / 2);
      k.cyl(0.5, 0.32, 0.14, '#c9d4de', 0, 1.1, -0.1, 20).ring(0.5, 0.035, '#dfe7ee', 0, 1.24, -0.1, Math.PI / 2);
      k.mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.02, 20), MAT.water, T(0, 1.22, -0.1));
      fish(k, 0, 1.4, -0.1, '#b4c0cb', 1.5, Math.PI / 2);
      for (const [x, z] of [[0.6, 0.45], [-0.7, 0.2], [0.35, -0.75]] as const) k.cyl(0.13, 0.13, 0.01, '#7cc46a', x, 0.33, z, 10).ball(0.035, '#ff9fc8', x + 0.04, 0.36, z);
      for (let i = 0; i < 5; i += 1) k.cyl(0.025, 0.025, 0.005, '#f2c14e', -0.4 + i * 0.2, 0.31, 0.5 - (i % 2) * 0.2, 8);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.04, 32), MAT.water);
      w.position.set(0, 0.3, -0.1);
      k.extra.push(w);
      const jet = new THREE.Group();
      jet.name = 'jet';
      jet.add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 16, 1, true), MAT.water));
      jet.position.set(0, 1.6, -0.1);
      jet.rotation.x = Math.PI;
      k.extra.push(jet);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.14, 0.11, 0.2, '#c96f4a', sx * 1.5, 0.05, sz * 1.45, 10).ball(0.15, '#62b35c', sx * 1.5, 0.35, sz * 1.45).ball(0.04, PETALS[(sx + sz + 4) % 6]!, sx * 1.5 + 0.06, 0.45, sz * 1.45 + 0.06);
      break;
    }
    case 'statue': {
      paving(k, 3.4, 3.4, '#ece2d0', '#ddd0bb');
      // Ступенчатый постамент с табличкой и сидящий каменный кот-основатель в короне.
      k.box(1.3, 0.12, 1.3, '#c9c2b6', 0, 0.05, -0.2).box(1.1, 0.6, 1.1, '#d9d2c6', 0, 0.17, -0.2).box(1.2, 0.08, 1.2, '#c9c2b6', 0, 0.77, -0.2);
      k.box(0.6, 0.18, 0.02, '#c99a3a', 0, 0.4, 0.36).box(0.5, 0.02, 0.025, '#8a6a2a', 0, 0.46, 0.365).box(0.4, 0.02, 0.025, '#8a6a2a', 0, 0.42, 0.365);
      const st = '#c4bdb1';
      k.ball(0.38, st, 0, 1.2, -0.25, 1, 1.15, 0.9).ball(0.14, shade(st, 1.05), -0.14, 0.92, 0.05, 1, 0.7, 1.3).ball(0.14, shade(st, 1.05), 0.14, 0.92, 0.05, 1, 0.7, 1.3);
      k.ball(0.42, st, 0, 1.8, -0.2, 1.12, 0.95, 1).ball(0.16, shade(st, 1.08), 0, 1.7, 0.15, 1.2, 0.8, 0.6);
      k.cone(0.15, 0.28, shade(st, 0.95), -0.28, 2.08, -0.2, 8).cone(0.15, 0.28, shade(st, 0.95), 0.28, 2.08, -0.2, 8);
      k.ball(0.04, '#8f887c', -0.14, 1.88, 0.18).ball(0.04, '#8f887c', 0.14, 1.88, 0.18);
      k.add(new THREE.TorusGeometry(0.28, 0.07, 6, 14, Math.PI * 1.3), shade(st, 0.95), T(0.3, 0.92, -0.2, 1, 1, 1, Math.PI / 2, 0, -0.6));
      k.cyl(0.24, 0.26, 0.12, '#f2c14e', 0, 2.18, -0.2, 10);
      for (let i = 0; i < 5; i += 1) k.cone(0.05, 0.1, '#f2c14e', Math.sin(i * 1.256) * 0.22, 2.3, -0.2 + Math.cos(i * 1.256) * 0.22, 4);
      for (const sx of [-1, 1]) {
        hedge(k, sx * 1.2, -1.45, 0.9);
        k.cyl(0.14, 0.11, 0.2, '#c96f4a', sx * 0.85, 0.05, 0.55, 10).ball(0.15, '#62b35c', sx * 0.85, 0.35, 0.55).ball(0.05, '#ffd93d', sx * 0.85 + 0.05, 0.45, 0.6);
      }
      break;
    }
    case 'playground': {
      ground('#f2d9a6');
      // Мягкое покрытие пятнами, горка с лесенкой и перилами, качели, песочница с ведёрком, рыбка-качалка.
      for (const [x, z, c] of [[-1.0, -0.4, '#ffb3b3'], [0.85, -0.4, '#b3d9ff'], [0.7, 1.05, '#c9f2b3']] as const) k.cyl(0.62, 0.62, 0.012, c, x, 0.05, z, 20);
      for (const sx of [-1, 1]) k.box(0.06, 1.05, 0.06, '#ff6b6b', -1.05 + sx * 0.2, 0.05, -0.75);
      for (let i = 0; i < 5; i += 1) k.box(0.4, 0.03, 0.04, '#ffd93d', -1.05, 0.2 + i * 0.19, -0.75);
      k.box(0.5, 0.06, 0.4, '#ffd93d', -1.05, 1.0, -0.6).cone(0.38, 0.35, '#ff6b6b', -1.05, 1.5, -0.6, 4);
      for (const sx of [-1, 1]) k.box(0.04, 0.45, 0.04, '#ff6b6b', -1.05 + sx * 0.22, 1.06, -0.45);
      k.box(0.45, 0.05, 1.3, '#5c8fd6', -1.05, 0.55, 0.0, -0.75);
      for (const sx of [-1, 1]) k.box(0.04, 0.1, 1.3, '#4a7bc0', -1.05 + sx * 0.23, 0.6, 0.0, -0.75);
      k.box(0.08, 1.3, 0.08, '#7cbf6b', 0.3, 0.05, -0.35).box(0.08, 1.3, 0.08, '#7cbf6b', 1.4, 0.05, -0.35).box(1.2, 0.08, 0.08, '#7cbf6b', 0.85, 1.32, -0.35);
      for (const x of [0.3, 1.4]) k.cbox(0.06, 1.3, 0.06, '#7cbf6b', x, 0.7, -0.55, -0.3).cbox(0.06, 1.3, 0.06, '#7cbf6b', x, 0.7, -0.15, 0.3);
      for (const x of [0.55, 1.15]) {
        const sw = new THREE.Group();
        sw.name = 'swing';
        sw.position.set(x, 1.32, -0.35);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: '#ff8fc1' }));
        seat.position.y = -1.0;
        for (const dx of [-0.13, 0.13]) {
          const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), new THREE.MeshStandardMaterial({ color: '#777' }));
          ch.position.set(dx, -0.5, 0);
          sw.add(ch);
        }
        sw.add(seat);
        k.extra.push(sw);
      }
      k.box(1.0, 0.12, 0.8, '#c49a6c', -0.2, 0.05, 1.05).box(0.9, 0.04, 0.7, '#f7e3b0', -0.2, 0.13, 1.05);
      k.ball(0.1, '#f7e3b0', -0.35, 0.17, 1.0, 1.4, 0.6, 1.2).cyl(0.06, 0.045, 0.1, '#ff6b6b', 0.05, 0.17, 1.2, 8).box(0.04, 0.02, 0.18, '#5c8fd6', -0.05, 0.18, 0.9, 0, 0.6);
      k.cyl(0.02, 0.02, 0.25, '#888888', 0.75, 0.05, 1.15, 6);
      k.at(T(0.75, 0.42, 1.15, 1, 1, 1, 0, 0.5, 0), () => {
        k.ball(0.2, '#ffd93d', 0, 0, 0, 1.6, 0.9, 0.8).add(new THREE.ConeGeometry(0.14, 0.2, 4), '#ffb347', T(0.38, 0, 0, 1, 1, 0.4, 0, 0, -Math.PI / 2));
        k.ball(0.03, '#2a2a2a', -0.2, 0.06, 0.13).box(0.12, 0.03, 0.03, '#ff6b6b', -0.05, 0.17, 0);
      });
      break;
    }
    case 'cafe': {
      paving(k, 3.4, 3.4, '#f0e4d0', '#e2d2b8');
      // Домик кафе: окна-витрины, полосатая маркиза, вывеска-чашка, ящики с цветами, доска с меню.
      k.box(2.8, 1.5, 0.8, '#fff1d6', 0, 0.05, -1.3);
      k.at(T(0, 1.55, -1.3), () => k.shingles(2.8, 0.8, 0.45, '#d95f8b', '#fff1d6', 3));
      k.window(-0.85, 0.85, -0.9, 0.6, 0.55, false, undefined, '#ffffff').window(0.85, 0.85, -0.9, 0.6, 0.55, false, undefined, '#ffffff');
      k.box(0.42, 0.75, 0.05, '#8b5a3c', 0, 0.05, -0.88).ball(0.025, '#f2c94c', 0.14, 0.45, -0.85);
      for (let i = 0; i < 10; i += 1) k.cbox(0.28, 0.035, 0.42, i % 2 ? '#ffffff' : '#ff8fc1', -1.26 + i * 0.28, 1.36, -0.7, 0.45);
      for (let i = 0; i < 10; i += 1) k.ball(0.14, i % 2 ? '#ffffff' : '#ff8fc1', -1.26 + i * 0.28, 1.25, -0.52, 1, 0.5, 0.3);
      for (const sx of [-1, 1]) {
        k.box(0.62, 0.1, 0.14, '#9b6b43', sx * 0.85, 0.48, -0.85);
        for (let i = -2; i <= 2; i += 1) k.ball(0.045, PETALS[(i + 2 + (sx > 0 ? 1 : 0)) % 6]!, sx * 0.85 + i * 0.12, 0.62, -0.85);
      }
      chalkboard(k, 1.45, 0.05, '#ff8fc1');
      for (const [x, z] of [[-0.85, 0.55], [0.85, 0.55], [0, -0.65]] as const) {
        k.cyl(0.24, 0.24, 0.04, '#ffffff', x, 0.42, z, 16).cyl(0.025, 0.06, 0.42, '#555', x, 0.05, z, 6);
        k.cyl(0.045, 0.035, 0.05, '#ffffff', x - 0.07, 0.46, z, 8).cyl(0.04, 0.04, 0.008, '#7a4c31', x - 0.07, 0.5, z, 8).cyl(0.07, 0.07, 0.01, '#ffffff', x + 0.08, 0.46, z + 0.02, 10).ball(0.035, '#ff9fc8', x + 0.08, 0.49, z + 0.02, 1, 0.7, 1);
        if (z > 0) {
          k.cyl(0.02, 0.02, 1.2, '#888', x, 0.42, z, 6).cone(0.62, 0.28, x < 0 ? '#ff8fc1' : '#7fb6d9', x, 1.5, z, 12);
          for (let i = 0; i < 12; i += 1) k.ball(0.04, '#ffffff', x + Math.sin((i / 12) * Math.PI * 2) * 0.62, 1.48, z + Math.cos((i / 12) * Math.PI * 2) * 0.62);
        }
        for (const sx of [-1, 1]) k.cyl(0.13, 0.13, 0.05, '#c49a6c', x + sx * 0.4, 0.24, z, 12).cyl(0.025, 0.025, 0.22, '#555', x + sx * 0.4, 0.05, z, 6);
      }
      break;
    }
    case 'pond': {
      ground('#a3d688');
      // Пруд: камни по берегу, камыши, кувшинки с цветами, уточка, мостки с перилами, удочка у столбика.
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.04, 32), MAT.water);
      w.scale.set(1.1, 1, 0.8);
      w.position.set(0, 0.06, -0.55);
      k.extra.push(w);
      k.cyl(1.5, 1.5, 0.05, '#c4b49a', 0, 0.02, -0.55, 32);
      for (let i = 0; i < 22; i += 1) {
        const a = (i / 22) * Math.PI * 2;
        if (a > 2.6 && a < 3.7) continue;
        k.add(new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.03, 0), ['#b9b7b0', '#a8a49b', '#cfcac0'][i % 3]!, T(Math.sin(a) * 1.6, 0.06, -0.55 + Math.cos(a) * 1.28, 1, 0.6, 1, i, i * 0.7, 0));
      }
      k.box(1.9, 0.08, 0.5, '#b5835a', 0, 0.12, 0.25);
      k.fine(() => { for (let i = 0; i < 6; i += 1) k.box(0.012, 0.005, 0.5, '#8b5a3c', -0.8 + i * 0.32, 0.2, 0.25); });
      for (const x of [-0.85, 0.85]) k.box(0.08, 0.2, 0.08, '#8b5a3c', x, 0, 0.45).box(0.06, 0.4, 0.06, '#8b5a3c', x, 0.2, 0.47);
      k.box(1.76, 0.04, 0.04, '#8b5a3c', 0, 0.55, 0.47);
      for (let i = 0; i < 9; i += 1) {
        const x = -1.35 + (i % 3) * 0.12 + (i > 5 ? 0.05 : 0);
        const z = -1.05 + Math.floor(i / 3) * 0.13;
        k.cyl(0.012, 0.018, 0.5 + (i % 3) * 0.12, '#5f9e4f', x, 0.05, z, 4);
        if (i % 2) k.cyl(0.025, 0.025, 0.12, '#7a5236', x, 0.48 + (i % 3) * 0.12, z, 6);
      }
      for (const [x, z, r] of [[0.7, -0.9, 0.18], [0.3, -1.2, 0.14], [-0.4, -0.4, 0.15], [1.0, -0.4, 0.12]] as const) {
        k.add(new THREE.CylinderGeometry(r, r, 0.01, 12, 1, false, 0, Math.PI * 1.8), '#7cc46a', T(x, 0.09, z));
        if (r > 0.14) k.ball(0.05, '#ffc9dc', x, 0.12, z, 1, 0.7, 1).ball(0.025, '#ffd93d', x, 0.15, z);
      }
      k.at(T(-0.6, 0.12, -0.8, 1, 1, 1, 0, 0.6, 0), () => {
        k.ball(0.12, '#ffd93d', 0, 0.04, 0, 1.4, 0.8, 1).ball(0.08, '#ffd93d', -0.12, 0.16, 0).cone(0.035, 0.07, '#ff9a1f', -0.22, 0.14, 0, 4).ball(0.015, '#2a2a2a', -0.16, 0.2, 0.05);
      });
      break;
    }
    case 'cattower': {
      paving(k, 3.4, 3.4, '#f2e6f6', '#e6d6ec');
      // Когтеточки с канатом, площадки с подушками, гамак, домик с крышей, висящие игрушки.
      k.cyl(0.13, 0.13, 2.2, '#e2c08f', 0, 0.05, -0.1, 12);
      k.fine(() => { for (let y = 0.15; y < 2.1; y += 0.07) k.ring(0.135, 0.012, '#c9a77a', 0, y, -0.1, Math.PI / 2); });
      for (const [x, y, z, r] of [[-0.2, 0.7, 0.25, 0.42], [0.3, 1.3, -0.05, 0.38], [-0.25, 1.9, -0.2, 0.42]] as const) {
        k.cyl(r, r, 0.08, '#c77dd6', x, y - 0.08, z, 18).cyl(r * 0.92, r * 0.92, 0.03, '#e8c2f2', x, y, z, 18).ring(r * 0.9, 0.035, '#f6dcfb', x, y + 0.03, z, Math.PI / 2);
        k.cyl(0.04, 0.04, y - 0.15, '#e2c08f', x + (x > 0 ? 0.2 : -0.2), 0.05, z, 8);
      }
      for (let i = 0; i < 2; i += 1) {
        const x = [-0.2, 0.3][i]!;
        const y = [0.7, 1.3][i]!;
        const z = [0.25, -0.05][i]!;
        k.cyl(0.004, 0.004, 0.3, '#888', x + 0.25, y - 0.38, z + 0.2, 4).ball(0.05, ['#ff6b6b', '#7fb6d9'][i]!, x + 0.25, y - 0.4, z + 0.2);
      }
      k.box(0.6, 0.45, 0.6, '#c77dd6', 0.75, 0.05, -0.6).at(T(0.75, 0.5, -0.6), () => k.shingles(0.6, 0.6, 0.25, '#9b59b6', '#c77dd6', 2));
      k.add(new THREE.CircleGeometry(0.16, 14), '#5a3b66', T(0.75, 0.25, -0.29));
      k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8), '#ffcf6b', T(-0.85, 0.85, -0.9, 1, 0.5, 1, 0, 0, Math.PI / 2));
      for (const sx of [-1, 1]) k.cyl(0.03, 0.03, 0.9, '#9b6b43', -0.85 + sx * 0.32, 0.05, -0.9, 6);
      k.ball(0.07, '#ff6b6b', 0.4, 1.0, 0.35).ball(0.06, '#ffd93d', -0.9, 0.1, 0.6).ring(0.05, 0.012, '#ff6b6b', -0.9, 0.1, 0.6, 0.5, 0.3);
      k.ball(0.05, '#ffffff', 1.1, 0.1, 0.4, 1.6, 0.8, 0.8).cone(0.03, 0.08, '#ff9fc8', 1.2, 0.08, 0.4, 4);
      break;
    }
    case 'market': {
      paving(k, 3.4, 3.4, '#f0e4d0', '#e2d2b8');
      // Три лотка с вещами для кошек (бантики, бубенцы, шарфы), полосатые навесы, ящики; лавка сзади.
      k.box(3.0, 1.0, 0.5, '#f0d7b8', 0, 0.05, -1.25).box(3.1, 0.08, 0.6, '#c49a6c', 0, 1.05, -1.25);
      k.window(-0.9, 0.62, -1.0, 0.5, 0.4, false, '#7fb6d9').window(0.9, 0.62, -1.0, 0.5, 0.4, false, '#ff8fc1');
      for (const [x, c] of [[-1.05, '#ff6b6b'], [0, '#5c8fd6'], [1.05, '#7cbf6b']] as const) {
        k.box(0.9, 0.5, 0.5, '#c49a6c', x, 0.05, 0.4).box(0.95, 0.04, 0.55, '#e2c08f', x, 0.55, 0.4);
        for (let i = 0; i < 3; i += 1) k.box(0.012, 0.42, 0.012, '#9b6b43', x - 0.3 + i * 0.3, 0.09, 0.66);
        for (const sx of [-1, 1]) k.box(0.05, 1.2, 0.05, '#8b5a3c', x + sx * 0.42, 0.05, 0.15);
        for (let i = 0; i < 4; i += 1) k.add(new THREE.BoxGeometry(0.24, 0.04, 0.7), i % 2 ? '#ffffff' : c, T(x - 0.33 + i * 0.22, 1.3, 0.35, 1, 1, 1, 0.3));
        for (let i = 0; i < 4; i += 1) k.ball(0.06, i % 2 ? '#ffffff' : c, x - 0.33 + i * 0.22, 1.18, 0.68, 1, 0.6, 0.4);
      }
      // Товар: бантики, бубенцы, свёрнутые шарфики, очки.
      for (let i = 0; i < 3; i += 1) k.ball(0.05, '#ff7eb6', -1.3 + i * 0.25, 0.63, 0.4, 1.3, 0.6, 0.6).ball(0.025, '#ff3b6b', -1.3 + i * 0.25, 0.63, 0.43);
      for (let i = 0; i < 3; i += 1) k.ball(0.055, '#f2c14e', -0.25 + i * 0.25, 0.64, 0.4).ring(0.02, 0.008, '#c99a3a', -0.25 + i * 0.25, 0.7, 0.4);
      for (let i = 0; i < 3; i += 1) k.log(0.05, 0.18, ['#ff6b6b', '#7fb6d9', '#ffd93d'][i]!, 0.8 + i * 0.25, 0.64, 0.4);
      for (let i = 0; i < 4; i += 1) k.box(0.3, 0.22, 0.22, '#b5835a', -1.4 + (i % 2) * 2.8, 0.05 + Math.floor(i / 2) * 0.22, 1.2).box(0.31, 0.02, 0.23, '#9b6b43', -1.4 + (i % 2) * 2.8, 0.16 + Math.floor(i / 2) * 0.22, 1.2);
      garland(k, [-1.47, 1.25, 0.15], [1.47, 1.25, 0.15], 13);
      break;
    }
    case 'carousel': {
      ground('#f2d9a6');
      k.cyl(1.55, 1.6, 0.18, '#ffd6e8', 0, 0.05, 0, 36).ring(1.56, 0.04, '#ffe08a', 0, 0.23, 0, Math.PI / 2);
      for (let i = 0; i < 3; i += 1) k.box(0.5, 0.06, 0.25, '#ffe08a', 0, 0.05 + i * 0.06, 1.65 + i * 0.12);
      const top = new THREE.Group();
      top.name = 'spin';
      top.position.y = 0.23;
      const tk = new Kit();
      // Центральная колонна с зеркальными гранями, шатёр с полосами и фестонами, флажок, огоньки.
      tk.cyl(0.32, 0.32, 1.85, '#ffe08a', 0, 0, 0, 8);
      for (let i = 0; i < 8; i += 1) tk.cbox(0.16, 1.3, 0.02, '#d6ecff', Math.sin((i / 8) * Math.PI * 2 + 0.39) * 0.31, 0.95, Math.cos((i / 8) * Math.PI * 2 + 0.39) * 0.31, 0, (i / 8) * Math.PI * 2 + 0.39, 0);
      tk.cyl(1.66, 1.66, 0.14, '#ffffff', 0, 1.85, 0, 24);
      for (let i = 0; i < 12; i += 1) tk.add(new THREE.ConeGeometry(1.66, 0.8, 24, 1, false, (i / 12) * Math.PI * 2, Math.PI / 6), i % 2 ? '#ffffff' : '#ff6b9d', T(0, 2.39, 0));
      for (let i = 0; i < 24; i += 1) tk.ball(0.11, i % 2 ? '#ffffff' : '#ff6b9d', Math.sin((i / 24) * Math.PI * 2) * 1.66, 1.8, Math.cos((i / 24) * Math.PI * 2) * 1.66, 1, 0.7, 0.4);
      tk.cyl(0.02, 0.02, 0.5, '#ffe08a', 0, 2.75, 0, 6).box(0.3, 0.18, 0.02, '#7fb6d9', 0.15, 3.05, 0).ball(0.08, '#ffe08a', 0, 2.78, 0);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.sin(a) * 1.15;
        const z = Math.cos(a) * 1.15;
        const c = ['#7fb6d9', '#ffd93d', '#9ad08d'][i % 3]!;
        tk.cyl(0.025, 0.025, 1.85, '#f2c14e', x, 0, z, 6);
        tk.fine(() => { for (let j = 0; j < 4; j += 1) tk.ring(0.03, 0.01, '#ffffff', x, 0.3 + j * 0.4, z, Math.PI / 2); });
        // Рыбка-лошадка с хвостом и глазками.
        tk.ball(0.18, c, x, 0.55, z, 1, 0.8, 1.5).cone(0.12, 0.2, c, x - Math.cos(a) * 0.3, 0.55, z + Math.sin(a) * 0.3, 4);
        tk.ball(0.025, '#2a2a2a', x + Math.cos(a) * 0.1 + Math.sin(a) * 0.15, 0.62, z - Math.sin(a) * 0.1 + Math.cos(a) * 0.15);
        tk.box(0.2, 0.03, 0.14, '#ff6b9d', x, 0.68, z, 0, a, 0);
      }
      for (let i = 0; i < 18; i += 1) tk.mesh(new THREE.SphereGeometry(0.035, 6, 4), i % 2 ? MAT.glow : MAT.bulb, T(Math.sin((i / 18) * Math.PI * 2) * 1.67, 1.92, Math.cos((i / 18) * Math.PI * 2) * 1.67));
      const tg = tk.build('carouselTop');
      top.add(tg);
      k.extra.push(top);
      break;
    }
    case 'cinema': {
      paving(k, 3.4, 3.4, '#e6dccb', '#d9cbb8');
      // Зал с ар-деко фасадом: вывеска с огоньками, афиши, касса, красная дорожка и столбики с канатом.
      k.box(3.0, 2.2, 2.4, '#5b4b8a', 0, 0.05, -0.4).box(3.2, 0.25, 2.6, '#3f3366', 0, 2.25, -0.4);
      for (let i = 0; i < 5; i += 1) k.box(0.1, 2.2, 0.06, '#6d5ca0', -1.35 + i * 0.675, 0.05, 0.82);
      k.box(1.2, 0.5, 0.2, '#3f3366', 0, 2.5, 0.6).box(1.0, 0.36, 0.22, '#ffe08a', 0, 2.57, 0.6);
      k.box(2.4, 0.5, 0.1, '#ffe08a', 0, 1.55, 0.82).box(2.3, 0.4, 0.11, '#2a2340', 0, 1.6, 0.82);
      for (let i = 0; i < 5; i += 1) k.box(0.3, 0.06, 0.12, ['#ff6b6b', '#ffd93d', '#7fb6d9', '#9ad08d', '#ff9fc8'][i]!, -0.8 + i * 0.4, 1.77, 0.83);
      k.box(1.0, 1.0, 0.05, '#2a2340', 0, 0.05, 0.81).box(0.02, 0.95, 0.06, '#f2c94c', 0, 0.07, 0.82);
      for (const [x, c, c2] of [[-1.0, '#ff6b6b', '#ffd93d'], [1.0, '#7fb6d9', '#ffffff']] as const) {
        k.box(0.66, 0.92, 0.05, '#f2c94c', x, 0.36, 0.82).box(0.56, 0.82, 0.06, c, x, 0.41, 0.82).ball(0.13, c2, x, 0.95, 0.86, 1, 1, 0.3).box(0.4, 0.06, 0.07, c2, x, 0.55, 0.83);
      }
      k.box(0.6, 0.02, 1.4, '#d6334d', 0, 0.05, 1.5);
      for (const sx of [-1, 1]) for (const z of [1.05, 1.55, 2.0]) k.cyl(0.04, 0.06, 0.38, '#f2c14e', sx * 0.45, 0.05, z, 8).ball(0.05, '#f2c14e', sx * 0.45, 0.45, z);
      for (const sx of [-1, 1]) for (const [z0, z1] of [[1.05, 1.55], [1.55, 2.0]] as const) k.cbox(0.025, 0.025, z1 - z0, '#d6334d', sx * 0.45, 0.36, (z0 + z1) / 2);
      k.box(0.5, 0.75, 0.4, '#7a5ab0', 1.25, 0.05, 1.35).box(0.4, 0.3, 0.02, '#cfe8ff', 1.25, 0.4, 1.56).box(0.6, 0.06, 0.5, '#3f3366', 1.25, 0.8, 1.35);
      for (let i = 0; i < 10; i += 1) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), i % 2 ? MAT.glow : MAT.bulb);
        l.position.set(-1.1 + i * 0.245, 1.86, 0.88);
        k.extra.push(l);
      }
      for (let i = 0; i < 6; i += 1) for (const y of [1.5, 1.9]) k.mesh(new THREE.SphereGeometry(0.03, 6, 4), MAT.glow, T(-1.18 + i * 0.47, y + (i % 2) * 0.0, 0.89));
      break;
    }
    default:
      ground();
  }
  const g = k.build(name);
  const d = buildingById(type);
  if (d.kind === 'fun' && type !== 'cinema') g.add(sign(d.icon, '#ffffff', 1.45, 1.1, 1.5, 0.22));
  if (type === 'cinema') g.add(sign(d.icon, '#ffe08a', 0, 2.57, 0.73, 0.2));
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
/** Где верх трубы (в осях клетки) — оттуда идёт дымок. */
export function chimneyOf(b: Pick<Building, 'kind' | 'type' | 'level'>): [number, number, number] | null {
  if (b.kind === 'house') {
    if (b.level < 2) return null;
    const w = [1.6, 2.0, 2.2, 2.4][b.level - 1]!;
    const h = [1.05, 1.25, 2.1, 2.2][b.level - 1]!;
    return [w / 2 - 0.45, 0.12 + h + 0.78, -0.5];
  }
  if (b.type === 'bakery') return [-1.05, 2.86, -1.02];
  if (b.type === 'pottery' || b.type === 'sweets') return [-0.98, 2.86, -0.88];
  return null;
}

export function buildingModel(b: Pick<Building, 'kind' | 'type' | 'level' | 'tint'>): THREE.Group {
  if (b.kind === 'house') return house(Math.max(1, Math.min(4, b.level)), b.tint);
  if (b.kind === 'workshop') return workshop(b.type, Math.max(1, Math.min(3, b.level)), b.tint);
  if (b.kind === 'temple') return temple();
  if (b.kind === 'ash') return ash();
  return amenityOrFun(b.type);
}

export const modelKey = (b: Pick<Building, 'kind' | 'type' | 'level' | 'tint'>): string => `${b.type}|${b.level}|${b.tint}`;

