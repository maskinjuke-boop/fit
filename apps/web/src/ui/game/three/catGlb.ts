import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Реалистичная кошка — готовая модель «Bicolor Cat» (kenchoo, на основе «Fripouille»
 * guillaume bolis; CC BY 4.0, см. public/models/cats/CREDITS.txt): сетка со скелетом,
 * текстура шерсти, карта нормалей, глаза.
 *
 * Окрас породы рисуется поверх шерсти модели: для каждого пикселя текстуры известна точка
 * на теле (развёртка «растеризуется» в карту положений), рисунок (полоски, пятна, отметины,
 * белая грудка) считается по этой точке, а мелкая фактура шерсти берётся из исходной текстуры.
 * Позы — те же параметры, что у прежней кошки (таз, наклон корпуса, углы лап, голова, хвост),
 * переведённые в повороты костей скелета модели.
 */

/** Внешность породы (те же поля, что и у прежней модели). */
export interface CoatLook {
  base: string;
  dark: string;
  light: string;
  eyes: string;
  pattern: 'solid' | 'tabby' | 'points' | 'spots';
  white: number;
  size: number;
  fluff: number;
  tail: number;
  ears: 'normal' | 'fold' | 'big' | 'tufts';
  flat: boolean;
  hairless: boolean;
}

/** Параметры позы (как у прежней модели кошки). */
export interface CatPoseParams {
  hipY: number;
  hipZ: number;
  pitch: number;
  headX: number;
  headY: number;
  headZ: number;
  legs: Array<[number, number]>;
  tail: Array<[number, number]>;
  eye: number;
  breath: number;
  roll: number;
  purr: number;
}

const URL_PATH = 'models/cats/bicolor_cat.glb';

interface BoneInfo {
  name: string;
  index: number;
  restLocal: THREE.Quaternion;
  /** Поворот кости в координатах модели в позе покоя. */
  restWorld: THREE.Quaternion;
  restPos: THREE.Vector3;
}

interface Template {
  gltf: GLTF;
  clone: (o: THREE.Object3D) => THREE.Object3D;
  /** Положение таза (между тазобедренными суставами) в координатах модели. */
  pelvis: THREE.Vector3;
  /** Высота таза над полом — для пересчёта единиц прежней кошки. */
  hipH: number;
  bones: Map<string, BoneInfo>;
  /** Центры глаз (левый x > 0, правый x < 0) и радиус; local — центр в координатах кости головы. */
  eyes: Array<{ c: THREE.Vector3; r: number; local: THREE.Vector3 }>;
  /** Масштаб кости головы в покое (для век в её координатах). */
  headScale: number;
  /** Усы в координатах кости головы. */
  whiskers: THREE.BufferGeometry | null;
  /** Исходная текстура шерсти (пиксели) и размер. */
  src: ImageData | null;
  srcTex: THREE.Texture | null;
  /** Карта положений: для пикселя 512×512 — точка тела (x, y, z) и часть (0 нет, 1 корпус, 2 голова, 3 лапа, 4 хвост, 5 глаз). */
  posMap: Float32Array | null;
  partMap: Uint8Array | null;
}

let template: Template | null = null;
let loading: Promise<void> | null = null;

/** Модель кошки загружена — можно строить реалистичных кошек. */
export const catModelReady = (): boolean => template !== null;

/** Загружает модель кошки (один раз). Без браузера и при ошибке остаётся прежняя модель. */
export function loadCatModel(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined') return (loading = Promise.resolve());
  loading = (async () => {
    const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/utils/SkeletonUtils.js')]);
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const gltf = await new GLTFLoader().loadAsync(`${base}${URL_PATH}`);
    template = prepare(gltf, (o) => SkeletonUtils.clone(o));
  })().catch((e: unknown) => {
    console.warn('[cat] модель не загрузилась', e);
  });
  return loading;
}

const PART = { none: 0, body: 1, head: 2, leg: 3, tail: 4, eye: 5 } as const;

function partOf(name: string): number {
  if (/Neck_Top|Head_Jaw/.test(name)) return PART.head;
  if (/Tail/.test(name)) return PART.tail;
  if (/FrontLeg|HindLeg/.test(name)) return PART.leg;
  return PART.body;
}

