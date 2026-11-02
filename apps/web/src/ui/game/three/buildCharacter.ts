import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance } from '../../../game/state';
import { HAIR_COLORS, SKIN_TONES } from '../palette';

/**
 * Процедурная 3D-модель персонажа из примитивов (без внешних файлов моделей):
 * стилизованный человек в полный рост, внешность из настроек и надетые предметы.
 * Персонаж смотрит на +Z, ноги на y = 0, рост ≈ 2,2.
 */

export interface CharacterParts {
  root: THREE.Group;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
}

type Mat = THREE.MeshStandardMaterial;

const HEAD_Y = 1.9;
const HEAD_R = 0.27;
const HEAD_SCALE = new THREE.Vector3(0.93, 1.05, 0.98);

function mat(color: THREE.ColorRepresentation, roughness = 0.75, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): Mat {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, pos?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  if (pos) me.position.set(...pos);
  if (scale) me.scale.set(...scale);
  return me;
}

/** Капсула от точки a до точки b (руки, ноги, рукоятки). */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: Mat): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const me = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14), m);
  me.position.copy(a).addScaledVector(dir, 0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return me;
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Профиль корпуса для LatheGeometry (радиус, высота от талии). */
const TORSO_PROFILE = [
  [0.0, -0.02],
  [0.26, 0],
  [0.28, 0.12],
  [0.3, 0.28],
  [0.34, 0.44],
  [0.35, 0.52],
  [0.3, 0.58],
  [0.16, 0.63],
  [0.0, 0.64],
].map(([r, y]) => new THREE.Vector2(r, y));

const TORSO_Y = 0.98;
const TORSO_DEPTH = 0.68;

function torsoShell(m: Mat, grow = 1, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const geo = new THREE.LatheGeometry(TORSO_PROFILE, 32, phiStart, phiLength);
  const me = new THREE.Mesh(geo, m);
  me.position.y = TORSO_Y - 0.01 * grow;
  me.scale.set(grow, 1 + (grow - 1) * 0.5, TORSO_DEPTH * grow);
  return me;
}

// ─── Волосы ────────────────────────────────────────────────────────────

function hairCap(r: number, thetaLength: number, m: Mat): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, thetaLength), m);
  me.position.set(0, HEAD_Y + 0.01, -0.01);
  me.scale.copy(HEAD_SCALE);
  return me;
}

/** Затылок: задняя полусфера ниже макушки. */
function hairBack(r: number, m: Mat): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, Math.PI, Math.PI, Math.PI * 0.2, Math.PI * 0.5), m);
  me.position.set(0, HEAD_Y, -0.01);
  me.scale.copy(HEAD_SCALE);
  return me;
}

function buildHair(style: Appearance['hair'], m: Mat, covered: boolean): THREE.Group {
  const g = new THREE.Group();
  switch (style) {
    case 'buzz':
      g.add(hairCap(HEAD_R + 0.008, Math.PI * 0.36, m), hairBack(HEAD_R + 0.006, m));
      break;
    case 'short':
      g.add(hairCap(HEAD_R + 0.022, Math.PI * 0.4, m), hairBack(HEAD_R + 0.02, m));
      g.add(mesh(new THREE.SphereGeometry(0.12, 16, 10), m, [0.04, HEAD_Y + 0.17, 0.17], [1.25, 0.45, 0.6]));
      break;
    case 'long':
      g.add(hairCap(HEAD_R + 0.026, Math.PI * 0.42, m), hairBack(HEAD_R + 0.024, m));
      g.add(mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14), m, [0, HEAD_Y - 0.25, -0.12], [1.35, 1, 0.55]));
      g.add(limb(v(-0.22, HEAD_Y + 0.08, 0.06), v(-0.25, HEAD_Y - 0.32, 0.02), 0.06, m));
      g.add(limb(v(0.22, HEAD_Y + 0.08, 0.06), v(0.25, HEAD_Y - 0.32, 0.02), 0.06, m));
      break;
    case 'bun':
      g.add(hairCap(HEAD_R + 0.012, Math.PI * 0.38, m), hairBack(HEAD_R + 0.01, m));
      if (!covered) g.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), m, [0, HEAD_Y + 0.25, -0.13]));
      break;
    case 'curly': {
      g.add(hairCap(HEAD_R + 0.01, Math.PI * 0.38, m), hairBack(HEAD_R + 0.008, m));
      const n = 46;
      const ball = new THREE.SphereGeometry(0.075, 10, 8);
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
        if (covered && y > 0.12) continue;
        const k = covered ? 0.27 : 0.29;
        g.add(mesh(ball, m, [x * k * HEAD_SCALE.x, HEAD_Y + y * 0.3 * HEAD_SCALE.y, z * k * HEAD_SCALE.z - 0.01]));
      }
      break;
    }
  }
  return g;
}

