import * as THREE from 'three';

/**
 * Общие инструменты 3D-сцены: построение примитивов, процедурные текстуры
 * (ткань, кожа, дерево, кольчуга, чешуя, волосы, шлифованный металл) и
 * готовые материалы. Текстуры рисуются на canvas при первом обращении и
 * переиспользуются — внешних файлов нет. Без DOM (в тестах) текстуры пропускаются.
 */

export type Mat = THREE.MeshStandardMaterial;
export type Anim = (t: number) => void;

export const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, pos?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  if (pos) me.position.set(...pos);
  if (scale) me.scale.set(...scale);
  return me;
}

/** Капсула от точки a до точки b (руки, ноги, рукояти). */
export function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, radial = 14): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const me = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, radial), m);
  me.position.copy(a).addScaledVector(dir, 0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return me;
}

/** Горизонтальное кольцо (тор) на высоте y с полуосями r·sx и r·sz; arc — дуга от +X к +Z. */
export function ring(r: number, tube: number, m: THREE.Material, y: number, sx = 1, sz = 1, arc = Math.PI * 2): THREE.Mesh {
  const geo = new THREE.TorusGeometry(r, tube, 10, 56, arc);
  geo.rotateX(Math.PI / 2);
  const me = new THREE.Mesh(geo, m);
  me.position.y = y;
  me.scale.set(sx, 1, sz);
  return me;
}

/** Цилиндр от a до b с разными радиусами на концах (r1 — у b). */
export function cone(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, m: THREE.Material, radial = 16, open = false): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, dir.length(), radial, 1, open), m);
  me.position.copy(a).addScaledVector(dir, 0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return me;
}

/**
 * «Живая» конечность: тело вращения вдоль отрезка a→b с профилем радиуса
 * (t от 0 до 1 вдоль отрезка). Даёт бицепс, икру, сужение к запястью и т. п.
 * from/to — часть профиля (для рукавов), grow — прибавка к радиусу, flat — сплющивание сечения.
 */
export function organ(a: THREE.Vector3, b: THREE.Vector3, profile: Array<[number, number]>, m: THREE.Material, opts: { from?: number; to?: number; grow?: number; flat?: number; radial?: number; caps?: boolean } = {}): THREE.Mesh {
  const { from = 0, to = 1, grow = 0, flat = 1, radial = 20, caps = true } = opts;
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const radius = (t: number): number => {
    for (let i = 1; i < profile.length; i += 1) {
      const [t0, r0] = profile[i - 1]!;
      const [t1, r1] = profile[i]!;
      if (t <= t1) {
        const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        const e = k * k * (3 - 2 * k);
        return r0 + (r1 - r0) * e;
      }
    }
    return profile[profile.length - 1]![1];
  };
  const pts: THREE.Vector2[] = [];
  const n = 16;
  if (caps) pts.push(new THREE.Vector2(0, from * len));
  for (let i = 0; i <= n; i += 1) {
    const t = from + ((to - from) * i) / n;
    pts.push(new THREE.Vector2(radius(t) + grow, t * len));
  }
  if (caps) pts.push(new THREE.Vector2(0, to * len));
  const me = new THREE.Mesh(new THREE.LatheGeometry(pts, radial), m);
  me.position.copy(a);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  me.scale.set(1, 1, flat);
  return me;
}

/** Трубка вдоль кривой с плавным сужением от r0 до r1 (рога, хвост волос, верёвка). */
export function taperTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, seg = 24, radial = 10): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.getAttribute('position');
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= seg; i += 1) {
    curve.getPointAt(i / seg, c);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j += 1) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// ─── Процедурные текстуры ───────────────────────────────────────────────

type TexKind = 'fabric' | 'leather' | 'wood' | 'mail' | 'scales' | 'brushed' | 'hair' | 'planks' | 'iris';

/** Детерминированный генератор случайных чисел — текстуры одинаковы при каждом запуске. */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гладкий шум: сумма случайных синусоид (достаточно для органических текстур). */
function waves(r: () => number, n: number): (x: number, y: number) => number {
  const w = Array.from({ length: n }, () => ({ fx: (r() - 0.5) * 0.12, fy: (r() - 0.5) * 0.12, p: r() * 6.28, a: 0.5 + r() }));
  const sum = w.reduce((s, x) => s + x.a, 0);
  return (x, y) => w.reduce((s, o) => s + Math.sin(x * o.fx + y * o.fy + o.p) * o.a, 0) / sum;
}

