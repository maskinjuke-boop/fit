import * as THREE from 'three';

/**
 * Мульт-мебель: модели Kenney «Furniture Kit» (CC0, public/models/furniture). Лицевая сторона — +Z,
 * как у моделей игры. Модель вписывается в заданный размер (по каждой оси), чтобы места, где
 * персонаж садится и ложится, остались прежними.
 */

export const KENNEY = [
  'bedDouble',
  'loungeSofa',
  'tableCoffee',
  'kitchenFridgeLarge',
  'kitchenStove',
  'hoodModern',
  'shower',
  'bathtub',
  'loungeChair',
  'desk',
  'chairDesk',
  'computerScreen',
  'computerKeyboard',
  'kitchenCabinet',
  'kitchenCabinetDrawer',
  'kitchenCoffeeMachine',
  'kitchenBlender',
  'kitchenMicrowave',
  'pottedPlant',
  'sideTable',
] as const;
export type KenneyName = (typeof KENNEY)[number];

const models = new Map<KenneyName, THREE.Object3D>();
let loading: Promise<void> | null = null;

/** Загружает модели (один раз; без браузера и при ошибке остаются прежние модели). */
export function loadFurniture(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined') return (loading = Promise.resolve());
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  loading = import('three/examples/jsm/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      return Promise.all(
        KENNEY.map((name) =>
          loader
            .loadAsync(`${base}models/furniture/${name}.glb`)
            .then((g) => {
              g.scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (!m.isMesh) return;
                const mt = m.material as THREE.MeshStandardMaterial;
                // Мульт-заливка: матовая, без металлического отлива.
                mt.metalness = 0;
                mt.roughness = Math.max(0.55, mt.roughness);
                m.geometry.userData.shared = true;
              });
              models.set(name, g.scene);
            })
            .catch(() => undefined),
        ),
      );
    })
    .then(() => undefined)
    .catch(() => undefined);
  return loading;
}

export const furnitureReady = (): boolean => models.size === KENNEY.length;

/**
 * Копия модели, вписанная в размер size (ширина, высота, глубина) с низом по центру в точке at;
 * colors — новые цвета материалов по имени (carpet, wood, metal…); turn — поворот вокруг вертикали.
 */
export function kenney(name: KenneyName, size: [number, number, number], at: [number, number, number] = [0, 0, 0], colors: Record<string, THREE.ColorRepresentation> = {}, turn = 0): THREE.Group {
  const out = new THREE.Group();
  const src = models.get(name);
  if (!src) return out;
  const o = src.clone(true);
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    const mt = (m.material as THREE.MeshStandardMaterial).clone();
    const c = colors[mt.name];
    if (c !== undefined) mt.color.set(c);
    m.material = mt;
    // Тонкие листья с контуром выглядят чёрными — без контура.
    if (mt.name === 'plant') m.userData.noOutline = true;
  });
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const sz = box.getSize(new THREE.Vector3());
  const s = new THREE.Vector3(size[0] / Math.max(sz.x, 1e-6), size[1] / Math.max(sz.y, 1e-6), size[2] / Math.max(sz.z, 1e-6));
  const inner = new THREE.Group();
  inner.add(o);
  o.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  inner.scale.copy(s);
  out.add(inner);
  out.rotation.y = turn;
  out.position.set(at[0], at[1], at[2]);
  return out;
}
