import * as THREE from 'three';
import type { Appearance, Figure } from '../../../game/state';
import { anatomy } from './anatomy';
import { HEAD_GROW, HEAD_R, HEAD_SCALE, HEAD_Y, NECK_WORLD, NECK_Y } from './body';
import { HAIRLINE, hairCap, skullPoint, skullShell, type Hairline } from './head';
import { M, mesh, taperTube, v, type Mat } from './kit';
import { strands, type Drape } from './strands';

/**
 * Причёски. Основа — «шапка» по форме черепа с естественной линией роста волос,
 * длинные волосы и хвост собраны из прядей: сплюснутых лент, которые лежат по голове,
 * спадают по спине и через плечи. Координаты — собственные координаты головы.
 */

export type Cover = 'none' | 'hat' | 'helm';

const HS = HEAD_SCALE;
/** Сдвиг волос относительно центра головы (как у шапки волос). */
const ORIGIN = v(0, HEAD_Y + 0.004, -0.004);

/** Детерминированный «шум» для разброса прядей. */
const jitter = (i: number, k: number): number => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

/** Направление от центра головы: th — угол от макушки, phi — от лица (+Z) вокруг вертикали. */
const dir = (th: number, phi: number): THREE.Vector3 => v(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));

/** Точка на поверхности головы (с отступом off) в координатах головы. */
const onSkull = (th: number, phi: number, off: number, female: boolean): THREE.Vector3 => skullPoint(dir(th, phi), female, off).add(ORIGIN);

function drapeFor(figure: Figure, clearance: number): Drape & { clearance: number } {
  const a = anatomy(figure);
  const G = HEAD_GROW;
  const f = (x: number, y: number, z: number): number => a.eval(G * x, NECK_WORLD + G * (y - NECK_Y), G * z) / G;
  const h = 0.004;
  return {
    // Зазор до кожи: толщина одежды поверх тела (в единицах головы) и немного объёма.
    clearance: clearance / G + 0.008,
    dist: (p) => f(p.x, p.y, p.z),
    normal: (p, out) => out.set(f(p.x + h, p.y, p.z) - f(p.x - h, p.y, p.z), f(p.x, p.y + h, p.z) - f(p.x, p.y - h, p.z), f(p.x, p.y, p.z + h) - f(p.x, p.y, p.z - h)).normalize(),
  };
}

/** Где за спиной лежат длинные волосы: дуга (в координатах головы), огибающая шею и лопатки. */
const curtain = (female: boolean): { rx: number; zc: number; rz: number } => (female ? { rx: 0.27, zc: -0.095, rz: 0.235 } : { rx: 0.31, zc: -0.105, rz: 0.26 });

/**
 * Длинные волосы: пряди сзади до лопаток и по бокам — через плечи на грудь.
 * from — откуда начинаются пряди (угол от макушки): под шапкой и шлемом — ниже.
 */
function longLocks(figure: Figure, from: number, clearance: number): THREE.BufferGeometry {
  const female = figure === 'female';
  const paths: THREE.Vector3[][] = [];
  const widths: number[] = [];
  const arc = curtain(female);
  const atArc = (phi: number, y: number, grow = 1): THREE.Vector3 => v(arc.rx * grow * Math.sin(phi), y, arc.zc + arc.rz * grow * Math.cos(phi));
  // Сзади: веер прядей от виска до виска через затылок.
  const nb = 17;
  for (let i = 0; i < nb; i += 1) {
    const phi = Math.PI * (0.6 + (0.8 * i) / (nb - 1)) + jitter(i, 1) * 0.04;
    // Сзади по центру пряди чуть длиннее, к вискам — короче.
    const len = 0.6 + jitter(i, 2) * 0.07 + Math.abs(Math.cos(phi)) * 0.05;
    const p0 = onSkull(Math.max(from, Math.PI * 0.34), phi, 0.028, female);
    const p1 = onSkull(Math.PI * 0.5, phi, 0.044, female);
    const p2 = p1.clone().add(v(0, -0.1, 0)).lerp(atArc(phi, p1.y - 0.1), 0.35);
    const p3 = atArc(phi, HEAD_Y - 0.34);
    const p4 = atArc(phi, HEAD_Y - len, 1.06).add(v(jitter(i, 3) * 0.03, 0, 0));
    paths.push([p0, p1, p2, p3, p4]);
    widths.push(0.042 + jitter(i, 4) * 0.008);
  }
  // По бокам: пряди перед ушами спадают через плечи вперёд.
  for (const sx of [-1, 1]) {
    [0.36, 0.42, 0.48, 0.54].forEach((k, i) => {
      const phi = sx * Math.PI * k;
      const p0 = onSkull(Math.max(from, Math.PI * (0.28 + i * 0.03)), phi, 0.028, female);
      const p1 = onSkull(Math.PI * 0.5, phi, 0.046, female);
      const p2 = p1.clone().add(v(0.012 * sx, -0.12, 0));
      const x = female ? 0.28 : 0.31;
      const p3 = v(sx * (x + 0.012 * i), HEAD_Y - 0.31, 0.03 - i * 0.02);
      const p4 = v(sx * (x - 0.01 + 0.012 * i), HEAD_Y - 0.45, 0.15 - i * 0.025);
      const p5 = v(sx * (x - 0.02 + 0.015 * i), HEAD_Y - 0.6 + i * 0.03, 0.2 - i * 0.03);
      paths.push([p0, p1, p2, p3, p4, p5]);
      widths.push(0.04);
    });
  }
  return strands(paths, widths, 0.011, 24, 10, drapeFor(figure, clearance));
}

