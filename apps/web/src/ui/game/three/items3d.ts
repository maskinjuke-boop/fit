import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { band, frontZ, onTorso, section, skirt, type GarmentId } from './anatomy';
import { HEAD_R, HEAD_SCALE, HEAD_Y, TORSO_Y, type BodyShape } from './body';
import { M, cone, limb, mat, mesh, ring, shade, taperTube, v, type Anim, type Mat } from './kit';

/**
 * 3D-модели всех предметов магазина. Головные уборы строятся вокруг центра головы,
 * одежда — по фигуре персонажа, оружие и предметы второй руки — относительно кисти
 * (начало координат в ладони, +Y — вверх по хвату).
 */

export interface ItemCtx {
  color: string;
  shape: BodyShape;
  /** Сюда предмет добавляет свою анимацию (свечение, пламя, вращение). */
  anim: Anim[];
}

/** Какие слои одежды надеты: верх (null — без верха), низ и слои поверх. */
export interface OutfitPlan {
  top?: GarmentId | null;
  bottom?: GarmentId;
  layers?: GarmentId[];
}

/** Одежда героя: план слоёв, их материалы и детали поверх (пояса, наплечники, плащ). */
export interface Outfit {
  group: THREE.Group;
  plan: OutfitPlan;
  top?: Mat;
  bottom?: Mat;
  layers: Mat[];
}

/** Базовая одежда без предмета: футболка и брюки (у женской фигуры — облегающая футболка и леггинсы). */
export const defaultPlan = (figure: Figure): { top: GarmentId; bottom: GarmentId } =>
  figure === 'female' ? { top: 'tee_fitted', bottom: 'leggings' } : { top: 'tee', bottom: 'pants' };

/** План одежды для предмета тела (без построения сетки — чтобы заранее подготовить нужные слои). */
export function outfitPlan(id: string | undefined, figure: Figure): OutfitPlan {
  const female = figure === 'female';
  switch (id) {
    case 'leather_vest':
      return { layers: ['vest'] };
    case 'chainmail':
    case 'scale_mail':
      return { layers: ['mail'] };
    case 'mystic_robe':
      return { top: 'robe_top' };
    case 'plate_armor':
    case 'champion_armor':
      return { layers: ['cuirass', 'bracers'] };
    case 'tracksuit':
      return { top: 'tee_long', bottom: 'pants' };
    case 'kimono':
      return { top: 'robe_top', bottom: 'pants' };
    case 'dragon_armor':
      return { layers: ['mail', 'bracers'] };
    case 'sport_set':
      return { top: female ? 'sports_bra' : 'tank', bottom: 'shorts' };
    case 'fitness_set':
      return { top: female ? 'crop_top' : 'tee_fitted', bottom: 'leggings' };
    case 'gladiator_armor':
      return { top: female ? 'breastplate' : null, bottom: 'briefs', layers: ['greaves', 'bracers'] };
    default:
      return {};
  }
}

export type Shoes = 'boots' | 'sneakers' | 'sandals';
const SHOES: Record<string, Shoes> = {
  tracksuit: 'sneakers',
  sport_set: 'sneakers',
  fitness_set: 'sneakers',
  gladiator_armor: 'sandals',
};
export const shoesFor = (bodyItem: string | undefined): Shoes => (bodyItem && SHOES[bodyItem]) || 'boots';
/** Высота верха обуви. */
export const shoeTop = (shape: BodyShape, kind: Shoes): number => shape.ankle.y + (kind === 'boots' ? 0.27 : kind === 'sneakers' ? 0.045 : 0.02);

/** Головные уборы с частью, лежащей на плечах (капюшон с накидкой). */
export const HEAD_GARMENTS: Record<string, GarmentId[]> = {
  ranger_hood: ['mantle'],
};

/** Ткань накидки головного убора. */
export const headGarmentMat = (id: string): Mat => (id === 'ranger_hood' ? M.cloth('#44704a', 5) : M.cloth('#666', 5));

/** Что головной убор делает с причёской: шапка прячет макушку, шлем — всё, кроме длинных прядей. */
export const HEAD_COVER: Record<string, 'hat' | 'helm'> = {
  leather_cap: 'hat',
  ranger_hood: 'hat',
  wizard_hat: 'hat',
  sports_cap: 'hat',
  iron_helm: 'helm',
  horned_helm: 'helm',
};

const HS = HEAD_SCALE;
/**
 * Высота на корпусе: смещение от линии пояса, заданное для прежнего (более длинного) корпуса,
 * в пропорциях модели MakeHuman — от пояса до основания шеи корпус короче.
 */
export const U = (o: number): number => TORSO_Y + o * 0.84;

/** Радиус сечения головы на высоте y над её центром. */
export const headR = (y: number): number => Math.sqrt(Math.max(0.001, HEAD_R * HEAD_R - (y / HS.y) ** 2));

/** Повязка-обруч, плотно облегающая голову на высоте y. */
export function headBand(y: number, height: number, off: number, m: Mat): THREE.Mesh {
  const top = headR(y + height / 2) + off;
  const bottom = headR(y - height / 2) + off;
  const me = mesh(new THREE.CylinderGeometry(top, bottom, height, 48, 1, true), m, [0, HEAD_Y + y, 0], [HS.x, 1, HS.z]);
  return me;
}

export function dome(r: number, theta: number, m: Mat, y = 0.01): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, theta), m, [0, HEAD_Y + y, -0.01], [HS.x, HS.y, HS.z]);
}

export function star(outer: number, inner: number, depth: number, m: Mat): THREE.Mesh {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.4, bevelSegments: 1 });
  geo.center();
  return new THREE.Mesh(geo, m);
}

/** Объект, повёрнутый «лицом» наружу от центра головы, в точке на сфере. */
export function onHead(o: THREE.Object3D, y: number, angle: number, off = 0.01): THREE.Object3D {
  const r = headR(y) + off;
  o.position.set(Math.sin(angle) * r * HS.x, HEAD_Y + y, Math.cos(angle) * r * HS.z);
  o.rotation.y = angle;
  return o;
}

// ─── Головные уборы ─────────────────────────────────────────────────────

