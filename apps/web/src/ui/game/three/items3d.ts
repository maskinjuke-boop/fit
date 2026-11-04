import * as THREE from 'three';
import type { Figure } from '../../../game/state';
import { band, frontZ, onTorso, section, skirt, type GarmentId } from './anatomy';
import { HEAD_R, HEAD_SCALE, HEAD_Y, TORSO_Y, type BodyShape } from './body';
import { M, cone, limb, mat, mesh, ring, shade, taperTube, v, type Anim, type Mat } from './kit';

/**
 * 3D-модели всех предметов магазина. Головные уборы строятся вокруг центра головы,
 * одежда — по фигуре персонажа, оружие и предметы второй руки — относительно кулака
 * (начало координат — точка хвата, +Y — вдоль рукояти; подробнее — HoldPose).
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
    case 'gambeson':
      return { top: 'tee_long', bottom: 'pants' };
    case 'monk_habit':
      return { top: 'robe_top', bottom: 'pants' };
    case 'dragon_armor':
      return { layers: ['mail', 'bracers'] };
    case 'huntress_leathers':
      return { top: female ? 'sports_bra' : 'tank', bottom: 'shorts' };
    case 'ranger_garb':
      return { top: female ? 'crop_top' : 'tee_fitted', bottom: 'leggings' };
    case 'gladiator_armor':
      return { top: female ? 'breastplate' : null, bottom: 'briefs', layers: ['greaves', 'bracers'] };
    default:
      return {};
  }
}

export type Shoes = 'boots' | 'sneakers' | 'sandals';
const SHOES: Record<string, Shoes> = {
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
  feathered_cap: 'hat',
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
      g.add(headBand(0.075, 0.06, 0.012, cm));
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
    case 'feathered_cap': {
      // Мягкая шапка с отворотом и длинным пером.
      const cm = M.cloth(color, 6, 0.9);
      const b = mesh(new THREE.SphereGeometry(HEAD_R + 0.045, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), cm, [0.02, HEAD_Y + 0.07, -0.01], [HS.x * 1.05, 0.95, HS.z * 1.05]);
      b.rotation.z = -0.12;
      g.add(b);
      const cuff = M.cloth(shade(color, 0.6), 6, 0.9);
      g.add(headBand(0.1, 0.06, 0.035, cuff));
      const quill = new THREE.CatmullRomCurve3([v(0.17, HEAD_Y + 0.14, -0.04), v(0.23, HEAD_Y + 0.3, -0.12), v(0.22, HEAD_Y + 0.45, -0.26), v(0.15, HEAD_Y + 0.52, -0.38)]);
      g.add(new THREE.Mesh(taperTube(quill, 0.006, 0.002, 20, 6), mat('#f2ead8', 0.6)));
      const vane = M.cloth('#c62828', 3, 0.7);
      vane.side = THREE.DoubleSide;
      for (let i = 1; i < 14; i += 1) {
        const t = i / 14;
        const q = quill.getPoint(t);
        const d = quill.getTangent(t);
        const f = mesh(new THREE.SphereGeometry(1, 10, 6), vane, [q.x, q.y, q.z], [0.008, 0.045, 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.008]);
        f.quaternion.setFromUnitVectors(v(0, 1, 0), d);
        g.add(f);
      }
      g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), M.gold(), [0.165, HEAD_Y + 0.12, 0.0]));
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
    case 'gambeson': {
      // Стёганый гамбезон: ряды простёжки, шнуровка спереди, кожаный пояс.
      const dark = shade(color, 0.55);
      out.top = M.cloth(color, 10, 0.95);
      out.bottom = M.cloth('#4a3a2c', 8, 0.9);
      const stitch = M.cloth(shade(color, 0.7), 4);
      for (let i = 0; i < 7; i += 1) {
        const y = U(0.06 + i * 0.075);
        if (y > top - 0.03) break;
        g.add(seam(shape, [[-0.22, y], [-0.1, y], [0, y], [0.1, y], [0.22, y]], 0.004, stitch, 0.012));
      }
      g.add(seam(shape, [[0, top - 0.02], [0, U(0.3)], [0, TORSO_Y - 0.04]], 0.006, M.leather('#3d2a1c', 2), 0.02));
      for (let i = 0; i < 6; i += 1) {
        const y = U(0.12 + i * 0.075);
        const c = onTorso(shape, 0, y, 0.004, 0.024);
        g.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), M.bronze(), [c.x, c.y, c.z]));
      }
      g.add(band(shape, U(0.03), 0.03, M.leather('#3d2a1c', 3), 0.03));
      g.add(buckle(U(0.03), 0.06, M.bronze()));
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(shape.neckR + 0.03, shape.neckR + 0.05, 0.07, 32, 1, true), M.cloth(dark, 6));
      collar.material.side = THREE.DoubleSide;
      collar.position.y = U(0.66);
      g.add(collar);
      g.add(...cuffs(shape, M.cloth(dark, 6)));
      break;
    }
    case 'monk_habit': {
      // Ряса из грубой шерсти, подпоясанная верёвкой с узлами.
      const wool = M.cloth('#5d4632', 12, 0.98);
      out.top = wool;
      out.bottom = M.cloth('#5d4632', 12, 0.98);
      g.add(skirt(shape, wool, [[0.27, 0.02], [0.3, -0.14], [0.32, -0.3], [0, -0.3]]));
      const rope = M.cloth('#c9b38a', 3, 0.9);
      g.add(band(shape, U(0.05), 0.016, rope, 0.04));
      const fz = frontZ(shape.figure, 0, U(0.05), 0.06);
      g.add(mesh(new THREE.SphereGeometry(0.026, 12, 10), rope, [0.05, U(0.05), fz]));
      for (const [x1, len] of [[0.03, 0.34], [0.08, 0.28]] as const) {
        g.add(limb(v(0.05, U(0.04), fz), v(x1, U(0.04) - len, fz + 0.02), 0.011, rope, 8));
        for (const k of [0.45, 0.95]) g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), rope, [0.05 + (x1 - 0.05) * k, U(0.04) - len * k, fz + 0.02 * k]));
      }
      g.add(...wideCuffs(shape, wool, M.cloth('#4a3626', 10)));
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
    case 'huntress_leathers': {
      // Кожаный лиф и шорты охотницы, пояс с ножнами.
      out.top = M.leather('#6b4428', 3);
      out.bottom = M.leather('#4a2f1f', 3);
      g.add(band(shape, TORSO_Y + 0.0, 0.022, M.leather('#2a1d14', 3), 0.026));
      g.add(buckle(TORSO_Y, 0.05, M.bronze()));
      const sc = onTorso(shape, -0.17, TORSO_Y - 0.06, 0.004, 0.04);
      g.add(limb(sc, sc.clone().add(v(-0.02, -0.2, 0.01)), 0.018, M.leather('#2a1d14', 2)));
      break;
    }
    case 'ranger_garb': {
      // Рубаха цвета героя, кожаные штаны и пояс следопыта.
      out.top = M.cloth(shade(color, 0.9), 10, 0.9);
      out.bottom = M.leather('#5a3a22', 3);
      g.add(band(shape, U(0.04), 0.024, M.leather('#3d2a1c', 3), 0.02));
      g.add(buckle(U(0.04), 0.05, M.bronze()));
      const strap = new THREE.CatmullRomCurve3([[-0.2, top + 0.02], [-0.08, U(0.45)], [0.06, U(0.25)], [0.17, U(0.06)]].map(([x, y]) => onTorso(shape, x!, y!, 0.004, 0.014)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(strap, 40, 0.014, 6), M.leather('#3d2a1c', 3)));
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

// ─── Хват: как предмет лежит в кулаке ──────────────────────────────────

/**
 * Поза предмета в кулаке. Договорённость для всех моделей оружия и второй руки:
 * начало координат — точка хвата (середина рукояти в кулаке), +Y — вдоль рукояти
 * к ударной части, +Z — лицевая сторона наружу от тела (клинки и лезвия лежат в плоскости XY,
 * поэтому в руке они стоят ребром вперёд, а плашмя — наружу).
 * - tilt — подъём рукояти от оси хвата кулака (она смотрит вперёд) к вертикали, рад;
 *   у оружия в правой руке +X модели смотрит вперёд-вниз (у вертикального — вперёд);
 * - roll — поворот модели вокруг собственной рукояти, рад;
 * - bar — рукоять поперечная (ремень щита, дужка фонаря, хвост книги): идёт вдоль X
 *   через кулак, а сам предмет стоит вертикально (+Y вверх) и висит или стоит снаружи кисти.
 */