// ─── Лицо ──────────────────────────────────────────────────────────────

function buildFace(skinShade: string, hair: string, beard: boolean): THREE.Group {
  const g = new THREE.Group();
  const white = mat('#fbfaf8', 0.4);
  const iris = mat('#4a3426', 0.4);
  const pupil = mat('#100b08', 0.3);
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const sx of [-1, 1]) {
    const x = 0.088 * sx;
    g.add(mesh(new THREE.SphereGeometry(0.052, 16, 12), white, [x, HEAD_Y + 0.02, 0.212], [1.15, 0.9, 0.55]));
    g.add(mesh(new THREE.SphereGeometry(0.032, 14, 10), iris, [x, HEAD_Y + 0.016, 0.234], [1, 1, 0.5]));
    g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), pupil, [x, HEAD_Y + 0.016, 0.248], [1, 1, 0.4]));
    g.add(mesh(new THREE.SphereGeometry(0.007, 6, 6), shine, [x + 0.012, HEAD_Y + 0.03, 0.254]));
    const brow = mesh(new THREE.CapsuleGeometry(0.011, 0.065, 4, 8), mat(hair, 0.9), [x, HEAD_Y + 0.095, 0.235]);
    brow.rotation.z = Math.PI / 2 + 0.12 * sx;
    g.add(brow);
    g.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), mat(skinShade, 0.8), [0.255 * sx, HEAD_Y, -0.01], [0.45, 1, 0.75]));
  }
  g.add(mesh(new THREE.SphereGeometry(0.032, 12, 10), mat(skinShade, 0.7), [0, HEAD_Y - 0.035, 0.255], [0.85, 1, 1.1]));
  const mouth = mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 16, Math.PI * 0.8), mat('#9c5547', 0.6), [0, HEAD_Y - 0.085, 0.228]);
  mouth.rotation.z = Math.PI + Math.PI * 0.1;
  g.add(mouth);
  if (beard) {
    const bm = mat(hair, 0.95);
    const b = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.016, 28, 12, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.62, Math.PI * 0.25), bm);
    b.position.set(0, HEAD_Y, -0.005);
    b.scale.copy(HEAD_SCALE);
    g.add(b);
    const stache = mesh(new THREE.CapsuleGeometry(0.018, 0.07, 4, 8), bm, [0, HEAD_Y - 0.062, 0.245]);
    stache.rotation.z = Math.PI / 2;
    g.add(stache);
  }
  return g;
}

// ─── Предметы ──────────────────────────────────────────────────────────

const MATS = {
  steel: () => mat('#c3cad2', 0.32, 0.85),
  gold: () => mat('#e7b442', 0.3, 0.9),
  bronze: () => mat('#c88b4a', 0.35, 0.8),
  wood: () => mat('#8a5a30', 0.85),
  leather: () => mat('#7a4e2d', 0.85),
  iron: () => mat('#3a4047', 0.5, 0.6),
};

