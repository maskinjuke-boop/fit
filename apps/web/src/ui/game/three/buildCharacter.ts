import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance, Figure } from '../../../game/state';
import { HAIR_COLORS, SKIN_TONES } from '../palette';
import { HEAD_GROW, HEAD_R, HEAD_SCALE, HEAD_Y, NECK_Y, TORSO_Y, band, bodyShape, pelvis, torsoShell, type BodyShape } from './body';
import { HEAD_COVER, WEAPON_POSE, buildBodyItem, buildHeadItem, buildOffhand, buildWeapon, type ItemCtx, type Outfit } from './items3d';
import { M, cone, limb, mat, mesh, ring, shade, taperTube, v, type Anim, type Mat } from './kit';

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
  /** Глаза — для моргания. */
  eyes: THREE.Object3D[];
  /** Анимации предметов: вызываются каждый кадр со временем в секундах. */
  anim: Anim[];
}

const HS = HEAD_SCALE;
type Cover = 'none' | 'hat' | 'helm';

// ─── Волосы ────────────────────────────────────────────────────────────

/** Сегмент сферы вокруг головы: th0..th1 — от макушки вниз, open — вырез для лица (рад, 0 — без выреза). */
function hairShell(r: number, th0: number, th1: number, open: number, m: Mat, y = 0.01): THREE.Mesh {
  const geo = open > 0 ? new THREE.SphereGeometry(r, 48, 20, Math.PI / 2 + open, Math.PI * 2 - open * 2, th0, th1 - th0) : new THREE.SphereGeometry(r, 48, 20, 0, Math.PI * 2, th0, th1 - th0);
  return mesh(geo, m, [0, HEAD_Y + y, -0.01], [HS.x, HS.y, HS.z]);
}

/** Затылок ниже макушки (задняя полусфера). */
function hairBack(r: number, m: Mat, th0 = 0.2, th1 = 0.7): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 40, 16, Math.PI, Math.PI, Math.PI * th0, Math.PI * (th1 - th0)), m, [0, HEAD_Y, -0.01], [HS.x, HS.y, HS.z]);
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

