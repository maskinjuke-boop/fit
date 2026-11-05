import { Box3, Matrix4, Vector3, type Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/game/items';
import { BODY_PARTS, DEFAULT_APPEARANCE, FACE_PARTS } from '../src/game/state';
import { HAIR_STYLES, HAIR_COLORS, SKIN_TONES } from '../src/ui/game/palette';
import { GARMENT_IDS, bodyGeometry, frontZ, garmentGeometry, isPrepared, prepare } from '../src/ui/game/three/anatomy';
import { TORSO_Y } from '../src/ui/game/three/body';
import { buildCharacter, buildItemModel, disposeObject, garmentsFor, grips } from '../src/ui/game/three/buildCharacter';
import { landmarks } from '../src/ui/game/three/bodyMesh';
import { isMeshHair, meshHairGeometry } from '../src/ui/game/three/hairMesh';
import { eyeAnchor, headPositions, headTris, loopSubdivide, rayRadiusTable } from '../src/ui/game/three/headMesh';
import { sphere, surfaceNets } from '../src/ui/game/three/sdf';

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
          const c = buildCharacter({ figure, skin, hair, hairColor: HAIR_COLORS.length - 1, beard: skin % 2 === 0, eyes: skin }, '#ff5a5f', {});
          expect(meshCount(c.root)).toBeGreaterThan(20);
          expect(c.lids.length).toBe(2);
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

  it('вещи в руке и сумки лежат в кулаке за ручку и не входят в тело', () => {
    const held = ITEMS.filter((i) => i.slot === 'weapon' || i.slot === 'offhand');
    expect(held.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const figure of ['male', 'female'] as const) {
      const body = bodyGeometry(figure, [true, true]);
      const bp = body.getAttribute('position');
      const bn = body.getAttribute('normal');
      const [right, left] = grips(figure);
      for (const item of held) {
        const hand = item.slot === 'weapon' ? right : left;
        const c = buildCharacter({ ...DEFAULT_APPEARANCE, figure }, '#4da3ff', { [item.slot]: item.id });
        c.root.updateMatrixWorld(true);
        let obj: Object3D | undefined;
        c.torso.traverse((o) => {
          if (o.userData.held === item.id) obj = o;
        });
        if (!obj) {
          problems.push(`${figure} ${item.id}: нет модели в руке`);
          continue;
        }
        // Точка хвата кулака — внутри рукояти: в начале координат модели есть тонкая деталь
        // (ручка, гриф, ремешок, дужка, ножка бокала), а не пустота или толстый корпус.
        // Предмет прикреплён к кости кисти: сравниваем положение в мире.
        expect(obj.getWorldPosition(new Vector3()).distanceTo(hand.at.clone().applyMatrix4(c.torso.matrixWorld))).toBeLessThan(1e-5);
        let handle = false;
        obj.updateMatrixWorld(true);
        const toModel = new Matrix4().copy(obj.matrixWorld).invert();
        obj.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh || handle) return;
          const local = new Matrix4().multiplyMatrices(toModel, m.matrixWorld);
          const toMesh = local.clone().invert();
          const origin = new Vector3().applyMatrix4(toMesh);
          m.geometry.computeBoundingBox();
          if (!m.geometry.boundingBox!.clone().expandByScalar(0.004).containsPoint(origin)) return;
          // Деталь тонкая (толщина ручки — не больше 9 см), а не корпус предмета.
          const size = m.geometry.boundingBox!.getSize(new Vector3()).multiply(m.scale);
          if (Math.min(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)) < 0.09) handle = true;
        });
        if (!handle) problems.push(`${figure} ${item.id}: точка хвата не на рукояти`);
        const p = new Vector3();
        // Предмет не входит в тело (бёдра, туловище, руку) дальше чем на 1 см вне кулака и не уходит в землю.
        let minY = 9;
        let inside = 0;
        obj.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const pos = m.geometry.getAttribute('position');
          const step = Math.max(1, Math.floor(pos.count / 150));
          for (let i = 0; i < pos.count; i += step) {
            p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            minY = Math.min(minY, p.y);
            if (p.distanceTo(hand.at) < 0.08) continue;
            let best = Infinity;
            let bi = 0;
            for (let j = 0; j < bp.count; j += 1) {
              const dx = bp.getX(j) - p.x;
              const dy = bp.getY(j) - p.y;
              const dz = bp.getZ(j) - p.z;
              const d = dx * dx + dy * dy + dz * dz;
              if (d < best) {
                best = d;
                bi = j;
              }
            }
            if (best > 0.04 * 0.04) continue;
            const depth = (p.x - bp.getX(bi)) * bn.getX(bi) + (p.y - bp.getY(bi)) * bn.getY(bi) + (p.z - bp.getZ(bi)) * bn.getZ(bi);
            if (depth < -0.01) inside += 1;
          }
        });
        if (inside > 0) problems.push(`${figure} ${item.id}: ${inside} точек внутри тела`);
        if (minY < 0.08) problems.push(`${figure} ${item.id}: касается земли (y = ${minY.toFixed(2)})`);
        disposeObject(c.root);
      }
    }
    expect(problems).toEqual([]);
  });

  it('модель стоит на земле и помещается в кадр', () => {
    const full = buildCharacter({ ...DEFAULT_APPEARANCE, hair: 'curly' }, '#4da3ff', { head: 'cowboy_hat', body: 'latex_catsuit', back: 'angel_wings', weapon: 'acoustic_guitar', offhand: 'gym_bag' });
    full.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(full.root);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.min.y).toBeLessThan(0.05);
    expect(box.max.y).toBeLessThan(3.1);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(1.1);
    disposeObject(full.root);
  });
});

