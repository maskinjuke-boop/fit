import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../palette';
import { band, bodyGeometry, frontZ, garmentGeometry, garmentOffset, type GarmentId } from './anatomy';
import { HEAD_GROW, NECK_WORLD, NECK_Y, TORSO_Y, bodyShape, type BodyShape } from './body';
import { buildHair, type Cover } from './hair';
import { buildHead, setFace, type Lid } from './head';
import { applyMorph, bodyMorph, bodyValues, heightScale } from './morph';
import { HEAD_COVER, HEAD_GARMENTS, WEAPON_POSE, buildBodyItem, buildHeadItem, buildOffhand, buildWeapon, defaultPlan, garmentsFor, headGarmentMat, type ItemCtx, type Outfit } from './items3d';
import { M, limb, mat, mesh, organ, retile, ring, shade, texKind, v, type Anim, type Mat } from './kit';

export { disposeObject } from './kit';

/**
 * Процедурная 3D-модель персонажа (без файлов моделей): вылепленное цельное тело
 * (мужская или женская фигура), одежда — оболочки того же тела, внешность из настроек
 * и надетые предметы. Персонаж смотрит на +Z, ноги на y = 0.
 */
export interface CharacterParts {
  root: THREE.Group;
  /** Тело с одеждой, кистями, обувью и предметами в руках — «дышит» (масштаб от земли). */
  torso: THREE.Object3D;
  head: THREE.Object3D;
  /** Верхние веки — для моргания. */
  lids: Lid[];
  /** Анимации предметов: вызываются каждый кадр со временем в секундах. */
  anim: Anim[];
}

// ─── Кисти ─────────────────────────────────────────────────────────────

/**
 * Кисть: ладонь, четыре пальца из трёх фаланг и большой палец.
 * Строится как левая (x > 0, ладонь к телу, большой палец вперёд); правая — зеркально.
 * grip — пальцы сжаты (держит предмет), иначе слегка согнуты.
 */
function buildHand(skin: Mat, scale: number, grip: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(1, 20, 14), skin, [0, -0.046, 0], [0.025, 0.05, 0.042]));
  const curl = grip ? [1.25, 1.35, 1.0] : [0.35, 0.45, 0.35];
  const fingers: Array<[number, number, number]> = [
    [0.03, 1, 0.0105],
    [0.01, 1.08, 0.0108],
    [-0.01, 1.0, 0.0102],
    [-0.028, 0.82, 0.0092],
  ];
  for (const [z, len, r] of fingers) {
    let p = v(-0.004, -0.09, z);
    let dir = v(0, -1, 0);
    let angle = 0;
    [0.032, 0.025, 0.02].forEach((segLen, i) => {
      angle += curl[i]!;
      // Сгибаем к ладони (−X) вокруг оси Z.
      dir = v(-Math.sin(angle), -Math.cos(angle), 0);
      const q = p.clone().addScaledVector(dir, segLen * len);
      g.add(limb(p, q, r * (1 - i * 0.12), skin, 8));
      p = q;
    });
  }
  const t0 = v(-0.012, -0.028, 0.036);
  const t1 = t0.clone().add(grip ? v(-0.022, -0.026, 0.012) : v(-0.006, -0.03, 0.014));
  const t2 = t1.clone().add(grip ? v(-0.022, -0.012, -0.012) : v(-0.004, -0.026, 0.004));
  g.add(limb(t0, t1, 0.0125, skin, 8), limb(t1, t2, 0.011, skin, 8));
  g.scale.setScalar(scale);
  return g;
}

/** Кисти на запястьях вылепленных рук. Возвращает точки хвата для предметов: [правая, левая]. */
function addHands(shape: BodyShape, skin: Mat, parent: THREE.Object3D, grips: [boolean, boolean], rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }>): [THREE.Vector3, THREE.Vector3] {
  const anchors: THREE.Vector3[] = [];
  [-1, 1].forEach((sx, i) => {
    const e = v(shape.elbow.x * sx, shape.elbow.y, shape.elbow.z);
    const w = v(shape.wrist.x * sx, shape.wrist.y, shape.wrist.z);
    const dir = w.clone().sub(e).normalize();
    const hand = buildHand(skin, shape.hand, grips[i]!);
    hand.position.copy(w).addScaledVector(dir, 0.006);
    hand.quaternion.setFromUnitVectors(v(0, -1, 0), dir);
    if (sx < 0) hand.scale.x *= -1;
    parent.add(hand);
    rigid.push({ obj: hand, anchor: w.clone() });
    anchors.push(w.clone().addScaledVector(dir, 0.07 * shape.hand).add(v(-0.012 * sx, 0, 0.012)));
  });
  return [anchors[0]!, anchors[1]!];
}

// ─── Обувь ─────────────────────────────────────────────────────────────

