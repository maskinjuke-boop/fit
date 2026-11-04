import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Figure } from '../../../game/state';
import { anatomy, band, bodyGeometry, frontZ, section, skirt, type GarmentId } from './anatomy';
import { HEAD_R, HEAD_SCALE, HEAD_Y, NECK_WORLD, TORSO_Y, type BodyShape } from './body';
import { landmarks } from './bodyMesh';
import { at as faceAt } from './head';
import { eyeAnchor } from './headMesh';
import {
  HEAD_COVER,
  HEAD_GARMENTS,
  buildBodyItem,
  buildHeadItem,
  buildOffhand,
  buildWeapon,
  cape,
  dome,
  grip,
  headBand,
  headR,
  onHead,
  outfitPlan,
  pauldrons,
  pteruges,
  shoeTop,
  shoesFor,
  star,
  type ItemCtx,
  type Outfit,
  type OutfitPlan,
} from './items3d';
import { M, cone, limb, mat, mesh, phys, ring, shade, taperTube, tex, v, type Mat } from './kit';

/**
 * Гардероб: 100 новых предметов для слотов «голова», «шея», «верх», «спина», «руки», «низ»,
 * «обувь», «оружие» и «вторая рука». Одежда — оболочки тела (как у прежних вещей) по рецепту:
 * слои, материалы и детали поверх (юбки, пояса, подвязки, монетки). Откровенная одежда
 * (купальники, корсеты, чулки, портупея) закрывает грудь и пах — без наготы.
 * Здесь же — сборка всей одежды героя из всех слотов.
 */

// ─── Материалы ──────────────────────────────────────────────────────────

type MatKind =
  | 'cloth'
  | 'denim'
  | 'silk'
  | 'satin'
  | 'velvet'
  | 'leather'
  | 'latex'
  | 'net'
  | 'lace'
  | 'fur'
  | 'metal'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'steel'
  | 'dark'
  | 'mail'
  | 'scales'
  | 'gem'
  | 'glow'
  | 'pearl'
  | 'feather'
  | 'wood';
/** Материал рецепта; c — цвет (по умолчанию — цвет героя). */
interface MS {
  k: MatKind;
  c?: string;
}

