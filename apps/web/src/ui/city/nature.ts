import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP, TILE } from '../../game/city/content';
import type { CityState } from '../../game/city/types';

/**
 * Земля города: трава с пятнами разных оттенков, мощёные дорожки с бордюрами по краям застроенных
 * клеток, участки под стройку с колышками, кустики травы, цветы и камешки, а за поселением — лес
 * из лиственных деревьев, ёлок, кустов, валунов и грибов. Всё собрано в несколько сеток
 * (и инстансов) — так дёшево даже на телефоне.
 */

type G = THREE.BufferGeometry;
const M = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** Геометрия с цветом вершин (как у зданий). */
function paint(geo: G, color: string, m: THREE.Matrix4): G {
  const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Детерминированный шум: одни и те же пятна травы при каждой перестройке. */
function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

let cobbleTex: THREE.Texture | null = null;
/** Текстура брусчатки (рисуется один раз на холсте, повторяется по дорожкам). */
function cobbles(): THREE.Texture | null {
  if (cobbleTex) return cobbleTex;
  if (typeof document === 'undefined') return null;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#d8c39b';
  g.fillRect(0, 0, S, S);
  const shades = ['#f3e6c9', '#eadab8', '#f7ecd3', '#e4d2ad', '#efdfc0'];
  const n = 6;
  const cell = S / n;
  for (let j = 0; j < n; j += 1)
    for (let i = 0; i < n; i += 1) {
      const off = j % 2 ? cell / 2 : 0;
      for (const dx of [0, -S]) {
        const x = i * cell + off + dx + (hash(i, j) - 0.5) * 6;
        const y = j * cell + (hash(j, i) - 0.5) * 6;
        const w = cell - 7;
        const h = cell - 7;
        g.fillStyle = shades[Math.floor(hash(i * 3, j * 7) * shades.length)]!;
        g.beginPath();
        g.roundRect(x + 3.5, y + 3.5, w, h, 12);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.roundRect(x + 8, y + 7, w * 0.55, h * 0.25, 6);
        g.fill();
      }
    }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cobbleTex = t;
  return t;
}

/** Где дорожка: те же правила, что при укладке (края застроенных клеток и дорога с юга). */
function roadTest(c: CityState): (x: number, z: number) => boolean {
  const built = new Set(c.buildings.map((b) => `${b.gx},${b.gz}`));
  const has = (gx: number, gz: number): boolean => built.has(`${gx},${gz}`);
  const maxZ = Math.max(0, ...c.buildings.map((b) => b.gz));
  return (x, z) => {
    const gz = Math.round(z / TILE - 0.5);
    if (Math.abs(z - (gz + 0.5) * TILE) < 0.5) {
      const gx = Math.round(x / TILE);
      if (has(gx, gz) || has(gx, gz + 1)) return true;
    }
    const gx = Math.round(x / TILE - 0.5);
    if (Math.abs(x - (gx + 0.5) * TILE) < 0.5) {
      const gz2 = Math.round(z / TILE);
      if (has(gx, gz2) || has(gx + 1, gz2)) return true;
      if (gx === 0 && gz2 > maxZ) return true;
    }
    return false;
  };
}

export function buildGround(c: CityState, R: number): THREE.Group {
  const out = new THREE.Group();
  out.name = 'ground';
  const built = new Set(c.buildings.map((b) => `${b.gx},${b.gz}`));
  const has = (gx: number, gz: number): boolean => built.has(`${gx},${gz}`);
  const onRoad = roadTest(c);
  const townHalf = (R + 0.5) * TILE;
  const half = (MAP + 3) * TILE + 20;

  // ── Трава: пятна разных оттенков, поселение светлее.
  const grass = new THREE.PlaneGeometry(half * 2, half * 2, 110, 110);
  grass.rotateX(-Math.PI / 2);
  const gp = grass.getAttribute('position');
  const cols = new Float32Array(gp.count * 3);
  const dark = new THREE.Color('#78b866');
  const mid = new THREE.Color('#8fcb76');
  const light = new THREE.Color('#a9dc8c');
  const dry = new THREE.Color('#bcd98a');
  const tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const n1 = noise(x * 0.09, z * 0.09);
    const n2 = noise(x * 0.31 + 40, z * 0.31 - 17);
    tmp.copy(dark).lerp(mid, smooth(0.15, 0.75, n1));
    const inTown = 1 - smooth(townHalf - 1.5, townHalf + 1.5, Math.max(Math.abs(x), Math.abs(z)));
    tmp.lerp(light, inTown * 0.75);
    tmp.lerp(dry, smooth(0.72, 0.95, n2) * 0.45);
    tmp.multiplyScalar(0.96 + n2 * 0.08);
    cols.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  grass.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const gm = new THREE.Mesh(grass, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  gm.receiveShadow = true;
  out.add(gm);

  // ── Дорожки: брусчатка с планарными UV (стыки без швов) и бордюры между перекрёстками.
  const roadPos: number[] = [];
  const roadUv: number[] = [];
  const curbs: G[] = [];
  const RW = 0.7;
  const quad = (x0: number, z0: number, x1: number, z1: number): void => {
    const y = 0.02;
    const v = [
      [x0, z0],
      [x0, z1],
      [x1, z1],
      [x0, z0],
      [x1, z1],
      [x1, z0],
    ];
    for (const [x, z] of v) {
      roadPos.push(x!, y, z!);
      roadUv.push(x! / 1.5, -z! / 1.5);
    }
  };
  const curb = (x: number, z: number, w: number, d: number): void => {
    if (w > 0.05 && d > 0.05) curbs.push(paint(new THREE.BoxGeometry(w, 0.05, d), '#d3bf98', M(x, 0.035, z)));
  };
  for (let gx = -MAP - 1; gx <= MAP + 1; gx += 1)
    for (let gz = -MAP - 1; gz <= MAP + 1; gz += 1) {
      if (has(gx, gz) || has(gx, gz + 1)) {
        const z = (gz + 0.5) * TILE;
        quad(gx * TILE - TILE / 2 - RW / 2, z - RW / 2, gx * TILE + TILE / 2 + RW / 2, z + RW / 2);
        for (const s of [-1, 1]) curb(gx * TILE, z + s * (RW / 2 + 0.03), TILE - RW - 0.04, 0.07);
      }
      if (has(gx, gz) || has(gx + 1, gz)) {
        const x = (gx + 0.5) * TILE;
        quad(x - RW / 2, gz * TILE - TILE / 2 - RW / 2, x + RW / 2, gz * TILE + TILE / 2 + RW / 2);
        for (const s of [-1, 1]) curb(x + s * (RW / 2 + 0.03), gz * TILE, 0.07, TILE - RW - 0.04);
      }
    }
  const maxZ = Math.max(0, ...c.buildings.map((b) => b.gz));
  const southFrom = (maxZ + 0.5) * TILE;
  const southTo = half;
  quad(TILE / 2 - RW / 2, southFrom, TILE / 2 + RW / 2, southTo);
  for (const s of [-1, 1]) curb(TILE / 2 + s * (RW / 2 + 0.03), (southFrom + RW / 2 + southTo) / 2, 0.07, southTo - southFrom - RW / 2);
  if (roadPos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
    geo.computeVertexNormals();
    const tex = cobbles();
    const roads = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : '#f1e3c6', map: tex, roughness: 0.95 }));
    roads.receiveShadow = true;
    out.add(roads);
  }

  // ── Участки под стройку: светлый квадрат, колышки с верёвочкой по углам.
  const decor: G[] = [...curbs];
  for (let gx = -R; gx <= R; gx += 1)
    for (let gz = -R; gz <= R; gz += 1) {
      if (has(gx, gz)) continue;
      const cx = gx * TILE;
      const cz = gz * TILE;
      const s = TILE / 2 - 0.55;
      decor.push(paint(new THREE.PlaneGeometry(TILE - 1.0, TILE - 1.0), '#b2df98', M(cx, 0.012, cz, 1, 1, 1, -Math.PI / 2)));
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          decor.push(paint(new THREE.BoxGeometry(0.07, 0.3, 0.07), '#f6efe4', M(cx + sx * s, 0.15, cz + sz * s)));
          decor.push(paint(new THREE.BoxGeometry(0.075, 0.06, 0.075), '#ff8fb1', M(cx + sx * s, 0.28, cz + sz * s)));
        }
    }

  // ── Лес за поселением: лиственные деревья, ёлки, кусты, валуны, грибы.
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const forest: G[] = [];
  const crowns = ['#4f9a52', '#5aa856', '#468c4a', '#62b35c', '#3f8546'];
  for (let gx = -MAP - 3; gx <= MAP + 3; gx += 1)
    for (let gz = -MAP - 3; gz <= MAP + 3; gz += 1) {
      if (Math.max(Math.abs(gx), Math.abs(gz)) <= R) continue;
      for (let i = 0; i < 3; i += 1) {
        const x = gx * TILE + (rnd() - 0.5) * 3.4;
        const z = gz * TILE + (rnd() - 0.5) * 3.4;
        if (Math.abs(x - TILE / 2) < 1.6 && z > (R + 0.5) * TILE) continue;
        const s = 0.75 + rnd() * 0.75;
        const kind = rnd();
        const cc = crowns[Math.floor(rnd() * crowns.length)]!;
        if (kind < 0.5) {
          // Лиственное: ствол и шапка из трёх шаров.
          forest.push(paint(new THREE.CylinderGeometry(0.12 * s, 0.17 * s, 1.1 * s, 6), '#7a5236', M(x, 0.55 * s, z)));
          forest.push(paint(new THREE.SphereGeometry(0.85 * s, 9, 7), cc, M(x, 1.45 * s, z)));
          forest.push(paint(new THREE.SphereGeometry(0.55 * s, 8, 6), shade(cc, 1.12), M(x + 0.45 * s, 1.75 * s, z + 0.2 * s)));
          forest.push(paint(new THREE.SphereGeometry(0.5 * s, 8, 6), shade(cc, 0.9), M(x - 0.4 * s, 1.2 * s, z + 0.3 * s)));
          if (rnd() < 0.3) for (let a = 0; a < 3; a += 1) forest.push(paint(new THREE.SphereGeometry(0.07 * s, 5, 4), '#ff6b6b', M(x + Math.cos(a * 2.1) * 0.6 * s, 1.4 * s + a * 0.15 * s, z + Math.sin(a * 2.1) * 0.6 * s + 0.4 * s)));
        } else if (kind < 0.82) {
          // Ёлка из трёх конусов.
          const pc = shade('#3f7f4f', 0.9 + rnd() * 0.25);
          forest.push(paint(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.5 * s, 6), '#6b4a33', M(x, 0.25 * s, z)));
          for (let j = 0; j < 3; j += 1) forest.push(paint(new THREE.ConeGeometry((0.95 - j * 0.25) * s, 0.9 * s, 8), shade(pc, 1 + j * 0.08), M(x, (0.75 + j * 0.5) * s, z)));
        } else if (kind < 0.93) {
          // Куст с ягодами.
          forest.push(paint(new THREE.SphereGeometry(0.45 * s, 8, 6), cc, M(x, 0.3 * s, z, 1, 0.75, 1)));
          forest.push(paint(new THREE.SphereGeometry(0.32 * s, 7, 5), shade(cc, 1.15), M(x + 0.35 * s, 0.25 * s, z + 0.1, 1, 0.8, 1)));
          for (let a = 0; a < 4; a += 1) forest.push(paint(new THREE.SphereGeometry(0.05, 5, 4), a % 2 ? '#c94a6b' : '#5c7bd6', M(x + Math.cos(a * 1.6) * 0.35 * s, 0.4 * s, z + Math.sin(a * 1.6) * 0.3 * s + 0.15)));
        } else {
          // Валун со мхом.
          forest.push(paint(new THREE.DodecahedronGeometry(0.45 * s, 0), '#a8a9a4', M(x, 0.2 * s, z, 1.2, 0.7, 1, rnd(), rnd(), 0)));
          forest.push(paint(new THREE.SphereGeometry(0.25 * s, 6, 4), '#6f9a4f', M(x, 0.42 * s, z, 1.3, 0.3, 1)));
        }
        // Грибы под деревьями.
        if (rnd() < 0.18) {
          const mx = x + (rnd() - 0.5) * 1.6;
          const mz = z + 0.9;
          forest.push(paint(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 6), '#f6efe4', M(mx, 0.06, mz)));
          forest.push(paint(new THREE.SphereGeometry(0.09, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#e0483e', M(mx, 0.11, mz)));
          forest.push(paint(new THREE.SphereGeometry(0.018, 4, 3), '#ffffff', M(mx + 0.03, 0.18, mz + 0.03)));
        }
      }
    }
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  if (forest.length) {
    const fm = new THREE.Mesh(mergeGeometries(forest)!, solid);
    fm.castShadow = true;
    out.add(fm);
  }
  if (decor.length) {
    const dm = new THREE.Mesh(mergeGeometries(decor)!, solid);
    dm.receiveShadow = true;
    out.add(dm);
  }

  // ── Мелочи на траве: кустики, цветы, камешки (инстансы). Не на дорожках и не в зданиях.
  const inBuilt = (x: number, z: number): boolean => {
    const gx = Math.round(x / TILE);
    const gz = Math.round(z / TILE);
    return has(gx, gz) && Math.abs(x - gx * TILE) < TILE / 2 - 0.25 && Math.abs(z - gz * TILE) < TILE / 2 - 0.25;
  };
  const spots = (n: number, area: number): Array<[number, number]> => {
    const res: Array<[number, number]> = [];
    for (let i = 0; i < n * 3 && res.length < n; i += 1) {
      const x = (rnd() - 0.5) * 2 * area;
      const z = (rnd() - 0.5) * 2 * area;
      if (onRoad(x, z) || inBuilt(x, z)) continue;
      res.push([x, z]);
    }
    return res;
  };
  const area = (MAP + 2.5) * TILE;
  const dummy = new THREE.Object3D();
  // Кустики травы: три травинки-конуса.
  const blade = mergeGeometries([
    new THREE.ConeGeometry(0.035, 0.26, 3).translate(0, 0.13, 0),
    new THREE.ConeGeometry(0.03, 0.2, 3).rotateZ(0.35).translate(0.05, 0.09, 0.01),
    new THREE.ConeGeometry(0.03, 0.22, 3).rotateZ(-0.35).translate(-0.05, 0.1, -0.01),
  ])!;
  const tuftPts = spots(1800, area);
  const tufts = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), tuftPts.length);
  const tc = new THREE.Color();
  tuftPts.forEach(([x, z], i) => {
    dummy.position.set(x, 0.01, z);
    dummy.rotation.set(0, rnd() * Math.PI, 0);
    dummy.scale.setScalar(0.8 + rnd() * 0.8);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    tufts.setColorAt(i, tc.set(['#5fa84f', '#6dbb5e', '#7cc46a', '#58994a'][i % 4]!));
  });
  out.add(tufts);
  // Цветы: стебелёк и головка разных цветов.
  const flowerPts = spots(520, area);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.012, 0.2, 4).translate(0, 0.1, 0), new THREE.MeshStandardMaterial({ color: '#4f9a52' }), flowerPts.length);
  const headGeo = mergeGeometries([new THREE.SphereGeometry(0.045, 6, 4).scale(1, 0.6, 1).translate(0, 0.21, 0), new THREE.SphereGeometry(0.018, 4, 3).translate(0, 0.235, 0)])!;
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), flowerPts.length);
  const petals = ['#ff7eb6', '#ffd93d', '#ffffff', '#b28dff', '#ff6b6b', '#8ac7ff'];
  flowerPts.forEach(([x, z], i) => {
    dummy.position.set(x, 0.01, z);
    dummy.rotation.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
    dummy.scale.setScalar(0.8 + rnd() * 0.6);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, tc.set(petals[Math.floor(noise(x * 0.4, z * 0.4) * petals.length)]!));
  });
  out.add(stems, heads);
  // Камешки.
  const pebblePts = spots(260, area);
  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), pebblePts.length);
  pebblePts.forEach(([x, z], i) => {
    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(0.6 + rnd(), 0.4 + rnd() * 0.3, 0.6 + rnd());
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
    pebbles.setColorAt(i, tc.set(['#b9b7b0', '#cfcac0', '#a8a49b'][i % 3]!));
  });
  out.add(pebbles);
  return out;
}

/** Темнее/светлее цвета. */
function shade(hex: string, k: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

/** Освободить сетки земли перед перестройкой. */
export function disposeGround(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mat = m.material as THREE.Material;
    mat.dispose();
  });
}