function buildHeadItem(id: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const atHead = (o: THREE.Object3D): THREE.Object3D => {
    o.position.y += HEAD_Y;
    return o;
  };
  switch (id) {
    case 'headband': {
      const t = mesh(new THREE.TorusGeometry(HEAD_R + 0.012, 0.026, 8, 40), mat(color, 0.6), [0, 0.07, 0], [HEAD_SCALE.x, 1, HEAD_SCALE.z]);
      t.rotation.x = Math.PI / 2;
      g.add(atHead(t));
      g.add(atHead(limb(v(0.12, 0.07, -0.24), v(0.2, -0.08, -0.3), 0.02, mat(color, 0.6))));
      break;
    }
    case 'leather_cap': {
      g.add(atHead(mesh(new THREE.SphereGeometry(HEAD_R + 0.04, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), MATS.leather(), [0, 0.02, -0.01], [HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z])));
      const brim = mesh(new THREE.TorusGeometry(HEAD_R + 0.02, 0.03, 8, 40), mat('#5a3820', 0.9), [0, 0.085, 0], [HEAD_SCALE.x, 1, HEAD_SCALE.z]);
      brim.rotation.x = Math.PI / 2;
      g.add(atHead(brim));
      break;
    }
    case 'ranger_hood': {
      const m = mat('#44704a', 0.9, 0, { side: THREE.DoubleSide });
      const open = 1.05;
      g.add(atHead(mesh(new THREE.SphereGeometry(HEAD_R + 0.07, 32, 18, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * 0.8), m, [0, 0.02, -0.02], [HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z])));
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.46, 0.3, 32, 1, true), m, [0, 1.56, 0]));
      break;
    }
    case 'wizard_hat': {
      const m = mat('#4b3a8a', 0.8);
      const cone = mesh(new THREE.ConeGeometry(0.24, 0.62, 32), m, [0, 0.45, -0.04]);
      cone.rotation.x = -0.18;
      g.add(atHead(cone));
      g.add(atHead(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.025, 40), mat('#3b2d70', 0.8), [0, 0.17, 0])));
      const band = mesh(new THREE.TorusGeometry(0.235, 0.025, 8, 36), MATS.gold(), [0, 0.21, -0.01]);
      band.rotation.x = Math.PI / 2;
      g.add(atHead(band));
      break;
    }
    case 'iron_helm': {
      const st = MATS.steel();
      const scale: [number, number, number] = [HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z];
      // Купол до бровей и науши/затылок с открытым лицом.
      g.add(atHead(mesh(new THREE.SphereGeometry(HEAD_R + 0.05, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.43), st, [0, 0.01, -0.01], scale)));
      const open = 0.95;
      g.add(atHead(mesh(new THREE.SphereGeometry(HEAD_R + 0.048, 32, 8, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * 0.42, Math.PI * 0.24), mat('#c3cad2', 0.32, 0.85, { side: THREE.DoubleSide }), [0, 0.01, -0.01], scale)));
      const rim = mesh(new THREE.TorusGeometry(HEAD_R + 0.05, 0.022, 8, 40), mat('#7b848e', 0.4, 0.8), [0, 0.075, -0.01], [HEAD_SCALE.x, 1, HEAD_SCALE.z]);
      rim.rotation.x = Math.PI / 2;
      g.add(atHead(rim));
      g.add(atHead(mesh(new THREE.BoxGeometry(0.04, 0.17, 0.035), st, [0, 0.0, 0.305])));
      g.add(atHead(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.3), st, [0, 0.33, -0.02])));
      break;
    }
    case 'champion_crown': {
      const gold = MATS.gold();
      g.add(atHead(mesh(new THREE.CylinderGeometry(0.255, 0.27, 0.09, 40, 1, true), mat('#e7b442', 0.3, 0.9, { side: THREE.DoubleSide }), [0, 0.16, -0.01], [HEAD_SCALE.x, 1, HEAD_SCALE.z])));
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        g.add(atHead(mesh(new THREE.ConeGeometry(0.035, 0.11, 8), gold, [Math.sin(a) * 0.255, 0.255, Math.cos(a) * 0.25])));
      }
      g.add(atHead(mesh(new THREE.SphereGeometry(0.03, 12, 10), mat('#d23a4a', 0.2, 0.2), [0, 0.16, 0.27])));
      g.add(atHead(mesh(new THREE.SphereGeometry(0.022, 12, 10), mat('#4da3ff', 0.2, 0.2), [0.12, 0.16, 0.24])));
      g.add(atHead(mesh(new THREE.SphereGeometry(0.022, 12, 10), mat('#4da3ff', 0.2, 0.2), [-0.12, 0.16, 0.24])));
      break;
    }
  }
  return g;
}

function cape(m: Mat): THREE.Mesh {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.56, 1.25, 24, 1, true, Math.PI * 0.55, Math.PI * 0.9), m);
  c.position.set(0, 0.95, -0.04);
  c.scale.z = 0.75;
  return c;
}

function pauldrons(m: Mat): THREE.Mesh[] {
  return [-1, 1].map((sx) => {
    const p = mesh(new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m, [0.4 * sx, 1.52, 0], [1.1, 0.85, 1]);
    p.rotation.z = -0.35 * sx;
    return p;
  });
}

