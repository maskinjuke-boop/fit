import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../palette';
import { HEAD_GROW, HEAD_R, HEAD_SCALE, HEAD_Y, NECK_WORLD, NECK_Y, TORSO_Y, band, bodyShape, pelvis, torsoShell, type BodyShape } from './body';
import { HAIRLINE, buildHead, hairCap, skullShell, type Hairline, type Lid } from './head';
import { HEAD_COVER, WEAPON_POSE, buildBodyItem, buildHeadItem, buildOffhand, buildWeapon, type ItemCtx, type Outfit } from './items3d';
import { M, cone, limb, mat, mesh, organ, ring, shade, taperTube, v, type Anim, type Mat } from './kit';

export { disposeObject } from './kit';

/**
 * Процедурная 3D-модель персонажа (без файлов моделей): мужская или женская фигура,
 * внешность из настроек и надетые предметы. Персонаж смотрит на +Z, ноги на y = 0.
 */
export interface CharacterParts {
  root: THREE.Group;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  /** Верхние веки — для моргания. */
  lids: Lid[];
  /** Анимации предметов: вызываются каждый кадр со временем в секундах. */
  anim: Anim[];
}

const HS = HEAD_SCALE;
type Cover = 'none' | 'hat' | 'helm';

// ─── Волосы ────────────────────────────────────────────────────────────

/** Сегмент «шапки» волос по форме черепа: th0..th1 — от макушки вниз, open — вырез для лица (рад, 0 — без выреза). */
function hairShell(r: number, th0: number, th1: number, open: number, m: Mat, female: boolean): THREE.Mesh {
  const geo = open > 0 ? new THREE.SphereGeometry(1, 48, 20, Math.PI / 2 + open, Math.PI * 2 - open * 2, th0, th1 - th0) : new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, th0, th1 - th0);
  return mesh(skullShell(geo, r - HEAD_R, female), m, [0, HEAD_Y + 0.005, -0.004]);
}

/** Волосы с естественной линией роста; from > 0 — только полоса ниже шапки. */
function cap(off: number, line: Hairline, m: Mat, female: boolean, from = 0): THREE.Mesh {
  return mesh(hairCap(off, line, female, from), m, [0, HEAD_Y + 0.004, -0.004]);
}

/** Затылок ниже макушки (задняя полусфера). */
function hairBack(r: number, m: Mat, female: boolean, th0 = 0.2, th1 = 0.7): THREE.Mesh {
  return mesh(skullShell(new THREE.SphereGeometry(1, 40, 16, Math.PI, Math.PI, Math.PI * th0, Math.PI * (th1 - th0)), r - HEAD_R, female), m, [0, HEAD_Y, -0.004]);
}

/** Волнистая «занавеска» волос за спиной. */
function backCurtain(m: Mat, top: number, len: number, rTop: number, rBottom: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 32, 6, true, Math.PI - 1.35, 2.7);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = (len / 2 - y) / len;
    const a = Math.atan2(x, z);
    const f = 1 + Math.sin(a * 11) * 0.035 * k;
    pos.setXYZ(i, x * f, y + (k > 0.95 ? Math.sin(a * 7) * 0.02 : 0), z * f);
  }
  geo.computeVertexNormals();
  const me = new THREE.Mesh(geo, m);
  me.position.set(0, top - len / 2, -0.03);
  me.scale.z = 0.85;
  return me;
}

