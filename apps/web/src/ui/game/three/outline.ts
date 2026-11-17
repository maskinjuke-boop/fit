import * as THREE from 'three';

/**
 * Мульт-контур: у сетки появляется «оболочка» — та же геометрия, раздутая вдоль сглаженных нормалей
 * и нарисованная изнанкой тёмным цветом (inverted hull). Работает и со скиннингом, и с морфами.
 * Сглаженные нормали (по совпадающим вершинам) нужны, чтобы оболочка коробок и сеток с плоскими
 * гранями не распадалась на отдельные грани.
 */

const mats = new Map<string, THREE.MeshBasicMaterial>();

function outlineMaterial(color: THREE.ColorRepresentation, thickness: number): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${thickness}`;
  let m = mats.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 outlineNormal;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3( position ) + outlineNormal * ${thickness.toFixed(5)};`);
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  m.userData.outline = true;
  mats.set(key, m);
  return m;
}

/** Сглаженные нормали для оболочки (общие для совпадающих по положению вершин). */
function ensureOutlineNormals(geo: THREE.BufferGeometry): boolean {
  if (geo.getAttribute('outlineNormal')) return true;
  const pos = geo.getAttribute('position');
  if (!pos) return false;
  const n = pos.count;
  const acc = new Float32Array(n * 3);
  const index = geo.index;
  const tri = index ? index.count / 3 : n / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const keyOf = (i: number): string => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const weld = new Map<string, number>();
  const rep = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const k = keyOf(i);
    let r = weld.get(k);
    if (r === undefined) {
      r = i;
      weld.set(k, i);
    }
    rep[i] = r;
  }
  for (let t = 0; t < tri; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    // Нормаль грани с весом площади, по углам — у вершины-представителя.
    b.sub(a);
    c.sub(a);
    b.cross(c);
    for (const i of [i0, i1, i2]) {
      const r = rep[i]!;
      acc[r * 3] = acc[r * 3]! + b.x;
      acc[r * 3 + 1] = acc[r * 3 + 1]! + b.y;
      acc[r * 3 + 2] = acc[r * 3 + 2]! + b.z;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const r = rep[i]!;
    a.set(acc[r * 3]!, acc[r * 3 + 1]!, acc[r * 3 + 2]!);
    if (a.lengthSq() > 0) a.normalize();
    out[i * 3] = a.x;
    out[i * 3 + 1] = a.y;
    out[i * 3 + 2] = a.z;
  }
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return true;
}

export interface OutlineOpts {
  thickness?: number;
  color?: THREE.ColorRepresentation;
  /** Не обводить сетки, у которых все размеры больше этого (стены, пол). */
  maxFlat?: number;
}

/** Сетки, которые не обводятся: прозрачные, «светящиеся» (MeshBasic), плоскости пола и стен, глаза. */
function skip(m: THREE.Mesh, maxFlat: number): boolean {
  if (m.userData.noOutline || m.userData.outlineHull) return true;
  if ((m as THREE.InstancedMesh).isInstancedMesh) return true;
  const list = Array.isArray(m.material) ? m.material : [m.material];
  if (list.some((x) => !x || x.transparent || x instanceof THREE.MeshBasicMaterial || x.userData?.outline || x.side === THREE.DoubleSide)) return true;
  if (m.name === 'toon-eye' || m.name === 'toon-brow') return true;
  const geo = m.geometry;
  if (!geo || !geo.getAttribute('position')) return true;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const s = geo.boundingBox!.getSize(new THREE.Vector3()).multiply(m.scale);
  // Плоские большие (пол, стены, потолок) — без контура; совсем плоские — тоже (у плоскости нет изнанки).
  const dims = [s.x, s.y, s.z].sort((x, y) => x - y);
  if (dims[0]! < 0.004) return true;
  if (dims[0]! < 0.06 && dims[1]! > maxFlat) return true;
  return false;
}

/** Добавляет контур всем подходящим сеткам внутри root (повторный вызов не дублирует). */
export function addOutlines(root: THREE.Object3D, opts: OutlineOpts = {}): void {
  const thickness = opts.thickness ?? 0.012;
  const color = opts.color ?? '#1b1512';
  const maxFlat = opts.maxFlat ?? 1.6;
  const list: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  const rootScale = root.getWorldScale(new THREE.Vector3());
  const ws = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.outlined && !skip(m, maxFlat)) list.push(m);
  });
  for (const m of list) {
    if (!ensureOutlineNormals(m.geometry)) continue;
    m.userData.outlined = true;
    // Толщина — в единицах root: масштаб вложенных групп (модели, вписанные в размер) делится.
    m.getWorldScale(ws).divide(rootScale);
    const k = (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3 || 1;
    const mat = outlineMaterial(color, Number((thickness / k).toPrecision(2)));
    let hull: THREE.Mesh;
    const sm = m as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      const h = new THREE.SkinnedMesh(m.geometry, mat);
      h.bindMode = sm.bindMode;
      h.bind(sm.skeleton, sm.bindMatrix);
      h.frustumCulled = false;
      hull = h;
    } else {
      hull = new THREE.Mesh(m.geometry, mat);
    }
    if (m.morphTargetInfluences) {
      hull.morphTargetInfluences = m.morphTargetInfluences;
      hull.morphTargetDictionary = m.morphTargetDictionary;
    }
    hull.userData.outlineHull = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.raycast = () => undefined;
    hull.renderOrder = m.renderOrder;
    m.add(hull);
  }
}