function mk(ms: MS, color: string): Mat {
  const c = ms.c ?? color;
  switch (ms.k) {
    case 'cloth':
      return M.cloth(c, 8, 0.85);
    case 'denim':
      return M.cloth(c, 12, 0.92);
    case 'silk':
      return phys(c, 0.34, { sheen: 0.8, sheenRoughness: 0.3, sheenColor: shade(c, 1.4) });
    case 'satin':
      return phys(c, 0.22, { sheen: 0.6, sheenRoughness: 0.2, sheenColor: shade(c, 1.5), clearcoat: 0.2 });
    case 'velvet':
      return phys(c, 0.85, { sheen: 1, sheenRoughness: 0.5, sheenColor: shade(c, 1.7) });
    case 'leather':
      return M.leather(c, 3);
    case 'latex':
      return phys(c, 0.12, { clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
    case 'net':
    case 'lace': {
      // Сетка и кружево: нити по карте прозрачности, сквозь просветы видна кожа.
      const m = mat(c, 0.6);
      const t = tex(ms.k, ms.k === 'net' ? 1.6 : 1.2);
      if (t) {
        m.alphaMap = t;
        m.alphaTest = 0.5;
      }
      m.side = THREE.DoubleSide;
      return m;
    }
    case 'fur': {
      const m = mat(c, 0.95);
      const t = tex('hair', 6, 2);
      if (t) {
        m.bumpMap = t;
        m.bumpScale = 3;
      }
      return m;
    }
    case 'metal':
      return M.metal(c, 0.28);
    case 'gold':
      return M.gold();
    case 'silver':
      return M.silver();
    case 'bronze':
      return M.bronze();
    case 'steel':
      return M.steel();
    case 'dark':
      return M.darkSteel();
    case 'mail':
      return M.mail();
    case 'scales':
      return M.scales(c);
    case 'gem':
      return M.gem(c, 0.5);
    case 'glow':
      return M.glow(c, 1.4);
    case 'pearl':
      return phys('#f4eee4', 0.18, { clearcoat: 0.9, sheen: 0.6, sheenColor: new THREE.Color('#ffe6f0') });
    case 'feather':
      return mat(c, 0.85, 0, { side: THREE.DoubleSide });
    case 'wood':
      return M.wood(c);
  }
}

// ─── Одежда: верх и низ ─────────────────────────────────────────────────

type Deco =
  | { d: 'belt'; y: number; tube: number; m: MS; off: number; buckle?: MS }
  | { d: 'skirt'; pts: Array<[number, number]>; m: MS; pleats?: number; slit?: boolean }
  | { d: 'loin'; m: MS; len: number }
  | { d: 'garter'; m: MS }
  | { d: 'coins'; m: MS; y: number; front?: boolean }
  | { d: 'gem'; m: MS; at: 'chest' | 'belly' | 'hips' }
  | { d: 'pteruges'; m: MS; stud: MS }
  | { d: 'pauldrons'; m: MS; spikes?: MS }
  | { d: 'sash'; m: MS };

interface Wear {
  top?: GarmentId | null;
  bottom?: GarmentId;
  /** Материал верха (по умолчанию — ткань цвета героя). */
  m?: MS;
  /** Материал низа (по умолчанию — как у верха). */
  bm?: MS;
  layers?: Array<{ g: GarmentId; m: MS; only?: Figure }>;
  deco?: Deco[];
}

const C = (c?: string): MS => ({ k: 'cloth', c });

/** Рецепты одежды для слотов «верх» и «низ». */
const WEAR: Record<string, Wear> = {
  // Верх
  cloth_breastband: { top: 'bikini_top', m: C() },
  leather_bandeau: { top: 'tube_top', m: { k: 'leather', c: '#3a2a22' } },
  silk_crop_top: { top: 'crop_top', m: { k: 'silk' } },
  linen_crop: { top: 'crop_top', m: C('#e8dcc4'), deco: [{ d: 'belt', y: 0.0, tube: 0.01, m: { k: 'leather', c: '#5a3a22' }, off: 0.02 }] },
  lace_bralette: { top: 'bikini_top', m: C('#1b1b22'), layers: [{ g: 'sports_bra', m: { k: 'lace', c: '#1b1b22' }, only: 'female' }] },
  mail_crop: { top: 'crop_top', m: { k: 'mail' } },
  halter_top: { top: 'breastplate', m: { k: 'satin' } },
  leather_harness: { top: 'tube_top', m: { k: 'leather', c: '#1d1a1a' }, layers: [{ g: 'harness', m: { k: 'leather', c: '#1d1a1a' } }] },
  open_vest: { top: 'tube_top', m: C('#26262b'), layers: [{ g: 'vest', m: { k: 'leather', c: '#6b4428' } }] },
  fur_bikini: { top: 'bikini_top', m: { k: 'fur', c: '#c79a63' } },
  leather_bodysuit: { top: 'bodysuit', bottom: 'bikini_bottom', m: { k: 'leather', c: '#4a2f1f' }, deco: [{ d: 'belt', y: -0.02, tube: 0.012, m: { k: 'leather', c: '#2a1d17' }, off: 0.02, buckle: { k: 'bronze' } }] },
  leather_corset: { top: 'tube_top', m: C('#e8dcc4'), layers: [{ g: 'corset', m: { k: 'leather', c: '#3a2418' } }] },
  chain_bikini: { top: 'bikini_top', m: { k: 'mail' }, deco: [{ d: 'gem', m: { k: 'gem', c: '#4da3ff' }, at: 'chest' }] },
  dancer_top: { top: 'bikini_top', m: { k: 'satin', c: '#c2185b' }, deco: [{ d: 'coins', m: { k: 'gold' }, y: -1, front: true }] },
  velvet_corset: { top: 'tube_top', m: { k: 'velvet', c: '#5b0f2e' }, layers: [{ g: 'corset', m: { k: 'velvet', c: '#5b0f2e' } }] },
  assassin_leathers: { top: 'tee_long', bottom: 'leggings', m: { k: 'leather', c: '#1f1b1d' }, deco: [{ d: 'belt', y: -0.02, tube: 0.012, m: { k: 'leather', c: '#3a2418' }, off: 0.02, buckle: { k: 'silver' } }] },
  gold_bikini_armor: { top: 'bikini_top', m: { k: 'gold' }, deco: [{ d: 'pauldrons', m: { k: 'gold' } }, { d: 'gem', m: { k: 'gem', c: '#e53935' }, at: 'chest' }] },
  silver_bikini_armor: { top: 'bikini_top', m: { k: 'silver' }, deco: [{ d: 'pauldrons', m: { k: 'silver' } }, { d: 'gem', m: { k: 'gem', c: '#4da3ff' }, at: 'chest' }] },
  dragon_bikini: { top: 'bikini_top', m: { k: 'scales', c: '#8a1c1c' }, deco: [{ d: 'pauldrons', m: { k: 'scales', c: '#5a1010' }, spikes: { k: 'bronze' } }] },
  goddess_wrap: { top: 'breastplate', m: { k: 'silk', c: '#f5f0e6' }, deco: [{ d: 'belt', y: 0.06, tube: 0.014, m: { k: 'gold' }, off: 0.03 }, { d: 'gem', m: { k: 'gem', c: '#ffd54f' }, at: 'chest' }] },
  // Низ
  short_braies: { bottom: 'bikini_bottom', bm: C() },
  linen_shorts: { bottom: 'micro_shorts', bm: C('#e0d4ba'), deco: [{ d: 'belt', y: -0.03, tube: 0.012, m: { k: 'leather', c: '#3b2a1e' }, off: 0.018, buckle: { k: 'silver' } }] },
  squire_breeches: { bottom: 'shorts', bm: C('#5a4632'), deco: [{ d: 'belt', y: -0.02, tube: 0.011, m: { k: 'leather', c: '#2a1f1a' }, off: 0.016, buckle: { k: 'bronze' } }] },
  riding_breeches: { bottom: 'leggings', bm: { k: 'leather', c: '#5a3a22' }, deco: [{ d: 'belt', y: -0.02, tube: 0.011, m: { k: 'leather', c: '#2a1f1a' }, off: 0.016, buckle: { k: 'silver' } }] },
  leather_shorts: { bottom: 'micro_shorts', bm: { k: 'leather', c: '#2a1f1a' } },
  leather_skirt: { bottom: 'bikini_bottom', bm: C('#2a1f1a'), deco: [{ d: 'skirt', m: { k: 'leather', c: '#5a3a22' }, pts: [[0.205, 0.0], [0.24, -0.1], [0.28, -0.22]] }] },
  pleated_kilt: { bottom: 'bikini_bottom', bm: C('#141418'), deco: [{ d: 'skirt', m: C('#2b3a67'), pleats: 18, pts: [[0.205, 0.0], [0.25, -0.1], [0.3, -0.26]] }] },
  silk_stockings: { bottom: 'bikini_bottom', bm: { k: 'silk', c: '#f1e6d6' }, layers: [{ g: 'stockings', m: { k: 'silk', c: '#f1e6d6' } }], deco: [{ d: 'garter', m: { k: 'satin', c: '#b71c1c' } }] },
  harem_pants: { bottom: 'pants', bm: { k: 'silk' }, deco: [{ d: 'sash', m: { k: 'satin', c: '#ffb020' } }] },
  leather_hose: { bottom: 'leggings', bm: { k: 'leather', c: '#2a1f1a' }, deco: [{ d: 'belt', y: -0.01, tube: 0.009, m: { k: 'leather', c: '#4a2f1f' }, off: 0.014, buckle: { k: 'bronze' } }] },
  lace_garters: { bottom: 'bikini_bottom', bm: { k: 'satin', c: '#16161a' }, layers: [{ g: 'stockings', m: { k: 'lace', c: '#16161a' } }], deco: [{ d: 'garter', m: { k: 'satin', c: '#16161a' } }] },
  silk_sarong: { bottom: 'bikini_bottom', bm: { k: 'silk' }, deco: [{ d: 'skirt', m: { k: 'silk' }, slit: true, pts: [[0.2, 0.0], [0.26, -0.2], [0.3, -0.45], [0.31, -0.55]] }] },
  velvet_shorts: { bottom: 'micro_shorts', bm: { k: 'velvet', c: '#7b1f3a' } },
  loincloth: { bottom: 'bikini_bottom', bm: { k: 'leather', c: '#5a3a22' }, deco: [{ d: 'loin', m: C('#7b5a3a'), len: 0.34 }, { d: 'belt', y: -0.04, tube: 0.016, m: { k: 'leather', c: '#3b2a1e' }, off: 0.02 }] },
  gold_armor_skirt: { bottom: 'bikini_bottom', bm: { k: 'gold' }, deco: [{ d: 'pteruges', m: { k: 'gold' }, stud: { k: 'gem', c: '#e53935' } }, { d: 'belt', y: -0.02, tube: 0.02, m: { k: 'gold' }, off: 0.025 }] },
  chain_loincloth: { bottom: 'bikini_bottom', bm: { k: 'mail' }, deco: [{ d: 'loin', m: { k: 'mail' }, len: 0.3 }, { d: 'belt', y: -0.04, tube: 0.018, m: { k: 'dark' }, off: 0.022 }] },
};

/** Слои, которых нет у мужской фигуры (без них торс открыт). */
const FEMALE_ONLY = new Set<GarmentId>(['bikini_top', 'tube_top', 'breastplate', 'sports_bra']);

const forFigure = (g: GarmentId | null | undefined, figure: Figure): GarmentId | null | undefined => (g && figure === 'male' && FEMALE_ONLY.has(g) ? null : g);

/** План слоёв для предмета верха или низа (прежние предметы — из items3d). */
export function wearPlan(id: string | undefined, figure: Figure): OutfitPlan {
  if (!id) return {};
  const w = WEAR[id];
  if (!w) return outfitPlan(id, figure);
  const layers = (w.layers ?? []).filter((l) => (!l.only || l.only === figure) && forFigure(l.g, figure)).map((l) => l.g);
  const plan: OutfitPlan = {};
  if (w.top !== undefined) plan.top = forFigure(w.top, figure) ?? null;
  if (w.bottom) plan.bottom = w.bottom;
  if (layers.length) plan.layers = layers;
  return plan;
}

const isWear = (id: string): boolean => id in WEAR;

/** Точка на поверхности тела (z) при движении от оси вперёд (dir = 1) или назад (−1). */
function surfaceZ(figure: Figure, x: number, y: number, dir: number, off: number): number {
  const a = anatomy(figure);
  const f = (z: number): number => Math.min(a.torso(x, y, z), a.leg(x, y, z)) - off;
  let z = dir > 0 ? -0.05 : 0.05;
  while (Math.abs(z) < 0.5 && f(z) < 0) z += 0.004 * dir;
  return z;
}

function decoObjects(dc: Deco, shape: BodyShape, color: string): THREE.Object3D[] {
  const figure = shape.figure;
  const L = landmarks(figure);
  switch (dc.d) {
    case 'belt': {
      const y = TORSO_Y + dc.y;
      const out: THREE.Object3D[] = [band(shape, y, dc.tube, mk(dc.m, color), dc.off)];
      if (dc.buckle) out.push(mesh(new THREE.BoxGeometry(0.06, 0.045, 0.014), mk(dc.buckle, color), [0, y, frontZ(figure, 0, y, dc.off + dc.tube) + 0.006]));
      return out;
    }
    case 'skirt': {
      const m = mk(dc.m, color);
      m.side = THREE.DoubleSide;
      const sk = skirt(shape, m, dc.pts.map(([r, y]) => [r, y - 0.05]), 1.04);
      const pos = sk.geometry.getAttribute('position');
      const top = dc.pts[0]![1] - 0.05;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const a = Math.atan2(x, z);
        const k = Math.min(1, Math.max(0, (top - y) / 0.12));
        // Складки плиссе: радиус «гармошкой», сильнее книзу.
        const f = dc.pleats ? 1 + 0.035 * k * Math.abs(Math.sin(a * dc.pleats)) : 1 + 0.02 * k * Math.sin(a * 7);
        pos.setXYZ(i, x * f, y, z * f);
      }
      if (dc.slit) {
        // Разрез сбоку: убираем треугольники в узком секторе на левом бедре ниже середины.
        const idx = sk.geometry.index;
        if (idx) {
          const keep: number[] = [];
          for (let t = 0; t < idx.count; t += 3) {
            const vs = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
            const cut = vs.every((j) => {
              const a = Math.atan2(pos.getX(j), pos.getZ(j));
              return Math.abs(a - 1.2) < 0.22 && pos.getY(j) < top - 0.12;
            });
            if (!cut) keep.push(...vs);
          }
          sk.geometry.setIndex(keep);
        }
      }
      sk.geometry.computeVertexNormals();
      return [sk];
    }
    case 'loin': {
      const m = mk(dc.m, color);
      m.side = THREE.DoubleSide;
      const y = TORSO_Y - 0.06;
      const out: THREE.Object3D[] = [];
      for (const dir of [1, -1]) {
        const z = surfaceZ(figure, 0, y, dir, 0.02);
        const geo = new THREE.PlaneGeometry(0.17, dc.len, 4, 8);
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i += 1) {
          const yy = p.getY(i);
          const k = (dc.len / 2 - yy) / dc.len;
          // Полотнище чуть сужается и отходит от тела книзу.
          p.setXYZ(i, p.getX(i) * (1 - 0.25 * k), yy, (0.01 + 0.06 * k * k) * dir + Math.sin(p.getX(i) * 30) * 0.004 * k);
        }
        geo.computeVertexNormals();
        out.push(mesh(geo, m, [0, y - dc.len / 2 + 0.02, z]));
      }
      return out;
    }
    case 'garter': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [band(shape, TORSO_Y - 0.03, 0.009, m, 0.016)];
      const yTop = TORSO_Y - 0.04;
      const yBot = L.knee[1] + 0.24;
      for (const sx of [-1, 1]) {
        for (const dir of [1, -1]) {
          const x = (L.hip[0] + 0.02) * sx;
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 6; i += 1) {
            const y = yTop + ((yBot - yTop) * i) / 6;
            pts.push(v(x, y, surfaceZ(figure, x, y, dir, 0.01) + 0.002 * dir));
          }
          out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.005, 6), m));
        }
      }
      return out;
    }
    case 'coins': {
      const m = mk(dc.m, color);
      const out: THREE.Object3D[] = [];
      const y0 = dc.y < 0 ? (L.nipple ? L.nipple[1] : L.armpit - 0.07) - 0.085 : TORSO_Y + dc.y;
      for (let i = -6; i <= 6; i += 1) {
        const x = i * 0.024;
        const y = y0 - 0.012 - (i % 2 === 0 ? 0 : 0.012);
        const z = frontZ(figure, x, y0, 0.016);
        const coin = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 14), m, [x, y, z + 0.004]);
        coin.rotation.x = Math.PI / 2;
        out.push(coin);
      }
      return out;
    }
    case 'gem': {
      const y = dc.at === 'chest' ? (L.nipple ? L.nipple[1] : L.armpit - 0.07) + 0.0 : dc.at === 'belly' ? TORSO_Y + 0.12 : TORSO_Y - 0.06;
      const z = frontZ(figure, 0, y, 0.02);
      return [mesh(new THREE.OctahedronGeometry(0.022), mk(dc.m, color), [0, y, z + 0.012], [1, 1.3, 0.6])];
    }
    case 'pteruges':
      return pteruges(shape, mk(dc.m, color), mk(dc.stud, color));
    case 'pauldrons':
      return pauldrons(shape, mk(dc.m, color), dc.spikes ? mk(dc.spikes, color) : undefined);
    case 'sash': {
      const m = mk(dc.m, color);
      const y = TORSO_Y + 0.02;
      const out: THREE.Object3D[] = [band(shape, y, 0.022, m, 0.03)];
      const x = section(figure, y).wx * 0.7;
      out.push(limb(v(x, y - 0.02, 0.12), v(x + 0.03, y - 0.28, 0.1), 0.02, m), limb(v(x + 0.03, y - 0.02, 0.11), v(x + 0.07, y - 0.22, 0.08), 0.018, m));
      return out;
    }
  }
}

