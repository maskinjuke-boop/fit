import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../palette';
import { band, bodyGeometry, frontZ, garmentGeometry, garmentOffset, landmarks, type GarmentId } from './anatomy';
import { HEAD_GROW, NECK_WORLD, NECK_Y, TORSO_Y, bodyShape, type BodyShape } from './body';
import { buildHair, type Cover } from './hair';
import { buildHead, setFace, type Lid } from './head';
import { applyMorph, bodyMorph, bodyValues, heightScale } from './morph';
import { HEAD_COVER, HEAD_GARMENTS, shoeTop, shoesFor, type Shoes, buildBodyItem, buildHeadItem, buildOffhand, buildWeapon, defaultPlan, garmentsFor, headGarmentMat, type ItemCtx, type Outfit } from './items3d';
import { M, mat, mesh, retile, ring, shade, texKind, v, type Anim, type Mat } from './kit';

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
const WEAPON_TILT: Record<string, number> = { spear: 1.15, hunter_bow: 1.3, magic_wand: 0.45, jump_rope: -1.2 };

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

// ─── Обувь ─────────────────────────────────────────────────────────────

/** Радиус голени на высоте y (по модели ноги, с запасом). */
const shinR = (shape: BodyShape, y: number): number => {
  const y0 = shape.ankle.y + 0.04;
  const y1 = shape.knee.y - 0.1;
  const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return shape.ankleR + (shape.calfR - shape.ankleR) * k + 0.004;
};

/** Обувь — оболочки стопы и голени (сидят по ноге модели), сверху — отворот или кант. */
function addShoes(shape: BodyShape, kind: Shoes, color: string, parent: THREE.Object3D): void {
  const figure = shape.figure;
  const add = (id: GarmentId, m: Mat): void => {
    const gm = m.clone();
    gm.vertexColors = true;
    parent.add(new THREE.Mesh(garmentGeometry(figure, id), gm));
  };
  const top = shoeTop(shape, kind);
  const cuff = (m: Mat, tube: number, extra: number): void => {
    for (const sx of [-1, 1]) {
      const y = top - 0.004;
      const k = (y - shape.ankle.y) / (shape.knee.y - shape.ankle.y);
      const c = shape.ankle.clone().lerp(shape.knee, k);
      parent.add(ring(shinR(shape, y) + extra, tube, m, y, 1, 1).translateX(c.x * sx).translateZ(c.z));
    }
  };
  if (kind === 'boots') {
    const leather = M.leather('#4a2f1f', 2);
    add('boots', leather);
    add('sole', mat('#1d1f24', 0.9));
    cuff(leather, 0.016, 0.02);
  } else if (kind === 'sneakers') {
    add('sneakers', M.cloth('#f1f2f4', 8, 0.8));
    add('sole', mat('#fafafa', 0.55));
    cuff(M.cloth(color, 4, 0.6), 0.011, 0.014);
  } else {
    const leather = M.leather('#6b4428', 2);
    add('sandals', leather);
    add('sole', leather);
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
  const anim: Anim[] = [];
  const ctx: ItemCtx = { color, shape, anim };
  const outfit: Outfit = equipped.body ? buildBodyItem(equipped.body, ctx) : { group: new THREE.Group(), plan: {}, layers: [] };

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
  if (!female && (!equipped.body || equipped.body === 'traveler_cloak')) {
    torso.add(band(shape, TORSO_Y + 0.02, 0.026, M.leather('#3b2a1e', 4), 0.03));
    torso.add(mesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), M.gold(), [0, TORSO_Y + 0.02, frontZ(figure, 0, TORSO_Y + 0.02, 0.05) + 0.004]));
  }
  torso.add(outfit.group);
  if (equipped.head) for (const g of headGarmentMeshes(figure, equipped.head)) torso.add(g);
  root.add(torso);

  // Кисти, обувь и предметы в руках — вместе с телом.
  const rigid: Array<{ obj: THREE.Object3D; anchor: THREE.Vector3 }> = [];
  const [right, left] = grips(shape);
  addShoes(shape, shoesFor(equipped.body), color, torso);
  if (equipped.weapon) {
    const w = buildWeapon(equipped.weapon, ctx);
    w.position.copy(right.at);
    if (equipped.weapon === 'iron_dumbbell') w.quaternion.setFromUnitVectors(v(1, 0, 0), right.axis);
    else {
      const t = WEAPON_TILT[equipped.weapon] ?? 0.75;
      w.quaternion.setFromUnitVectors(v(0, 1, 0), right.axis.clone().multiplyScalar(Math.cos(t)).add(v(0, Math.sin(t), 0)).normalize());
    }
    torso.add(w);
    rigid.push({ obj: w, anchor: right.at.clone() });
  }
  if (equipped.offhand) {
    const o = buildOffhand(equipped.offhand, ctx);
    o.position.copy(left.at);
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
