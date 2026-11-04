import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import { rng } from '../../../game/random';
import type { Appearance } from '../../../game/state';
import type { MonsterId } from '../../../game/storyTypes';
import {
  CAMPS,
  LAIRS,
  MARKERS_PER_REGION,
  REGION_COUNT,
  REGION_LEN,
  WORLD_END,
  WORLD_HALF_WIDTH,
  WORLD_START,
  barrierZ,
  clampToWorld,
  heightAt,
  markerPos,
  regionAt,
  roadX,
  type P2,
} from '../../../game/world';
import { prepare } from './anatomy';
import { buildCharacter, disposeObject, garmentsFor, type CharacterParts } from './buildCharacter';
import { loadHairTexture } from './hairMesh';
import { M, mat, mesh } from './kit';
import { renderMonster } from './snapshot';
import { createStudio, setupRenderer } from './studio';

/**
 * Открытый мир: рельеф пяти регионов вдоль дороги, деревья, скалы, топи, дюны и башни,
 * вехи пути, логова монстров, стоянки и барьер за непобеждённым хранителем.
 * Герой ходит джойстиком, клавишами или по касанию земли; камера следует за ним.
 */

export interface WorldView {
  /** Вехи: пройденные шаги (номер региона, шаг), текущая цель. */
  region: number;
  step: number;
  ending: 'victory' | 'defeat' | null;
  started: boolean;
}

export interface World3DProps {
  color: string;
  appearance: Appearance;
  equipped: Partial<Record<Slot, string>>;
  view: WorldView;
  start: P2;
  /** Направление джойстика (x — вправо, y — вперёд/на север), длина 0…1. */
  stick: { current: { x: number; y: number } };
  /** Точка, куда идти (касание карты); сбрасывается по прибытии. */
  goto: { current: P2 | null };
  /** Мгновенный переход (с карты). */
  jump: { current: P2 | null };
  onMove(p: P2): void;
  onFail(): void;
}

const BIOME: Array<[string, string]> = [
  ['#3f6b35', '#57853f'],
  ['#6b6a62', '#8a8476'],
  ['#3f4d3a', '#56604a'],
  ['#d2b27a', '#e4c88f'],
  ['#3a3540', '#4d4655'],
];
const SKY = ['#9fc7e8', '#b9c6d6', '#8f9a8a', '#f0d9a8', '#3b2f45'];
const FOG = ['#a9c9a0', '#c3c8cf', '#8e9a86', '#ecd3a0', '#3e3247'];

function terrain(): THREE.Mesh {
  const w = WORLD_HALF_WIDTH * 2 + 40;
  const len = WORLD_START - WORLD_END + 40;
  const geo = new THREE.PlaneGeometry(w, len, 90, 300);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, (WORLD_START + WORLD_END) / 2);
  const pos = geo.getAttribute('position');
  const colors: number[] = [];
  const c = new THREE.Color();
  const a = new THREE.Color();
  const b = new THREE.Color();
  const dirt = new THREE.Color('#8a6f4d');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    // Цвет биома с плавным переходом на границе регионов и пятнами.
    const t = -z / REGION_LEN;
    const r0 = Math.max(0, Math.min(REGION_COUNT - 1, Math.floor(t)));
    const r1 = Math.min(REGION_COUNT - 1, r0 + 1);
    const f = Math.max(0, Math.min(1, (t - r0 - 0.85) / 0.3));
    const n = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.07 - z * 0.23);
    a.set(BIOME[r0]![0]).lerp(b.set(BIOME[r0]![1]), n);
    c.set(BIOME[r1]![0]).lerp(b.set(BIOME[r1]![1]), n);
    a.lerp(c, f);
    // Дорога.
    const d = Math.abs(x - roadX(z));
    const road = d < 2.2 ? 1 : d < 3.2 ? 1 - (d - 2.2) : 0;
    if (road > 0) a.lerp(dirt, road * (regionAt(z) === 3 ? 0.4 : 0.85));
    colors.push(a.r, a.g, a.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  m.name = 'ground';
  return m;
}

