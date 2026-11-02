import * as THREE from 'three';

/**
 * Лепка формы полем расстояний (SDF): тело собирается из эллипсоидов и
 * конусов со скруглением, которые плавно сливаются друг с другом, а затем
 * превращается в сетку методом Surface Nets. Так получается цельное тело без
 * швов между частями — как у вылепленной фигуры.
 */

export type V3 = readonly [number, number, number];

/** Плавный минимум: две формы сливаются с «перемычкой» радиуса k. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Плавный максимум (плавное вычитание/пересечение). */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export interface Prim {
  /** Центр и радиус описанной сферы — чтобы не считать далёкие примитивы. */
  cx: number;
  cy: number;
  cz: number;
  r: number;
  d(x: number, y: number, z: number): number;
}

export function ellipsoid(c: V3, r: V3): Prim {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  return {
    cx,
    cy,
    cz,
    r: Math.max(rx, ry, rz),
    d(x, y, z) {
      const px = x - cx;
      const py = y - cy;
      const pz = z - cz;
      const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
      const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
  };
}

export function sphere(c: V3, r: number): Prim {
  const [cx, cy, cz] = c;
  return { cx, cy, cz, r, d: (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r };
}

/** Конус со скруглёнными концами от a (радиус r1) до b (радиус r2) — точная SDF. */
export function roundCone(a: V3, b: V3, r1: number, r2: number): Prim {
  const [ax, ay, az] = a;
  const bax = b[0] - ax;
  const bay = b[1] - ay;
  const baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const len = Math.sqrt(l2);
  return {
    cx: ax + bax / 2,
    cy: ay + bay / 2,
    cz: az + baz / 2,
    r: len / 2 + Math.max(r1, r2),
    d(x, y, z) {
      const pax = x - ax;
      const pay = y - ay;
      const paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy;
      const qy = pay * l2 - bay * yy;
      const qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}

/**
 * Плавное объединение списка примитивов. Далёкие примитивы пропускаются по описанной
 * сфере, а вдали от всей группы возвращается оценка снизу — расстояние до её габаритов
 * (знак верный, а точность там не нужна).
 */
export function blend(prims: readonly Prim[], k: number, far = 0.12): (x: number, y: number, z: number) => number {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const p of prims) {
    x0 = Math.min(x0, p.cx - p.r);
    y0 = Math.min(y0, p.cy - p.r);
    z0 = Math.min(z0, p.cz - p.r);
    x1 = Math.max(x1, p.cx + p.r);
    y1 = Math.max(y1, p.cy + p.r);
    z1 = Math.max(z1, p.cz + p.r);
  }
  return (x, y, z) => {
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    const dz = Math.max(z0 - z, 0, z - z1);
    const box = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (box > far) return box;
    let d = 1e9;
    for (const p of prims) {
      const ex = x - p.cx;
      const ey = y - p.cy;
      const ez = z - p.cz;
      const lim = d + k + 0.02 + p.r;
      if (ex * ex + ey * ey + ez * ez > lim * lim) continue;
      d = smin(d, p.d(x, y, z), k);
    }
    return d;
  };
}

/** Расстояние до ломаной (для лямок, ремней). */
export function polyline(points: readonly V3[]): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    let best = 1e9;
    for (let i = 1; i < points.length; i += 1) {
      const [ax, ay, az] = points[i - 1]!;
      const [bx, by, bz] = points[i]!;
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const l2 = ux * ux + uy * uy + uz * uz;
      const t = Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) / l2));
      best = Math.min(best, Math.hypot(x - ax - ux * t, y - ay - uy * t, z - az - uz * t));
    }
    return best;
  };
}

export type Field = (x: number, y: number, z: number) => number;

// ─── Surface Nets ──────────────────────────────────────────────────────