function prepare(gltf: GLTF, clone: (o: THREE.Object3D) => THREE.Object3D): Template {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  // Сетки модели общие у всех кошек — при удалении кошки не освобождаются.
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.userData.shared = true;
  });
  let body: THREE.SkinnedMesh | null = null;
  let eyeMesh: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const name = (m.material as THREE.Material).name;
    if (name === 'cat_diffuse') body = m;
    else eyeMesh = m;
  });
  if (!body) throw new Error('нет сетки кошки');
  const skel = (body as THREE.SkinnedMesh).skeleton;
  // Матрицы костей для положений вершин в позе модели.
  skel.update();
  if (eyeMesh) (eyeMesh as THREE.SkinnedMesh).skeleton.update();
  const bones = new Map<string, BoneInfo>();
  skel.bones.forEach((b, index) => {
    const w = new THREE.Quaternion();
    b.getWorldQuaternion(w);
    bones.set(b.name, { name: b.name, index, restLocal: b.quaternion.clone(), restWorld: w, restPos: b.getWorldPosition(new THREE.Vector3()) });
  });
  const find = (re: RegExp): BoneInfo | undefined => [...bones.values()].find((b) => re.test(b.name));
  const lh = find(/l_HindLeg_Hip/)!.restPos;
  const rh = find(/r_HindLeg_Hip/)!.restPos;
  const pelvis = lh.clone().add(rh).multiplyScalar(0.5);
  const box = new THREE.Box3().setFromObject(scene);
  const hipH = pelvis.y - box.min.y;
  // Глаза: две группы вершин сетки глаз по знаку x.
  const eyes: Array<{ c: THREE.Vector3; r: number; local: THREE.Vector3 }> = [];
  const headB = skel.bones.find((b) => /Neck_Top/.test(b.name));
  if (eyeMesh) {
    const em = eyeMesh as THREE.SkinnedMesh;
    const pos = em.geometry.getAttribute('position');
    const p = new THREE.Vector3();
    for (const sx of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < pos.count; i += 1) {
        // Положение с учётом скелета (поза модели может отличаться от позы привязки сетки).
        em.applyBoneTransform(i, p.fromBufferAttribute(pos, i)).applyMatrix4(em.matrixWorld);
        if (p.y > box.min.y + 0.6 * (box.max.y - box.min.y) && Math.sign(p.x) === sx) pts.push(p.clone());
      }
      if (!pts.length) continue;
      const bb = new THREE.Box3().setFromPoints(pts);
      const c = bb.getCenter(new THREE.Vector3());
      const sz = bb.getSize(new THREE.Vector3());
      eyes.push({ c, r: Math.max(sz.x, sz.y) / 2, local: headB ? headB.worldToLocal(c.clone()) : c.clone() });
    }
  }
  // Глаза — с теми же весами костей, что и кожа вокруг них: иначе при повороте головы
  // глазное яблоко сдвигается относительно век и прорезает лоб.
  if (eyeMesh) reskinEyes(body as THREE.SkinnedMesh, eyeMesh as THREE.SkinnedMesh);
  const headScale = headB ? headB.getWorldScale(new THREE.Vector3()).x : 1;
  const whiskers = headB && eyes.length ? whiskerGeometry(eyes, headB) : null;
  const t: Template = { gltf, clone, pelvis, hipH, bones, eyes, headScale, whiskers, src: null, srcTex: null, posMap: null, partMap: null };
  // Исходная текстура шерсти и карта положений по развёртке.
  const mat = (body as THREE.SkinnedMesh).material as THREE.MeshStandardMaterial;
  t.srcTex = mat.map;
  const img = mat.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (img && img.width) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0);
      t.src = g.getImageData(0, 0, c.width, c.height);
    }
  }
  const maps = rasterize(body, eyeMesh, skel.bones.map((b) => b.name));
  t.posMap = maps.pos;
  t.partMap = maps.part;
  return t;
}

/** Усы: от подушечек под глазами в стороны и чуть вниз (точки — в координатах модели, затем в кость головы). */
function whiskerGeometry(eyes: Array<{ c: THREE.Vector3; r: number }>, head: THREE.Bone): THREE.BufferGeometry {
  const cx = (eyes[0]!.c.x + (eyes[1]?.c.x ?? -eyes[0]!.c.x)) / 2;
  const ex = Math.abs(eyes[0]!.c.x - cx);
  const ey = eyes[0]!.c.y;
  const ez = eyes[0]!.c.z;
  const inv = head.matrixWorld.clone().invert();
  const pts: number[] = [];
  const v = new THREE.Vector3();
  const push = (p: THREE.Vector3): void => {
    v.copy(p).applyMatrix4(inv);
    pts.push(v.x, v.y, v.z);
  };
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      const root = new THREE.Vector3(cx + sx * ex * 0.45, ey - ex * 1.25 - i * 0.0025, ez + ex * 1.15 - i * 0.002);
      const mid = root.clone().add(new THREE.Vector3(sx * 0.035, 0.003 - i * 0.004, -0.004 - i * 0.002));
      const tip = root.clone().add(new THREE.Vector3(sx * 0.075, -0.004 - i * 0.012, -0.018 - i * 0.006));
      const curve = new THREE.QuadraticBezierCurve3(root, mid, tip);
      const ps = curve.getPoints(6);
      for (let k = 0; k < ps.length - 1; k += 1) {
        push(ps[k]!);
        push(ps[k + 1]!);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.userData.shared = true;
  return g;
}

/** Веса костей у вершин глаз — как у ближайших вершин кожи головы (в позе модели). */
function reskinEyes(body: THREE.SkinnedMesh, eyes: THREE.SkinnedMesh): void {
  const same = body.skeleton.bones.length === eyes.skeleton.bones.length && body.skeleton.bones.every((b, i) => b.name === eyes.skeleton.bones[i]!.name);
  if (!same) return;
  const bp = body.geometry.getAttribute('position');
  const bi = body.geometry.getAttribute('skinIndex');
  const bw = body.geometry.getAttribute('skinWeight');
  const ep = eyes.geometry.getAttribute('position');
  const ei = eyes.geometry.getAttribute('skinIndex');
  const ew = eyes.geometry.getAttribute('skinWeight');
  if (!bi || !bw || !ei || !ew) return;
  const pts = new Float32Array(bp.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i += 1) {
    body.applyBoneTransform(i, v.fromBufferAttribute(bp, i));
    pts[i * 3] = v.x;
    pts[i * 3 + 1] = v.y;
    pts[i * 3 + 2] = v.z;
  }
  for (let i = 0; i < ep.count; i += 1) {
    eyes.applyBoneTransform(i, v.fromBufferAttribute(ep, i));
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < bp.count; j += 1) {
      const d = (pts[j * 3]! - v.x) ** 2 + (pts[j * 3 + 1]! - v.y) ** 2 + (pts[j * 3 + 2]! - v.z) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best < 0) continue;
    for (let k = 0; k < 4; k += 1) {
      ei.setComponent(i, k, bi.getComponent(best, k));
      ew.setComponent(i, k, bw.getComponent(best, k));
    }
  }
  ei.needsUpdate = true;
  ew.needsUpdate = true;
}

const MAP = 512;