/** Набор одинаковых объектов одним вызовом отрисовки. */
function scatter(geo: THREE.BufferGeometry, m: THREE.Material, pts: Array<{ x: number; z: number; s: number; r: number; y?: number }>): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, m, pts.length);
  const o = new THREE.Object3D();
  pts.forEach((p, i) => {
    o.position.set(p.x, (p.y ?? 0) + heightAt(p.x, p.z), p.z);
    o.rotation.set(0, p.r, 0);
    o.scale.setScalar(p.s);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.castShadow = false;
  im.receiveShadow = false;
  return im;
}

/** Случайные точки региона, не на дороге. */
function spots(region: number, n: number, seed: string, minRoad = 5): Array<{ x: number; z: number; s: number; r: number }> {
  const r = rng(`${seed}:${region}`);
  const out: Array<{ x: number; z: number; s: number; r: number }> = [];
  for (let i = 0; out.length < n && i < n * 4; i += 1) {
    const z = -REGION_LEN * region - r() * REGION_LEN;
    const x = (r() * 2 - 1) * (WORLD_HALF_WIDTH + 14);
    if (Math.abs(x - roadX(z)) < minRoad) continue;
    out.push({ x, z, s: 0.7 + r() * 0.7, r: r() * Math.PI * 2 });
  }
  return out;
}

function merged(parts: Array<[THREE.BufferGeometry, [number, number, number]]>): THREE.BufferGeometry {
  // Простое объединение (одинаковые атрибуты position/normal, без uv).
  const pos: number[] = [];
  const nor: number[] = [];
  for (const [g0, [x, y, z]] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.translate(x, y, z);
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

function props(): THREE.Group {
  const g = new THREE.Group();
  // Лес: ели и лиственные деревья.
  const pine = merged([
    [new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6), [0, 0.7, 0]],
    [new THREE.ConeGeometry(1.4, 2.4, 7), [0, 2.2, 0]],
    [new THREE.ConeGeometry(1.05, 2, 7), [0, 3.3, 0]],
    [new THREE.ConeGeometry(0.7, 1.6, 7), [0, 4.3, 0]],
  ]);
  const pineColors = (geo: THREE.BufferGeometry, trunk: string, leaf: string, split: number): THREE.BufferGeometry => {
    const p = geo.getAttribute('position');
    const cols: number[] = [];
    const t = new THREE.Color(trunk);
    const l = new THREE.Color(leaf);
    for (let i = 0; i < p.count; i += 1) {
      const c = i < split ? t : l;
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return geo;
  };
  const trunkCount = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6).toNonIndexed().getAttribute('position').count;
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  g.add(scatter(pineColors(pine, '#5a3d26', '#2f5e34', trunkCount), vc, spots(0, 170, 'pine')));
  const oak = merged([
    [new THREE.CylinderGeometry(0.22, 0.32, 2, 6), [0, 1, 0]],
    [new THREE.IcosahedronGeometry(1.5, 0), [0, 2.9, 0]],
    [new THREE.IcosahedronGeometry(1.1, 0), [0.9, 2.5, 0.3]],
  ]);
  g.add(scatter(pineColors(oak, '#5a3d26', '#4e8a3a', trunkCount + 0), vc, spots(0, 60, 'oak')));
  // Горы: валуны и острые пики по краям.
  const rock = new THREE.MeshStandardMaterial({ color: '#7d7a73', roughness: 0.95, flatShading: true });
  g.add(scatter(new THREE.DodecahedronGeometry(1.2, 0), rock, spots(1, 120, 'rock', 4)));
  const peaks: Array<{ x: number; z: number; s: number; r: number; y: number }> = [];
  const pr = rng('peaks');
  for (let i = 0; i < 40; i += 1) {
    const z = -REGION_LEN - pr() * REGION_LEN;
    const side = i % 2 ? 1 : -1;
    peaks.push({ x: side * (WORLD_HALF_WIDTH + 4 + pr() * 14), z, s: 1 + pr() * 1.2, r: pr() * 6, y: -1 });
  }
  const peak = new THREE.ConeGeometry(6, 16, 6);
  peak.translate(0, 8, 0);
  g.add(scatter(peak, new THREE.MeshStandardMaterial({ color: '#8b8a86', roughness: 1, flatShading: true }), peaks));
  g.add(scatter(new THREE.ConeGeometry(0.9, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: '#2f4f3a', roughness: 0.9, flatShading: true }), spots(1, 50, 'mpine')));
  // Топи: сухие деревья, камыш, лужи воды.
  const dead = merged([
    [new THREE.CylinderGeometry(0.12, 0.3, 3.2, 5), [0, 1.6, 0]],
    [new THREE.CylinderGeometry(0.05, 0.1, 1.4, 4).rotateZ(0.9), [0.5, 2.6, 0]],
    [new THREE.CylinderGeometry(0.05, 0.1, 1.2, 4).rotateZ(-0.8), [-0.45, 2.2, 0]],
  ]);
  g.add(scatter(dead, new THREE.MeshStandardMaterial({ color: '#3d3428', roughness: 1, flatShading: true }), spots(2, 70, 'dead')));
  g.add(scatter(new THREE.ConeGeometry(0.25, 1.4, 4).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: '#6f7a3a', roughness: 1 }), spots(2, 160, 'reed', 3.5)));
  const water = new THREE.MeshStandardMaterial({ color: '#2d4a48', roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 });
  for (const p of spots(2, 14, 'pond', 7)) {
    const w = mesh(new THREE.CircleGeometry(2.5 * p.s + 1.5, 24), water, [p.x, heightAt(p.x, p.z) + 0.06, p.z]);
    w.rotation.x = -Math.PI / 2;
    w.scale.set(1.4, 1, 1);
    g.add(w);
  }
  // Пустыня: кактусы и кости.
  const cactus = merged([
    [new THREE.CylinderGeometry(0.28, 0.32, 2.6, 8), [0, 1.3, 0]],
    [new THREE.CylinderGeometry(0.18, 0.18, 1, 8), [0.55, 1.6, 0]],
    [new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8).rotateZ(Math.PI / 2), [0.33, 1.15, 0]],
  ]);
  g.add(scatter(cactus, new THREE.MeshStandardMaterial({ color: '#4f7a3a', roughness: 0.8 }), spots(3, 70, 'cactus')));
  g.add(scatter(new THREE.DodecahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: '#b98b55', roughness: 1, flatShading: true }), spots(3, 50, 'srock')));
  // Цитадель: чёрные шпили, обломки и сама крепость в конце дороги.
  const spire = new THREE.ConeGeometry(0.7, 5, 5);
  spire.translate(0, 2.5, 0);
  g.add(scatter(spire, new THREE.MeshStandardMaterial({ color: '#2a2530', roughness: 0.7, flatShading: true }), spots(4, 80, 'spire')));
  const fort = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#2e2935', roughness: 0.85 });
  const fz = WORLD_END - 8;
  const fx = roadX(WORLD_END);
  fort.add(mesh(new THREE.BoxGeometry(34, 10, 4), stone, [fx, 5, fz]));
  for (const x of [-17, -6, 6, 17]) {
    fort.add(mesh(new THREE.CylinderGeometry(2.4, 2.8, 18, 10), stone, [fx + x, 9, fz]));
    fort.add(mesh(new THREE.ConeGeometry(3, 6, 10), mat('#4a1f3a', 0.6), [fx + x, 21, fz]));
  }
  fort.add(mesh(new THREE.BoxGeometry(5, 7, 1), mat('#120f16', 0.8), [fx, 3.5, fz + 2.1]));
  for (const x of [-11, 0, 11]) fort.add(mesh(new THREE.BoxGeometry(1.4, 2, 0.3), M.glow('#ff7a3c', 1.4), [fx + x, 7, fz + 2.1]));
  g.add(fort);
  return g;
}

