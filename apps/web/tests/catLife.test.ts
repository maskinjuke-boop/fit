import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../src/game/lifeContent';
import { PETS, bounds, homeLayout, homeObstacles, playCatBoxes, playParts, type Box } from '../src/game/lifeMap';
import type { PlayItemId } from '../src/game/lifeTypes';
import { createCatLife, perchSpots, type CatWorld } from '../src/ui/game/three/catLife';

/** Дом со всей мебелью и кошачьим хозяйством; кошки живут rounds секунд (без отрисовки поз). */
function home(needs: { fed: number; play: number; toilet: number }, pets = { bowl: 4, water: 80, litter: 20 }) {
  // Обычная квартира (ступень 1): там стоит лоток PETS.
  const placed = homeLayout([...FURNITURE.filter((x) => x === 'armchair' || x === 'big_tv' || x === 'bookshelf')], true, 1);
  const b = bounds('cafe', 1);
  const boxes: Box[] = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter').map((x) => x.box).filter((x): x is Box => x !== null), ...homeObstacles()];
  const hero = { x: -2, z: 2 };
  const world: CatWorld = { bounds: b, boxes, perches: perchSpots(placed, b, boxes), litterSurface: 0.07, hero, pets, need: () => needs };
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
    const world: CatWorld = { bounds: b, boxes, perches: perchSpots(placed, b, boxes), litterSurface: 0.07, hero: { x: 3, z: 3 }, pets: { bowl: 6, water: 100, litter: 0 }, need: () => ({ fed: 90, play: 15, toilet: 95 }), play: parts };
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

  it('кошка игрока: идёт по стику, по касанию; без дела сидит рядом, а не бродит', () => {
    const { life, world } = home({ fed: 90, play: 90, toilet: 90 });
    world.pet = 'cat1';
    const me = life.cats.get('cat1')!;
    life.place('cat1', { x: -2, z: 2 }, 0);
    const dt = 1 / 20;
    // Стик вправо: кошка поворачивает и идёт (до упора — бегом).
    life.steer(1, 0, 1);
    for (let i = 0; i < 40; i += 1) life.update(i * dt, dt, world, false);
    expect(me.pos.x).toBeGreaterThan(-1.2);
    expect(me.mode).toBe('trot');
    life.steer(0, 0, 0);
    // Касание пола: дошла.
    life.goTo('cat1', { x: -4, z: 3 }, world, 3);
    for (let i = 0; i < 20 * 12; i += 1) life.update(3 + i * dt, dt, world, false);
    expect(Math.hypot(me.pos.x + 4, me.pos.z - 3)).toBeLessThan(0.4);
    expect(life.walking('cat1')).toBe(false);
    // Без дела — на месте (сидит, умывается, дремлет).
    const at = { ...me.pos };
    for (let i = 0; i < 20 * 60; i += 1) life.update(20 + i * dt, dt, world, false);
    expect(Math.hypot(me.pos.x - at.x, me.pos.z - at.z)).toBeLessThan(0.05);
  });

  it('действие кошки игрока: подходит, начинает (сообщает сцене), другая кошка отвечает', () => {
    const { life, world } = home({ fed: 90, play: 90, toilet: 90 });
    world.pet = 'cat1';
    const acted: number[] = [];
    world.onAct = (k) => acted.push(k);
    life.place('cat1', { x: -3, z: 2.5 }, 0);
    life.place('cat2', { x: 0, z: 2.5 }, 0);
    const dt = 1 / 20;
    life.perform('cat1', { key: 7, action: 'rub_cat', at: null, target: 'cat2' }, world, 0);
    const other = life.cats.get('cat2')!;
    const modes = new Set<string>();
    for (let i = 0; i < 20 * 8; i += 1) {
      life.update(i * dt, dt, world, false);
      modes.add(other.mode);
    }
    expect(acted).toEqual([7]);
    expect(['purr', 'belly'].some((m) => modes.has(m))).toBe(true);
    const me = life.cats.get('cat1')!;
    expect(Math.hypot(me.pos.x - other.pos.x, me.pos.z - other.pos.z)).toBeLessThan(1.2);
    life.endJob();
    expect(life.jobKey()).toBe(null);
    // Поспать на диване: запрыгивает на лежанку дивана и засыпает.
    life.perform('cat1', { key: 8, action: 'nap_sofa', at: null, target: null }, world, 10);
    for (let i = 0; i < 20 * 15; i += 1) life.update(10 + i * dt, dt, world, false);
    expect(acted).toContain(8);
    expect(me.y).toBeGreaterThan(0.3);
    expect(['knead', 'sleep']).toContain(me.mode);
    life.endJob();
  });

});

describe('взаимодействие с кошками', () => {
  it('свои забавы; друзья трутся друг о друга, недруги шипят', () => {
    const run = (bond: number) => {
      const { life, world } = home({ fed: 90, play: 30, toilet: 95 });
      world.bond = () => bond;
      const dt = 1 / 20;
      const modes = new Set<string>();
      for (let i = 0; i < 20 * 900; i += 1) {
        life.update(i * dt, dt, world, false);
        for (const c of life.cats.values()) modes.add(c.mode);
      }
      return { modes, log: [...life.cats.values()].map((c) => c.log) };
    };
    const friends = run(90);
    expect(friends.log.reduce((a, l) => a + l.rub, 0)).toBeGreaterThan(0);
    expect(friends.log.reduce((a, l) => a + l.fun, 0)).toBeGreaterThan(0);
    expect(['sniff', 'roll', 'chase', 'stretch', 'knead'].filter((m) => friends.modes.has(m)).length).toBeGreaterThanOrEqual(4);
    expect(friends.modes.has('hiss')).toBe(false);
    const enemies = run(-90);
    expect(enemies.modes.has('hiss')).toBe(true);
  });
});

describe('шаг кошки', () => {
  it('частота шага по скорости: за время опоры корпус проходит ровно ход стопы (стопы не скользят)', async () => {
    const { GAIT, gaitStep, CAT_SCALE } = await import('../src/ui/game/three/cats3d');
    for (const fast of [false, true]) {
      const g = fast ? GAIT.trot : GAIT.walk;
      for (const speed of [0.4, 0.8, 1.8]) {
        for (const size of [CAT_SCALE * 0.6, CAT_SCALE, CAT_SCALE * 1.3]) {
          // Один цикл шага (2π) — сколько секунд и сколько пройдено за опору.
          const period = (2 * Math.PI) / gaitStep(fast, speed, size, 1);
          expect(speed * period * g.stance).toBeCloseTo(g.stride * size, 6);
        }
      }
    }
  });
});