function buildHair(style: Appearance['hair'], m: Mat, cover: Cover): THREE.Group {
  const g = new THREE.Group();
  const helm = cover === 'helm';
  const hat = cover === 'hat';
  m.side = THREE.DoubleSide;
  const fringe = (dx: number): THREE.Mesh => mesh(new THREE.SphereGeometry(0.12, 20, 12), m, [dx, HEAD_Y + 0.17, 0.17], [1.25, 0.45, 0.6]);
  switch (style) {
    case 'buzz':
      if (!hat && !helm) g.add(hairShell(HEAD_R + 0.008, 0, Math.PI * 0.36, 0, m), hairBack(HEAD_R + 0.006, m));
      break;
    case 'short':
      if (!helm) g.add(hairBack(HEAD_R + 0.02, m, hat ? 0.4 : 0.2));
      if (!hat && !helm) g.add(hairShell(HEAD_R + 0.022, 0, Math.PI * 0.4, 0, m), fringe(0.04));
      break;
    case 'long': {
      const r = HEAD_R + 0.03;
      // Сверху — сплошная «шапка» волос, ниже — пряди по бокам с открытым лицом.
      if (!hat && !helm) g.add(hairShell(r, 0, Math.PI * 0.36, 0, m));
      if (!helm) g.add(hairShell(r, hat ? Math.PI * 0.4 : Math.PI * 0.3, Math.PI * 0.62, 1.05, m));
      g.add(backCurtain(m, HEAD_Y - 0.02, 0.6, 0.255, 0.3));
      for (const sx of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([v(0.21 * sx, HEAD_Y - 0.02, 0.03), v(0.25 * sx, HEAD_Y - 0.25, 0.06), v(0.27 * sx, HEAD_Y - 0.48, 0.07)]);
        g.add(new THREE.Mesh(taperTube(c, 0.06, 0.028, 16, 10), m));
      }
      break;
    }
    case 'ponytail': {
      if (!hat && !helm) g.add(hairShell(HEAD_R + 0.016, 0, Math.PI * 0.38, 0, m), hairShell(HEAD_R + 0.014, Math.PI * 0.32, Math.PI * 0.48, 1.0, m), hairBack(HEAD_R + 0.014, m));
      if (hat) g.add(hairBack(HEAD_R + 0.014, m, 0.42));
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
      if (!helm) g.add(hairShell(r, hat ? Math.PI * 0.38 : 0, Math.PI * 0.64, 1.0, m));
      if (!hat && !helm) {
        // Чёлка на лоб.
        g.add(mesh(new THREE.SphereGeometry(r + 0.004, 40, 8, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.06, Math.PI * 0.28), m, [0, HEAD_Y + 0.01, -0.01], [HS.x, HS.y, HS.z]));
      }
      break;
    }
    case 'bun':
      if (!helm) g.add(hairBack(HEAD_R + 0.01, m, hat ? 0.4 : 0.2));
      if (!hat && !helm) {
        g.add(hairShell(HEAD_R + 0.012, 0, Math.PI * 0.38, 0, m));
        g.add(mesh(new THREE.SphereGeometry(0.11, 20, 14), m, [0, HEAD_Y + 0.25, -0.13]));
        g.add(mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), M.cloth('#d23a4a', 2), [0, HEAD_Y + 0.19, -0.1]).rotateX(-0.9));
      }
      break;
    case 'curly': {
      if (helm) break;
      if (!hat) g.add(hairShell(HEAD_R + 0.01, 0, Math.PI * 0.38, 0, m), hairBack(HEAD_R + 0.008, m));
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

// ─── Лицо ──────────────────────────────────────────────────────────────

function buildFace(figure: Figure, skinBase: string, skinShade: string, hair: string, beard: boolean, eyes: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  const female = figure === 'female';
  const white = mat('#fbfaf8', 0.35);
  const iris = mat('#5a3a26', 0.3);
  const pupil = mat('#100b08', 0.25);
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lid = M.skin(shade(skinBase, 0.94));
  const lash = mat('#1a1210', 0.6);
  for (const sx of [-1, 1]) {
    const x = 0.088 * sx;
    const eye = new THREE.Group();
    eye.position.set(x, HEAD_Y + 0.02, 0.212);
    const er = female ? 0.056 : 0.052;
    eye.add(mesh(new THREE.SphereGeometry(er, 20, 14), white, [0, 0, 0], [1.15, 0.9, 0.55]));
    eye.add(mesh(new THREE.SphereGeometry(er * 0.62, 18, 12), iris, [0, -0.004, 0.022], [1, 1, 0.5]));
    eye.add(mesh(new THREE.SphereGeometry(er * 0.31, 12, 8), pupil, [0, -0.004, 0.036], [1, 1, 0.4]));
    eye.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), shine, [0.012, 0.012, 0.042]));
    g.add(eye);
    eyes.push(eye);
    // Верхнее веко придаёт взгляду естественность.
    const upper = mesh(new THREE.SphereGeometry(er * 1.06, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), lid, [x, HEAD_Y + 0.02, 0.212], [1.15, 0.9, 0.6]);
    upper.rotation.x = 0.55;
    g.add(upper);
    if (female) {
      const l = new THREE.Mesh(new THREE.TorusGeometry(er * 1.05, 0.006, 4, 16, Math.PI * 0.75), lash);
      l.position.set(x, HEAD_Y + 0.025, 0.226);
      l.rotation.set(0.2, 0, Math.PI * 0.125);
      l.scale.set(1.15, 0.85, 1);
      g.add(l);
      g.add(limb(v(x + 0.055 * sx, HEAD_Y + 0.035, 0.226), v(x + 0.075 * sx, HEAD_Y + 0.055, 0.22), 0.005, lash, 4));
      const brow = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI * 0.45), mat(hair, 0.9));
      brow.position.set(x, HEAD_Y + 0.055, 0.236);
      brow.rotation.z = Math.PI * 0.275;
      g.add(brow);
    } else {
      const brow = mesh(new THREE.CapsuleGeometry(0.012, 0.068, 4, 8), mat(hair, 0.9), [x, HEAD_Y + 0.095, 0.235]);
      brow.rotation.z = Math.PI / 2 - 0.1 * sx;
      g.add(brow);
    }
    g.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), M.skin(skinShade), [0.255 * sx, HEAD_Y, -0.01], [0.45, 1, 0.75]));
  }
  // Нос: переносица и кончик.
  const noseM = M.skin(skinBase);
  g.add(limb(v(0, HEAD_Y + 0.01, 0.248), v(0, HEAD_Y - 0.03, 0.262), female ? 0.013 : 0.016, noseM, 10));
  g.add(mesh(new THREE.SphereGeometry(female ? 0.026 : 0.032, 14, 10), noseM, [0, HEAD_Y - 0.035, 0.255], [0.9, 0.9, 1.1]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), M.skin(skinShade), [0.022 * sx, HEAD_Y - 0.045, 0.252]));
  // Рот — линия улыбки, уложенная прямо на поверхность лица.
  const sx0 = HS.x * (female ? 0.97 : 1);
  const onFace = (x: number, y: number, lift: number): THREE.Vector3 => {
    const k = 1 - (x / (HEAD_R * sx0)) ** 2 - (y / (HEAD_R * HS.y)) ** 2;
    return v(x, HEAD_Y + y, HEAD_R * HS.z * Math.sqrt(Math.max(0, k)) + lift);
  };
  const smile = (w: number, y0: number, curve: number, lift: number): THREE.CatmullRomCurve3 =>
    new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((t) => onFace(t * w, y0 + curve * t * t, lift)));
  if (female) {
    const lips = mat('#c25a64', 0.4);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(smile(0.042, -0.086, 0.014, 0.004), 20, 0.011, 8), lips));
    const lower = onFace(0, -0.1, -0.004);
    g.add(mesh(new THREE.SphereGeometry(0.03, 16, 10), lips, [lower.x, lower.y, lower.z], [1, 0.45, 0.55]));
  } else {
    g.add(new THREE.Mesh(new THREE.TubeGeometry(smile(0.046, -0.088, 0.018, 0.003), 20, 0.009, 8), mat('#8e4a3e', 0.6)));
    const lip = onFace(0, -0.104, -0.002);
    g.add(mesh(new THREE.SphereGeometry(0.022, 12, 8), M.skin(skinShade), [lip.x, lip.y, lip.z], [1.2, 0.35, 0.5]));
  }
  if (beard && !female) {
    const bm = M.hair(hair, 2);
    bm.side = THREE.DoubleSide;
    g.add(mesh(new THREE.SphereGeometry(HEAD_R + 0.016, 36, 12, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.62, Math.PI * 0.25), bm, [0, HEAD_Y, -0.005], [HS.x, HS.y, HS.z]));
    const stache = new THREE.CatmullRomCurve3([v(-0.05, HEAD_Y - 0.078, 0.236), v(0, HEAD_Y - 0.06, 0.252), v(0.05, HEAD_Y - 0.078, 0.236)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(stache, 12, 0.018, 8), bm));
  }
  return g;
}