/** Веха пути: камень с руной; текущая — с лучом света. */
function marker(done: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 6), mat(done ? '#6d6a63' : '#8d8a83', 0.9), [0, 0.8, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.4, 0.05), M.glow(done ? '#7cff9a' : '#ffd36e', done ? 0.6 : 1.2), [0, 1.1, 0.36]));
  return g;
}

function beam(color: string): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 40, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  m.position.y = 20;
  return m;
}

function gate(): THREE.Group {
  const g = new THREE.Group();
  const st = mat('#4a4550', 0.85);
  for (const x of [-2.4, 2.4]) g.add(mesh(new THREE.BoxGeometry(1, 5, 1), st, [x, 2.5, 0]));
  g.add(mesh(new THREE.BoxGeometry(6, 0.9, 1.2), st, [0, 5.3, 0]));
  g.add(mesh(new THREE.OctahedronGeometry(0.5), M.glow('#ff3d3d', 1.4), [0, 6.2, 0]));
  return g;
}

function campfire(): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#5a3a22');
  for (let i = 0; i < 4; i += 1) {
    const l = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), wood, [0, 0.12, 0]);
    l.rotation.set(Math.PI / 2, (i * Math.PI) / 4, 0.2);
    g.add(l);
  }
  const flame = mesh(new THREE.ConeGeometry(0.35, 0.9, 10), new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.9 }), [0, 0.55, 0]);
  g.add(flame);
  const light = new THREE.PointLight('#ff9a3c', 3, 9, 2);
  light.position.y = 1.2;
  g.add(light);
  const tent = mesh(new THREE.ConeGeometry(1.4, 2, 4), M.cloth('#a0784a', 3), [2.4, 1, -1.2]);
  tent.rotation.y = Math.PI / 4;
  g.add(tent);
  g.userData.flame = flame;
  return g;
}

