import { readFileSync } from 'node:fs';
import { Box3, Vector3, type Mesh, type SkinnedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import type { Appearance } from '../src/game/state';
import { buildCharacter } from '../src/ui/game/three/buildCharacter';
import { animate } from '../src/ui/game/three/rig';
import { setToonData, TOON_MODELS, toonModelFor } from '../src/ui/game/three/toonPeople';
import { objectModel } from '../src/ui/game/three/homeModels';

for (const m of TOON_MODELS) setToonData(m, JSON.parse(readFileSync(new URL(`../public/models/people/${m}.json`, import.meta.url), 'utf8')));

const look = (over: Partial<Appearance> = {}): Appearance => ({ figure: 'female', skin: 1, hair: 'long', hairColor: 1, beard: false, eyes: 0, ...over });

describe('мульт-люди (Quaternius)', () => {
  it('у каждой фигуры и причёски — своя модель из набора', () => {
    for (const figure of ['male', 'female'] as const)
      for (const hair of ['short', 'long', 'bun', 'buzz', 'curly', 'ponytail', 'bob'] as const) {
        const m = toonModelFor(figure, hair);
        expect(TOON_MODELS.includes(m)).toBe(true);
        expect(m.endsWith(figure === 'female' ? '_Female' : '_Male')).toBe(true);
      }
  });

  it('тело на скелете игры: сетка со скиннингом, ноги на полу, голова на шее', () => {
    for (const figure of ['male', 'female'] as const) {
      const p = buildCharacter(look({ figure, hair: 'short' }), '#4da3ff', {});
      let body: SkinnedMesh | null = null;
      p.root.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh && o.name === 'toon-body') body = o as SkinnedMesh;
      });
      expect(body).not.toBe(null);
      p.root.updateMatrixWorld(true);
      const all = new Box3().setFromObject(p.root);
      expect(Math.abs(all.min.y)).toBeLessThan(0.03);
      expect(all.max.y).toBeGreaterThan(2.1);
      expect(all.max.y).toBeLessThan(2.8);
      const head = new Box3().setFromObject(p.head);
      expect(head.min.y).toBeGreaterThan(1.6);
      // Глаза моргают (веко — доля закрытия), мимика сна их закрывает.
      expect(p.lids.length).toBe(1);
      p.face.want('sleep', 1);
      p.face.update(5);
    }
  });

  it('позы двигают сетку: в приседе голова ниже, координаты без NaN', () => {
    const p = buildCharacter(look(), '#e85d2a', {});
    p.root.updateMatrixWorld(true);
    const stand = new Box3().setFromObject(p.head).getCenter(new Vector3());
    animate(p.rig, 'squat', 0.4, 0.5);
    p.root.updateMatrixWorld(true);
    const low = new Box3().setFromObject(p.head).getCenter(new Vector3());
    expect(low.y).toBeLessThan(stand.y - 0.2);
    let bad = 0;
    p.root.traverse((o) => {
      const g = (o as Mesh).geometry;
      const pos = g?.getAttribute('position');
      if (pos) for (let i = 0; i < pos.array.length; i += 1) if (!Number.isFinite(pos.array[i]!)) bad += 1;
    });
    expect(bad).toBe(0);
  });

  it('полные ученики шире в талии', () => {
    const width = (heavy: number): number => {
      const p = buildCharacter(look({ figure: 'male', hair: 'short', heavy }), '#4da3ff', {});
      p.root.updateMatrixWorld(true);
      return new Box3().setFromObject(p.torso).getSize(new Vector3()).z;
    };
    expect(width(1)).toBeGreaterThan(width(0) * 1.3);
  });

  it('без загруженной мебели Kenney предметы дома строятся прежними моделями', () => {
    for (const id of ['sofa', 'piano', 'armchair', 'bookshelf'] as const) expect(objectModel(id).children.length).toBeGreaterThan(2);
  });
});