export function buildHeadItem(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const { color } = ctx;
  switch (id) {
    case 'headband': {
      const cm = M.cloth(color, 8);
      g.add(headBand(0.075, 0.075, 0.012, cm));
      g.add(headBand(0.075, 0.016, 0.016, M.cloth('#f4f4f4', 8)));
      const knot = mesh(new THREE.SphereGeometry(0.035, 14, 10), cm, [0.07, HEAD_Y + 0.07, -0.255]);
      g.add(knot, limb(v(0.08, HEAD_Y + 0.06, -0.27), v(0.15, HEAD_Y - 0.1, -0.31), 0.018, cm), limb(v(0.06, HEAD_Y + 0.06, -0.27), v(0.08, HEAD_Y - 0.13, -0.3), 0.018, cm));
      break;
    }
    case 'leather_cap': {
      const lm = M.leather('#7a4e2d', 2);
      g.add(dome(HEAD_R + 0.04, Math.PI * 0.42, lm, 0.02));
      g.add(ring(headR(0.085) + 0.03, 0.032, M.leather('#5a3820', 3), HEAD_Y + 0.085, HS.x, HS.z));
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        const seam = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R + 0.043, 0.006, 4, 24, Math.PI * 0.4), mat('#4a2f1f', 0.8));
        seam.position.set(0, HEAD_Y + 0.02, -0.01);
        seam.rotation.set(0, a, Math.PI / 2);
        seam.scale.set(HS.x, HS.y, HS.z);
        g.add(seam);
      }
      g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), M.leather('#5a3820'), [0, HEAD_Y + 0.33, -0.01]));
      break;
    }
    case 'ranger_hood': {
      const m = M.cloth('#44704a', 5);
      m.side = THREE.DoubleSide;
      const open = 1.05;
      g.add(mesh(new THREE.SphereGeometry(HEAD_R + 0.07, 40, 20, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * 0.8), m, [0, HEAD_Y + 0.02, -0.02], [HS.x, HS.y, HS.z]));
      // Объёмный край капюшона вокруг лица — по двум меридианам выреза.
      const edgeM = M.cloth('#3a6040', 5);
      for (const phi of [Math.PI / 2 - open, Math.PI / 2 + open]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 12; i += 1) {
          const th = 0.02 + (i / 12) * Math.PI * 0.78;
          const r = HEAD_R + 0.07;
          pts.push(v(-r * Math.cos(phi) * Math.sin(th) * HS.x, HEAD_Y + 0.02 + r * Math.cos(th) * HS.y, -0.02 + r * Math.sin(phi) * Math.sin(th) * HS.z));
        }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.024, 8), edgeM));
      }
      // Накидка на плечах — отдельный слой одежды (см. HEAD_GARMENTS), здесь только сам капюшон.
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 12), m, [0, HEAD_Y + 0.12, -0.33], [1, 1, 0.6]).rotateX(-2.2));
      break;
    }
    case 'wizard_hat': {
      const m = M.cloth('#4b3a8a', 4);
      const lower = cone(v(0, HEAD_Y + 0.17, -0.02), v(0, HEAD_Y + 0.55, -0.08), 0.25, 0.12, m, 40);
      const upper = cone(v(0, HEAD_Y + 0.54, -0.08), v(0.12, HEAD_Y + 0.78, -0.2), 0.122, 0.012, m, 32);
      g.add(lower, upper);
      // Поля шляпы с лёгким изгибом вниз.
      const brimPts = [
        [0.2, 0.012],
        [0.33, 0.004],
        [0.44, -0.012],
        [0.48, -0.03],
        [0.475, -0.04],
        [0.43, -0.026],
        [0.32, -0.012],
        [0.2, -0.008],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const brimM = M.cloth('#3b2d70', 4);
      brimM.side = THREE.DoubleSide;
      g.add(mesh(new THREE.LatheGeometry(brimPts, 56), brimM, [0, HEAD_Y + 0.17, -0.01]));
      g.add(ring(0.24, 0.03, M.gold(), HEAD_Y + 0.21, 1, 1));
      const s1 = star(0.05, 0.022, 0.012, M.glow('#ffe27a', 0.6));
      s1.position.set(0.05, HEAD_Y + 0.38, 0.17);
      s1.rotation.set(-0.2, 0.25, 0.2);
      const s2 = star(0.032, 0.014, 0.01, M.glow('#ffe27a', 0.6));
      s2.position.set(-0.11, HEAD_Y + 0.5, 0.06);
      s2.rotation.set(-0.3, -0.6, -0.3);
      g.add(s1, s2);
      break;
    }
    case 'iron_helm': {
      const st = M.steel();
      g.add(dome(HEAD_R + 0.05, Math.PI * 0.43, st));
      const open = 0.95;
      const guard = M.steel();
      guard.side = THREE.DoubleSide;
      g.add(mesh(new THREE.SphereGeometry(HEAD_R + 0.048, 40, 8, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * 0.42, Math.PI * 0.24), guard, [0, HEAD_Y + 0.01, -0.01], [HS.x, HS.y, HS.z]));
      g.add(ring(headR(0.075) + 0.05, 0.024, M.darkSteel(), HEAD_Y + 0.075, HS.x, HS.z));
      g.add(mesh(new THREE.BoxGeometry(0.045, 0.18, 0.035), st, [0, HEAD_Y, 0.305]));
      g.add(mesh(new THREE.BoxGeometry(0.035, 0.12, 0.32), st, [0, HEAD_Y + 0.33, -0.02]));
      for (let i = -3; i <= 3; i += 1) g.add(onHead(mesh(new THREE.SphereGeometry(0.013, 8, 6), M.darkSteel()), 0.075, i * 0.32, 0.075));
      break;
    }
    case 'champion_crown': {
      const gold = M.gold();
      gold.side = THREE.DoubleSide;
      g.add(dome(HEAD_R + 0.02, Math.PI * 0.26, M.cloth('#8f1f2b', 6), 0.08));
      g.add(mesh(new THREE.CylinderGeometry(headR(0.25) + 0.03, headR(0.15) + 0.03, 0.1, 48, 1, true), gold, [0, HEAD_Y + 0.2, -0.01], [HS.x, 1, HS.z]));
      g.add(ring(headR(0.15) + 0.03, 0.014, M.gold(), HEAD_Y + 0.15, HS.x, HS.z), ring(headR(0.25) + 0.03, 0.012, M.gold(), HEAD_Y + 0.25, HS.x, HS.z));
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const p = v(Math.sin(a) * (headR(0.25) + 0.03) * HS.x, HEAD_Y + 0.31, Math.cos(a) * (headR(0.25) + 0.03) * HS.z - 0.01);
        g.add(mesh(new THREE.ConeGeometry(0.036, 0.12, 4), M.gold(), [p.x, p.y, p.z]));
        g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), M.gold(), [p.x, p.y + 0.07, p.z]));
      }
      g.add(onHead(mesh(new THREE.OctahedronGeometry(0.036), M.gem('#d23a4a')), 0.2, 0, 0.04));
      for (const a of [-0.55, 0.55]) g.add(onHead(mesh(new THREE.OctahedronGeometry(0.024), M.gem('#4da3ff')), 0.2, a, 0.04));
      g.add(mesh(new THREE.SphereGeometry(0.04, 14, 10), M.gold(), [0, HEAD_Y + 0.37, -0.01]));
      break;
    }
    case 'sports_cap': {
      const cm = M.cloth(color, 6, 0.85);
      g.add(dome(HEAD_R + 0.03, Math.PI * 0.44, cm, 0.03));
      g.add(mesh(new THREE.SphereGeometry(0.025, 12, 10), cm, [0, HEAD_Y + 0.33, -0.01]));
      const visorM = M.cloth(shade(color, 0.7), 6, 0.8);
      visorM.side = THREE.DoubleSide;
      const visor = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.014, 32, 1, false, -Math.PI / 2, Math.PI), visorM, [0, HEAD_Y + 0.12, 0.2], [1.05, 1, 1.25]);
      visor.rotation.x = 0.34;
      g.add(visor);
      const logo = onHead(mesh(new THREE.CircleGeometry(0.042, 24), M.cloth('#f4f4f4', 2)), 0.19, 0, 0.036);
      logo.rotation.x = -0.72;
      g.add(logo);
      g.add(ring(headR(0.1) + 0.03, 0.012, M.cloth(shade(color, 0.7), 6), HEAD_Y + 0.1, HS.x, HS.z));
      break;
    }
    case 'flower_wreath': {
      const leafA = mat('#4f9a4a', 0.6);
      const leafB = mat('#3d7f3a', 0.6);
      const y = 0.14;
      const wreath = new THREE.Group();
      wreath.rotation.x = -0.14;
      for (let i = 0; i < 22; i += 1) {
        const a = (i / 22) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), i % 2 ? leafA : leafB);
        leaf.scale.set(1, 0.36, 0.5);
        onHead(leaf, y + (i % 2 ? 0.015 : -0.01), a, 0.02);
        leaf.rotation.z = i % 2 ? 0.5 : -0.5;
        wreath.add(leaf);
      }
      const petals = ['#ff8fb1', '#fff4f4', '#c9a2ff', '#ffd36e'];
      for (let i = 0; i < 9; i += 1) {
        const a = -1.6 + (i / 8) * 3.2;
        const f = new THREE.Group();
        const pm = mat(petals[i % petals.length]!, 0.55);
        for (let k = 0; k < 5; k += 1) {
          const b = (k / 5) * Math.PI * 2;
          f.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), pm, [Math.cos(b) * 0.024, Math.sin(b) * 0.024, 0], [1, 1, 0.45]));
        }
        f.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), mat('#ffcf3a', 0.5), [0, 0, 0.01]));
        onHead(f, y + 0.01, a, 0.045);
        wreath.add(f);
      }
      g.add(wreath);
      break;
    }
    case 'horned_helm': {
      g.add(dome(HEAD_R + 0.05, Math.PI * 0.45, M.darkSteel()));
      const open = 1.0;
      const guard = M.darkSteel();
      guard.side = THREE.DoubleSide;
      g.add(mesh(new THREE.SphereGeometry(HEAD_R + 0.048, 40, 8, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * 0.44, Math.PI * 0.2), guard, [0, HEAD_Y + 0.01, -0.01], [HS.x, HS.y, HS.z]));
      g.add(ring(headR(0.06) + 0.052, 0.03, M.bronze(), HEAD_Y + 0.06, HS.x, HS.z));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), M.bronze(), [0, HEAD_Y + 0.24, 0.05]).rotateX(-0.75));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.17, 0.035), M.bronze(), [0, HEAD_Y - 0.01, 0.305]));
      const horn = mat('#efe3c4', 0.45, 0, { envMapIntensity: 0.8 });
      for (const sx of [-1, 1]) {
        const curve = new THREE.QuadraticBezierCurve3(v(0.22 * sx, HEAD_Y + 0.13, -0.02), v(0.5 * sx, HEAD_Y + 0.16, -0.04), v(0.46 * sx, HEAD_Y + 0.52, 0.06));
        g.add(new THREE.Mesh(taperTube(curve, 0.062, 0.006, 24, 12), horn));
        const base = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.016, 8, 20), M.bronze());
        base.position.set(0.255 * sx, HEAD_Y + 0.135, -0.02);
        base.rotation.y = Math.PI / 2;
        g.add(base);
      }
      for (let i = -4; i <= 4; i += 1) g.add(onHead(mesh(new THREE.SphereGeometry(0.014, 8, 6), M.gold()), 0.06, i * 0.3, 0.085));
      break;
    }
    case 'silver_tiara': {
      const silver = M.silver();
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = -0.6 * Math.PI + (i / 16) * 1.2 * Math.PI;
        const y = 0.13 + 0.03 * Math.cos(a);
        const r = headR(y) + 0.02;
        pts.push(v(Math.sin(a) * r * HS.x, HEAD_Y + y, Math.cos(a) * r * HS.z));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.013, 8), silver));
      const spike = (a: number, h: number, w: number): void => {
        const o = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), M.silver());
        o.scale.z = 0.4;
        onHead(o, 0.16 + 0.03 * Math.cos(a) + h / 2, a, 0.01 - h * 0.12);
        o.rotation.x = -0.25;
        g.add(o);
      };
      spike(0, 0.15, 0.04);
      for (const a of [-0.5, 0.5]) spike(a, 0.08, 0.026);
      for (const a of [-0.95, 0.95]) spike(a, 0.05, 0.02);
      g.add(onHead(mesh(new THREE.OctahedronGeometry(0.03), M.gem('#8f6bff', 0.5), undefined, [0.9, 1.25, 0.6]), 0.19, 0, 0.035));
      for (const a of [-0.5, 0.5]) g.add(onHead(mesh(new THREE.SphereGeometry(0.015, 10, 8), mat('#f6f2ff', 0.2, 0.1)), 0.17, a, 0.035));
      break;
    }
  }
  return g;
}