function barrier(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF_WIDTH * 2 + 30, 14, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#b26bff', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  m.position.y = 7;
  return m;
}

function blobShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export default function World3D({ color, appearance, equipped, view, start, stick, goto, jump, onMove, onFail }: World3DProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const api = useRef<{ rebuild(): void; refresh(): void } | null>(null);
  const heroArgs = useRef({ color, appearance, equipped });
  heroArgs.current = { color, appearance, equipped };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    setupRenderer(renderer, true);
    const canvas = renderer.domElement;
    canvas.className = 'world-canvas';
    el.appendChild(canvas);
    const studio = createStudio(renderer, true);
    const { scene } = studio;
    scene.environmentIntensity = 0.35;
    // Солнце вместо студийного ключевого света; тень — только у героя (маленькая область).
    studio.rim.intensity = 0.2;
    const sun = studio.key;
    sun.intensity = 2.2;
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -6;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(new THREE.HemisphereLight('#dfe9ff', '#4a4030', 1.1));
    scene.fog = new THREE.Fog(FOG[0]!, 40, 135);
    scene.background = new THREE.Color(SKY[0]!);

    const world = new THREE.Group();
    world.add(terrain(), props());
    scene.add(world);

    // Вехи, врата, логова, стоянки и барьер — пересоздаются при изменении истории.
    const dyn = new THREE.Group();
    scene.add(dyn);
    const flames: THREE.Mesh[] = [];
    let beamMesh: THREE.Mesh | null = null;
    let barrierMesh: THREE.Mesh | null = null;
    const monsterTex = new Map<MonsterId, THREE.Texture>();
    const lairSprites: Array<{ sprite: THREE.Sprite; monster: MonsterId }> = [];
    for (const l of LAIRS) {
      const den = mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a332c', roughness: 1, flatShading: true }), [l.pos.x, heightAt(l.pos.x, l.pos.z) - 0.4, l.pos.z - 2.4], [1.3, 0.9, 1]);
      world.add(den, mesh(new THREE.CircleGeometry(1.1, 16), new THREE.MeshBasicMaterial({ color: '#0b0908' }), [l.pos.x, heightAt(l.pos.x, l.pos.z) + 0.7, l.pos.z - 0.6], [1, 0.8, 1]));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
      sp.visible = false;
      sp.position.set(l.pos.x, heightAt(l.pos.x, l.pos.z) + 1.5, l.pos.z);
      sp.scale.set(3.2, 3.2, 1);
      world.add(sp);
      lairSprites.push({ sprite: sp, monster: l.monster });
    }
    // Картинки монстров рисуются по одной в фоне (тот же механизм, что иконки).
    void (async () => {
      for (const l of lairSprites) {
        let t = monsterTex.get(l.monster);
        if (!t) {
          try {
            const url = await renderMonster(l.monster, 256);
            t = await new THREE.TextureLoader().loadAsync(url);
            t.colorSpace = THREE.SRGBColorSpace;
            monsterTex.set(l.monster, t);
          } catch {
            continue;
          }
        }
        l.sprite.material.map = t;
        l.sprite.material.needsUpdate = true;
        l.sprite.visible = true;
      }
    })();
    for (const c of CAMPS) {
      const f = campfire();
      f.position.set(c.x, heightAt(c.x, c.z), c.z);
      world.add(f);
      flames.push(f.userData.flame as THREE.Mesh);
    }
    const refresh = (): void => {
      disposeObject(dyn);
      dyn.clear();
      const v = viewRef.current;
      for (let r = 0; r < REGION_COUNT; r += 1) {
        for (let k = 0; k < MARKERS_PER_REGION; k += 1) {
          const p = markerPos(r, k);
          const done = v.ending === 'victory' || r < v.region || (r === v.region && k < v.step);
          const m = marker(done);
          m.position.set(p.x + 1.8, heightAt(p.x + 1.8, p.z), p.z);
          dyn.add(m);
        }
        const gp = markerPos(r, MARKERS_PER_REGION);
        const gt = gate();
        gt.position.set(gp.x, heightAt(gp.x, gp.z), gp.z);
        dyn.add(gt);
      }
      beamMesh = null;
      if (v.started && !v.ending) {
        const r = Math.min(v.region, REGION_COUNT - 1);
        const p = markerPos(r, Math.min(v.step, MARKERS_PER_REGION));
        beamMesh = beam(v.step >= MARKERS_PER_REGION ? '#ff4d4d' : '#ffd36e');
        beamMesh.position.x = p.x + (v.step >= MARKERS_PER_REGION ? 0 : 1.8);
        beamMesh.position.z = p.z;
        dyn.add(beamMesh);
      }
      barrierMesh = null;
      if (v.ending !== 'victory' && v.region < REGION_COUNT) {
        barrierMesh = barrier();
        barrierMesh.position.z = barrierZ(v.region);
        dyn.add(barrierMesh);
      }
    };
    refresh();

    // Герой.
    const heroRoot = new THREE.Group();
    const shadow = blobShadow();
    scene.add(heroRoot, shadow);
    let hero: CharacterParts | null = null;
    let disposed = false;
    let token = 0;
    const setHero = (c: CharacterParts): void => {
      if (hero) {
        heroRoot.remove(hero.root);
        disposeObject(hero.root);
      }
      hero = c;
      c.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      heroRoot.add(c.root);
      setReady(true);
    };
    // Герой собирается для этой сцены (после подготовки одежды и причёски).
    const rebuild = (): void => {
      const { color: col, appearance: app, equipped: eq } = heroArgs.current;
      const my = (token += 1);
      void Promise.all([prepare(app.figure, garmentsFor(app.figure, eq)), loadHairTexture(app.hair)]).then(() => {
        if (disposed || my !== token) return;
        setHero(buildCharacter(app, col, eq));
      });
    };
    api.current = { rebuild, refresh };
    rebuild();
    sun.target = heroRoot;
    

    const pos = new THREE.Vector3(start.x, heightAt(start.x, start.z), start.z);
    let facing = Math.PI;
    let speed = 0;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);
    const camPos = new THREE.Vector3(pos.x, pos.y + 7, pos.z + 9);

    const resize = (): void => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Клавиатура.
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'ц', 'ф', 'ы', 'в'].includes(k)) return;
      if (e.type === 'keydown') keys.add(k);
      else keys.delete(k);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // Касание земли — идти туда.
    const ray = new THREE.Raycaster();
    const ground = world.children[0]!;
    let downAt = { x: 0, y: 0, t: 0 };
    const onDown = (e: PointerEvent): void => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent): void => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12 || performance.now() - downAt.t > 500) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(ground, false)[0];
      if (hit) goto.current = { x: hit.point.x, z: hit.point.z };
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((x) => x.isIntersecting);
    });
    io.observe(el);
    const onLost = (e: Event): void => {
      e.preventDefault();
      onFail();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    let raf = 0;
    let prev = performance.now();
    let walk = 0;
    let lastReport = 0;
    let curRegion = -1;
    const fogColor = new THREE.Color();
    const skyColor = new THREE.Color();
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      if (jump.current) {
        const c = clampToWorld(jump.current, viewRef.current);
        pos.set(c.x, heightAt(c.x, c.z), c.z);
        camPos.set(c.x, pos.y + 6.5, c.z + 8.5);
        jump.current = null;
        goto.current = null;
      }
      // Направление: джойстик, клавиши или цель касания.
      let dx = stick.current.x;
      let dz = -stick.current.y;
      if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) dz -= 1;
      if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) dz += 1;
      if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright') || keys.has('в')) dx += 1;
      let mag = Math.min(1, Math.hypot(dx, dz));
      if (mag > 0.05) goto.current = null;
      else if (goto.current) {
        const gx = goto.current.x - pos.x;
        const gz = goto.current.z - pos.z;
        const d = Math.hypot(gx, gz);
        if (d < 0.4) goto.current = null;
        else {
          dx = gx / d;
          dz = gz / d;
          mag = Math.min(1, d / 1.5);
        }
      }
      const target = mag > 0.05 ? 7.5 * mag : 0;
      speed += (target - speed) * Math.min(1, dt * 8);
      if (mag > 0.05) {
        const want = Math.atan2(dx, dz);
        let diff = want - facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        facing += diff * Math.min(1, dt * 10);
      }
      if (speed > 0.01) {
        const nx = pos.x + Math.sin(facing) * speed * dt;
        const nz = pos.z + Math.cos(facing) * speed * dt;
        const c = clampToWorld({ x: nx, z: nz }, viewRef.current);
        if (c.z !== nz && goto.current) goto.current = null;
        pos.x = c.x;
        pos.z = c.z;
      }
      pos.y = heightAt(pos.x, pos.z);
      walk += dt * speed * 1.6;
      heroRoot.position.copy(pos);
      heroRoot.position.y += Math.abs(Math.sin(walk)) * 0.06 * Math.min(1, speed);
      heroRoot.rotation.set(Math.min(1, speed / 7.5) * 0.08, facing, Math.sin(walk) * 0.04 * Math.min(1, speed));
      shadow.position.set(pos.x, pos.y + 0.03, pos.z);
      if (hero) {
        const t = now / 1000;
        const b = Math.sin(t * 1.9);
        hero.torso.scale.set(1 + b * 0.006, 1 + b * 0.0025, 1 + b * 0.012);
        for (const f of hero.anim) f(t);
      }
      // Камера: позади и выше, мягко догоняет.
      const want = new THREE.Vector3(pos.x, pos.y + 6.5, pos.z + 8.5);
      camPos.lerp(want, Math.min(1, dt * 4));
      camera.position.copy(camPos);
      camera.lookAt(pos.x, pos.y + 1.1, pos.z - 1.5);
      sun.position.set(pos.x + 6, pos.y + 12, pos.z + 5);
      // Небо и туман региона.
      const r = regionAt(pos.z);
      const f = Math.max(0, Math.min(1, (-pos.z / REGION_LEN - r - 0.8) / 0.4));
      skyColor.set(SKY[r]!).lerp(fogColor.set(SKY[Math.min(REGION_COUNT - 1, r + 1)]!), f);
      (scene.background as THREE.Color).copy(skyColor);
      scene.fog!.color.set(FOG[r]!).lerp(fogColor.set(FOG[Math.min(REGION_COUNT - 1, r + 1)]!), f);
      if (r !== curRegion) curRegion = r;
      // Огонь стоянок, луч цели и барьер мерцают.
      const t = now / 1000;
      for (const fl of flames) fl.scale.set(1, 1 + Math.sin(t * 11 + fl.id) * 0.15, 1);
      if (beamMesh) (beamMesh.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(t * 3) * 0.06;
      if (barrierMesh) (barrierMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 2) * 0.07;
      for (const l of lairSprites) l.sprite.position.y = heightAt(l.sprite.position.x, l.sprite.position.z) + 1.5 + Math.sin(t * 2 + l.sprite.id) * 0.08;
      renderer.render(scene, camera);
      if (now - lastReport > 150) {
        lastReport = now;
        moveRef.current({ x: pos.x, z: pos.z });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      api.current = null;
      disposed = true;
      for (const t of monsterTex.values()) t.dispose();
      disposeObject(scene);
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
    // Сцена создаётся один раз; позиция старта читается только при создании.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Вехи и барьер обновляются при продвижении по истории.
  useEffect(() => {
    api.current?.refresh();
  }, [view.region, view.step, view.ending, view.started]);

  // Герой пересобирается при смене внешности и экипировки.
  const sig = JSON.stringify([color, appearance, equipped]);
  const firstSig = useRef(sig);
  useEffect(() => {
    if (sig === firstSig.current) return;
    firstSig.current = sig;
    api.current?.rebuild();
  }, [sig]);

  return (
    <div ref={host} className="world3d">
      {!ready && (
        <div className="hero3d-busy">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