/** Одежда предмета верха или низа (прежние предметы строит items3d). */
export function buildWear(id: string, ctx: ItemCtx): Outfit {
  const w = WEAR[id];
  if (!w) return buildBodyItem(id, ctx);
  const g = new THREE.Group();
  const figure = ctx.shape.figure;
  const plan = wearPlan(id, figure);
  const top = mk(w.m ?? C(), ctx.color);
  const out: Outfit = { group: g, plan, top, bottom: w.bm ? mk(w.bm, ctx.color) : top, layers: [] };
  for (const l of w.layers ?? []) if ((!l.only || l.only === figure) && forFigure(l.g, figure)) out.layers.push(mk(l.m, ctx.color));
  for (const dc of w.deco ?? []) for (const o of decoObjects(dc, ctx.shape, ctx.color)) g.add(o);
  return out;
}

// ─── Обувь ──────────────────────────────────────────────────────────────

type ShoeKind = 'boots' | 'sneakers' | 'sandals' | 'knee' | 'thigh' | 'none';
interface ShoeRecipe {
  shoe: ShoeKind;
  m: MS;
  sole?: MS;
  cuff?: MS;
  anklets?: MS;
  /** Ремешки с пряжками поверх голенища. */
  straps?: MS;
  /** Длинный загнутый носок (пулены). */
  toe?: boolean;
}

const SHOES: Record<string, ShoeRecipe> = {
  silk_slippers: { shoe: 'sneakers', m: { k: 'satin' }, sole: C('#222226') },
  leather_shoes: { shoe: 'sneakers', m: { k: 'leather', c: '#5a3a22' }, sole: { k: 'leather', c: '#2a1f1a' } },
  lace_sandals: { shoe: 'sandals', m: { k: 'leather', c: '#8a5a3a' } },
  anklets: { shoe: 'none', m: { k: 'gold' }, anklets: { k: 'gold' } },
  soldier_boots: { shoe: 'boots', m: { k: 'leather', c: '#1f1f1f' }, sole: C('#111'), cuff: { k: 'leather', c: '#1f1f1f' }, straps: { k: 'dark' } },
  knee_boots: { shoe: 'knee', m: { k: 'leather', c: '#5a3a22' }, sole: C('#1d1f24') },
  fur_boots: { shoe: 'knee', m: { k: 'fur', c: '#b08a62' }, sole: C('#3a2a1e'), cuff: { k: 'fur', c: '#d8c0a0' } },
  poulaines: { shoe: 'sneakers', m: { k: 'velvet', c: '#5b0f2e' }, sole: { k: 'leather', c: '#2a1f1a' }, toe: true },
  suede_thigh_boots: { shoe: 'thigh', m: { k: 'velvet', c: '#3a2630' }, sole: C('#1d1f24') },
  leather_thigh_boots: { shoe: 'thigh', m: { k: 'leather', c: '#1f1b1d' }, sole: C('#0d0d0f'), straps: { k: 'bronze' } },
  gold_sandals: { shoe: 'sandals', m: { k: 'gold' }, anklets: { k: 'gold' } },
  steel_sabatons: { shoe: 'knee', m: { k: 'steel' }, sole: { k: 'dark' }, cuff: { k: 'steel' } },
};

const SHOE_LAYERS: Record<ShoeKind, GarmentId[]> = { boots: ['boots', 'sole'], sneakers: ['sneakers', 'sole'], sandals: ['sandals', 'sole'], knee: ['knee_boots', 'sole'], thigh: ['thigh_boots', 'sole'], none: [] };

/** Обувь героя: предмет слота «обувь» или обувь, положенная к одежде. */
function shoeRecipe(equipped: Partial<Record<Slot, string>>): ShoeRecipe {
  const own = equipped.feet ? SHOES[equipped.feet] : undefined;
  if (own) return own;
  const kind = shoesFor(equipped.body);
  if (kind === 'sneakers') return { shoe: 'sneakers', m: { k: 'leather', c: '#5a3a22' }, sole: { k: 'leather', c: '#2a1f1a' } };
  if (kind === 'sandals') return { shoe: 'sandals', m: { k: 'leather', c: '#6b4428' } };
  return { shoe: 'boots', m: { k: 'leather', c: '#4a2f1f' }, sole: C('#1d1f24'), cuff: { k: 'leather', c: '#4a2f1f' } };
}

/** Радиус голени на высоте y (по модели ноги, с запасом). */
const shinR = (shape: BodyShape, y: number): number => {
  const y0 = shape.ankle.y + 0.04;
  const y1 = shape.knee.y - 0.1;
  const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return shape.ankleR + (shape.calfR - shape.ankleR) * k + 0.004;
};

/** Высота верха обуви. */
function shoeTopY(shape: BodyShape, kind: ShoeKind): number {
  if (kind === 'knee') return shape.knee.y - 0.03;
  if (kind === 'thigh') return shape.knee.y + 0.22;
  if (kind === 'none') return shape.ankle.y;
  return shoeTop(shape, kind);
}

/** Обувь (слои-оболочки ноги) и детали: отворот, браслеты на щиколотках. */
export function buildShoes(shape: BodyShape, equipped: Partial<Record<Slot, string>>, color: string, garment: (id: GarmentId, m: Mat) => THREE.Object3D): THREE.Object3D[] {
  const r = shoeRecipe(equipped);
  const out: THREE.Object3D[] = [];
  const layers = SHOE_LAYERS[r.shoe];
  if (layers.length) {
    out.push(garment(layers[0]!, mk(r.m, color)));
    out.push(garment('sole', mk(r.sole ?? r.m, color)));
  }
  const ringAt = (y: number, extra: number, tube: number, m: Mat): void => {
    for (const sx of [-1, 1]) {
      const k = (y - shape.ankle.y) / (shape.knee.y - shape.ankle.y);
      const c = shape.ankle.clone().lerp(shape.knee, k);
      const rr = k > 1 ? shinR(shape, shape.knee.y) * 1.25 : shinR(shape, y);
      out.push(ring(rr + extra, tube, m, y, 1, 1).translateX(c.x * sx).translateZ(c.z));
    }
  };
  if (r.cuff && r.shoe !== 'none') ringAt(shoeTopY(shape, r.shoe) - 0.004, r.shoe === 'thigh' ? 0.03 : 0.02, r.cuff.k === 'fur' ? 0.03 : 0.014, mk(r.cuff, color));
  if (r.straps) {
    const m = mk(r.straps, color);
    ringAt(shape.ankle.y + 0.1, 0.018, 0.007, m);
    ringAt(shape.ankle.y + 0.18, 0.018, 0.007, m);
  }
  if (r.toe) {
    // Пулены: носок вытянут вперёд и чуть загнут вверх.
    const L = landmarks(shape.figure);
    const m = mk(r.m, color);
    for (const sx of [-1, 1]) {
      const base = v(L.toe[0] * sx, shape.ankle.y + 0.025, L.toe[2] - 0.035);
      const c = new THREE.CatmullRomCurve3([base, base.clone().add(v(0, -0.005, 0.07)), base.clone().add(v(0, 0.015, 0.13)), base.clone().add(v(0, 0.05, 0.16))]);
      out.push(new THREE.Mesh(taperTube(c, 0.032, 0.004, 20, 10), m));
    }
  }
  if (r.anklets) {
    const m = mk(r.anklets, color);
    ringAt(shape.ankle.y + 0.03, 0.006, 0.005, m);
    ringAt(shape.ankle.y + 0.05, 0.008, 0.004, m);
  }
  return out;
}

// ─── Руки: перчатки, браслеты, наручи ───────────────────────────────────

type HandRegion = 'hand' | 'fingerless' | 'wrap' | 'forearm' | 'opera' | 'bracer' | 'gauntlet';
interface HandRecipe {
  region?: HandRegion;
  m: MS;
  off?: number;
  bracelets?: MS;
  cuffs?: MS;
  spikes?: MS;
}

const HANDS: Record<string, HandRecipe> = {
  leather_gloves: { region: 'hand', m: { k: 'leather', c: '#2a1f1a' } },
  linen_wraps: { region: 'wrap', m: C('#e8dcc4') },
  archer_gloves: { region: 'fingerless', m: { k: 'leather', c: '#141416' } },
  gold_bracelets: { m: { k: 'gold' }, bracelets: { k: 'gold' } },
  lace_gloves: { region: 'forearm', m: { k: 'lace', c: '#16161a' } },
  fur_cuffs: { m: { k: 'fur', c: '#e8dccb' }, cuffs: { k: 'fur', c: '#e8dccb' } },
  silk_opera_gloves: { region: 'opera', m: { k: 'satin' } },
  leather_opera_gloves: { region: 'opera', m: { k: 'leather', c: '#2a1d17' } },
  spiked_bracers: { region: 'bracer', m: { k: 'leather', c: '#2a1f1a' }, off: 0.012, spikes: { k: 'steel' } },
  steel_gauntlets: { region: 'gauntlet', m: { k: 'steel' }, off: 0.008 },
};

