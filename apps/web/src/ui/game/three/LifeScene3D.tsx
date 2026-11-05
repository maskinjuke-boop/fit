import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { actionsAt } from '../../../game/life';
import { GYMS } from '../../../game/lifeContent';
import { GYM_ROOM, HOUSE, REACH, bounds as sceneBounds, clientSpot, dist, gymGear, gymLayout, homeLayout, homeObstacles, resolve, spawn, type Box, type GearKind, type P2, type Placed } from '../../../game/lifeMap';
import type { CatBreed, ObjectId, SceneId } from '../../../game/lifeTypes';
import { animFor } from './actionAnims';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { buildCat, poseCat, type Cat3D, type CatMode } from './cats3d';
import { contactShadow, objectModel, parquetTexture, plasterTexture, ticksOf, type HomeAnim } from './homeModels';
import { M, mat, mesh } from './kit';
import { blobShadow, loadCharacter, lookKey, type Look, type Member } from './people';
import { animate, type Motion } from './rig';
import { createStudio, setupRenderer } from './studio';

/**
 * 3D-сцены тренера: свой дом (комната в разрезе) и фитнес-зал, который растёт с уровнем:
 * коврики, стойки, беговые дорожки, груши, душевая и фитнес-бар. Ученики стоят рядами
 * лицом к месту тренера и разминаются. Герой ходит джойстиком, клавишами или по
 * касанию пола — со скелетной анимацией шага; рядом с предметом сцена сообщает,
 * с чем можно взаимодействовать.
 */

export type { Look, Member };

export interface LifeScene3DProps {
  scene: SceneId;
  furniture: ObjectId[];
  gym: number;
  minute: number;
  hero: Look;
  /** Ученики в зале (пусто, если зал закрыт или герой дома). */
  clients: Member[];
  /** Свои кошки (живут дома). */
  cats: Array<{ id: string; breed: CatBreed }>;
  /** Герой выполняет действие у предмета (анимация до результата). */
  perform: { key: number; action: string; at: ObjectId } | null;
  /** Куда сцена пишет, где сейчас кошки (для самостоятельного сима). */
  catSpots?: { current: P2[] };
  stick: { current: { x: number; y: number } };
  goto: { current: P2 | null };
  onNear(target: ObjectId | null): void;
  /** Игрок сам управляет героем (клавиши, касание пола) — сим перестаёт действовать сам. */
  onInput?(): void;
  onFail(): void;
}

const ZOOM_KEY = 'fitness-rpg.lifeZoom';
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.8;
const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function loadZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v > 0 ? clampZoom(v) : 1;
  } catch {
    return 1;
  }
}


// ─── Оборудование зала ─────────────────────────────────────────────────