// ─── Одежда ─────────────────────────────────────────────────────────────

export function cape(m: Mat, shape: BodyShape): THREE.Mesh {
  const w = shape.figure === 'female' ? 0.92 : 1;
  m.side = THREE.DoubleSide;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * w, 0.6 * w, 1.3, 32, 6, true, Math.PI * 0.55, Math.PI * 0.9), m);
  // Лёгкие складки: волна по окружности, усиливающаяся книзу.
  const pos = c.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = (0.65 - y) / 1.3;
    const a = Math.atan2(x, z);
    const f = 1 + Math.sin(a * 9) * 0.05 * k;
    pos.setXYZ(i, x * f, y, z * f);
  }
  c.geometry.computeVertexNormals();
  c.position.set(0, TORSO_Y - 0.06, -0.06);
  c.scale.z = 0.72;
  return c;
}

export function pauldron(shape: BodyShape, sx: number, m: Mat, spikes?: Mat): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const s = shape.figure === 'female' ? 0.84 : 1;
  const p = shape.shoulder;
  const pad = mesh(new THREE.SphereGeometry(0.16 * s, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), m, [p.x * sx * 1.03, p.y + 0.02, 0], [1.1, 0.85, 1]);
  pad.rotation.z = -0.35 * sx;
  out.push(pad);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16 * s * 0.98, 0.012, 6, 28), m);
  rim.position.copy(pad.position).add(v(0.05 * sx, -0.065, 0));
  rim.rotation.set(Math.PI / 2, 0.35 * sx, 0);
  rim.scale.set(1.1, 1, 1);
  out.push(rim);
  if (spikes) {
    for (const k of [-1, 0, 1]) {
      const c = mesh(new THREE.ConeGeometry(0.028, 0.13, 10), spikes, [p.x * sx * 1.08 + 0.02 * sx, p.y + 0.13, k * 0.075]);
      c.rotation.z = -0.5 * sx;
      out.push(c);
    }
  }
  return out;
}