/**
 * Слой «на коже» рук: участок сетки тела (с той же позой кистей), немного отодвинутый
 * наружу. Перчатки сидят точно по руке и по сжатому кулаку.
 */
function handLayer(shape: BodyShape, grips: readonly [boolean, boolean], region: HandRegion, off: number, m: Mat): THREE.Mesh {
  const src = bodyGeometry(shape.figure, grips);
  const pos = src.getAttribute('position');
  const nor = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const s = shape.shoulder;
  const e = shape.elbow;
  const w = shape.wrist;
  const fore = new THREE.Vector3().subVectors(w, e);
  const fl = fore.lengthSq();
  const up = new THREE.Vector3().subVectors(e, s);
  const ul = up.lengthSq();
  const handEnd = w.clone().addScaledVector(fore.clone().normalize(), 0.22);
  const p = new THREE.Vector3();
  const segDist = (a: THREE.Vector3, b: THREE.Vector3): number => {
    const ab = new THREE.Vector3().subVectors(b, a);
    const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq()));
    return a.clone().addScaledVector(ab, t).distanceTo(p);
  };
  const inside = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i);
    p.x = Math.abs(p.x);
    if (p.x < 0.14) continue;
    const near = Math.min(segDist(e, w), segDist(w, handEnd));
    const tf = new THREE.Vector3().subVectors(p, e).dot(fore) / fl;
    const tu = new THREE.Vector3().subVectors(p, s).dot(up) / ul;
    const nearUp = segDist(s, e) < 0.085 && tu > 0.45;
    let ok = false;
    if (near < 0.085) {
      if (region === 'hand' || region === 'gauntlet') ok = tf > 0.96 || (region === 'gauntlet' && tf > 0.45);
      else if (region === 'fingerless') ok = tf > 0.96 && tf < 1.13;
      else if (region === 'wrap') ok = tf > 0.78 && tf < 1.12;
      else if (region === 'forearm') ok = tf > 0.05;
      else if (region === 'opera') ok = true;
      else if (region === 'bracer') ok = tf > 0.35 && tf < 0.95;
    }
    if (region === 'opera' && nearUp) ok = true;
    inside[i] = ok ? 1 : 0;
  }
  const idx = src.index!;
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (inside[a] && inside[b] && inside[c]) keep.push(a, b, c);
  }
  const used = [...new Set(keep)].sort((x, y) => x - y);
  const map = new Map(used.map((o, n) => [o, n]));
  const P = new Float32Array(used.length * 3);
  const N = new Float32Array(used.length * 3);
  const UV = new Float32Array(used.length * 2);
  used.forEach((o, n) => {
    P[n * 3] = pos.getX(o) + nor.getX(o) * off;
    P[n * 3 + 1] = pos.getY(o) + nor.getY(o) * off;
    P[n * 3 + 2] = pos.getZ(o) + nor.getZ(o) * off;
    N[n * 3] = nor.getX(o);
    N[n * 3 + 1] = nor.getY(o);
    N[n * 3 + 2] = nor.getZ(o);
    if (uv) {
      UV[n * 2] = uv.getX(o);
      UV[n * 2 + 1] = uv.getY(o);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setIndex(keep.map((o) => map.get(o)!));
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, m);
}

/** Предмет слота «руки»; grips — какие кисти сжаты (держат предмет). */
export function buildHands(id: string, ctx: ItemCtx, grips: readonly [boolean, boolean]): THREE.Group {
  const g = new THREE.Group();
  const r = HANDS[id];
  if (!r) return g;
  const { shape, color } = ctx;
  if (r.region) g.add(handLayer(shape, grips, r.region, r.off ?? 0.0035, mk(r.m, color)));
  const e = shape.elbow;
  const w = shape.wrist;
  const at = (t: number, sx: number): THREE.Vector3 => v(e.x * sx, e.y, e.z).lerp(v(w.x * sx, w.y, w.z), t);
  const dir = (sx: number): THREE.Vector3 => v(w.x * sx, w.y, w.z).sub(v(e.x * sx, e.y, e.z)).normalize();
  const bangle = (t: number, rad: number, tube: number, m: Mat): void => {
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 8, 24), m);
      b.position.copy(at(t, sx));
      b.quaternion.setFromUnitVectors(v(0, 0, 1), dir(sx));
      g.add(b);
    }
  };
  const R = shape.foreR;
  if (r.bracelets) {
    const m = mk(r.bracelets, color);
    bangle(0.86, R * 0.78 + 0.012, 0.006, m);
    bangle(0.9, R * 0.76 + 0.012, 0.005, m);
    bangle(0.94, R * 0.74 + 0.012, 0.006, m);
  }
  if (r.cuffs) bangle(0.86, R * 0.8 + 0.02, 0.022, mk(r.cuffs, color));
  if (r.region === 'gauntlet') bangle(0.45, R + 0.02, 0.012, mk(r.m, color));
  if (r.spikes) {
    const m = mk(r.spikes, color);
    for (const sx of [-1, 1]) {
      const d = dir(sx);
      const side = v(sx, 0, 0).sub(d.clone().multiplyScalar(d.x * sx)).normalize();
      for (const t of [0.45, 0.6, 0.75]) {
        const base = at(t, sx).addScaledVector(side, R + 0.012);
        g.add(cone(base, base.clone().addScaledVector(side, 0.04), 0.012, 0.001, m, 8));
      }
    }
  }
  return g;
}

// ─── Шея: украшения ─────────────────────────────────────────────────────

type NeckKind = 'chain' | 'choker' | 'pearls' | 'scarf' | 'collar' | 'pendant' | 'boa' | 'torc' | 'amulet';
interface NeckRecipe {
  kind: NeckKind;
  m: MS;
  gem?: MS;
}

const NECK: Record<string, NeckRecipe> = {
  gold_chain: { kind: 'chain', m: { k: 'gold' } },
  leather_choker: { kind: 'choker', m: { k: 'leather', c: '#1b1714' }, gem: { k: 'silver' } },
  pearl_necklace: { kind: 'pearls', m: { k: 'pearl' } },
  lace_choker: { kind: 'choker', m: { k: 'satin', c: '#141418' }, gem: { k: 'gem', c: '#b0124a' } },
  silk_scarf: { kind: 'scarf', m: { k: 'silk' } },
  spiked_collar: { kind: 'collar', m: { k: 'leather', c: '#141416' }, gem: { k: 'steel' } },
  crystal_pendant: { kind: 'pendant', m: { k: 'silver' }, gem: { k: 'glow', c: '#7fd8ff' } },
  feather_boa: { kind: 'boa', m: { k: 'fur', c: '#ff7ab8' } },
  silver_torc: { kind: 'torc', m: { k: 'silver' }, gem: { k: 'gem', c: '#4da3ff' } },
  ruby_amulet: { kind: 'amulet', m: { k: 'gold' }, gem: { k: 'gem', c: '#d50032' } },
};

/** Петля вокруг шеи по поверхности тела; на груди спереди опускается на drop. */
function neckLoop(figure: Figure, y0: number, drop: number, off: number, n = 64): THREE.Vector3[] {
  const a = anatomy(figure);
  const sec = section(figure, y0);
  const zc = (sec.zFront + sec.zBack) / 2;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const dx = Math.sin(t);
    const dz = Math.cos(t);
    const y = y0 - drop * Math.max(0, dz) ** 2.2;
    let q = 0.02;
    while (q < 0.5 && a.torso(dx * q, y, zc + dz * q) - off < 0) q += 0.003;
    pts.push(v(dx * q, y, zc + dz * q));
  }
  return pts;
}