type Shoes = 'boots' | 'sneakers' | 'sandals';
const SHOES: Record<string, Shoes> = {
  tracksuit: 'sneakers',
  sport_set: 'sneakers',
  fitness_set: 'sneakers',
  gladiator_armor: 'sandals',
};

/** Радиус голени на высоте y (по вылепленной ноге, с запасом). */
const shinR = (shape: BodyShape, y: number): number => {
  const female = shape.figure === 'female';
  const k = Math.min(1, Math.max(0, (y - 0.1) / 0.5));
  return (female ? 0.04 : 0.045) + ((female ? 0.066 : 0.072) - (female ? 0.04 : 0.045)) * k;
};

function addShoes(shape: BodyShape, kind: Shoes, skin: Mat, color: string, parent: THREE.Object3D): void {
  const f = shape.foot;
  const cr = shape.calfR;
  const leather = M.leather(kind === 'sandals' ? '#6b4428' : '#4a2f1f', 2);
  const sole = mat('#1d1f24', 0.9);
  const upper = M.cloth('#f1f2f4', 8, 0.8);
  const white = mat('#fafafa', 0.55);
  const accent = M.cloth(color, 4, 0.6);
  for (const sx of [-1, 1]) {
    const x = shape.legX * 1.06 * sx;
    if (kind === 'boots') {
      // Ботинок: голенище с отворотом, носок, каблук и подошва.
      parent.add(organ(v(x, 0.05, 0), v(x, 0.36, 0), [[0, cr * 0.95], [0.6, cr * 0.84], [1, cr * 0.88]], leather, { grow: 0.012 }));
      parent.add(ring(cr * 0.92, 0.018, leather, 0.36, 1, 1).translateX(x));
      parent.add(mesh(new THREE.SphereGeometry(1, 24, 16), leather, [x, 0.07, 0.065 * f], [0.078 * f, 0.068, 0.15 * f]));
      parent.add(mesh(new THREE.SphereGeometry(1, 16, 12), leather, [x, 0.06, 0.17 * f], [0.065 * f, 0.05, 0.06 * f]));
      parent.add(mesh(new THREE.CylinderGeometry(1, 1, 0.026, 28), sole, [x, 0.013, 0.06 * f], [0.084 * f, 1, 0.17 * f]));
      parent.add(mesh(new THREE.BoxGeometry(0.11 * f, 0.03, 0.06), sole, [x, 0.03, -0.05 * f]));
    } else if (kind === 'sneakers') {
      // Кроссовок: низкий верх, мягкий язычок, белая подошва и полоса цвета героя.
      parent.add(organ(v(x, 0.05, -0.005), v(x, 0.17, -0.01), [[0, cr * 0.86], [1, cr * 0.74]], upper, { grow: 0.012 }));
      parent.add(ring(cr * 0.74 + 0.006, 0.013, accent, 0.17, 1, 1).translateX(x).translateZ(-0.01));
      parent.add(mesh(new THREE.SphereGeometry(1, 24, 16), upper, [x, 0.068, 0.06 * f], [0.074 * f, 0.064, 0.15 * f]));
      parent.add(mesh(new THREE.SphereGeometry(1, 16, 12), upper, [x, 0.056, 0.165 * f], [0.064 * f, 0.046, 0.065 * f]));
      parent.add(mesh(new THREE.SphereGeometry(1, 12, 10), upper, [x, 0.115, 0.1 * f], [0.04, 0.05, 0.06]).rotateX(-0.6));
      parent.add(mesh(new THREE.CylinderGeometry(1, 1.04, 0.034, 32), white, [x, 0.017, 0.06 * f], [0.082 * f, 1, 0.172 * f]));
      // Полоса по боку кроссовка.
      for (const side of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([v(x + side * 0.066 * f, 0.05, -0.04), v(x + side * 0.074 * f, 0.075, 0.04), v(x + side * 0.066 * f, 0.06, 0.13 * f)]);
        parent.add(new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.008, 6), accent));
      }
    } else {
      // Сандалии гладиатора: стопа, подошва, ремешки и шнуровка до поножей.
      parent.add(mesh(new THREE.SphereGeometry(1, 20, 12), skin, [x, 0.045, 0.07 * f], [0.05 * f, 0.04, 0.125 * f]));
      parent.add(mesh(new THREE.SphereGeometry(1, 16, 10), skin, [x, 0.034, 0.17 * f], [0.048 * f, 0.026, 0.04 * f]));
      parent.add(mesh(new THREE.CylinderGeometry(1, 1, 0.018, 28), leather, [x, 0.009, 0.075 * f], [0.064 * f, 1, 0.165 * f]));
      for (const [z, ry] of [
        [0.14, 0.04],
        [0.05, 0.052],
      ] as const) {
        const s = new THREE.Mesh(new THREE.TorusGeometry(0.056 * f, 0.01, 6, 20, Math.PI), leather);
        s.position.set(x, 0.012, z * f);
        s.scale.y = ry / (0.056 * f);
        parent.add(s);
      }
      parent.add(ring(shinR(shape, 0.12) + 0.008, 0.012, leather, 0.11, 1, 1).translateX(x));
      // Шнуровка крест-накрест вверх по голени.
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i += 1) {
        const t = i / 40;
        const y = 0.11 + t * 0.22;
        const a = t * Math.PI * 4 + (sx > 0 ? 0 : Math.PI);
        const r = shinR(shape, y) + 0.011;
        pts.push(v(x + Math.sin(a) * r, y, Math.cos(a) * r));
      }
      parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.007, 6), leather));
    }
  }
}