function buildHair(style: Appearance['hair'], m: Mat, cover: Cover, female: boolean): THREE.Group {
  const g = new THREE.Group();
  const helm = cover === 'helm';
  const hat = cover === 'hat';
  m.side = THREE.DoubleSide;
  const fringe = (dx: number): THREE.Mesh => mesh(new THREE.SphereGeometry(0.12, 20, 12), m, [dx, HEAD_Y + 0.17, 0.17], [1.25, 0.45, 0.6]);
  switch (style) {
    case 'buzz':
      if (!hat && !helm) g.add(cap(0.007, HAIRLINE.short, m, female));
      break;
    case 'short':
      if (hat) g.add(cap(0.018, HAIRLINE.short, m, female, Math.PI * 0.4));
      if (!hat && !helm) {
        g.add(cap(0.018, HAIRLINE.short, m, female));
        // Объём сверху и лёгкий чуб надо лбом.
        g.add(cap(0.03, [[0, 0.2], [0.3, 0.3], [1, 0.36]], m, female));
        g.add(mesh(new THREE.SphereGeometry(0.1, 20, 12), m, [0.03, HEAD_Y + 0.215, 0.13], [1.3, 0.42, 0.75]));
      }
      break;
    case 'long': {
      const r = HEAD_R + 0.03;
      // Сверху — волосы с линией роста, ниже — пряди по бокам с открытым лицом.
      if (!hat && !helm) g.add(cap(0.03, HAIRLINE.long, m, female));
      if (!helm) g.add(hairShell(r, hat ? Math.PI * 0.4 : Math.PI * 0.3, Math.PI * 0.62, 1.05, m, female));
      g.add(backCurtain(m, HEAD_Y - 0.02, 0.6, 0.255, 0.3));
      for (const sx of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([v(0.21 * sx, HEAD_Y - 0.02, 0.03), v(0.25 * sx, HEAD_Y - 0.25, 0.06), v(0.27 * sx, HEAD_Y - 0.48, 0.07)]);
        g.add(new THREE.Mesh(taperTube(c, 0.06, 0.028, 16, 10), m));
      }
      break;
    }
    case 'ponytail': {
      if (!hat && !helm) g.add(cap(0.016, HAIRLINE.pony, m, female));
      if (hat) g.add(cap(0.016, HAIRLINE.pony, m, female, Math.PI * 0.4));
      const y0 = helm || hat ? HEAD_Y - 0.02 : HEAD_Y + 0.07;
      const z0 = helm || hat ? -0.3 : -0.285;
      g.add(mesh(new THREE.TorusGeometry(0.045, 0.016, 8, 20), M.cloth('#d23a4a', 2), [0, y0, z0 - 0.015]));
      const tail = new THREE.CatmullRomCurve3([v(0, y0, z0), v(0, y0 - 0.06, z0 - 0.12), v(0.01, y0 - 0.3, z0 - 0.1), v(0.03, y0 - 0.56, z0 - 0.04)]);
      g.add(new THREE.Mesh(taperTube(tail, 0.07, 0.016, 28, 12), m));
      g.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), m, [0, y0 - 0.07, z0 - 0.1], [1, 1.2, 1]));
      break;
    }
    case 'bob': {
      const r = HEAD_R + 0.045;
      if (!helm) g.add(hairShell(r, hat ? Math.PI * 0.38 : 0, Math.PI * 0.64, 1.0, m, female));
      if (!hat && !helm) {
        // Чёлка на лоб.
        g.add(mesh(new THREE.SphereGeometry(r + 0.004, 40, 8, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.06, Math.PI * 0.28), m, [0, HEAD_Y + 0.01, -0.01], [HS.x, HS.y, HS.z]));
      }
      break;
    }
    case 'bun':
      if (hat) g.add(cap(0.012, HAIRLINE.pony, m, female, Math.PI * 0.4));
      if (!hat && !helm) {
        g.add(cap(0.012, HAIRLINE.pony, m, female));
        g.add(mesh(new THREE.SphereGeometry(0.11, 20, 14), m, [0, HEAD_Y + 0.25, -0.13]));
        g.add(mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), M.cloth('#d23a4a', 2), [0, HEAD_Y + 0.19, -0.1]).rotateX(-0.9));
      }
      break;
    case 'curly': {
      if (helm) break;
      if (!hat) g.add(cap(0.01, HAIRLINE.short, m, female));
      const n = 54;
      const ball = new THREE.IcosahedronGeometry(0.072, 1);
      for (let i = 0; i < n; i += 1) {
        // Точки Фибоначчи на верхней части головы, кроме лица.
        const y = 1 - (i / (n - 1)) * 1.25;
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = i * 2.399963;
        const x = Math.cos(phi) * rr;
        const z = Math.sin(phi) * rr;
        if (y < 0.15 && z > 0.35) continue;
        if (y < -0.2) continue;
        // Под головным убором остаются только кудри, выглядывающие снизу.
        if (hat && y > 0.12) continue;
        const k = hat ? 0.27 : 0.29;
        const b = mesh(ball, m, [x * k * HS.x, HEAD_Y + y * 0.3 * HS.y, z * k * HS.z - 0.01]);
        b.rotation.set(i, i * 2, 0);
        g.add(b);
      }
      break;
    }
  }
  return g;
}