export function buildNeck(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const r = NECK[id];
  if (!r) return g;
  const figure = ctx.shape.figure;
  const L = landmarks(figure);
  const m = mk(r.m, ctx.color);
  const base = L.clavicle[1] + 0.035;
  const mid = (base + NECK_WORLD) / 2;
  const tube = (pts: THREE.Vector3[], rad: number, mm: Mat): THREE.Mesh => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length * 2, rad, 8, true), mm);
  const lowest = (pts: THREE.Vector3[]): THREE.Vector3 => pts.reduce((a, b) => (b.z > a.z && Math.abs(b.x) < 0.02 ? b : a), pts[0]!);
  switch (r.kind) {
    case 'chain':
    case 'pendant':
    case 'amulet': {
      const drop = r.kind === 'chain' ? 0.07 : r.kind === 'pendant' ? 0.1 : 0.12;
      const pts = neckLoop(figure, base, drop, 0.006);
      g.add(tube(pts, r.kind === 'chain' ? 0.0045 : 0.003, m));
      const low = lowest(pts);
      if (r.kind === 'pendant' && r.gem) g.add(mesh(new THREE.OctahedronGeometry(0.022), mk(r.gem, ctx.color), [low.x, low.y - 0.026, low.z + 0.012], [0.8, 1.4, 0.6]));
      if (r.kind === 'amulet' && r.gem) {
        g.add(mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 24), m, [low.x, low.y - 0.03, low.z + 0.01]));
        g.add(mesh(new THREE.SphereGeometry(0.022, 16, 12), mk(r.gem, ctx.color), [low.x, low.y - 0.03, low.z + 0.012], [1, 1, 0.55]));
      }
      break;
    }
    case 'pearls': {
      const pts = neckLoop(figure, base, 0.06, 0.012, 40);
      const geo = new THREE.SphereGeometry(0.009, 10, 8);
      for (const p of pts) g.add(mesh(geo, m, [p.x, p.y, p.z]));
      break;
    }
    case 'choker':
    case 'collar': {
      const rad = r.kind === 'collar' ? 0.014 : 0.009;
      g.add(band(ctx.shape, mid, rad, m, 0.006 + rad * 0.6));
      const front = frontZ(figure, 0, mid, 0.02);
      if (r.gem && r.kind === 'choker') g.add(mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 20), mk(r.gem, ctx.color), [0, mid - 0.018, front + 0.004]));
      if (r.gem && r.kind === 'collar') {
        const pts = neckLoop(figure, mid, 0, 0.02, 14);
        const sm = mk(r.gem, ctx.color);
        for (const p of pts) {
          const c = new THREE.Vector3(p.x, p.y, p.z);
          const out = v(p.x, 0, p.z - (section(figure, mid).zFront + section(figure, mid).zBack) / 2).normalize();
          g.add(cone(c, c.clone().addScaledVector(out, 0.03), 0.009, 0.001, sm, 8));
        }
      }
      break;
    }
    case 'scarf': {
      g.add(band(ctx.shape, mid, 0.022, m, 0.025));
      const front = frontZ(figure, 0.03, mid, 0.04);
      g.add(limb(v(0.03, mid - 0.02, front), v(0.06, mid - 0.24, front + 0.02), 0.022, m), limb(v(0.0, mid - 0.02, front), v(-0.01, mid - 0.2, front + 0.03), 0.02, m));
      break;
    }
    case 'boa': {
      const pts = neckLoop(figure, base - 0.01, 0.11, 0.03, 48);
      g.add(tube(pts, 0.032, m));
      break;
    }
    case 'torc': {
      const pts = neckLoop(figure, base + 0.01, 0.03, 0.012, 48).filter((p) => p.z < 0.9 * Math.max(...neckLoop(figure, base + 0.01, 0.03, 0.012, 48).map((q) => q.z)) || Math.abs(p.x) > 0.02);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.009, 8, true), m));
      if (r.gem) {
        const low = lowest(pts);
        g.add(mesh(new THREE.SphereGeometry(0.014, 12, 10), mk(r.gem, ctx.color), [low.x, low.y, low.z + 0.01]));
      }
      break;
    }
  }
  return g;
}

// ─── Спина: плащи, крылья, рюкзак, колчан ───────────────────────────────

type BackKind = 'cape' | 'backpack' | 'quiver' | 'feather_wings' | 'bat_wings' | 'fairy_wings';
interface BackRecipe {
  kind: BackKind;
  m: MS;
  trim?: MS;
  long?: boolean;
}

const BACK: Record<string, BackRecipe> = {
  travel_satchel: { kind: 'backpack', m: { k: 'leather', c: '#7a5230' }, trim: { k: 'leather', c: '#4a2f1f' } },
  red_cape: { kind: 'cape', m: C('#b71c1c') },
  quiver: { kind: 'quiver', m: { k: 'leather', c: '#6b4428' } },
  shadow_cloak: { kind: 'cape', m: { k: 'velvet', c: '#1c1a24' }, long: true },
  fairy_wings: { kind: 'fairy_wings', m: { k: 'glow', c: '#9ef0ff' } },
  bat_wings: { kind: 'bat_wings', m: { k: 'leather', c: '#2b1d2e' } },
  royal_mantle: { kind: 'cape', m: { k: 'velvet', c: '#4a148c' }, trim: { k: 'fur', c: '#f4efe6' }, long: true },
  feather_wings: { kind: 'feather_wings', m: { k: 'feather', c: '#3b3b44' } },
  dragon_wings: { kind: 'bat_wings', m: { k: 'scales', c: '#8a1c1c' }, trim: { k: 'bronze' } },
  angel_wings: { kind: 'feather_wings', m: { k: 'feather', c: '#fbfbff' }, trim: { k: 'glow', c: '#fff3c4' } },
};

/** Точка между лопатками на спине (поверхность с отступом). */
function backPoint(figure: Figure, y: number, off: number): THREE.Vector3 {
  return v(0, y, surfaceZ(figure, 0, y, -1, off));
}

function wing(kind: BackKind, m: Mat, trim: Mat | null, sx: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'feather_wings') {
    // Перья рядами вдоль «руки» крыла: длинные маховые снаружи, кроющие короче.
    const arm = new THREE.CatmullRomCurve3([v(0, 0, 0), v(0.22 * sx, 0.18, -0.12), v(0.5 * sx, 0.3, -0.22), v(0.78 * sx, 0.22, -0.28)]);
    const feather = new THREE.SphereGeometry(1, 10, 6);
    for (let row = 0; row < 3; row += 1) {
      const n = 14 - row * 3;
      for (let i = 0; i < n; i += 1) {
        const t = 0.12 + (0.88 * i) / (n - 1);
        const p = arm.getPoint(t);
        const len = (0.16 + 0.32 * t) * (1 - row * 0.3);
        const f = new THREE.Mesh(feather, m);
        f.scale.set(0.035, len / 2, 0.008);
        f.position.copy(p).add(v(0.02 * sx * row, -len / 2 + 0.02 + row * 0.05, 0.01 * row));
        f.rotation.z = sx * (0.15 + 0.5 * t);
        g.add(f);
      }
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(arm, 24, 0.022, 8), m));
    if (trim) {
      const halo = mesh(new THREE.SphereGeometry(0.02, 8, 6), trim, [0.78 * sx, 0.24, -0.28]);
      g.add(halo);
    }
  } else if (kind === 'bat_wings') {
    // Перепонка между «пальцами» крыла с фестончатым нижним краем.
    const tips = [v(0.85 * sx, 0.35, -0.3), v(0.75 * sx, -0.05, -0.28), v(0.5 * sx, -0.3, -0.2), v(0.22 * sx, -0.32, -0.1)];
    const elbow = v(0.4 * sx, 0.38, -0.2);
    const bone = trim ?? mat('#1a1012', 0.6);
    g.add(limb(v(0, 0, 0), elbow, 0.02, bone));
    for (const t of tips) g.add(limb(elbow, t, 0.012, bone));
    const geo = new THREE.BufferGeometry();
    const P: number[] = [];
    const add = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
      P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    const root = v(0.02 * sx, -0.25, -0.05);
    const ring2 = [v(0, 0, 0), ...tips, root];
    for (let i = 1; i < ring2.length - 1; i += 1) {
      const a = ring2[i]!;
      const b = ring2[i + 1]!;
      const mid = a.clone().lerp(b, 0.5).lerp(elbow, 0.22);
      add(elbow, a, mid);
      add(elbow, mid, b);
    }
    add(elbow, v(0, 0, 0), tips[0]!);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.computeVertexNormals();
    const mm = m.clone();
    mm.side = THREE.DoubleSide;
    g.add(new THREE.Mesh(geo, mm));
  } else {
    // Крылья феи: две пары прозрачных светящихся лепестков.
    const mm = m.clone();
    mm.transparent = true;
    mm.opacity = 0.45;
    mm.side = THREE.DoubleSide;
    mm.depthWrite = false;
    for (const [len, w, ang, y] of [[0.42, 0.2, 0.6, 0.06], [0.3, 0.14, -0.5, -0.04]] as const) {
      const geo = new THREE.CircleGeometry(1, 32);
      geo.scale(len / 2, w / 2, 1);
      geo.translate(len / 2, 0, 0);
      const me = new THREE.Mesh(geo, mm);
      // Крыло отведено назад и вверх; левое — зеркальная копия правого.
      me.rotation.set(0, 0.35 * sx, ang * sx);
      me.position.y = y;
      if (sx < 0) me.scale.x = -1;
      g.add(me);
    }
  }
  return g;
}