// ─── Одежда ────────────────────────────────────────────────────────────

/** Во сколько раз реже повторять узор на одежде (кольца кольчуги ~2 см, чешуя ~3 см). */
const GARMENT_TILE: Record<string, number> = { mail: 0.12, scales: 0.25, leather: 0.5 };

/**
 * Сетки одежды по плану: верх, низ и слои поверх. defaults — базовая одежда героя
 * (футболка и брюки), если предмет её не заменяет; null — только одежда предмета (иконка).
 */
function garmentMeshes(figure: Figure, outfit: Outfit, defaults: { top: Mat; bottom: Mat } | null): THREE.Mesh[] {
  const def = defaultPlan(figure);
  const { plan } = outfit;
  const out: THREE.Mesh[] = [];
  const add = (id: GarmentId, m: Mat): void => {
    // У сеток одежды есть затенение складок в цвете вершин — нужен свой экземпляр материала.
    const gm = m.clone();
    gm.vertexColors = true;
    // Развёртка одежды — в масштабе тела: крупные узоры (кольца, чешуя) делаем реального размера.
    for (const slot of ['map', 'bumpMap', 'roughnessMap'] as const) {
      const t = gm[slot];
      const k = GARMENT_TILE[texKind(t) ?? ''];
      if (t && k) gm[slot] = retile(t, k);
    }
    out.push(new THREE.Mesh(garmentGeometry(figure, id), gm));
  };
  const fallback = (): Mat => M.cloth('#8a8f98', 8);
  if (plan.top) add(plan.top, outfit.top ?? defaults?.top ?? fallback());
  else if (plan.top === undefined && defaults) add(def.top, defaults.top);
  if (plan.bottom) add(plan.bottom, outfit.bottom ?? defaults?.bottom ?? fallback());
  else if (defaults) add(def.bottom, defaults.bottom);
  (plan.layers ?? []).forEach((id, i) => add(id, outfit.layers[i] ?? outfit.layers[0] ?? fallback()));
  return out;
}

/** Накидка головного убора на плечах (в координатах тела). */
function headGarmentMeshes(figure: Figure, headItem: string): THREE.Mesh[] {
  return (HEAD_GARMENTS[headItem] ?? []).map((id) => {
    const m = headGarmentMat(headItem);
    m.vertexColors = true;
    m.side = THREE.DoubleSide;
    return new THREE.Mesh(garmentGeometry(figure, id), m);
  });
}

// ─── Сборка ────────────────────────────────────────────────────────────

