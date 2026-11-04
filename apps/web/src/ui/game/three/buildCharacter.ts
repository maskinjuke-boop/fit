import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../palette';
import { band, bodyGeometry, frontZ, garmentGeometry, garmentOffset, landmarks, type GarmentId } from './anatomy';
import { WEAPON_TILT_EXTRA, buildBack, iconFigure, buildHands, buildNeck, buildShoes, composeOutfit, garmentsFor, headCover, headModel, offhandModel, weaponModel } from './wardrobe';
import { HEAD_GROW, NECK_WORLD, NECK_Y, TORSO_Y, bodyShape, type BodyShape } from './body';
import { buildHair, type Cover } from './hair';
import { buildHead, setFace, type Lid } from './head';
import { applyMorph, bodyMorph, bodyValues, heightScale } from './morph';
import { HEAD_GARMENTS, defaultPlan, headGarmentMat, type ItemCtx, type Outfit } from './items3d';
import { M, limb, mesh, retile, shade, texKind, v, type Anim, type Mat } from './kit';

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

/** Наклон оружия в кулаке вверх от оси рукояти (рад): рукоять в кулаке смотрит вперёд. */
const WEAPON_TILT: Record<string, number> = { spear: 1.15, hunter_bow: 1.3, magic_wand: 0.45 };

/** Щиты держат за рукоять с внутренней стороны; остальное во второй руке — как оружие. */
const SHIELDS = new Set(['wooden_shield', 'iron_shield', 'tower_shield', 'buckler']);
const OFFHAND_TILT: Record<string, number> = { torch: 1.2, lantern: 1.45, spell_tome: 1.45, crystal_orb: 1.45, healing_flask: 1.45, love_potion: 1.45, war_horn: 1.2, lute: 1.3 };

/**
 * Точки хвата сжатых кистей модели и направление предмета в них: [правая, левая].
 * Кисти — часть сетки тела (MakeHuman), держащая рука сжата в кулак.
 */
