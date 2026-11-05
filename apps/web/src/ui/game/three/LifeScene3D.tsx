import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import { LOCATIONS, LOCATION_IDS } from '../../../game/lifeContent';
import { CITY_BOUNDS, CITY_BOXES, FACADE_Z, REACH, ROOM, dist, doorPos, homeBounds, homeLayout, resolve, spawn, type Box, type P2, type Placed } from '../../../game/lifeMap';
import type { HomeId, LocationId, ObjectId, PersonId, SceneId } from '../../../game/lifeTypes';
import { rng } from '../../../game/random';
import type { Appearance } from '../../../game/state';
import { prepare } from './anatomy';
import { buildCharacter, disposeObject, garmentsFor, type CharacterParts } from './buildCharacter';
import { loadHairTexture } from './hairMesh';
import { M, mat, mesh } from './kit';
import { createStudio, setupRenderer } from './studio';

/**
 * 3D-сцены симулятора жизни: квартира в разрезе (без передней стены) и улица города
 * с фасадами мест. Герой ходит джойстиком, клавишами или по касанию пола; рядом с
 * предметом, дверью или жителем сцена сообщает, с чем можно взаимодействовать.
 * Свет зависит от игрового времени: день, закат, ночь с горящими окнами и фонарями.
 */

export type NearTarget = { kind: 'object'; id: ObjectId } | { kind: 'location'; id: LocationId } | { kind: 'person'; id: PersonId; at: LocationId };

export interface Look {
  color: string;
  appearance: Appearance;
  equipped: Partial<Record<Slot, string>>;
}

export interface ScenePerson extends Look {
  id: PersonId;
  at: LocationId;
  spot: P2;
}

export interface LifeScene3DProps {
  scene: SceneId;
  home: HomeId;
  furniture: ObjectId[];
  minute: number;
  hero: Look;
  people: ScenePerson[];
  /** Надписи на вывесках (язык интерфейса). */
  signs: Record<LocationId, string>;
  stick: { current: { x: number; y: number } };
  goto: { current: P2 | null };
  onNear(target: NearTarget | null): void;
  onFail(): void;
}

// ─── Квартира ──────────────────────────────────────────────────────────

const wood = (c = '#8a5a30'): THREE.Material => M.wood(c, 1, 2);
const paint = (c: string, r = 0.8): THREE.Material => mat(c, r);

