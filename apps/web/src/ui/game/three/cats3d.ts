import * as THREE from 'three';
import { addOutlines } from './outline';
import type { CatBreed } from '../../../game/lifeTypes';
import { buildGlbCat, catModelReady, type CatPoseParams } from './catGlb';
import { catEye, earGeometry, EYE, headGeometry, LID_CLOSED, LID_OPEN, limbGeometry, torsoGeometry } from './catModel';
import { taperTube } from './kit';
import { mergeGeometries } from './sdf';

/**
 * Кошки разных пород: модель из сглаженных примитивов с окраской по вершинам
 * (полоски, пятна, «маска» сиамской, белая грудка), пушистость, уши по породе.
 * У кошки есть простой скелет из групп (корпус, голова, четыре лапы по два сустава,
 * хвост из сегментов) и позы: ходьба, стойка, сидя, умывание, лёжа «буханкой», сон
 * клубком, игра лапой. Позы смешиваются плавно.
 */

export type CatMode =
  | 'walk'
  | 'trot'
  | 'idle'
  | 'sit'
  | 'groom'
  | 'lie'
  | 'sleep'
  | 'play'
  // Ест или пьёт из миски (голова у пола, жуёт).
  | 'eat'
  // Готовится к прыжку: припала к полу, виляет задом.
  | 'crouch'
  // В прыжке: лапы вытянуты (наклон — параметр tilt).
  | 'jump'
  // В лотке: присела, хвост поднят; закапывает передней лапой.
  | 'litter'
  | 'dig'
  // Перевернулась на спину, лапки кверху.
  | 'belly'
  // Сидит с закрытыми глазами и мурлычет, тянется головой к руке.
  | 'purr'
  // Трётся о ноги: идёт медленно, голова набок, хвост трубой.
  | 'rub'
  // Стоя бьёт лапой по игрушке.
  | 'swat'
  // Встала на задние лапы у столбика и точит когти (передние лапы по очереди тянут вниз).
  | 'scratch'
  // Встала на задние лапы и бьёт лапой висящую игрушку над собой.
  | 'reach';

interface Look {
  base: string;
  dark: string;
  light: string;
  eyes: string;
  pattern: 'solid' | 'tabby' | 'points' | 'spots';
  /** Белая грудка и лапки. */
  white: number;
  size: number;
  fluff: number;
  tail: number;
  ears: 'normal' | 'fold' | 'big' | 'tufts';
  flat: boolean;
  hairless: boolean;
}

const LOOKS: Record<CatBreed, Look> = {
  ginger: { base: '#d9822b', dark: '#9c4e17', light: '#f6e2c6', eyes: '#c9a227', pattern: 'tabby', white: 0.7, size: 1, fluff: 1, tail: 1, ears: 'normal', flat: false, hairless: false },
  black: { base: '#1d1d21', dark: '#0e0e10', light: '#2a2a2f', eyes: '#e8a317', pattern: 'solid', white: 0, size: 0.97, fluff: 1, tail: 1, ears: 'normal', flat: false, hairless: false },
  british: { base: '#8c96a3', dark: '#76808c', light: '#a2abb6', eyes: '#e0862a', pattern: 'solid', white: 0, size: 1.08, fluff: 1.12, tail: 1.15, ears: 'normal', flat: false, hairless: false },
  siamese: { base: '#efe3cf', dark: '#3f2c22', light: '#f8f0e2', eyes: '#3d8fd6', pattern: 'points', white: 0, size: 0.95, fluff: 0.95, tail: 0.9, ears: 'big', flat: false, hairless: false },
  scottish_fold: { base: '#b8b8b8', dark: '#4e4e52', light: '#ecebe8', eyes: '#d1a92c', pattern: 'tabby', white: 0.5, size: 1, fluff: 1.08, tail: 1.1, ears: 'fold', flat: false, hairless: false },
  bengal: { base: '#d6a043', dark: '#4a2d16', light: '#f3e2bf', eyes: '#7fb33a', pattern: 'spots', white: 0.4, size: 1.02, fluff: 0.95, tail: 1, ears: 'normal', flat: false, hairless: false },
  persian: { base: '#f3f1ec', dark: '#dcd6cc', light: '#ffffff', eyes: '#d77a2a', pattern: 'solid', white: 0, size: 1.02, fluff: 1.32, tail: 1.75, ears: 'normal', flat: true, hairless: false },
  maine_coon: { base: '#7c5a3c', dark: '#2b1d12', light: '#e9dcc7', eyes: '#a8b833', pattern: 'tabby', white: 0.6, size: 1.3, fluff: 1.22, tail: 1.8, ears: 'tufts', flat: false, hairless: false },
  sphynx: { base: '#e1b29a', dark: '#b98a76', light: '#eec7b3', eyes: '#7cc24a', pattern: 'solid', white: 0, size: 0.95, fluff: 0.82, tail: 0.55, ears: 'big', flat: false, hairless: true },
};

/** Основной цвет породы (для значков). */
export const catColor = (b: CatBreed): string => LOOKS[b].base;

const HEAD: Partial<Record<CatBreed, number>> = { british: 1.12, persian: 1.08, maine_coon: 1.04 };

const hash = (seed: number, k: number): number => {
  const h = Math.sin(seed * 91.17 + k * 47.31) * 43758.5453;
  return h - Math.floor(h);
};

const blend = (a: string, b: string, k: number): string => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

/**
 * Окрас и сложение помеси: цвета — смесь родителей (с перевесом в сторону одного),
 * рисунок и глаза — от одного из них; вислоухость, плоская морда и бесшёрстность
 * проявляются, только если они у обоих (как рецессивные признаки).
 */