function buildBodyItem(id: string, color: string): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'leather_vest':
      g.add(torsoShell(MATS.leather(), 1.06, 0.32, Math.PI * 2 - 0.64));
      g.add(mesh(new THREE.TorusGeometry(0.285, 0.035, 8, 32), mat('#4a2f1f', 0.8), [0, TORSO_Y + 0.04, 0], [1.02, 1, TORSO_DEPTH * 1.08]).rotateX(Math.PI / 2));
      break;
    case 'traveler_cloak': {
      const m = mat('#3f6b48', 0.9, 0, { side: THREE.DoubleSide });
      g.add(cape(m));
      const mantle = mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 32), mat('#3f6b48', 0.9), [0, 1.56, 0], [1.15, 1, 0.8]);
      mantle.rotation.x = Math.PI / 2;
      g.add(mantle, mesh(new THREE.SphereGeometry(0.045, 12, 10), MATS.gold(), [0, 1.52, 0.25]), mesh(new THREE.SphereGeometry(0.02, 8, 8), mat(color, 0.4), [0, 1.52, 0.29]));
      break;
    }
    case 'chainmail':
      g.add(torsoShell(mat('#8d949c', 0.55, 0.7), 1.05));
      g.add(mesh(new THREE.TorusGeometry(0.285, 0.035, 8, 32), MATS.leather(), [0, TORSO_Y + 0.04, 0], [1.03, 1, TORSO_DEPTH * 1.08]).rotateX(Math.PI / 2));
      break;
    case 'mystic_robe': {
      const pts = [
        [0.0, -0.58],
        [0.42, -0.56],
        [0.34, -0.2],
        [0.29, 0.1],
        [0.31, 0.3],
        [0.35, 0.46],
        [0.36, 0.53],
        [0.31, 0.59],
        [0.17, 0.645],
        [0.0, 0.65],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const robe = mesh(new THREE.LatheGeometry(pts, 32), mat('#43337d', 0.85), [0, TORSO_Y - 0.01, 0], [1.05, 1, TORSO_DEPTH * 1.08]);
      g.add(robe);
      const hem = mesh(new THREE.TorusGeometry(0.42, 0.02, 8, 40), MATS.gold(), [0, TORSO_Y - 0.56, 0], [1.05, 1, TORSO_DEPTH * 1.08]);
      hem.rotation.x = Math.PI / 2;
      g.add(hem);
      g.add(limb(v(-0.1, TORSO_Y + 0.6, 0.235), v(0, TORSO_Y + 0.4, 0.25), 0.02, MATS.gold()));
      g.add(limb(v(0.1, TORSO_Y + 0.6, 0.235), v(0, TORSO_Y + 0.4, 0.25), 0.02, MATS.gold()));
      break;
    }
    case 'plate_armor':
    case 'champion_armor': {
      const champ = id === 'champion_armor';
      const metal = champ ? MATS.gold() : MATS.steel();
      if (champ) g.add(cape(mat('#8f1f2b', 0.8, 0, { side: THREE.DoubleSide })));
      g.add(torsoShell(metal, 1.08));
      g.add(...pauldrons(metal));
      g.add(mesh(new THREE.TorusGeometry(0.29, 0.04, 8, 32), champ ? mat('#8f1f2b', 0.7) : mat('#5c656f', 0.5, 0.7), [0, TORSO_Y + 0.04, 0], [1.05, 1, TORSO_DEPTH * 1.1]).rotateX(Math.PI / 2));
      if (champ) g.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), mat('#d23a4a', 0.2, 0.3), [0, TORSO_Y + 0.38, 0.25]));
      break;
    }
  }
  return g;
}

