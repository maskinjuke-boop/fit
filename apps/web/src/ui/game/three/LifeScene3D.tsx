import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GYMS } from '../../../game/lifeContent';
import { GYM_ROOM, HOUSE, REACH, bounds as sceneBounds, clientSpot, dist, gymGear, gymLayout, homeLayout, resolve, spawn, type Box, type GearKind, type P2, type Placed } from '../../../game/lifeMap';
import type { ObjectId, SceneId } from '../../../game/lifeTypes';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { M, mat, mesh, retile } from './kit';
import { blobShadow, loadCharacter, lookKey, type Look, type Member } from './people';
import { animate } from './rig';
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
    case 'coach': {
      // Платформа тренера и колонка.
      g.add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 32), paint('#e85d2a', 0.6), [0, 0.04, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.9, 0.4), paint('#1b1d21', 0.4), [1.3, 0.45, 0.2]));
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), paint('#555', 0.3), [1.3, 0.62, 0.41]).rotateX(Math.PI / 2));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20), paint('#555', 0.3), [1.3, 0.3, 0.41]).rotateX(Math.PI / 2));
      break;
    }
    case 'reception': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 1.1, 2.4), paint('#f2f2f2', 0.4), [0, 0.55, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.06, 2.5), wood('#a0784a'), [0, 1.13, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 2.2), M.glow('#ff7a3d', 0.8), [0.52, 0.6, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.3, 0.04), paint('#15171b', 0.3), [-0.2, 1.35, 0.3]).rotateY(Math.PI / 2));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 12), paint('#ffffff', 0.4), [0.2, 1.28, -0.7]));
      break;
    }
    case 'gym_door': {
      g.add(mesh(new THREE.BoxGeometry(1.5, 2.3, 0.08), mat('#9fd0ee', 0.05, 0.2, { transparent: true, opacity: 0.55 }), [0, 1.15, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 0.12), M.darkSteel(), [0, 2.35, 0]));
      for (const x of [-0.78, 0.78]) g.add(mesh(new THREE.BoxGeometry(0.06, 2.35, 0.1), M.darkSteel(), [x, 1.17, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.6, 0.06), M.chrome(), [0.1, 1.1, 0.06]));
      break;
    }
    case 'gym_shower': {
      const tile = mat('#d9e7ee', 0.35);
      g.add(mesh(new THREE.BoxGeometry(1.4, 2.3, 0.08), tile, [0, 1.15, -0.65]));
      g.add(mesh(new THREE.BoxGeometry(0.08, 2.3, 2.4), tile, [0, 1.15, 0]).translateX(0));
      for (const z of [-0.6, 0.6]) {
        g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), M.chrome(), [0.5, 1.1, z - 0.55]));
        g.add(mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.05, 16), M.chrome(), [0.4, 2.05, z - 0.45]));
      }
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.04, 2.4), paint('#b7c9d3', 0.3), [0, 0.02, 0]));
      break;
    }
    case 'smoothie': {
      g.add(mesh(new THREE.BoxGeometry(0.9, 1.05, 2.8), paint('#2c3e50', 0.5), [0, 0.52, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 2.9), paint('#f4f6f8', 0.3), [0, 1.08, 0]));
      const fruit = ['#7bc043', '#f37736', '#ee4035', '#fdf498'];
      for (let i = 0; i < 4; i += 1) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.22, 12), M.glow(fruit[i]!, 0.35), [0.1, 1.22, -1 + i * 0.6]));
      g.add(mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), M.chrome(), [-0.1, 1.31, 1.0]));
      break;
    }
  }
  return g;
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

function walls(w: number, d: number, tone: string, H = 3): THREE.Group {
  const g = new THREE.Group();
  const wall = mat(tone, 0.95);
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, H, 0.15), wall, [0, H / 2, -d / 2 - 0.07]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.15, H, d + 0.15), wall, [(sx * (w + 0.15)) / 2, H / 2, 0]));
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, 0.04), mat('#ffffff', 0.6), [0, 0.05, -d / 2 + 0.02]));
  return g;
}

function addPlaced(g: THREE.Group, placed: readonly Placed[]): void {
  for (const p of placed) {
    const m = objectModel(p.id);
    m.position.set(p.pos.x, 0, p.pos.z);
    m.rotation.y = p.rot;
    g.add(m);
  }
}