type Grip = { at: THREE.Vector3; axis: THREE.Vector3 };
function grips(shape: BodyShape): [Grip, Grip] {
  const L = landmarks(shape.figure);
  const g = (sx: number): Grip => ({ at: v(L.grip[0] * sx, L.grip[1], L.grip[2]), axis: v(L.gripAxis[0] * sx, L.gripAxis[1], L.gripAxis[2]).normalize() });
  return [g(-1), g(1)];
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

/** Особые настройки (монстры-гуманоиды): свой цвет кожи. */
export interface CharacterOptions {
  skin?: { base: string; shade: string };
}

export function buildCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>, opts: CharacterOptions = {}): CharacterParts {
  const root = new THREE.Group();
  setFace(appearance.face);
  const shape = bodyShape(appearance.figure);
  const figure = shape.figure;
  const female = figure === 'female';
  const skinTone = opts.skin ?? SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
  const eyeColor = EYE_COLORS[appearance.eyes ?? 0] ?? EYE_COLORS[0];
  const anim: Anim[] = [];
  const ctx: ItemCtx = { color, shape, anim };
  const outfit: Outfit = composeOutfit(equipped, ctx);

  // Тело — одна сетка (с затенением складок в цвете вершин), поверх — одежда.
  const torso = new THREE.Group();
  const bodySkin = M.skin(skinTone.base);
  bodySkin.vertexColors = true;
  // Полоса шеи под краем головы начинается прямо от шва: тело чуть «отодвинуто» по глубине,
  // чтобы на шве всегда была видна голова (без мерцания полосы сквозь кожу).
  bodySkin.polygonOffset = true;
  bodySkin.polygonOffsetFactor = 1;
  bodySkin.polygonOffsetUnits = 2;
  torso.add(new THREE.Mesh(bodyGeometry(figure, [Boolean(equipped.weapon), Boolean(equipped.offhand)]), bodySkin));
  const shirt = M.cloth(shade(color, 0.62), 8);
  const pants = M.cloth(female ? '#2f3646' : '#2d3440', 8);
  for (const g of garmentMeshes(figure, outfit, { top: shirt, bottom: pants })) torso.add(g);
  // Ремень на брюках, если предмет не добавляет свой пояс.
  if (!female && (!equipped.body || equipped.body === 'traveler_cloak') && !equipped.legs) {
    torso.add(band(shape, TORSO_Y + 0.02, 0.026, M.leather('#3b2a1e', 4), 0.03));
    torso.add(mesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), M.gold(), [0, TORSO_Y + 0.02, frontZ(figure, 0, TORSO_Y + 0.02, 0.05) + 0.004]));
  }
  torso.add(outfit.group);
  if (equipped.head) for (const g of headGarmentMeshes(figure, equipped.head)) torso.add(g);
  root.add(torso);

  // Кисти, обувь и предметы в руках — вместе с телом.
  const rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }> = [];
  const [right, left] = grips(shape);
  for (const o of buildShoes(shape, equipped, color, (id, m) => {
    const gm = m.clone();
    gm.vertexColors = true;
    return new THREE.Mesh(garmentGeometry(figure, id), gm);
  }))
    torso.add(o);
  // Перчатки и браслеты, украшения на шее, плащ или крылья — вместе с телом.
  if (equipped.hands) torso.add(buildHands(equipped.hands, ctx, [Boolean(equipped.weapon), Boolean(equipped.offhand)]));
  if (equipped.neck) torso.add(buildNeck(equipped.neck, ctx));
  if (equipped.back) torso.add(buildBack(equipped.back, ctx));
  if (equipped.weapon) {
    const w = weaponModel(equipped.weapon, ctx);
    w.position.copy(right.at);
    const t = WEAPON_TILT[equipped.weapon] ?? WEAPON_TILT_EXTRA[equipped.weapon] ?? 0.75;
    w.quaternion.setFromUnitVectors(v(0, 1, 0), right.axis.clone().multiplyScalar(Math.cos(t)).add(v(0, Math.sin(t), 0)).normalize());
    torso.add(w);
    rigid.push({ obj: w, anchor: right.at.clone() });
  }
  if (equipped.offhand) {
    const id = equipped.offhand;
    const o = offhandModel(id, ctx);
    o.position.copy(left.at);
    if (SHIELDS.has(id)) {
      // Щит — снаружи предплечья, лицом в сторону; поперечная рукоять проходит через кулак.
      o.quaternion.setFromAxisAngle(v(0, 1, 0), Math.PI / 2);
      const strap = M.leather('#3d2a1c', 1);
      o.add(limb(v(-0.07, 0, 0), v(0.07, 0, 0), 0.016, strap));
      for (const x of [-0.07, 0.07]) o.add(limb(v(x, 0, 0), v(x, 0, 0.09), 0.012, strap));
    } else {
      // Остальное — рукоятью в кулаке, как оружие (наклон вверх от оси хвата).
      const t = OFFHAND_TILT[id] ?? 0.9;
      o.quaternion.setFromUnitVectors(v(0, 1, 0), left.axis.clone().multiplyScalar(Math.cos(t)).add(v(0, Math.sin(t), 0)).normalize());
    }
    torso.add(o);
    rigid.push({ obj: o, anchor: left.at.clone() });
  }

  // Ползунки тела: деформация тела вместе с одеждой; рост — масштаб от земли.
  const morph = bodyMorph(shape, appearance);
  if (morph) applyMorph(torso, morph, rigid);
  root.scale.setScalar(heightScale(appearance));

  // Голова с лицом, причёска и головной убор (в собственных координатах головы).
  const head = new THREE.Group();
  const face = buildHead(figure, skinTone.base, skinTone.shade, hairColor, eyeColor, appearance.beard);
  head.add(face.group);
  const cover: Cover = headCover(equipped.head);
  // Длинные пряди ложатся поверх одежды: зазор — по самому толстому надетому слою.
  const bv = bodyValues(appearance);
  const grow = Math.round(Math.max(0, bv.chest, bv.shoulders, bv.neck) * 6) / 6;
  const clearance = Math.max(0.016, ...garmentsFor(figure, equipped).filter((g) => g !== 'bracers' && g !== 'greaves').map((g) => garmentOffset(figure, g))) + 0.03 * grow;
  head.add(buildHair(appearance.hair, M.hair(hairColor), cover, figure, clearance));
  if (equipped.head) head.add(headModel(equipped.head, ctx));
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
export function buildItemModel(id: string, slot: Slot, color: string, forFigure: Figure): { object: THREE.Group; anim: Anim[] } {
  const figure = iconFigure(id, slot, forFigure);
  const anim: Anim[] = [];
  const shape = bodyShape(figure);
  const ctx: ItemCtx = { color, shape, anim };
  const object = new THREE.Group();
  const garment = (gid: GarmentId, m: Mat): THREE.Mesh => {
    const gm = m.clone();
    gm.vertexColors = true;
    return new THREE.Mesh(garmentGeometry(figure, gid), gm);
  };
  switch (slot) {
    case 'head': {
      object.add(headModel(id, ctx));
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
    case 'body':
    case 'legs': {
      // Одежда предмета на «невидимом манекене»: те же оболочки, что и на герое.
      const o = composeOutfit({ [slot]: id }, ctx);
      object.add(o.group);
      for (const g of garmentMeshes(figure, o, null)) object.add(g);
      break;
    }
    case 'feet':
      for (const o of buildShoes(shape, { feet: id }, color, garment)) object.add(o);
      break;
    case 'hands':
      object.add(buildHands(id, ctx, [false, false]));
      break;
    case 'neck':
      object.add(buildNeck(id, ctx));
      break;
    case 'back':
      object.add(buildBack(id, ctx));
      break;
    case 'weapon': {
      const w = weaponModel(id, ctx);
      // Длинное оружие — по диагонали, как на классических иконках.
      w.rotation.z = id === 'leather_whip' ? 0 : id === 'hunter_bow' ? -0.35 : -Math.PI / 4;
      object.add(w);
      break;
    }
    case 'offhand':
      object.add(offhandModel(id, ctx));
      break;
  }
  return { object, anim };
}

/** Какие сетки тела и одежды нужны герою (чтобы подготовить их заранее). */
export { garmentsFor, iconFigure, itemGarments } from './wardrobe';
export { outfitPlan } from './items3d';
