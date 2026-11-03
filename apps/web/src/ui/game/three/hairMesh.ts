import * as THREE from 'three';
import type { FacePart } from '../../../game/state';
import { HAIR_DATA } from './hairData';
import { headPositions } from './headMesh';

/**
 * Готовые причёски MakeHuman (системные ассеты, лицензия CC0): сетки из «карточек» —
 * полосок с текстурой прядей и прозрачностью. Причёски сделаны для той же базовой модели,
 * что и голова, поэтому садятся на неё точно. Данные — hairData.ts (scripts/extract-mh.py),
 * текстуры — public/hair/<стиль>.webp (яркость прядей без цвета: цвет задаёт материал).
 * Координаты — относительно центра головы, лицо смотрит на +Z.
 */

export type MeshHairStyle = keyof typeof HAIR_DATA.styles;
export const isMeshHair = (s: string): s is MeshHairStyle => s in HAIR_DATA.styles;

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

interface Decoded {
  tris: Uint16Array;
  uv: Float32Array;
  near: Uint16Array;
  /** Причёска на женской голове (мужская форма — через сдвиг ближайших вершин головы). */
  pos: Float32Array;
}
const decoded = new Map<MeshHairStyle, Decoded>();
function decode(style: MeshHairStyle): Decoded {
  let d = decoded.get(style);
  if (!d) {
    const e = HAIR_DATA.styles[style];
    const k = HAIR_DATA.scale / 32767;
    d = {
      tris: new Uint16Array(bytes(e.tris).buffer),
      uv: Float32Array.from(new Uint16Array(bytes(e.uv).buffer), (q) => q / 65535),
      near: new Uint16Array(bytes(e.near).buffer),
      pos: Float32Array.from(new Int16Array(bytes(e.pos).buffer), (q) => q * k),
    };
    decoded.set(style, d);
  }
  return d;
}

export interface HairFit {
  /** Черты лица (ползунки): причёска повторяет изменения головы. */
  face: Record<FacePart, number>;
  neutral: boolean;
  /** Под шляпой — волосы прижаты к голове выше края; под шлемом — убраны. */
  cover: 'none' | 'hat' | 'helm';
  /** Точка на голове (координаты головы без HEAD_Y) по направлению с отступом. */
  skull: (d: THREE.Vector3, off: number) => THREE.Vector3;
  /** Вынос прядей из тела и одежды (координаты головы без HEAD_Y). */
  push?: (p: THREE.Vector3) => void;
}

/** Высота края головного убора (координаты головы): выше волосы прижаты или убраны. */
const HAT_EDGE = 0.07;
const HELM_EDGE = -0.06;
const CENTER = new THREE.Vector3(0, 0.02, -0.01);
const LONG = new Set<string>(['long', 'ponytail']);

export function meshHairGeometry(style: MeshHairStyle, female: boolean, fit: HairFit): THREE.BufferGeometry {
  const d = decode(style);
  const pos = Float32Array.from(d.pos);
  if (!female || !fit.neutral) {
    // Другая форма головы (мужская, изменённая ползунками) — по сдвигу ближайшей вершины головы.
    const base = headPositions(true, Object.fromEntries(Object.keys(fit.face).map((k) => [k, 0])) as Record<FacePart, number>);
    const moved = headPositions(female, fit.face);
    for (let i = 0; i < d.near.length; i += 1) {
      const j = d.near[i]! * 3;
      for (let c = 0; c < 3; c += 1) pos[i * 3 + c] = pos[i * 3 + c]! + moved[j + c]! - base[j + c]!;
    }
  }
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const drop = new Uint8Array(pos.length / 3);
  for (let i = 0; i < pos.length / 3; i += 1) {
    p.fromArray(pos, i * 3);
    if (fit.cover === 'hat' && p.y > HAT_EDGE - 0.05) {
      // Под шляпой волосы прижаты к голове (плавно от края убора вверх).
      const t = Math.min(1, (p.y - (HAT_EDGE - 0.05)) / 0.05);
      dir.subVectors(p, CENTER).normalize();
      const flat = fit.skull(dir, 0.006).add(CENTER);
      if (flat.distanceTo(CENTER) < p.distanceTo(CENTER)) p.lerp(flat, t * t * (3 - 2 * t));
    }
    // Под шлемом остаются только длинные пряди ниже его края.
    if (fit.cover === 'helm' && (p.y > HELM_EDGE || !LONG.has(style))) drop[i] = 1;
    if (fit.push && p.y < -0.12) fit.push(p);
    p.toArray(pos, i * 3);
  }
  let tris: Uint16Array = d.tris;
  if (fit.cover === 'helm') {
    const keep: number[] = [];
    for (let t = 0; t < d.tris.length; t += 3) {
      if (drop[d.tris[t]!] || drop[d.tris[t + 1]!] || drop[d.tris[t + 2]!]) continue;
      keep.push(d.tris[t]!, d.tris[t + 1]!, d.tris[t + 2]!);
    }
    tris = Uint16Array.from(keep);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  geo.setIndex(new THREE.BufferAttribute(tris, 1));
  geo.computeVertexNormals();
  // Карточки двусторонние: нормаль — наружу от головы и наполовину «радиальная»,
  // чтобы причёска освещалась как объём, а не как набор плоскостей.
  const nor = geo.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < nor.count; i += 1) {
    p.fromArray(pos, i * 3);
    dir.subVectors(p, CENTER).normalize();
    n.fromBufferAttribute(nor, i);
    if (n.dot(dir) < 0) n.negate();
    n.lerp(dir, 0.5).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeBoundingSphere();
  return geo;
}

// ─── Текстуры ─────────────────────────────────────────────────────────────

const textures = new Map<MeshHairStyle, Promise<THREE.Texture | null>>();
const ready = new Map<MeshHairStyle, THREE.Texture>();

/** Загружает текстуру причёски (в браузере; без DOM — null). */
export function loadHairTexture(style: string): Promise<THREE.Texture | null> {
  if (!isMeshHair(style) || typeof document === 'undefined') return Promise.resolve(null);
  let p = textures.get(style);
  if (!p) {
    const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
    p = new THREE.TextureLoader()
      .loadAsync(`${base}hair/${style}.webp`)
      .then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        ready.set(style, t);
        return t;
      })
      .catch(() => null);
    textures.set(style, p);
  }
  return p;
}

/** Уже загруженная текстура причёски или null. */
export const hairTexture = (style: string): THREE.Texture | null => (isMeshHair(style) ? ready.get(style) ?? null : null);