// ─── Руки и ноги ───────────────────────────────────────────────────────

interface ArmMats {
  skin: Mat;
  shirt: Mat;
  outfit: Outfit;
}

/** Рука на шарнире в плече. Возвращает шарнир и группу, к которой крепятся предметы в кисти. */
function buildArm(shape: BodyShape, sx: number, mats: ArmMats): { pivot: THREE.Group; inner: THREE.Group; hand: THREE.Vector3 } {
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

  if (outfit.upper) {
    inner.add(mesh(new THREE.SphereGeometry(ur + 0.018, 20, 14), outfit.upper, [s.x, s.y, s.z]));
    inner.add(cone(s, e, ur + 0.016, (ur + fr) / 2 + 0.014, outfit.upper, 20));
  } else {
    // Футболка: короткий рукав с подгибом, ниже — кожа.
    const mid = s.clone().lerp(e, 0.45);
    inner.add(mesh(new THREE.SphereGeometry(ur + 0.014, 20, 14), shirt, [s.x, s.y, s.z]));
    inner.add(cone(s, mid, ur + 0.014, ur + 0.02, shirt, 20));
    const hem = new THREE.Mesh(new THREE.TorusGeometry(ur + 0.019, 0.007, 6, 20), shirt);
    hem.position.copy(mid);
    hem.quaternion.setFromUnitVectors(v(0, 0, 1), e.clone().sub(s).normalize());
    inner.add(hem);
    inner.add(limb(s, e, ur, skin));
  }
  inner.add(mesh(new THREE.SphereGeometry(outfit.fore ? fr + 0.02 : (ur + fr) / 2, 16, 12), outfit.fore ?? (outfit.upper ? outfit.upper : skin), [e.x, e.y, e.z]));
  inner.add(limb(e, w, fr, skin));
  if (outfit.fore) {
    const end = e.clone().lerp(w, 0.88);
    inner.add(cone(e, end, fr + 0.02, fr + 0.016, outfit.fore, 20));
    const dir = w.clone().sub(e).normalize();
    if (outfit.wideCuff) inner.add(cone(end.clone().addScaledVector(dir, -0.1), end.clone().addScaledVector(dir, 0.03), fr + 0.02, fr + 0.075, outfit.fore, 24, true));
    if (outfit.wideCuff) {
      const trim = new THREE.Mesh(new THREE.TorusGeometry(fr + 0.072, 0.01, 6, 24), outfit.wideCuff);
      trim.position.copy(end).addScaledVector(dir, 0.03);
      trim.quaternion.setFromUnitVectors(v(0, 0, 1), dir);
      inner.add(trim);
    }
    if (outfit.cuff) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(fr + 0.018, 0.016, 6, 20), outfit.cuff);
      c.position.copy(end);
      c.quaternion.setFromUnitVectors(v(0, 0, 1), dir);
      inner.add(c);
    }
  }
  if (outfit.bracer) {
    const a = e.clone().lerp(w, 0.35);
    const b = e.clone().lerp(w, 0.92);
    inner.add(cone(a, b, fr + 0.024, fr + 0.02, outfit.bracer, 20));
    for (const p of [a, b]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(fr + 0.025, 0.007, 6, 20), outfit.bracer);
      r.position.copy(p);
      r.quaternion.setFromUnitVectors(v(0, 0, 1), w.clone().sub(e).normalize());
      inner.add(r);
    }
  }
  // Кисть, сжатая в кулак, и большой палец.
  const dir = w.clone().sub(e).normalize();
  const hs = shape.hand;
  const palm = w.clone().addScaledVector(dir, 0.05 * hs);
  const fist = mesh(new THREE.SphereGeometry(0.068 * hs, 18, 14), skin, [palm.x, palm.y, palm.z], [0.85, 1.08, 0.92]);
  fist.quaternion.setFromUnitVectors(v(0, 1, 0), dir);
  inner.add(fist);
  inner.add(limb(palm.clone().add(v(-0.03 * sx * hs, 0.01, 0.035 * hs)), palm.clone().add(v(-0.045 * sx * hs, -0.035 * hs, 0.06 * hs)), 0.021 * hs, skin, 8));
  const hand = w.clone().add(v(0, -0.06, 0.03));
  return { pivot, inner, hand };
}

