import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { actionsAt } from '../../../game/life';
import { BOWL_MAX, GYMS } from '../../../game/lifeContent';
import { REACH, gymRect, houseRect, STICK_WALK, WALK_SPEED, bounds as sceneBounds, blocked, clientSpot, detourPoint, dist, freeSpot, gymGear, gymLayout, homeLayout, homeObstacles, resolve, spawn, stickSpeed, type Box, type GearKind, type P2, type Placed } from '../../../game/lifeMap';
import type { CatBreed, ObjectId, SceneId } from '../../../game/lifeTypes';
import { animFor } from './actionAnims';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { createCatLife, perchSpots, type CatAI, type CatHeroAct, type CatWorld, type Perch } from './catLife';
import { buildBowls, buildLitter } from './cats3d';
import { contactShadow, objectModel, parquetTexture, plasterTexture, ticksOf, type HomeAnim } from './homeModels';
import { M, mat, mesh } from './kit';
import { blobShadow, loadCharacter, lookKey, type Look, type Member } from './people';
import { prepareFists, showProps, tickProps, type PropKind } from './props3d';
import { animate, gaitFreq, seatOffsets, type Motion } from './rig';
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
  /** Купленные удобства зала. */
  gymExtras: string[];
  /** Ступень жилья. */
  house: number;
  minute: number;
  hero: Look;
  /** Ученики в зале (пусто, если зал закрыт или герой дома). */
  clients: Member[];
  /** Свои кошки (живут дома) и их потребности 0…100 (сытость, игра, туалет). */
  cats: Array<{ id: string; breed: CatBreed; fed?: number; play?: number; toilet?: number }>;
  /** Корм в миске (порций), вода в миске 0…100 и грязь в лотке 0…100. */
  pets?: { bowl: number; water: number; litter: number };
  /** Герой выполняет действие у предмета (анимация до результата). */
  perform: { key: number; action: string; at: ObjectId | null } | null;
  /** Куда сцена пишет, где сейчас кошки (для самостоятельного сима). */
  catSpots?: { current: P2[] };
  /** Куда сцена пишет, где герой (для самостоятельного сима). */
  heroAt?: { current: P2 };
  stick: { current: { x: number; y: number } };
  goto: { current: P2 | null };
  onNear(target: ObjectId | null): void;
  /** Игрок сам управляет героем (клавиши, касание пола) — сим перестаёт действовать сам. */
  onInput?(): void;
  /** Герой подошёл и занял место действия (отсюда считается его длительность). */
  onSettled?(key: number): void;
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

