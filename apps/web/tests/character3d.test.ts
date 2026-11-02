import { Box3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/game/items';
import { DEFAULT_APPEARANCE } from '../src/game/state';
import { HAIR_STYLES, HAIR_COLORS, SKIN_TONES } from '../src/ui/game/palette';
import { buildCharacter, disposeObject } from '../src/ui/game/three/buildCharacter';

function meshCount(o: Object3D): number {
  let n = 0;
  o.traverse((x) => {
    if ((x as { isMesh?: boolean }).isMesh) n += 1;
  });
  return n;
}

describe('3D-персонаж', () => {
  const base = buildCharacter(DEFAULT_APPEARANCE, '#4da3ff', {});
  const baseMeshes = meshCount(base.root);

  it('собирается для любой внешности', () => {
    for (const hair of HAIR_STYLES) {
      for (let skin = 0; skin < SKIN_TONES.length; skin += 1) {
        const c = buildCharacter({ skin, hair, hairColor: HAIR_COLORS.length - 1, beard: skin % 2 === 0 }, '#ff5a5f', {});
        expect(meshCount(c.root)).toBeGreaterThan(20);
        disposeObject(c.root);
      }
    }
  });

  it('у каждого предмета магазина есть 3D-модель', () => {
    for (const item of ITEMS) {
      const c = buildCharacter(DEFAULT_APPEARANCE, '#4da3ff', { [item.slot]: item.id });
      expect(meshCount(c.root)).toBeGreaterThan(baseMeshes);
      disposeObject(c.root);
    }
  });

  it('модель стоит на земле и помещается в кадр', () => {
    const full = buildCharacter({ ...DEFAULT_APPEARANCE, hair: 'curly' }, '#4da3ff', { head: 'wizard_hat', body: 'champion_armor', weapon: 'oak_staff', offhand: 'iron_shield' });
    full.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(full.root);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.min.y).toBeLessThan(0.05);
    expect(box.max.y).toBeLessThan(2.85);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(1.1);
    disposeObject(full.root);
  });
});