/** Оружие в правой руке персонажа (слева для зрителя). Начало координат — кисть. */
function buildWeapon(id: string): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'wooden_club':
      g.add(limb(v(0, -0.08, 0), v(0, 0.3, 0), 0.03, MATS.wood()));
      g.add(mesh(new THREE.CapsuleGeometry(0.085, 0.22, 6, 12), mat('#8a5a30', 0.9), [0, 0.45, 0]));
      break;
    case 'iron_dumbbell': {
      const bar = limb(v(-0.2, 0, 0), v(0.2, 0, 0), 0.022, mat('#c9ced4', 0.3, 0.8));
      g.add(bar);
      for (const sx of [-1, 1]) {
        const plate = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 24), MATS.iron(), [0.2 * sx, 0, 0]);
        plate.rotation.z = Math.PI / 2;
        g.add(plate);
      }
      break;
    }
    case 'bronze_sword':
    case 'steel_sword': {
      const steel = id === 'steel_sword';
      const blade = steel ? MATS.steel() : MATS.bronze();
      g.add(limb(v(0, -0.07, 0), v(0, 0.08, 0), 0.026, mat('#4a2f1f', 0.9)));
      g.add(mesh(new THREE.BoxGeometry(steel ? 0.26 : 0.2, 0.035, 0.05), steel ? MATS.steel() : mat('#6b4a2b', 0.8), [0, 0.1, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.1, steel ? 0.85 : 0.72, 0.028), blade, [0, steel ? 0.54 : 0.47, 0]));
      const tip = mesh(new THREE.ConeGeometry(0.071, 0.14, 4), blade, [0, steel ? 1.035 : 0.9, 0], [1, 1, 0.28]);
      tip.rotation.y = Math.PI / 4;
      g.add(tip);
      g.add(mesh(new THREE.BoxGeometry(0.02, steel ? 0.7 : 0.58, 0.034), steel ? mat('#9aa3ad', 0.3, 0.9) : mat('#a8743c', 0.35, 0.8), [0, steel ? 0.5 : 0.43, 0]));
      g.add(mesh(new THREE.SphereGeometry(steel ? 0.04 : 0.033, 12, 10), steel ? mat('#4da3ff', 0.2, 0.3) : MATS.bronze(), [0, -0.1, 0]));
      break;
    }
    case 'hunter_bow': {
      const arc = mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 32, Math.PI * 0.9), MATS.wood(), [-0.02, 0, 0]);
      arc.rotation.z = Math.PI / 2 + Math.PI * 0.05;
      arc.rotation.y = Math.PI / 2;
      g.add(arc);
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.98, 4), mat('#e8e2d0', 0.6), [0, 0, -0.12]));
      break;
    }
    case 'oak_staff':
      g.add(limb(v(0, -0.75, 0), v(0, 1.0, 0), 0.03, MATS.wood()));
      g.add(mesh(new THREE.SphereGeometry(0.085, 20, 14), mat('#8fd3ff', 0.2, 0, { emissive: '#4fb6ff', emissiveIntensity: 1.4 }), [0, 1.1, 0]));
      break;
  }
  return g;
}

/** Предмет в левой руке (справа для зрителя). Начало координат — кисть. */
function buildOffhand(id: string, color: string): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'wooden_shield': {
      const disk = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 36), MATS.wood(), [0.04, 0.1, 0.12]);
      disk.rotation.x = Math.PI / 2;
      const rim = mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 36), MATS.steel(), [0.04, 0.1, 0.12]);
      g.add(disk, rim, mesh(new THREE.SphereGeometry(0.06, 16, 10), MATS.steel(), [0.04, 0.1, 0.15], [1, 1, 0.6]));
      break;
    }
    case 'iron_shield': {
      const shape = new THREE.Shape();
      shape.moveTo(-0.24, 0.3);
      shape.lineTo(0.24, 0.3);
      shape.lineTo(0.24, 0.02);
      shape.quadraticCurveTo(0.22, -0.28, 0, -0.42);
      shape.quadraticCurveTo(-0.22, -0.28, -0.24, 0.02);
      shape.closePath();
      const body = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }), MATS.steel(), [0.04, 0.12, 0.1]);
      g.add(body);
      const cm = mat(color, 0.5);
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), cm, [0.04, 0.08, 0.16]), mesh(new THREE.BoxGeometry(0.32, 0.06, 0.02), cm, [0.04, 0.2, 0.16]));
      break;
    }
    case 'spell_tome':
      g.add(mesh(new THREE.BoxGeometry(0.24, 0.32, 0.08), mat('#5a2f6e', 0.8), [0.02, 0.05, 0.08]));
      g.add(mesh(new THREE.BoxGeometry(0.225, 0.3, 0.07), mat('#efe4c8', 0.9), [0.03, 0.05, 0.08]));
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), MATS.gold(), [0.02, 0.05, 0.125]));
      break;
    case 'kettlebell': {
      const iron = MATS.iron();
      g.add(mesh(new THREE.SphereGeometry(0.15, 24, 16), iron, [0, -0.2, 0.02]));
      const handle = mesh(new THREE.TorusGeometry(0.085, 0.024, 8, 20, Math.PI), iron, [0, -0.07, 0.02]);
      g.add(handle);
      break;
    }
  }
  return g;
}

// ─── Сборка ────────────────────────────────────────────────────────────

const HATS = ['leather_cap', 'ranger_hood', 'wizard_hat', 'iron_helm'];