export interface HoldPose {
  tilt: number;
  roll?: number;
  bar?: boolean;
}

export const HOLD: Record<string, HoldPose> = {
  // Оружие (правая рука): одноручное — ударной частью вперёд-вверх, древковое — почти вертикально.
  wooden_club: { tilt: 0.6 },
  mace: { tilt: 0.6 },
  bronze_sword: { tilt: 0.65 },
  steel_sword: { tilt: 0.65 },
  longsword: { tilt: 0.55 },
  dagger: { tilt: 0.35 },
  magic_wand: { tilt: 0.45 },
  battle_axe: { tilt: 0.6, roll: Math.PI },
  war_hammer: { tilt: 0.6 },
  flail: { tilt: 0.55 },
  leather_whip: { tilt: -0.35 },
  hunter_bow: { tilt: 1.3 },
  oak_staff: { tilt: 1.35 },
  spear: { tilt: 1.35 },
  trident: { tilt: 1.35 },
  reaper_scythe: { tilt: 1.35, roll: Math.PI },
  // Вторая рука (левая).
  wooden_shield: { tilt: 0, bar: true },
  iron_shield: { tilt: 0, bar: true },
  tower_shield: { tilt: 0, bar: true },
  buckler: { tilt: 0, bar: true },
  spell_tome: { tilt: 0, bar: true },
  lantern: { tilt: 0, bar: true },
  war_horn: { tilt: 0.8, roll: Math.PI },
  torch: { tilt: 1.15 },
  crystal_orb: { tilt: 0.9 },
  healing_flask: { tilt: 1.35 },
  love_potion: { tilt: 1.35 },
  lute: { tilt: 1.2 },
};