describe('Вылепленное тело и одежда', () => {
  it('поверхность из поля расстояний замкнута и смотрит наружу', () => {
    const s = sphere([0.1, 0.2, -0.05], 0.3);
    const g = surfaceNets((x, y, z) => s.d(x, y, z), { min: [-0.3, -0.2, -0.45], max: [0.5, 0.6, 0.35], step: 0.02 });
    const pos = g.getAttribute('position');
    const idx = g.index!;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    let inward = 0;
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      const m = a.clone().add(b).add(c).divideScalar(3).sub(new Vector3(0.1, 0.2, -0.05));
      if (n.dot(m) <= 0) inward += 1;
    }
    expect(idx.count / 3).toBeGreaterThan(1000);
    expect(inward).toBe(0);
    for (let i = 0; i < pos.count; i += 1) {
      a.fromBufferAttribute(pos, i);
      expect(Math.abs(s.d(a.x, a.y, a.z))).toBeLessThan(0.004);
    }
  });

  it('тело и каждый слой одежды строятся для обеих фигур', () => {
    for (const figure of ['male', 'female'] as const) {
      expect(bodyGeometry(figure).getAttribute('position').count).toBeGreaterThan(5000);
      for (const id of GARMENT_IDS) {
        const g = garmentGeometry(figure, id);
        expect(g.getAttribute('position').count).toBeGreaterThan(100);
        expect(g.getAttribute('color')).toBeTruthy();
      }
    }
  });

  it('женская фигура: грудь закрыта в любом наряде', () => {
    const T = TORSO_Y;
    const skin: Array<[number, number, number]> = [];
    for (const sx of [-1, 1]) {
      for (const dy of [-0.05, 0, 0.05]) {
        const x = 0.086 * sx;
        const y = T + 0.37 + dy;
        skin.push([x, y, frontZ('female', x, y)]);
      }
    }
    const outfits = [undefined, ...ITEMS.filter((i) => i.slot === 'body').map((i) => i.id)];
    const p = new Vector3();
    for (const body of outfits) {
      const layers = garmentsFor('female', { body }).map((g) => garmentGeometry('female', g));
      for (const [x, y, z] of skin) {
        // Ближайшая точка одежды перед кожей.
        let best = Infinity;
        for (const g of layers) {
          const pos = g.getAttribute('position');
          for (let i = 0; i < pos.count; i += 1) {
            p.fromBufferAttribute(pos, i);
            if (p.z < z) continue;
            best = Math.min(best, Math.hypot(p.x - x, p.y - y, p.z - z));
          }
        }
        expect(best).toBeLessThan(0.035);
      }
    }
  });

  it('сетки можно подготовить заранее, без блокировки', async () => {
    await prepare('female', ['shorts', 'sports_bra']);
    expect(isPrepared('female', ['shorts', 'sports_bra'])).toBe(true);
    expect(isPrepared('female', ['shorts', 'greaves', 'sports_bra'])).toBe(isPrepared('female', ['greaves']));
  });
});