function mixLook(a: Look, b: Look, seed: number): Look {
  // Окрас ближе к одному из родителей (с оттенком другого), а не «грязная» середина.
  const h = hash(seed, 1);
  const k = h < 0.5 ? 0.12 + h * 0.36 : 0.52 + h * 0.36;
  // Сиамские «отметины» проявляются, только если у обоих.
  const pattern = a.pattern === b.pattern ? a.pattern : a.pattern === 'points' ? b.pattern : b.pattern === 'points' ? a.pattern : hash(seed, 2) < 0.5 ? a.pattern : b.pattern;
  const ears = a.ears === b.ears ? a.ears : a.ears === 'fold' ? b.ears : b.ears === 'fold' ? a.ears : hash(seed, 3) < 0.5 ? a.ears : b.ears;
  return {
    base: blend(a.base, b.base, k),
    dark: blend(a.dark, b.dark, k),
    light: blend(a.light, b.light, k),
    eyes: hash(seed, 4) < 0.5 ? a.eyes : b.eyes,
    pattern,
    white: Math.max(a.white, b.white) * (0.6 + hash(seed, 5) * 0.4),
    size: (a.size + b.size) / 2,
    fluff: (a.fluff + b.fluff) / 2,
    tail: (a.tail + b.tail) / 2,
    ears,
    flat: a.flat && b.flat,
    hairless: a.hairless && b.hairless,
  };
}

export interface CatLookOpts {
  /** Вторая порода у метиса. */
  mix?: CatBreed;
  /** Рост котёнка 0.42…1 (1 — взрослая). */
  grow?: number;
}

/** Ключ внешности: пересобрать модель, если поменялся. */
export const catLookKey = (breed: CatBreed, o: CatLookOpts = {}): string => `${breed}|${o.mix ?? ''}|${Math.round((o.grow ?? 1) * 10)}|${catModelReady() ? 'm' : 'p'}`;

interface Leg {
  pivot: THREE.Group;
  lower: THREE.Group;
  front: boolean;
  side: number;
}

export interface Cat3D {
  root: THREE.Group;
  breed: CatBreed;
  /** Ключ внешности (порода, помесь, рост). */
  key: string;
  body: THREE.Group;
  head: THREE.Object3D;
  legs: Leg[];
  tail: THREE.Group[];
  eyes: THREE.Object3D[];
  /** Верхние веки (моргание). */
  lids: THREE.Object3D[];
  /** Доля длины лап (у котёнка лапки короче — корпус ниже над полом). */
  legLen: number;
  /** Текущие параметры позы (для плавных переходов). */
  pose: Pose;
  /** У реалистичной модели — поза через скелет (вместо групп прежней модели). */
  apply?: (p: CatPoseParams, t: number, mode?: string) => void;
}

interface Pose {
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
  /** Крен корпуса (на спину). */
  roll: number;
  /** Мелкая дрожь (мурлыканье). */
  purr: number;
}

const tmp = new THREE.Vector3();
const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Окраска вершин по положению в теле кошки (координаты root — до масштаба размера и возраста,
 * поэтому у котёнка и у крупной породы рисунок ложится так же). Переходы плавные — без «лесенки».
 */