function gearModel(kind: GearKind, tier: number, premium = false): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'mat': {
      const colors = ['#2f6fb5', '#3a9d6a', '#8e44ad', '#d35400', '#c0392b'];
      // Мягкие коврики толще, со скруглённым краем и полосой.
      const h = premium ? 0.05 : 0.025;
      g.add(mesh(new THREE.BoxGeometry(0.72, h, 1.75), mat(colors[tier % colors.length]!, premium ? 0.75 : 0.95), [0, h / 2, 0]));
      if (premium) g.add(mesh(new THREE.BoxGeometry(0.06, 0.004, 1.7), mat('#ffffff', 0.6), [0.27, h + 0.002, 0]));
      break;
    }
    case 'ac': {
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.32, 0.24), mat('#f4f6f8', 0.4), [0, 2.85, 0.12]));
      for (let i = 0; i < 5; i += 1) g.add(mesh(new THREE.BoxGeometry(1.0, 0.012, 0.03), mat('#c9cfd5', 0.4), [0, 2.75 + i * 0.012, 0.245]));
      g.add(mesh(new THREE.CircleGeometry(0.012, 10), M.glow('#5bc8ff', 1.4), [0.45, 2.93, 0.242]));
      break;
    }
    case 'speakers': {
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.6, 0.32), mat('#15171b', 0.5), [0, 2.55, 0.18]));
      for (const y of [2.42, 2.68]) g.add(mesh(new THREE.CylinderGeometry(y > 2.5 ? 0.06 : 0.12, y > 2.5 ? 0.06 : 0.12, 0.02, 20), mat('#2d3036', 0.4, 0.4), [0, y, 0.345]).rotateX(Math.PI / 2));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.25, 0.3), M.darkSteel(), [0, 2.15, 0.16]));
      break;
    }
    case 'lightpanels': {
      for (const x of [-4.5, -1.5, 1.5, 4.5]) for (const z of [-2.5, 1]) g.add(mesh(new THREE.BoxGeometry(1.6, 0.04, 0.5), M.glow('#ffffff', 1.6), [x, 3.32, z]));
      break;
    }
    case 'greenwall': {
      g.add(mesh(new THREE.BoxGeometry(3.2, 1.7, 0.08), mat('#4a3a2a', 0.9), [0, 2.05, 0.04]));
      const leaf = mat('#3f8f3a', 0.7);
      const leaf2 = mat('#5aa84a', 0.7);
      for (let i = 0; i < 70; i += 1) {
        const x = -1.5 + ((i * 37) % 100) / 100 * 3.0;
        const y = 1.3 + ((i * 53) % 100) / 100 * 1.5;
        g.add(mesh(new THREE.SphereGeometry(0.09 + (i % 3) * 0.025, 8, 6), i % 2 ? leaf : leaf2, [x, y, 0.1], [1.2, 0.9, 0.6]));
      }
      break;
    }
    case 'cooler': {
      g.add(mesh(new THREE.BoxGeometry(0.34, 1.0, 0.34), mat('#f4f6f8', 0.4), [0, 0.5, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 18), mat('#9fd0ee', 0.05, 0, { transparent: true, opacity: 0.6 }), [0, 1.22, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), mat('#3a7bd5', 0.4), [-0.07, 0.75, 0.18]), mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), mat('#d0312d', 0.4), [0.07, 0.75, 0.18]));
      break;
    }
    case 'lockers': {
      const colors = ['#2f6fb5', '#3a9d6a', '#e85d2a', '#8e44ad'];
      for (let i = 0; i < 5; i += 1) {
        const x = -0.8 + i * 0.4;
        g.add(mesh(new THREE.BoxGeometry(0.38, 1.8, 0.45), mat(colors[i % colors.length]!, 0.5, 0.2), [x, 0.9, 0]));
        g.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), M.chrome(), [x + 0.12, 1.0, 0.235]));
        for (const y of [1.6, 1.65, 1.7]) g.add(mesh(new THREE.BoxGeometry(0.22, 0.012, 0.01), mat('#1b1d21', 0.6), [x, y, 0.228]));
      }
      break;
    }
    case 'sauna': {
      const wood = M.wood('#b98a5a', 1, 2);
      g.add(mesh(new THREE.BoxGeometry(1.6, 2.2, 1.4), wood, [0, 1.1, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.6, 1.8, 0.04), mat('#d8b07a', 0.25, 0, { transparent: true, opacity: 0.55 }), [0.3, 0.95, 0.71]));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.25, 0.04), M.chrome(), [0.05, 0.95, 0.74]));
      g.add(mesh(new THREE.PlaneGeometry(0.5, 0.18), M.glow('#ff9a3d', 0.8), [-0.45, 1.9, 0.705]));
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
/** Миски и лоток кошек в сцене (обновляются по состоянию: корм и грязь). */
interface PetModels {
  setFood(k: number): void;
  setWater(k: number): void;
  setDirt(k: number): void;
  surface: number;
}

