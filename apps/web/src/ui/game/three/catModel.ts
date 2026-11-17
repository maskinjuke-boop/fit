import * as THREE from 'three';
import { blend, ellipsoid, roundCone, smax, surfaceNets, type Prim } from './sdf';

/**
 * Лепка кошки полем расстояний: цельный корпус (круп, живот, грудь, лопатки, шея) и голова
 * (череп, скулы, подушечки усов, переносица, подбородок, глазницы) — без швов между частями.
 * Сетки зависят только от сложения (пушистость, длина, полнота, плоская морда) и кэшируются;
 * каждая кошка получает свою копию (окрас — цвет вершин).
 * Здесь же глаза: радужка с узким зрачком, тёмная кайма, блеск и веки для моргания.
 */

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g.clone();
}

/** Корпус в координатах группы корпуса (начало — у таза, морда на +Z). */
export function torsoGeometry(fluff: number, chub: number, len: number): THREE.BufferGeometry {
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  return cached(`torso|${r2(fluff)}|${r2(chub)}|${r2(len)}`, () => {
    const w = fluff * chub;
    const z = (v: number): number => v * len;
    const prims: Prim[] = [
      // Круп и бёдра.
      ellipsoid([0, 0.018, z(0.0)], [0.08 * w, 0.085 * w, 0.085]),
      // Живот (чуть провисает) и спина ровной линией.
      ellipsoid([0, -0.004, z(0.13)], [0.083 * w, 0.08 * w, 0.125 * len]),
      ellipsoid([0, 0.04, z(0.13)], [0.062 * w, 0.055 * w, 0.17 * len]),
      // Грудная клетка и лопатки.
      ellipsoid([0, 0.008, z(0.245)], [0.078 * w, 0.092 * w, 0.085]),
      ellipsoid([0.034 * w, 0.06, z(0.255)], [0.036 * w, 0.034, 0.05]),
      ellipsoid([-0.034 * w, 0.06, z(0.255)], [0.036 * w, 0.034, 0.05]),
      // Шея к голове.
      roundCone([0, 0.035, z(0.275)], [0, 0.078, z(0.335)], 0.058 * w, 0.047 * w),
    ];
    // Пушистые породы: «жабо» на груди.
    if (fluff > 1.1) prims.push(ellipsoid([0, 0.02, z(0.31)], [0.065 * fluff, 0.07 * fluff, 0.045]));
    const f = blend(prims, 0.045);
    return surfaceNets(f, { min: [-0.15, -0.13, -0.14], max: [0.15, 0.17, 0.45], step: 0.0045 });
  });
}

/** Положение левого глаза (+X) в координатах головы (до масштаба породы hs) и радиус. */
export const EYE = { x: 0.031, y: 0.068, z: 0.083, r: 0.0175 };

/** Голова в координатах группы головы (до масштаба hs; морда на +Z). */
export function headGeometry(flat: boolean): THREE.BufferGeometry {
  return cached(`head|${flat}`, () => {
    const mz = flat ? 0.82 : 1;
    const prims: Prim[] = [
      // Череп: круглый, чуть шире, чем высота.
      ellipsoid([0, 0.064, 0.022], [0.07, 0.061, 0.066]),
      // Скулы и щёки.
      ellipsoid([0.04, 0.036, 0.052], [0.04, 0.034, 0.042]),
      ellipsoid([-0.04, 0.036, 0.052], [0.04, 0.034, 0.042]),
      // Подушечки усов по бокам носа.
      ellipsoid([0.017, 0.031, 0.1 * mz], [0.021, 0.018, 0.019]),
      ellipsoid([-0.017, 0.031, 0.1 * mz], [0.021, 0.018, 0.019]),
      // Переносица от лба к носу.
      ellipsoid([0, 0.056, 0.092 * mz], [0.019, 0.016, 0.032]),
      // Подбородок и низ челюсти.
      ellipsoid([0, 0.016, 0.086 * mz], [0.019, 0.012, 0.018]),
      ellipsoid([0, 0.022, 0.035], [0.05, 0.034, 0.05]),
      // Горло: уходит вниз в шею и закрывает стык с корпусом (без тёмной складки).
      ellipsoid([0, -0.002, 0.012], [0.047, 0.042, 0.05]),
    ];
    const base = blend(prims, 0.026);
    // Глазницы: неглубокие впадины, в которых лежат глаза.
    const er = EYE.r * 1.02;
    const field = (x: number, y: number, zz: number): number => {
      let d = base(x, y, zz);
      for (const sx of [-1, 1]) {
        const s = Math.hypot(x - sx * EYE.x, y - EYE.y, zz - EYE.z) - er;
        d = smax(d, -s, 0.008);
      }
      return d;
    };
    return surfaceNets(field, { min: [-0.12, -0.06, -0.07], max: [0.12, 0.15, 0.15], step: 0.0028 });
  });
}

/** Профиль лапы: тело вращения с круглыми концами (сустав), от r0 у верха к r1 внизу. */
export function limbGeometry(r0: number, r1: number, len: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 6;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0));
  }
  for (let i = 1; i <= 6; i += 1) {
    const t = i / 7;
    // Чуть полнее в верхней трети (мышца).
    const r = r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * 0.12 * r0;
    pts.push(new THREE.Vector2(r, -len * t));
  }
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, -len - Math.sin(a) * r1));
  }
  pts[0]!.x = 0.0001;
  pts[pts.length - 1]!.x = 0.0001;
  return new THREE.LatheGeometry(pts, 16);
}

const irisCache = new Map<string, THREE.CanvasTexture>();