export const pauldrons = (shape: BodyShape, m: Mat, spikes?: Mat): THREE.Object3D[] => [...pauldron(shape, -1, m, spikes), ...pauldron(shape, 1, m, spikes)];

/** Строчка/кант на передней поверхности одежды с отступом off. */
export function seam(shape: BodyShape, pts: Array<[number, number]>, r: number, m: Mat, off: number): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => onTorso(shape, x, y, off, r * 0.6)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 6), m);
}

/** Широкий манжет у кисти (мантия, кимоно). */
export function wideCuffs(shape: BodyShape, m: Mat, trim: Mat): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const e = v(shape.elbow.x * sx, shape.elbow.y, shape.elbow.z);
    const w = v(shape.wrist.x * sx, shape.wrist.y, shape.wrist.z);
    const dir = w.clone().sub(e).normalize();
    const a = e.clone().lerp(w, 0.74);
    const b = e.clone().lerp(w, 0.93);
    const c = cone(a, b, shape.foreR + 0.015, shape.foreR + 0.07, m, 24, true);
    (c.material as Mat).side = THREE.DoubleSide;
    out.push(c);
    const t = new THREE.Mesh(new THREE.TorusGeometry(shape.foreR + 0.068, 0.009, 6, 24), trim);
    t.position.copy(b);
    t.quaternion.setFromUnitVectors(v(0, 0, 1), dir);
    out.push(t);
  }
  return out;
}

/** Ободок на запястье (манжета куртки). */
export function cuffs(shape: BodyShape, m: Mat): THREE.Object3D[] {
  return [-1, 1].map((sx) => {
    const e = v(shape.elbow.x * sx, shape.elbow.y, shape.elbow.z);
    const w = v(shape.wrist.x * sx, shape.wrist.y, shape.wrist.z);
    const c = new THREE.Mesh(new THREE.TorusGeometry(shape.foreR * 0.78 + 0.02, 0.012, 6, 20), m);
    c.position.copy(e).lerp(w, 0.9);
    c.quaternion.setFromUnitVectors(v(0, 0, 1), w.clone().sub(e).normalize());
    return c;
  });
}

/** Птеруги — кожаные полосы юбки гладиатора по кругу бёдер. */
export function pteruges(shape: BodyShape, m: Mat, stud: Mat): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const y = TORSO_Y - 0.1;
  const s = section(shape.figure, y);
  const zc = (s.zFront + s.zBack) / 2;
  const rz = (s.zFront - s.zBack) / 2;
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * (s.wx + 0.035);
    const z = zc + Math.cos(a) * (rz + 0.035);
    const strip = mesh(new THREE.BoxGeometry(0.075, 0.22, 0.012), m, [x, y - 0.06, z]);
    strip.rotation.y = a;
    strip.rotateX(-0.12);
    out.push(strip);
    out.push(mesh(new THREE.SphereGeometry(0.011, 8, 6), stud, [x * 1.03, y - 0.14, zc + (z - zc) * 1.08]));
  }
  return out;
}

