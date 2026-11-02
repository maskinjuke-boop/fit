import { Box3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/game/items';
import { DEFAULT_APPEARANCE } from '../src/game/state';
import { HAIR_STYLES, HAIR_COLORS, SKIN_TONES } from '../src/ui/game/palette';
import { buildCharacter, buildItemModel, disposeObject } from '../src/ui/game/three/buildCharacter';

function vertexCount(o: Object3D): number {
  let n = 0;
  o.traverse((x) => {
    const m = x as { isMesh?: boolean; geometry?: { getAttribute(name: string): { count: number } } };
    if (m.isMesh && m.geometry) n += m.geometry.getAttribute('position').count;
  });
  return n;
}

function meshCount(o: Object3D): number {
  let n = 0;
  o.traverse((x) => {
    if ((x as { isMesh?: boolean }).isMesh) n += 1;
  });
  return n;
}

describe('3D-персонаж', () => {
  it('собирается для любой внешности, мужской и женской', () => {
    for (const figure of ['male', 'female'] as const) {
      for (const hair of HAIR_STYLES) {
        for (let skin = 0; skin < SKIN_TONES.length; skin += 1) {
          const c = buildCharacter({ figure, skin, hair, hairColor: HAIR_COLORS.length - 1, beard: skin % 2 === 0 }, '#ff5a5f', {});
          expect(meshCount(c.root)).toBeGreaterThan(20);
          expect(c.eyes.length).toBe(2);
          disposeObject(c.root);
        }
      }
    }
  });

  it('причёска не пропадает целиком под шапкой, кроме шлема', () => {
    for (const hair of HAIR_STYLES) {
      const bare = meshCount(buildCharacter({ ...DEFAULT_APPEARANCE, hair }, '#4da3ff', {}).root);
      const capped = meshCount(buildCharacter({ ...DEFAULT_APPEARANCE, hair }, '#4da3ff', { head: 'sports_cap' }).root);
      expect(capped).toBeGreaterThan(bare - 60);
    }
  });

  it('у каждого предмета есть отдельная модель для иконки', () => {
    for (const item of ITEMS) {
      for (const figure of ['male', 'female'] as const) {
        const { object } = buildItemModel(item.id, item.slot, '#ffb020', figure);
        expect(meshCount(object)).toBeGreaterThan(0);
        const box = new Box3().setFromObject(object);
        expect(box.isEmpty()).toBe(false);
        disposeObject(object);
      }
    }
  });

  it('у каждого предмета магазина есть 3D-модель на персонаже', () => {
    for (const item of ITEMS) {
      for (const figure of ['male', 'female'] as const) {
        const app = { ...DEFAULT_APPEARANCE, figure, hair: 'buzz' as const };
        const bare = vertexCount(buildCharacter(app, '#4da3ff', {}).root);
        const c = buildCharacter(app, '#4da3ff', { [item.slot]: item.id });
        expect(vertexCount(c.root)).not.toBe(bare);
        disposeObject(c.root);
      }
    }
  });

  it('модель стоит на земле и помещается в кадр', () => {
    const full = buildCharacter({ ...DEFAULT_APPEARANCE, hair: 'curly' }, '#4da3ff', { head: 'wizard_hat', body: 'champion_armor', weapon: 'oak_staff', offhand: 'iron_shield' });
    full.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(full.root);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.min.y).toBeLessThan(0.05);
    expect(box.max.y).toBeLessThan(3);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(1.1);
    disposeObject(full.root);
  });
});