/** Модель предмета (лицевая сторона — к +Z). */
function objectModel(id: ObjectId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'bed': {
      g.add(mesh(new THREE.BoxGeometry(2, 0.4, 2.6), wood('#6b4428'), [0, 0.2, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.9, 0.22, 2.45), paint('#f2f0ea', 0.9), [0, 0.5, 0.05]));
      g.add(mesh(new THREE.BoxGeometry(1.92, 0.12, 1.6), M.cloth('#5b7fb3', 4), [0, 0.64, 0.45]));
      g.add(mesh(new THREE.BoxGeometry(0.75, 0.16, 0.45), paint('#ffffff', 0.9), [-0.45, 0.68, -0.9]), mesh(new THREE.BoxGeometry(0.75, 0.16, 0.45), paint('#ffffff', 0.9), [0.45, 0.68, -0.9]));
      g.add(mesh(new THREE.BoxGeometry(2.1, 1.1, 0.12), wood('#5a3a22'), [0, 0.75, -1.3]));
      break;
    }
    case 'sofa': {
      const c = M.cloth('#7d8b99', 5);
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.45, 0.95), c, [0, 0.25, 0]));
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.6, 0.25), c, [0, 0.65, -0.38]));
      for (const x of [-1.15, 1.15]) g.add(mesh(new THREE.BoxGeometry(0.22, 0.5, 0.95), c, [x, 0.5, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.7), wood('#a0784a'), [0, 0.32, 1.0]));
      // Телевизор напротив дивана (на стене перед ним).
      const tv = new THREE.Group();
      tv.add(mesh(new THREE.BoxGeometry(1.6, 0.5, 0.45), wood('#3a2a1e'), [0, 0.25, 0]));
      tv.add(mesh(new THREE.BoxGeometry(1.5, 0.85, 0.06), paint('#111316', 0.3), [0, 0.95, 0]));
      tv.add(mesh(new THREE.PlaneGeometry(1.4, 0.76), M.glow('#3a6ea5', 0.5), [0, 0.95, 0.035]));
      tv.position.z = 2.9;
      tv.rotation.y = Math.PI;
      g.add(tv);
      break;
    }
    case 'fridge': {
      g.add(mesh(new THREE.BoxGeometry(0.85, 1.9, 0.75), paint('#e8ecef', 0.35), [0, 0.95, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), M.steel(), [0.33, 1.3, 0.39]), mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), M.steel(), [0.33, 0.55, 0.39]));
      g.add(mesh(new THREE.BoxGeometry(0.86, 0.02, 0.02), paint('#9aa3ad'), [0, 0.95, 0.38]));
      break;
    }
    case 'stove': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.9, 0.7), paint('#d9dde1', 0.4), [0, 0.45, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.04, 0.7), paint('#1b1d21', 0.2), [0, 0.92, 0]));
      for (const [x, z] of [[-0.25, -0.15], [0.25, -0.15], [-0.25, 0.15], [0.25, 0.15]] as const) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20), paint('#444'));
        r.rotation.x = Math.PI / 2;
        r.position.set(x, 0.95, z);
        g.add(r);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.12, 16), M.steel(), [0.25, 1.01, -0.15]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.7, 0.4), paint('#cfd5da', 0.5), [0, 1.9, -0.15]));
      break;
    }
    case 'shower': {
      const glass = mat('#bfe6ff', 0.05, 0, { transparent: true, opacity: 0.28, depthWrite: false });
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), paint('#f4f6f8', 0.3), [0, 0.06, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.3, 2.1, 0.03), glass, [0, 1.1, 0.65]), mesh(new THREE.BoxGeometry(0.03, 2.1, 1.3), glass, [-0.65, 1.1, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), M.chrome(), [0.55, 1.1, -0.55]));
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 16), M.chrome(), [0.45, 2.05, -0.45]));
      break;
    }
    case 'mirror': {
      g.add(mesh(new THREE.BoxGeometry(0.85, 1.7, 0.06), wood('#c9a66b'), [0, 1.15, 0]));
      g.add(mesh(new THREE.PlaneGeometry(0.72, 1.55), mat('#cfe3f2', 0.02, 1), [0, 1.15, 0.035]));
      break;
    }
    case 'door': {
      g.add(mesh(new THREE.BoxGeometry(1.1, 2.2, 0.08), wood('#7a4e2d'), [0, 1.1, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.gold(), [0.4, 1.05, 0.06]));
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.08, 0.12), wood('#5a3a22'), [0, 2.24, 0]));
      break;
    }
    case 'computer': {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.05, 0.65), wood('#c9a66b'), [0, 0.75, 0]));
      for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.75, 0.6), wood('#a0784a'), [x, 0.375, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.42, 0.04), paint('#15171b', 0.3), [0, 1.05, -0.15]));
      g.add(mesh(new THREE.PlaneGeometry(0.64, 0.36), M.glow('#5fb3ff', 0.6), [0, 1.05, -0.128]));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), paint('#2a2d33'), [0, 0.79, 0.12]));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.08, 16), paint('#2a2d33'), [0, 0.45, 0.6]), mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), paint('#2a2d33'), [0, 0.75, 0.82]));
      break;
    }
    case 'bookshelf': {
      g.add(mesh(new THREE.BoxGeometry(1.1, 2, 0.4), wood('#8a5a30'), [0, 1, 0]));
      const colors = ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
      for (let shelf = 0; shelf < 4; shelf += 1) {
        for (let i = 0; i < 7; i += 1) g.add(mesh(new THREE.BoxGeometry(0.11, 0.32, 0.28), paint(colors[(i + shelf) % colors.length]!), [-0.42 + i * 0.14, 0.32 + shelf * 0.46, 0.06]));
      }
      break;
    }
    case 'yoga_mat': {
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.02, 1.8), paint('#8e44ad', 0.9), [0, 0.01, 0.3]));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 16), paint('#16a085', 0.9), [0, 0.12, -0.75]).rotateZ(Math.PI / 2));
      break;
    }
    case 'dumbbells': {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), M.darkSteel(), [0, 0.5, 0]));
      for (const x of [-0.55, 0.55]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.35), M.darkSteel(), [x, 0.25, 0]));
      for (let i = 0; i < 4; i += 1) {
        const x = -0.4 + i * 0.27;
        g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), M.chrome(), [x, 0.6, 0]).rotateX(Math.PI / 2));
        for (const z of [-0.12, 0.12]) g.add(mesh(new THREE.CylinderGeometry(0.07 + i * 0.01, 0.07 + i * 0.01, 0.06, 16), M.iron(), [x, 0.6, z]).rotateX(Math.PI / 2));
      }
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 1.2), paint('#2a2d33'), [0, 0.45, 0.9]));
      break;
    }
    case 'coffee_machine': {
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.55), wood('#c9a66b'), [0, 0.45, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.45, 0.35), M.chrome(), [0, 1.13, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 12), paint('#ffffff', 0.4), [0, 0.96, 0.12]));
      break;
    }
    case 'console': {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.45, 0.45), wood('#3a2a1e'), [0, 0.22, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.35, 0.08, 0.28), paint('#f4f4f4', 0.3), [-0.3, 0.49, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.1), paint('#222'), [0.25, 0.47, 0.1]));
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), paint('#111316', 0.3), [0, 1.1, -0.15]));
      g.add(mesh(new THREE.PlaneGeometry(1.1, 0.62), M.glow('#e84393', 0.6), [0, 1.1, -0.12]));
      break;
    }
    case 'piano': {
      g.add(mesh(new THREE.BoxGeometry(1.5, 1.25, 0.6), paint('#141418', 0.25), [0, 0.62, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.25), paint('#f4f4f4', 0.3), [0, 0.78, 0.38]));
      for (let i = 0; i < 9; i += 1) g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.14), paint('#111'), [-0.6 + i * 0.15, 0.82, 0.34]));
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.45, 0.35), paint('#141418', 0.3), [0, 0.22, 0.85]));
      break;
    }
    case 'bathtub': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.6, 1.8), paint('#f4f6f8', 0.25), [0, 0.3, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.82, 0.05, 1.6), mat('#9fd3f0', 0.1, 0, { transparent: true, opacity: 0.8 }), [0, 0.52, 0]));
      for (let i = 0; i < 6; i += 1) g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), paint('#ffffff', 0.9), [-0.25 + (i % 3) * 0.25, 0.58, -0.4 + Math.floor(i / 3) * 0.5]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), M.chrome(), [0, 0.8, -0.85]));
      break;
    }
    case 'aquarium': {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.8, 0.5), wood('#3a2a1e'), [0, 0.4, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.15, 0.65, 0.45), mat('#4fb6d6', 0.05, 0, { transparent: true, opacity: 0.55 }), [0, 1.13, 0]));
      const colors = ['#ff8a00', '#ffd23a', '#e84393'];
      for (let i = 0; i < 5; i += 1) g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glow(colors[i % 3]!, 0.5), [-0.4 + i * 0.2, 1.0 + (i % 2) * 0.2, (i % 3) * 0.08 - 0.08], [1.6, 1, 0.6]));
      break;
    }
    case 'easel': {
      const w2 = wood('#a0784a');
      for (const x of [-0.35, 0.35]) g.add(mesh(new THREE.BoxGeometry(0.05, 1.8, 0.05), w2, [x, 0.9, 0]).rotateZ(x > 0 ? -0.12 : 0.12));
      g.add(mesh(new THREE.BoxGeometry(0.05, 1.7, 0.05), w2, [0, 0.85, -0.35]).rotateX(-0.25));
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.04), paint('#fbf7ef', 0.9), [0, 1.3, 0.05]));
      g.add(mesh(new THREE.CircleGeometry(0.15, 16), paint('#e67e22'), [-0.15, 1.35, 0.075]), mesh(new THREE.CircleGeometry(0.1, 16), paint('#2e86c1'), [0.18, 1.2, 0.075]));
      break;
    }
  }
  return g;
}

