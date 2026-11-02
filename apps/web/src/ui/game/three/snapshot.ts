import * as THREE from 'three';
import { itemById, type Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { buildCharacter, buildItemModel, disposeObject } from './buildCharacter';
import { createStudio, enableShadows, setupRenderer, type Studio } from './studio';

/**
 * Снимки 3D-моделей в картинки: иконки предметов для магазина и сумки
 * и портрет героя для шапки. Один невидимый WebGL-холст на всё приложение;
 * задания выполняются по очереди, чтобы не тормозить интерфейс.
 */

let renderer: THREE.WebGLRenderer | null = null;
let studio: Studio | null = null;
let broken = false;

function ensure(): { renderer: THREE.WebGLRenderer; studio: Studio } {
  if (broken) throw new Error('webgl');
  if (!renderer || !studio) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    } catch {
      broken = true;
      throw new Error('webgl');
    }
    renderer.setPixelRatio(1);
    setupRenderer(renderer, true);
    renderer.setClearColor(0x000000, 0);
    studio = createStudio(renderer, true);
    renderer.domElement.addEventListener('webglcontextlost', () => {
      renderer = null;
      studio = null;
    });
  }
  return { renderer, studio };
}

let queue: Promise<unknown> = Promise.resolve();

/** Ставит задание в очередь; между заданиями отдаём управление браузеру. */
function enqueue<T>(job: () => T): Promise<T> {
  const run = queue.then(
    () =>
      new Promise<T>((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(job());
          } catch (e) {
            reject(e);
          }
        }, 0);
      }),
  );
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Камера смотрит на объект с направления dir, затем кадр обрезается по проекции
 * габаритов модели — плоские и вытянутые предметы заполняют иконку так же, как округлые.
 */
function frame(obj: THREE.Object3D, dir: THREE.Vector3, fov: number, fill: number, size: number): THREE.PerspectiveCamera {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.01, 100);
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(fov / 2));
  cam.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
  cam.lookAt(sphere.center);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  // Проекция точек модели (вершины габаритов каждой детали) в координаты кадра.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const p = new THREE.Vector3();
  const part = new THREE.Box3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    if (!m.geometry.boundingBox) return;
    part.copy(m.geometry.boundingBox);
    for (let i = 0; i < 8; i += 1) {
      p.set(i & 1 ? part.max.x : part.min.x, i & 2 ? part.max.y : part.min.y, i & 4 ? part.max.z : part.min.z).applyMatrix4(m.matrixWorld).project(cam);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  });
  if (Number.isFinite(minX)) {
    const half = Math.max(maxX - minX, maxY - minY) / 2 / fill;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const s = half * size;
    cam.setViewOffset(size, size, ((cx + 1) / 2) * size - s / 2, ((1 - cy) / 2) * size - s / 2, s, s);
  }
  return cam;
}

function shoot(scene: THREE.Scene, cam: THREE.Camera, size: number, keyTarget: THREE.Vector3): string {
  const r = renderer!;
  r.setSize(size, size, false);
  studio!.key.target.position.copy(keyTarget);
  studio!.key.position.copy(keyTarget).add(new THREE.Vector3(2.2, 3.1, 3.6));
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}

const VIEW: Record<Slot, THREE.Vector3> = {
  head: new THREE.Vector3(0.55, 0.35, 1),
  body: new THREE.Vector3(0.45, 0.15, 1),
  weapon: new THREE.Vector3(0.15, 0.05, 1),
  offhand: new THREE.Vector3(-0.35, 0.12, 1),
};

/** Иконка предмета: прозрачный фон, модель с трёхчетвертной точки зрения. */
export function renderItem(id: string, color: string, figure: Figure, size = 192): Promise<string> {
  return enqueue(() => {
    const { studio: st } = ensure();
    const item = itemById(id);
    if (!item) throw new Error('item');
    const { object, anim } = buildItemModel(id, item.slot, color, figure);
    for (const f of anim) f(0.4);
    enableShadows(object);
    st.rim.color.set(color);
    st.scene.environmentIntensity = 0.85;
    st.scene.add(object);
    try {
      const cam = frame(object, VIEW[item.slot], 26, 0.86, size);
      const c = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      return shoot(st.scene, cam, size, c);
    } finally {
      st.scene.remove(object);
      disposeObject(object);
    }
  });
}

/** Портрет героя по пояс для шапки и списков. */
export function renderPortrait(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>, size = 160): Promise<string> {
  return enqueue(() => {
    const { studio: st } = ensure();
    const parts = buildCharacter(appearance, color, equipped);
    for (const f of parts.anim) f(0.4);
    enableShadows(parts.root);
    st.rim.color.set(color);
    st.scene.environmentIntensity = 0.55;
    st.scene.add(parts.root);
    try {
      parts.root.rotation.y = 0.32;
      parts.root.updateMatrixWorld(true);
      const target = new THREE.Vector3(0, 1.88, 0);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
      cam.position.set(0, 1.96, 2.2);
      cam.lookAt(target);
      return shoot(st.scene, cam, size, target);
    } finally {
      st.scene.remove(parts.root);
      disposeObject(parts.root);
    }
  });
}