export function buildCharacter(appearance: Appearance, color: string, equipped: Partial<Record<Slot, string>>): CharacterParts {
  const root = new THREE.Group();
  const skinTone = SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
  const skin = mat(skinTone.base, 0.6);
  const shirt = mat(new THREE.Color(color).multiplyScalar(0.62), 0.85);
  const pants = mat('#2d3440', 0.9);
  const boots = mat('#4a2f1f', 0.8);
  const hairM = mat(hairColor, 0.85);

  // Ноги
  for (const sx of [-1, 1]) {
    const x = 0.155 * sx;
    root.add(limb(v(x, 0.92, 0), v(x * 1.05, 0.52, 0.01), 0.105, pants));
    root.add(limb(v(x * 1.05, 0.52, 0.01), v(x * 1.08, 0.14, 0), 0.09, pants));
    root.add(mesh(new THREE.CapsuleGeometry(0.085, 0.16, 6, 12), boots, [x * 1.08, 0.085, 0.05], [1.05, 0.8, 1]).rotateX(Math.PI / 2));
  }
  // Таз: продолжение корпуса книзу, плавно переходит в ноги.
  const pelvis = [
    [0, 0.04],
    [0.262, 0.03],
    [0.272, -0.03],
    [0.262, -0.1],
    [0.2, -0.16],
    [0, -0.18],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  root.add(mesh(new THREE.LatheGeometry(pelvis, 32), pants, [0, TORSO_Y, 0], [1, 1, TORSO_DEPTH * 1.04]));
  root.add(mesh(new THREE.TorusGeometry(0.268, 0.026, 8, 40), mat('#3b2a1e', 0.7), [0, TORSO_Y + 0.02, 0], [1, 1, TORSO_DEPTH * 1.06]).rotateX(Math.PI / 2));
  root.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), MATS.gold(), [0, TORSO_Y + 0.02, 0.19]));

  // Корпус
  const torso = new THREE.Group();
  torso.add(torsoShell(shirt));
  root.add(torso);

  // Руки: плечо → локоть → запястье, слегка разведены (A-поза)
  const arm = (sx: number): THREE.Group => {
    const g = new THREE.Group();
    const shoulder = v(0.38 * sx, 1.5, 0);
    const elbow = v(0.5 * sx, 1.14, 0.03);
    const wrist = v(0.56 * sx, 0.84, 0.1);
    g.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), shirt, [shoulder.x, shoulder.y, shoulder.z]));
    g.add(limb(shoulder, elbow, 0.09, shirt));
    g.add(limb(elbow, wrist, 0.072, skin));
    g.add(mesh(new THREE.SphereGeometry(0.075, 14, 10), skin, [wrist.x, wrist.y - 0.06, wrist.z + 0.02], [0.9, 1.1, 0.8]));
    return g;
  };
  const rightArm = arm(-1);
  const leftArm = arm(1);
  root.add(rightArm, leftArm);

  // Шея и голова
  const head = new THREE.Group();
  root.add(mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.2, 16), skin, [0, 1.63, 0]));
  head.add(mesh(new THREE.SphereGeometry(HEAD_R, 40, 28), skin, [0, HEAD_Y, 0], [HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z]));
  head.add(buildFace(skinTone.shade, hairColor, appearance.beard));
  const hidesHair = equipped.head === 'iron_helm';
  if (!hidesHair) head.add(buildHair(appearance.hair, hairM, equipped.head !== undefined && HATS.includes(equipped.head)));
  if (equipped.head) head.add(buildHeadItem(equipped.head, color));
  // Голова чуть крупнее реальной — так персонаж выразительнее на маленьком экране.
  const NECK_Y = 1.68;
  head.position.y = -NECK_Y;
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_Y;
  headPivot.userData.baseY = NECK_Y;
  headPivot.scale.setScalar(1.14);
  headPivot.add(head);
  root.add(headPivot);

  if (equipped.body) torso.add(buildBodyItem(equipped.body, color));

  // Предметы в руках крепятся к кисти и поворачиваются вместе с рукой.
  if (equipped.weapon) {
    const w = buildWeapon(equipped.weapon);
    w.position.set(-0.56, 0.78, 0.13);
    w.rotation.x = 0.25;
    if (equipped.weapon === 'iron_dumbbell') w.rotation.set(0, 0.3, 0.15);
    rightArm.add(w);
  }
  if (equipped.offhand) {
    const o = buildOffhand(equipped.offhand, color);
    o.position.set(0.57, 0.78, 0.13);
    leftArm.add(o);
  }

  return { root, torso, head: headPivot, leftArm, rightArm };
}

/** Освобождает память видеокарты при пересборке или закрытии экрана. */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const material = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((x) => x.dispose());
    else material?.dispose();
  });
}