function room(home: HomeId, placed: Placed[], night: boolean): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = ROOM[home];
  const floorTone = { studio: '#b08a63', flat: '#c39a6b', loft: '#8a7a6a', penthouse: '#d8c8b0' }[home];
  const wallTone = { studio: '#e8e1d6', flat: '#dfe8ee', loft: '#b9a89a', penthouse: '#f3f1ec' }[home];
  const floor = mesh(new THREE.PlaneGeometry(w, d), M.planks(floorTone), [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  g.add(floor);
  const wall = mat(wallTone, 0.95);
  const H = 3;
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, H, 0.15), wall, [0, H / 2, -d / 2 - 0.07]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.15, H, d + 0.15), wall, [(sx * (w + 0.15)) / 2, H / 2, 0]));
  // Плинтус и окно на задней стене.
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, 0.04), mat('#ffffff', 0.6), [0, 0.05, -d / 2 + 0.02]));
  const win = mesh(new THREE.PlaneGeometry(1.8, 1.2), night ? M.glow('#1d2b55', 0.5) : M.glow('#bfe3ff', 0.7), [-w / 2 + 3.8, 1.8, -d / 2 + 0.01]);
  g.add(win, mesh(new THREE.BoxGeometry(1.95, 0.08, 0.08), mat('#ffffff', 0.5), [-w / 2 + 3.8, 1.18, -d / 2 + 0.04]));
  // Ковёр, растение, светильник.
  const rug = mesh(new THREE.CircleGeometry(1.4, 32), M.cloth('#b04a4a', 3), [0.4, 0.01, 2.2]);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.3, 1, 1);
  g.add(rug);
  const pot = new THREE.Group();
  pot.add(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 14), mat('#c0603a', 0.8), [0, 0.2, 0]));
  for (let i = 0; i < 6; i += 1) pot.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#3d7f3a', 0.7), [Math.sin(i) * 0.12, 0.6 + (i % 3) * 0.15, Math.cos(i) * 0.12], [0.7, 1.3, 0.7]));
  pot.position.set(w / 2 - 0.45, 0, 0.6 + d * 0.05);
  g.add(pot);
  for (const p of placed) {
    const m = objectModel(p.id);
    m.position.set(p.pos.x, 0, p.pos.z);
    m.rotation.y = p.rot;
    g.add(m);
  }
  // Потолочный свет (по вечерам ярче).
  const lamp = new THREE.PointLight('#ffe2b0', night ? 14 : 4, 18, 1.6);
  lamp.position.set(0, 2.8, 0);
  g.add(lamp);
  return g;
}