export function buildCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>): CharacterParts {
  const root = new THREE.Group();
  setFace(appearance.face);
  const shape = bodyShape(appearance.figure);
  const figure = shape.figure;
  const female = figure === 'female';
  const skinTone = SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
  const eyeColor = EYE_COLORS[appearance.eyes ?? 0] ?? EYE_COLORS[0];
  const skin = M.skin(skinTone.base);
  const anim: Anim[] = [];
  const ctx: ItemCtx = { color, shape, anim };
  const outfit: Outfit = equipped.body ? buildBodyItem(equipped.body, ctx) : { group: new THREE.Group(), plan: {}, layers: [] };

  // Тело — одна вылепленная сетка (с затенением складок в цвете вершин), поверх — одежда.
  const torso = new THREE.Group();
  const bodySkin = M.skin(skinTone.base);
  bodySkin.vertexColors = true;
  torso.add(new THREE.Mesh(bodyGeometry(figure), bodySkin));
  const shirt = M.cloth(shade(color, 0.62), 8);
  const pants = M.cloth(female ? '#2f3646' : '#2d3440', 8);
  for (const g of garmentMeshes(figure, outfit, { top: shirt, bottom: pants })) torso.add(g);
  // Ремень на брюках, если предмет не добавляет свой пояс.
  if (!female && (!equipped.body || equipped.body === 'traveler_cloak')) {
    torso.add(band(shape, TORSO_Y + 0.02, 0.026, M.leather('#3b2a1e', 4), 0.03));
    torso.add(mesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), M.gold(), [0, TORSO_Y + 0.02, frontZ(figure, 0, TORSO_Y + 0.02, 0.05) + 0.004]));
  }
  torso.add(outfit.group);
  if (equipped.head) for (const g of headGarmentMeshes(figure, equipped.head)) torso.add(g);
  root.add(torso);

  // Кисти, обувь и предметы в руках — вместе с телом.
  const rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }> = [];
  const [right, left] = addHands(shape, skin, torso, [Boolean(equipped.weapon), Boolean(equipped.offhand)], rigid);
  addShoes(shape, (equipped.body && SHOES[equipped.body]) || 'boots', skin, color, torso);
  if (equipped.weapon) {
    const w = buildWeapon(equipped.weapon, ctx);
    w.position.copy(right);
    const [rx, ry, rz] = WEAPON_POSE[equipped.weapon] ?? [0.25, 0, 0];
    w.rotation.set(rx, ry, rz);
    torso.add(w);
    rigid.push({ obj: w, anchor: right.clone() });
  }
  if (equipped.offhand) {
    const o = buildOffhand(equipped.offhand, ctx);
    o.position.copy(left);
    torso.add(o);
    rigid.push({ obj: o, anchor: left.clone() });
  }

  // Ползунки тела: деформация тела вместе с одеждой; рост — масштаб от земли.
  const morph = bodyMorph(shape, appearance);
  if (morph) applyMorph(torso, morph, rigid);
  root.scale.setScalar(heightScale(appearance));

  // Голова с лицом, причёска и головной убор (в собственных координатах головы).
  const head = new THREE.Group();
  const face = buildHead(figure, skinTone.base, skinTone.shade, hairColor, eyeColor, appearance.beard);
  head.add(face.group);
  const cover: Cover = equipped.head ? HEAD_COVER[equipped.head] ?? 'none' : 'none';
  // Длинные пряди ложатся поверх одежды: зазор — по самому толстому надетому слою.
  const bv = bodyValues(appearance);
  const grow = Math.round(Math.max(0, bv.chest, bv.shoulders, bv.neck) * 6) / 6;
  const clearance = Math.max(0.016, ...garmentsFor(figure, equipped.body, equipped.head).filter((g) => g !== 'bracers' && g !== 'greaves').map((g) => garmentOffset(figure, g))) + 0.03 * grow;
  head.add(buildHair(appearance.hair, M.hair(hairColor), cover, figure, clearance));
  if (equipped.head) head.add(buildHeadItem(equipped.head, ctx));
  head.position.y = -NECK_Y;
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_WORLD;
  headPivot.userData.baseY = NECK_WORLD;
  headPivot.scale.setScalar(HEAD_GROW);
  headPivot.add(head);
  root.add(headPivot);
  setFace(undefined);

  return { root, torso, head: headPivot, lids: face.lids, anim };
}

/** Отдельная модель предмета для иконки магазина (без персонажа). */
export function buildItemModel(id: string, slot: Slot, color: string, figure: Figure): { object: THREE.Group; anim: Anim[] } {
  const anim: Anim[] = [];
  const shape = bodyShape(figure);
  const ctx: ItemCtx = { color, shape, anim };
  const object = new THREE.Group();
  switch (slot) {
    case 'head': {
      object.add(buildHeadItem(id, ctx));
      // Накидка строится по телу — переводим её в координаты головы.
      const capes = headGarmentMeshes(figure, id);
      if (capes.length) {
        const wrap = new THREE.Group();
        wrap.scale.setScalar(1 / HEAD_GROW);
        wrap.position.y = NECK_Y - NECK_WORLD / HEAD_GROW;
        wrap.add(...capes);
        object.add(wrap);
      }
      break;
    }
    case 'body': {
      // Одежда предмета на «невидимом манекене»: те же оболочки, что и на герое.
      const o = buildBodyItem(id, ctx);
      object.add(o.group);
      for (const g of garmentMeshes(figure, o, null)) object.add(g);
      break;
    }
    case 'weapon': {
      const w = buildWeapon(id, ctx);
      // Длинное оружие — по диагонали, как на классических иконках.
      w.rotation.z = id === 'iron_dumbbell' || id === 'jump_rope' ? 0 : id === 'hunter_bow' ? -0.35 : -Math.PI / 4;
      if (id === 'iron_dumbbell') w.rotation.set(0.3, 0.5, 0.35);
      object.add(w);
      break;
    }
    case 'offhand':
      object.add(buildOffhand(id, ctx));
      break;
  }
  return { object, anim };
}

/** Какие сетки тела и одежды нужны предмету для иконки (чтобы подготовить их заранее). */
export { garmentsFor, outfitPlan } from './items3d';
