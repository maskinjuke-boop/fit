import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../palette';
import { band, bodyGeometry, coverDepth, frontZ, garmentGeometry, garmentOffset, landmarks, type GarmentId } from './anatomy';
import { buildBack, buildHands, buildNeck, buildShoes, composeOutfit, garmentsFor, headCover, headModel, iconFigure } from './wardrobe';
import { HEAD_GROW, HEAD_R, HEAD_SCALE, HEAD_Y, NECK_WORLD, NECK_Y, TORSO_Y, bodyShape } from './body';
import { buildHair, type Cover } from './hair';
import { buildHead, setFace, type Lid } from './head';
import { applyMorph, bodyMorph, bodyValues, faceFat, headFatScale, HEAVY_ARM_OUT, heavyValue, heightScale } from './morph';
import { ICON_TILT, defaultPlan, heldModel, holdPose, holdQuaternion, type ItemCtx, type Outfit } from './items3d';
import { M, mesh, retile, shade, texKind, v, type Anim, type Mat } from './kit';
import { BONES, buildRig, joints, prepareSkin, type Rig } from './rig';
import { applySkinTexture } from './skinTex';
import type { Expression, FaceCtl } from './face';
import { buildToon, toonModelFor, toonReady } from './toonPeople';
import { addOutlines } from './outline';

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
  /** Мимика. */
  face: FaceCtl;
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
    const me = new THREE.Mesh(garmentGeometry(figure, id), gm);
    me.userData.garment = id;
    out.push(me);
  };
  const fallback = (): Mat => M.cloth('#8a8f98', 8);
  if (plan.top) add(plan.top, outfit.top ?? defaults?.top ?? fallback());
  else if (plan.top === undefined && defaults) add(def.top, defaults.top);
  if (plan.bottom) add(plan.bottom, outfit.bottom ?? defaults?.bottom ?? fallback());
  else if (defaults) add(def.bottom, defaults.bottom);
  (plan.layers ?? []).forEach((id, i) => add(id, outfit.layers[i] ?? outfit.layers[0] ?? fallback()));
  return out;
}

/**
 * У очень полных тело под одеждой чуть утоплено (по нормали, вдали от краёв одежды): раздувание
 * и сгибы растягивают зазор неравномерно, и без этого кожа местами проступает сквозь ткань.
 */
function sinkUnderClothes(body: THREE.Mesh, figure: Figure, ids: GarmentId[], depth: number): void {
  if (!ids.length) return;
  const geo = body.geometry.clone();
  // Сетка та же (сдвиг по нормали): сглаженные доли рук в morph берутся от исходной.
  geo.userData = { morphSrc: body.geometry };
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const cov = coverDepth(figure, ids, geo);
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i += 1) {
    const k = cov[i]! * depth;
    if (k <= 0) continue;
    pos.setXYZ(i, pos.getX(i) - nor.getX(i) * k, pos.getY(i) - nor.getY(i) * k, pos.getZ(i) - nor.getZ(i) * k);
  }
  body.geometry = geo;
}

// ─── Сборка ────────────────────────────────────────────────────────────

/** Полнота лица: у полных учеников (heavy) и при большом весе на ползунке. */
export const faceFatOf = faceFat;

/** Особые настройки (монстры-гуманоиды): свой цвет кожи. */
export interface CharacterOptions {
  skin?: { base: string; shade: string };
}