// ─── Город ─────────────────────────────────────────────────────────────

function signTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66, 490);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function building(loc: LocationId, sign: string, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const def = LOCATIONS[loc];
  const r = rng(`bld:${loc}`);
  const h = loc === 'office' ? 22 : loc === 'home' ? 16 : loc === 'mall' ? 9 : 6 + Math.floor(r() * 5);
  const w = loc === 'mall' ? 14 : 11;
  const body = new THREE.Color(def.color).lerp(new THREE.Color('#d9d4cc'), 0.55);
  g.add(mesh(new THREE.BoxGeometry(w, h, 9), mat(body, 0.9), [0, h / 2, FACADE_Z - 4.5]));
  // Окна по этажам.
  const lit = M.glow('#ffd98a', 0.9);
  const dark = mat('#2c3e50', 0.2, 0.3);
  for (let y = 4.2; y < h - 0.8; y += 2.6) {
    for (let x = -w / 2 + 1.4; x < w / 2 - 0.8; x += 2.2) {
      const on = night && r() < 0.55;
      g.add(mesh(new THREE.PlaneGeometry(1.2, 1.3), on ? lit : dark, [x, y, FACADE_Z + 0.01]));
    }
  }
  // Витрина и дверь.
  g.add(mesh(new THREE.PlaneGeometry(w - 2.2, 2.2), night ? M.glow('#ffe6b0', 0.5) : mat('#9fc7e8', 0.1, 0.4), [0, 1.6, FACADE_Z + 0.015]));
  g.add(mesh(new THREE.BoxGeometry(1.5, 2.4, 0.1), mat('#2b2f36', 0.4), [0, 1.2, FACADE_Z + 0.05]));
  const s = mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: signTexture(`${def.icon} ${sign}`, def.color), toneMapped: false }), [0, 3.25, FACADE_Z + 0.06]);
  g.add(s);
  // Навес.
  g.add(mesh(new THREE.BoxGeometry(w - 1, 0.12, 1.4), mat(def.color, 0.7), [0, 2.75, FACADE_Z + 0.65]));
  g.position.x = def.x;
  return g;
}