const DEFAULT_HOLD: HoldPose = { tilt: 0.65 };
export const holdPose = (id: string): HoldPose => HOLD[id] ?? DEFAULT_HOLD;

/**
 * Поворот модели в кулаке: axis — ось хвата кулака (от мизинца к указательному, вперёд),
 * outward — направление наружу от тела (±X).
 */
export function holdQuaternion(axis: THREE.Vector3, outward: THREE.Vector3, pose: HoldPose): THREE.Quaternion {
  const up = v(0, 1, 0);
  const a = axis.clone().normalize();
  const y = pose.bar
    ? up.clone().addScaledVector(a, -up.dot(a)).normalize()
    : a.clone().multiplyScalar(Math.cos(pose.tilt)).addScaledVector(up, Math.sin(pose.tilt)).normalize();
  const z = pose.bar ? new THREE.Vector3().crossVectors(y, a).normalize() : outward.clone().addScaledVector(y, -outward.dot(y)).normalize();
  if (z.dot(outward) < 0) z.negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (pose.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(up, pose.roll));
  return q;
}

/** Направление «вниз» в координатах оружия в правой руке (для свисающих цепей и ремней). */
export function weaponDown(id: string): THREE.Vector3 {
  const t = holdPose(id).tilt;
  return v(Math.cos(t), -Math.sin(t), 0);
}

// ─── Оружие (правая рука персонажа, слева для зрителя) ─────────────────

export function grip(len: number, r: number): THREE.Mesh {
  return limb(v(0, -len / 2, 0), v(0, len / 2, 0), r, M.leather('#3d2a1c', 1));
}

