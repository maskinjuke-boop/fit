import * as THREE from 'three';
import { FACE_PARTS, type FacePart } from '../../../game/state';
import { BROW_DATA } from './browData';
import { headPositions } from './headMesh';
import { EXPRESSIONS, expressionBase } from './face';

/**
 * Брови — системные брови MakeHuman (CC0): карточки с текстурой волосков, привязанные к той же
 * базовой голове. Ползунки лица и полнота сдвигают голову — брови идут за ближайшей вершиной.
 * Цвет — цвет волос (текстура хранит только яркость прядей и прозрачность).
 */

export type BrowName = keyof typeof BROW_DATA;

const bytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const textures = new Map<BrowName, THREE.Texture>();
let loading: Promise<void> | null = null;

/** Загружает текстуры бровей (без браузера и при ошибке остаются прежние брови-трубки). */
export function loadBrowTextures(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return (loading = Promise.resolve());
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const loader = new THREE.TextureLoader();
  loading = Promise.all(
    (Object.keys(BROW_DATA) as BrowName[]).map((name) =>
      loader
        .loadAsync(`${base}brows/${name}.png`)
        .then((t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          t.userData.shared = true;
          textures.set(name, t);
        })
        .catch(() => undefined),
    ),
  ).then(() => undefined);
  return loading;
}

/** Форма бровей по фигуре и ползунку «брови»: тонкие, ухоженные, густые. */
export function browFor(female: boolean, brows: number): BrowName {
  if (female) return brows < -0.35 ? 'eyebrow006' : brows > 0.45 ? 'eyebrow011' : 'eyebrow001';
  return brows < -0.2 ? 'eyebrow011' : 'eyebrow010';
}

const ZERO = Object.fromEntries(FACE_PARTS.map((k) => [k, 0])) as Record<FacePart, number>;

/**
 * Сетка бровей name в координатах головы (центр — начало координат, как у черепа), с учётом черт лица
 * face и полноты fat; null — текстура не загружена.
 */
export function browMesh(name: BrowName, female: boolean, face: Record<FacePart, number>, fat: number, color: THREE.ColorRepresentation): THREE.Mesh | null {
  const tex = textures.get(name);
  if (!tex) return null;
  const d = BROW_DATA[name];
  const g = female ? d.female : d.male;
  const q = new Int16Array(bytes(g.pos).buffer);
  const near = new Uint16Array(bytes(g.near).buffer);
  const uvq = new Uint16Array(bytes(d.uv).buffer);
  const tris = new Uint16Array(bytes(d.tris).buffer);
  const n = near.length;
  const base = headPositions(female, ZERO, 0);
  const cur = headPositions(female, face, fat);
  const pos = new Float32Array(n * 3);
  const k = 1 / 32767;
  for (let i = 0; i < n; i += 1) {
    const j = near[i]!;
    for (let c = 0; c < 3; c += 1) pos[i * 3 + c] = q[i * 3 + c]! * k + (cur[j * 3 + c]! - base[j * 3 + c]!);
  }
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    uv[i * 2] = uvq[i * 2]! / 65535;
    // Развёртка .obj — v снизу вверх; текстура в three по умолчанию переворачивается (flipY).
    uv[i * 2 + 1] = uvq[i * 2 + 1]! / 65535;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(tris, 1));
  geo.computeVertexNormals();
  // Мимика: брови идут за кожей лба (сдвиг ближайшей вершины головы).
  const nHead = base.length / 3;
  geo.morphAttributes.position = EXPRESSIONS.map((e) => {
    const d = expressionBase(e, female, nHead);
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const j = near[i]!;
      out[i * 3] = d[j * 3]!;
      out[i * 3 + 1] = d[j * 3 + 1]!;
      out[i * 3 + 2] = d[j * 3 + 2]!;
    }
    return new THREE.BufferAttribute(out, 3);
  });
  geo.morphTargetsRelative = true;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: new THREE.Color(color).multiplyScalar(0.75),
    transparent: true,
    alphaTest: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}