export function buildBodyItem(id: string, ctx: ItemCtx): Outfit {
  const g = new THREE.Group();
  const { shape, color } = ctx;
  const female = shape.figure === 'female';
  const plan = outfitPlan(id, shape.figure);
  const out: Outfit = { group: g, plan, layers: [] };
  const top = U(0.58);
  const buckle = (y: number, off: number, m: Mat): THREE.Mesh => mesh(new THREE.BoxGeometry(0.085, 0.07, 0.022), m, [0, y, frontZ(shape.figure, 0, y, off) + 0.012]);
  switch (id) {
    case 'leather_vest': {
      out.layers = [M.leather('#7a4e2d', 3)];
      g.add(band(shape, U(0.04), 0.034, M.leather('#4a2f1f', 4), 0.035));
      g.add(buckle(U(0.04), 0.05, M.bronze()));
      for (const sx of [-1, 1]) g.add(seam(shape, [[0.07 * sx, top - 0.06], [0.06 * sx, U(0.3)], [0.05 * sx, U(0.1)]], 0.005, mat('#d8b48a', 0.8), 0.026));
      break;
    }
    case 'traveler_cloak': {
      g.add(cape(M.cloth('#3f6b48', 5), shape));
      const mantle = new THREE.Mesh(new THREE.TorusGeometry(female ? 0.25 : 0.29, 0.1, 12, 40), M.cloth('#3f6b48', 5));
      mantle.position.y = U(0.6);
      mantle.rotation.x = Math.PI / 2;
      mantle.scale.set(1.15, 0.8, 1);
      g.add(mantle);
      const cz = frontZ(shape.figure, 0, U(0.56), 0.05);
      g.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), M.gold(), [0, U(0.56), cz + 0.02]), mesh(new THREE.OctahedronGeometry(0.024), M.gem(color), [0, U(0.56), cz + 0.06]));
      break;
    }
    case 'chainmail':
      out.layers = [M.mail(8)];
      g.add(band(shape, U(0.04), 0.035, M.leather('#5a3820', 4), 0.04));
      g.add(buckle(U(0.04), 0.055, M.steel()));
      break;
    case 'scale_mail':
      out.layers = [M.scales('#7f9aa3', 4, 0.75)];
      g.add(...pauldrons(shape, M.scales('#6b858e', 2, 0.75)));
      g.add(band(shape, U(0.04), 0.038, M.leather('#3d2a1c', 4), 0.04));
      g.add(buckle(U(0.04), 0.06, M.gold()));
      break;
    case 'mystic_robe': {
      const robe = M.cloth('#43337d', 6);
      out.top = robe;
      g.add(skirt(shape, robe, [[0.27, 0.03], [0.31, -0.15], [0.37, -0.45], [0.42, -0.7], [0.46, -0.84], [0, -0.84]]));
      g.add(band(shape, U(0.05), 0.03, M.gold(), 0.035));
      for (const sx of [-1, 1]) g.add(seam(shape, [[0.11 * sx, top], [0.045 * sx, U(0.44)], [0, U(0.36)]], 0.014, M.gold(), 0.022));
      g.add(mesh(new THREE.OctahedronGeometry(0.03), M.gem('#7fe3ff', 0.8), [0, U(0.36), frontZ(shape.figure, 0, U(0.36), 0.022) + 0.025]));
      g.add(...wideCuffs(shape, robe, M.gold()));
      break;
    }
    case 'plate_armor':
    case 'champion_armor': {
      const champ = id === 'champion_armor';
      const metal = champ ? M.gold() : M.steel();
      out.layers = [metal, champ ? M.gold() : M.steel()];
      if (champ) g.add(cape(M.cloth('#8f1f2b', 5), shape));
      g.add(...pauldrons(shape, champ ? M.gold() : M.steel()));
      g.add(skirt(shape, champ ? M.gold() : M.steel(), [[0.28, 0.02], [0.3, -0.08], [0.31, -0.2], [0, -0.2]]));
      g.add(band(shape, U(0.03), 0.04, champ ? M.cloth('#8f1f2b', 4) : M.darkSteel(), 0.045));
      g.add(seam(shape, [[0, top - 0.03], [0, U(0.12)]], 0.009, champ ? M.gold() : M.darkSteel(), 0.034));
      if (champ) g.add(mesh(new THREE.OctahedronGeometry(0.05), M.gem('#d23a4a', 0.5), [0, U(0.46), frontZ(shape.figure, 0, U(0.46), 0.034) + 0.03]));
      break;
    }
    case 'tracksuit': {
      const dark = shade(color, 0.45);
      out.top = M.cloth(color, 8, 0.75);
      out.bottom = M.cloth(dark, 8, 0.75);
      g.add(seam(shape, [[0, top - 0.02], [0, U(0.3)], [0, TORSO_Y - 0.04]], 0.007, M.chrome(), 0.02));
      g.add(band(shape, TORSO_Y - 0.04, 0.026, M.cloth(dark, 6), 0.028));
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(shape.neckR + 0.03, shape.neckR + 0.05, 0.09, 32, 1, true), M.cloth(dark, 6));
      collar.material.side = THREE.DoubleSide;
      collar.position.y = U(0.66);
      g.add(collar);
      for (const sx of [-1, 1]) g.add(seam(shape, [[0.17 * sx, top - 0.03], [0.2 * sx, U(0.35)], [0.19 * sx, TORSO_Y + 0.0]], 0.009, M.cloth('#f4f4f4', 4), 0.02));
      g.add(...cuffs(shape, M.cloth(dark, 6)));
      break;
    }
    case 'kimono': {
      const gi = M.cloth('#f3f1ea', 10);
      out.top = gi;
      out.bottom = M.cloth('#f3f1ea', 10);
      g.add(skirt(shape, gi, [[0.27, 0.02], [0.3, -0.14], [0.32, -0.3], [0, -0.3]]));
      // Запах кимоно: левая пола поверх правой.
      g.add(seam(shape, [[-0.12, top - 0.01], [-0.02, U(0.42)], [0.12, U(0.12)]], 0.015, M.cloth('#d9d4c6', 6), 0.022));
      g.add(seam(shape, [[0.12, top - 0.01], [0.04, U(0.44)]], 0.011, M.cloth('#d9d4c6', 6), 0.022));
      const belt = M.cloth('#1d1d22', 6);
      g.add(band(shape, U(0.05), 0.04, belt, 0.04));
      const fz = frontZ(shape.figure, 0, U(0.05), 0.06);
      g.add(mesh(new THREE.SphereGeometry(0.04, 12, 10), belt, [0.04, U(0.05), fz], [1.3, 0.9, 0.8]));
      g.add(limb(v(0.04, U(0.03), fz), v(0.0, TORSO_Y - 0.15, fz + 0.01), 0.022, belt), limb(v(0.05, U(0.03), fz), v(0.11, TORSO_Y - 0.13, fz), 0.022, belt));
      g.add(...wideCuffs(shape, gi, M.cloth('#e6e2d6', 6)));
      break;
    }
    case 'dragon_armor': {
      const trim = M.gold();
      out.layers = [M.scales('#8a2324', 4, 0.55), M.gold()];
      g.add(cape(M.cloth('#2a0f12', 5), shape));
      g.add(...pauldrons(shape, M.scales('#5e1517', 2, 0.6), M.gold()));
      g.add(skirt(shape, M.scales('#8a2324', 4, 0.55), [[0.28, 0.02], [0.31, -0.12], [0.34, -0.28], [0, -0.28]]));
      g.add(band(shape, U(0.04), 0.04, trim, 0.045));
      for (const sx of [-1, 1]) g.add(seam(shape, [[0.2 * sx, U(0.52)], [0.06 * sx, U(0.34)], [0, U(0.22)]], 0.013, M.gold(), 0.022));
      const core = M.gem('#ff7a1a', 1.2);
      g.add(mesh(new THREE.OctahedronGeometry(0.05), core, [0, U(0.3), frontZ(shape.figure, 0, U(0.3), 0.022) + 0.03], [1, 1.3, 0.6]));
      ctx.anim.push((t) => {
        core.emissiveIntensity = 1 + Math.sin(t * 2.4) * 0.5;
      });
      break;
    }
    case 'sport_set': {
      out.top = M.cloth(color, 12, 0.6);
      out.bottom = M.cloth(shade(color, 0.32), 12, 0.65);
      // Резинка шорт и логотип.
      g.add(band(shape, TORSO_Y + 0.0, 0.008, M.cloth('#f4f4f4', 4), 0.016));
      break;
    }
    case 'fitness_set': {
      out.top = M.cloth(shade(color, 1.25), 12, 0.65);
      out.bottom = M.cloth(shade(color, 0.42), 12, 0.6);
      g.add(band(shape, U(0.05), 0.02, M.cloth(color, 4), 0.016));
      // Боковые полосы леггинсов.
      break;
    }
    case 'gladiator_armor': {
      const bronze = M.bronze();
      const leather = M.leather('#5a3820', 3);
      out.top = female ? bronze : undefined;
      out.bottom = M.leather('#3d2a1c', 4);
      out.layers = [M.bronze(), M.leather('#4a2f1f', 3)];
      g.add(band(shape, TORSO_Y + 0.0, 0.05, M.leather('#4a2f1f', 3), 0.035));
      g.add(buckle(TORSO_Y, 0.075, M.bronze()));
      g.add(...pteruges(shape, leather, M.bronze()));
      g.add(...pauldron(shape, 1, M.bronze()));
      if (female) {
        g.add(mesh(new THREE.SphereGeometry(0.022, 14, 10), M.bronze(), [0, U(0.39), frontZ(shape.figure, 0, U(0.39), 0.03) + 0.01]));
      } else {
        // Перевязь через грудь с бронзовой бляхой.
        const strap = new THREE.CatmullRomCurve3(
          [
            [-0.2, top + 0.02],
            [-0.08, U(0.45)],
            [0.06, U(0.25)],
            [0.17, U(0.05)],
          ].map(([x, y]) => onTorso(shape, x!, y!, 0.004, 0.012)),
        );
        g.add(new THREE.Mesh(new THREE.TubeGeometry(strap, 40, 0.02, 6), M.leather('#4a2f1f', 3)));
        const c = onTorso(shape, -0.02, U(0.37), 0.004, 0.03);
        g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 24), M.bronze(), [c.x, c.y, c.z]).rotateX(Math.PI / 2));
      }
      break;
    }
  }
  if (out.layers.length === 0 && plan.layers) out.layers = plan.layers.map(() => M.cloth(color, 6));
  return out;
}

