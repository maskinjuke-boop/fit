import * as THREE from 'three';
import type { CatBreed } from '../../../game/lifeTypes';

/**
 * Кошки разных пород: модель из сглаженных примитивов с окраской по вершинам
 * (полоски, пятна, «маска» сиамской, белая грудка), пушистость, уши по породе.
 * У кошки есть простой скелет из групп (корпус, голова, четыре лапы по два сустава,
 * хвост из сегментов) и позы: ходьба, стойка, сидя, умывание, лёжа «буханкой», сон
 * клубком, игра лапой. Позы смешиваются плавно.
 */

export type CatMode = 'walk' | 'trot' | 'idle' | 'sit' | 'groom' | 'lie' | 'sleep' | 'play';

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

interface Leg {
  pivot: THREE.Group;
  lower: THREE.Group;
  front: boolean;
  side: number;
}

export interface Cat3D {
  root: THREE.Group;
  breed: CatBreed;
  body: THREE.Group;
  head: THREE.Group;
  legs: Leg[];
  tail: THREE.Group[];
  eyes: THREE.Object3D[];
  /** Текущие параметры позы (для плавных переходов). */
  pose: Pose;
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
}

const tmp = new THREE.Vector3();

/** Окраска вершин по положению в теле кошки (координаты корня). */
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
    const colors = new Float32Array(pos.count * 3);
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const toHead = new THREE.Matrix4().multiplyMatrices(headInv, m.matrixWorld);
    for (let i = 0; i < pos.count; i += 1) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      hp.fromBufferAttribute(pos, i).applyMatrix4(toHead);
      const { x, y, z } = tmp;
      c.copy(base);
      if (look.pattern === 'tabby') {
        // Поперечные полосы по спине и бокам, «М» на лбу, кольца на хвосте.
        let s = 0;
        if (part === 'tail') s = Math.sin((m.userData.seg as number) * 2.4) > 0.2 ? 1 : 0;
        else if (part === 'head') s = hp.y > 0.085 && hp.z > 0.02 && Math.sin(hp.x * 140) > 0.35 ? 1 : 0;
        else if (part === 'leg') s = Math.sin(y * 90) > 0.55 ? 0.8 : 0;
        else s = Math.max(0, Math.sin(z * 52 + Math.sin(y * 30) * 1.5 + x * 8)) > 0.55 && y > 0.17 ? 1 : 0;
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
          if (f > 0.35 && d < 0.32) c.lerp(dark, 0.85);
          else if (f > 0.35 && d < 0.42) c.lerp(dark, 0.35);
        }
        if (part === 'tail') c.lerp(dark, Math.sin((m.userData.seg as number) * 2.4) > 0.3 ? 0.8 : 0);
      } else if (look.pattern === 'points') {
        // Тёмные «отметины»: морда, уши, лапы и хвост.
        let p = 0;
        if (part === 'ear') p = 1;
        if (part === 'tail') p = Math.min(1, 0.4 + (m.userData.seg as number) * 0.15);
        if (part === 'leg') p = Math.min(1, Math.max(0, (0.16 - y) * 9));
        if (part === 'head' || part === 'muzzle') p = Math.max(0, Math.min(1, (hp.z - 0.06) * 28 + (part === 'muzzle' ? 1 : 0)));
        c.lerp(dark, p);
      } else {
        c.lerp(dark, Math.max(0, Math.sin(x * 70 + z * 40) * 0.12));
      }
      // Белая грудка, живот и «носочки».
      if (look.white > 0) {
        const chest = part === 'body' && z > 0.08 && y < 0.24 ? 1 : part === 'body' && y < 0.12 ? 1 : 0;
        const socks = part === 'leg' && y < 0.06 ? 1 : 0;
        const muzzle = part === 'muzzle' || (part === 'head' && hp.y < 0.035 && hp.z > 0.05) ? 1 : 0;
        c.lerp(light, Math.max(chest, socks, muzzle) * look.white);
      }
      if (part === 'ear' && m.userData.inner) c.set('#e9a3a3');
      // Лёгкая неровность меха.
      const n = Math.sin(x * 431 + y * 173 + z * 289 + seed) * 0.035;
      colors[i * 3] = Math.min(1, Math.max(0, c.r + n));
      colors[i * 3 + 1] = Math.min(1, Math.max(0, c.g + n));
      colors[i * 3 + 2] = Math.min(1, Math.max(0, c.b + n));
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

function stick(r0: number, r1: number, len: number, m: THREE.Material, part: string): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r1, r0, len, 12, 1);
  g.translate(0, -len / 2, 0);
  const me = new THREE.Mesh(g, m);
  me.userData.part = part;
  me.castShadow = true;
  return me;
}