function paint(root: THREE.Object3D, head: THREE.Object3D, look: Look, seed: number): void {
  const base = new THREE.Color(look.base);
  const dark = new THREE.Color(look.dark);
  const light = new THREE.Color(look.light);
  const c = new THREE.Color();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const headInv = new THREE.Matrix4().copy(head.matrixWorld).invert();
  const hp = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.keepColor) return;
    const part = (m.userData.part as string | undefined) ?? 'body';
    const pos = m.geometry.getAttribute('position');
    const nor = m.geometry.getAttribute('normal');
    const nm = new THREE.Matrix3();
    const colors = new Float32Array(pos.count * 3);
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const toHead = new THREE.Matrix4().multiplyMatrices(headInv, m.matrixWorld);
    nm.getNormalMatrix(toRoot);
    for (let i = 0; i < pos.count; i += 1) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      hp.fromBufferAttribute(pos, i).applyMatrix4(toHead);
      const { x, y, z } = tmp;
      c.copy(base);
      // Подушечки усов и нос спереди морды (светлые у белогрудых, тёмные у сиамских).
      const pads = part === 'head' ? sstep(0.082, 0.1, hp.z) * sstep(0.052, 0.04, hp.y) : 0;
      if (look.pattern === 'tabby') {
        // Поперечные полосы по спине и бокам, «М» на лбу, кольца на хвосте.
        let s = 0;
        if (part === 'tail') s = Math.sin((m.userData.seg as number) * 2.4) > 0.2 ? 1 : 0;
        else if (part === 'head') s = sstep(0.08, 0.095, hp.y) * sstep(0.01, 0.03, hp.z) * sstep(0.15, 0.55, Math.sin(hp.x * 140));
        else if (part === 'leg') s = 0.8 * sstep(0.35, 0.75, Math.sin(y * 90));
        else s = sstep(0.3, 0.7, Math.sin(z * 52 + Math.sin(y * 30) * 1.5 + x * 8)) * sstep(0.15, 0.19, y);
        c.lerp(dark, s * 0.85);
      } else if (look.pattern === 'spots') {
        if (part === 'body' || part === 'leg') {
          const cx = Math.floor(z * 26 + 0.5 * Math.floor(y * 26));
          const cy = Math.floor(y * 26);
          const h = Math.sin(cx * 12.9898 + cy * 78.233 + seed) * 43758.5453;
          const f = h - Math.floor(h);
          const fx = z * 26 + 0.5 * Math.floor(y * 26) - cx - 0.5;
          const fy = y * 26 - cy - 0.5;
          const d = Math.hypot(fx, fy);
          if (f > 0.35) c.lerp(dark, 0.85 * sstep(0.44, 0.28, d));
        }
        if (part === 'tail') c.lerp(dark, Math.sin((m.userData.seg as number) * 2.4) > 0.3 ? 0.8 : 0);
      } else if (look.pattern === 'points') {
        // Тёмные «отметины»: морда, уши, лапы и хвост.
        let p = 0;
        if (part === 'ear') p = 1;
        if (part === 'tail') p = Math.min(1, 0.4 + (m.userData.seg as number) * 0.15);
        if (part === 'leg') p = sstep(0.17, 0.07, y);
        if (part === 'head') p = Math.max(sstep(0.035, 0.1, hp.z), pads);
        if (part === 'muzzle') p = 1;
        c.lerp(dark, p);
      } else {
        c.lerp(dark, Math.max(0, Math.sin(x * 23 + z * 17) * 0.06));
      }
      // Белая грудка, живот и «носочки».
      if (look.white > 0) {
        const chest = part === 'body' ? Math.max(sstep(0.05, 0.11, z) * sstep(0.26, 0.21, y), sstep(0.135, 0.105, y)) : 0;
        const socks = part === 'leg' ? sstep(0.075, 0.045, y) : 0;
        const muzzle = part === 'muzzle' ? 1 : part === 'head' ? Math.max(sstep(0.045, 0.028, hp.y) * sstep(0.035, 0.065, hp.z), pads) : 0;
        c.lerp(light, Math.max(chest, socks, muzzle) * look.white);
      }
      const inner = m.geometry.getAttribute('inner');
      if (part === 'ear' && inner) c.lerp(new THREE.Color(look.hairless ? '#d99b8f' : '#e6a3a1'), inner.getX(i));
      // Лёгкая неровность меха.
      // Случайная по вершине (без периода — на частой сетке нет муара «колец»).
      const hh = Math.sin(x * 1271.1 + y * 3117.7 + z * 747.3 + seed * 13.1) * 43758.5453;
      const n = (hh - Math.floor(hh) - 0.5) * 0.06;
      // Низ (подбородок, щёки снизу, живот) чуть светлее: мягкий мех рассеивает свет, и снизу
      // нет резкой тёмной «каймы» (например, «ошейника» под головой).
      const down = nor ? Math.max(0, -hp.copy(tmp.fromBufferAttribute(nor, i)).applyMatrix3(nm).normalize().y) : 0;
      const lift = 1 + 0.3 * down;
      colors[i * 3] = Math.min(1, Math.max(0, c.r * lift + n));
      colors[i * 3 + 1] = Math.min(1, Math.max(0, c.g * lift + n));
      colors[i * 3 + 2] = Math.min(1, Math.max(0, c.b * lift + n));
    }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  });
}

function blob(r: number, sx: number, sy: number, sz: number, m: THREE.Material, part: string, pos: [number, number, number]): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), m);
  me.scale.set(sx, sy, sz);
  me.position.set(...pos);
  me.userData.part = part;
  me.castShadow = true;
  return me;
}