// ─── Руки, кисти и ноги ─────────────────────────────────────────────────

interface ArmMats {
  skin: Mat;
  shirt: Mat;
  outfit: Outfit;
}

/** Профили толщины (доля длины → радиус) для мышц. */
const UPPER = (r: number, e: number): Array<[number, number]> => [
  [0, r * 1.12],
  [0.14, r * 1.1],
  [0.45, r * 1.07],
  [0.78, r * 0.9],
  [1, e],
];
const FORE = (r: number, e: number): Array<[number, number]> => [
  [0, e],
  [0.18, r * 1.14],
  [0.5, r * 0.98],
  [0.85, r * 0.78],
  [1, r * 0.72],
];
const THIGH = (r: number, k: number): Array<[number, number]> => [
  [0, r],
  [0.15, r * 1.04],
  [0.55, r * 0.9],
  [0.86, k * 1.04],
  [1, k],
];
const CALF = (r: number, k: number): Array<[number, number]> => [
  [0, k],
  [0.2, r * 1.14],
  [0.45, r * 1.02],
  [0.8, r * 0.72],
  [1, r * 0.62],
];

/**
 * Кисть: ладонь, четыре пальца из трёх фаланг и большой палец.
 * Строится как левая (x > 0, ладонь к телу, большой палец вперёд); правая — зеркально.
 * grip — пальцы сжаты (держит предмет), иначе слегка согнуты.
 */
function buildHand(skin: Mat, scale: number, grip: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(1, 20, 14), skin, [0, -0.048, 0], [0.024, 0.05, 0.042]));
  const curl = grip ? [1.25, 1.35, 1.0] : [0.35, 0.45, 0.35];
  const fingers: Array<[number, number, number]> = [
    [0.03, 1, 0.0105],
    [0.01, 1.08, 0.0108],
    [-0.01, 1.0, 0.0102],
    [-0.028, 0.82, 0.0092],
  ];
  for (const [z, len, r] of fingers) {
    let p = v(-0.004, -0.092, z);
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
  const t0 = v(-0.012, -0.03, 0.038);
  const t1 = t0.clone().add(grip ? v(-0.022, -0.026, 0.012) : v(-0.006, -0.03, 0.014));
  const t2 = t1.clone().add(grip ? v(-0.022, -0.012, -0.012) : v(-0.004, -0.026, 0.004));
  g.add(limb(t0, t1, 0.0125, skin, 8), limb(t1, t2, 0.011, skin, 8));
  g.scale.setScalar(scale);
  return g;
}