const CORNERS: ReadonlyArray<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];
const EDGES: ReadonlyArray<[number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export interface MeshOptions {
  min: V3;
  max: V3;
  step: number;
  /** Масштаб развёртки (проекция по преобладающей оси нормали). */
  uv?: number;
  /**
   * Затенение складок (ambient occlusion) в цвет вершин: поле, по которому оно считается
   * (обычно тело целиком), и показатели степени для R, G, B — тёплые тени у кожи.
   */
  ao?: { field: Field; tint?: V3; strength?: number };
}

/**
 * Сетка поверхности f = 0 (f < 0 внутри). Сначала грубая выборка, точное поле
 * считается только у поверхности. Нормали — по градиенту поля (гладкое освещение).
 */
export function surfaceNets(f: Field, opts: MeshOptions): THREE.BufferGeometry {
  const gen = netsGen(f, opts);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/** То же по частям: между срезами можно отдать управление браузеру (см. runSliced). */
export function* netsGen(f: Field, opts: MeshOptions): Generator<void, THREE.BufferGeometry, void> {
  const { step } = opts;
  const ox = Math.floor(opts.min[0] / step) * step;
  const oy = Math.floor(opts.min[1] / step) * step;
  const oz = Math.floor(opts.min[2] / step) * step;
  const nx = Math.ceil((opts.max[0] - ox) / step) + 1;
  const ny = Math.ceil((opts.max[1] - oy) / step) + 1;
  const nz = Math.ceil((opts.max[2] - oz) / step) + 1;

  // Три уровня: грубая сетка (шаг ×4), средняя (×2) и точная. Точное значение нужно только
  // у поверхности: углы ячеек, через которые она проходит, не дальше √3·шага от неё.
  // Дальше достаточно знака — берём оценку с грубого уровня. Поле не растёт быстрее
  // расстояния, поэтому оценка |f| ≥ |f(соседа)| − расстояние до соседа надёжна.
  const C = 4;
  const cnx = Math.ceil((nx - 1) / C) + 1;
  const cny = Math.ceil((ny - 1) / C) + 1;
  const cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k += 1) {
    yield;
    for (let j = 0; j < cny; j += 1) {
      for (let i = 0; i < cnx; i += 1) {
        coarse[i + cnx * (j + cny * k)] = f(ox + i * C * step, oy + j * C * step, oz + k * C * step);
      }
    }
  }
  // Точке точной сетки нужна гарантия |f| > √3·шаг (≈1.75): от средней точки она не дальше √3 шага.
  const needM = 3.6 * step;
  // Средняя точка не дальше 2√3 шага от грубой; храним в ней нижнюю оценку |f|.
  const reachC = 3.47 * step;
  const mnx = Math.ceil((nx - 1) / 2) + 1;
  const mny = Math.ceil((ny - 1) / 2) + 1;
  const mnz = Math.ceil((nz - 1) / 2) + 1;
  const mid = new Float32Array(mnx * mny * mnz);
  for (let k = 0; k < mnz; k += 1) {
    if (k % 2 === 0) yield;
    const ck = Math.min(cnz - 1, Math.round(k / 2));
    for (let j = 0; j < mny; j += 1) {
      const cj = Math.min(cny - 1, Math.round(j / 2));
      for (let i = 0; i < mnx; i += 1) {
        const dc = coarse[Math.min(cnx - 1, Math.round(i / 2)) + cnx * (cj + cny * ck)]!;
        const bound = Math.abs(dc) - reachC;
        mid[i + mnx * (j + mny * k)] = bound > needM ? Math.sign(dc) * bound : f(ox + i * 2 * step, oy + j * 2 * step, oz + k * 2 * step);
      }
    }
  }
  const vals = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k += 1) {
    yield;
    const mk = Math.min(mnz - 1, Math.round(k / 2));
    for (let j = 0; j < ny; j += 1) {
      const mj = Math.min(mny - 1, Math.round(j / 2));
      for (let i = 0; i < nx; i += 1) {
        const dm = mid[Math.min(mnx - 1, Math.round(i / 2)) + mnx * (mj + mny * mk)]!;
        vals[i + nx * (j + ny * k)] = Math.abs(dm) > needM ? dm : f(ox + i * step, oy + j * step, oz + k * step);
      }
    }
  }

  const at = (i: number, j: number, k: number): number => vals[i + nx * (j + ny * k)]!;
  const cx = nx - 1;
  const cy = ny - 1;
  const cellVert = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const v = new Float64Array(8);

  for (let k = 0; k < nz - 1; k += 1) {
    if (k % 8 === 0) yield;
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const [a, b, d] = CORNERS[c]!;
          v[c] = at(i + a, j + b, k + d);
          if (v[c]! < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of EDGES) {
          const a0 = v[e0]!;
          const a1 = v[e1]!;
          if (a0 < 0 === a1 < 0) continue;
          const t = a0 / (a0 - a1);
          const c0 = CORNERS[e0]!;
          const c1 = CORNERS[e1]!;
          sx += c0[0] + (c1[0] - c0[0]) * t;
          sy += c0[1] + (c1[1] - c0[1]) * t;
          sz += c0[2] + (c1[2] - c0[2]) * t;
          n += 1;
        }
        cellVert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * step, oy + (j + sy / n) * step, oz + (k + sz / n) * step);
      }
    }
  }

  const idx: number[] = [];
  const cell = (i: number, j: number, k: number): number => cellVert[i + cx * (j + cy * k)]!;
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const v0 = at(i, j, k);
        const inside = v0 < 0;
        // Ребро вдоль X: общие ячейки (j-1..j, k-1..k).
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && inside !== at(i + 1, j, k) < 0) {
          quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !inside);
        }
        // Ребро вдоль Y.
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && inside !== at(i, j + 1, k) < 0) {
          quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !inside);
        }
        // Ребро вдоль Z.
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && inside !== at(i, j, k + 1) < 0) {
          quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !inside);
        }
      }
    }
  }

  // Нормали по градиенту поля (тетраэдральная схема — 4 вычисления вместо 6).
  const count = pos.length / 3;
  const nor = new Float32Array(count * 3);
  const h = step * 0.5;
  for (let q = 0; q < count; q += 1) {
    if (q % 1500 === 0) yield;
    const x = pos[q * 3]!;
    const y = pos[q * 3 + 1]!;
    const z = pos[q * 3 + 2]!;
    const a = f(x + h, y - h, z - h);
    const b = f(x - h, y - h, z + h);
    const c = f(x - h, y + h, z - h);
    const d = f(x + h, y + h, z + h);
    let gx = a - b - c + d;
    let gy = -a - b + c + d;
    let gz = -a + b - c + d;
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    nor[q * 3] = gx;
    nor[q * 3 + 1] = gy;
    nor[q * 3 + 2] = gz;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const uvScale = opts.uv ?? 1;
  const uv = new Float32Array(count * 2);
  // Проекция по преобладающей оси нормали: спереди и сзади — (x, y), на боках — (z, y),
  // сверху и снизу — (x, z). Текстура ткани не растягивается на боках, а стыки похожи на швы.
  for (let q = 0; q < count; q += 1) {
    const ax = Math.abs(nor[q * 3]!);
    const ay = Math.abs(nor[q * 3 + 1]!);
    const az = Math.abs(nor[q * 3 + 2]!);
    const x = pos[q * 3]!;
    const y = pos[q * 3 + 1]!;
    const z = pos[q * 3 + 2]!;
    if (ay > ax * 1.4 && ay > az * 1.4) {
      uv[q * 2] = x * uvScale;
      uv[q * 2 + 1] = z * uvScale;
    } else if (ax > az) {
      uv[q * 2] = z * uvScale;
      uv[q * 2 + 1] = y * uvScale;
    } else {
      uv[q * 2] = x * uvScale;
      uv[q * 2 + 1] = y * uvScale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (opts.ao) {
    // Классическая оценка по полю расстояний: шагаем от поверхности вдоль нормали
    // и смотрим, насколько близко другие части тела (подмышки, под грудью, между ног).
    const { field, tint = [1, 1, 1], strength = 1 } = opts.ao;
    const col = new Float32Array(count * 3);
    for (let q = 0; q < count; q += 1) {
      if (q % 1500 === 0) yield;
      const x = pos[q * 3]!;
      const y = pos[q * 3 + 1]!;
      const z = pos[q * 3 + 2]!;
      const nx0 = nor[q * 3]!;
      const ny0 = nor[q * 3 + 1]!;
      const nz0 = nor[q * 3 + 2]!;
      let occ = 0;
      let sca = 1;
      for (let i = 1; i <= 4; i += 1) {
        const hh = 0.01 + 0.028 * i;
        const d = field(x + nx0 * hh, y + ny0 * hh, z + nz0 * hh);
        occ += Math.max(0, hh - d) * sca;
        sca *= 0.7;
      }
      const a = Math.min(1, Math.max(0.3, 1 - occ * 4.2 * strength));
      col[q * 3] = a ** tint[0];
      col[q * 3 + 1] = a ** tint[1];
      col[q * 3 + 2] = a ** tint[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** Склеивает несколько геометрий в одну (меньше вызовов отрисовки). */
export function mergeGeometries(list: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i += 1) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 1) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i += 1) idx.push(i + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/** Выполняет генератор порциями по budgetMs, отдавая управление браузеру между порциями. */
export async function runSliced<T>(gen: Generator<void, T, void>, budgetMs = 10): Promise<T> {
  let t0 = performance.now();
  let r = gen.next();
  while (!r.done) {
    if (performance.now() - t0 > budgetMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      t0 = performance.now();
    }
    r = gen.next();
  }
  return r.value;
}