function park(sign: string): THREE.Group {
  const g = new THREE.Group();
  const x0 = LOCATIONS.park.x;
  const grass = mesh(new THREE.PlaneGeometry(28, 18), mat('#4f8a3f', 1), [x0, 0.01, -5]);
  grass.rotation.x = -Math.PI / 2;
  g.add(grass);
  const r = rng('park');
  const trunk = wood('#5a3d26');
  const leaf = mat('#3f7a3a', 0.85);
  leaf.flatShading = true;
  for (let i = 0; i < 16; i += 1) {
    const x = x0 - 13 + r() * 26;
    const z = -13 + r() * 10;
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.26, 2, 7), trunk, [x, 1, z]));
    g.add(mesh(new THREE.IcosahedronGeometry(1.4 + r() * 0.6, 0), leaf, [x, 3, z]));
  }
  const pond = mesh(new THREE.CircleGeometry(3, 28), mat('#3a7ca5', 0.1, 0.3), [x0 + 6, 0.02, -6]);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1.5, 1, 1);
  g.add(pond);
  for (const x of [-4, 4]) {
    const bench = new THREE.Group();
    bench.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood('#8a5a30'), [0, 0.45, 0]), mesh(new THREE.BoxGeometry(1.8, 0.5, 0.06), wood('#8a5a30'), [0, 0.75, -0.24]));
    bench.position.set(x0 + x, 0, -0.3);
    g.add(bench);
  }
  const arch = new THREE.Group();
  for (const x of [-2.4, 2.4]) arch.add(mesh(new THREE.BoxGeometry(0.3, 3, 0.3), M.iron(), [x, 1.5, 0]));
  arch.add(mesh(new THREE.PlaneGeometry(4.6, 1), new THREE.MeshBasicMaterial({ map: signTexture(`🌳 ${sign}`, '#3f7a3a'), toneMapped: false }), [0, 3.1, 0.02]));
  arch.position.set(x0, 0, FACADE_Z);
  g.add(arch);
  return g;
}

function street(signs: Record<LocationId, string>, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const len = CITY_BOUNDS.x1 - CITY_BOUNDS.x0 + 60;
  const cx = (CITY_BOUNDS.x0 + CITY_BOUNDS.x1) / 2;
  const ground = mesh(new THREE.PlaneGeometry(len, 60), mat('#9a9ea4', 0.95), [cx, 0, 10]);
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  g.add(ground);
  const road = mesh(new THREE.PlaneGeometry(len, 7), mat('#3b3f45', 0.9), [cx, 0.01, 6.6]);
  road.rotation.x = -Math.PI / 2;
  g.add(road);
  for (let x = CITY_BOUNDS.x0 - 20; x < CITY_BOUNDS.x1 + 20; x += 6) {
    const dash = mesh(new THREE.PlaneGeometry(2.5, 0.18), mat('#f4f4f4', 0.6), [x, 0.02, 6.6]);
    dash.rotation.x = -Math.PI / 2;
    g.add(dash);
  }
  const curb = mesh(new THREE.BoxGeometry(len, 0.15, 0.3), mat('#c8ccd1', 0.8), [cx, 0.07, 3.05]);
  g.add(curb);
  for (const loc of LOCATION_IDS) if (loc !== 'park') g.add(building(loc, signs[loc], night));
  g.add(park(signs.park));
  // Фонари, деревья в кадках, машины.
  const lampHead = night ? M.glow('#fff1c4', 2.2) : mat('#e8e8e8', 0.4);
  // Фонари — у стен между дверями, чтобы не загораживать героя.
  const doors = LOCATION_IDS.map((id) => LOCATIONS[id].x).sort((a, b) => a - b);
  for (let i = 0; i < doors.length - 1; i += 1) {
    const x = (doors[i]! + doors[i + 1]!) / 2;
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8), M.darkSteel(), [x, 2.1, FACADE_Z + 0.4]));
    g.add(mesh(new THREE.SphereGeometry(0.22, 12, 8), lampHead, [x, 4.25, FACADE_Z + 0.4]));
  }
  return g;
}