/** Строит кошку породы breed (смотрит на +Z, лапы на полу). */
export function buildCat(breed: CatBreed, seed = 1, opts: CatLookOpts = {}): Cat3D {
  const mix = opts.mix && opts.mix !== breed ? opts.mix : undefined;
  const look = mix ? mixLook(LOOKS[breed], LOOKS[mix], seed) : LOOKS[breed];
  const grow = Math.max(0.42, Math.min(1, opts.grow ?? 1));
  // Котёнок: голова, глаза и уши крупнее относительно тела, хвост короче, шерсть пушистее.
  const young = (1 - grow) / 0.58;
  // Реалистичная модель (если загружена): окрас породы на шерсти модели, позы через скелет.
  if (catModelReady()) {
    const key = catLookKey(breed, { mix, grow });
    const g = buildGlbCat(look, key, seed, grow, young, breed === 'ginger' && !mix);
    if (g) {
      const cat: Cat3D = { root: g.root, breed, key, body: g.body, head: g.head, legs: [], tail: [], eyes: [], lids: [], legLen: 1 - 0.1 * young, pose: restPose(), apply: g.apply };
      poseCat(cat, 'idle', 0, 0, 1);
      // Мульт-контур, как у людей и мебели.
      addOutlines(g.root, { thickness: 0.01 });
      return cat;
    }
  }
  const darkCoat = new THREE.Color(look.base).getHSL({ h: 0, s: 0, l: 0 }).l < 0.15;
  const fur = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: look.hairless ? 0.55 : 0.88,
    sheen: look.hairless ? 0 : 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(look.light).multiplyScalar(0.6),
  });
  const F = look.fluff;
  const root = new THREE.Group();
  const scaleRoot = new THREE.Group();
  scaleRoot.scale.setScalar(look.size * grow);
  root.add(scaleRoot);

  // Корпус: начало координат — у таза (кошка садится, поворачиваясь вокруг него).
  const body = new THREE.Group();
  body.position.set(0, 0.175, -0.13);
  scaleRoot.add(body);
  // У котёнка корпус короче и круглее, лапки толще.
  const len = 1 - 0.14 * young;
  const chub = 1 + 0.08 * young;
  // Цельный вылепленный корпус: круп, живот, грудь, лопатки и шея без швов.
  const torso = new THREE.Mesh(torsoGeometry(F, chub, len), fur);
  torso.userData.part = 'body';
  torso.castShadow = true;
  body.add(torso);

  // Голова.
  const head = new THREE.Group();
  head.position.set(0, 0.075, 0.34 * len);
  body.add(head);
  const hs = ((HEAD[breed] ?? 1) + (HEAD[mix ?? breed] ?? 1)) / 2;
  head.scale.setScalar(1 + young * 0.42);
  // Морда — одна вылепленная сетка (череп, скулы, подушечки усов, подбородок, глазницы).
  const skull = new THREE.Mesh(headGeometry(look.flat), fur);
  skull.scale.setScalar(hs);
  skull.userData.part = 'head';
  // Тень головы на грудь читается как тёмный «ошейник» — голова тень не отбрасывает.
  skull.castShadow = false;
  head.add(skull);
  const mz = look.flat ? 0.82 : 1;
  // Нос — треугольная мочка.
  const noseGeo = new THREE.SphereGeometry(0.0115, 14, 10);
  noseGeo.scale(1.25, 0.72, 0.75);
  const nose = new THREE.Mesh(noseGeo, new THREE.MeshPhysicalMaterial({ color: darkCoat ? '#2b2626' : look.hairless ? '#c98a84' : '#d98585', roughness: 0.35, clearcoat: 0.5 }));
  nose.position.set(0, 0.049 * hs, (0.119 * mz + 0.004) * hs);
  nose.rotation.x = -0.35;
  head.add(nose);
  // Рот: от носа вниз и в стороны («перевёрнутая Y»).
  const mouthM = new THREE.MeshStandardMaterial({ color: darkCoat ? '#0b0b0b' : '#4a302b', roughness: 0.7 });
  const mp = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x * hs, y * hs, z * mz * hs);
  const mouth = mergeGeometries([
    taperTube(new THREE.CatmullRomCurve3([mp(0, 0.042, 0.121), mp(0, 0.033, 0.119)]), 0.0011, 0.0011, 4, 5),
    taperTube(new THREE.CatmullRomCurve3([mp(0, 0.033, 0.119), mp(0.007, 0.029, 0.117), mp(0.016, 0.03, 0.111)]), 0.0011, 0.0006, 8, 5),
    taperTube(new THREE.CatmullRomCurve3([mp(0, 0.033, 0.119), mp(-0.007, 0.029, 0.117), mp(-0.016, 0.03, 0.111)]), 0.0011, 0.0006, 8, 5),
  ]);
  const mouthMesh = new THREE.Mesh(mouth, mouthM);
  mouthMesh.userData.keepColor = true;
  head.add(mouthMesh);
  // Глаза: крупные, с радужкой во весь глаз, вертикальным зрачком (у котят — круглее), блеском и веком.
  const eyes: THREE.Object3D[] = [];
  const lids: THREE.Object3D[] = [];
  const eyeBig = 1 + young * 0.22;
  for (const sx of [-1, 1]) {
    const e = catEye(look.eyes, Math.min(1, young * 0.8), EYE.r * eyeBig, fur);
    e.group.position.set(sx * EYE.x * hs, EYE.y * hs, EYE.z * mz * hs);
    e.group.rotation.set(-0.05, sx * 0.32, 0);
    e.group.scale.setScalar(hs);
    head.add(e.group);
    eyes.push(e.group);
    lids.push(e.lid);
  }
  // Уши: изогнутая раковина с розовой внутренней стороной.
  const earScale = look.ears === 'big' ? 1.42 : look.ears === 'fold' ? 0.72 : 1;
  const earFur = fur.clone();
  earFur.side = THREE.DoubleSide;
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * 0.044 * hs, 0.108 * hs, 0.018);
    ear.rotation.set(look.ears === 'fold' ? 1.25 : -0.12, sx * 0.25, -sx * 0.3);
    const eh = 0.062 * earScale;
    const outer = new THREE.Mesh(earGeometry(0.031 * earScale, eh), earFur);
    outer.userData.part = 'ear';
    outer.castShadow = true;
    ear.add(outer);
    if (look.ears === 'tufts') {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.035, 6), fur);
      tuft.position.y = eh * 0.95 + 0.012;
      tuft.userData.part = 'ear';
      ear.add(tuft);
    }
    head.add(ear);
  }
  // Усы: изогнутые тонкие волоски от подушечек.
  const wpos: number[] = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const y0 = 0.036 - i * 0.004;
      const pts = [mp(sx * 0.022, y0, 0.108), mp(sx * 0.07, y0 + 0.004 - i * 0.008, 0.11 - i * 0.004), mp(sx * 0.115, y0 - 0.006 - i * 0.017, 0.098 - i * 0.012)];
      const curve = new THREE.QuadraticBezierCurve3(pts[0]!, pts[1]!, pts[2]!);
      const ps = curve.getPoints(6);
      for (let k = 0; k < ps.length - 1; k += 1) wpos.push(ps[k]!.x, ps[k]!.y, ps[k]!.z, ps[k + 1]!.x, ps[k + 1]!.y, ps[k + 1]!.z);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  const whiskers = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: darkCoat ? '#8a8a8a' : '#f7f4ee', transparent: true, opacity: 0.85 }));
  head.add(whiskers);

  // Лапы: у каждой бедро/плечо и нижнее звено с подушечкой; суставы скруглены.
  const legs: Leg[] = [];
  const legR = 0.026 * (0.9 + 0.1 * F) * (1 + 0.18 * young);
  const legLen = 1 - 0.16 * young;
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.052 * F * chub, -0.01, front ? 0.27 * len : 0.02);
      const upLen = front ? 0.085 : 0.08;
      const up = new THREE.Mesh(limbGeometry(front ? legR * 1.18 : legR * 1.5, legR, upLen), fur);
      up.userData.part = 'leg';
      up.castShadow = true;
      pivot.add(up);
      // Задние лапы: мощное бедро (двигается вместе с лапой).
      if (!front) pivot.add(blob(0.052, 0.72 * F, 1.0 * F, 1.05, fur, 'body', [0, -0.012, 0.004]));
      const lower = new THREE.Group();
      lower.position.y = -upLen;
      const low = new THREE.Mesh(limbGeometry(legR, legR * 0.82, 0.072), fur);
      low.userData.part = 'leg';
      low.castShadow = true;
      lower.add(low);
      // Лапка: округлая, с намёком на пальчики.
      const paw = blob(0.024, 1.05, 0.58, 1.28, fur, 'leg', [0, -0.076, 0.01]);
      lower.add(paw);
      for (const tx of [-1.5, -0.5, 0.5, 1.5]) lower.add(blob(0.0085, 1, 0.75, 1.1, fur, 'leg', [tx * 0.0105, -0.08, 0.034 - Math.abs(tx) * 0.003]));
      pivot.add(lower);
      pivot.scale.y = legLen;
      body.add(pivot);
      legs.push({ pivot, lower, front, side });
    }
  }

  // Хвост из сегментов: плавно сужается к кончику.
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  const segs = 8;
  const segLen = 0.042;
  for (let i = 0; i < segs; i += 1) {
    const g = new THREE.Group();
    if (i === 0) g.position.set(0, 0.04, -0.08);
    else g.position.set(0, 0, -segLen);
    const r = (0.019 - i * 0.0012) * look.tail;
    const r1 = (0.019 - (i + 1) * 0.0012) * look.tail;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r, segLen, 14, 3, true), fur);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -segLen / 2;
    seg.userData.part = 'tail';
    seg.userData.seg = i;
    seg.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(r1, 14, 10), fur);
    knob.position.z = -segLen;
    knob.userData.part = 'tail';
    knob.userData.seg = i;
    g.add(seg, knob);
    parent.add(g);
    tail.push(g);
    parent = g;
  }

  if (young > 0) tail[0]!.scale.setScalar(1 - young * 0.35);
  paint(scaleRoot, head, look, seed);
  const cat: Cat3D = { root, breed, key: catLookKey(breed, { mix, grow }), body, head, legs, tail, eyes, lids, legLen, pose: restPose() };
  poseCat(cat, 'idle', 0, 0, 1);
  return cat;
}