export function buildBack(id: string, ctx: ItemCtx): THREE.Group {
  const g = new THREE.Group();
  const r = BACK[id];
  if (!r) return g;
  const { shape, color } = ctx;
  const figure = shape.figure;
  const L = landmarks(figure);
  const m = mk(r.m, color);
  const trim = r.trim ? mk(r.trim, color) : null;
  switch (r.kind) {
    case 'cape': {
      const c = cape(m, shape);
      if (r.long) {
        c.scale.y = 1.25;
        c.position.y -= 0.16;
      }
      g.add(c);
      if (trim) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(figure === 'female' ? 0.22 : 0.25, 0.05, 12, 40), trim);
        collar.position.set(0, L.clavicle[1] + 0.02, (section(figure, L.clavicle[1]).zFront + section(figure, L.clavicle[1]).zBack) / 2);
        collar.rotation.x = Math.PI / 2;
        collar.scale.set(1.1, 0.85, 1);
        g.add(collar);
      }
      break;
    }
    case 'backpack': {
      const y = L.armpit - 0.06;
      const p = backPoint(figure, y, 0.02);
      // Кожаная котомка: мешок с клапаном и скатанное одеяло сверху.
      g.add(mesh(new THREE.SphereGeometry(1, 28, 18), m, [0, y - 0.02, p.z - 0.07], [0.15, 0.2, 0.085]));
      const flap = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), trim ?? m, [0, y + 0.06, p.z - 0.075], [0.155, 0.16, 0.095]);
      g.add(flap, mesh(new THREE.BoxGeometry(0.03, 0.05, 0.01), M.bronze(), [0, y + 0.0, p.z - 0.16]));
      const roll = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 20), M.cloth('#7d6b52', 6), [0, y + 0.2, p.z - 0.07]);
      roll.rotation.z = Math.PI / 2;
      g.add(roll);
      for (const x of [-0.1, 0.1]) {
        const tie = mesh(new THREE.TorusGeometry(0.054, 0.007, 6, 24), trim ?? m, [x, y + 0.2, p.z - 0.07]);
        tie.rotation.y = Math.PI / 2;
        g.add(tie);
      }
      const straps = trim ?? m;
      for (const sx of [-1, 1]) {
        const x = 0.09 * sx;
        const top = v(x, L.clavicle[1] + 0.02, (section(figure, L.clavicle[1]).zFront + section(figure, L.clavicle[1]).zBack) / 2);
        const pts = [v(x, y + 0.15, p.z - 0.01), top, v(x * 1.3, L.armpit - 0.02, surfaceZ(figure, x * 1.3, L.armpit - 0.02, 1, 0.02)), v(x * 1.6, y - 0.1, surfaceZ(figure, x * 1.6, y - 0.1, 1, 0.02) - 0.03)];
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.012, 6), straps));
      }
      break;
    }
    case 'quiver': {
      const y = L.armpit - 0.1;
      const p = backPoint(figure, y, 0.05);
      const a = v(-0.12, y - 0.22, p.z - 0.02);
      const b = v(0.12, y + 0.2, p.z - 0.04);
      g.add(cone(a, b, 0.055, 0.065, m, 18));
      const dir = b.clone().sub(a).normalize();
      for (let i = 0; i < 5; i += 1) {
        const o = v((i - 2) * 0.018, 0, (i % 2) * 0.015);
        const s0 = b.clone().add(o);
        const s1 = s0.clone().addScaledVector(dir, 0.16);
        g.add(limb(s0, s1, 0.004, M.wood('#8a5a30')));
        const fl = mesh(new THREE.ConeGeometry(0.014, 0.05, 4), mat(i % 2 ? '#e53935' : '#f4f4f4', 0.8), [s1.x, s1.y, s1.z]);
        fl.quaternion.setFromUnitVectors(v(0, 1, 0), dir);
        g.add(fl);
      }
      // Ремень через грудь.
      const sTop = v(0.11, L.clavicle[1] + 0.02, (section(figure, L.clavicle[1]).zFront + section(figure, L.clavicle[1]).zBack) / 2);
      const pts = [b, sTop, v(-0.02, L.armpit - 0.05, surfaceZ(figure, -0.02, L.armpit - 0.05, 1, 0.025)), v(-0.15, y - 0.16, surfaceZ(figure, -0.15, y - 0.16, 1, 0.025)), a];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.01, 6), M.leather('#4a2f1f')));
      break;
    }
    default: {
      const y = L.armpit - 0.02;
      const root = backPoint(figure, y, 0.015);
      for (const sx of [-1, 1]) {
        const w = wing(r.kind, m, trim, sx);
        w.position.set(0.05 * sx, root.y, root.z);
        g.add(w);
      }
      break;
    }
  }
  return g;
}

// ─── Голова: новые головные уборы ───────────────────────────────────────

const HS = HEAD_SCALE;

/** Что новые уборы делают с причёской. */
const COVER_EXTRA: Record<string, 'hat' | 'helm'> = { bandana: 'hat', beret: 'hat', pilgrim_hat: 'hat', kettle_hat: 'hat', jester_cap: 'hat', hennin: 'hat' };

export const headCover = (id: string | undefined): 'none' | 'hat' | 'helm' => (id ? HEAD_COVER[id] ?? COVER_EXTRA[id] ?? 'none' : 'none');

