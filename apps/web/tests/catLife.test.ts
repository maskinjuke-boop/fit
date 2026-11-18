import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../src/game/lifeContent';
import { PETS, bounds, homeLayout, homeObstacles, playCatBoxes, playParts, type Box } from '../src/game/lifeMap';
import { createCatLife, perchSpots, type CatHeroAct, type CatWorld } from '../src/ui/game/three/catLife';

/** Дом со всей мебелью и кошачьим хозяйством; кошки живут rounds секунд (без отрисовки поз). */
function home(needs: { fed: number; play: number; toilet: number }, pets = { bowl: 4, water: 80, litter: 20 }) {
  // Обычная квартира (ступень 1): там стоит лоток PETS.
  const placed = homeLayout([...FURNITURE.filter((x) => x === 'armchair' || x === 'big_tv' || x === 'bookshelf')], true, 1);
  const b = bounds('cafe', 1);
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
  it('игровая зона: лезут на лежанку домика, спят в домике, точат когти, бьют помпон, бегают через тоннель', () => {
    const placed = homeLayout([], true, 1);
    const b = bounds('cafe', 1);
    const zone = placed.find((x) => x.id === 'play_zone')!;
    expect(zone).toBeTruthy();
    const boxes: Box[] = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter' && x.id !== 'play_zone').map((x) => x.box).filter((x): x is Box => x !== null), ...homeObstacles(), ...playCatBoxes(zone.pos)];
    const play = playParts(zone.pos);
    const world: CatWorld = { bounds: b, boxes, perches: perchSpots(placed, b, boxes), litterSurface: 0.07, hero: { x: 3, z: 3 }, act: null, pets: { bowl: 6, water: 100, litter: 0 }, need: () => ({ fed: 90, play: 15, toilet: 95 }), play };
    const life = createCatLife(new Group(), () => new Object3D());
    life.sync(['ginger', 'black', 'siamese', 'bengal'].map((breed, i) => ({ id: `cat${i + 1}`, breed: breed as 'ginger' })), world);
    const dt = 1 / 20;
    const seen = new Set<string>();
    let maxY = 0;
    let bad = 0;
    for (let i = 0; i < 20 * 900; i += 1) {
      life.update(i * dt, dt, world, i % 4 === 0);
      for (const c of life.cats.values()) {
        maxY = Math.max(maxY, c.y);
        if (c.mode === 'scratch' || c.mode === 'reach') seen.add(c.mode);
        if (!c.jump && Math.abs(c.y - play.houseY) < 0.01 && Math.hypot(c.pos.x - play.house.x, c.pos.z - play.house.z) < 0.05) seen.add('house');
        if (Math.abs(c.pos.z - play.tunnel[0].z) < 0.1 && c.pos.x > play.tunnel[0].x + 0.4 && c.pos.x < play.tunnel[1].x - 0.4 && c.y < 0.01) seen.add('tunnel');
        // На полу — не внутри домика и столбика.
        if (c.y < 0.01 && !c.jump && playCatBoxes(zone.pos).some((x) => inside(c.pos, x, 0))) bad += 1;
      }
    }
    expect(maxY).toBeGreaterThan(play.top.y - 0.01);
    for (const k of ['scratch', 'reach', 'house', 'tunnel']) expect(seen.has(k)).toBe(true);
    expect(bad).toBe(0);
    expect([...life.cats.values()].reduce((a, c) => a + c.log.play, 0)).toBeGreaterThan(4);
  });

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

  it('пустые миски — к ним не идут; полный лоток — не ходят', () => {
    const { life, world } = home({ fed: 10, play: 90, toilet: 10 }, { bowl: 0, water: 0, litter: 100 });
    const dt = 1 / 20;
    for (let i = 0; i < 20 * 300; i += 1) life.update(i * dt, dt, world, false);
    for (const c of life.cats.values()) {
      expect(c.log.eat).toBe(0);
      expect(c.log.drink).toBe(0);
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
    const act: CatHeroAct = { key: 1, motion: 'crouch:pet', cat: 'cat1', settledAt: 0, at: { x: 0, z: 0 } };
    world.act = act;
    for (let i = 0; i < 20; i += 1) life.update(1 + i * dt, dt, world, false);
    expect(['purr', 'belly']).toContain(cat.mode);
    world.act = { key: 2, motion: 'crouch:call', cat: null, settledAt: 2, at: { x: 0, z: 0 } };
    // Каждая кошка прибегает к герою (обходя мебель) и трётся о ноги.
    const closest = new Map<string, number>();
    for (let i = 0; i < 20 * 12; i += 1) {
      life.update(2 + i * dt, dt, world, false);
      for (const c of life.cats.values()) closest.set(c.id, Math.min(closest.get(c.id) ?? Infinity, Math.hypot(c.pos.x - world.hero.x, c.pos.z - world.hero.z)));
    }
    for (const d of closest.values()) expect(d).toBeLessThan(0.8);
  });

  it('герой садится в кресло, где лежит кошка, — она спрыгивает и туда больше не ложится', () => {
    const { life, world } = home({ fed: 90, play: 90, toilet: 90 });
    const chair = homeLayout(['armchair'], true).find((p) => p.id === 'armchair')!;
    const perch = [...world.perches].sort((a, b) => Math.hypot(a.pos.x - chair.pos.x, a.pos.z - chair.pos.z) - Math.hypot(b.pos.x - chair.pos.x, b.pos.z - chair.pos.z))[0]!;
    const cat = life.cats.get('cat1')!;
    cat.pos = { ...perch.pos };
    cat.y = perch.y;
    cat.edge = { ...perch.edge };
    cat.plan = [{ k: 'pose', mode: 'sleep', dur: 60 }];
    cat.stepAt = -1;
    const seat = { ...perch.pos };
    world.hero = seat;
    world.act = { key: 3, motion: 'sit:read', cat: null, settledAt: 0, at: seat };
    const dt = 1 / 20;
    for (let i = 0; i < 20 * 3; i += 1) life.update(i * dt, dt, world, false);
    expect(cat.y).toBeLessThan(0.05);
    for (let i = 0; i < 20 * 240; i += 1) {
      life.update(3 + i * dt, dt, world, false);
      for (const c of life.cats.values()) if (!c.jump) expect(c.y > 0.05 && Math.hypot(c.pos.x - seat.x, c.pos.z - seat.z) < 0.5).toBe(false);
    }
  });
});