function restPose(): Pose {
  return { hipY: 0.175, hipZ: -0.13, pitch: 0, headX: 0, headY: 0, headZ: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], tail: Array.from({ length: 8 }, () => [0.2, 0] as [number, number]), eye: 1, breath: 0, roll: 0, purr: 0 };
}

/**
 * Целевая поза для режима. legs: [плечо/бедро, нижнее звено] (+ — лапа назад);
 * tail: [подъём, вбок]; tilt — наклон в прыжке (+ — носом вниз).
 */
function target(mode: CatMode, t: number, speed: number, look: number, tilt: number): Pose {
  const p = restPose();
  const blink = (Math.sin(t * 0.7) > 0.985 ? 0.1 : 1) as number;
  switch (mode) {
    case 'eat': {
      // Наклонилась к миске: передние лапы чуть согнуты, голова у пола, жуёт.
      const chew = Math.sin(t * 9);
      p.hipY = 0.165;
      p.pitch = 0.32;
      p.legs = [
        [-0.05, -0.5],
        [-0.05, -0.5],
        [-0.55, 0.85],
        [-0.55, 0.85],
      ];
      p.headX = 0.95 + 0.06 * chew;
      p.headY = 0.05 * Math.sin(t * 0.8);
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.5 : i < 5 ? 0.02 : 0.12, Math.sin(t * 1.1 + i * 0.5) * 0.08] as [number, number]);
      p.eye = 0.6;
      return p;
    }
    case 'scratch':
    case 'reach': {
      // На задних лапах, корпус почти вертикально; передние лапы вытянуты вперёд-вверх.
      const scr = mode === 'scratch';
      const a = Math.sin(t * (scr ? 6 : 5));
      const b = Math.sin(t * (scr ? 6 : 5) + Math.PI);
      p.hipY = 0.1;
      p.hipZ = -0.06;
      p.pitch = scr ? -1.0 : -1.1;
      p.legs = scr
        ? [
            [-0.55 + 0.35 * a, -0.35],
            [-0.55 + 0.35 * b, -0.35],
            [-0.75, 1.55],
            [-0.75, 1.55],
          ]
        : [
            [-1.25 + 0.45 * Math.max(0, a), -0.2],
            [-0.35, -0.9],
            [-0.75, 1.55],
            [-0.75, 1.55],
          ];
      p.headX = scr ? 0.75 : 0.35;
      p.headY = look * 0.3;
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.6 : i < 3 ? -0.15 : 0.05, Math.sin(t * 3 + i) * (scr ? 0.15 : 0.3)] as [number, number]);
      p.eye = scr ? 0.6 : 1.15;
      return p;
    }
    case 'crouch': {
      // Охота: припала к полу, задние лапы под себя, зад виляет, кончик хвоста дёргается.
      const wig = Math.sin(t * 16);
      p.hipY = 0.105;
      p.hipZ = -0.13 + 0.006 * wig;
      p.pitch = 0.08;
      p.legs = [
        [-0.75, -0.85],
        [-0.75, -0.85],
        [-1.25, 2.2],
        [-1.25, 2.2],
      ];
      p.headX = -0.12;
      p.headY = look * 0.3;
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.15 : 0.0, i > 5 ? Math.sin(t * 12) * 0.35 : 0.05 * wig] as [number, number]);
      p.eye = 1.15;
      return p;
    }
    case 'jump': {
      // Полёт: передние лапы вперёд, задние назад, хвост — руль.
      p.pitch = tilt;
      p.legs = [
        [-0.95, -0.25],
        [-0.95, -0.25],
        [0.9, 0.35],
        [0.9, 0.35],
      ];
      p.headX = -tilt * 0.6;
      p.tail = p.tail.map((_, i) => [i === 0 ? 0.1 - tilt * 0.5 : 0.02, 0] as [number, number]);
      return p;
    }
    case 'litter': {
      // Присела в лотке: таз низко, хвост поднят, голова смотрит по сторонам.
      p.hipY = 0.1;
      p.hipZ = -0.12;
      p.pitch = -0.32;
      p.legs = [
        [0.3, 0],
        [0.3, 0],
        [-1.15, 2.15],
        [-1.15, 2.15],
      ];
      p.tail = p.tail.map((_, i) => [i === 0 ? 0.5 : i < 4 ? 0.04 : 0.1, 0] as [number, number]);
      p.headX = 0.3;
      p.headY = Math.sin(t * 0.6) * 0.35;
      p.eye = 0.7;
      return p;
    }
    case 'dig': {
      // Закапывает: стоит, по очереди гребёт передними лапами назад, нос к наполнителю.
      const a = t * 7;
      p.hipY = 0.16;
      p.pitch = 0.2;
      const paw = (ph: number): [number, number] => {
        const k = Math.sin(a + ph);
        return [-0.5 + 0.75 * Math.max(0, k), -0.9 * Math.max(0, -k)];
      };
      p.legs = [paw(0), paw(Math.PI), [-0.35, 0.6], [-0.35, 0.6]];
      p.headX = 0.75;
      p.tail = p.tail.map((_, i) => [i === 0 ? 0.25 : 0.03, Math.sin(t * 2 + i) * 0.1] as [number, number]);
      p.eye = 0.8;
      return p;
    }
    case 'belly': {
      // На спине: лапки поджаты кверху и лениво перебирают, голова запрокинута.
      p.hipY = 0.095;
      p.hipZ = -0.13;
      p.roll = 2.75;
      const k = Math.sin(t * 2.2);
      p.legs = [
        [-1.1 + 0.15 * k, -1.2],
        [-1.0 - 0.15 * k, -1.3],
        [-1.0, 1.4],
        [-0.85, 1.2],
      ];
      p.headX = -0.35;
      p.headY = 0.2 * Math.sin(t * 0.7);
      p.headZ = -0.5;
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.2 : 0, 0.25 * Math.sin(t * 1.5 + i * 0.4)] as [number, number]);
      p.eye = 0.35;
      p.purr = 1;
      return p;
    }
    case 'purr': {
      p.hipY = 0.075;
      p.hipZ = -0.1;
      p.pitch = -0.62;
      p.legs = [
        [0.62, 0],
        [0.62, 0],
        [-1.25, 2.3],
        [-1.25, 2.3],
      ];
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.5 : i < 3 ? -0.2 : 0.05, i === 0 ? 0 : 0.35 + 0.05 * Math.sin(t * 1.3 + i)] as [number, number]);
      p.headX = 0.35 + 0.1 * Math.sin(t * 1.4);
      p.headY = look * 0.4;
      p.headZ = 0.3 * Math.sin(t * 0.9);
      p.eye = 0.08;
      p.purr = 1;
      return p;
    }
    case 'rub': {
      // Трётся: шаг медленный, голова набок к ногам, хвост трубой с загнутым кончиком.
      const a = t * 5;
      p.legs = p.legs.map((_, i) => {
        const s = Math.sin(a + [0, Math.PI, Math.PI, 0][i]!);
        return [s * 0.35, i < 2 ? -Math.max(0, -s) * 0.6 : Math.max(0, s) * 0.7] as [number, number];
      });
      p.hipY = 0.17;
      p.headX = 0.15;
      p.headY = look * 0.5;
      p.headZ = 0.45 * Math.sign(look || 1);
      p.tail = p.tail.map((_, i) => [i === 0 ? 1.35 : i < 6 ? -0.05 : -0.45, Math.sin(t * 2 + i * 0.4) * 0.06] as [number, number]);
      p.eye = 0.4;
      p.purr = 0.6;
      return p;
    }
    case 'swat': {
      // Бьёт лапой по игрушке на полу перед собой.
      const hit = Math.max(0, Math.sin(t * 7)) ** 2;
      p.hipY = 0.15;
      p.pitch = 0.15;
      p.legs = [
        [-0.2, -0.3],
        [-0.2 - 0.9 * hit, -0.4 - 0.6 * hit],
        [-0.65, 1.0],
        [-0.65, 1.0],
      ];
      p.headX = 0.45;
      p.headY = look * 0.3;
      p.tail = p.tail.map((_, i) => [i === 0 ? 0.25 : 0.02, Math.sin(t * 8 + i) * 0.3] as [number, number]);
      p.eye = 1.15;
      return p;
    }
    case 'walk':
    case 'trot': {
      const f = mode === 'trot' ? 11 : 7;
      const a = t * f * Math.max(0.4, Math.min(1.6, speed / 0.45));
      const sw = mode === 'trot' ? 0.6 : 0.45;
      // Диагональные пары лап: левая передняя с правой задней.
      const ph = [0, Math.PI, Math.PI, 0];
      p.legs = p.legs.map((_, i) => {
        const s = Math.sin(a + ph[i]!);
        const front = i < 2;
        return [s * sw, front ? -Math.max(0, -s) * 0.7 : Math.max(0, s) * 0.8] as [number, number];
      });
      p.hipY = 0.175 + Math.abs(Math.sin(a)) * 0.008;
      p.headX = 0.05 + Math.sin(a * 2) * 0.03;
      p.headY = look * 0.3;
      p.tail = p.tail.map((_, i) => [i === 0 ? 0.95 : i < 5 ? -0.06 : 0.28, Math.sin(t * 3 + i * 0.5) * 0.1] as [number, number]);
      p.eye = blink;
      return p;
    }
    case 'sit':
    case 'groom': {
      p.hipY = 0.075;
      p.hipZ = -0.1;
      p.pitch = -0.62;
      // Передние лапы — вертикально к полу, задние сложены.
      p.legs = [
        [0.62, 0],
        [0.62, 0],
        [-1.25, 2.3],
        [-1.25, 2.3],
      ];
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.55 : i < 3 ? -0.25 : 0.0, i === 0 ? 0 : 0.42] as [number, number]);
      p.headX = 0.62 - 0.05;
      p.headY = look * 0.6 + Math.sin(t * 0.35) * 0.25;
      p.headZ = Math.sin(t * 0.25) * 0.08;
      p.eye = blink;
      if (mode === 'groom') {
        // Поднятая лапка у мордочки, голова наклонена к ней.
        const lick = Math.sin(t * 9) * 0.08;
        p.legs[1] = [-0.55 + lick, -1.6];
        p.headX = 0.95 + lick;
        p.headY = -0.25;
        p.headZ = -0.15;
        p.eye = 0.35;
      }
      return p;
    }
    case 'play': {
      // Сидит и бьёт лапкой по игрушке.
      p.hipY = 0.085;
      p.hipZ = -0.1;
      p.pitch = -0.45;
      const swat = Math.max(0, Math.sin(t * 6));
      p.legs = [
        [0.45, 0],
        [0.45 - 1.2 * swat, -0.6 * swat],
        [-1.1, 2.1],
        [-1.1, 2.1],
      ];
      p.headX = 0.45 + 0.15;
      p.headY = Math.sin(t * 3) * 0.4;
      p.tail = p.tail.map((_, i) => [i === 0 ? 0.2 : 0.05, Math.sin(t * 6 + i) * 0.35] as [number, number]);
      p.eye = 1;
      return p;
    }
    case 'lie':
    case 'sleep': {
      p.hipY = 0.088;
      p.hipZ = -0.13;
      const breath = Math.sin(t * (mode === 'sleep' ? 1.6 : 2.2));
      p.breath = breath;
      // «Буханка»: лапы поджаты под себя.
      p.legs = [
        [-1.35, 1.9],
        [-1.35, 1.9],
        [-1.4, 2.5],
        [-1.4, 2.5],
      ];
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.35 : -0.02, i === 0 ? 0.3 : 0.4] as [number, number]);
      if (mode === 'sleep') {
        p.headX = 0.42;
        p.headY = 0.75;
        p.headZ = 0.35;
        p.eye = 0.05;
      } else {
        p.headX = 0.05;
        p.headY = look * 0.5 + Math.sin(t * 0.3) * 0.3;
        p.eye = blink * 0.75;
      }
      return p;
    }
    case 'idle':
    default: {
      p.headY = look * 0.6 + Math.sin(t * 0.4) * 0.35;
      p.headX = Math.sin(t * 0.3) * 0.1;
      // Хвост опущен и загнут кончиком вверх, лениво покачивается.
      p.tail = p.tail.map((_, i) => [i === 0 ? -0.35 : i < 4 ? 0.02 : 0.22, Math.sin(t * 1.3 + i * 0.6) * 0.12] as [number, number]);
      p.eye = blink;
      return p;
    }
  }
}

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Поза кошки: режим mode в момент t; speed — скорость шага (м/с), look — куда
 * повернуть голову (−1…1); blend — доля перехода к новой позе за этот кадр.
 */