function buildHeadExtra(id: string, ctx: ItemCtx): THREE.Group | null {
  const g = new THREE.Group();
  const { color, shape } = ctx;
  const female = shape.figure === 'female';
  switch (id) {
    case 'bandana': {
      const m = M.cloth(color, 8);
      g.add(dome(HEAD_R + 0.03, Math.PI * 0.4, m, 0.02));
      g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), m, [0, HEAD_Y + 0.02, -0.29]));
      g.add(limb(v(0.01, HEAD_Y + 0.0, -0.3), v(0.06, HEAD_Y - 0.14, -0.31), 0.022, m), limb(v(-0.01, HEAD_Y + 0.0, -0.3), v(-0.05, HEAD_Y - 0.12, -0.3), 0.02, m));
      return g;
    }
    case 'beret': {
      const m = phys(color, 0.9, { sheen: 0.5, sheenColor: shade(color, 1.4) });
      const b = mesh(new THREE.SphereGeometry(HEAD_R + 0.05, 32, 16), m, [0.05, HEAD_Y + 0.18, -0.02], [HS.x * 1.15, 0.38, HS.z * 1.1]);
      b.rotation.z = -0.25;
      g.add(b, ring(headR(0.12) + 0.025, 0.018, m, HEAD_Y + 0.12, HS.x, HS.z), mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6), m, [0.06, HEAD_Y + 0.3, -0.02]));
      return g;
    }
    case 'jester_cap': {
      // Колпак шута: два цвета, три рога с бубенцами.
      const a = M.cloth(color, 6);
      const b = M.cloth(shade(color, 0.45), 6);
      g.add(dome(HEAD_R + 0.035, Math.PI * 0.42, a, 0.02));
      g.add(headBand(0.07, 0.05, 0.03, b));
      const tips: Array<[THREE.Vector3[], Mat]> = [
        [[v(0.08, HEAD_Y + 0.22, 0), v(0.2, HEAD_Y + 0.32, 0.0), v(0.3, HEAD_Y + 0.22, 0.02), v(0.33, HEAD_Y + 0.08, 0.03)], b],
        [[v(-0.08, HEAD_Y + 0.22, 0), v(-0.2, HEAD_Y + 0.32, 0.0), v(-0.3, HEAD_Y + 0.22, 0.02), v(-0.33, HEAD_Y + 0.08, 0.03)], a],
        [[v(0, HEAD_Y + 0.26, -0.06), v(0, HEAD_Y + 0.38, -0.16), v(0, HEAD_Y + 0.3, -0.3), v(0, HEAD_Y + 0.14, -0.34)], b],
      ];
      for (const [pts, m] of tips) {
        g.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), 0.075, 0.012, 24, 12), m));
        const e = pts[pts.length - 1]!;
        g.add(mesh(new THREE.SphereGeometry(0.026, 14, 10), M.gold(), [e.x, e.y - 0.02, e.z]));
      }
      return g;
    }
    case 'hennin': {
      // Эннен: высокий конус на затылке, с вуалью от вершины.
      const m = phys(color, 0.4, { sheen: 0.7, sheenColor: shade(color, 1.5) });
      const base = v(0, HEAD_Y + 0.14, -0.06);
      const tip = v(0, HEAD_Y + 0.62, -0.42);
      g.add(cone(base, tip, 0.17, 0.012, m, 32));
      g.add(headBand(0.1, 0.05, 0.022, M.gold()));
      // Полупрозрачная вуаль спадает с вершины на спину.
      const veil = mat('#fbf7f0', 0.5, 0, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      const end = v(0, HEAD_Y - 0.42, -0.36);
      const len = tip.distanceTo(end);
      const vm = mesh(new THREE.CylinderGeometry(0.012, 0.22, len, 28, 1, true, Math.PI * 0.5, Math.PI), veil, [(tip.x + end.x) / 2, (tip.y + end.y) / 2, (tip.z + end.z) / 2], [1, 1, 0.6]);
      vm.quaternion.setFromUnitVectors(v(0, 1, 0), tip.clone().sub(end).normalize());
      g.add(vm);
      return g;
    }
    case 'devil_horns': {
      const m = phys('#9c0d0d', 0.3, { clearcoat: 0.8 });
      for (const sx of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([v(0.09 * sx, HEAD_Y + 0.24, 0.06), v(0.14 * sx, HEAD_Y + 0.33, 0.05), v(0.13 * sx, HEAD_Y + 0.42, -0.01), v(0.08 * sx, HEAD_Y + 0.45, -0.05)]);
        const tube = new THREE.TubeGeometry(c, 20, 1, 10);
        const p = tube.getAttribute('position');
        // Рог сужается к острию.
        for (let i = 0; i < p.count; i += 1) {
          const seg = Math.floor(i / 11) / 20;
          const center = c.getPointAt(Math.min(1, seg));
          const k = 0.035 * (1 - seg) + 0.002;
          p.setXYZ(i, center.x + (p.getX(i) - center.x) * k, center.y + (p.getY(i) - center.y) * k, center.z + (p.getZ(i) - center.z) * k);
        }
        tube.computeVertexNormals();
        g.add(new THREE.Mesh(tube, m));
      }
      return g;
    }
    case 'angel_halo': {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 10, 48), M.glow('#ffe27a', 2));
      h.position.set(0, HEAD_Y + 0.42, -0.04);
      h.rotation.x = Math.PI / 2 - 0.5;
      g.add(h);
      return g;
    }
    case 'plague_mask': {
      // Маска чумного доктора: кожаная полумаска по лицу, латунные очки и длинный клюв.
      const eye = eyeAnchor(female);
      const lm = M.leather('#2a211c', 2);
      const NXg = 26;
      const NYg = 10;
      const P: number[] = [];
      const idx: number[] = [];
      const hole = (x: number, y: number): boolean => ((Math.abs(x) - eye.c.x) / 0.028) ** 2 + ((y - eye.c.y) / 0.024) ** 2 < 1;
      for (let j = 0; j <= NYg; j += 1) {
        for (let i = 0; i <= NXg; i += 1) {
          const x = -0.14 + (0.28 * i) / NXg;
          const yTop = eye.c.y + 0.07;
          const yBot = eye.c.y - 0.07;
          const pnt = faceAt(x, yBot + ((yTop - yBot) * j) / NYg, 0.01, female);
          P.push(pnt.x, pnt.y, pnt.z);
        }
      }
      for (let j = 0; j < NYg; j += 1) {
        for (let i = 0; i < NXg; i += 1) {
          const a = j * (NXg + 1) + i;
          const cx = (P[a * 3]! + P[(a + 1) * 3]!) / 2;
          const cy = (P[a * 3 + 1]! + P[(a + NXg + 1) * 3 + 1]!) / 2 - HEAD_Y;
          if (hole(cx, cy)) continue;
          idx.push(a, a + NXg + 1, a + 1, a + 1, a + NXg + 1, a + NXg + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const fm = M.leather('#2a211c', 2);
      fm.side = THREE.DoubleSide;
      g.add(new THREE.Mesh(geo, fm));
      for (const sx of [-1, 1]) {
        const c = faceAt(eye.c.x * sx, eye.c.y, 0.02, female);
        const lens = mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 24), M.bronze(), [c.x, c.y, c.z]);
        g.add(lens, mesh(new THREE.CircleGeometry(0.03, 24), mat('#3a1a12', 0.05, 0.3, { transparent: true, opacity: 0.75 }), [c.x, c.y, c.z - 0.002]));
      }
      const nose = faceAt(0, eye.c.y - 0.05, 0.015, female);
      const beak = new THREE.CatmullRomCurve3([nose.clone().add(v(0, 0.01, -0.02)), nose.clone().add(v(0, -0.03, 0.09)), nose.clone().add(v(0, -0.1, 0.2)), nose.clone().add(v(0, -0.17, 0.27))]);
      g.add(new THREE.Mesh(taperTube(beak, 0.055, 0.006, 24, 14), lm));
      g.add(headBand(0.15, 0.03, 0.012, M.leather('#5a3820', 3)));
      return g;
    }
    case 'masquerade_mask': {
      // Маска по форме лица: сетка точек на лице вокруг глаз с вырезами под глаза.
      const eye = eyeAnchor(female);
      const NXg = 26;
      const NYg = 9;
      const P: number[] = [];
      const idx: number[] = [];
      const hole = (x: number, y: number): boolean => ((Math.abs(x) - eye.c.x) / 0.03) ** 2 + ((y - eye.c.y) / 0.02) ** 2 < 1;
      for (let j = 0; j <= NYg; j += 1) {
        for (let i = 0; i <= NXg; i += 1) {
          const x = -0.125 + (0.25 * i) / NXg;
          const yTop = eye.c.y + 0.05 - 0.02 * (Math.abs(x) / 0.125) ** 2 + 0.015 * Math.max(0, Math.abs(x) - 0.08) / 0.045;
          const yBot = eye.c.y - 0.04 + 0.025 * (1 - Math.abs(x) / 0.125);
          const y = yBot + ((yTop - yBot) * j) / NYg;
          const p = faceAt(x, y, 0.008, female);
          P.push(p.x, p.y, p.z);
        }
      }
      for (let j = 0; j < NYg; j += 1) {
        for (let i = 0; i < NXg; i += 1) {
          const a = j * (NXg + 1) + i;
          const cx = (P[a * 3]! + P[(a + 1) * 3]!) / 2;
          const cy = (P[a * 3 + 1]! + P[(a + NXg + 1) * 3 + 1]!) / 2 - HEAD_Y;
          if (hole(cx, cy)) continue;
          idx.push(a, a + NXg + 1, a + 1, a + 1, a + NXg + 1, a + NXg + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mm = phys(color, 0.25, { clearcoat: 0.7, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(geo, mm));
      const s1 = star(0.03, 0.013, 0.006, M.gold());
      s1.position.set(0.11, HEAD_Y + eye.c.y + 0.05, 0.17);
      g.add(s1);
      return g;
    }
    case 'lace_veil': {
      const m = mk({ k: 'lace', c: '#f6f2ee' }, color);
      const prof = [
        [0.0, 0.33],
        [0.2, 0.28],
        [0.29, 0.1],
        [0.33, -0.15],
        [0.37, -0.4],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const veil = mesh(new THREE.LatheGeometry(prof, 40, Math.PI * 0.6, Math.PI * 0.8), m, [0, HEAD_Y, -0.03], [HS.x * 1.25, 1, HS.z * 1.15]);
      g.add(veil, ring(headR(0.2) + 0.015, 0.012, M.silver(), HEAD_Y + 0.2, HS.x, HS.z));
      return g;
    }
    case 'pilgrim_hat': {
      // Шляпа пилигрима: широкие ровные поля, низкая тулья, раковина на ленте.
      const m = M.cloth('#4a3a2c', 6, 0.95);
      m.side = THREE.DoubleSide;
      const brim = [
        [0.16, 0.0],
        [0.32, -0.01],
        [0.46, -0.03],
        [0.5, -0.045],
        [0.49, -0.055],
        [0.44, -0.04],
        [0.3, -0.018],
        [0.16, 0.012],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(mesh(new THREE.LatheGeometry(brim, 56), m, [0, HEAD_Y + 0.14, -0.01], [1, 1, 0.9]));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.235, 0.14, 32), m, [0, HEAD_Y + 0.21, -0.01], [1, 1, 0.85]));
      g.add(mesh(new THREE.SphereGeometry(0.2, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, [0, HEAD_Y + 0.28, -0.01], [1, 0.35, 0.85]));
      g.add(ring(0.228, 0.016, M.leather('#2a1f1a'), HEAD_Y + 0.165, 1, 0.86));
      const shell = mesh(new THREE.SphereGeometry(0.04, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#efe4cf', 0.6), [0, HEAD_Y + 0.2, 0.205], [1, 1, 0.35]);
      shell.rotation.x = Math.PI / 2;
      g.add(shell);
      return g;
    }
    case 'kettle_hat': {
      // Шапель: стальной купол с широкими полями, опущенными вниз.
      const st = M.steel();
      st.side = THREE.DoubleSide;
      g.add(dome(HEAD_R + 0.05, Math.PI * 0.5, st, 0.02));
      const brim = [
        [0.24, 0.0],
        [0.33, -0.04],
        [0.4, -0.09],
        [0.41, -0.1],
        [0.33, -0.05],
        [0.24, -0.01],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(mesh(new THREE.LatheGeometry(brim, 56), st, [0, HEAD_Y + 0.07, -0.01], [HS.x, 1, HS.z]));
      g.add(ring(headR(0.07) + 0.055, 0.014, M.darkSteel(), HEAD_Y + 0.07, HS.x, HS.z));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.06, 0.32), M.darkSteel(), [0, HEAD_Y + 0.33, -0.02]));
      for (let i = -4; i <= 4; i += 1) g.add(onHead(mesh(new THREE.SphereGeometry(0.011, 8, 6), M.darkSteel()), 0.09, i * 0.36, 0.06));
      return g;
    }
    case 'gold_circlet': {
      g.add(ring(headR(0.13) + 0.012, 0.008, M.gold(), HEAD_Y + 0.13, HS.x, HS.z));
      const p = v(0, HEAD_Y + 0.14, headR(0.13) * HS.z + 0.02);
      g.add(mesh(new THREE.OctahedronGeometry(0.022), M.gem('#e53935', 0.6), [p.x, p.y, p.z], [0.8, 1.2, 0.6]));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.01, 10, 8), M.gem('#4da3ff', 0.5), [0.08 * sx, HEAD_Y + 0.14, headR(0.13) * HS.z * 0.93]));
      return g;
    }
    default:
      return null;
  }
}

export function headModel(id: string, ctx: ItemCtx): THREE.Group {
  return buildHeadExtra(id, ctx) ?? buildHeadItem(id, ctx);
}

// ─── Оружие и вторая рука ───────────────────────────────────────────────

/** Наклон новых видов оружия в кулаке (как у копья и скакалки). */
export const WEAPON_TILT_EXTRA: Record<string, number> = { trident: 1.15, reaper_scythe: 1.1, leather_whip: -1.2 };

function blade(len: number, w: number, curve: number, m: Mat): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.quadraticCurveTo(-w / 2 + curve * 0.5, len * 0.6, curve, len);
  s.quadraticCurveTo(w / 2 + curve * 0.5, len * 0.5, w / 2, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1 });
  geo.translate(0, 0, -0.002);
  return new THREE.Mesh(geo, m);
}