/** Строит кошку породы breed (смотрит на +Z, лапы на полу). */
export function buildCat(breed: CatBreed, seed = 1): Cat3D {
  const look = LOOKS[breed];
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
  scaleRoot.scale.setScalar(look.size);
  root.add(scaleRoot);

  // Корпус: начало координат — у таза (кошка садится, поворачиваясь вокруг него).
  const body = new THREE.Group();
  body.position.set(0, 0.175, -0.13);
  scaleRoot.add(body);
  // Корпус — одна гладкая капсула, грудь и бёдра чуть шире.
  const torsoGeo = new THREE.CapsuleGeometry(0.095, 0.2, 10, 22);
  torsoGeo.rotateX(Math.PI / 2);
  const torso = new THREE.Mesh(torsoGeo, fur);
  torso.scale.set(1.05 * F, 1.0 * F, 1);
  torso.position.set(0, 0.01, 0.13);
  torso.userData.part = 'body';
  torso.castShadow = true;
  body.add(torso);
  body.add(blob(0.1, 1.0 * F, 1.06 * F, 0.95, fur, 'body', [0, 0.018, 0.25]));
  if (breed === 'maine_coon' || breed === 'persian') body.add(blob(0.1, 1.15 * F, 1.05 * F, 0.8, fur, 'body', [0, 0.04, 0.31]));

  // Голова.
  const head = new THREE.Group();
  head.position.set(0, 0.075, 0.34);
  body.add(head);
  const hs = breed === 'british' ? 1.12 : breed === 'persian' ? 1.08 : 1;
  head.add(blob(0.075, 1.08 * hs, 0.95 * hs, 1.0 * hs, fur, 'head', [0, 0.06, 0.03]));
  head.add(blob(0.04, 1.35 * hs, 0.9 * hs, 1, fur, 'head', [0.032, 0.035, 0.07]), blob(0.04, 1.35 * hs, 0.9 * hs, 1, fur, 'head', [-0.032, 0.035, 0.07]));
  head.add(blob(0.034, 1.25, 0.85, look.flat ? 0.55 : 1.0, fur, 'muzzle', [0, 0.032, look.flat ? 0.098 : 0.1]));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshStandardMaterial({ color: breed === 'black' ? '#2b2b2b' : '#d98a8a', roughness: 0.5 }));
  nose.position.set(0, 0.05, look.flat ? 0.118 : 0.132);
  nose.scale.set(1.2, 0.8, 0.8);
  head.add(nose);
  // Глаза: радужка и вертикальный зрачок.
  const eyes: THREE.Object3D[] = [];
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: look.eyes, roughness: 0.08, clearcoat: 1, emissive: new THREE.Color(look.eyes), emissiveIntensity: 0.18 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.033 * hs, 0.075 * hs, 0.088 * hs);
    eye.rotation.y = sx * 0.35;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), eyeMat);
    ball.scale.set(1, 0.85, 0.6);
    ball.userData.keepColor = true;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0172, 10, 8), pupilMat);
    pupil.scale.set(0.25, 0.8, 0.62);
    pupil.position.z = 0.0012;
    pupil.userData.keepColor = true;
    eye.add(ball, pupil);
    head.add(eye);
    eyes.push(eye);
  }
  // Уши.
  const earScale = look.ears === 'big' ? 1.45 : look.ears === 'fold' ? 0.75 : 1;
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * 0.045 * hs, 0.11 * hs, 0.02);
    ear.rotation.set(look.ears === 'fold' ? 1.25 : -0.1, 0, -sx * 0.32);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.03 * earScale, 0.06 * earScale, 4, 1), fur);
    outer.scale.set(1, 1, 0.45);
    outer.rotation.y = Math.PI / 4;
    outer.position.y = 0.025 * earScale;
    outer.userData.part = 'ear';
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.02 * earScale, 0.045 * earScale, 3, 1), fur);
    inner.scale.set(1, 1, 0.3);
    inner.position.set(0, 0.022 * earScale, 0.006);
    inner.userData.part = 'ear';
    inner.userData.inner = true;
    ear.add(outer, inner);
    if (look.ears === 'tufts') {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.035, 5), fur);
      tuft.position.y = 0.07;
      tuft.userData.part = 'ear';
      ear.add(tuft);
    }
    head.add(ear);
  }
  // Усы.
  const wpos: number[] = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      wpos.push(sx * 0.03, 0.035 - i * 0.006, 0.11, sx * 0.11, 0.045 - i * 0.02, 0.09 - i * 0.01);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  const whiskers = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: breed === 'black' ? '#777777' : '#f5f5f5', transparent: true, opacity: 0.8 }));
  head.add(whiskers);

  // Лапы: у каждой бедро/плечо и нижнее звено с подушечкой.
  const legs: Leg[] = [];
  const legR = 0.026 * (0.9 + 0.1 * F);
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.052 * F, -0.01, front ? 0.27 : 0.02);
      const upLen = front ? 0.085 : 0.08;
      const up = stick(front ? legR * 1.15 : legR * 1.6, legR, upLen, fur, 'leg');
      pivot.add(up);
      if (!front) pivot.add(blob(0.05, 0.75 * F, 1.0 * F, 1.0, fur, 'body', [0, -0.01, 0]));
      const lower = new THREE.Group();
      lower.position.y = -upLen;
      lower.add(stick(legR, legR * 0.85, 0.075, fur, 'leg'));
      const paw = blob(0.024, 1.0, 0.6, 1.25, fur, 'leg', [0, -0.075, 0.01]);
      lower.add(paw);
      pivot.add(lower);
      body.add(pivot);
      legs.push({ pivot, lower, front, side });
    }
  }

  // Хвост из сегментов.
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  const segs = 8;
  const segLen = 0.042;
  for (let i = 0; i < segs; i += 1) {
    const g = new THREE.Group();
    if (i === 0) g.position.set(0, 0.04, -0.08);
    else g.position.set(0, 0, -segLen);
    const r = (0.02 - i * 0.0013) * look.tail;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, segLen * 1.25, 10), fur);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -segLen / 2;
    seg.userData.part = 'tail';
    seg.userData.seg = i;
    seg.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 10, 8), fur);
    knob.position.z = -segLen;
    knob.userData.part = 'tail';
    knob.userData.seg = i;
    g.add(seg, knob);
    parent.add(g);
    tail.push(g);
    parent = g;
  }

  paint(root, head, look, seed);
  const cat: Cat3D = { root, breed, body, head, legs, tail, eyes, pose: restPose() };
  poseCat(cat, 'idle', 0, 0, 1);
  return cat;
}