// ─── Свет и время ──────────────────────────────────────────────────────

const SKY_KEYS: Array<[number, string, number]> = [
  [0, '#0b1020', 0.15],
  [5, '#1b2340', 0.25],
  [6.5, '#f2b98c', 0.7],
  [9, '#9fc7e8', 1],
  [17, '#a8c8e6', 1],
  [19, '#e8916b', 0.65],
  [20.5, '#2a2650', 0.3],
  [24, '#0b1020', 0.15],
];

function skyAt(minute: number): { color: THREE.Color; light: number } {
  const h = minute / 60;
  for (let i = 0; i < SKY_KEYS.length - 1; i += 1) {
    const [a, ca, la] = SKY_KEYS[i]!;
    const [b, cb, lb] = SKY_KEYS[i + 1]!;
    if (h >= a && h <= b) {
      const k = (h - a) / (b - a);
      return { color: new THREE.Color(ca).lerp(new THREE.Color(cb), k), light: la + (lb - la) * k };
    }
  }
  return { color: new THREE.Color('#0b1020'), light: 0.15 };
}

const isNight = (minute: number): boolean => minute < 6 * 60 || minute >= 20 * 60;

function blobShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

const lookKey = (l: Look): string => JSON.stringify([l.color, l.appearance, l.equipped]);