function gearModel(kind: GearKind, tier: number): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'mat': {
      const colors = ['#2f6fb5', '#3a9d6a', '#8e44ad', '#d35400', '#c0392b'];
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.025, 1.7), mat(colors[tier % colors.length]!, 0.95), [0, 0.012, 0]));
      break;
    }
    case 'rack': {
      g.add(mesh(new THREE.BoxGeometry(2.1, 0.06, 0.5), M.darkSteel(), [0, 0.45, 0]), mesh(new THREE.BoxGeometry(2.1, 0.06, 0.5), M.darkSteel(), [0, 0.85, -0.05]));
      for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.5), M.darkSteel(), [x, 0.45, 0]));
      for (let i = 0; i < 6; i += 1) {
        const x = -0.85 + i * 0.34;
        for (const y of [0.55, 0.95]) {
          g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), M.chrome(), [x, y, 0]).rotateX(Math.PI / 2));
          for (const z of [-0.11, 0.11]) g.add(mesh(new THREE.CylinderGeometry(0.05 + i * 0.008, 0.05 + i * 0.008, 0.05, 14), M.iron(), [x, y, z]).rotateX(Math.PI / 2));
        }
      }
      break;
    }
    case 'kettlebells': {
      const colors = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];
      for (let i = 0; i < 5; i += 1) {
        const r = 0.1 + i * 0.015;
        const x = -0.7 + i * 0.35;
        g.add(mesh(new THREE.SphereGeometry(r, 14, 10), mat(colors[i]!, 0.5, 0.3), [x, r, 0]));
        const h = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, 0.018, 6, 16, Math.PI), M.iron());
        h.position.set(x, r * 1.8, 0);
        g.add(h);
      }
      break;
    }
    case 'squat_rack': {
      for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.07, 2.3, 0.07), M.iron(), [x, 1.15, z]));
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.07, 0.07), M.iron(), [0, 2.3, -0.4]), mesh(new THREE.BoxGeometry(1.3, 0.07, 0.07), M.iron(), [0, 2.3, 0.4]));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 2, 10), M.chrome(), [0, 1.4, 0.4]).rotateZ(Math.PI / 2));
      for (const x of [-0.85, 0.85]) g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20), M.iron(), [x, 1.4, 0.4]).rotateZ(Math.PI / 2));
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.03, 2.2), mat('#2b2b2b', 0.9), [0, 0.015, 0]));
      break;
    }
    case 'bench': {
      g.add(mesh(new THREE.BoxGeometry(0.35, 0.1, 1.3), M.leather('#1d1f23'), [0, 0.45, 0]));
      for (const z of [-0.5, 0.5]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 0.06), M.iron(), [0, 0.2, z]));
      break;
    }
    case 'treadmill': {
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.18, 1.8), mat('#24272c', 0.6), [0, 0.09, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.02, 1.6), mat('#111', 0.9), [0, 0.19, 0]));
      for (const x of [-0.37, 0.37]) g.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05), M.darkSteel(), [x, 0.7, -0.75]).rotateX(-0.15));
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.35, 0.08), mat('#24272c', 0.4), [0, 1.3, -0.85]).rotateX(-0.5));
      g.add(mesh(new THREE.PlaneGeometry(0.5, 0.2), M.glow('#39d0ff', 0.7), [0, 1.33, -0.8]).rotateX(-0.5));
      break;
    }
    case 'bag': {
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 18), M.leather('#9b1c1c'), [0, 1.35, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 6), M.chrome(), [0, 2.6, 0]));
      break;
    }
    case 'cable': {
      for (const x of [-0.55, 0.55]) g.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), mat('#d9dde1', 0.4, 0.5), [x, 1.1, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.25, 0.12, 0.2), mat('#d9dde1', 0.4, 0.5), [0, 2.2, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.8, 0.15), M.iron(), [0, 0.5, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 6), mat('#111', 0.5), [0, 1.4, 0.1]));
      break;
    }
    case 'bike': {
      g.add(mesh(new THREE.BoxGeometry(0.15, 0.08, 1.0), M.darkSteel(), [0, 0.05, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), M.darkSteel(), [0, 0.5, 0.25]).rotateX(0.2));
      g.add(mesh(new THREE.BoxGeometry(0.25, 0.06, 0.32), M.leather('#111'), [0, 0.95, 0.32]));
      g.add(mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), M.darkSteel(), [0, 0.6, -0.35]).rotateX(-0.2));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.04, 0.04), M.chrome(), [0, 1.1, -0.45]));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20), mat('#e85d2a', 0.4, 0.4), [0, 0.35, -0.2]).rotateZ(Math.PI / 2));
      break;
    }
    case 'plant': {
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 14), mat('#f4f4f4', 0.5), [0, 0.27, 0]));
      for (let i = 0; i < 7; i += 1) g.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), mat('#3d7f3a', 0.7), [Math.sin(i * 1.7) * 0.15, 0.8 + (i % 3) * 0.22, Math.cos(i * 1.7) * 0.15], [0.7, 1.4, 0.7]));
      break;
    }
    case 'neon': {
      g.add(mesh(new THREE.BoxGeometry(6, 0.08, 0.04), M.glow('#ff3d7f', 2.2), [0, 3.0, 0.03]));
      g.add(mesh(new THREE.BoxGeometry(6, 0.08, 0.04), M.glow('#3dd6ff', 2.2), [0, 2.75, 0.03]));
      break;
    }
  }
  return g;
}

function signTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66, 490);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─── Комнаты ───────────────────────────────────────────────────────────

function walls(w: number, d: number, tone: string, H = 3, wainscot?: string): THREE.Group {
  const g = new THREE.Group();
  const tex = plasterTexture();
  const wall = mat(tone, 0.95);
  if (tex) {
    const t = tex.clone();
    t.repeat.set(w / 2.5, H / 2.5);
    t.needsUpdate = true;
    wall.map = t;
  }
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, H, 0.15), wall, [0, H / 2, -d / 2 - 0.07]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.15, H, d + 0.15), wall, [(sx * (w + 0.15)) / 2, H / 2, 0]));
  // Панели внизу стен и плинтус по периметру.
  if (wainscot) {
    const pm = mat(wainscot, 0.7);
    g.add(mesh(new THREE.BoxGeometry(w, 0.9, 0.03), pm, [0, 0.45, -d / 2 + 0.015]));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.03, 0.9, d), pm, [sx * (w / 2 - 0.015), 0.45, 0]));
    const rail = mat('#ffffff', 0.5);
    g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.05), rail, [0, 0.92, -d / 2 + 0.03]));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, d), rail, [sx * (w / 2 - 0.03), 0.92, 0]));
  }
  const base = mat('#f7f5f0', 0.55);
  g.add(mesh(new THREE.BoxGeometry(w, 0.12, 0.05), base, [0, 0.06, -d / 2 + 0.04]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.12, d), base, [sx * (w / 2 - 0.04), 0.06, 0]));
  return g;
}

/** Окно в боковой стене со светлым проёмом и пятном света на полу. */
function sideWindow(x: number, z: number, side: number, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const frame = mat('#ffffff', 0.45);
  const glass = night ? M.glow('#1d2b55', 0.45) : M.glow('#cfe9ff', 0.9);
  const w = 1.7;
  const h = 1.4;
  g.add(mesh(new THREE.PlaneGeometry(w, h), glass, [0, 0, 0.005]));
  g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.08, 0.1), frame, [0, h / 2 + 0.04, 0.03]), mesh(new THREE.BoxGeometry(w + 0.2, 0.07, 0.2), frame, [0, -h / 2 - 0.03, 0.08]));
  for (const dx of [-w / 2 - 0.04, 0, w / 2 + 0.04]) g.add(mesh(new THREE.BoxGeometry(0.06, h, 0.08), frame, [dx, 0, 0.03]));
  g.add(mesh(new THREE.BoxGeometry(w, 0.04, 0.05), frame, [0, 0.15, 0.03]));
  // Шторы.
  const curtain = M.cloth('#e9dcc7', 3);
  for (const dx of [-w / 2 - 0.25, w / 2 + 0.25]) g.add(mesh(new THREE.BoxGeometry(0.32, h + 0.5, 0.06), curtain, [dx, -0.1, 0.1]));
  g.position.set(x, 1.75, z);
  g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  if (!night) {
    const lightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.6),
      new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    lightPool.rotation.x = -Math.PI / 2;
    lightPool.position.set(x - side * 1.6, 0.012, z);
    const pool = new THREE.Group();
    pool.add(lightPool);
    pool.userData.pool = true;
    const out = new THREE.Group();
    out.add(g, pool);
    return out;
  }
  return g;
}

