import * as THREE from 'three';
import { disposeObject } from './kit';

/**
 * «Фотостудия» для персонажа и иконок: окружение для отражений металла,
 * ключевой свет с мягкими тенями, контровой свет в цвете героя и заполняющий.
 */

/** Градиентная «комната» с парой светлых панелей, запечённая в PMREM-текстуру. */
function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const pos = geo.getAttribute('position');
  const colors: number[] = [];
  const top = new THREE.Color('#c9d6f0');
  const mid = new THREE.Color('#5a6480');
  const bottom = new THREE.Color('#15171c');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 10;
    if (y > 0) c.copy(mid).lerp(top, y);
    else c.copy(mid).lerp(bottom, -y);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (x: number, y: number, z: number, w: number, h: number, k: number): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(5, 5, 6, 5, 3, 3);
  panel(-7, 2, -4, 3, 5, 1.6);
  panel(0, 8, 0, 6, 6, 1.5);
  panel(-5, -1, 5, 4, 2, 0.8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  disposeObject(env);
  return tex;
}

export interface Studio {
  scene: THREE.Scene;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  dispose(): void;
}

export function setupRenderer(renderer: THREE.WebGLRenderer, shadows: boolean): void {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

export function createStudio(renderer: THREE.WebGLRenderer, shadows: boolean): Studio {
  const scene = new THREE.Scene();
  const env = studioEnvironment(renderer);
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight('#e4ecff', '#3a2f45', 0.65));
  const key = new THREE.DirectionalLight('#fff6ec', 2.0);
  key.position.set(2.2, 4.2, 3.6);
  key.target.position.set(0, 1.1, 0);
  scene.add(key.target);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const cam = key.shadow.camera;
    cam.left = -1.5;
    cam.right = 1.5;
    cam.top = 1.7;
    cam.bottom = -1.5;
    cam.near = 1;
    cam.far = 12;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
  }
  const rim = new THREE.DirectionalLight('#ffffff', 2.2);
  rim.position.set(-3, 2.5, -3.5);
  const fill = new THREE.DirectionalLight('#b8c8ff', 0.55);
  fill.position.set(-3, 1, 2);
  scene.add(key, rim, fill);
  return {
    scene,
    key,
    rim,
    dispose() {
      env.dispose();
      disposeObject(scene);
    },
  };
}

/**
 * Непрозрачные части модели отбрасывают тень на пол. Сами модели тень не принимают:
 * иначе руки, волосы и одежда кладут на тело тёмные пятна.
 */
export function enableShadows(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mt = m.material as THREE.Material;
    const solid = !mt.transparent && !(mt instanceof THREE.MeshBasicMaterial);
    m.castShadow = solid;
    m.receiveShadow = false;
  });
}