export function poseCat(cat: Cat3D, mode: CatMode, t: number, speed: number, blend: number, look = 0, tilt = 0): void {
  const goal = target(mode, t, speed, look, tilt);
  const p = cat.pose;
  const k = Math.min(1, blend);
  // Ноги при ходьбе меняются быстро, поэтому их фаза не смешивается долго.
  const legK = mode === 'walk' || mode === 'trot' || mode === 'rub' || mode === 'dig' || mode === 'swat' || mode === 'jump' ? Math.max(k, 0.5) : k;
  p.hipY = mix(p.hipY, goal.hipY, k);
  p.hipZ = mix(p.hipZ, goal.hipZ, k);
  p.pitch = mix(p.pitch, goal.pitch, k);
  p.headX = mix(p.headX, goal.headX, k);
  p.headY = mix(p.headY, goal.headY, k);
  p.headZ = mix(p.headZ, goal.headZ, k);
  p.eye = mix(p.eye, goal.eye, Math.max(k, 0.3));
  p.breath = goal.breath;
  p.roll = mix(p.roll, goal.roll, k * 0.7);
  p.purr = mix(p.purr, goal.purr, k);
  for (let i = 0; i < 4; i += 1) {
    p.legs[i]![0] = mix(p.legs[i]![0], goal.legs[i]![0], legK);
    p.legs[i]![1] = mix(p.legs[i]![1], goal.legs[i]![1], legK);
  }
  for (let i = 0; i < p.tail.length; i += 1) {
    p.tail[i]![0] = mix(p.tail[i]![0], goal.tail[i]![0], k);
    p.tail[i]![1] = mix(p.tail[i]![1], goal.tail[i]![1], k);
  }
  // На спине корпус опирается на спину: таз чуть приподнят, чтобы не уходить в пол.
  const buzz = p.purr * 0.006 * Math.sin(t * 90);
  // Короткие лапки котёнка: стоя корпус ниже (лёжа и сидя опора — живот и таз, высота та же).
  const drop = (1 - cat.legLen) * 0.165 * Math.min(1, Math.max(0, (p.hipY - 0.09) / 0.085));
  if (cat.apply) {
    const hipY = p.hipY;
    p.hipY = hipY - drop;
    cat.apply(p, t, mode);
    p.hipY = hipY;
    return;
  }
  cat.body.position.set(0, p.hipY - drop + buzz * 0.3, p.hipZ);
  cat.body.rotation.set(p.pitch, 0, p.roll);
  cat.body.scale.set(1 + p.breath * 0.012 + buzz, 1 + p.breath * 0.02 + buzz, 1);
  cat.head.rotation.set(p.headX, p.headY, p.headZ);
  cat.legs.forEach((l, i) => {
    l.pivot.rotation.x = p.legs[i]![0];
    l.lower.rotation.x = p.legs[i]![1];
  });
  cat.tail.forEach((g, i) => {
    g.rotation.x = p.tail[i]![0];
    g.rotation.y = p.tail[i]![1];
  });
  for (const l of cat.lids) l.rotation.x = LID_CLOSED + (LID_OPEN - LID_CLOSED) * Math.max(0, Math.min(1, p.eye));
}