/** Карта положений: треугольники развёртки закрашиваются точками тела (в позе покоя). */
function rasterize(body: THREE.SkinnedMesh, eyeMesh: THREE.SkinnedMesh | null, names: string[]): { pos: Float32Array; part: Uint8Array } {
  const pos = new Float32Array(MAP * MAP * 3);
  const part = new Uint8Array(MAP * MAP);
  const draw = (mesh: THREE.SkinnedMesh, fixedPart?: number, minY = -Infinity): void => {
    const geo = mesh.geometry;
    const P = geo.getAttribute('position');
    const UV = geo.getAttribute('uv');
    const SI = geo.getAttribute('skinIndex');
    const SW = geo.getAttribute('skinWeight');
    if (!UV) return;
    const n = P.count;
    const wp = new Float32Array(n * 3);
    const vp = new Uint8Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i += 1) {
      mesh.applyBoneTransform(i, v.fromBufferAttribute(P, i)).applyMatrix4(mesh.matrixWorld);
      wp[i * 3] = v.x;
      wp[i * 3 + 1] = v.y;
      wp[i * 3 + 2] = v.z;
      if (fixedPart !== undefined) vp[i] = fixedPart;
      else if (SI && SW) {
        let best = 0;
        let bw = -1;
        for (let k = 0; k < 4; k += 1) {
          const w = SW.getComponent(i, k);
          if (w > bw) {
            bw = w;
            best = SI.getComponent(i, k);
          }
        }
        vp[i] = partOf(names[best] ?? '');
      } else vp[i] = PART.body;
    }
    const idx = geo.index;
    const tri = idx ? idx.count / 3 : n / 3;
    for (let t = 0; t < tri; t += 1) {
      const a = idx ? idx.getX(t * 3) : t * 3;
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      // Пиксель (x, y) с y сверху вниз; у glTF v = 0 — верхняя строка картинки.
      const ax = UV.getX(a) * MAP;
      const ay = UV.getY(a) * MAP;
      const bx = UV.getX(b) * MAP;
      const by = UV.getY(b) * MAP;
      const cx = UV.getX(c) * MAP;
      const cy = UV.getY(c) * MAP;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(MAP - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const y1 = Math.min(MAP - 1, Math.ceil(Math.max(ay, by, cy)));
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-9) continue;
      // Сетка глаз: только треугольники у самих глаз (остальные — вырожденные, с развёрткой на всю текстуру).
      if (wp[a * 3 + 1]! < minY || wp[b * 3 + 1]! < minY || wp[c * 3 + 1]! < minY) continue;
      // Часть треугольника — по большинству вершин.
      const pt = vp[a] === vp[b] || vp[a] === vp[c] ? vp[a]! : vp[b]!;
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
          const l3 = 1 - l1 - l2;
          if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
          const o = y * MAP + x;
          pos[o * 3] = wp[a * 3]! * l1 + wp[b * 3]! * l2 + wp[c * 3]! * l3;
          pos[o * 3 + 1] = wp[a * 3 + 1]! * l1 + wp[b * 3 + 1]! * l2 + wp[c * 3 + 1]! * l3;
          pos[o * 3 + 2] = wp[a * 3 + 2]! * l1 + wp[b * 3 + 2]! * l2 + wp[c * 3 + 2]! * l3;
          part[o] = pt;
        }
      }
    }
  };
  draw(body);
  // Радужки — два квадрата у левого края текстуры (сетка глаз берёт их развёрткой с повтором,
  // поэтому её треугольники не растеризуем).
  void eyeMesh;
  for (const [v0, v1] of EYE_SQUARES) {
    for (let y = Math.floor(v0 * MAP); y <= Math.ceil(v1 * MAP); y += 1) for (let x = Math.floor(EYE_U[0] * MAP); x <= Math.ceil(EYE_U[1] * MAP); x += 1) part[y * MAP + x] = PART.eye;
  }
  // Поля вокруг островов развёртки — по соседям (иначе на краях при уменьшении проступает исходный окрас).
  for (let it = 0; it < 6; it += 1) {
    const next = part.slice();
    for (let y = 0; y < MAP; y += 1) {
      for (let x = 0; x < MAP; x += 1) {
        const o = y * MAP + x;
        if (part[o]) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) continue;
          const q = yy * MAP + xx;
          if (!part[q] || part[q] === PART.eye) continue;
          next[o] = part[q]!;
          pos[o * 3] = pos[q * 3]!;
          pos[o * 3 + 1] = pos[q * 3 + 1]!;
          pos[o * 3 + 2] = pos[q * 3 + 2]!;
          break;
        }
      }
    }
    part.set(next);
  }
  return { pos, part };
}

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const coatCache = new Map<string, THREE.Texture>();

/**
 * Окрас породы: рисунок по точке тела × фактура шерсти исходной текстуры.
 * Рыжая без помеси — исходная текстура модели как есть (кроме цвета глаз).
 */