function buildLegs(shape: BodyShape, root: THREE.Group, pants: Mat, boots: Mat, stripe?: Mat): void {
  const sole = mat('#1d1f24', 0.9);
  for (const sx of [-1, 1]) {
    const x = shape.legX * sx;
    const hip = v(x, 0.9, 0);
    const knee = v(x * 1.05, 0.52, 0.015);
    const ankle = v(x * 1.08, 0.16, 0);
    root.add(cone(hip, knee, shape.thighR, shape.calfR * 1.04, pants, 20));
    root.add(mesh(new THREE.SphereGeometry(shape.calfR * 1.04, 16, 12), pants, [knee.x, knee.y, knee.z]));
    root.add(cone(knee, ankle.clone().add(v(0, 0.12, 0)), shape.calfR * 1.02, shape.calfR * 0.8, pants, 20));
    if (stripe) {
      const o = sx * 0.98;
      root.add(limb(hip.clone().add(v(shape.thighR * o, -0.02, 0)), knee.clone().add(v(shape.calfR * 1.04 * o, 0, 0)), 0.01, stripe, 6));
      root.add(limb(knee.clone().add(v(shape.calfR * 1.04 * o, 0, 0)), ankle.clone().add(v(shape.calfR * 0.82 * o, 0.14, 0)), 0.01, stripe, 6));
    }
    // Сапог: голенище с отворотом, стопа и подошва.
    const f = shape.foot;
    root.add(cone(v(ankle.x, 0.06, 0), v(ankle.x, 0.32, 0), shape.calfR * 0.92, shape.calfR * 0.9, boots, 20));
    root.add(ring(shape.calfR * 0.94, 0.018, boots, 0.32, 1, 1).translateX(ankle.x));
    root.add(mesh(new THREE.SphereGeometry(1, 20, 14), boots, [ankle.x, 0.075, 0.055 * f], [0.085 * f, 0.07, 0.15 * f]));
    root.add(mesh(new THREE.CylinderGeometry(1, 1, 0.024, 24), sole, [ankle.x, 0.012, 0.055 * f], [0.09 * f, 1, 0.16 * f]));
  }
}