describe('Ползунки тела и лица', () => {
  const all = (v: number) => Object.fromEntries(BODY_PARTS.map((k) => [k, v]));
  const allFace = (v: number) => Object.fromEntries(FACE_PARTS.map((k) => [k, v]));

  it('тело меняется вместе с одеждой, общие сетки не портятся', () => {
    for (const figure of ['male', 'female'] as const) {
      const before = Float32Array.from(bodyGeometry(figure).getAttribute('position').array as Float32Array);
      const base = { ...DEFAULT_APPEARANCE, figure, hair: 'long' as const };
      for (const v of [-1, 1]) {
        const c = buildCharacter({ ...base, body: all(v), face: allFace(v) }, '#4da3ff', { body: 'hoodie', weapon: 'tennis_racket', offhand: 'tote_bag' });
        c.root.updateMatrixWorld(true);
        const box = new Box3().setFromObject(c.root);
        expect(box.min.y).toBeGreaterThan(-0.05);
        expect(box.max.y).toBeLessThan(3.2);
        expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(1.2);
        disposeObject(c.root);
      }
      const after = bodyGeometry(figure).getAttribute('position').array as Float32Array;
      expect(after.length).toBe(before.length);
      let same = true;
      for (let i = 0; i < before.length; i += 97) if (before[i] !== after[i]) same = false;
      expect(same).toBe(true);
    }
  });

  it('ползунок «толще» действительно делает часть тела шире', () => {
    const width = (body: Record<string, number>): number => {
      const c = buildCharacter({ ...DEFAULT_APPEARANCE, figure: 'female', body }, '#4da3ff', {});
      const m = c.torso.children.find((o) => (o as Mesh).isMesh) as Mesh;
      const pos = m.geometry.getAttribute('position');
      let w = 0;
      // Ширина талии: самые дальние от оси точки корпуса на её высоте.
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i);
        const x = Math.abs(pos.getX(i));
        if (Math.abs(y - landmarks('female').waist) < 0.02 && x < landmarks('female').waistW * 1.2) w = Math.max(w, x);
      }
      disposeObject(c.root);
      return w;
    };
    const thin = width({ waist: -1 });
    const mid = width({});
    const wide = width({ waist: 1 });
    expect(thin).toBeLessThan(mid - 0.01);
    expect(wide).toBeGreaterThan(mid + 0.01);
  });

  it('рост меняет масштаб героя, а лицо строится при любых значениях', () => {
    const tall = buildCharacter({ ...DEFAULT_APPEARANCE, body: { height: 1 } }, '#4da3ff', {});
    expect(tall.root.scale.y).toBeGreaterThan(1.05);
    disposeObject(tall.root);
    for (const v of [-1, -0.5, 0.5, 1]) {
      const c = buildCharacter({ ...DEFAULT_APPEARANCE, figure: 'female', beard: false, face: allFace(v) }, '#4da3ff', {});
      expect(c.lids.length).toBe(2);
      disposeObject(c.root);
    }
  });
});

describe('Голова MakeHuman', () => {
  const neutral = Object.fromEntries(FACE_PARTS.map((k) => [k, 0])) as Record<(typeof FACE_PARTS)[number], number>;

  it('данные модели читаются, форма головы правдоподобна для обеих фигур', () => {
    const tris = headTris();
    for (const female of [true, false]) {
      const pos = headPositions(female, neutral);
      expect(pos.length / 3).toBeGreaterThan(4000);
      for (let i = 0; i < tris.length; i += 1) expect(tris[i]!).toBeLessThan(pos.length / 3);
      const { c, r } = eyeAnchor(female);
      expect(r).toBeGreaterThan(0.03);
      expect(r).toBeLessThan(0.05);
      expect(c.z).toBeGreaterThan(0.12);
      // Радиусы от центра: макушка, лоб, затылок, виски — в разумных пределах (без ушей).
      const tab = rayRadiusTable(pos, 60, 120);
      for (const v of tab) {
        expect(v).toBeGreaterThan(0.08);
        expect(v).toBeLessThan(0.4);
      }
    }
  });

  it('ползунки лица двигают вершины модели, деление сохраняет форму', () => {
    const base = headPositions(true, neutral);
    for (const k of ['faceWidth', 'cheekbones', 'jaw', 'chin', 'nose', 'lips', 'eyes'] as const) {
      const moved = headPositions(true, { ...neutral, [k]: 1 });
      let d = 0;
      for (let i = 0; i < base.length; i += 1) d = Math.max(d, Math.abs(moved[i]! - base[i]!));
      expect(d).toBeGreaterThan(0.002);
    }
    const sub = loopSubdivide(base, headTris(), new Float32Array(base.length / 3));
    expect(sub.tris.length).toBe(headTris().length * 4);
    const box = (p: Float32Array): number[] => [0, 1, 2].map((c) => Math.max(...Array.from(p).filter((_, i) => i % 3 === c)) - Math.min(...Array.from(p).filter((_, i) => i % 3 === c)));
    const [a, b] = [box(base), box(sub.pos)];
    for (let c = 0; c < 3; c += 1) expect(Math.abs(a[c]! - b[c]!)).toBeLessThan(0.02);
  });
});

describe('Причёски MakeHuman', () => {
  const neutral = Object.fromEntries(FACE_PARTS.map((k) => [k, 0])) as Record<(typeof FACE_PARTS)[number], number>;
  const fit = (cover: 'none' | 'hat' | 'helm') => ({ face: neutral, neutral: true, cover, skull: (d: Vector3, off: number) => d.clone().multiplyScalar(0.2 + off) });

  it('каждая причёска строится для обеих фигур и сидит на голове', () => {
    for (const style of HAIR_STYLES) {
      expect(isMeshHair(style)).toBe(true);
      for (const female of [true, false]) {
        const g = meshHairGeometry(style as never, female, fit('none'));
        expect(g.index!.count).toBeGreaterThan(900);
        const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
        expect(box.max.y).toBeGreaterThan(0.25);
        expect(box.max.y).toBeLessThan(0.4);
        g.dispose();
      }
    }
  });

  it('под шлемом остаются только длинные пряди', () => {
    for (const style of HAIR_STYLES) {
      const g = meshHairGeometry(style as never, true, fit('helm'));
      if (style === 'long' || style === 'ponytail') expect(g.index!.count).toBeGreaterThan(0);
      else expect(g.index!.count).toBe(0);
    }
  });
});