function coatTexture(t: Template, look: CoatLook, key: string, seed: number, keepAll: boolean): THREE.Texture | null {
  const hit = coatCache.get(key);
  if (hit) return hit;
  const src = t.src;
  const pm = t.posMap;
  const parts = t.partMap;
  if (!src || !pm || !parts) return t.srcTex;
  const W = src.width;
  const H = src.height;
  const S = src.data;
  // Яркость исходника и её размытие (крупные пятна окраса убираются, остаётся фактура шерсти).
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) L[i] = (0.3 * S[i * 4]! + 0.59 * S[i * 4 + 1]! + 0.11 * S[i * 4 + 2]!) / 255;
  const blur = boxBlur(L, W, H, Math.round(W / 64));
  // Цвета — в тех же единицах, что байты текстуры (sRGB, без перевода в линейные).
  const raw = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  const base = raw(look.base);
  const dark = raw(look.dark);
  const light = raw(look.light);
  const eye = raw(look.eyes);
  const pink = raw(look.hairless ? '#c98f86' : '#e49a9c');
  const c = new THREE.Color();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return t.srcTex;
  const out = g.createImageData(W, H);
  const O = out.data;
  const k = MAP / W;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const r0 = S[i * 4]! / 255;
      const g0 = S[i * 4 + 1]! / 255;
      const b0 = S[i * 4 + 2]! / 255;
      const m = Math.min(MAP - 1, Math.floor(y * k)) * MAP + Math.min(MAP - 1, Math.floor(x * k));
      const part = parts[m]!;
      let rr = r0;
      let gg = g0;
      let bb = b0;
      if (part === PART.eye) {
        // Радужка — цвет глаз породы; тёмный зрачок и блик остаются.
        const l = L[i]!;
        if (l > 0.12 && l < 0.82) {
          c.copy(eye).multiplyScalar(Math.min(1.6, (l / 0.42) ** 0.9));
          rr = c.r;
          gg = c.g;
          bb = c.b;
        }
      } else if (part && !keepAll) {
        // Розовые подушечки лап и нос, тёмная мочка — без изменений.
        const isPink = r0 > 0.55 && r0 - g0 > 0.16 && b0 > g0 * 0.95;
        const isDark = L[i]! < 0.09 && part === PART.head;
        if (!isPink && !isDark) {
          const px = pm[m * 3]!;
          const py = pm[m * 3 + 1]!;
          const pz = pm[m * 3 + 2]!;
          coatAt(look, part, px, py, pz, seed, base, dark, light, c);
          // Фактура шерсти: отношение яркости к размытой (без крупного рисунка исходника).
          const d = Math.max(0.55, Math.min(1.5, L[i]! / Math.max(0.05, blur[i]!)));
          // Мульт-стиль: фактура шерсти едва заметна — окрас плоскими заливками.
          const f = 1 + (d - 1) * (look.hairless ? 0.15 : 0.25);
          rr = c.r * f;
          gg = c.g * f;
          bb = c.b * f;
        } else if (isPink) {
          rr = r0 * 0.5 + pink.r * 0.5;
          gg = g0 * 0.5 + pink.g * 0.5;
          bb = b0 * 0.5 + pink.b * 0.5;
        }
      }
      O[i * 4] = Math.round(Math.min(1, Math.max(0, rr)) * 255);
      O[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, gg)) * 255);
      O[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, bb)) * 255);
      O[i * 4 + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const make = (cv: HTMLCanvasElement): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = t.srcTex?.flipY ?? false;
    tex.anisotropy = 4;
    tex.userData.shared = true;
    return tex;
  };
  const tex = make(canvas);
  coatCache.set(key, tex);
  // Закрытые глаза: вместо радужек — сомкнутые веки (шерсть вокруг глаза с тёмной щелью посередине).
  const shut = document.createElement('canvas');
  shut.width = W;
  shut.height = H;
  const sg = shut.getContext('2d');
  if (sg) {
    sg.drawImage(canvas, 0, 0);
    for (const [v0, v1] of EYE_SQUARES) {
      const x0 = Math.floor(EYE_U[0] * W);
      const x1 = Math.ceil(EYE_U[1] * W);
      const y0 = Math.floor(v0 * H);
      const y1 = Math.ceil(v1 * H);
      // Цвет века — шерсть сразу над квадратом радужки в той же текстуре нельзя взять (там другой остров),
      // поэтому — средний цвет головы по рисунку породы.
      const lid = lidColor(t, look, seed, keepAll);
      const css = (k: number): string => `rgb(${Math.round(lid.r * 190 * k)},${Math.round(lid.g * 190 * k)},${Math.round(lid.b * 190 * k)})`;
      const gr = sg.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, css(0.95));
      gr.addColorStop(0.44, css(0.8));
      gr.addColorStop(0.5, 'rgb(28,22,20)');
      gr.addColorStop(0.56, css(0.72));
      gr.addColorStop(1, css(0.9));
      sg.fillStyle = gr;
      sg.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    shutCache.set(key, make(shut));
  }
  return tex;
}

const shutCache = new Map<string, THREE.Texture>();
/** Квадраты радужек на текстуре: v-интервалы и общий u-интервал. */
const EYE_SQUARES: ReadonlyArray<readonly [number, number]> = [
  [0.108, 0.162],
  [0.363, 0.416],
];
const EYE_U = [0.017, 0.071] as const;

/** Цвет шерсти над глазом (sRGB, 0…1). */
function lidColor(t: Template, look: CoatLook, seed: number, original: boolean): THREE.Color {
  const raw = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  const c = new THREE.Color();
  const e0 = t.eyes[0];
  if (original || !e0) return c.setStyle('#b8642a', THREE.LinearSRGBColorSpace);
  coatAt(look, PART.head, e0.c.x, e0.c.y + e0.r * 1.3, e0.c.z, seed, raw(look.base), raw(look.dark), raw(look.light), c);
  return c;
}

/** Размытие яркости квадратом радиуса r (два прохода по строкам и столбцам). */
function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    let s = 0;
    for (let x = -r; x <= r; x += 1) s += src[y * W + Math.min(W - 1, Math.max(0, x))]!;
    for (let x = 0; x < W; x += 1) {
      tmp[y * W + x] = s / (2 * r + 1);
      s += src[y * W + Math.min(W - 1, x + r + 1)]! - src[y * W + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < W; x += 1) {
    let s = 0;
    for (let y = -r; y <= r; y += 1) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]!;
    for (let y = 0; y < H; y += 1) {
      out[y * W + x] = s / (2 * r + 1);
      s += tmp[Math.min(H - 1, y + r + 1) * W + x]! - tmp[Math.max(0, y - r) * W + x]!;
    }
  }
  return out;
}

// Ориентиры на модели (координаты модели, метры): голова, морда, грудь, хвост.
const HEAD_C = new THREE.Vector3(0, 0.3, 0.235);
const NOSE_Z = 0.31;