/**
 * Текстура глаза в развёртке сферы (полюс — центр зрачка, смотрит на +Z после поворота):
 * радужка с лучистым рисунком и тёмным ободком, вертикальный зрачок (у котят — круглее).
 */
function irisTexture(color: string, round: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${color}|${round.toFixed(2)}`;
  const hit = irisCache.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(W, H);
  const base = new THREE.Color(color);
  const deep = base.clone().multiplyScalar(0.45);
  const glow = base.clone().lerp(new THREE.Color('#fff6c8'), 0.35);
  const px = new THREE.Color();
  // Полуширина зрачка и полувысота (в долях радиуса радужки).
  const pw = 0.13 + 0.5 * round;
  const ph = 0.82 - 0.12 * round;
  for (let j = 0; j < H; j += 1) {
    // v: 0 — полюс (центр зрачка), 1 — противоположный полюс.
    const th = (j / (H - 1)) * Math.PI;
    for (let i = 0; i < W; i += 1) {
      const ph0 = (i / W) * Math.PI * 2;
      // Точка на передней шапке: координаты в плоскости глаза.
      const r = th / 1.15; // 1 — край радужки
      // Развёртка сферы после поворота полюса на +Z: x = −cos φ, y = −sin φ.
      const x = -Math.cos(ph0) * r;
      const y = -Math.sin(ph0) * r;
      if (r <= 1) {
        // Радужка: светлее к зрачку, лучи, тёмный ободок по краю.
        const rays = 0.5 + 0.5 * Math.sin(ph0 * 46 + Math.sin(ph0 * 7) * 2);
        px.copy(glow).lerp(base, Math.min(1, r * 1.3)).lerp(deep, Math.max(0, (r - 0.72) / 0.28) ** 1.4);
        px.multiplyScalar(0.88 + 0.16 * rays);
        // Зрачок — вертикальный овал с мягким краем.
        const e = (x / pw) ** 2 + (y / ph) ** 2;
        const k = Math.min(1, Math.max(0, (e - 0.85) / 0.3));
        px.multiplyScalar(k).add(new THREE.Color(0.01, 0.01, 0.012).multiplyScalar(1 - k));
      } else px.setRGB(0.95, 0.93, 0.88).lerp(deep, Math.max(0, 1.12 - r) * 4);
      const o = (j * W + i) * 4;
      img.data[o] = Math.round(Math.min(1, px.r) ** (1 / 2.2) * 255);
      img.data[o + 1] = Math.round(Math.min(1, px.g) ** (1 / 2.2) * 255);
      img.data[o + 2] = Math.round(Math.min(1, px.b) ** (1 / 2.2) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  irisCache.set(key, t);
  return t;
}

export interface CatEye {
  group: THREE.Group;
  lid: THREE.Object3D;
}

/** Угол верхнего века: открыто и закрыто. */
export const LID_OPEN = -0.78;
export const LID_CLOSED = 1.05;

/**
 * Глаз кошки: яблоко с радужкой во весь видимый глаз, глянцевая роговица с бликом,
 * тёмная миндалевидная кайма и верхнее веко из меха (моргание — поворотом века).
 */
export function catEye(color: string, round: number, r: number, lidMat: THREE.Material): CatEye {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(r, 36, 24);
  // Полюс сферы (центр зрачка) — на +Z.
  geo.rotateX(Math.PI / 2);
  const tex = irisTexture(color, round);
  const ball = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      map: tex,
      color: tex ? '#ffffff' : color,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.12,
      emissiveMap: tex,
    }),
  );
  ball.userData.keepColor = true;
  group.add(ball);
  // Блик — маленькое яркое пятно сверху-сбоку.
  const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  glint.position.set(r * 0.32, r * 0.38, r * 0.86);
  glint.scale.z = 0.4;
  glint.userData.keepColor = true;
  group.add(glint);
  // Тёмная кайма по краю века (миндалевидная).
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.13, 8, 32), new THREE.MeshStandardMaterial({ color: '#17110e', roughness: 0.6 }));
  rim.position.z = r * 0.42;
  rim.scale.set(1.08, 0.86, 1);
  rim.userData.keepColor = true;
  group.add(rim);
  // Верхнее веко — полусфера меха; окрас — как у головы (часть «head»).
  const lid = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
  shell.userData.part = 'head';
  lid.add(shell);
  lid.rotation.x = LID_OPEN;
  group.add(lid);
  return { group, lid };
}

/**
 * Ухо — тонкая раковина: конус, у которого передняя половина вдавлена внутрь (чашечка).
 * Атрибут inner (0…1) — внутренняя розовая сторона (по краю остаётся мех). Основание — на y = 0.
 */
export function earGeometry(r: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 24, 8, true);
  g.translate(0, h / 2, 0);
  const pos = g.getAttribute('position');
  const inner = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = y / h;
    const rr = Math.max(1e-6, r * (1 - t));
    const front = z / rr;
    // Передняя половина — вогнутая чашечка, задняя — плоская выпуклая спинка.
    pos.setZ(i, z > 0 ? -z * 0.12 : z * 0.42);
    inner[i] = Math.min(1, Math.max(0, (front - 0.2) / 0.35)) * Math.min(1, Math.max(0, (0.9 - t) / 0.25)) * Math.min(1, Math.max(0, (1 - Math.abs(pos.getX(i)) / rr - 0.05) / 0.25));
  }
  g.setAttribute('inner', new THREE.BufferAttribute(inner, 1));
  g.computeVertexNormals();
  return g;
}