// ─── Кошачье хозяйство: миски, лоток, игрушки ──────────────────────────

/** Сетка в точке (x, y, z). */
const at = (m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
  m.position.set(x, y, z);
  return m;
};

const std = (color: string, roughness = 0.6, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Миски с кормом и водой на подставке (вдоль локальной оси x; лицом к +z). setFood(0…1) — сколько корма. */
export function buildBowls(): { group: THREE.Group; setFood(k: number): void; setWater(k: number): void } {
  const g = new THREE.Group();
  const mat = std('#3a3f45', 0.55);
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.26), std('#b5885a', 0.7)), 0, 0.0125, 0));
  const bowl = (x: number, color: string): THREE.Group => {
    const b = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.1, 0.075, 0.06, 24, 1, true);
    const wall = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }));
    wall.position.y = 0.055;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), mat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.027;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 28), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.085;
    b.add(wall, bottom, rim);
    b.position.x = x;
    return b;
  };
  const food = bowl(-0.15, '#e85d2a');
  const water = bowl(0.15, '#2f6fb5');
  // Корм — горка катышков, вода — голубой диск.
  const kibble = new THREE.Group();
  const km = std('#8a5a2b', 0.8);
  const kg = new THREE.SphereGeometry(0.014, 6, 5);
  for (let i = 0; i < 26; i += 1) {
    const a = i * 2.4;
    const r = 0.012 * Math.sqrt(i) * 1.1;
    const k = new THREE.Mesh(kg, km);
    k.position.set(Math.cos(a) * r, 0.035 + (0.03 - r * 0.45), Math.sin(a) * r);
    kibble.add(k);
  }
  food.add(kibble);
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), new THREE.MeshStandardMaterial({ color: '#9fd3f0', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 }));
  w.rotation.x = -Math.PI / 2;
  w.position.y = 0.068;
  water.add(w);
  g.add(food, water);
  return {
    group: g,
    setFood: (k: number): void => {
      kibble.visible = k > 0.01;
      kibble.scale.set(0.6 + 0.4 * k, Math.max(0.05, k), 0.6 + 0.4 * k);
    },
    // Вода убывает: поверхность опускается по сужающейся к дну стенке миски.
    setWater: (k: number): void => {
      w.visible = k > 0.01;
      const y = 0.03 + 0.04 * Math.min(1, k);
      w.position.y = y;
      w.scale.setScalar((0.075 + ((y - 0.025) / 0.06) * 0.025) / 0.085);
    },
  };
}