/** Цвет шерсти в точке тела (x, y, z) для рисунка породы. */
function coatAt(look: CoatLook, part: number, x: number, y: number, z: number, seed: number, base: THREE.Color, dark: THREE.Color, light: THREE.Color, c: THREE.Color): void {
  c.copy(base);
  const ax = Math.abs(x);
  // Морда спереди: подушечки усов и подбородок.
  const muzzle = part === PART.head ? sstep(0.27, 0.3, z) * sstep(0.3, 0.285, y) : 0;
  if (look.pattern === 'tabby') {
    let s = 0;
    if (part === PART.tail) s = sstep(0.1, 0.6, Math.sin(z * 62 + 0.5));
    else if (part === PART.head) {
      // «М» на лбу и полоски от глаз к ушам.
      const fore = sstep(0.31, 0.33, y) * sstep(0.2, 0.25, z);
      s = fore * sstep(0.2, 0.6, Math.sin(x * 150 + Math.sin(y * 90) * 0.6));
      s = Math.max(s, sstep(0.05, 0.08, ax) * sstep(0.3, 0.31, y) * sstep(0.2, 0.7, Math.sin((y - 0.3) * 260 + ax * 40)));
    } else if (part === PART.leg) s = 0.8 * sstep(0.2, 0.7, Math.sin(y * 70 + 1));
    else s = sstep(0.25, 0.7, Math.sin(z * 46 + Math.sin(y * 28) * 1.4 + ax * 10)) * sstep(0.17, 0.24, y);
    c.lerp(dark, s * 0.85);
  } else if (look.pattern === 'spots') {
    if (part === PART.body || part === PART.leg) {
      const u = z * 24 + 0.5 * Math.floor(y * 24);
      const cx = Math.floor(u);
      const cy = Math.floor(y * 24);
      const h = Math.sin(cx * 12.9898 + cy * 78.233 + Math.floor(ax * 24) * 3.1 + seed) * 43758.5453;
      const f = h - Math.floor(h);
      const d = Math.hypot(u - cx - 0.5, y * 24 - cy - 0.5);
      // Розетки: тёмный край и чуть темнее середина.
      if (f > 0.3) c.lerp(dark, 0.85 * sstep(0.46, 0.3, d) * (0.65 + 0.35 * sstep(0.12, 0.26, d)));
    }
    if (part === PART.tail) c.lerp(dark, Math.sin(z * 62) > 0.3 ? 0.8 : 0);
    if (part === PART.head) c.lerp(dark, 0.6 * sstep(0.31, 0.33, y) * sstep(0.3, 0.7, Math.sin(x * 120)));
  } else if (look.pattern === 'points') {
    // Отметины: маска морды, уши, лапы, хвост.
    let p = 0;
    if (part === PART.head) {
      const d = Math.hypot(x, (y - 0.29) * 1.2, z - NOSE_Z);
      // Маска гуще у носа и рта, ко лбу и щекам сходит на нет; уши — тёмные.
      p = Math.max(0.92 * sstep(0.075, 0.025, d), sstep(0.335, 0.355, y));
    }
    if (part === PART.tail) p = sstep(-0.12, -0.2, z) * 0.6 + 0.4;
    if (part === PART.leg) p = sstep(0.14, 0.05, y);
    c.lerp(dark, p);
  } else {
    c.lerp(dark, Math.max(0, Math.sin(x * 23 + z * 17) * 0.06));
  }
  if (look.white > 0) {
    // Белые грудка и живот, «носочки», мордочка.
    const chest = part === PART.body ? Math.max(sstep(0.12, 0.2, z) * sstep(0.24, 0.17, y), sstep(0.16, 0.12, y) * sstep(0.065, 0.02, ax)) : 0;
    const socks = part === PART.leg ? sstep(0.07, 0.035, y) : 0;
    const chin = part === PART.head ? Math.max(muzzle, sstep(0.27, 0.25, y) * sstep(0.2, 0.25, z)) : 0;
    c.lerp(light, Math.max(chest, socks, chin) * look.white);
  }
  // Светлее снизу (живот, подбородок).
  c.multiplyScalar(1 + 0.12 * sstep(0.2, 0.1, y) * (part === PART.body ? 1 : 0));
  void HEAD_C;
}

// ─── Кошка из модели ───────────────────────────────────────────────────

export interface GlbCat {
  root: THREE.Group;
  /** Корпус: начало — у таза; положение и наклон задаёт поза. */
  body: THREE.Group;
  head: THREE.Object3D;
  apply(p: CatPoseParams, t: number, mode?: string): void;
}

/**
 * Стоит ли лапа i на полу в режиме mode (1 — да, 0 — поднята): у шага — по сгибу нижнего звена
 * (сгиб — лапа в переносе), у умывания и игры — поднятая лапка, на спине и в прыжке — ни одна.
 */