export function buildWeapon(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'wooden_club': {
      // Рукоять длиннее кулака: утолщение начинается выше указательного пальца.
      g.add(grip(0.2, 0.03));
      const head = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.08], [0.035, -0.07], [0.06, 0.1], [0.09, 0.3], [0.095, 0.38], [0.07, 0.44], [0, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)), 24), M.wood('#8a5a30', 1, 2));
      head.position.y = 0.17;
      g.add(head);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const y = 0.43 + (i % 2) * 0.08;
        g.add(cone(v(Math.sin(a) * 0.085, y, Math.cos(a) * 0.085), v(Math.sin(a) * 0.14, y + 0.01, Math.cos(a) * 0.14), 0.016, 0.002, M.iron(), 8));
      }
      break;
    }
    case 'mace': {
      // Шестопёр: окованная рукоять и стальное навершие с перьями.
      g.add(limb(v(0, -0.14, 0), v(0, 0.5, 0), 0.02, M.wood('#4a2f1f', 1, 3)));
      g.add(grip(0.2, 0.024));
      g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), M.iron(), [0, -0.15, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 12), M.iron(), [0, 0.52, 0]));
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        const f = new THREE.Shape();
        f.moveTo(0, -0.08);
        f.lineTo(0.05, -0.04);
        f.lineTo(0.07, 0.02);
        f.lineTo(0.03, 0.09);
        f.lineTo(0, 0.1);
        f.closePath();
        const geo = new THREE.ExtrudeGeometry(f, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
        geo.translate(0.02, 0, -0.004);
        const fl = mesh(geo, M.steel(), [0, 0.55, 0]);
        fl.rotation.y = a;
        g.add(fl);
      }
      g.add(cone(v(0, 0.64, 0), v(0, 0.72, 0), 0.03, 0.002, M.steel(), 8));
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
      // Лук в плоскости XY: рукоять (кожаная обмотка) в начале координат, плечи изогнуты к +X,
      // тетива — по концам плеч (в руке — впереди дуги).
      const curve = new THREE.CatmullRomCurve3([v(0.12, -0.52, 0), v(0.045, -0.32, 0), v(0, -0.08, 0), v(0, 0.08, 0), v(0.045, 0.32, 0), v(0.12, 0.52, 0)]);
      g.add(new THREE.Mesh(taperTube(curve, 0.016, 0.016, 40, 8), M.wood('#7a4a26', 1, 4)));
      g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12), M.leather('#3d2a1c', 1)));
      g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.04, 4), mat('#e8e2d0', 0.6), [0.12, 0, 0]));
      for (const sy of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), M.bronze(), [0.12, 0.52 * sy, 0]));
      break;
    }
    case 'oak_staff': {
      // Хват — в нижней половине посоха: пятка почти у земли, кристалл — на уровне головы.
      g.add(mesh(new THREE.CylinderGeometry(0.026, 0.034, 1.7, 12), M.wood('#7a4a26', 1, 8), [0, -0.05, 0]));
      const top = 0.93;
      // Ветви, обнимающие кристалл.
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        const c = new THREE.QuadraticBezierCurve3(v(0, top - 0.15, 0), v(Math.sin(a) * 0.14, top - 0.04, Math.cos(a) * 0.14), v(Math.sin(a + 0.8) * 0.04, top + 0.12, Math.cos(a + 0.8) * 0.04));
        g.add(new THREE.Mesh(taperTube(c, 0.026, 0.008, 16, 8), M.wood('#6a4424', 1, 2)));
      }
      const orb = M.glow('#8fd3ff', 1.4);
      g.add(mesh(new THREE.IcosahedronGeometry(0.085, 2), orb, [0, top, 0]));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.16, depthWrite: false }));
      halo.position.y = top;
      g.add(halo);
      ctx.anim.push((t) => {
        orb.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.4;
        halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      });
      break;
    }
    case 'flail': {
      // Кистень: рукоять, цепь из звеньев и шипастый шар — цепь свисает отвесно от конца рукояти.
      g.add(limb(v(0, -0.14, 0), v(0, 0.3, 0), 0.022, M.wood('#5a3a22', 1, 3)));
      g.add(grip(0.18, 0.025));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), M.iron(), [0, 0.31, 0]));
      const down = weaponDown(id);
      const top = v(0, 0.34, 0);
      const ball = top.clone().addScaledVector(down, 0.25);
      // Лёгкий изгиб цепи наружу, чтобы звенья не лежали идеальной линией.
      const mid = top.clone().lerp(ball, 0.5).add(v(0, 0, 0.012));
      const chain = new THREE.CatmullRomCurve3([top, mid, ball.clone().addScaledVector(down, -0.06)]);
      const n = 8;
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n;
        const q = chain.getPointAt(t);
        const link = mesh(new THREE.TorusGeometry(0.016, 0.0045, 6, 12), M.darkSteel(), [q.x, q.y, q.z], [1, 1.5, 1]);
        link.quaternion.setFromUnitVectors(v(0, 1, 0), chain.getTangentAt(t));
        if (i % 2) link.rotateY(Math.PI / 2);
        g.add(link);
      }
      g.add(mesh(new THREE.IcosahedronGeometry(0.065, 2), M.iron(), [ball.x, ball.y, ball.z]));
      const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
      const seen = new Set<string>();
      for (let i = 0; i < ico.count; i += 1) {
        const d = v(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize();
        const key = d.toArray().map((x) => x.toFixed(2)).join();
        if (seen.has(key)) continue;
        seen.add(key);
        g.add(cone(ball.clone().addScaledVector(d, 0.055), ball.clone().addScaledVector(d, 0.11), 0.02, 0.002, M.steel(), 6));
      }
      break;
    }
    case 'spear': {
      // Хват — на трети древка от пятки: пятка почти у земли, наконечник выше головы.
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.9, 12), M.wood('#8a5a30', 1, 10), [0, 0.13, 0]));
      const head = new THREE.Shape();
      head.moveTo(0, 0);
      head.quadraticCurveTo(0.07, 0.08, 0.045, 0.16);
      head.lineTo(0, 0.28);
      head.lineTo(-0.045, 0.16);
      head.quadraticCurveTo(-0.07, 0.08, 0, 0);
      const geo = new THREE.ExtrudeGeometry(head, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 1 });
      geo.translate(0, 0, -0.003);
      g.add(mesh(geo, M.steel(), [0, 1.1, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.07, 12), M.bronze(), [0, 1.08, 0]));
      const tassel = M.cloth('#c8322e', 2);
      for (let i = 0; i < 5; i += 1) g.add(limb(v(0, 1.05, 0), v(Math.sin(i * 1.3) * 0.05, 0.91, Math.cos(i * 1.3) * 0.05), 0.012, tassel, 6));
      g.add(mesh(new THREE.ConeGeometry(0.028, 0.08, 10), M.bronze(), [0, -0.85, 0]).rotateX(Math.PI));
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