function house(placed: Placed[], night: boolean): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = HOUSE;
  // Паркет: текстура повторяется по площади, а не растягивается на весь пол.
  const parquet = M.planks('#c39a6b') as THREE.MeshStandardMaterial;
  if (parquet.map) parquet.map = retile(parquet.map, 4);
  if (parquet.bumpMap) parquet.bumpMap = retile(parquet.bumpMap, 4);
  const floor = mesh(new THREE.PlaneGeometry(w, d), parquet, [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  g.add(floor, walls(w, d, '#e8e1d6'));
  // Кухонная зона — плитка.
  const tiles = mesh(new THREE.PlaneGeometry(3.6, 2.6), mat('#d9d4cc', 0.5), [w / 2 - 1.8, 0.005, -d / 2 + 1.3]);
  tiles.rotation.x = -Math.PI / 2;
  g.add(tiles);
  for (const x of [-w / 2 + 4.2, 1.8]) {
    g.add(mesh(new THREE.PlaneGeometry(1.8, 1.2), night ? M.glow('#1d2b55', 0.5) : M.glow('#bfe3ff', 0.7), [x, 1.8, -d / 2 + 0.01]));
    g.add(mesh(new THREE.BoxGeometry(1.95, 0.08, 0.08), mat('#ffffff', 0.5), [x, 1.18, -d / 2 + 0.04]));
  }
  const rug = mesh(new THREE.CircleGeometry(1.4, 32), M.cloth('#b04a4a', 3), [0.4, 0.01, 2.6]);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.4, 1, 1);
  g.add(rug);
  addPlaced(g, placed);
  const lamp = new THREE.PointLight('#ffe2b0', night ? 14 : 4, 18, 1.6);
  lamp.position.set(0, 2.8, 0);
  g.add(lamp);
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
  const api = useRef<{ rebuildScene(): void; rebuildHero(): void; syncClients(): void; zoomBy(k: number): void } | null>(null);
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
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -6;
    sun.shadow.camera.updateProjectionMatrix();
    const hemi = new THREE.HemisphereLight('#dfe9ff', '#4a4030', 1);
    scene.add(hemi);
    scene.background = new THREE.Color('#1a1d22');

    let disposed = false;
    const world = new THREE.Group();
    scene.add(world);
    let ground: THREE.Object3D | null = null;
    let bounds: Box = sceneBounds('home');
    let boxes: Box[] = [];
    let targets: Array<{ id: ObjectId; pos: P2 }> = [];
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
        boxes = placed.map((x) => x.box).filter((b): b is Box => b !== null);
        targets = placed.map((x) => ({ id: x.id, pos: x.use }));
      } else {
        const def = GYMS[tier]!;
        const placed = gymLayout(def.shower, def.bar);
        world.add(gymRoom(tier, placed, night));
        boxes = [...placed.map((x) => x.box), ...gymGear(tier).map((x) => x.box)].filter((b): b is Box => b !== null);
        targets = placed.map((x) => ({ id: x.id, pos: x.use }));
      }
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
    };

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
    api.current = { rebuildScene, rebuildHero, syncClients, zoomBy };

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
      speed += ((mag > 0.05 ? TOP * mag : 0) - speed) * Math.min(1, dt * 9);
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
      const t = now / 1000;
      // Шаг: частота шагов растёт со скоростью, на месте — стойка с дыханием.
      stride += dt * (0.55 + (speed / TOP) * 0.65);
      heroRoot.position.set(pos.x, 0, pos.z);
      heroRoot.rotation.set(0, facing, 0);
      shadow.position.set(pos.x, 0.02, pos.z);
      if (hero) {
        if (speed > 0.25) animate(hero.rig, 'walk', stride);
        else animate(hero.rig, 'idle', t);
        for (const f of hero.anim) f(t);
      }
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
      sun.position.set(pos.x + 5, 11, pos.z + 6);
      // Ближайший предмет.
      let near: ObjectId | null = null;
      let best = REACH;
      for (const x of targets) {
        const d = dist(pos, x.pos);
        if (d < best) {
          best = d;
          near = x.id;
        }
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