/** Рука на шарнире в плече. Возвращает шарнир и группу, к которой крепятся предметы в кисти. */
function buildArm(shape: BodyShape, sx: number, mats: ArmMats, holds: boolean): { pivot: THREE.Group; inner: THREE.Group; hand: THREE.Vector3 } {
  const s = v(shape.shoulder.x * sx, shape.shoulder.y, shape.shoulder.z);
  const e = v(shape.elbow.x * sx, shape.elbow.y, shape.elbow.z);
  const w = v(shape.wrist.x * sx, shape.wrist.y, shape.wrist.z);
  const pivot = new THREE.Group();
  pivot.position.copy(s);
  const inner = new THREE.Group();
  inner.position.copy(s).multiplyScalar(-1);
  pivot.add(inner);
  const { skin, shirt, outfit } = mats;
  const ur = shape.upperR;
  const fr = shape.foreR;
  const er = fr * 1.08;
  const upper = UPPER(ur, er);
  const fore = FORE(fr, er);

  // Дельтовидная мышца и плечо.
  const delt = s.clone().add(v(0.004 * sx, -0.012, 0));
  inner.add(mesh(new THREE.SphereGeometry(ur * 1.1, 20, 14), outfit.upper ?? shirt, [delt.x, delt.y, delt.z], [1, 0.95, 1.05]));
  inner.add(organ(s, e, upper, skin, { flat: 0.92, caps: false }));
  if (outfit.upper) {
    inner.add(organ(s, e, upper, outfit.upper, { grow: 0.014, flat: 0.92, caps: false }));
  } else {
    // Футболка: короткий рукав с подгибом.
    inner.add(organ(s, e, upper, shirt, { to: 0.45, grow: 0.012, flat: 0.92, caps: false }));
    const mid = s.clone().lerp(e, 0.45);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(ur * 1.07 + 0.012, 0.006, 6, 24), shirt);
    hem.position.copy(mid);
    hem.quaternion.setFromUnitVectors(v(0, 0, 1), e.clone().sub(s).normalize());
    inner.add(hem);
  }
  inner.add(mesh(new THREE.SphereGeometry(outfit.fore ? er + 0.014 : er, 16, 12), outfit.fore ?? skin, [e.x, e.y, e.z]));
  inner.add(organ(e, w, fore, skin, { flat: 0.88, caps: false }));
  const dir = w.clone().sub(e).normalize();
  if (outfit.fore) {
    inner.add(organ(e, w, fore, outfit.fore, { to: 0.9, grow: 0.016, flat: 0.88, caps: false }));
    const end = e.clone().lerp(w, 0.9);
    if (outfit.wideCuff) {
      inner.add(cone(end.clone().addScaledVector(dir, -0.1), end.clone().addScaledVector(dir, 0.03), fr + 0.02, fr + 0.07, outfit.fore, 24, true));
      const trim = new THREE.Mesh(new THREE.TorusGeometry(fr + 0.068, 0.009, 6, 24), outfit.wideCuff);
      trim.position.copy(end).addScaledVector(dir, 0.03);
      trim.quaternion.setFromUnitVectors(v(0, 0, 1), dir);
      inner.add(trim);
    }
    if (outfit.cuff) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(fr * 0.8 + 0.016, 0.013, 6, 20), outfit.cuff);
      c.position.copy(end);
      c.quaternion.setFromUnitVectors(v(0, 0, 1), dir);
      inner.add(c);
    }
  }
  if (outfit.bracer) {
    inner.add(organ(e, w, fore, outfit.bracer, { from: 0.32, to: 0.94, grow: 0.022, flat: 0.9, caps: false }));
    for (const t of [0.32, 0.94]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(fr * (t > 0.5 ? 0.74 : 1.05) + 0.022, 0.007, 6, 20), outfit.bracer);
      r.position.copy(e).lerp(w, t);
      r.quaternion.setFromUnitVectors(v(0, 0, 1), dir);
      inner.add(r);
    }
  }
  // Кисть: левая строится как есть, правая — зеркально.
  const hand = buildHand(skin, shape.hand, holds);
  hand.position.copy(w);
  hand.quaternion.setFromUnitVectors(v(0, -1, 0), dir);
  if (sx < 0) hand.scale.x *= -1;
  inner.add(hand);
  const anchor = w.clone().addScaledVector(dir, 0.07 * shape.hand).add(v(-0.012 * sx, 0, 0.012));
  return { pivot, inner, hand: anchor };
}