function addPlaced(g: THREE.Group, placed: ReadonlyArray<Placed & { y?: number }>, pets?: { current: PetModels | null }): void {
  for (const p of placed) {
    if (p.id === 'cat_bowl' || p.id === 'litter') {
      // Кошачье хозяйство — свои модели (миски, лоток с наполнителем).
      const prev = pets?.current;
      const made = p.id === 'cat_bowl' ? buildBowls() : buildLitter();
      made.group.position.set(p.pos.x, 0, p.pos.z);
      made.group.rotation.y = p.rot;
      g.add(made.group);
      if (pets) {
        pets.current = {
          setFood: 'setFood' in made ? made.setFood : (prev?.setFood ?? (() => {})),
          setWater: 'setWater' in made ? made.setWater : (prev?.setWater ?? (() => {})),
          setDirt: 'setDirt' in made ? made.setDirt : (prev?.setDirt ?? (() => {})),
          surface: 'surface' in made ? made.surface : (prev?.surface ?? 0.07),
        };
      }
      continue;
    }
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

function house(placed: Array<Placed & { y?: number }>, night: boolean, pets: { current: PetModels | null }, tier: number): THREE.Group {
  const g = new THREE.Group();
  // Дом растёт влево и к зрителю — комната не по центру координат.
  const { w, d, L, R, B, cx, cz } = houseRect(tier);
  const pq = parquetTexture();
  const floorMat = mat('#ffffff', 0.62);
  if (pq) {
    const t = pq.clone();
    t.repeat.set(w / 1.2, d / 1.2);
    t.needsUpdate = true;
    floorMat.map = t;
  } else floorMat.color.set('#b88a5e');
  const floor = mesh(new THREE.PlaneGeometry(w, d), floorMat, [cx, 0, cz]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  const wallsG = walls(w, d, '#ece4d6', 3, '#d8cbb6');
  wallsG.position.set(cx, 0, cz);
  g.add(floor, wallsG);
  // Кухонная зона: плитка на полу и фартук на стене.
  const tiles = mesh(new THREE.PlaneGeometry(3.4, 2.6), mat('#d9d4cc', 0.35), [R - 1.7, 0.004, B + 1.3]);
  tiles.rotation.x = -Math.PI / 2;
  tiles.receiveShadow = true;
  g.add(tiles);
  g.add(mesh(new THREE.PlaneGeometry(3.3, 0.7), mat('#a7c7d9', 0.25), [R - 1.7, 1.25, B + 0.02]));
  // Окна на левой стене (в большом доме — больше окон).
  const winZ = tier >= 2 ? [-3.6, 2.2, 6.4] : [-3.6, 2.2];
  for (const z of winZ) g.add(sideWindow(L + 0.01, z, -1, night));
  // Ковёр у дивана: овал с каймой.
  const rug = mesh(new THREE.CircleGeometry(1.4, 48), M.cloth('#a24b45', 3), [0.4, 0.008, -0.2]);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.5, 1.05, 1);
  rug.receiveShadow = true;
  const rim = mesh(new THREE.RingGeometry(1.25, 1.4, 48), M.cloth('#e3c7a0', 3), [0.4, 0.01, -0.2]);
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1.5, 1.05, 1);
  g.add(rug, rim);
  addPlaced(g, placed, pets);
  // Потолочные светильники: днём слабее, вечером теплее и ярче.
  const lamps: Array<[number, number]> = [[-3.5, -1], [3.5, -1], [0, 2.8]];
  if (tier >= 1) lamps.push([L + 3.5, 1.5]);
  if (tier >= 3) lamps.push([L + 3.5, 6]);
  for (const [x, z] of lamps) {
    const lamp = new THREE.PointLight('#ffd9a0', night ? 9 : 2.5, 11, 1.7);
    lamp.position.set(x, 2.85, z);
    g.add(lamp);
  }
  return g;
}

function gymRoom(tier: number, placed: Placed[], night: boolean, extras: readonly string[]): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = gymRect(tier);
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
  const premium = extras.includes('gym_mats');
  for (const x of gymGear(tier, extras)) {
    const m = gearModel(x.kind, tier, premium);
    m.position.set(x.pos.x, 0, x.pos.z);
    m.rotation.y = x.rot;
    g.add(m);
  }
  addPlaced(g, placed);
  for (const x of [-4, 4]) {
    const lamp = new THREE.PointLight('#fff4e0', 9 + tier * 2 + (extras.includes('gym_lights') ? 5 : 0), 16, 1.6);
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
    let catBoxes: Box[] = [];
    const petModels: { current: PetModels | null } = { current: null };
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
      petModels.current = null;
      if (p.scene === 'home') {
        const placed = homeLayout(p.furniture, p.cats.length > 0, p.house);
        world.add(house(placed, night, petModels, p.house));
        boxes = [...placed.map((x) => x.box).filter((b): b is Box => b !== null), ...homeObstacles()];
        // Кошки подходят к мискам и лотку вплотную — для них это не препятствия.
        catBoxes = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter').map((x) => x.box).filter((b): b is Box => b !== null), ...homeObstacles()];
        placedNow = placed;
      } else {
        const def = GYMS[tier]!;
        const placed = gymLayout(def.shower, def.bar, tier);
        world.add(gymRoom(tier, placed, night, p.gymExtras));
        boxes = [...placed.map((x) => x.box), ...gymGear(tier, p.gymExtras).map((x) => x.box)].filter((b): b is Box => b !== null);
        catBoxes = boxes;
        placedNow = placed;
      }
      bounds = sceneBounds(p.scene, p.scene === 'home' ? p.house : tier);
      perches = perchSpots(placedNow, bounds, catBoxes);
      // Подойти можно только к предметам с действиями (декор просто украшает).
      targets = placedNow.filter((x) => actionsAt(x.id).length > 0).map((x) => ({ id: x.id, pos: x.use, obj: x }));
      ticks = ticksOf(world);
      sun.position.set(-9, 10, 3);
      ground = world.getObjectByName('ground') ?? null;
      // Новое место — герой у двери; та же сцена — остаётся где был.
      if (builtScene !== p.scene) {
        builtScene = p.scene;
        const sp = spawn(p.scene, p.scene === 'home' ? p.house : tier);
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

    // Текущее действие героя (объявлено до кошек: они на него реагируют).
    let act: Acting | null = null;

    // ── Кошки: живут своей жизнью по потребностям (см. catLife.ts). ──
    const catLife = createCatLife(scene, () => blobShadow(0.55));
    const cats = catLife.cats;
    let perches: Perch[] = [];
    let vacRand = 777;
    const catRand = (): number => {
      vacRand = (vacRand * 1103515245 + 12345) & 0x7fffffff;
      return vacRand / 0x7fffffff;
    };
    /** Что кошки знают о доме в этот кадр (один объект на всё время — без мусора в кадре). */
    const catAct: CatHeroAct = { key: 0, motion: 'idle', cat: null, settledAt: null, at: { x: 0, z: 0 } };
    const world0: CatWorld = {
      bounds,
      boxes: catBoxes,
      perches,
      litterSurface: 0.07,
      hero: pos,
      act: null,
      pets: { bowl: BOWL_MAX, water: 100, litter: 0 },
      need: (id) => {
        const c = propsRef.current.cats.find((x) => x.id === id);
        return { fed: c?.fed ?? 80, play: c?.play ?? 70, toilet: c?.toilet ?? 90 };
      },
    };
    const catWorld = (): CatWorld => {
      const p = propsRef.current;
      world0.bounds = bounds;
      world0.boxes = catBoxes;
      world0.perches = perches;
      world0.litterSurface = petModels.current?.surface ?? 0.07;
      world0.pets = p.pets ?? world0.pets;
      if (act) {
        catAct.key = act.key;
        catAct.motion = act.motion;
        catAct.cat = act.cat;
        catAct.settledAt = act.settle && !act.approach ? act.settle.at : null;
        catAct.at = act.anchor;
        world0.act = catAct;
      } else world0.act = null;
      return world0;
    };
    const syncCats = (): void => {
      const p = propsRef.current;
      catLife.sync(p.scene === 'home' ? p.cats : [], catWorld());
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
    /** Разминка и упражнения учеников: [движение, повторов, длительность повтора (с)]. */
    const DRILLS: ReadonlyArray<[Motion, number, number]> = [
      ['squat', 6, 2.2],
      ['stand:stretch', 1, 6],
      ['jumping_jack', 10, 0.9],
      ['lunge', 6, 2.3],
      ['stand:circles', 4, 1.5],
      ['high_knees', 12, 0.7],
      ['pushup', 5, 2.2],
      ['situp', 6, 2.0],
    ];
    const REST = 1.2;
    const lens = DRILLS.map(([, n, d]) => n * d + REST);
    const total = lens.reduce((a, x) => a + x, 0);
    /** Что ученик делает в момент t: упражнение и фаза повтора (подходы по кругу без простоя). */
    const crewSet = (e: Crew, t: number): { motion: Motion; phase: number } => {
      // Свой порядок: сдвиг по кругу и своя скорость (±10%).
      const tt = (t * (0.92 + ((e.seed * 7.3) % 0.16)) + e.seed * 37) % total;
      const start = Math.floor(e.seed * 3.1) % DRILLS.length;
      let acc = 0;
      for (let k = 0; k < DRILLS.length; k += 1) {
        const i = (start + k) % DRILLS.length;
        const len = lens[i]!;
        if (tt < acc + len) {
          const [m, n, d] = DRILLS[i]!;
          const x = tt - acc;
          if (x > n * d) return { motion: 'idle', phase: 0 };
          return { motion: m, phase: (x / d) % 1 };
        }
        acc += len;
      }
      return { motion: 'idle', phase: 0 };
    };
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
        // Сжатие кистей для предметов в руках — заранее, чтобы не тормозить в начале действия.
        prepareFists(hero.rig);
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
    /** С Shift клавишами — бегом, без него — шагом. */
    let runKey = false;
    const onKey = (e: KeyboardEvent): void => {
      runKey = e.shiftKey;
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

    // ── Действие героя: подходит шагом, плавно занимает место (садится, ложится), берёт
    //    предметы в руки, после действия так же плавно встаёт и убирает их. ──
    interface Acting {
      key: number;
      motion: Motion;
      anchor: P2;
      y: number;
      face: number;
      cat: string | null;
      /** Куда сначала подойти шагом (null — уже на месте). */
      approach: P2 | null;
      /** Потом — последние шаги к месту стоя мимо препятствий (к дивану вплотную), null — уже там. */
      inTo: P2 | null;
      /** Где стоят стопы перед посадкой (у поз сидя — впереди места, иначе само место). */
      stand: P2;
      /** Свободная точка рядом с местом: отсюда подходит, сюда отходит после действия. */
      free: P2;
      /** Садится (посадка с неподвижными стопами), а не устраивается плавным переходом. */
      sit: boolean;
      /**
       * Начало «устраивания» на месте: откуда, с какой высоты и поворота, сколько длится
       * поворот перед посадкой и началась ли посадка.
       */
      settle: { at: number; from: P2; fromY: number; fromFace: number; turn: number; down: boolean } | null;
      props: PropKind[] | undefined;
    }
    /**
     * После действия: встаёт (up — ход 1…0 посадки или плавный переход в стойку за rise с), затем
     * шагом отходит к свободной точке (out).
     */
    let exiting: { at: number; from: P2; fromY: number; motion: Motion; sit: boolean; rise: number; stand: P2; to: P2; out: boolean } | null = null;
    let heroY = 0;
    const SETTLE = 0.75;
    /** Посадка и вставание (с). */
    const SIT = 1.0;
    /** Встать из позы лёжа (с переходом на край кровати) и из позы стоя или присев. */
    const EXIT_LIE = 0.6;
    const EXIT_STAND = 0.35;
    /** Ход посадки в этом кадре (для анимации). */
    let seatK = 1;
    const nearestCat = (): CatAI | null => catLife.nearest(pos);
    const startPerform = (pf: { key: number; action: string; at: ObjectId | null }): void => {
      const spec = animFor(pf.action);
      const here = { x: pos.x, z: pos.z };
      const placed = placedNow.find((x) => x.id === pf.at);
      const base = { key: pf.key, y: 0, cat: null, approach: null, inTo: null, sit: false, settle: null, props: spec?.prop };
      if (!spec) {
        act = { ...base, motion: 'stand:none', anchor: here, stand: here, free: here, face: facing };
        return;
      }
      if (spec.place === 'here') {
        // На месте; зовёт кошку — лицом к ближайшей.
        const c = spec.motion === 'crouch:call' ? nearestCat() : null;
        act = { ...base, motion: spec.motion, anchor: here, stand: here, free: here, face: c ? Math.atan2(c.pos.x - pos.x, c.pos.z - pos.z) : facing };
        return;
      }
      if (spec.place === 'cat') {
        const best = nearestCat();
        if (!best) {
          act = { ...base, motion: spec.motion, anchor: here, stand: here, free: here, face: facing };
          return;
        }
        // Кошка на мебели — спрыгивает к герою; дальше ждёт его на полу.
        const cp = catLife.claim(best, catWorld());
        const dx = pos.x - cp.x;
        const dz = pos.z - cp.z;
        const d = Math.hypot(dx, dz) || 1;
        const anchor = resolve({ x: cp.x + (dx / d) * 0.55, z: cp.z + (dz / d) * 0.55 }, bounds, boxes);
        act = { ...base, motion: spec.motion, anchor, stand: anchor, free: anchor, face: Math.atan2(cp.x - anchor.x, cp.z - anchor.z), cat: best.id, approach: anchor };
        return;
      }
      if (!placed) {
        act = { ...base, motion: spec.motion, anchor: here, stand: here, free: here, face: facing };
        return;
      }
      if (spec.place === 'front') {
        act = { ...base, motion: spec.motion, anchor: { ...placed.use }, stand: { ...placed.use }, free: { ...placed.use }, face: Math.atan2(placed.pos.x - placed.use.x, placed.pos.z - placed.use.z), approach: { ...placed.use } };
        return;
      }
      const [lx, lz] = spec.at ?? [0, 0];
      const c = Math.cos(placed.rot);
      const sn = Math.sin(placed.rot);
      const anchor = { x: placed.pos.x + lx * c + lz * sn, z: placed.pos.z - lx * sn + lz * c };
      const face = placed.rot + (spec.face ?? 0);
      const sit = spec.motion.startsWith('sit:');
      const lie = spec.motion.startsWith('lie:');
      // Сидя стопы впереди таза: встаёт перед местом так, чтобы сесть, не сдвигая стоп. Там
      // мебель (стол, ванна) — встаёт там, где окажется таз, и стопы при посадке уходят вперёд.
      let stand: P2 = anchor;
      if (sit && hero) {
        const o = seatOffsets(hero.rig);
        const at = (k: number): P2 => ({ x: anchor.x + Math.sin(face) * k, z: anchor.z + Math.cos(face) * k });
        stand = [at(o.feet), at(o.hips)].find((q) => !blocked(q, boxes, 0.12)) ?? anchor;
      }
      // Место на предмете (диван, кровать): шагом к свободной точке рядом, потом вплотную.
      const free = freeSpot(lie ? anchor : stand, placed.use, bounds, boxes);
      const far = dist(pos, stand) > dist(free, stand) + 0.1;
      act = { ...base, motion: spec.motion, anchor, stand, free, sit, y: spec.y ?? 0, face, approach: far ? free : null, inTo: lie || dist(far ? free : pos, stand) < 0.03 ? null : stand };
    };
    const angleTo = (from: number, to: number): number => {
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const smooth01 = (x: number): number => {
      const k = Math.max(0, Math.min(1, x));
      return k * k * (3 - 2 * k);
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
    let cycle = 0;
    let lean = 0;
    let walkBlend = 0;
    /** Обход мебели по пути к цели: промежуточная точка, для какой цели и сколько раз уже обходил. */
    let via: P2 | null = null;
    const detourFor: P2 = { x: Infinity, z: Infinity };
    let detours = 0;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      const p = propsRef.current;
      const t = now / 1000;
      const ease = 1 - Math.exp(-dt * 10);
      // ── Действие у предмета: герой подходит, занимает место и играет анимацию ──
      const pf = p.perform;
      if (pf && (!act || act.key !== pf.key)) {
        exiting = null;
        startPerform(pf);
      }
      if (!pf && act) {
        // Действие кончилось: встаёт (сидя — обратной посадкой), предметы убирает и шагом
        // отходит от мебели. Не дошёл до места — просто идёт дальше.
        const seated = act.sit && Boolean(act.settle?.down);
        const placed = Boolean(act.settle);
        exiting = !placed ? null : {
          at: t,
          from: { x: pos.x, z: pos.z },
          fromY: heroY,
          motion: act.motion,
          sit: seated,
          rise: seated ? SIT * seatK : act.motion.startsWith('lie:') ? EXIT_LIE : EXIT_STAND,
          stand: seated ? act.stand : act.motion.startsWith('lie:') ? act.free : { x: pos.x, z: pos.z },
          to: act.free,
          out: false,
        };
        if (hero) showProps(hero.rig, null);
        act = null;
      }
      // Управление: стик и клавиши (во время действия — нет), иначе идёт к цели касания или подхода.
      let dx = 0;
      let dz = 0;
      if (!act && !exiting) {
        dx = p.stick.current.x;
        dz = -p.stick.current.y;
        if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) dz -= 1;
        if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) dz += 1;
        if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright') || keys.has('в')) dx += 1;
      }
      let mag = Math.min(1, Math.hypot(dx, dz));
      if (keys.size > 0 && !runKey) mag = Math.min(mag, STICK_WALK);
      // Стиком — шаг или (до упора) бег трусцой, сам (к цели касания, к предмету) сим идёт шагом.
      let pace = stickSpeed(mag);
      if (mag > 0.05) {
        // Игрок держит управление — сим не перехватывает.
        p.goto.current = null;
        p.onInput?.();
      }
      // Последние шаги к месту и от него — напрямую, мимо препятствий (место у самой мебели).
      const ghost = act ? !act.approach && act.inTo : exiting?.out ? exiting.to : null;
      const target = act ? (act.approach ?? act.inTo) : exiting ? (exiting.out ? exiting.to : null) : p.goto.current;
      // Новая цель — обходы мебели считаются заново.
      if (!target) via = null;
      else if (Math.hypot(target.x - detourFor.x, target.z - detourFor.z) > 0.5) {
        detourFor.x = target.x;
        detourFor.z = target.z;
        via = null;
        detours = 0;
      }
      const aim = via ?? target;
      if (mag <= 0.05 && aim) {
        const gx = aim.x - pos.x;
        const gz = aim.z - pos.z;
        const d = Math.hypot(gx, gz);
        if (d < (via ? 0.2 : ghost ? 0.02 : act ? 0.1 : 0.25)) {
          if (via) via = null;
          else if (act && act.approach) act.approach = null;
          else if (act) act.inTo = null;
          else if (exiting) exiting = null;
          else p.goto.current = null;
        } else {
          dx = gx / d;
          dz = gz / d;
          mag = Math.min(1, d / 1.2 + 0.15);
          pace = WALK_SPEED * mag;
        }
      }
      speed += ((mag > 0.05 ? pace : 0) - speed) * Math.min(1, dt * (mag > 0.05 ? 6 : 9));
      const before = facing;
      if (mag > 0.05) facing += angleTo(facing, Math.atan2(dx, dz)) * Math.min(1, dt * 9);
      seatK = 1;
      if (act && !act.approach && !act.inTo) {
        // Устраивается на месте: поворачивается и садится (стопы на месте), ложится или
        // встаёт к делу — плавно, не скользя.
        if (!act.settle) {
          const turn = Math.abs(angleTo(facing, act.face));
          act.settle = { at: t, from: { x: pos.x, z: pos.z }, fromY: heroY, fromFace: facing, turn: act.sit ? 0.2 + (0.4 * turn) / Math.PI : 0, down: !act.sit };
          if (hero) showProps(hero.rig, act.props, act.motion);
          if (!act.sit) p.onSettled?.(act.key);
        }
        const st = act.settle;
        if (act.sit) {
          // Сначала поворот спиной к месту, потом посадка: тело уходит назад на место ровно
          // настолько, насколько стопы в позе сидя впереди, — стопы стоят.
          facing = st.fromFace + angleTo(st.fromFace, act.face) * smooth01((t - st.at) / Math.max(0.01, st.turn));
          seatK = Math.max(0, Math.min(1, (t - st.at - st.turn) / SIT));
          if (seatK > 0 && !st.down) {
            st.down = true;
            p.onSettled?.(act.key);
          }
          const k = smooth01(seatK);
          pos.x = st.from.x + (act.anchor.x - st.from.x) * k;
          pos.z = st.from.z + (act.anchor.z - st.from.z) * k;
          heroY = st.fromY + (act.y - st.fromY) * k;
        } else {
          const k = smooth01((t - st.at) / SETTLE);
          pos.x = st.from.x + (act.anchor.x - st.from.x) * k;
          pos.z = st.from.z + (act.anchor.z - st.from.z) * k;
          heroY = st.fromY + (act.y - st.fromY) * smooth01((t - st.at - SETTLE * 0.25) / (SETTLE * 0.75));
          facing = st.fromFace + angleTo(st.fromFace, act.face) * smooth01((t - st.at) / (SETTLE * 0.6));
        }
        speed = 0;
      } else if (exiting && !exiting.out) {
        // Встаёт: сидя — посадка в обратную сторону (стопы на месте), из кровати — на край.
        const k = exiting.rise > 0 ? Math.min(1, (t - exiting.at) / exiting.rise) : 1;
        if (exiting.sit) seatK = (1 - k) * (exiting.rise / SIT);
        const e = exiting.sit ? 1 - smooth01(seatK) / Math.max(1e-3, smooth01(exiting.rise / SIT)) : smooth01(k);
        heroY = exiting.fromY * (1 - e);
        pos.x = exiting.from.x + (exiting.stand.x - exiting.from.x) * e;
        pos.z = exiting.from.z + (exiting.stand.z - exiting.from.z) * e;
        speed = 0;
        if (k >= 1) {
          heroY = 0;
          // Отходит от мебели шагом (если стоит у неё вплотную).
          if (dist(pos, exiting.to) > 0.03) exiting.out = true;
          else exiting = null;
        }
      } else if (ghost && speed > 0.01) {
        // Вплотную к месту и обратно — по прямой к точке.
        const gx = ghost.x - pos.x;
        const gz = ghost.z - pos.z;
        const d = Math.hypot(gx, gz);
        const step = Math.min(d, speed * dt);
        if (d > 1e-6) {
          pos.x += (gx / d) * step;
          pos.z += (gz / d) * step;
        }
      } else if (speed > 0.01) {
        const next = resolve({ x: pos.x + Math.sin(facing) * speed * dt, z: pos.z + Math.cos(facing) * speed * dt }, bounds, boxes);
        const moved = Math.hypot(next.x - pos.x, next.z - pos.z);
        // Упёрся в мебель — обходит её (несколько попыток), иначе дальше не идёт (цель касания сбрасывается).
        if (moved < speed * dt * 0.2) {
          const goal = act ? act.approach : p.goto.current;
          const alt = goal && detours < 6 ? detourPoint(pos, goal, bounds, boxes) : null;
          if (alt) {
            via = alt;
            detours += 1;
          } else if (act) {
            // Не пройти — устраивается отсюда; далеко от места — без шагов сквозь мебель.
            act.approach = null;
            if (dist(pos, act.stand) > 1.5) act.inTo = null;
          } else if (p.goto.current) p.goto.current = null;
        }
        speed = Math.min(speed, moved / Math.max(dt, 1e-3) + 0.3);
        pos.x = next.x;
        pos.z = next.z;
      }
      // Наклон в повороте на ходу.
      const turn = angleTo(before, facing) / Math.max(dt, 1e-3);
      lean += (Math.max(-0.14, Math.min(0.14, -turn * speed * 0.02)) - lean) * Math.min(1, dt * 6);
      heroRoot.position.set(pos.x, heroY, pos.z);
      heroRoot.rotation.set(0, facing, 0);
      shadow.position.set(pos.x, 0.02, pos.z);
      shadow.visible = heroY < 0.3;
      if (hero) {
        const posed = act && !act.approach && !act.inTo;
        const rising = exiting && !exiting.out;
        if (posed) animate(hero.rig, act!.motion, t, 0, 1 - Math.exp(-dt * (act!.sit ? 12 : 6)), act!.sit ? { settle: seatK } : undefined);
        else if (rising && exiting!.sit) animate(hero.rig, exiting!.motion, t, 0, 1 - Math.exp(-dt * 12), { settle: seatK });
        else if (speed > 0.06 && !rising) {
          // Шаг: фаза копится по частоте шагов для этой скорости — стопы не скользят.
          cycle = (cycle + dt * gaitFreq(hero.rig, speed, cycle)) % 1;
          animate(hero.rig, 'walk', t, cycle, walkBlend < 1 ? 1 - Math.exp(-dt * 12) : 1, { speed, lean });
          walkBlend = Math.min(1, walkBlend + dt * 4);
        } else {
          animate(hero.rig, 'idle', t, 0, ease);
          walkBlend = 0;
        }
        tickProps(hero.rig, dt, t);
        for (const f of hero.anim) f(t);
      }
      const nightNow = isNight(p.minute);
      for (const f of ticks) f(t, p.minute, nightNow);
      catLife.update(t, dt, catWorld());
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
          // Ученики всё время заняты: подходы разных упражнений подряд с короткой паузой
          // и плавными переходами (у каждого свой порядок и темп).
          const set = crewSet(e, t);
          animate(e.parts.rig, set.motion, t + e.seed * 3, set.phase, 1 - Math.exp(-dt * 7));
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
      if (p.heroAt) {
        p.heroAt.current.x = pos.x;
        p.heroAt.current.z = pos.z;
      }
      // Где кошки (ближайшая — первой) — для самостоятельного сима (раз в 0,2 с, без мусора в каждом кадре).
      if (p.catSpots && t - spotsAt > 0.2) {
        spotsAt = t;
        p.catSpots.current = [...cats.values()].sort((a, b) => dist(pos, a.pos) - dist(pos, b.pos)).map((c) => ({ ...c.pos }));
      }
      // Миска и лоток показывают состояние: сколько корма и грязи.
      if (petModels.current && p.pets) {
        petModels.current.setFood(p.pets.bowl / BOWL_MAX);
        petModels.current.setWater(p.pets.water / 100);
        petModels.current.setDirt(p.pets.litter / 100);
      }
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
    let spotsAt = -1;
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
  const sceneKey = JSON.stringify([props.scene, props.furniture, props.gym, props.gymExtras, props.house, night, props.cats.length > 0]);
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

  const catsKey = JSON.stringify(props.cats.map((c) => [c.id, c.breed]));
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