/** Расставляет предметы: настенные — на высоте, напольным — мягкая контактная тень. */
function addPlaced(g: THREE.Group, placed: ReadonlyArray<Placed & { y?: number }>): void {
  for (const p of placed) {
    const m = objectModel(p.id);
    m.position.set(p.pos.x, p.y ?? 0, p.pos.z);
    m.rotation.y = p.rot;
    g.add(m);
    if (p.box && !p.y) {
      const sh = contactShadow((p.box.x1 - p.box.x0) * 1.45, (p.box.z1 - p.box.z0) * 1.45, 0.75);
      sh.position.x = p.pos.x;
      sh.position.z = p.pos.z;
      g.add(sh);
    }
  }
}

function house(placed: Array<Placed & { y?: number }>, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = HOUSE;
  const pq = parquetTexture();
  const floorMat = mat('#ffffff', 0.62);
  if (pq) {
    const t = pq.clone();
    t.repeat.set(w / 1.2, d / 1.2);
    t.needsUpdate = true;
    floorMat.map = t;
  } else floorMat.color.set('#b88a5e');
  const floor = mesh(new THREE.PlaneGeometry(w, d), floorMat, [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  g.add(floor, walls(w, d, '#ece4d6', 3, '#d8cbb6'));
  // Кухонная зона: плитка на полу и фартук на стене.
  const tiles = mesh(new THREE.PlaneGeometry(3.4, 2.6), mat('#d9d4cc', 0.35), [w / 2 - 1.7, 0.004, -d / 2 + 1.3]);
  tiles.rotation.x = -Math.PI / 2;
  tiles.receiveShadow = true;
  g.add(tiles);
  g.add(mesh(new THREE.PlaneGeometry(3.3, 0.7), mat('#a7c7d9', 0.25), [w / 2 - 1.7, 1.25, -d / 2 + 0.02]));
  // Окна на левой стене.
  for (const z of [-3.6, 2.2]) g.add(sideWindow(-w / 2 + 0.01, z, -1, night));
  // Ковёр у дивана: овал с каймой.
  const rug = mesh(new THREE.CircleGeometry(1.4, 48), M.cloth('#a24b45', 3), [0.4, 0.008, -0.2]);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.5, 1.05, 1);
  rug.receiveShadow = true;
  const rim = mesh(new THREE.RingGeometry(1.25, 1.4, 48), M.cloth('#e3c7a0', 3), [0.4, 0.01, -0.2]);
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1.5, 1.05, 1);
  g.add(rug, rim);
  addPlaced(g, placed);
  // Потолочные светильники: днём слабее, вечером теплее и ярче.
  for (const [x, z] of [[-3.5, -1], [3.5, -1], [0, 2.8]] as const) {
    const lamp = new THREE.PointLight('#ffd9a0', night ? 9 : 2.5, 11, 1.7);
    lamp.position.set(x, 2.85, z);
    g.add(lamp);
  }
  return g;
}

function gymRoom(tier: number, placed: Placed[], night: boolean): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = GYM_ROOM;
  const floorTone = ['#3a3d42', '#34383e', '#2e3238', '#2a2d33', '#24262b'][tier]!;
  const floor = mesh(new THREE.PlaneGeometry(w, d), mat(floorTone, 0.95), [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  g.add(floor, walls(w, d, ['#c9c4bb', '#dfe3e6', '#e9edf0', '#f0f0f0', '#f5f2ec'][tier]!, 3.4));
  // Деревянная дорожка у входа (с ростом зала).
  if (tier >= 2) {
    const strip = mesh(new THREE.PlaneGeometry(4.2, d), mat('#a87a4c', 0.7), [-w / 2 + 2.1, 0.004, 0]);
    strip.rotation.x = -Math.PI / 2;
    g.add(strip);
  }
  // Зеркальная стена за учениками.
  const mirror = mesh(new THREE.PlaneGeometry(Math.min(w - 4, 4 + tier * 2.5), 2.1), mat('#cfe3f2', 0.04, 1), [0, 1.35, -d / 2 + 0.02]);
  g.add(mirror);
  // Окна по правой стене.
  for (const z of [-3.5, 0.5]) g.add(mesh(new THREE.PlaneGeometry(2.2, 1.3), night ? M.glow('#1d2b55', 0.5) : M.glow('#bfe3ff', 0.7), [w / 2 - 0.01, 2.2, z]).rotateY(-Math.PI / 2));
  // Вывеска над зеркалом.
  const def = GYMS[tier]!;
  g.add(mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: signTexture(`${def.icon} FIT`, ['#7a5a3a', '#2f6fb5', '#e85d2a', '#8e44ad', '#111111'][tier]!), toneMapped: false }), [0, 2.95, -d / 2 + 0.03]));
  for (const x of gymGear(tier)) {
    const m = gearModel(x.kind, tier);
    m.position.set(x.pos.x, 0, x.pos.z);
    m.rotation.y = x.rot;
    g.add(m);
  }
  addPlaced(g, placed);
  for (const x of [-4, 4]) {
    const lamp = new THREE.PointLight('#fff4e0', 9 + tier * 2, 16, 1.6);
    lamp.position.set(x, 3.2, 0);
    g.add(lamp);
  }
  return g;
}

