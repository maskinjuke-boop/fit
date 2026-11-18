import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../src/game/lifeContent';
import { PETS, bounds, homeLayout, homeObstacles, playCatBoxes, playParts, type Box } from '../src/game/lifeMap';
import type { PlayItemId } from '../src/game/lifeTypes';
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
  const zoneSim = (items: PlayItemId[], secs: number) => {
    const play = { size: 2, items, owned: items, rug: 'mint' };
    const placed = homeLayout([], true, 2, play);
    const b = bounds('cafe', 2);
    const zone = placed.find((x) => x.id === 'play_zone')!;
    const boxes: Box[] = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter' && x.id !== 'play_zone').map((x) => x.box).filter((x): x is Box => x !== null), ...homeObstacles(), ...playCatBoxes(zone.pos, play)];
    const parts = playParts(zone.pos, play);
    const world: CatWorld = { bounds: b, boxes, perches: perchSpots(placed, b, boxes), litterSurface: 0.07, hero: { x: 3, z: 3 }, act: null, pets: { bowl: 6, water: 100, litter: 0 }, need: () => ({ fed: 90, play: 15, toilet: 95 }), play: parts };
    const life = createCatLife(new Group(), () => new Object3D());
    life.sync(['ginger', 'black', 'siamese', 'bengal', 'persian', 'british'].map((breed, i) => ({ id: `cat${i + 1}`, breed: breed as 'ginger' })), world);
    const dt = 1 / 20;
    const seen = new Set<string>();
    let bad = 0;
    const near = (p: { x: number; z: number }, q: { x: number; z: number }, r = 0.06): boolean => Math.hypot(p.x - q.x, p.z - q.z) < r;
    for (let i = 0; i < 20 * secs; i += 1) {
      life.update(i * dt, dt, world, i % 4 === 0);
      if (life.inWheel() > 0) seen.add('wheel');
      for (const c of life.cats.values()) {
        if (c.mode === 'scratch') seen.add('scratch');
        if (c.mode === 'reach') seen.add('reach');
        if (c.mode === 'swat') seen.add('track');
        for (const it of parts.items) {
          if (c.jump) continue;
          if (it.id === 'tree' && near(c.pos, it.top.pos) && Math.abs(c.y - it.top.y) < 0.01) seen.add('top');
          if (it.id === 'tree' && near(c.pos, it.house) && Math.abs(c.y - it.houseY) < 0.01) seen.add('house');
          if (it.id === 'tunnel' && Math.abs(c.pos.z - it.ends[0].z) < 0.1 && c.pos.x > it.ends[0].x + 0.4 && c.pos.x < it.ends[1].x - 0.4 && c.y < 0.01) seen.add('tunnel');
          if (it.id === 'hammock' && near(c.pos, it.bed.pos) && Math.abs(c.y - it.bed.y) < 0.01) seen.add('hammock');
          if (it.id === 'boxes' && it.boxes.some((x) => near(c.pos, x.in)) && Math.abs(c.y - 0.03) < 0.01) seen.add('boxes');
          if (it.id === 'tower' && near(c.pos, it.steps[2]!.pos) && Math.abs(c.y - it.steps[2]!.y) < 0.01) seen.add('tower');
        }
        if (c.y < 0.01 && !c.jump && playCatBoxes(zone.pos, play).some((x) => inside(c.pos, x, 0))) bad += 1;
      }
    }
    return { seen, bad, play: [...life.cats.values()].reduce((a, c) => a + c.log.play, 0) };
  };

  it('игровая зона: лежанка и домик, когтеточка, помпон, тоннель, гамак, коробки, башня, трек', () => {
    const r = zoneSim(['tree', 'tower', 'post', 'hammock', 'boxes', 'tunnel', 'track'], 1200);
    for (const k of ['top', 'house', 'scratch', 'reach', 'tunnel', 'hammock', 'boxes', 'tower', 'track']) expect([k, r.seen.has(k)]).toEqual([k, true]);
    expect(r.bad).toBe(0);
    expect(r.play).toBeGreaterThan(8);
  });

  it('беговое колесо: кошки бегают в нём (колесо крутится)', () => {
    const r = zoneSim(['tree', 'wheel', 'post', 'tunnel'], 600);
    expect(r.seen.has('wheel')).toBe(true);
    expect(r.bad).toBe(0);
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
          expect(d).toBeLessThan(0.7);
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

describe('взаимодействие с кошками', () => {
  it('к присевшим гостям подходят кошки; на руках у героя кошка у груди, потом спрыгивает; свои забавы', () => {
    const { life, world } = home({ fed: 90, play: 30, toilet: 95 });
    world.guests = [
      { pos: { x: -4, z: 2.5 }, face: Math.PI / 2, motion: 'crouch:pet' },
      { pos: { x: 3, z: 3 }, face: -Math.PI / 2, motion: 'crouch:play' },
    ];
    const dt = 1 / 20;
    let near = 0;
    const modes = new Set<string>();
    for (let i = 0; i < 20 * 900; i += 1) {
      life.update(i * dt, dt, world, false);
      for (const c of life.cats.values()) {
        modes.add(c.mode);
        for (const g of world.guests!) if (Math.hypot(c.pos.x - g.pos.x, c.pos.z - g.pos.z) < 0.8) near += 1;
      }
    }
    const log = [...life.cats.values()].map((c) => c.log);
    expect(log.some((l) => l.guest > 0)).toBe(true);
    expect(near).toBeGreaterThan(0);
    expect(log.reduce((a, l) => a + l.fun, 0)).toBeGreaterThan(0);
    expect(['sniff', 'roll', 'chase', 'stretch', 'knead'].filter((m) => modes.has(m)).length).toBeGreaterThanOrEqual(4);
    // На руках.
    const cat = life.cats.get('cat1')!;
    world.carry = { id: 'cat1', pos: { x: 0, z: 2 }, y: 1.3, heading: 1, drop: { x: 0, z: 2.6 } };
    for (let i = 0; i < 40; i += 1) life.update(2000 + i * dt, dt, world, false);
    expect(cat.mode).toBe('held');
    expect(Math.abs(cat.y - 1.3)).toBeLessThan(0.05);
    world.carry = null;
    for (let i = 0; i < 20 * 20; i += 1) life.update(2002 + i * dt, dt, world, false);
    expect(cat.y).toBeLessThan(0.05);
  });
});