function grounded(mode: string, i: number, up: number, low: number): number {
  switch (mode) {
    case 'jump':
    case 'belly':
      return 0;
    case 'scratch':
    case 'reach':
      // На задних лапах: передние в воздухе (на столбике), задние — на полу.
      return i < 2 ? 0 : 1;
    case 'walk':
    case 'trot':
    case 'rub':
      return Math.abs(low) < 0.04 ? 1 : 0;
    case 'groom':
    case 'play':
    case 'swat':
      return i === 1 && (up < 0.2 || low < -0.35) ? 0 : 1;
    case 'dig':
      return i < 2 && (Math.abs(low) > 0.05 || up > -0.45) ? 0 : 1;
    default:
      return 1;
  }
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();
/** Масштаб кости (отдельно от va: va занят пересчётом осей в turn). */
const vs = new THREE.Vector3();

/**
 * Строит кошку из модели: grow — рост котёнка (0.42…1), young — 0…1 (котёнок).
 * Масштаб — в единицах прежней модели: таз на высоте 0.175 × размер породы.
 */
export function buildGlbCat(look: CoatLook, lookKey: string, seed: number, grow: number, young: number, original = false): GlbCat | null {
  const t = template;
  if (!t) return null;
  const model = t.clone(t.gltf.scene);
  const root = new THREE.Group();
  const scaleRoot = new THREE.Group();
  root.add(scaleRoot);
  // Шире и пушистее — по пушистости породы.
  const s = (0.175 / t.hipH) * look.size * grow;
  scaleRoot.scale.set(s * (0.94 + 0.06 * look.fluff), s, s);
  const body = new THREE.Group();
  scaleRoot.add(body);
  body.position.set(0, t.hipH, -0.13 / (0.175 / t.hipH));
  // Модель внутри корпуса — таз в начале координат.
  model.position.set(-t.pelvis.x, -t.pelvis.y, -t.pelvis.z);
  body.add(model);
  const bones = new Map<string, THREE.Bone>();
  let headBone: THREE.Object3D = model;
  const coat = coatTexture(t, look, lookKey, seed, original);
  model.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) bones.set(b.name, b);
    const m = o as THREE.SkinnedMesh;
    // Карточки усов модели при поворотах головы видны как цветные осколки — вместо них свои усы.
    if (m.isMesh && !m.isSkinnedMesh) {
      m.visible = false;
      return;
    }
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      if (src.name === 'cat_diffuse' || src.name === 'material') {
        if (coat) mat.map = coat;
      }
      if (src.name === 'cat_diffuse') {
        mat.roughness = look.hairless ? 0.62 : 0.9;
        // Мягкий отлив шерсти на краях.
        mat.envMapIntensity = 0.7;
      }
      m.material = mat;
    }
  });
  const B = (re: RegExp): THREE.Bone | undefined => [...bones.values()].find((b) => re.test(b.name));
  headBone = B(/Neck_Top/) ?? model;
  // Котёнок: голова крупнее, лапки и хвост короче.
  if (young > 0) {
    headBone.scale.setScalar(1 + 0.28 * young);
    for (const re of [/l_FrontLeg_Hip/, /r_FrontLeg_Hip/, /l_HindLeg_Hip/, /r_HindLeg_Hip/]) B(re)?.scale.setScalar(1 - 0.1 * young);
  }
  const tail0 = B(/Tail_01_02/);
  if (tail0) tail0.scale.setScalar(Math.max(0.55, Math.min(1.35, 0.75 + 0.3 * look.tail)) * (1 - 0.2 * young));
  // Вислоухие — уши прижаты (по сетке нет костей ушей: уши у модели и так невысокие, уменьшаем их).
  // Большие уши — чуть увеличиваем голову сверху не трогаем; признак показывается окрасом и силуэтом.
  // Усы: тонкие изогнутые волоски от подушечек морды (в координатах кости головы).
  if (t.whiskers && headBone !== model) {
    const ws = new THREE.LineSegments(t.whiskers, new THREE.LineBasicMaterial({ color: look.base === '#1d1d21' ? '#9a9a9a' : '#f4f1ea', transparent: true, opacity: 0.3 }));
    headBone.add(ws);
  }
  // Закрытые глаза (моргание, сон): на месте радужек — сомкнутые веки (своя текстура окраса).
  const shut = shutCache.get(lookKey) ?? null;
  let eyeMat: THREE.MeshStandardMaterial | null = null;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).name === 'material') eyeMat = m.material as THREE.MeshStandardMaterial;
  });
  const eyeOpen = { map: (eyeMat as THREE.MeshStandardMaterial | null)?.map ?? null, rough: (eyeMat as THREE.MeshStandardMaterial | null)?.roughness ?? 0, metal: (eyeMat as THREE.MeshStandardMaterial | null)?.metalness ?? 0 };
  let closedNow = false;
  // Лапы: кости и положения суставов в покое (в плоскости y–z модели) для обратной кинематики.
  type V2 = [number, number];
  interface LegIK {
    hip?: THREE.Bone;
    knee?: THREE.Bone;
    hock?: THREE.Bone;
    wrist?: THREE.Bone;
    front: boolean;
    /** Отрезки: бедро/плечо (u), голень/предплечье (m1), плюсна (m2, у задних), от сустава до подушечки — в (y, z). */
    u: V2;
    m1: V2;
    m2: V2;
    /** Вектор от сустава до подушечки в покое (у модели и у прежней лапы). */
    v0: V2;
    q0: V2;
    /** Сустав в координатах корпуса (от таза), (y, z). */
    J: V2;
    /** Высота подушечки (сустава) над полом, когда лапа стоит. */
    ground: number;
    /** Длина лапы от сустава до подушечки, вытянутой. */
    reach: number;
    upLen: number;
    side0: number;
  }
  const yz = (v: THREE.Vector3): V2 => [v.y, v.z];
  const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
  const legs: LegIK[] = [];
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const cand = [...bones.values()].filter((b) => (front ? /FrontLeg_Hip/ : /HindLeg_Hip/).test(b.name));
      const hip = cand.find((b) => Math.sign(t.bones.get(b.name)!.restPos.x) === side) ?? cand[0];
      const pre = hip ? hip.name.replace(/_Hip.*/, '') : '';
      const knee = B(new RegExp(`${pre}_Knee1?SH`));
      const hock = front ? undefined : B(new RegExp(`${pre}_Knee2`));
      const wrist = B(new RegExp(`${pre}_Ankle`));
      const ball = B(new RegExp(`${pre}_Ball`));
      const P = (b: THREE.Bone | undefined): V2 => (b ? yz(t.bones.get(b.name)!.restPos) : [0, 0]);
      const J = P(hip);
      const K = P(knee);
      const E = P(ball);
      const Hk = front ? K : P(hock);
      const u = sub(K, J);
      const m1 = front ? sub(E, K) : sub(Hk, K);
      const m2: V2 = front ? [0, 0] : sub(E, Hk);
      const v0 = sub(E, J);
      // Прежняя лапа: плечо/бедро upLen и нижнее звено до подушечки (0, −0.076, 0.01).
      const upLen = front ? 0.085 : 0.08;
      const q0: V2 = [-upLen - 0.076, 0.01];
      const end: V2 = [u[0] + m1[0] + m2[0], u[1] + m1[1] + m2[1]];
      const pel = yz(t.pelvis);
      legs.push({ hip, knee, hock, wrist, front, u, m1, m2, v0, q0, J: sub(J, pel), ground: E[0] - (t.pelvis.y - t.hipH), reach: Math.hypot(u[0], u[1]) + Math.hypot(m1[0], m1[1]) + Math.hypot(m2[0], m2[1]), upLen, side0: Math.sign(end[0] * u[1] - end[1] * u[0]) || 1 });
    }
  }
  const R = (v: V2, a: number): V2 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  /** Сгиб голеностопа (скакательного сустава) при сгибе колена: плюсна остаётся почти параллельной прежней. */
  const HOCK = 1.05;
  const lowerEnd = (l: LegIK, a2: number): V2 => {
    const m = l.front ? l.m1 : (() => {
      const r2 = R(l.m2, -HOCK * a2);
      return [l.m1[0] + r2[0], l.m1[1] + r2[1]] as V2;
    })();
    const r = R(m, a2);
    return [l.u[0] + r[0], l.u[1] + r[1]];
  };
  /** Углы сустава (плечо/бедро) и колена/локтя, чтобы подушечка попала в точку T (относительно сустава). */
  const solve = (l: LegIK, T: V2): [number, number] => {
    const d = Math.hypot(T[0], T[1]);
    const f = (a: number): number => {
      const e = lowerEnd(l, a);
      return Math.hypot(e[0], e[1]) - d;
    };
    let best = 0;
    let bestScore = Infinity;
    const N = 48;
    let pa = -2.8;
    let pf = f(pa);
    for (let i = 1; i <= N; i += 1) {
      const a = -2.8 + (5.6 * i) / N;
      const fa = f(a);
      if (Math.sign(fa) !== Math.sign(pf)) {
        const r = pa + ((a - pa) * pf) / (pf - fa);
        const e = lowerEnd(l, r);
        const side = Math.sign(e[0] * l.u[1] - e[1] * l.u[0]);
        // Колено/локоть сгибается в свою сторону; из подходящих — ближайший к покою угол.
        const score = Math.abs(r) + (side !== l.side0 ? 10 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = r;
        }
      }
      pa = a;
      pf = fa;
    }
    if (bestScore === Infinity) {
      // Не дотянуться — ближайшая длина.
      let m = Infinity;
      for (let i = 0; i <= N; i += 1) {
        const a = -2.8 + (5.6 * i) / N;
        const v = Math.abs(f(a));
        if (v < m) {
          m = v;
          best = a;
        }
      }
    }
    const e = lowerEnd(l, best);
    const a1 = Math.atan2(T[1], T[0]) - Math.atan2(e[1], e[0]);
    return [a1, best];
  };
  const neck = [B(/Neck_01/), B(/Neck_02/), B(/Neck_Top/)];
  const tails = [B(/Tail_01_02/), B(/Tail_01_03/), B(/Tail_01_04/), B(/Tail_01_05/)];
  const spine = [B(/Spine_01/), B(/Spine_02/), B(/Spine_03/), B(/Spine_04/)];
  // Хвост с инерцией (пружина на каждом звене) и изгиб спины во сне (клубком).
  const tailX = [0, 0, 0, 0];
  const tailY = [0, 0, 0, 0];
  const tailVX = [0, 0, 0, 0];
  const tailVY = [0, 0, 0, 0];
  let curl = 0;
  let lastT = -1;
  /** Поворот кости вокруг осей модели (в покое) на углы ax, ay, az. */
  const turn = (b: THREE.Bone | undefined, ax: number, ay = 0, az = 0, sc?: THREE.Vector3): void => {
    if (!b) return;
    const r = t.bones.get(b.name);
    if (!r) return;
    b.quaternion.copy(r.restLocal);
    const inv = qa.copy(r.restWorld).invert();
    for (const [axis, ang] of [
      [X, ax],
      [Y, ay],
      [Z, az],
    ] as const) {
      if (!ang) continue;
      va.copy(axis).applyQuaternion(inv);
      b.quaternion.multiply(qb.setFromAxisAngle(va, ang));
    }
    if (sc) b.scale.copy(sc);
  };
  const H0 = t.hipH;
  const unit = H0 / 0.175;
  let side = 0;
  let sideT = -1;
  const apply = (p0: CatPoseParams, time: number, mode = 'idle'): void => {
    let p = p0;
    // Сон — на боку, клубком (как спят настоящие кошки); переход на бок и обратно — плавный.
    const sdt = sideT < 0 || time < sideT ? 1 : Math.min(0.1, time - sideT);
    sideT = time;
    const sideWant = mode === 'sleep' ? 1 : 0;
    side = sdt >= 1 ? sideWant : side + (sideWant - side) * Math.min(1, sdt * 2);
    if (side > 0.01) p = { ...p, roll: p.roll + 1.35 * side, hipY: p.hipY + (0.062 - p.hipY) * side, pitch: p.pitch * (1 - side) };
    const buzz = p.purr * 0.006 * Math.sin(time * 90);
    body.position.set(0, p.hipY * unit + buzz * 0.3 * unit, p.hipZ * unit);
    // Передние лапы модели короче прежних относительно корпуса: если опорной лапе не достать
    // до пола (сидит — грудь высоко), корпус наклоняется вперёд ровно настолько, чтобы достала.
    let pitch = p.pitch;
    if (Math.abs(p.roll) < 0.5 && (grounded(mode, 0, p.legs[0]![0], p.legs[0]![1]) || grounded(mode, 1, p.legs[1]![0], p.legs[1]![1]))) {
      const l = legs[0]!;
      const high = (a: number): number => p.hipY * unit + l.J[0] * Math.cos(a) - l.J[1] * Math.sin(a) - l.ground - l.reach * 0.97;
      if (high(pitch) > 0) {
        let lo = pitch;
        let hi = pitch + 1.2;
        for (let k = 0; k < 14; k += 1) {
          const m = (lo + hi) / 2;
          if (high(m) > 0) lo = m;
          else hi = m;
        }
        pitch = hi;
      }
    }
    p = { ...p, pitch };
    body.rotation.set(pitch, 0, p.roll);
    legs.forEach((l, i) => {
      const [up, low] = p.legs[i] ?? [0, 0];
      // Подушечка прежней лапы относительно её сустава → та же точка для лапы модели.
      const q = R([-l.upLen + R([-0.076, 0.01], low)[0], R([-0.076, 0.01], low)[1]], up);
      // Покой — точно поза модели; отклонение подушечки от покоя — как у прежней лапы (в единицах модели).
      const T: V2 = [l.v0[0] + (q[0] - l.q0[0]) * unit, l.v0[1] + (q[1] - l.q0[1]) * unit];
      // Опорные лапы — на полу (у модели другие пропорции, поэтому точку сдвигаем по вертикали мира);
      // поднятые (шаг, умывание, удар лапой) — не ниже пола.
      if (Math.abs(p.roll) < 0.5) {
        const cp = Math.cos(p.pitch);
        const sp = Math.sin(p.pitch);
        const ny = l.J[0] + T[0];
        const nz = l.J[1] + T[1];
        const newY = p.hipY * unit + ny * cp - nz * sp;
        const g = grounded(mode, i, up, low);
        const floorY = l.ground;
        const want = g >= 1 ? floorY : Math.max(floorY + (1 - g) * Math.abs(low) * 0.05, newY);
        const dy = want - newY;
        T[0] += dy * cp;
        T[1] -= dy * sp;
      }
      const [a1, a2] = solve(l, T);
      turn(l.hip, a1);
      turn(l.knee, a2);
      const a3 = l.front ? 0 : -HOCK * a2;
      if (!l.front) turn(l.hock, a3);
      // Кисть/стопа — параллельно полу (с учётом наклона корпуса), без крайних изгибов.
      turn(l.wrist, Math.max(-1.5, Math.min(1.5, -(a1 + a2 + a3 + p.pitch) * 0.9)));
    });
    // Голова: поворот распределён по шее.
    const parts = [0.15, 0.3, 0.55];
    // У модели длинная шея: сильный кивок прежней головы (умывание) — мягче, иначе голова уходит в грудь.
    const hx = p.headX > 0.6 ? 0.6 + (p.headX - 0.6) * 0.4 : p.headX;
    // Сильный поворот шеи растягивает кожу у плеч модели — ограничиваем.
    // Во сне голова повёрнута внутрь клубка (туда же, куда изгибается спина).
    const hy = mode === 'sleep' ? -Math.min(0.55, Math.abs(p.headY)) : Math.max(-0.55, Math.min(0.55, p.headY));
    const hz = Math.max(-0.3, Math.min(0.3, p.headZ));
    // Кивок — шеей (у головы модели кожа на затылке рвётся при сильном наклоне в суставе головы).
    const nod = [0.4, 0.4, 0.2];
    neck.forEach((b, i) => turn(b, hx * nod[i]!, hy * parts[i]!, i === 2 ? hz : 0));
    // Хвост: 8 звеньев прежней модели → 4 кости.
    const dt = lastT < 0 || time < lastT ? 1 : Math.min(0.1, time - lastT);
    lastT = time;
    const settle = dt >= 1;
    // Сон — клубком: спина изгибается в сторону, хвост обвивает, голова — к хвосту.
    const curlWant = mode === 'sleep' ? -0.28 : 0;
    curl = settle ? curlWant : curl + (curlWant - curl) * Math.min(1, dt * 1.5);
    tails.forEach((b, i) => {
      const a = p.tail[i * 2] ?? [0, 0];
      const c = p.tail[i * 2 + 1] ?? [0, 0];
      let wx = a[0] + c[0];
      let wy = a[1] + c[1] + (mode === 'sleep' ? 0.25 : 0);
      // Кончик хвоста живёт своей жизнью: медленно покачивается (кроме сна).
      if (i === 3 && mode !== 'sleep') {
        wx += 0.12 * Math.sin(time * 1.3 + seed);
        wy += 0.22 * Math.sin(time * 0.9 + seed * 2);
      }
      if (settle) {
        tailX[i] = wx;
        tailY[i] = wy;
        tailVX[i] = tailVY[i] = 0;
      } else {
        // Звено догоняет цель с запаздыванием и лёгким перехлёстом (к концу — мягче).
        const k = 70 - i * 12;
        const d = 9 - i;
        tailVX[i] = tailVX[i]! + (k * (wx - tailX[i]!) - d * tailVX[i]!) * dt;
        tailVY[i] = tailVY[i]! + (k * (wy - tailY[i]!) - d * tailVY[i]!) * dt;
        tailX[i] = tailX[i]! + tailVX[i]! * dt;
        tailY[i] = tailY[i]! + tailVY[i]! * dt;
      }
      turn(b, tailX[i]!, tailY[i]!);
    });
    // Дыхание — грудь чуть расширяется; изгиб спины распределён по позвонкам.
    const br = 1 + p.breath * 0.012;
    spine.forEach((b, i) => turn(b, 0, curl, 0, i === 1 || i === 2 ? vs.set(br, 1, br) : vs.set(1, 1, 1)));
    // Веки: сомкнуты при моргании и во сне.
    const closed = p.eye < 0.45;
    const em = eyeMat as THREE.MeshStandardMaterial | null;
    if (em && shut && closed !== closedNow) {
      closedNow = closed;
      em.map = closed ? shut : eyeOpen.map;
      em.roughness = closed ? 0.95 : eyeOpen.rough;
      em.metalness = closed ? 0 : eyeOpen.metal;
    }
  };
  return { root, body, head: headBone, apply };
}
