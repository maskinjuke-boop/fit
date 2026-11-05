import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance } from '../../../game/state';
import { prepare } from './anatomy';
import { buildCharacter, garmentsFor, type CharacterParts } from './buildCharacter';
import { loadHairTexture } from './hairMesh';

/** Внешность персонажа для 3D-сцен (герой и ученики). */
export interface Look {
  color: string;
  appearance: Appearance;
  equipped: Partial<Record<Slot, string>>;
}

export interface Member extends Look {
  id: string;
}

export const lookKey = (l: Look): string => JSON.stringify([l.color, l.appearance, l.equipped]);

/** Загружает сетки и волосы, затем строит персонажа с тенями. */
export async function loadCharacter(l: Look): Promise<CharacterParts> {
  await Promise.all([prepare(l.appearance.figure, garmentsFor(l.appearance.figure, l.equipped)), loadHairTexture(l.appearance.hair)]);
  const parts = buildCharacter(l.appearance, l.color, l.equipped);
  parts.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return parts;
}

/** Мягкая круглая тень под персонажем. */
export function blobShadow(size = 1.2): THREE.Mesh {
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