export default function LifeScene3D(props: LifeScene3DProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const api = useRef<{ rebuildScene(): void; rebuildHero(): void; syncPeople(): void } | null>(null);
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
    const canvas = renderer.domElement;
    canvas.className = 'world-canvas';
    el.appendChild(canvas);
    const studio = createStudio(renderer, true);
    const { scene } = studio;
    scene.environmentIntensity = 0.4;
    studio.rim.intensity = 0.15;
    const sun = studio.key;
    sun.shadow.camera.left = -5;
    sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 5;
    sun.shadow.camera.bottom = -5;
    sun.shadow.camera.updateProjectionMatrix();
    const hemi = new THREE.HemisphereLight('#dfe9ff', '#4a4030', 1);
    scene.add(hemi);
    scene.background = new THREE.Color('#9fc7e8');
    scene.fog = new THREE.Fog('#9fc7e8', 40, 110);

    let disposed = false;
    const world = new THREE.Group();
    scene.add(world);
    let ground: THREE.Object3D | null = null;
    let bounds: Box = CITY_BOUNDS;
    let boxes: readonly Box[] = CITY_BOXES;
    let interior = false;
    let targets: Array<{ key: string; t: NearTarget; pos: P2 }> = [];
    const pos = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    let builtScene: SceneId | null = null;

    const rebuildScene = (): void => {
      const p = propsRef.current;
      disposeObject(world);
      world.clear();
      const night = isNight(p.minute);
      interior = p.scene === 'home';
      if (interior) {
        const placed = homeLayout(p.home, p.furniture);
        world.add(room(p.home, placed, night));
        bounds = homeBounds(p.home);
        boxes = placed.map((x) => x.box).filter((b): b is Box => b !== null);
        targets = placed.map((x) => ({ key: `o:${x.id}`, t: { kind: 'object', id: x.id }, pos: x.use }));
      } else {
        world.add(street(p.signs, night));
        bounds = CITY_BOUNDS;
        boxes = CITY_BOXES;
        targets = LOCATION_IDS.map((id) => ({ key: `l:${id}`, t: { kind: 'location', id }, pos: doorPos(id) }));
      }
      ground = world.getObjectByName('ground') ?? null;
      // Новое место — герой у двери; та же сцена (мебель, смена дня и ночи) — остаётся где был.
      if (builtScene !== p.scene) {
        builtScene = p.scene;
        const sp = spawn(p.scene, p.home);
        pos.set(sp.x, 0, sp.z);
        camPos.set(sp.x, interior ? 6.8 : 8.5, sp.z + (interior ? 7 : 12));
      } else {
        const c = resolve({ x: pos.x, z: pos.z }, bounds, boxes);
        pos.set(c.x, 0, c.z);
      }
      scene.fog = interior ? null : new THREE.Fog('#9fc7e8', 40, 110);
      lastNear = '';
      syncPeople();
    };

    // Жители на улице.
    const people = new Map<PersonId, { root: THREE.Group; parts: CharacterParts | null; key: string; info: ScenePerson }>();
    const syncPeople = (): void => {
      const p = propsRef.current;
      const want = p.scene === 'city' ? p.people : [];
      for (const [id, e] of people) {
        if (!want.some((w) => w.id === id && lookKey(w) === e.key)) {
          scene.remove(e.root);
          disposeObject(e.root);
          people.delete(id);
        }
      }
      for (const w of want) {
        const e = people.get(w.id);
        if (e) {
          e.info = w;
          e.root.position.set(w.spot.x, 0, w.spot.z);
          continue;
        }
        const root = new THREE.Group();
        root.position.set(w.spot.x, 0, w.spot.z);
        root.rotation.y = Math.PI * 0.1;
        scene.add(root);
        const entry = { root, parts: null as CharacterParts | null, key: lookKey(w), info: w };
        people.set(w.id, entry);
        void Promise.all([prepare(w.appearance.figure, garmentsFor(w.appearance.figure, w.equipped)), loadHairTexture(w.appearance.hair)]).then(() => {
          if (disposed || people.get(w.id) !== entry) return;
          entry.parts = buildCharacter(w.appearance, w.color, w.equipped);
          root.add(entry.parts.root);
        });
      }
    };

    // Герой.
    const heroRoot = new THREE.Group();
    const shadow = blobShadow();
    scene.add(heroRoot, shadow);
    sun.target = heroRoot;
    let hero: CharacterParts | null = null;
    let heroToken = 0;
    const rebuildHero = (): void => {
      const { appearance, color, equipped } = propsRef.current.hero;
      const my = (heroToken += 1);
      void Promise.all([prepare(appearance.figure, garmentsFor(appearance.figure, equipped)), loadHairTexture(appearance.hair)]).then(() => {
        if (disposed || my !== heroToken) return;
        if (hero) {
          heroRoot.remove(hero.root);
          disposeObject(hero.root);
        }
        hero = buildCharacter(appearance, color, equipped);
        hero.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = true;
        });
        heroRoot.add(hero.root);
        setReady(true);
      });
    };
    api.current = { rebuildScene, rebuildHero, syncPeople };

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);
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

    let lastNear = '';
    rebuildScene();
    rebuildHero();

    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'ц', 'ф', 'ы', 'в'].includes(k)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.type === 'keydown') keys.add(k);
      else keys.delete(k);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const ray = new THREE.Raycaster();
    let downAt = { x: 0, y: 0, t: 0 };
    const onDown = (e: PointerEvent): void => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent): void => {
      if (!ground || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12 || performance.now() - downAt.t > 500) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(ground, false)[0];
      if (hit) propsRef.current.goto.current = { x: hit.point.x, z: hit.point.z };
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
      propsRef.current.onFail();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    let raf = 0;
    let prev = performance.now();
    let facing = Math.PI;
    let speed = 0;
    let walk = 0;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      const p = propsRef.current;
      let dx = p.stick.current.x;
      let dz = -p.stick.current.y;
      if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) dz -= 1;
      if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) dz += 1;
      if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright') || keys.has('в')) dx += 1;
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
      const top = interior ? 3.2 : 6;
      speed += ((mag > 0.05 ? top * mag : 0) - speed) * Math.min(1, dt * 9);
      if (mag > 0.05) {
        let diff = Math.atan2(dx, dz) - facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        facing += diff * Math.min(1, dt * 11);
      }
      if (speed > 0.01) {
        const next = resolve({ x: pos.x + Math.sin(facing) * speed * dt, z: pos.z + Math.cos(facing) * speed * dt }, bounds, boxes);
        if (p.goto.current && Math.hypot(next.x - pos.x, next.z - pos.z) < speed * dt * 0.2) p.goto.current = null;
        pos.x = next.x;
        pos.z = next.z;
      }
      walk += dt * speed * 2;
      heroRoot.position.set(pos.x, Math.abs(Math.sin(walk)) * 0.05 * Math.min(1, speed / 3), pos.z);
      heroRoot.rotation.set(0, facing, Math.sin(walk) * 0.035 * Math.min(1, speed / 3));
      shadow.position.set(pos.x, 0.02, pos.z);
      const t = now / 1000;
      if (hero) {
        const b = Math.sin(t * 1.9);
        hero.torso.scale.set(1 + b * 0.006, 1 + b * 0.0025, 1 + b * 0.012);
        for (const f of hero.anim) f(t);
      }
      // Жители поворачиваются к герою, если он рядом.
      for (const e of people.values()) {
        const d = Math.hypot(pos.x - e.root.position.x, pos.z - e.root.position.z);
        const want = d < 5 ? Math.atan2(pos.x - e.root.position.x, pos.z - e.root.position.z) : Math.sin(t * 0.3 + e.root.position.x) * 0.6;
        e.root.rotation.y += (want - e.root.rotation.y) * Math.min(1, dt * 3);
        if (e.parts) e.parts.torso.scale.y = 1 + Math.sin(t * 1.7 + e.root.position.x) * 0.003;
      }
      // Камера.
      const want = interior ? new THREE.Vector3(pos.x * 0.6, 6.8, pos.z + 6.2) : new THREE.Vector3(pos.x, 8.5, pos.z + 12);
      camPos.lerp(want, Math.min(1, dt * 4));
      camera.position.copy(camPos);
      camera.lookAt(interior ? pos.x * 0.8 : pos.x, interior ? 0.6 : 1.4, interior ? pos.z - 1 : pos.z - 2.5);
      // Небо и солнце по игровому времени.
      const sky = skyAt(p.minute);
      if (interior) {
        (scene.background as THREE.Color).set('#1a1d22');
        hemi.intensity = 0.55 + sky.light * 0.5;
        sun.intensity = 0.6 + sky.light * 1.2;
      } else {
        (scene.background as THREE.Color).copy(sky.color);
        scene.fog?.color.copy(sky.color);
        hemi.intensity = 0.25 + sky.light * 0.9;
        sun.intensity = 0.2 + sky.light * 2;
      }
      sun.position.set(pos.x + 5, 11, pos.z + 6);
      // Что рядом: житель важнее двери.
      let near: { key: string; t: NearTarget } | null = null;
      let best = REACH;
      for (const e of people.values()) {
        const d = Math.hypot(pos.x - e.info.spot.x, pos.z - e.info.spot.z);
        if (d < best + 0.9) {
          best = d - 0.9;
          near = { key: `p:${e.info.id}`, t: { kind: 'person', id: e.info.id, at: e.info.at } };
        }
      }
      if (!near) {
        best = interior ? REACH : REACH + 1.2;
        for (const x of targets) {
          const d = dist(pos, x.pos);
          if (d < best) {
            best = d;
            near = x;
          }
        }
      }
      const key = near?.key ?? '';
      if (key !== lastNear) {
        lastNear = key;
        p.onNear(near?.t ?? null);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      api.current = null;
      disposeObject(scene);
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  // Перестройка сцены: другое место, мебель, жильё, смена дня и ночи.
  const night = isNight(props.minute);
  const sceneKey = JSON.stringify([props.scene, props.home, props.furniture, night, props.signs]);
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

  const peopleKey = JSON.stringify(props.people.map((p) => [p.id, p.at, lookKey(p)]));
  useEffect(() => {
    api.current?.syncPeople();
  }, [peopleKey]);

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