export function buildCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>, opts: CharacterOptions = {}): CharacterParts {
  // Мульт-люди (готовые модели), пока они не загружены — прежняя модель MakeHuman.
  const toon = buildToonCharacter(appearance, color, equipped, opts);
  if (toon) return toon;
  const root = new THREE.Group();
  setFace(appearance.face, faceFatOf(appearance));
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
  // Текстура кожи MakeHuman (если загружена): поры, оттенки, губы, ногти.
  applySkinTexture(bodySkin, figure, skinTone.base);
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
  const clothes = garmentMeshes(figure, outfit, { top: shirt, bottom: pants });
  for (const g of clothes) torso.add(g);
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
  const heavyK = heavyValue(appearance);
  if (morph && heavyK > 0) sinkUnderClothes(bodyMesh, figure, clothes.map((g) => g.userData.garment as GarmentId), 0.016 * heavyK);
  if (morph) {
    const under = heavyValue(appearance) > 0 ? bodyMorph(shape, appearance, true) : null;
    applyMorph(torso, morph, rigid, under ? new Map([[bodyMesh, under]]) : undefined);
  }
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
  // У полных голова крупнее — под стать телу.
  headPivot.scale.setScalar(HEAD_GROW * headFatScale(faceFat(appearance)));
  headPivot.add(head);
  root.add(headPivot);
  setFace(undefined);
  // Скелет: сетки тела и одежды — со скиннингом, голова и предметы — на костях.
  const rig = buildRig(root, torso, headPivot, figure, morph, rigidSet);
  // Очень полные держат руки в стороны — иначе руки входят в корпус.
  const heavy = heavyValue(appearance);
  if (heavy > 0) {
    rig.armOut = heavy * HEAVY_ARM_OUT;
    rig.bulk = heavy;
  }

  return { root, torso, head: headPivot, lids: face.lids, anim, rig, face: face.face };
}

// ─── Мульт-люди ────────────────────────────────────────────────────────

/** Голова мульт-персонажа относительно головы модели при её масштабе по плечам. */
const TOON_HEAD = 0.72;

/**
 * Моргание и мимика мульт-лица: глаза сжимаются по высоте. Веко — пустой объект: его поворот
 * (как у век прежней головы) — доля закрытия; сон, напряжение и улыбка прищуривают глаза.
 */
function toonFace(eyes: THREE.Mesh[]): { lids: Lid[]; face: FaceCtl } {
  const blink = new THREE.Object3D();
  let close = 0;
  let target = 0;
  const SQUINT: Partial<Record<Expression, number>> = { sleep: 1, effort: 0.35, strain: 0.4, tired: 0.45, focus: 0.15, smile: 0.25 };
  for (const e of eyes) {
    e.onBeforeRender = () => {
      const shut = Math.max(0, Math.min(1, blink.rotation.x));
      const open = (1 - shut) * (1 - close);
      const sy = 0.1 + 0.9 * open;
      if (Math.abs(e.scale.y - sy) > 1e-3) {
        e.scale.y = sy;
        e.updateMatrixWorld();
      }
    };
  }
  return {
    lids: [{ obj: blink, open: 0, closed: 1 }],
    face: {
      want(e, w = 1) {
        target = e ? (SQUINT[e] ?? 0) * Math.max(0, Math.min(1, w)) : 0;
      },
      update(dt) {
        close += (target - close) * (1 - Math.exp(-dt * 6));
      },
    },
  };
}

function buildToonCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>, opts: CharacterOptions): CharacterParts | null {
  const shape = bodyShape(appearance.figure);
  const figure = shape.figure;
  const model = toonModelFor(figure, appearance.hair);
  if (!toonReady(model)) return null;
  const root = new THREE.Group();
  const female = figure === 'female';
  const skinTone = opts.skin ?? SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
  const anim: Anim[] = [];
  const ctx: ItemCtx = { color, shape, anim };
  const outfit: Outfit = composeOutfit(equipped, ctx);
  const morph = bodyMorph(shape, appearance);
  // Суставы игры: без ползунков (масштаб модели) и с ними (как в buildRig).
  const J0 = joints(figure);
  const J = joints(figure);
  if (morph) for (const b of BONES) morph(J[b]);
  const bv = bodyValues(appearance);
  const heavy = heavyValue(appearance);
  const toon = buildToon(model, J, J0, { weight: bv.weight, heavy, muscle: bv.muscle }, TOON_HEAD)!;
  // Цвета: кожа и волосы — из внешности, верх и низ — из надетой одежды (или цвет героя).
  const set = (name: string, c: THREE.ColorRepresentation): void => {
    toon.mats.get(name)?.color.set(c);
  };
  set('Skin', skinTone.base);
  set('Hair', hairColor);
  const top = outfit.top ?? outfit.layers[0];
  set('Shirt', top ? top.color.clone() : shade(color, 0.62));
  const bottom = outfit.bottom ?? (equipped.legs ? outfit.layers[outfit.layers.length - 1] : undefined);
  set('Pants', bottom ? bottom.color.clone() : female ? '#2f3646' : '#2d3440');
  set('Belt', '#2a2320');
  set('Face', '#1d1714');

  const torso = new THREE.Group();
  root.add(torso);
  // Перчатки и браслеты, украшения на шее, рюкзак или крылья и предметы в руках — как у прежней модели.
  const rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }> = [];
  const [right, left] = grips(figure);
  if (equipped.hands) torso.add(buildHands(equipped.hands, ctx, [Boolean(equipped.weapon), Boolean(equipped.offhand)]));
  if (equipped.neck) torso.add(buildNeck(equipped.neck, ctx));
  if (equipped.back) torso.add(buildBack(equipped.back, ctx));
  for (const [id, hand] of [[equipped.weapon, right], [equipped.offhand, left]] as const) {
    if (!id) continue;
    const o = heldModel(id, ctx);
    holdInFist(o, id, hand);
    o.userData.hand = hand === right ? 'r' : 'l';
    torso.add(o);
    rigid.push({ obj: o, anchor: hand.at.clone() });
  }
  const rigidSet = new Set(rigid.map((r) => r.obj));
  prepareSkin(torso, figure, rigidSet);
  if (morph) applyMorph(torso, morph, rigid);
  // Тело модели — уже на суставах игры и с весами её костей.
  toon.body.geometry.userData.skinFigure = figure;
  toon.body.castShadow = true;
  torso.add(toon.body);
  root.scale.setScalar(heightScale(appearance));

  // Голова — на шее (координаты от сустава шеи), головной убор — по размеру мульт-головы.
  const headPivot = new THREE.Group();
  headPivot.position.copy(J.neck);
  headPivot.userData.baseY = J.neck.y;
  headPivot.add(toon.head);
  if (equipped.head) {
    const skin = toon.head.children.filter((c) => c.name === 'toon-head-Skin');
    const box = new THREE.Box3();
    for (const c of skin) box.expandByObject(c);
    if (!box.isEmpty()) {
      const k = (box.max.x - box.min.x) / (2 * HEAD_R * HEAD_SCALE.x * HEAD_GROW);
      const hat = new THREE.Group();
      hat.scale.setScalar(HEAD_GROW * k);
      const topLocal = HEAD_Y + HEAD_R * HEAD_SCALE.y;
      hat.position.set(0, box.max.y - HEAD_GROW * k * topLocal, (box.min.z + box.max.z) / 2 - HEAD_GROW * k * 0.0);
      hat.add(headModel(equipped.head, ctx));
      headPivot.add(hat);
      // Под шапкой и шлемом волосы прячутся.
      if (headCover(equipped.head) === 'helm') for (const c of toon.head.children) if (c.name === 'toon-head-Hair') c.visible = false;
    }
  }
  root.add(headPivot);
  const rig = buildRig(root, torso, headPivot, figure, morph, rigidSet);
  if (heavy > 0) {
    rig.armOut = heavy * HEAVY_ARM_OUT;
    rig.bulk = heavy;
  }
  const f = toonFace(toon.eyes);
  // Мульт-контур (после скелета: сетки уже со скиннингом).
  addOutlines(root, { thickness: 0.014 });
  return { root, torso, head: headPivot, lids: f.lids, anim, rig, face: f.face };
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