/**
 * Поперечная рукоять щита: кожаная скоба вдоль X через кулак и две стойки
 * к тыльной стороне щита на расстоянии back (щит — снаружи кулака, лицом +Z).
 */
export function shieldGrip(back: number): THREE.Group {
  const g = new THREE.Group();
  const strap = M.leather('#3d2a1c', 1);
  g.add(limb(v(-0.075, 0, 0), v(0.075, 0, 0), 0.016, strap));
  for (const x of [-0.075, 0.075]) g.add(limb(v(x, 0, 0), v(x, 0, back), 0.012, strap));
  return g;
}

/** Плоская стеклянная фляга (держат за горлышко в начале координат, тулово — ниже кулака). */
export function flask(prof: Array<[number, number]>, glassColor: string, potion: THREE.Material, flat: number): THREE.Group {
  const g = new THREE.Group();
  const glass = mat(glassColor, 0.05, 0, { transparent: true, opacity: 0.38 });
  // Тулово сплюснуто поперёк (как у дорожной фляги), чтобы не задевать бедро.
  g.add(mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32), glass, undefined, [1, 1, flat]));
  const top = prof[prof.length - 1]![1];
  const bottom = prof[0]![1];
  const rMax = Math.max(...prof.map(([r]) => r));
  const cy = bottom + (top - bottom) * 0.42;
  g.add(mesh(new THREE.SphereGeometry(rMax * 0.9, 24, 16, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), potion, [0, cy, 0], [1, 1, flat]));
  // Горлышко с венчиком и пробка над кулаком.
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.06 - top, 14), glass, [0, (top + 0.06) / 2, 0]));
  g.add(mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), glass, [0, 0.06, 0]).rotateX(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.05, 12), M.wood('#a07040'), [0, 0.085, 0]));
  return g;
}