/** Сетки прядей не зависят от цвета — строятся один раз и переиспользуются. */
const lockCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = lockCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    lockCache.set(key, g);
  }
  return g;
}

const ponyCenter = (y0: number, z0: number): THREE.CatmullRomCurve3 =>
  new THREE.CatmullRomCurve3([v(0, y0, z0), v(0, y0 - 0.06, z0 - 0.12), v(0.01, y0 - 0.3, z0 - 0.1), v(0.03, y0 - 0.56, z0 - 0.04)]);

/** Хвост из прядей, закрученных в лёгкую спираль, вокруг плотной сердцевины. */
function ponytail(y0: number, z0: number): THREE.BufferGeometry {
  const center = ponyCenter(y0, z0);
  const paths: THREE.Vector3[][] = [];
  const widths: number[] = [];
  const n = 10;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6;
      const c = center.getPointAt(Math.min(1, t * (0.92 + jitter(i, 5) * 0.1)));
      const r = 0.018 + 0.036 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.012 * t;
      const a = a0 + t * 0.9;
      pts.push(c.add(v(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8)));
    }
    paths.push(pts);
    widths.push(0.026);
  }
  return strands(paths, widths, 0.012, 24, 8);
}

/** Сегмент «шапки» волос по форме черепа: th0..th1 — от макушки вниз, open — вырез для лица (рад, 0 — без выреза). */
function hairShell(r: number, th0: number, th1: number, open: number, m: Mat, female: boolean): THREE.Mesh {
  const geo = open > 0 ? new THREE.SphereGeometry(1, 48, 20, Math.PI / 2 + open, Math.PI * 2 - open * 2, th0, th1 - th0) : new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, th0, th1 - th0);
  return mesh(skullShell(geo, r - HEAD_R, female), m, [0, HEAD_Y + 0.005, -0.004]);
}

/** Волосы с естественной линией роста; from > 0 — только полоса ниже шапки. */
function cap(off: number, line: Hairline, m: Mat, female: boolean, from = 0): THREE.Mesh {
  return mesh(hairCap(off, line, female, from), m, [0, HEAD_Y + 0.004, -0.004]);
}

/** Неровный край каре: короткие пряди по нижней кромке. */
function bobFringe(r: number, th: number, open: number, female: boolean): THREE.BufferGeometry {
  const paths: THREE.Vector3[][] = [];
  const widths: number[] = [];
  const n = 26;
  for (let i = 0; i < n; i += 1) {
    // Угол от лица: вырез для лица (|phi| < open) остаётся открытым, как у «шапки».
    const phi = open + ((Math.PI * 2 - open * 2) * (i + 0.5)) / n;
    const off = r - HEAD_R;
    const a = onSkull(th - 0.2, phi, off, female);
    const b = onSkull(th - 0.05, phi, off + 0.006, female);
    const c = b.clone().add(v(0, -0.05 - Math.abs(jitter(i, 7)) * 0.03, 0)).add(b.clone().sub(ORIGIN).setY(0).normalize().multiplyScalar(-0.012));
    paths.push([a, b, c]);
    widths.push(0.03);
  }
  return strands(paths, widths, 0.01, 10, 8);
}