function buildLegs(shape: BodyShape, root: THREE.Group, pants: Mat, boots: Mat, stripe?: Mat): void {
  const sole = mat('#1d1f24', 0.9);
  const k = shape.calfR * 1.02;
  for (const sx of [-1, 1]) {
    const x = shape.legX * sx;
    const hip = v(x, TORSO_Y - 0.06, 0);
    const knee = v(x * 1.04, 0.6, 0.02);
    const ankle = v(x * 1.06, 0.11, 0);
    root.add(organ(hip, knee, THIGH(shape.thighR, k), pants, { flat: 0.95, caps: false }));
    root.add(mesh(new THREE.SphereGeometry(k * 1.03, 16, 12), pants, [knee.x, knee.y, knee.z]));
    root.add(mesh(new THREE.SphereGeometry(k * 0.5, 12, 10), pants, [knee.x, knee.y + 0.01, knee.z + k * 0.62], [1, 1.1, 0.6]));
    root.add(organ(knee, ankle, CALF(shape.calfR, k), pants, { flat: 0.95, caps: false }));
    if (stripe) {
      const o = sx * 1.0;
      const mid = hip.clone().lerp(knee, 0.5);
      root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hip.clone().add(v(shape.thighR * o, -0.03, 0)), mid.clone().add(v(shape.thighR * 0.92 * o, 0, 0)), knee.clone().add(v(k * 1.02 * o, 0, 0)), ankle.clone().add(v(shape.calfR * 0.7 * o, 0.26, 0))]), 24, 0.009, 6), stripe));
    }
    // Ботинок: голенище с отворотом, носок, каблук и подошва.
    const f = shape.foot;
    root.add(organ(v(ankle.x, 0.05, 0), v(ankle.x, 0.36, 0), [[0, shape.calfR * 0.95], [0.6, shape.calfR * 0.84], [1, shape.calfR * 0.88]], boots, { grow: 0.012 }));
    root.add(ring(shape.calfR * 0.92, 0.018, boots, 0.36, 1, 1).translateX(ankle.x));
    root.add(mesh(new THREE.SphereGeometry(1, 24, 16), boots, [ankle.x, 0.07, 0.065 * f], [0.078 * f, 0.068, 0.15 * f]));
    root.add(mesh(new THREE.SphereGeometry(1, 16, 12), boots, [ankle.x, 0.06, 0.17 * f], [0.065 * f, 0.05, 0.06 * f]));
    root.add(mesh(new THREE.CylinderGeometry(1, 1, 0.026, 28), sole, [ankle.x, 0.013, 0.06 * f], [0.084 * f, 1, 0.17 * f]));
    root.add(mesh(new THREE.BoxGeometry(0.11 * f, 0.03, 0.06), sole, [ankle.x, 0.03, -0.05 * f]));
  }
}

// ─── Сборка ────────────────────────────────────────────────────────────