function buildWeaponExtra(id: string, ctx: ItemCtx): THREE.Group | null {
  const g = new THREE.Group();
  switch (id) {
    case 'dagger': {
      g.add(grip(0.1, 0.022));
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 0.03), M.bronze(), [0, 0.06, 0]));
      g.add(mesh(blade(0.28, 0.05, 0, M.steel()).geometry, M.steel(), [0, 0.07, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.024, 12, 10), M.bronze(), [0, -0.065, 0]));
      return g;
    }
    case 'leather_whip': {
      g.add(grip(0.2, 0.02));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i += 1) {
        const t = i / 60;
        const a = t * Math.PI * 5;
        const r = 0.09 * (1 - t * 0.4);
        // Свёрнутый кнут — кольца в плоскости рукояти, висят под кулаком.
        pts.push(v(Math.cos(a) * r, 0.2 + Math.sin(a) * r, 0.006 * Math.sin(a * 3) + t * 0.025));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.009, 6), M.leather('#3b2a1e', 2)));
      return g;
    }
    case 'longsword': {
      // Полуторный меч: длинная рукоять, прямая крестовина, обоюдоострый клинок с долом.
      g.add(limb(v(0, -0.14, 0), v(0, 0.12, 0), 0.021, M.leather('#3d2a1c', 1)));
      for (let i = 0; i < 6; i += 1) g.add(ring(0.023, 0.003, M.leather('#2a1d14', 1), -0.12 + i * 0.045));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.032, 0.04), M.darkSteel(), [0, 0.14, 0]));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.024, 12, 10), M.darkSteel(), [0.15 * sx, 0.14, 0]));
      const s2 = new THREE.Shape();
      s2.moveTo(-0.032, 0);
      s2.lineTo(0.032, 0);
      s2.lineTo(0.026, 0.86);
      s2.lineTo(0, 0.98);
      s2.lineTo(-0.026, 0.86);
      s2.closePath();
      const geo = new THREE.ExtrudeGeometry(s2, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 });
      geo.translate(0, 0, -0.002);
      g.add(mesh(geo, M.steel(), [0, 0.155, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.6, 0.026), M.metal('#8c949e', 0.3), [0, 0.5, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.036, 16, 12), M.darkSteel(), [0, -0.16, 0], [1, 0.8, 1]));
      return g;
    }
    case 'war_hammer': {
      g.add(limb(v(0, -0.15, 0), v(0, 0.55, 0), 0.022, M.wood('#5a3a22', 1, 3)));
      g.add(mesh(new THREE.BoxGeometry(0.26, 0.12, 0.12), M.iron(), [0, 0.6, 0]));
      g.add(cone(v(0.13, 0.6, 0), v(0.24, 0.6, 0), 0.05, 0.004, M.steel(), 4));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), M.steel(), [-0.15, 0.6, 0]));
      return g;
    }
    case 'trident': {
      const gold = M.gold();
      g.add(limb(v(0, -0.6, 0), v(0, 0.75, 0), 0.016, M.wood('#5a3a22', 1, 4)));
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.025, 0.025), gold, [0, 0.78, 0]));
      for (const x of [-0.09, 0, 0.09]) {
        g.add(limb(v(x, 0.78, 0), v(x, x === 0 ? 1.0 : 0.95, 0), 0.01, gold));
        g.add(cone(v(x, x === 0 ? 1.0 : 0.95, 0), v(x, x === 0 ? 1.08 : 1.02, 0), 0.02, 0.001, gold, 4));
      }
      return g;
    }
    case 'reaper_scythe': {
      g.add(limb(v(0, -0.6, 0), v(0, 0.8, 0), 0.018, M.wood('#2a1f1a', 1, 4)));
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(-0.25, 0.12, -0.6, -0.08);
      s.quadraticCurveTo(-0.3, 0.02, 0, -0.08);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1 });
      g.add(mesh(geo, M.darkSteel(), [0, 0.8, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), M.glow('#7c4dff', 1.2), [0, 0.82, 0]));
      return g;
    }
    default:
      return null;
  }
}

export const weaponModel = (id: string, ctx: ItemCtx): THREE.Group => buildWeaponExtra(id, ctx) ?? buildWeapon(id, ctx);

function buildOffhandExtra(id: string, ctx: ItemCtx): THREE.Group | null {
  const g = new THREE.Group();
  const { anim } = ctx;
  switch (id) {
    case 'buckler': {
      const d = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 40), M.steel(), [0.03, 0.06, 0.1]);
      d.rotation.x = Math.PI / 2;
      g.add(d, mesh(new THREE.SphereGeometry(0.05, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.bronze(), [0.03, 0.06, 0.115]).rotateX(Math.PI / 2));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 40), M.bronze());
      rim.position.set(0.03, 0.06, 0.1);
      g.add(rim);
      return g;
    }
    case 'lute': {
      // Лютня держится за грифом: корпус-«груша» снизу, колковая коробка отогнута назад.
      const wood = M.wood('#8a5a30', 1, 2);
      const top = mat('#d9b27c', 0.6);
      top.side = THREE.DoubleSide;
      const bowl = mesh(new THREE.SphereGeometry(0.15, 32, 16, Math.PI, Math.PI), wood, [0, -0.3, 0.06], [1, 1.35, 0.7]);
      g.add(bowl);
      g.add(mesh(new THREE.CircleGeometry(0.15, 40), top, [0, -0.3, 0.06], [1, 1.35, 1]));
      g.add(mesh(new THREE.RingGeometry(0.025, 0.04, 24), mat('#3b2416', 0.7), [0, -0.24, 0.062]));
      g.add(mesh(new THREE.CircleGeometry(0.025, 24), mat('#1a0f08', 0.9), [0, -0.24, 0.061]));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), M.wood('#3b2416'), [0, -0.4, 0.068]));
      g.add(mesh(new THREE.BoxGeometry(0.045, 0.32, 0.03), M.wood('#5a3a22', 1, 2), [0, -0.0, 0.055]));
      const box = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.025), M.wood('#5a3a22'), [0, 0.2, 0.02]);
      box.rotation.x = -0.9;
      g.add(box);
      for (let i = 0; i < 4; i += 1) g.add(limb(v(-0.012 + i * 0.008, -0.4, 0.07), v(-0.012 + i * 0.008, 0.155, 0.072), 0.0012, mat('#e8e2d0', 0.5), 4));
      return g;
    }
    case 'lantern': {
      const iron = M.iron();
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 20, Math.PI), iron, [0, 0.0, 0.05]));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.03, 6), iron, [0, -0.06, 0.05]));
      g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 6, 1, true), mat('#ffe9b0', 0.1, 0, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }), [0, -0.16, 0.05]));
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.03, 6), iron, [0, -0.255, 0.05]));
      const flame = mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffcc55', toneMapped: false }), [0, -0.16, 0.05], [1, 1.6, 1]);
      g.add(flame);
      anim.push((t) => flame.scale.set(1 + Math.sin(t * 9) * 0.1, 1.6 + Math.sin(t * 13) * 0.2, 1));
      return g;
    }
    case 'love_potion': {
      const glass = mat('#ffd6e8', 0.05, 0, { transparent: true, opacity: 0.4 });
      const prof = [
        [0, -0.1],
        [0.08, -0.09],
        [0.1, -0.03],
        [0.08, 0.04],
        [0.03, 0.07],
        [0.028, 0.13],
        [0.035, 0.14],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(mesh(new THREE.LatheGeometry(prof, 32), glass, [0, -0.08, 0.06]));
      g.add(mesh(new THREE.SphereGeometry(0.085, 24, 16, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), M.glow('#ff2d7a', 0.9), [0, -0.12, 0.06]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.04, 12), M.wood('#a07040'), [0, 0.08, 0.06]));
      return g;
    }
    default:
      return null;
  }
}

export const offhandModel = (id: string, ctx: ItemCtx): THREE.Group => buildOffhandExtra(id, ctx) ?? buildOffhand(id, ctx);

// ─── Сборка одежды из всех слотов ───────────────────────────────────────

/** Одежда героя: верх (слот «верх»), низ (слот «низ» или одежда верха), их слои и детали. */
export function composeOutfit(equipped: Partial<Record<Slot, string>>, ctx: ItemCtx): Outfit {
  const body = equipped.body ? buildWear(equipped.body, ctx) : null;
  const legs = equipped.legs ? buildWear(equipped.legs, ctx) : null;
  const group = new THREE.Group();
  if (body) group.add(body.group);
  if (legs) group.add(legs.group);
  const bodyLayers = body?.plan.layers ?? [];
  const legsLayers = legs?.plan.layers ?? [];
  const pad = (o: Outfit | null, n: number): Mat[] => Array.from({ length: n }, (_, i) => o?.layers[i] ?? o?.layers[0] ?? M.cloth('#8a8f98', 8));
  const plan: OutfitPlan = { layers: [...bodyLayers, ...legsLayers] };
  if (body && body.plan.top !== undefined) plan.top = body.plan.top;
  const bottom = legs ? legs.plan.bottom : body?.plan.bottom;
  if (bottom) plan.bottom = bottom;
  const out: Outfit = { group, plan, layers: [...pad(body, bodyLayers.length), ...pad(legs, legsLayers.length)] };
  if (body?.top) out.top = body.top;
  const bm = legs ? legs.bottom : body?.bottom;
  if (bm) out.bottom = bm;
  return out;
}

/** Все слои одежды, которые понадобятся герою (для заблаговременной подготовки сеток). */
export function garmentsFor(figure: Figure, equipped: Partial<Record<Slot, string>>): GarmentId[] {
  const body = wearPlan(equipped.body, figure);
  const legs = wearPlan(equipped.legs, figure);
  const def = figure === 'female' ? { top: 'tee_fitted' as const, bottom: 'leggings' as const } : { top: 'tee' as const, bottom: 'pants' as const };
  const top = body.top === undefined ? def.top : body.top;
  const list: GarmentId[] = [];
  if (top) list.push(top);
  list.push((equipped.legs ? legs.bottom : body.bottom) ?? def.bottom);
  list.push(...(body.layers ?? []), ...(legs.layers ?? []));
  if (equipped.head) list.push(...(HEAD_GARMENTS[equipped.head] ?? []));
  list.push(...SHOE_LAYERS[shoeRecipe(equipped).shoe]);
  return [...new Set(list)];
}

/** Слои одежды самого предмета (для иконки магазина). */
export function itemGarments(id: string, slot: Slot, figure: Figure): GarmentId[] {
  if (slot === 'feet') return SHOE_LAYERS[(SHOES[id] ?? { shoe: 'none' }).shoe];
  if (slot === 'head') return HEAD_GARMENTS[id] ?? [];
  if (slot !== 'body' && slot !== 'legs') return [];
  const plan = wearPlan(id, figure);
  return [plan.top, plan.bottom, ...(plan.layers ?? [])].filter((g): g is GarmentId => Boolean(g));
}

/**
 * Фигура для иконки предмета: женский топ без мужского варианта (у мужской фигуры торс открыт)
 * показываем на женской фигуре, чтобы иконка не была пустой.
 */
export function iconFigure(id: string, slot: Slot, figure: Figure): Figure {
  if (figure === 'male' && slot === 'body' && WEAR[id] && itemGarments(id, slot, 'male').length === 0 && !(WEAR[id].deco ?? []).length) return 'female';
  return figure;
}

/** Есть ли у предмета свой рецепт (новые предметы). */
export const isNewItem = (id: string): boolean => isWear(id) || id in SHOES || id in HANDS || id in NECK || id in BACK;