/** clearance — насколько одежда выступает над кожей: длинные пряди ложатся поверх неё. */
export function buildHair(style: Appearance['hair'], m: Mat, cover: Cover, figure: Figure, clearance = 0.016): THREE.Group {
  const g = new THREE.Group();
  const female = figure === 'female';
  const helm = cover === 'helm';
  const hat = cover === 'hat';
  m.side = THREE.DoubleSide;
  switch (style) {
    case 'buzz':
      if (!hat && !helm) g.add(cap(0.007, HAIRLINE.short, m, female));
      break;
    case 'short':
      if (hat) g.add(cap(0.018, HAIRLINE.short, m, female, Math.PI * 0.33));
      if (!hat && !helm) {
        g.add(cap(0.018, HAIRLINE.short, m, female));
        // Объём сверху и лёгкий чуб надо лбом.
        g.add(cap(0.03, [[0, 0.2], [0.3, 0.3], [1, 0.36]], m, female));
        g.add(mesh(new THREE.SphereGeometry(0.1, 20, 12), m, [0.03, HEAD_Y + 0.215, 0.13], [1.3, 0.42, 0.75]));
      }
      break;
    case 'long': {
      const r = HEAD_R + 0.03;
      // Сверху — волосы с линией роста, ниже — пряди по бокам с открытым лицом.
      if (!hat && !helm) g.add(cap(0.03, HAIRLINE.long, m, female));
      if (!helm) g.add(hairShell(r, hat ? Math.PI * 0.34 : Math.PI * 0.3, Math.PI * 0.6, 1.05, m, female));
      const from = helm ? Math.PI * 0.52 : hat ? Math.PI * 0.42 : Math.PI * 0.34;
      g.add(new THREE.Mesh(cached(`${figure}|long|${cover}|${clearance.toFixed(3)}`, () => longLocks(figure, from, clearance)), m));
      break;
    }
    case 'ponytail': {
      if (!hat && !helm) g.add(cap(0.016, HAIRLINE.pony, m, female));
      if (hat) g.add(cap(0.016, HAIRLINE.pony, m, female, Math.PI * 0.33));
      const y0 = helm || hat ? HEAD_Y - 0.02 : HEAD_Y + 0.07;
      const z0 = helm || hat ? -0.3 : -0.285;
      g.add(mesh(new THREE.TorusGeometry(0.045, 0.016, 8, 20), M.cloth('#d23a4a', 2), [0, y0, z0 - 0.015]));
      g.add(new THREE.Mesh(taperTube(ponyCenter(y0, z0), 0.05, 0.01, 28, 12), m));
      g.add(new THREE.Mesh(cached(`pony|${cover === 'none' ? 'up' : 'low'}`, () => ponytail(y0, z0)), m));
      break;
    }
    case 'bob': {
      const r = HEAD_R + 0.045;
      if (!helm) {
        g.add(hairShell(r, hat ? Math.PI * 0.33 : 0, Math.PI * 0.64, 1.0, m, female));
        g.add(new THREE.Mesh(cached(`${figure}|bob`, () => bobFringe(r, Math.PI * 0.64, 1.0, female)), m));
      }
      if (!hat && !helm) {
        // Чёлка на лоб.
        g.add(mesh(new THREE.SphereGeometry(r + 0.004, 40, 8, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.06, Math.PI * 0.28), m, [0, HEAD_Y + 0.01, -0.01], [HS.x, HS.y, HS.z]));
      }
      break;
    }
    case 'bun':
      if (hat) g.add(cap(0.012, HAIRLINE.pony, m, female, Math.PI * 0.33));
      if (!hat && !helm) {
        g.add(cap(0.012, HAIRLINE.pony, m, female));
        g.add(mesh(new THREE.SphereGeometry(0.11, 20, 14), m, [0, HEAD_Y + 0.25, -0.13]));
        g.add(mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), M.cloth('#d23a4a', 2), [0, HEAD_Y + 0.19, -0.1]).rotateX(-0.9));
      }
      break;
    case 'curly': {
      if (helm) break;
      if (!hat) g.add(cap(0.01, HAIRLINE.short, m, female));
      const n = 54;
      const ball = new THREE.IcosahedronGeometry(0.072, 1);
      for (let i = 0; i < n; i += 1) {
        // Точки Фибоначчи на верхней части головы, кроме лица.
        const y = 1 - (i / (n - 1)) * 1.25;
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = i * 2.399963;
        const x = Math.cos(phi) * rr;
        const z = Math.sin(phi) * rr;
        if (y < 0.15 && z > 0.35) continue;
        if (y < -0.2) continue;
        // Под головным убором остаются только кудри, выглядывающие снизу.
        if (hat && y > 0.12) continue;
        const k = hat ? 0.27 : 0.29;
        const b = mesh(ball, m, [x * k * HS.x, HEAD_Y + y * 0.3 * HS.y, z * k * HS.z - 0.01]);
        b.rotation.set(i, i * 2, 0);
        g.add(b);
      }
      break;
    }
  }
  return g;
}
