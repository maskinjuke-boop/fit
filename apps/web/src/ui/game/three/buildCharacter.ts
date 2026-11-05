import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../palette';
import { band, bodyGeometry, frontZ, garmentGeometry, garmentOffset, landmarks, type GarmentId } from './anatomy';
import { buildBack, buildHands, buildNeck, buildShoes, composeOutfit, garmentsFor, headCover, headModel, iconFigure } from './wardrobe';
import { HEAD_GROW, NECK_WORLD, NECK_Y, TORSO_Y, bodyShape } from './body';
import { buildHair, type Cover } from './hair';
import { buildHead, setFace, type Lid } from './head';
import { applyMorph, bodyMorph, bodyValues, heightScale } from './morph';
import { ICON_TILT, defaultPlan, heldModel, holdPose, holdQuaternion, type ItemCtx, type Outfit } from './items3d';
import { M, mesh, retile, shade, texKind, v, type Anim, type Mat } from './kit';
import { buildRig, prepareSkin, type Rig } from './rig';

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
  /** Скелет: ходьба и упражнения (см. rig.ts). */
  rig: Rig;
}

// ─── Кисти ─────────────────────────────────────────────────────────────

/**
 * Точки хвата сжатых кистей модели и направление предмета в них: [правая, левая].
 * Кисти — часть сетки тела (MakeHuman), держащая рука сжата в кулак.
 */
type Grip = { at: THREE.Vector3; axis: THREE.Vector3; outward: THREE.Vector3 };
export function grips(figure: Figure): [Grip, Grip] {
  const L = landmarks(figure);
  const g = (sx: number): Grip => ({ at: v(L.grip[0] * sx, L.grip[1], L.grip[2]), axis: v(L.gripAxis[0] * sx, L.gripAxis[1], L.gripAxis[2]).normalize(), outward: v(sx, 0, 0) });
  return [g(-1), g(1)];
}

/** Ставит предмет в кулак: точка хвата модели — в точку хвата кисти, поворот — по HOLD. */
function holdInFist(o: THREE.Object3D, id: string, hand: Grip): void {
  o.userData.held = id;
  o.position.copy(hand.at);
  o.quaternion.copy(holdQuaternion(hand.axis, hand.outward, holdPose(id)));
}

// ─── Одежда ────────────────────────────────────────────────────────────

/** Во сколько раз реже повторять узор на одежде (фактура кожи — крупнее). */
const GARMENT_TILE: Record<string, number> = { leather: 0.5 };

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
    // Развёртка одежды — в масштабе тела: крупные узоры делаем реального размера.
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
  const fists: [boolean, boolean] = [Boolean(equipped.weapon), Boolean(equipped.offhand)];
  const bodyMesh = new THREE.Mesh(bodyGeometry(figure, fists), bodySkin);
  // Кисти сжимаются в кулак, когда в руках предмет на время действия (props3d).
  bodyMesh.userData.fist = { figure, grips: fists };
  torso.add(bodyMesh);
  const shirt = M.cloth(shade(color, 0.62), 8);
  const pants = M.cloth(female ? '#2f3646' : '#2d3440', 8);
  for (const g of garmentMeshes(figure, outfit, { top: shirt, bottom: pants })) torso.add(g);
  // Ремень на брюках по умолчанию.
  if (!female && !equipped.body && !equipped.legs) {
    torso.add(band(shape, TORSO_Y + 0.02, 0.026, M.leather('#3b2a1e', 4), 0.03));
    torso.add(mesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), M.gold(), [0, TORSO_Y + 0.02, frontZ(figure, 0, TORSO_Y + 0.02, 0.05) + 0.004]));
  }
  torso.add(outfit.group);
  root.add(torso);

  // Кисти, обувь и предметы в руках — вместе с телом.
  const rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }> = [];
  const [right, left] = grips(figure);
  for (const o of buildShoes(shape, equipped, color, (id, m) => {
    const gm = m.clone();
    gm.vertexColors = true;
    return new THREE.Mesh(garmentGeometry(figure, id), gm);
  }))
    torso.add(o);
  // Перчатки и браслеты, украшения на шее, рюкзак или крылья — вместе с телом.
  if (equipped.hands) torso.add(buildHands(equipped.hands, ctx, [Boolean(equipped.weapon), Boolean(equipped.offhand)]));
  if (equipped.neck) torso.add(buildNeck(equipped.neck, ctx));
  if (equipped.back) torso.add(buildBack(equipped.back, ctx));
  // Вещь «в руке» — в правой руке, сумка — в левой: за ручку, гриф, ножку или корпус.
  for (const [id, hand] of [[equipped.weapon, right], [equipped.offhand, left]] as const) {
    if (!id) continue;
    const o = heldModel(id, ctx);
    holdInFist(o, id, hand);
    o.userData.hand = hand === right ? 'r' : 'l';
    torso.add(o);
    rigid.push({ obj: o, anchor: hand.at.clone() });
  }

  // Веса костей — по исходной фигуре (до ползунков).
  const rigidSet = new Set(rigid.map((r) => r.obj));
  prepareSkin(torso, figure, rigidSet);
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
  const clearance = Math.max(0.016, ...garmentsFor(figure, equipped).map((g) => garmentOffset(figure, g))) + 0.03 * grow;
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
  // Скелет: сетки тела и одежды — со скиннингом, голова и предметы — на костях.
  const rig = buildRig(root, torso, headPivot, figure, morph, rigidSet);

  return { root, torso, head: headPivot, lids: face.lids, anim, rig };
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
    case 'head':
      object.add(headModel(id, ctx));
      break;
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
    case 'weapon':
    case 'offhand': {
      // Длинные вещи (ракетка, зонт, гитара) — по диагонали, стаканы и сумки — стоя.
      const w = heldModel(id, ctx);
      w.rotation.z = ICON_TILT[id] ?? 0;
      object.add(w);
      break;
    }
  }
  return { object, anim };
}

/** Какие сетки тела и одежды нужны герою (чтобы подготовить их заранее). */
export { garmentsFor, iconFigure, itemGarments } from './wardrobe';
