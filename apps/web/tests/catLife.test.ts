import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../src/game/lifeContent';
import { PETS, bounds, homeLayout, homeObstacles, type Box } from '../src/game/lifeMap';
import { createCatLife, perchSpots, type CatHeroAct, type CatWorld } from '../src/ui/game/three/catLife';

/** Дом со всей мебелью и кошачьим хозяйством; кошки живут rounds секунд (без отрисовки поз). */
function home(needs: { fed: number; play: number; toilet: number }, pets = { bowl: 4, litter: 20 }) {
  const placed = homeLayout([...FURNITURE.filter((x) => x === 'armchair' || x === 'big_tv' || x === 'bookshelf')], true);
  const b = bounds('home');
  const boxes: Box[] = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter').map((x) => x.box).filter((x): x is Box => x !== null), ...homeObstacles()];
  const hero = { x: -2, z: 2 };
  const world: CatWorld = { bounds: b, boxes, perches: perchSpots(placed, b, boxes), litterSurface: 0.07, hero, act: null, pets, need: () => needs };
  const life = createCatLife(new Group(), () => new Object3D());
  life.sync(
    [
      { id: 'cat1', breed: 'ginger' },
      { id: 'cat2', breed: 'maine_coon' },
    ],
    world,
  );
  return { life, world, boxes, b };
}

const inside = (p: { x: number; z: number }, bx: Box, r = 0.25): boolean => p.x > bx.x0 - r && p.x < bx.x1 + r && p.z > bx.z0 - r && p.z < bx.z1 + r;

describe('кошки в доме', () => {
  it('сами живут: едят, ходят в лоток, запрыгивают на мебель, играют; не проходят сквозь мебель и пол', () => {
    const { life, world, boxes, b } = home({ fed: 30, play: 20, toilet: 20 });
    const dt = 1 / 20;
    let minY = 0;
    let bad = 0;
    for (let i = 0; i < 20 * 600; i += 1) {
      life.update(i * dt, dt, world, false);
      for (const c of life.cats.values()) {
        minY = Math.min(minY, c.y);
        expect(c.pos.x).toBeGreaterThanOrEqual(b.x0 - 0.01);
        expect(c.pos.x).toBeLessThanOrEqual(b.x1 + 0.01);
        expect(c.pos.z).toBeGreaterThanOrEqual(b.z0 - 0.01);
        expect(c.pos.z).toBeLessThanOrEqual(b.z1 + 0.01);
        // На полу (не в прыжке и не на мебели) — не внутри мебели.
        if (c.y < 0.01 && !c.jump && boxes.some((x) => inside(c.pos, x))) bad += 1;
      }
    }
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(bad).toBe(0);
    const log = [...life.cats.values()].map((c) => c.log);
    expect(log.every((l) => l.eat > 0)).toBe(true);
    expect(log.every((l) => l.litter > 0)).toBe(true);
    expect(log.some((l) => l.perch > 0)).toBe(true);
    expect(log.some((l) => l.hunt > 0)).toBe(true);
    // Игрушки остаются в комнате.
    for (const t of life.toys) expect(t.pos.x).toBeGreaterThanOrEqual(b.x0 - 0.01);
  });

  it('пустая миска — к ней не идут; полный лоток — не ходят', () => {
    const { life, world } = home({ fed: 10, play: 90, toilet: 10 }, { bowl: 0, litter: 100 });
    const dt = 1 / 20;
    for (let i = 0; i < 20 * 300; i += 1) life.update(i * dt, dt, world, false);
    for (const c of life.cats.values()) {
      expect(c.log.eat).toBe(0);
      expect(c.log.litter).toBe(0);
    }
  });

  it('едят у миски, в лотке сидят на наполнителе', () => {
    const { life, world } = home({ fed: 20, play: 90, toilet: 20 });
    const dt = 1 / 20;
    const seen = { eat: false, litter: false };
    for (let i = 0; i < 20 * 400; i += 1) {
      life.update(i * dt, dt, world, false);
      for (const c of life.cats.values()) {
        if (c.mode === 'eat' && c.y === 0) {
          const d = Math.min(Math.hypot(c.pos.x - PETS.food.x, c.pos.z - PETS.food.z), Math.hypot(c.pos.x - PETS.water.x, c.pos.z - PETS.water.z));
          expect(d).toBeLessThan(0.6);
          seen.eat = true;
        }
        if (c.mode === 'litter') {
          expect(Math.abs(c.pos.x - PETS.litter.pos.x)).toBeLessThan(0.2);
          expect(Math.abs(c.pos.z - PETS.litter.pos.z)).toBeLessThan(0.2);
          expect(c.y).toBeGreaterThan(0.03);
          seen.litter = true;
        }
      }
    }
    expect(seen.eat).toBe(true);
    expect(seen.litter).toBe(true);
  });

  it('на ласку мурлычет, на зов бежит к герою', () => {
    const { life, world } = home({ fed: 90, play: 90, toilet: 90 });
    const dt = 1 / 20;
    const cat = life.cats.get('cat1')!;
    const act: CatHeroAct = { key: 1, motion: 'crouch:pet', cat: 'cat1', settledAt: 0 };
    world.act = act;
    for (let i = 0; i < 20; i += 1) life.update(1 + i * dt, dt, world, false);
    expect(['purr', 'belly']).toContain(cat.mode);
    world.act = { key: 2, motion: 'crouch:call', cat: null, settledAt: 2 };
    for (let i = 0; i < 20 * 12; i += 1) life.update(2 + i * dt, dt, world, false);
    for (const c of life.cats.values()) expect(Math.hypot(c.pos.x - world.hero.x, c.pos.z - world.hero.z)).toBeLessThan(1.2);
  });
});