/** Лоток с наполнителем (лицом к +z, вход спереди). setDirt(0…1) — сколько комков видно. */
export function buildLitter(): { group: THREE.Group; setDirt(k: number): void; surface: number } {
  const g = new THREE.Group();
  const plastic = std('#5aa9a3', 0.5);
  const W = 0.6;
  const D = 0.46;
  const H = 0.14;
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, D), plastic), 0, 0.01, 0));
  for (const sx of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.025, H, D), plastic), sx * (W / 2 - 0.0125), H / 2, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.025), plastic), 0, H / 2, -D / 2 + 0.0125));
  // Передний бортик ниже — вход.
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.55, 0.025), plastic), 0, (H * 0.55) / 2, D / 2 - 0.0125));
  const sand = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.05, D - 0.05), std('#e3d6bd', 0.95));
  sand.position.y = 0.045;
  g.add(sand);
  const clumps = new THREE.Group();
  const cm = std('#a08a68', 0.95);
  const cg = new THREE.SphereGeometry(0.03, 7, 5);
  for (let i = 0; i < 6; i += 1) {
    const c = new THREE.Mesh(cg, cm);
    c.position.set(Math.sin(i * 2.3) * 0.18, 0.072, Math.cos(i * 1.7) * 0.12);
    c.scale.set(1.2, 0.6, 1);
    clumps.add(c);
  }
  g.add(clumps);
  return {
    group: g,
    surface: 0.07,
    setDirt: (k: number): void => {
      const n = Math.round(Math.min(1, Math.max(0, k)) * clumps.children.length);
      clumps.children.forEach((c, i) => {
        c.visible = i < n;
      });
    },
  };
}

/** Игрушки: мячик и мышка (лежат на полу, катаются от удара лапой). */
export function buildToy(kind: 'ball' | 'mouse'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'ball') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), std('#e84393', 0.6));
    ball.position.y = 0.045;
    ball.name = 'spin';
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 6, 18), std('#f1c40f', 0.6));
    ball.add(band);
    g.add(ball);
  } else {
    const grey = std('#9a9da3', 0.9);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), grey);
    body.scale.set(0.8, 0.7, 1.4);
    body.position.y = 0.025;
    const ears = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), std('#e7a3a8', 0.8));
    ears.position.set(0, 0.045, 0.03);
    ears.scale.set(2.4, 1, 0.5);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 5), std('#e7a3a8', 0.8));
    tail.rotation.x = Math.PI / 2 - 0.2;
    tail.position.set(0, 0.02, -0.08);
    g.add(body, ears, tail);
  }
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}