// ─── Сборка ────────────────────────────────────────────────────────────

export function buildCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>): CharacterParts {
  const root = new THREE.Group();
  const shape = bodyShape(appearance.figure);
  const female = shape.figure === 'female';
  const skinTone = SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
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
  torso.add(ring(shape.neckR + 0.03, 0.014, M.cloth(shade(color, 0.45), 4), TORSO_Y + 0.6, 1.05, 0.95));
  root.add(torso);
  torso.add(outfit.group);

  // Руки на шарнирах в плечах.
  const right = buildArm(shape, -1, { skin, shirt, outfit });
  const left = buildArm(shape, 1, { skin, shirt, outfit });
  root.add(right.pivot, left.pivot);

  // Шея и голова.
  root.add(cone(v(0, 1.54, 0), v(0, 1.76, 0), shape.neckR * 1.08, shape.neckR, skin, 20));
  const head = new THREE.Group();
  head.add(mesh(new THREE.SphereGeometry(HEAD_R, 48, 32), skin, [0, HEAD_Y, 0], [HS.x * (female ? 0.97 : 1), HS.y, HS.z]));
  const eyes: THREE.Object3D[] = [];
  head.add(buildFace(shape.figure, skinTone.base, skinTone.shade, hairColor, appearance.beard, eyes));
  const cover: Cover = equipped.head ? HEAD_COVER[equipped.head] ?? 'none' : 'none';
  head.add(buildHair(appearance.hair, M.hair(hairColor), cover));
  if (equipped.head) head.add(buildHeadItem(equipped.head, ctx));
  head.position.y = -NECK_Y;
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_Y;
  headPivot.userData.baseY = NECK_Y;
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

  return { root, torso, head: headPivot, leftArm: left.pivot, rightArm: right.pivot, eyes, anim };
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
        if (o.upper) object.add(mesh(new THREE.SphereGeometry(shape.upperR + 0.024, 16, 12), o.upper, [s.x, s.y, s.z]), limb(s, e, shape.upperR + 0.016, o.upper));
        if (o.fore) object.add(limb(e, e.clone().lerp(w, 0.88), shape.foreR + 0.02, o.fore));
        if (o.bracer) object.add(cone(e.clone().lerp(w, 0.35), e.clone().lerp(w, 0.92), shape.foreR + 0.024, shape.foreR + 0.02, o.bracer, 20));
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