// ─── Свет и время ──────────────────────────────────────────────────────

const isNight = (minute: number): boolean => minute < 6 * 60 || minute >= 20 * 60;
const daylight = (minute: number): number => {
  const h = minute / 60;
  if (h < 5 || h > 21) return 0.15;
  if (h < 8) return 0.15 + ((h - 5) / 3) * 0.85;
  if (h > 18) return 1 - ((h - 18) / 3) * 0.85;
  return 1;
};

interface Crew {
  root: THREE.Group;
  parts: CharacterParts | null;
  key: string;
  shadow: THREE.Mesh;
  spot: P2;
  seed: number;
}

export default function LifeScene3D(props: LifeScene3DProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const api = useRef<{ rebuildScene(): void; rebuildHero(): void; syncClients(): void; syncCats(): void; zoomBy(k: number): void } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      propsRef.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    setupRenderer(renderer, true);
    // Мягкие края теней.
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.className = 'world-canvas';
    el.appendChild(canvas);
    const studio = createStudio(renderer, true);
    const { scene } = studio;
    scene.environmentIntensity = 0.4;
    studio.rim.intensity = 0.15;
    const sun = studio.key;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.camera.far = 30;
    sun.shadow.radius = 4;
    sun.shadow.camera.updateProjectionMatrix();
    const hemi = new THREE.HemisphereLight('#fff1dc', '#5a4a3a', 1);
    scene.add(hemi);
    scene.background = new THREE.Color('#1a1d22');

    let disposed = false;
    const world = new THREE.Group();
    scene.add(world);
    let ground: THREE.Object3D | null = null;
    let bounds: Box = sceneBounds('home');
    let boxes: Box[] = [];
    let targets: Array<{ id: ObjectId; pos: P2; obj: Placed }> = [];
    let placedNow: Placed[] = [];
    let ticks: HomeAnim[] = [];
    const pos = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    let builtScene: SceneId | null = null;
    let lastNear: ObjectId | null | undefined;

    const rebuildScene = (): void => {
      const p = propsRef.current;
      disposeObject(world);
      world.clear();
      const night = isNight(p.minute);
      const tier = Math.max(0, Math.min(GYMS.length - 1, p.gym));
      if (p.scene === 'home') {
        const placed = homeLayout(p.furniture);
        world.add(house(placed, night));
        boxes = [...placed.map((x) => x.box).filter((b): b is Box => b !== null), ...homeObstacles()];
        placedNow = placed;
      } else {
        const def = GYMS[tier]!;
        const placed = gymLayout(def.shower, def.bar);
        world.add(gymRoom(tier, placed, night));
        boxes = [...placed.map((x) => x.box), ...gymGear(tier).map((x) => x.box)].filter((b): b is Box => b !== null);
        placedNow = placed;
      }
      // Подойти можно только к предметам с действиями (декор просто украшает).
      targets = placedNow.filter((x) => actionsAt(x.id).length > 0).map((x) => ({ id: x.id, pos: x.use, obj: x }));
      ticks = ticksOf(world);
      sun.position.set(-9, 10, 3);
      bounds = sceneBounds(p.scene);
      ground = world.getObjectByName('ground') ?? null;
      // Новое место — герой у двери; та же сцена — остаётся где был.
      if (builtScene !== p.scene) {
        builtScene = p.scene;
        const sp = spawn(p.scene);
        pos.set(sp.x, 0, sp.z);
        camPos.set(sp.x * 0.6, 7, sp.z + 7);
        facing = Math.PI / 2;
      } else {
        const c = resolve({ x: pos.x, z: pos.z }, bounds, boxes);
        pos.set(c.x, 0, c.z);
      }
      lastNear = undefined;
      syncClients();
      syncCats();
      vacuum.visible = p.scene === 'home' && p.furniture.includes('robot_vacuum');
    };

    // ── Кошки: свой распорядок (бродят, сидят, умываются, спят), подходят к герою. ──
    interface CatAI {
      cat: Cat3D;
      id: string;
      shadow: THREE.Mesh;
      pos: P2;
      heading: number;
      mode: CatMode;
      goal: P2 | null;
      until: number;
      speed: number;
      seed: number;
    }
    const cats = new Map<string, CatAI>();
    const catRand = (() => {
      let a = 12345;
      return (): number => {
        a = (a * 1103515245 + 12345) & 0x7fffffff;
        return a / 0x7fffffff;
      };
    })();
    const randomSpot = (): P2 => {
      for (let i = 0; i < 20; i += 1) {
        const q = { x: bounds.x0 + 0.6 + catRand() * (bounds.x1 - bounds.x0 - 1.2), z: bounds.z0 + 0.6 + catRand() * (bounds.z1 - bounds.z0 - 1.2) };
        const r = resolve(q, bounds, boxes);
        if (Math.hypot(r.x - q.x, r.z - q.z) < 0.01) return q;
      }
      return { x: 0, z: 0.5 };
    };
    const syncCats = (): void => {
      const p = propsRef.current;
      const want = p.scene === 'home' ? p.cats : [];
      for (const [id, c] of cats) {
        if (!want.some((w) => w.id === id && w.breed === c.cat.breed)) {
          scene.remove(c.cat.root, c.shadow);
          disposeObject(c.cat.root);
          cats.delete(id);
        }
      }
      want.forEach((w, i) => {
        if (cats.has(w.id)) return;
        const cat = buildCat(w.breed, i + 1);
        const shadow = blobShadow(0.55);
        const start = randomSpot();
        cat.root.position.set(start.x, 0, start.z);
        scene.add(cat.root, shadow);
        cats.set(w.id, { cat, id: w.id, shadow, pos: start, heading: catRand() * Math.PI * 2, mode: 'idle', goal: null, until: 0, speed: 0, seed: i * 2.1 });
      });
    };

    // Робот-пылесос: катается по дому и отворачивает от препятствий.
    const vacuum = new THREE.Group();
    vacuum.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 28), mat('#2b2e33', 0.35, 0.2), [0, 0.045, 0]));
    vacuum.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), mat('#c8ccd1', 0.3, 0.6), [0, 0.09, 0]));
    vacuum.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.02), M.glow('#5bff8a', 1.4), [0, 0.098, 0.1]));
    vacuum.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12), mat('#e85d2a', 0.5), [0.12, 0.012, 0.11]));
    vacuum.visible = false;
    scene.add(vacuum);
    const vac = { pos: { x: -6.2, z: 2.4 } as P2, heading: 0.4, turn: 0 };

    // Пока строятся сетки персонажей, кадры рисуются реже, чтобы сборка шла быстрее.
    let loading = 0;
    const track = <T,>(p: Promise<T>): Promise<T> => {
      loading += 1;
      return p.finally(() => {
        loading -= 1;
      });
    };

    // Ученики в зале.
    const crew = new Map<string, Crew>();
    let crewQueue: Promise<void> = Promise.resolve();
    const syncClients = (): void => {
      const p = propsRef.current;
      const want = p.scene === 'gym' ? p.clients : [];
      for (const [id, e] of crew) {
        if (!want.some((w) => w.id === id && lookKey(w) === e.key)) {
          scene.remove(e.root, e.shadow);
          disposeObject(e.root);
          crew.delete(id);
        }
      }
      want.forEach((w, i) => {
        const spot = clientSpot(i);
        const e = crew.get(w.id);
        if (e) {
          e.spot = spot;
          return;
        }
        const root = new THREE.Group();
        const shadow = blobShadow(1);
        scene.add(root, shadow);
        const entry: Crew = { root, parts: null, key: lookKey(w), shadow, spot, seed: i * 1.7 + 0.3 };
        crew.set(w.id, entry);
        // По одному, чтобы не подвешивать кадр сборкой десяти персонажей сразу.
        crewQueue = crewQueue.then(async () => {
          if (disposed || crew.get(w.id) !== entry) return;
          const parts = await track(loadCharacter(w));
          if (disposed || crew.get(w.id) !== entry) {
            disposeObject(parts.root);
            return;
          }
          entry.parts = parts;
          root.add(parts.root);
        }).catch(() => {
          // Ученик без модели не должен останавливать загрузку остальных.
        });
      });
    };

    // Герой.
    const heroRoot = new THREE.Group();
    const shadow = blobShadow();
    scene.add(heroRoot, shadow);
    sun.target = heroRoot;
    let hero: CharacterParts | null = null;
    let heroToken = 0;
    const rebuildHero = (): void => {
      const my = (heroToken += 1);
      void track(loadCharacter(propsRef.current.hero)).then((parts) => {
        if (disposed || my !== heroToken) {
          disposeObject(parts.root);
          return;
        }
        if (hero) {
          heroRoot.remove(hero.root);
          disposeObject(hero.root);
        }
        hero = parts;
        heroRoot.add(hero.root);
        setReady(true);
      });
    };
    // Масштаб: колесо мыши, щипок двумя пальцами или кнопки ＋/−.
    let zoom = loadZoom();
    let saveTimer = 0;
    const zoomBy = (k: number): void => {
      zoom = clampZoom(zoom * k);
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(ZOOM_KEY, String(zoom));
        } catch {
          // хранилище недоступно — масштаб живёт до перезагрузки
        }
      }, 300);
    };
    api.current = { rebuildScene, rebuildHero, syncClients, syncCats, zoomBy };

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
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

    let facing = Math.PI / 2;
    rebuildScene();
    rebuildHero();

    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'ц', 'ф', 'ы', 'в'].includes(k)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.type === 'keydown') {
        keys.add(k);
        propsRef.current.onInput?.();
      } else keys.delete(k);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const ray = new THREE.Raycaster();
    let downAt = { x: 0, y: 0, t: 0 };
    const touches = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let pinched = false;
    const spread = (): number => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (e: PointerEvent): void => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        pinch = spread();
        pinched = true;
      } else if (touches.size === 1) {
        pinched = false;
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
    };
    const onMove = (e: PointerEvent): void => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch > 0) {
        const d = spread();
        if (d > 0) zoomBy(pinch / d);
        pinch = d;
      }
    };
    const onLeave = (e: PointerEvent): void => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = 0;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.0015));
    };
    const onUp = (e: PointerEvent): void => {
      const multi = touches.size > 1 || pinched;
      onLeave(e);
      if (multi || !ground || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12 || performance.now() - downAt.t > 500) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(ground, false)[0];
      if (hit) {
        propsRef.current.onInput?.();
        propsRef.current.goto.current = { x: hit.point.x, z: hit.point.z };
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((x) => x.isIntersecting);
    });
    io.observe(el);
    const onLost = (e: Event): void => {
      e.preventDefault();
      propsRef.current.onFail();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    // ── Действие героя ──
    interface Acting {
      key: number;
      motion: Motion;
      anchor: P2;
      y: number;
      face: number;
      exit: P2;
      cat: string | null;
    }
    let act: Acting | null = null;
    let exiting: { to: P2 } | null = null;
    let heroY = 0;
    const startPerform = (pf: { key: number; action: string; at: ObjectId }): void => {
      const spec = animFor(pf.action);
      const here = { x: pos.x, z: pos.z };
      const placed = placedNow.find((x) => x.id === pf.at);
      if (!spec) {
        act = { key: pf.key, motion: 'stand:none', anchor: here, y: 0, face: facing, exit: here, cat: null };
        return;
      }
      if (spec.place === 'cat') {
        let best: CatAI | null = null;
        for (const c of cats.values()) if (!best || dist(pos, c.pos) < dist(pos, best.pos)) best = c;
        if (!best) {
          act = { key: pf.key, motion: spec.motion, anchor: here, y: 0, face: facing, exit: here, cat: null };
          return;
        }
        const dx = pos.x - best.pos.x;
        const dz = pos.z - best.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const anchor = resolve({ x: best.pos.x + (dx / d) * 0.5, z: best.pos.z + (dz / d) * 0.5 }, bounds, boxes);
        act = { key: pf.key, motion: spec.motion, anchor, y: 0, face: Math.atan2(best.pos.x - anchor.x, best.pos.z - anchor.z), exit: anchor, cat: best.id };
        best.goal = null;
        best.heading = Math.atan2(anchor.x - best.pos.x, anchor.z - best.pos.z);
        return;
      }
      if (!placed) {
        act = { key: pf.key, motion: spec.motion, anchor: here, y: 0, face: facing, exit: here, cat: null };
        return;
      }
      if (spec.place === 'front') {
        act = { key: pf.key, motion: spec.motion, anchor: { ...placed.use }, y: 0, face: Math.atan2(placed.pos.x - placed.use.x, placed.pos.z - placed.use.z), exit: { ...placed.use }, cat: null };
        return;
      }
      const [lx, lz] = spec.at ?? [0, 0];
      const c = Math.cos(placed.rot);
      const sn = Math.sin(placed.rot);
      const anchor = { x: placed.pos.x + lx * c + lz * sn, z: placed.pos.z - lx * sn + lz * c };
      act = { key: pf.key, motion: spec.motion, anchor, y: spec.y ?? 0, face: placed.rot + (spec.face ?? 0), exit: { ...placed.use }, cat: null };
    };

    const updateCats = (t: number, dt: number): void => {
      const blend = 1 - Math.exp(-dt * 6);
      for (const c of cats.values()) {
        const target = act?.cat === c.id;
        if (target) {
          c.mode = act!.motion === 'crouch:play' ? 'play' : 'sit';
          c.goal = null;
          c.until = t + 2;
        } else if (t > c.until) {
          const r = catRand();
          const heroNear = dist(pos, c.pos) < 4.5;
          if (heroNear && r < 0.2) {
            const a = catRand() * Math.PI * 2;
            c.goal = resolve({ x: pos.x + Math.sin(a) * 0.9, z: pos.z + Math.cos(a) * 0.9 }, bounds, boxes);
            c.mode = dist(pos, c.pos) > 2.5 ? 'trot' : 'walk';
            c.until = t + 12;
          } else if (r < 0.45) {
            c.goal = randomSpot();
            c.mode = 'walk';
            c.until = t + 16;
          } else {
            c.goal = null;
            const q = catRand();
            c.mode = q < 0.3 ? 'sit' : q < 0.48 ? 'groom' : q < 0.65 ? 'idle' : q < 0.82 ? 'lie' : 'sleep';
            const dur = { sit: [4, 9], groom: [3, 6], idle: [2, 5], lie: [6, 12], sleep: [14, 30], walk: [0, 0], trot: [0, 0], play: [2, 3] }[c.mode];
            c.until = t + dur[0]! + catRand() * (dur[1]! - dur[0]!);
          }
        }
        let want = c.mode === 'trot' ? 0.95 : c.mode === 'walk' ? 0.42 : 0;
        if (c.goal && want > 0) {
          const gx = c.goal.x - c.pos.x;
          const gz = c.goal.z - c.pos.z;
          const d = Math.hypot(gx, gz);
          if (d < 0.15) {
            c.goal = null;
            c.until = t;
            want = 0;
          } else {
            let diff = Math.atan2(gx, gz) - c.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            c.heading += diff * Math.min(1, dt * 5);
            if (d < 0.5) want *= 0.5 + d;
          }
        } else want = 0;
        c.speed += (want - c.speed) * Math.min(1, dt * 6);
        if (c.speed > 0.01) {
          const step = c.speed * dt;
          const next = resolve({ x: c.pos.x + Math.sin(c.heading) * step, z: c.pos.z + Math.cos(c.heading) * step }, bounds, boxes);
          // Упёрлась — выбирает другое место.
          if (Math.hypot(next.x - c.pos.x, next.z - c.pos.z) < step * 0.3) c.until = t;
          c.pos = next;
        }
        if (target) {
          let diff = Math.atan2(pos.x - c.pos.x, pos.z - c.pos.z) - c.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          c.heading += diff * Math.min(1, dt * 4);
        }
        // Голова поворачивается к герою, если он рядом.
        let look = 0;
        const dh = dist(pos, c.pos);
        if (dh < 2.8) {
          let a = Math.atan2(pos.x - c.pos.x, pos.z - c.pos.z) - c.heading;
          while (a > Math.PI) a -= Math.PI * 2;
          while (a < -Math.PI) a += Math.PI * 2;
          look = Math.max(-1, Math.min(1, a / 1.2));
        }
        const mode: CatMode = c.speed > 0.05 ? (c.speed > 0.6 ? 'trot' : 'walk') : c.mode === 'walk' || c.mode === 'trot' ? 'idle' : c.mode;
        poseCat(c.cat, mode, t + c.seed, c.speed, blend, mode === 'sleep' ? 0 : look);
        c.cat.root.position.set(c.pos.x, 0, c.pos.z);
        c.cat.root.rotation.y = c.heading;
        c.shadow.position.set(c.pos.x, 0.015, c.pos.z);
      }
    };

    const updateVacuum = (t: number, dt: number): void => {
      if (!vacuum.visible) return;
      const step = 0.3 * dt;
      const next = resolve({ x: vac.pos.x + Math.sin(vac.heading) * step, z: vac.pos.z + Math.cos(vac.heading) * step }, bounds, boxes);
      const moved = Math.hypot(next.x - vac.pos.x, next.z - vac.pos.z);
      if (vac.turn > 0) {
        vac.heading += dt * 2.2;
        vac.turn -= dt;
      } else if (moved < step * 0.5 || dist(next, pos) < 0.5) vac.turn = 0.6 + catRand() * 1.2;
      else vac.pos = next;
      vacuum.position.set(vac.pos.x, 0, vac.pos.z);
      vacuum.rotation.y = vac.heading;
      const brush = vacuum.children[3];
      if (brush) brush.rotation.y = t * 12;
    };

    let raf = 0;
    let prev = performance.now();
    let speed = 0;
    let stride = 0;
    const TOP = 2.6;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      const p = propsRef.current;
      const t = now / 1000;
      const ease = 1 - Math.exp(-dt * 10);
      // ── Действие у предмета: герой занимает место и играет анимацию ──
      const pf = p.perform;
      if (pf && (!act || act.key !== pf.key)) startPerform(pf);
      if (!pf && act) {
        exiting = { to: act.exit };
        act = null;
      }
      let dx = act || exiting ? 0 : p.stick.current.x;
      let dz = act || exiting ? 0 : -p.stick.current.y;
      if (!act && !exiting) {
        if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) dz -= 1;
        if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) dz += 1;
        if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright') || keys.has('в')) dx += 1;
      } else p.goto.current = null;
      let mag = Math.min(1, Math.hypot(dx, dz));
      if (mag > 0.05) p.goto.current = null;
      else if (p.goto.current) {
        const gx = p.goto.current.x - pos.x;
        const gz = p.goto.current.z - pos.z;
        const d = Math.hypot(gx, gz);
        if (d < 0.25) p.goto.current = null;
        else {
          dx = gx / d;
          dz = gz / d;
          mag = Math.min(1, d / 1.2);
        }
      }
      speed += ((mag > 0.05 ? TOP * mag : 0) - speed) * Math.min(1, dt * 9);
      if (mag > 0.05) {
        let diff = Math.atan2(dx, dz) - facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        facing += diff * Math.min(1, dt * 11);
      }
      if (act || exiting) {
        // Плавно на место действия (или обратно к месту использования).
        const to = act ? act.anchor : exiting!.to;
        const k = Math.min(1, dt * 7);
        pos.x += (to.x - pos.x) * k;
        pos.z += (to.z - pos.z) * k;
        heroY += ((act ? act.y : 0) - heroY) * k;
        if (act) {
          let diff = act.face - facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          facing += diff * k;
        }
        speed = 0;
        if (!act && exiting && Math.hypot(to.x - pos.x, to.z - pos.z) < 0.03 && Math.abs(heroY) < 0.01) {
          exiting = null;
          heroY = 0;
        }
      } else if (speed > 0.01) {
        const next = resolve({ x: pos.x + Math.sin(facing) * speed * dt, z: pos.z + Math.cos(facing) * speed * dt }, bounds, boxes);
        if (p.goto.current && Math.hypot(next.x - pos.x, next.z - pos.z) < speed * dt * 0.2) p.goto.current = null;
        pos.x = next.x;
        pos.z = next.z;
      }
      // Шаг: частота шагов растёт со скоростью, на месте — стойка с дыханием.
      stride += dt * (0.55 + (speed / TOP) * 0.65);
      heroRoot.position.set(pos.x, heroY, pos.z);
      heroRoot.rotation.set(0, facing, 0);
      shadow.position.set(pos.x, 0.02, pos.z);
      shadow.visible = heroY < 0.3;
      if (hero) {
        const motion: Motion = act ? act.motion : speed > 0.25 ? 'walk' : 'idle';
        animate(hero.rig, motion, motion === 'walk' ? stride : t, 0, ease);
        for (const f of hero.anim) f(t);
      }
      const nightNow = isNight(p.minute);
      for (const f of ticks) f(t, p.minute, nightNow);
      updateCats(t, dt);
      updateVacuum(t, dt);
      // Ученики смотрят на тренера и разминаются.
      const coach = p.scene === 'gym' ? { x: 0, z: 2.4 } : pos;
      for (const e of crew.values()) {
        e.root.position.set(e.spot.x, 0, e.spot.z);
        e.shadow.position.set(e.spot.x, 0.02, e.spot.z);
        const near = Math.hypot(pos.x - e.spot.x, pos.z - e.spot.z) < 3;
        const look = near ? pos : coach;
        const want = Math.atan2(look.x - e.spot.x, look.z - e.spot.z);
        let diff = want - e.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.root.rotation.y += diff * Math.min(1, dt * 3);
        if (e.parts) {
          // Разминка: время от времени лёгкие приседания или махи руками.
          const cycle = (t * 0.12 + e.seed) % 1;
          if (cycle < 0.18) animate(e.parts.rig, 'squat', t, ((cycle / 0.18) * 3) % 1);
          else if (cycle > 0.55 && cycle < 0.68) animate(e.parts.rig, 'jumping_jack', t, (((cycle - 0.55) / 0.13) * 3) % 1);
          else animate(e.parts.rig, 'idle', t + e.seed * 3);
          for (const f of e.parts.anim) f(t + e.seed);
        }
      }
      // Камера сверху-спереди, комната видна в разрезе.
      const gym = p.scene === 'gym';
      // Ближе — камера следует за героем плотнее, дальше — видна вся комната.
      const follow = 1 - 0.45 * Math.min(1, zoom);
      const want = new THREE.Vector3(pos.x * follow, 0.9 + ((gym ? 7.8 : 6.8) - 0.9) * zoom, pos.z + (gym ? 7.4 : 6.4) * zoom);
      camPos.lerp(want, Math.min(1, dt * 5));
      camera.position.copy(camPos);
      const lookF = 1 - 0.2 * Math.min(1, zoom);
      camera.lookAt(pos.x * lookF, 0.6 + 0.5 * Math.max(0, 1 - zoom), pos.z - 1.2 * Math.min(1, zoom));
      const light = daylight(p.minute);
      hemi.intensity = 0.6 + light * 0.45;
      sun.intensity = 0.7 + light * 1.1;
      // Свет из окон слева; тени падают вправо и к зрителю.
      sun.position.set(pos.x - 7, 10, pos.z + 3);
      // Ближайший предмет или кошка (во время действия — без изменений).
      let near: ObjectId | null = lastNear ?? null;
      if (!act && !exiting) {
        near = null;
        let best = REACH;
        for (const x of targets) {
          const d = dist(pos, x.pos);
          if (d < best) {
            best = d;
            near = x.id;
          }
        }
        for (const c of cats.values()) {
          const d = dist(pos, c.pos) + 0.25;
          if (d < Math.min(best, 1.4)) {
            best = d;
            near = 'cat';
          }
        }
      }
      if (p.catSpots) p.catSpots.current = [...cats.values()].map((c) => ({ ...c.pos }));
      if (near !== lastNear) {
        lastNear = near;
        p.onNear(near);
      }
      // Во время сборки — не больше ~20% времени на отрисовку.
      if (loading > 0 && now - lastRender < renderCost * 4) return;
      const r0 = performance.now();
      renderer.render(scene, camera);
      lastRender = now;
      renderCost = renderCost * 0.8 + (performance.now() - r0) * 0.2;
    };
    let lastRender = 0;
    let renderCost = 8;
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      clearTimeout(saveTimer);
      canvas.removeEventListener('webglcontextlost', onLost);
      api.current = null;
      disposeObject(scene);
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  // Перестройка сцены: другое место, мебель, уровень зала, смена дня и ночи.
  const night = isNight(props.minute);
  const sceneKey = JSON.stringify([props.scene, props.furniture, props.gym, night]);
  const firstScene = useRef(sceneKey);
  useEffect(() => {
    if (sceneKey === firstScene.current) return;
    firstScene.current = sceneKey;
    api.current?.rebuildScene();
  }, [sceneKey]);

  const heroKey = lookKey(props.hero);
  const firstHero = useRef(heroKey);
  useEffect(() => {
    if (heroKey === firstHero.current) return;
    firstHero.current = heroKey;
    api.current?.rebuildHero();
  }, [heroKey]);

  const catsKey = JSON.stringify(props.cats);
  useEffect(() => {
    api.current?.syncCats();
  }, [catsKey]);

  const clientsKey = JSON.stringify(props.clients.map((c) => [c.id, lookKey(c)]));
  useEffect(() => {
    api.current?.syncClients();
  }, [clientsKey]);

  return (
    <div ref={host} className="world3d">
      <div className="zoom-btns">
        <button className="btn ghost" aria-label="+" onClick={() => api.current?.zoomBy(1 / 1.25)}>
          ＋
        </button>
        <button className="btn ghost" aria-label="−" onClick={() => api.current?.zoomBy(1.25)}>
          −
        </button>
      </div>
      {!ready && (
        <div className="hero3d-busy">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
