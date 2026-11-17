import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { UV_DATA } from './uvData';
import { loadBrowTextures } from './brows';

/**
 * Текстуры кожи MakeHuman (CC0): светлая и тёмная, женская и мужская, по развёртке базовой
 * модели — той же, из которой взяты тело и голова. Оттенок кожи из палитры игры задаётся
 * цветом материала (множитель к текстуре).
 *
 * Сетки тела и головы делятся по Лупу; развёртка делится вместе с ними (у дочерних треугольников —
 * середины сторон родителя), а на швах развёртки вершины раздваиваются (splitByUv).
 */

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const cornerCache = new Map<string, Float32Array>();

/** Точки развёртки углов исходных треугольников (порядок — как у треугольников тела/головы). */
export function baseCornerUv(kind: 'body' | 'head', tris: ArrayLike<number>): Float32Array {
  const hit = cornerCache.get(kind);
  if (hit && hit.length === tris.length * 2) return hit;
  const d = UV_DATA[kind];
  const uv = new Uint16Array(bytes(d.uv).buffer);
  const ex = new Uint32Array(bytes(d.ex).buffer);
  const exUv = new Uint16Array(bytes(d.exUv).buffer);
  const out = new Float32Array(tris.length * 2);
  const k = 1 / 65535;
  for (let c = 0; c < tris.length; c += 1) {
    const v = tris[c]!;
    out[c * 2] = uv[v * 2]! * k;
    out[c * 2 + 1] = uv[v * 2 + 1]! * k;
  }
  for (let j = 0; j < ex.length; j += 1) {
    const c = ex[j]!;
    if (c >= tris.length) continue;
    out[c * 2] = exUv[j * 2]! * k;
    out[c * 2 + 1] = exUv[j * 2 + 1]! * k;
  }
  cornerCache.set(kind, out);
  return out;
}

/**
 * Развёртка после деления по Лупу (loopSubdivide): у каждого треугольника 4 дочерних
 * [a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca].
 */
export function subdivCornerUv(parent: Float32Array): Float32Array {
  const n = parent.length / 6;
  const out = new Float32Array(n * 24);
  for (let t = 0; t < n; t += 1) {
    const p = t * 6;
    const au = parent[p]!;
    const av = parent[p + 1]!;
    const bu = parent[p + 2]!;
    const bv = parent[p + 3]!;
    const cu = parent[p + 4]!;
    const cv = parent[p + 5]!;
    const abu = (au + bu) / 2;
    const abv = (av + bv) / 2;
    const bcu = (bu + cu) / 2;
    const bcv = (bv + cv) / 2;
    const cau = (cu + au) / 2;
    const cav = (cv + av) / 2;
    out.set([au, av, abu, abv, cau, cav, abu, abv, bu, bv, bcu, bcv, cau, cav, bcu, bcv, cu, cv, abu, abv, bcu, bcv, cau, cav], t * 24);
  }
  return out;
}

/**
 * Раздваивает вершины на швах развёртки: у каждой пары (вершина, точка развёртки) — своя вершина
 * со всеми атрибутами исходной. Развёртка — в атрибуте uv1 (uv остаётся прежним). В userData.src —
 * номер исходной вершины для каждой новой.
 */
export function splitByUv(geo: THREE.BufferGeometry, corner: Float32Array): THREE.BufferGeometry {
  const index = geo.index!;
  const map = new Map<string, number>();
  const src: number[] = [];
  const uvs: number[] = [];
  const idx = new Uint32Array(index.count);
  for (let c = 0; c < index.count; c += 1) {
    const v = index.getX(c);
    const u = corner[c * 2]!;
    const w = corner[c * 2 + 1]!;
    const key = `${v}|${Math.round(u * 8192)}|${Math.round(w * 8192)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = src.length;
      map.set(key, j);
      src.push(v);
      uvs.push(u, w);
    }
    idx[c] = j;
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    const size = a.itemSize;
    const Arr = a.array.constructor as new (n: number) => THREE.TypedArray;
    const arr = new Arr(src.length * size);
    for (let i = 0; i < src.length; i += 1) for (let k = 0; k < size; k += 1) arr[i * size + k] = a.array[src[i]! * size + k]!;
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, a.normalized));
  }
  out.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  out.setIndex(new THREE.BufferAttribute(src.length < 65536 ? Uint16Array.from(idx) : idx, 1));
  out.userData.src = Uint32Array.from(src);
  return out;
}

/**
 * Нормали по сетке с раздвоенными на швах вершинами: вершины в одной точке получают общую
 * нормаль (иначе на швах развёртки видна «ступенька» освещения).
 */
export function weldedNormals(geo: THREE.BufferGeometry): void {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const groups = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i += 1) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }
  const n = new THREE.Vector3();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    n.set(0, 0, 0);
    for (const i of g) {
      n.x += nor.getX(i);
      n.y += nor.getY(i);
      n.z += nor.getZ(i);
    }
    n.normalize();
    for (const i of g) nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
}

// ─── Текстуры ──────────────────────────────────────────────────────────

type Tone = 'light' | 'dark';
const textures = new Map<string, THREE.Texture>();
/** Средний цвет кожи на текстуре (sRGB 0…255) — для подбора оттенка. */
const MEAN: Record<string, [number, number, number]> = {
  light_female: [218, 178, 151],
  light_male: [228, 174, 143],
  dark_female: [108, 63, 44],
  dark_male: [90, 57, 39],
};
let loading: Promise<void> | null = null;

/** Загружает текстуры кожи (один раз; без браузера и при ошибке кожа остаётся без текстуры). */
export function loadSkinTextures(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return (loading = Promise.resolve());
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const loader = new THREE.TextureLoader();
  loading = Promise.all([
    loadBrowTextures(),
    ...(['light', 'dark'] as const).flatMap((tone) =>
      (['female', 'male'] as const).map((fig) =>
        loader
          .loadAsync(`${base}skins/${tone}_${fig}.jpg`)
          .then((t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.channel = 1;
            t.anisotropy = 4;
            t.userData.shared = true;
            textures.set(`${tone}_${fig}`, t);
          })
          .catch(() => undefined),
      ),
    ),
  ]).then(() => undefined);
  return loading;
}

/** Текстуры кожи загружены. */
export const skinTexturesReady = (): boolean => textures.size > 0;

/**
 * Кожа с текстурой: карта (развёртка uv1) и множитель цвета под оттенок base.
 * Светлые оттенки — на светлой текстуре, тёмные — на тёмной.
 */
export function applySkinTexture(mat: THREE.MeshStandardMaterial, figure: Figure, base: THREE.ColorRepresentation): boolean {
  const c = new THREE.Color(base);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  const tone: Tone = hsl.l < 0.42 ? 'dark' : 'light';
  const key = `${tone}_${figure}`;
  const t = textures.get(key);
  if (!t) return false;
  const m = MEAN[key]!;
  const avg = new THREE.Color().setRGB(m[0] / 255, m[1] / 255, m[2] / 255, THREE.SRGBColorSpace);
  // Множитель в линейных единицах: оттенок палитры ÷ средний цвет текстуры.
  mat.color.setRGB(Math.min(2.2, c.r / avg.r), Math.min(2.2, c.g / avg.g), Math.min(2.2, c.b / avg.b));
  mat.map = t;
  // Мелкий рельеф кожи — по той же текстуре.
  mat.bumpMap = t;
  mat.bumpScale = 0.35;
  mat.needsUpdate = true;
  return true;
}