export function buildOffhand(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const { color } = ctx;
  switch (id) {
    case 'wooden_shield': {
      // Круглый щит с центральной рукоятью: кулак — за умбоном.
      const disk = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 48), M.planks('#9a6538'), [0, 0, 0.12]);
      disk.rotation.x = Math.PI / 2;
      g.add(disk);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.026, 10, 48), M.iron());
      rim.position.set(0, 0, 0.12);
      g.add(rim, mesh(new THREE.SphereGeometry(0.07, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.steel(), [0, 0, 0.145]).rotateX(Math.PI / 2));
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), M.iron(), [Math.cos(a) * 0.255, Math.sin(a) * 0.255, 0.148]));
      }
      g.add(shieldGrip(0.095));
      break;
    }
    case 'iron_shield': {
      // Треугольный щит на предплечье: рукоять в нижней трети, верх — у локтя.
      const sh = new THREE.Shape();
      sh.moveTo(-0.24, 0.3);
      sh.lineTo(0.24, 0.3);
      sh.lineTo(0.24, 0.02);
      sh.quadraticCurveTo(0.22, -0.28, 0, -0.42);
      sh.quadraticCurveTo(-0.22, -0.28, -0.24, 0.02);
      sh.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: 3 }), M.steel(), [0, 0.12, 0.1]));
      const inner = new THREE.Shape();
      inner.moveTo(-0.19, 0.25);
      inner.lineTo(0.19, 0.25);
      inner.lineTo(0.19, 0.02);
      inner.quadraticCurveTo(0.17, -0.23, 0, -0.35);
      inner.quadraticCurveTo(-0.17, -0.23, -0.19, 0.02);
      inner.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.01, bevelEnabled: false }), mat(shade(color, 0.75), 0.6, 0.1), [0, 0.12, 0.15]));
      const cm = M.gold();
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.46, 0.02), cm, [0, 0.08, 0.165]), mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), cm, [0, 0.22, 0.165]));
      g.add(shieldGrip(0.08));
      break;
    }
    case 'spell_tome': {
      // Книгу несут за корешок: корешок лежит в кулаке вдоль X, книга висит ниже, обложкой наружу.
      const cover = M.leather('#5a2f6e', 1);
      const cy = -0.125;
      g.add(mesh(new THREE.BoxGeometry(0.33, 0.25, 0.07), cover, [0, cy, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.31, 0.24, 0.058), mat('#efe4c8', 0.9), [0, cy - 0.008, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.33, 16, 1, false, -Math.PI / 2, Math.PI), cover).rotateZ(Math.PI / 2));
      g.add(mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 24), M.gold(), [0, cy, 0.038]));
      g.add(mesh(new THREE.OctahedronGeometry(0.025), M.gem('#b57bff', 0.6), [0, cy, 0.04]));
      for (const [cx, dy] of [[-0.145, 0.095], [0.145, 0.095], [-0.145, -0.105], [0.145, -0.105]] as const) g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.076), M.gold(), [cx, cy + dy, 0]));
      break;
    }
    case 'war_horn': {
      // Турий рог с медными кольцами и мундштуком, на кожаном ремне; держат за узкий конец.
      const horn = mat('#d9c7a3', 0.45);
      // Кривая проходит через начало координат: там её держит кулак (кожаная обмотка).
      const curve = new THREE.CatmullRomCurve3([v(-0.023, -0.06, 0), v(0.027, 0.09, 0), v(0.017, 0.26, 0), v(-0.063, 0.4, 0), v(-0.163, 0.46, 0)]);
      g.add(new THREE.Mesh(taperTube(curve, 0.016, 0.075, 32, 16), horn));
      for (const t of [0.25, 0.6, 0.97]) {
        const q = curve.getPointAt(t);
        const r = 0.016 + (0.075 - 0.016) * t;
        const b = mesh(new THREE.TorusGeometry(r + 0.004, 0.007, 8, 28), M.bronze(), [q.x, q.y, q.z]);
        b.quaternion.setFromUnitVectors(v(0, 0, 1), curve.getTangentAt(t));
        g.add(b);
      }
      const end = curve.getPointAt(1);
      const mouth = mesh(new THREE.CircleGeometry(0.07, 24), mat('#2a1d14', 0.9), [end.x, end.y, end.z]);
      mouth.quaternion.setFromUnitVectors(v(0, 0, 1), curve.getTangentAt(1));
      g.add(mouth);
      g.add(cone(v(-0.023, -0.06, 0), v(-0.023, -0.11, 0), 0.014, 0.017, M.bronze(), 10));
      g.add(cone(curve.getPointAt(0.01), curve.getPointAt(0.2), 0.02, 0.03, M.leather('#3d2a1c', 1), 14));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([curve.getPointAt(0.25), v(0.077, 0.12, -0.03), v(0.047, 0.34, -0.03), curve.getPointAt(0.97)]), 24, 0.006, 6), M.leather('#3d2a1c', 2)));
      break;
    }
    case 'healing_flask': {
      // Круглая стеклянная фляга с зельем; держат за горлышко, шнур обвязан под венчиком.
      const f = flask([[0, -0.29], [0.06, -0.285], [0.1, -0.24], [0.11, -0.18], [0.09, -0.12], [0.035, -0.075], [0.022, -0.05]], '#e9f4f0', M.glow(color, 0.5), 0.6);
      g.add(f);
      g.add(ring(0.026, 0.005, M.leather('#5a3820', 2), 0.045));
      g.add(limb(v(0.025, 0.045, 0), v(0.07, -0.1, 0.03), 0.004, M.leather('#5a3820', 2), 6));
      break;
    }
    case 'torch': {
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.6, 12), M.wood('#6a4424', 1, 3), [0, 0.1, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.12, 14), M.leather('#5a3820', 1), [0, 0.42, 0]));
      for (const [r, y] of [[0.045, 0.37], [0.052, 0.47]] as const) g.add(ring(r, 0.01, M.iron(), y));
      const outer = new THREE.MeshBasicMaterial({ color: '#ff7a12', transparent: true, opacity: 0.9, toneMapped: false });
      const inner = new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false });
      const flame = new THREE.Group();
      flame.position.set(0, 0.5, 0);
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
      // Башенный щит на предплечье: рукоять чуть ниже середины, нижний край — у колена.
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
      g.add(mesh(geo, M.steel(), [0, 0.1, 0.12]));
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
      g.add(mesh(fgeo, mat(shade(color, 0.7), 0.55, 0.15), [0, 0.1, 0.168]));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 32), M.gold(), [0, 0.14, 0.19]));
      const em = star(0.075, 0.035, 0.012, M.gold());
      em.position.set(0, 0.14, 0.19);
      g.add(em);
      for (const [x, y] of [[-0.2, 0.36], [0.2, 0.36], [-0.2, -0.3], [0.2, -0.3]] as const) g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), M.gold(), [x, 0.1 + y, 0.17]));
      g.add(shieldGrip(0.1));
      break;
    }
    case 'crystal_orb': {
      // Сфера на навершии короткого жезла: держат за жезл, сфера — над кулаком.
      g.add(grip(0.16, 0.02));
      g.add(mesh(new THREE.SphereGeometry(0.026, 12, 10), M.gold(), [0, -0.09, 0]));
      const holder = new THREE.Group();
      holder.position.y = 0.08;
      holder.add(mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.05, 16), M.gold(), [0, 0.02, 0]));
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const c = new THREE.QuadraticBezierCurve3(v(Math.sin(a) * 0.05, 0.04, Math.cos(a) * 0.05), v(Math.sin(a) * 0.13, 0.08, Math.cos(a) * 0.13), v(Math.sin(a) * 0.09, 0.17, Math.cos(a) * 0.09));
        holder.add(new THREE.Mesh(taperTube(c, 0.014, 0.006, 12, 6), M.gold()));
      }
      g.add(holder);
      const orbG = new THREE.Group();
      const oy = 0.29;
      orbG.position.set(0, oy, 0);
      const glass = mat('#9ad9ff', 0.05, 0.1, { transparent: true, opacity: 0.45, envMapIntensity: 1.5 });
      const core = M.glow('#6fe8ff', 1.8);
      const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), core);
      orbG.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), glass), coreMesh);
      g.add(orbG);
      ctx.anim.push((t) => {
        orbG.position.y = oy + Math.sin(t * 1.8) * 0.015;
        coreMesh.rotation.set(t * 0.9, t * 1.3, 0);
        core.emissiveIntensity = 1.5 + Math.sin(t * 2.6) * 0.5;
      });
      break;
    }
  }
  return g;
}