// ─── Оружие (правая рука персонажа, слева для зрителя) ─────────────────

/** Наклон оружия в руке: [x, y, z] радиан. */
export const WEAPON_POSE: Record<string, [number, number, number]> = {
  iron_dumbbell: [0, 0.3, 0.15],
  jump_rope: [0.1, 0, 0],
  spear: [0.12, 0, 0.04],
  magic_wand: [0.55, 0, 0],
  hunter_bow: [0, 0, 0],
};

export function grip(len: number, r: number): THREE.Mesh {
  return limb(v(0, -len / 2, 0), v(0, len / 2, 0), r, M.leather('#3d2a1c', 1));
}

export function buildWeapon(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'wooden_club': {
      g.add(grip(0.14, 0.032));
      const head = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.08], [0.035, -0.07], [0.06, 0.1], [0.09, 0.3], [0.095, 0.38], [0.07, 0.44], [0, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)), 24), M.wood('#8a5a30', 1, 2));
      head.position.y = 0.1;
      g.add(head);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const y = 0.36 + (i % 2) * 0.08;
        g.add(cone(v(Math.sin(a) * 0.085, y, Math.cos(a) * 0.085), v(Math.sin(a) * 0.14, y + 0.01, Math.cos(a) * 0.14), 0.016, 0.002, M.iron(), 8));
      }
      break;
    }
    case 'iron_dumbbell': {
      const bar = limb(v(-0.22, 0, 0), v(0.22, 0, 0), 0.022, M.chrome());
      g.add(bar);
      for (const sx of [-1, 1]) {
        for (const [off, r] of [[0.15, 0.1], [0.2, 0.085]] as const) {
          const plate = mesh(new THREE.CylinderGeometry(r, r, 0.045, 32), M.iron(), [off * sx, 0, 0]);
          plate.rotation.z = Math.PI / 2;
          g.add(plate);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 32), M.chrome());
          rim.position.set((off + 0.023) * sx, 0, 0);
          rim.rotation.y = Math.PI / 2;
          g.add(rim);
        }
        const collar = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.chrome(), [0.115 * sx, 0, 0]);
        collar.rotation.z = Math.PI / 2;
        g.add(collar);
      }
      break;
    }
    case 'bronze_sword':
    case 'steel_sword': {
      const steel = id === 'steel_sword';
      const blade = steel ? M.steel() : M.bronze();
      const L = steel ? 0.9 : 0.76;
      g.add(grip(0.16, 0.026));
      // Гарда с загнутыми концами.
      const guard = new THREE.CatmullRomCurve3([v(-0.15, 0.13, 0), v(-0.1, 0.095, 0), v(0, 0.09, 0), v(0.1, 0.095, 0), v(0.15, 0.13, 0)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(guard, 20, steel ? 0.02 : 0.017, 8), steel ? M.gold() : M.bronze()));
      // Клинок с ребром: ромбовидное сечение, сужение к острию.
      const shapeB = new THREE.Shape();
      shapeB.moveTo(-0.048, 0);
      shapeB.lineTo(0.048, 0);
      shapeB.lineTo(0.042, L - 0.12);
      shapeB.lineTo(0, L);
      shapeB.lineTo(-0.042, L - 0.12);
      shapeB.closePath();
      const geo = new THREE.ExtrudeGeometry(shapeB, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1 });
      geo.translate(0, 0, -0.003);
      g.add(mesh(geo, blade, [0, 0.1, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.014, L * 0.7, 0.03), steel ? M.metal('#9aa3ad', 0.3) : M.metal('#a8743c', 0.35), [0, 0.1 + L * 0.38, 0]));
      g.add(mesh(new THREE.SphereGeometry(steel ? 0.042 : 0.034, 16, 12), steel ? M.gold() : M.bronze(), [0, -0.105, 0]));
      if (steel) g.add(mesh(new THREE.OctahedronGeometry(0.026), M.gem('#4da3ff', 0.6), [0, 0.09, 0.022]));
      break;
    }
    case 'hunter_bow': {
      const curve = new THREE.CatmullRomCurve3([v(0, -0.52, 0.05), v(0, -0.32, -0.06), v(0, -0.08, -0.1), v(0, 0.08, -0.1), v(0, 0.32, -0.06), v(0, 0.52, 0.05)]);
      g.add(new THREE.Mesh(taperTube(curve, 0.016, 0.016, 40, 8), M.wood('#7a4a26', 1, 4)));
      g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12), M.leather('#3d2a1c', 1), [0, 0, -0.1]));
      g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.04, 4), mat('#e8e2d0', 0.6), [0, 0, 0.05]));
      for (const sy of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), M.bronze(), [0, 0.52 * sy, 0.05]));
      break;
    }
    case 'oak_staff': {
      g.add(mesh(new THREE.CylinderGeometry(0.026, 0.034, 1.7, 12), M.wood('#7a4a26', 1, 8), [0, 0.12, 0]));
      // Ветви, обнимающие кристалл.
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        const c = new THREE.QuadraticBezierCurve3(v(0, 0.95, 0), v(Math.sin(a) * 0.14, 1.06, Math.cos(a) * 0.14), v(Math.sin(a + 0.8) * 0.04, 1.22, Math.cos(a + 0.8) * 0.04));
        g.add(new THREE.Mesh(taperTube(c, 0.026, 0.008, 16, 8), M.wood('#6a4424', 1, 2)));
      }
      const orb = M.glow('#8fd3ff', 1.4);
      g.add(mesh(new THREE.IcosahedronGeometry(0.085, 2), orb, [0, 1.1, 0]));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.16, depthWrite: false }));
      halo.position.y = 1.1;
      g.add(halo);
      ctx.anim.push((t) => {
        orb.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.4;
        halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      });
      break;
    }
    case 'jump_rope': {
      const hm = M.cloth(ctx.color, 2, 0.5);
      const handles: Array<[THREE.Vector3, THREE.Vector3]> = [
        [v(-0.025, 0.1, 0.01), v(-0.04, -0.08, 0.01)],
        [v(0.03, 0.1, -0.01), v(0.05, -0.08, -0.01)],
      ];
      for (const [a, b] of handles) {
        g.add(limb(a, b, 0.026, hm));
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), M.chrome(), [b.x, b.y - 0.02, b.z]));
      }
      const rope = new THREE.CatmullRomCurve3([v(-0.04, -0.1, 0.01), v(-0.08, -0.35, 0.05), v(-0.02, -0.62, 0.08), v(0.08, -0.6, 0.06), v(0.1, -0.32, 0.02), v(0.05, -0.1, -0.01)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(rope, 48, 0.009, 6), mat('#d8dde6', 0.45)));
      break;
    }
    case 'spear': {
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.9, 12), M.wood('#8a5a30', 1, 10), [0, 0.3, 0]));
      const head = new THREE.Shape();
      head.moveTo(0, 0);
      head.quadraticCurveTo(0.07, 0.08, 0.045, 0.16);
      head.lineTo(0, 0.28);
      head.lineTo(-0.045, 0.16);
      head.quadraticCurveTo(-0.07, 0.08, 0, 0);
      const geo = new THREE.ExtrudeGeometry(head, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 1 });
      geo.translate(0, 0, -0.003);
      g.add(mesh(geo, M.steel(), [0, 1.27, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.07, 12), M.bronze(), [0, 1.25, 0]));
      const tassel = M.cloth('#c8322e', 2);
      for (let i = 0; i < 5; i += 1) g.add(limb(v(0, 1.22, 0), v(Math.sin(i * 1.3) * 0.05, 1.08, Math.cos(i * 1.3) * 0.05), 0.012, tassel, 6));
      g.add(mesh(new THREE.ConeGeometry(0.028, 0.08, 10), M.bronze(), [0, -0.68, 0]).rotateX(Math.PI));
      break;
    }
    case 'battle_axe': {
      g.add(mesh(new THREE.CylinderGeometry(0.026, 0.03, 1.05, 12), M.wood('#6a4424', 1, 5), [0, 0.32, 0]));
      g.add(grip(0.18, 0.033));
      const blade = new THREE.Shape();
      blade.moveTo(0, 0.06);
      blade.lineTo(-0.1, 0.1);
      blade.quadraticCurveTo(-0.2, 0.2, -0.25, 0.24);
      blade.quadraticCurveTo(-0.32, 0.0, -0.25, -0.24);
      blade.quadraticCurveTo(-0.2, -0.2, -0.1, -0.1);
      blade.lineTo(0, -0.06);
      blade.closePath();
      const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
      geo.translate(0, 0, -0.006);
      g.add(mesh(geo, M.steel(), [-0.02, 0.72, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.15, 0.06), M.darkSteel(), [0, 0.72, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.14, 4), M.darkSteel(), [0.09, 0.72, 0]).rotateZ(-Math.PI / 2));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 8), M.darkSteel(), [0, 0.88, 0]));
      break;
    }
    case 'magic_wand': {
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.46, 10), M.wood('#3b2416', 1, 3), [0, 0.12, 0]));
      g.add(ring(0.022, 0.006, M.gold(), 0.0), ring(0.019, 0.006, M.gold(), 0.3));
      const sm = M.glow('#ffe27a', 1.1);
      const s = star(0.075, 0.032, 0.016, sm);
      s.position.set(0, 0.42, 0);
      g.add(s);
      const glowS = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.14, depthWrite: false }));
      glowS.position.y = 0.42;
      g.add(glowS);
      ctx.anim.push((t) => {
        s.rotation.y = t * 1.6;
        sm.emissiveIntensity = 1 + Math.sin(t * 5) * 0.35;
      });
      break;
    }
  }
  return g;
}