export function buildCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>): CharacterParts {
  const root = new THREE.Group();
  const shape = bodyShape(appearance.figure);
  const female = shape.figure === 'female';
  const skinTone = SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
  const eyeColor = EYE_COLORS[appearance.eyes ?? 0] ?? EYE_COLORS[0];
  const skin = M.skin(skinTone.base);
  const shirt = M.cloth(shade(color, 0.62), 8);
  const anim: Anim[] = [];
  const ctx: ItemCtx = { color, shape, anim };
  const outfit: Outfit = equipped.body ? buildBodyItem(equipped.body, ctx) : { group: new THREE.Group() };

  // Ноги, таз и ремень.
  const pants = outfit.pants ?? M.cloth(female ? '#2f3646' : '#2d3440', 8);
  buildLegs(shape, root, pants, M.leather('#4a2f1f', 2), outfit.stripe);
  root.add(pelvis(shape, pants));
  root.add(band(shape, TORSO_Y + 0.02, 0.026, M.leather('#3b2a1e', 4)));
  root.add(mesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), M.gold(), [0, TORSO_Y + 0.02, female ? 0.198 : 0.19]));

  // Корпус: футболка с вырезом.
  const torso = new THREE.Group();
  torso.add(torsoShell(shape, shirt));
  torso.add(ring(shape.neckR + 0.034, 0.013, M.cloth(shade(color, 0.45), 4), TORSO_Y + 0.6, 1.06, 0.92));
  root.add(torso);
  torso.add(outfit.group);

  // Руки на шарнирах в плечах.
  const right = buildArm(shape, -1, { skin, shirt, outfit }, Boolean(equipped.weapon));
  const left = buildArm(shape, 1, { skin, shirt, outfit }, Boolean(equipped.offhand));
  root.add(right.pivot, left.pivot);

  // Шея: от трапеций к голове, у мужской фигуры — кадык.
  const nr = shape.neckR;
  root.add(organ(v(0, TORSO_Y + 0.5, -0.01), v(0, NECK_WORLD + 0.1, 0), [[0, nr * 1.6], [0.3, nr * 1.08], [0.7, nr], [1, nr * 0.96]], skin, { flat: 0.95 }));

  // Голова с лицом, причёска и головной убор (в собственных координатах головы).
  const head = new THREE.Group();
  const face = buildHead(shape.figure, skinTone.base, skinTone.shade, hairColor, eyeColor, appearance.beard);
  head.add(face.group);
  const cover: Cover = equipped.head ? HEAD_COVER[equipped.head] ?? 'none' : 'none';
  head.add(buildHair(appearance.hair, M.hair(hairColor), cover, female));
  if (equipped.head) head.add(buildHeadItem(equipped.head, ctx));
  head.position.y = -NECK_Y;
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_WORLD;
  headPivot.userData.baseY = NECK_WORLD;
  headPivot.scale.setScalar(HEAD_GROW);
  headPivot.add(head);
  root.add(headPivot);

  // Предметы в руках крепятся к кисти и двигаются вместе с рукой.
  if (equipped.weapon) {
    const w = buildWeapon(equipped.weapon, ctx);
    w.position.copy(right.hand);
    const [rx, ry, rz] = WEAPON_POSE[equipped.weapon] ?? [0.25, 0, 0];
    w.rotation.set(rx, ry, rz);
    right.inner.add(w);
  }
  if (equipped.offhand) {
    const o = buildOffhand(equipped.offhand, ctx);
    o.position.copy(left.hand);
    left.inner.add(o);
  }

  return { root, torso, head: headPivot, leftArm: left.pivot, rightArm: right.pivot, lids: face.lids, anim };
}

/** Отдельная модель предмета для иконки магазина (без персонажа). */
export function buildItemModel(id: string, slot: Slot, color: string, figure: Figure): { object: THREE.Group; anim: Anim[] } {
  const anim: Anim[] = [];
  const shape = bodyShape(figure);
  const ctx: ItemCtx = { color, shape, anim };
  const object = new THREE.Group();
  switch (slot) {
    case 'head':
      object.add(buildHeadItem(id, ctx));
      break;
    case 'body': {
      const o = buildBodyItem(id, ctx);
      object.add(o.group);
      // Рукава, чтобы куртка и доспех не выглядели жилетом.
      for (const sx of [-1, 1]) {
        const s = v(shape.shoulder.x * sx, shape.shoulder.y, 0);
        const e = v(shape.elbow.x * sx, shape.elbow.y, shape.elbow.z);
        const w = v(shape.wrist.x * sx, shape.wrist.y, shape.wrist.z);
        const er = shape.foreR * 1.08;
        if (o.upper) object.add(mesh(new THREE.SphereGeometry(shape.upperR * 1.22, 16, 12), o.upper, [s.x, s.y, s.z]), organ(s, e, UPPER(shape.upperR, er), o.upper, { grow: 0.014, flat: 0.92 }));
        if (o.fore) object.add(organ(e, w, FORE(shape.foreR, er), o.fore, { to: 0.9, grow: 0.016, flat: 0.88 }));
        if (o.bracer) object.add(organ(e, w, FORE(shape.foreR, er), o.bracer, { from: 0.32, to: 0.94, grow: 0.022, flat: 0.9 }));
      }
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
