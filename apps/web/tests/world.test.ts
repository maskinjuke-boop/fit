import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../src/game/combat';
import { CAMPS, LAIRS, MARKERS_PER_REGION, REGION_COUNT, barrierZ, clampToWorld, currentTarget, dist, heightAt, markerPos, regionAt, regionStart, roadX } from '../src/game/world';

describe('мир', () => {
  it('вехи и врата хранителя лежат на дороге в своём регионе, до барьера', () => {
    for (let r = 0; r < REGION_COUNT; r += 1) {
      for (let k = 0; k <= MARKERS_PER_REGION; k += 1) {
        const p = markerPos(r, k);
        expect(regionAt(p.z)).toBe(r);
        expect(p.z).toBeGreaterThan(barrierZ(r));
        expect(Math.abs(p.x - roadX(p.z))).toBeLessThan(0.001);
      }
      expect(regionAt(regionStart(r).z)).toBe(r);
    }
  });

  it('логова — монстры своего региона в стороне от дороги, стоянки у дороги', () => {
    expect(LAIRS.length).toBe(REGION_COUNT * 3);
    for (const l of LAIRS) {
      expect(regionAt(l.pos.z)).toBe(l.region);
      expect(MONSTERS[l.monster].region).toBe(l.region);
      expect(MONSTERS[l.monster].boss).toBe(undefined);
      expect(Math.abs(l.pos.x - roadX(l.pos.z))).toBeGreaterThan(8);
    }
    for (const c of CAMPS) expect(Math.abs(c.x - roadX(c.z))).toBeLessThan(8);
  });

  it('барьер не пускает в регион за непобеждённым хранителем', () => {
    const p = clampToWorld({ x: 0, z: -500 }, { region: 0, ending: null });
    expect(p.z).toBeGreaterThan(barrierZ(0));
    const q = clampToWorld({ x: 0, z: -100 }, { region: 1, ending: null });
    expect(q.z).toBe(-100);
    const w = clampToWorld({ x: 999, z: -500 }, { region: 4, ending: 'victory' });
    expect(w.x).toBeLessThan(100);
  });

  it('цель — следующая веха, после шести шагов — хранитель', () => {
    expect(currentTarget({ region: 0, step: 0, ending: null, started: false })).toBe(null);
    const a = currentTarget({ region: 1, step: 2, ending: null, started: true });
    expect(a?.kind).toBe('marker');
    expect(dist(a!.pos, markerPos(1, 2))).toBe(0);
    expect(currentTarget({ region: 1, step: 6, ending: null, started: true })?.kind).toBe('boss');
    expect(currentTarget({ region: 4, step: 6, ending: 'victory', started: true })).toBe(null);
  });

  it('у дороги ровно', () => {
    for (let z = 0; z > -400; z -= 7) expect(Math.abs(heightAt(roadX(z), z))).toBeLessThan(0.01);
  });
});