// ─── Вторая рука (левая рука персонажа, справа для зрителя) ─────────────

export function buildOffhand(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const { color } = ctx;
  switch (id) {
    case 'wooden_shield': {
      const disk = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 48), M.planks('#9a6538'), [0.04, 0.1, 0.12]);
      disk.rotation.x = Math.PI / 2;
      g.add(disk);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.026, 10, 48), M.iron());
      rim.position.set(0.04, 0.1, 0.12);
      g.add(rim, mesh(new THREE.SphereGeometry(0.07, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.steel(), [0.04, 0.1, 0.145]).rotateX(Math.PI / 2));
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), M.iron(), [0.04 + Math.cos(a) * 0.255, 0.1 + Math.sin(a) * 0.255, 0.148]));
      }
      break;
    }
    case 'iron_shield': {
      const sh = new THREE.Shape();
      sh.moveTo(-0.24, 0.3);
      sh.lineTo(0.24, 0.3);
      sh.lineTo(0.24, 0.02);
      sh.quadraticCurveTo(0.22, -0.28, 0, -0.42);
      sh.quadraticCurveTo(-0.22, -0.28, -0.24, 0.02);
      sh.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: 3 }), M.steel(), [0.04, 0.12, 0.1]));
      const inner = new THREE.Shape();
      inner.moveTo(-0.19, 0.25);
      inner.lineTo(0.19, 0.25);
      inner.lineTo(0.19, 0.02);
      inner.quadraticCurveTo(0.17, -0.23, 0, -0.35);
      inner.quadraticCurveTo(-0.17, -0.23, -0.19, 0.02);
      inner.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.01, bevelEnabled: false }), mat(shade(color, 0.75), 0.6, 0.1), [0.04, 0.12, 0.15]));
      const cm = M.gold();
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.46, 0.02), cm, [0.04, 0.08, 0.165]), mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), cm, [0.04, 0.22, 0.165]));
      break;
    }
    case 'spell_tome': {
      const cover = M.leather('#5a2f6e', 1);
      g.add(mesh(new THREE.BoxGeometry(0.25, 0.33, 0.085), cover, [0.02, 0.05, 0.08]));
      g.add(mesh(new THREE.BoxGeometry(0.235, 0.31, 0.072), mat('#efe4c8', 0.9), [0.03, 0.05, 0.08]));
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.33, 16, 1, false, Math.PI, Math.PI), cover, [-0.105, 0.05, 0.08]));
      g.add(mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 24), M.gold(), [0.02, 0.05, 0.126]));
      g.add(mesh(new THREE.OctahedronGeometry(0.025), M.gem('#b57bff', 0.6), [0.02, 0.05, 0.128]));
      for (const [cx, cy] of [[-0.09, 0.2], [0.13, 0.2], [-0.09, -0.1], [0.13, -0.1]] as const) g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.092), M.gold(), [cx, cy, 0.08]));
      break;
    }
    case 'kettlebell': {
      const iron = M.iron();
      g.add(mesh(new THREE.SphereGeometry(0.15, 32, 20), iron, [0, -0.2, 0.02], [1, 0.95, 1]));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.03, 24), iron, [0, -0.335, 0.02]));
      g.add(mesh(new THREE.TorusGeometry(0.085, 0.024, 10, 24, Math.PI), iron, [0, -0.07, 0.02]));
      const label = mesh(new THREE.CircleGeometry(0.045, 24), mat(color, 0.5), [0, -0.19, 0.172]);
      g.add(label);
      break;
    }
    case 'shaker': {
      const body = mat(color, 0.25, 0, { transparent: true, opacity: 0.85 });
      g.add(mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.3, 32), body, [0, 0.02, 0.06]));
      g.add(mesh(new THREE.CylinderGeometry(0.068, 0.066, 0.16, 32), mat('#efe6d6', 0.8), [0, -0.05, 0.06]));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.078, 0.07, 32), mat('#1f2329', 0.4), [0, 0.2, 0.06]));
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.05, 16), mat('#1f2329', 0.4), [0.03, 0.26, 0.06]));
      for (let i = 0; i < 4; i += 1) g.add(mesh(new THREE.TorusGeometry(0.076, 0.002, 4, 32, Math.PI * 0.5), mat('#ffffff', 0.4), [0, -0.08 + i * 0.05, 0.06]).rotateX(Math.PI / 2).rotateZ(Math.PI * 0.75));
      break;
    }
    case 'torch': {
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.6, 12), M.wood('#6a4424', 1, 3), [0, 0.1, 0.05]));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.12, 14), M.leather('#5a3820', 1), [0, 0.42, 0.05]));
      for (const [r, y] of [[0.045, 0.37], [0.052, 0.47]] as const) {
        const band2 = ring(r, 0.01, M.iron(), y);
        band2.position.z = 0.05;
        g.add(band2);
      }
      const outer = new THREE.MeshBasicMaterial({ color: '#ff7a12', transparent: true, opacity: 0.9, toneMapped: false });
      const inner = new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false });
      const flame = new THREE.Group();
      flame.position.set(0, 0.5, 0.05);
      const f1 = mesh(new THREE.SphereGeometry(0.07, 16, 12), outer, [0, 0.07, 0], [1, 1.9, 1]);
      const f2 = mesh(new THREE.SphereGeometry(0.04, 12, 10), inner, [0, 0.05, 0], [1, 1.7, 1]);
      flame.add(f1, f2);
      const light = new THREE.PointLight('#ff9a3c', 1.4, 2.4, 2);
      light.position.set(0, 0.12, 0);
      flame.add(light);
      g.add(flame);
      ctx.anim.push((t) => {
        const k = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.3) * 0.05;
        flame.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
        flame.rotation.z = Math.sin(t * 5.1) * 0.08;
        light.intensity = 1.2 + Math.sin(t * 11) * 0.25;
      });
      break;
    }
    case 'tower_shield': {
      const sh = new THREE.Shape();
      const w = 0.27;
      const h = 0.46;
      sh.moveTo(-w, h - 0.06);
      sh.quadraticCurveTo(0, h + 0.06, w, h - 0.06);
      sh.lineTo(w, -h + 0.1);
      sh.quadraticCurveTo(0, -h - 0.08, -w, -h + 0.1);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 3, curveSegments: 16 });
      // Щит слегка выгнут, как настоящий башенный.
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i += 1) pos.setZ(i, pos.getZ(i) - (pos.getX(i) / w) ** 2 * 0.07);
      geo.computeVertexNormals();
      g.add(mesh(geo, M.steel(), [0.05, 0.1, 0.12]));
      const face = new THREE.Shape();
      face.moveTo(-w + 0.05, h - 0.1);
      face.quadraticCurveTo(0, h, w - 0.05, h - 0.1);
      face.lineTo(w - 0.05, -h + 0.13);
      face.quadraticCurveTo(0, -h - 0.02, -w + 0.05, -h + 0.13);
      face.closePath();
      const fgeo = new THREE.ExtrudeGeometry(face, { depth: 0.01, bevelEnabled: false, curveSegments: 16 });
      const fp = fgeo.getAttribute('position');
      for (let i = 0; i < fp.count; i += 1) fp.setZ(i, fp.getZ(i) - (fp.getX(i) / w) ** 2 * 0.07);
      fgeo.computeVertexNormals();
      g.add(mesh(fgeo, mat(shade(color, 0.7), 0.55, 0.15), [0.05, 0.1, 0.168]));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 32), M.gold(), [0.05, 0.14, 0.19]));
      const em = star(0.075, 0.035, 0.012, M.gold());
      em.position.set(0.05, 0.14, 0.19);
      g.add(em);
      for (const [x, y] of [[-0.2, 0.36], [0.2, 0.36], [-0.2, -0.3], [0.2, -0.3]] as const) g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), M.gold(), [0.05 + x, 0.1 + y, 0.17]));
      break;
    }
    case 'crystal_orb': {
      const holder = new THREE.Group();
      holder.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.05, 16), M.gold(), [0, 0.02, 0.06]));
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const c = new THREE.QuadraticBezierCurve3(v(Math.sin(a) * 0.05, 0.04, 0.06 + Math.cos(a) * 0.05), v(Math.sin(a) * 0.13, 0.08, 0.06 + Math.cos(a) * 0.13), v(Math.sin(a) * 0.09, 0.17, 0.06 + Math.cos(a) * 0.09));
        holder.add(new THREE.Mesh(taperTube(c, 0.014, 0.006, 12, 6), M.gold()));
      }
      g.add(holder);
      const orbG = new THREE.Group();
      orbG.position.set(0, 0.2, 0.06);
      const glass = mat('#9ad9ff', 0.05, 0.1, { transparent: true, opacity: 0.45, envMapIntensity: 1.5 });
      const core = M.glow('#6fe8ff', 1.8);
      const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), core);
      orbG.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), glass), coreMesh);
      g.add(orbG);
      ctx.anim.push((t) => {
        orbG.position.y = 0.2 + Math.sin(t * 1.8) * 0.015;
        coreMesh.rotation.set(t * 0.9, t * 1.3, 0);
        core.emissiveIntensity = 1.5 + Math.sin(t * 2.6) * 0.5;
      });
      break;
    }
  }
  return g;
}