function paint(size: number, f: (x: number, y: number) => number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const val = Math.max(0, Math.min(255, Math.round(f(x, y) * 255)));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Повторяемая (бесшовная) функция: значения на краях совпадают. */
const tile = (size: number, period: number): ((x: number) => number) => (x) => (x / size) * Math.PI * 2 * period;

function draw(kind: TexKind): HTMLCanvasElement | null {
  const r = rand(kind.length * 7919 + kind.charCodeAt(0));
  switch (kind) {
    case 'fabric': {
      const S = 128;
      return paint(S, (x, y) => {
        const weave = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 0.08 : -0.08;
        const thread = Math.sin((x / S) * Math.PI * 2 * 32) * 0.05 + Math.sin((y / S) * Math.PI * 2 * 32) * 0.05;
        return 0.62 + weave + thread + (r() - 0.5) * 0.12;
      });
    }
    case 'leather': {
      const S = 256;
      const n = waves(r, 9);
      const t = tile(S, 1);
      return paint(S, (x, y) => {
        const big = Math.sin(t(x) * 3 + Math.sin(t(y) * 2) * 1.5) * Math.cos(t(y) * 4 + Math.sin(t(x) * 3)) * 0.08;
        const pores = (r() - 0.5) * 0.14;
        return 0.82 + big + pores + n(x, y) * 0.04;
      });
    }
    case 'wood': {
      const S = 256;
      const t = tile(S, 1);
      return paint(S, (x, y) => {
        const warp = Math.sin(t(y) * 2 + 1.3) * 1.4 + Math.sin(t(y) * 5) * 0.35;
        const grain = Math.sin(t(x) * 9 + warp * 3);
        const fine = Math.sin(t(x) * 47 + warp * 7) * 0.05;
        return 0.78 + grain * 0.12 + fine + (r() - 0.5) * 0.05;
      });
    }
    case 'planks': {
      const S = 256;
      const t = tile(S, 1);
      return paint(S, (x, y) => {
        const plank = Math.floor((x / S) * 4);
        const edge = Math.min((x % (S / 4)) / 3, 1);
        const warp = Math.sin(t(y) * 2 + plank * 1.7) * 1.2;
        const grain = Math.sin(t(x) * 14 + warp * 3 + plank);
        return (0.74 + plank * 0.03 + grain * 0.1 + (r() - 0.5) * 0.04) * (0.55 + 0.45 * edge);
      });
    }
    case 'mail': {
      const S = 128;
      const cells = 16;
      const cs = S / cells;
      return paint(S, (x, y) => {
        const row = Math.floor(y / cs);
        const ox = row % 2 === 0 ? 0 : cs / 2;
        const cx = (((x + ox) % cs) + cs) % cs - cs / 2;
        const cy = (y % cs) - cs / 2;
        const d = Math.hypot(cx, cy) / (cs / 2);
        const ring = Math.exp(-Math.pow((d - 0.72) / 0.18, 2));
        return 0.12 + ring * 0.85;
      });
    }
    case 'scales': {
      const S = 256;
      const w = S / 8;
      const h = S / 12;
      const R = w * 0.6;
      return paint(S, (x, y) => {
        // Ряды чешуек внахлёст: верхний ряд лежит поверх нижнего, видны скруглённые нижние края.
        const r0 = Math.floor(y / h);
        for (let row = r0 - 2; row <= r0 + 1; row += 1) {
          const ox = ((row % 2) + 2) % 2 === 0 ? 0 : w / 2;
          const cy = row * h;
          const cx = Math.round((x - ox) / w) * w + ox;
          const d = Math.hypot(x - cx, (y - cy) * 1.1) / R;
          if (d < 1) return 0.32 + (1 - d) * 0.45 + (y > cy ? 0.12 : 0) - (d > 0.84 ? 0.24 : 0);
        }
        return 0.2;
      });
    }
    case 'brushed': {
      const S = 256;
      const lines = Array.from({ length: S }, () => r());
      return paint(S, (x, y) => 0.75 + ((lines[y] ?? 0.5) - 0.5) * 0.35 + (r() - 0.5) * 0.08 + Math.sin((x / S) * Math.PI * 2 * 3) * 0.03);
    }
    case 'iris': {
      // Радужка в полярных координатах: верх текстуры — центр (зрачок), низ — край радужки.
      const S = 128;
      const streak = Array.from({ length: S }, () => r());
      return paint(S, (x, y) => {
        const rr = y / S;
        if (rr < 0.36) return 0.02;
        const s = (streak[x] ?? 0.5) * 0.5 + (streak[(x + 3) % S] ?? 0.5) * 0.5;
        const collar = rr < 0.5 ? 0.75 : 1;
        const limbal = rr > 0.86 ? 0.35 : 1;
        return (0.55 + s * 0.45) * collar * limbal;
      });
    }
    case 'hair': {
      const S = 256;
      const strands = Array.from({ length: S }, () => r());
      const t = tile(S, 1);
      return paint(S, (x) => {
        const s = strands[x] ?? 0.5;
        return 0.72 + (s - 0.5) * 0.3 + Math.sin(t(x) * 24) * 0.04;
      });
    }
  }
}

const canvases = new Map<TexKind, HTMLCanvasElement | null>();
const textures = new Map<string, THREE.Texture | null>();

/** Текстура нужного вида с повтором rx×ry; null без DOM. */
export function tex(kind: TexKind, rx = 1, ry = rx, color = false): THREE.Texture | null {
  const key = `${kind}|${rx}|${ry}|${color}`;
  if (textures.has(key)) return textures.get(key) ?? null;
  if (!canvases.has(kind)) canvases.set(kind, draw(kind));
  const c = canvases.get(kind);
  if (!c) {
    textures.set(key, null);
    return null;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textures.set(key, t);
  return t;
}

// ─── Материалы ──────────────────────────────────────────────────────────

type Params = THREE.MeshStandardMaterialParameters;

export function mat(color: THREE.ColorRepresentation, roughness = 0.75, metalness = 0, extra: Params = {}): Mat {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

/** Цвет #rrggbb, затемнённый (k < 1) или осветлённый (k > 1). */
export function shade(color: THREE.ColorRepresentation, k: number): THREE.Color {
  const c = new THREE.Color(color);
  if (k < 1) return c.multiplyScalar(k);
  return c.lerp(new THREE.Color('#ffffff'), Math.min(1, k - 1));
}

const withMaps = (p: Params, maps: Partial<Record<'map' | 'bumpMap' | 'roughnessMap', THREE.Texture | null>>, bump = 1): Params => {
  const out: Params = { ...p };
  if (maps.map) out.map = maps.map;
  if (maps.bumpMap) {
    out.bumpMap = maps.bumpMap;
    out.bumpScale = bump;
  }
  if (maps.roughnessMap) out.roughnessMap = maps.roughnessMap;
  return out;
};

export const M = {
  skin: (color: THREE.ColorRepresentation): Mat => mat(color, 0.62, 0, { envMapIntensity: 0.6 }),
  cloth: (color: THREE.ColorRepresentation, rep = 6, rough = 0.92): Mat => mat(color, rough, 0, withMaps({}, { bumpMap: tex('fabric', rep) }, 1.2)),
  hair: (color: THREE.ColorRepresentation, rep = 3): Mat => mat(color, 0.6, 0, withMaps({ envMapIntensity: 0.7 }, { map: tex('hair', rep, 1, true), bumpMap: tex('hair', rep, 1) }, 1)),
  leather: (color: THREE.ColorRepresentation = '#7a4e2d', rep = 2): Mat => mat(color, 0.7, 0, withMaps({}, { map: tex('leather', rep, rep, true), bumpMap: tex('leather', rep) }, 1.5)),
  wood: (color: THREE.ColorRepresentation = '#9a6538', rx = 1, ry = 3): Mat => mat(color, 0.78, 0, withMaps({}, { map: tex('wood', rx, ry, true), bumpMap: tex('wood', rx, ry) }, 1.2)),
  planks: (color: THREE.ColorRepresentation = '#9a6538'): Mat => mat(color, 0.8, 0, withMaps({}, { map: tex('planks', 1, 1, true), bumpMap: tex('planks', 1) }, 2)),
  metal: (color: THREE.ColorRepresentation, rough = 0.3): Mat => mat(color, rough, 0.92, withMaps({ envMapIntensity: 1.7 }, { roughnessMap: tex('brushed', 1, 2) })),
  steel: (): Mat => M.metal('#c7cfd8', 0.28),
  darkSteel: (): Mat => M.metal('#6c757f', 0.35),
  silver: (): Mat => M.metal('#e4e8ee', 0.18),
  gold: (): Mat => M.metal('#e8b84a', 0.24),
  bronze: (): Mat => M.metal('#c98c4c', 0.3),
  iron: (): Mat => mat('#3a4047', 0.45, 0.75, withMaps({ envMapIntensity: 1.5 }, { roughnessMap: tex('brushed', 1, 1) })),
  chrome: (): Mat => M.metal('#e9edf2', 0.12),
  mail: (rep = 7): Mat => mat('#a3abb4', 0.42, 0.85, withMaps({ envMapIntensity: 1.5 }, { map: tex('mail', rep, rep, true), bumpMap: tex('mail', rep) }, 2.5)),
  scales: (color: THREE.ColorRepresentation, rep = 3, metal = 0.7): Mat => mat(color, 0.38, metal, withMaps({ envMapIntensity: 1.4 }, { map: tex('scales', rep, rep, true), bumpMap: tex('scales', rep) }, 3)),
  gem: (color: THREE.ColorRepresentation, glow = 0.35): Mat => mat(color, 0.08, 0.2, { emissive: new THREE.Color(color), emissiveIntensity: glow }),
  glow: (color: THREE.ColorRepresentation, intensity = 1.6): Mat => mat(color, 0.3, 0, { emissive: new THREE.Color(color), emissiveIntensity: intensity }),
};

/** Освобождает геометрию и материалы (общие текстуры остаются в кэше). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const material = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((x) => x.dispose());
    else material?.dispose();
  });
}