function restPose(): Pose {
  return { hipY: 0.175, hipZ: -0.13, pitch: 0, headX: 0, headY: 0, headZ: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], tail: Array.from({ length: 8 }, () => [0.2, 0] as [number, number]), eye: 1, breath: 0 };
}

/** Целевая поза для режима. legs: [плечо/бедро, нижнее звено]; tail: [подъём, вбок]. */
function target(mode: CatMode, t: number, speed: number, look: number): Pose {
  const p = restPose();
  const blink = (Math.sin(t * 0.7) > 0.985 ? 0.1 : 1) as number;
  switch (mode) {
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
export function poseCat(cat: Cat3D, mode: CatMode, t: number, speed: number, blend: number, look = 0): void {
  const goal = target(mode, t, speed, look);
  const p = cat.pose;
  const k = Math.min(1, blend);
  // Ноги при ходьбе меняются быстро, поэтому их фаза не смешивается долго.
  const legK = mode === 'walk' || mode === 'trot' ? Math.max(k, 0.5) : k;
  p.hipY = mix(p.hipY, goal.hipY, k);
  p.hipZ = mix(p.hipZ, goal.hipZ, k);
  p.pitch = mix(p.pitch, goal.pitch, k);
  p.headX = mix(p.headX, goal.headX, k);
  p.headY = mix(p.headY, goal.headY, k);
  p.headZ = mix(p.headZ, goal.headZ, k);
  p.eye = mix(p.eye, goal.eye, Math.max(k, 0.3));
  p.breath = goal.breath;
  for (let i = 0; i < 4; i += 1) {
    p.legs[i]![0] = mix(p.legs[i]![0], goal.legs[i]![0], legK);
    p.legs[i]![1] = mix(p.legs[i]![1], goal.legs[i]![1], legK);
  }
  for (let i = 0; i < cat.tail.length; i += 1) {
    p.tail[i]![0] = mix(p.tail[i]![0], goal.tail[i]![0], k);
    p.tail[i]![1] = mix(p.tail[i]![1], goal.tail[i]![1], k);
  }
  cat.body.position.set(0, p.hipY, p.hipZ);
  cat.body.rotation.x = p.pitch;
  cat.body.scale.set(1 + p.breath * 0.012, 1 + p.breath * 0.02, 1);
  cat.head.rotation.set(p.headX, p.headY, p.headZ);
  cat.legs.forEach((l, i) => {
    l.pivot.rotation.x = p.legs[i]![0];
    l.lower.rotation.x = p.legs[i]![1];
  });
  cat.tail.forEach((g, i) => {
    g.rotation.x = p.tail[i]![0];
    g.rotation.y = p.tail[i]![1];
  });
  for (const e of cat.eyes) e.scale.y = Math.max(0.06, p.eye);
}
