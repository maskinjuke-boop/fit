import * as THREE from 'three';
import type { Slot } from '../../../game/items';
import type { Appearance } from '../../../game/state';
import type { MonsterId } from '../../../game/storyTypes';
import { M, cone, limb, mat, mesh, phys, taperTube, tex, v, type Anim, type Mat } from './kit';

/**
 * Модели монстров. Гуманоиды (гоблин, разбойник, тролль, ведьма, нежить) собираются
 * из модели героя со своим цветом кожи, экипировкой и масштабом; звери и чудища —
 * процедурно из простых форм. Земля — y = 0, морда смотрит на +Z.
 */

export interface HumanoidSpec {
  kind: 'humanoid';
  appearance: Appearance;
  color: string;
  equipped: Partial<Record<Slot, string>>;
  skin: { base: string; shade: string };
  scale: number;
  /** Тело обмотано бинтами (мумия). */
  bandaged?: boolean;
}

const human = (appearance: Partial<Appearance>, skin: [string, string], equipped: HumanoidSpec['equipped'], scale = 1, color = '#5a4632'): HumanoidSpec => ({
  kind: 'humanoid',
  appearance: { figure: 'male', skin: 1, hair: 'short', hairColor: 0, beard: false, eyes: 0, ...appearance },
  color,
  equipped,
  skin: { base: skin[0], shade: skin[1] },
  scale,
});

/** Монстры-гуманоиды: как одет и какого цвета. */
export const HUMANOIDS: Partial<Record<MonsterId, HumanoidSpec>> = {
  goblin: human({ hair: 'buzz', hairColor: 0, eyes: 2, body: { height: -1, weight: -0.6, muscle: 0.2 } }, ['#7fa452', '#5c7f36'], { head: 'leather_cap', legs: 'loincloth', weapon: 'dagger', hands: 'linen_wraps' }, 0.72),
  bandit: human({ hair: 'long', hairColor: 0, beard: true, eyes: 0 }, ['#c99470', '#a8714f'], { head: 'bandana', body: 'leather_vest', legs: 'leather_hose', feet: 'soldier_boots', weapon: 'dagger', offhand: 'buckler' }, 1, '#7a1f1f'),
  troll: human({ hair: 'buzz', hairColor: 0, eyes: 1, body: { weight: 1, muscle: 1, belly: 1, shoulders: 1, arms: 1 } }, ['#7d8a76', '#5d6a58'], { legs: 'loincloth', weapon: 'wooden_club', hands: 'spiked_bracers' }, 1.35),
  bog_zombie: human({ hair: 'long', hairColor: 3, eyes: 1, body: { weight: -1 } }, ['#8f9a7c', '#6b765c'], { body: 'monk_habit', weapon: 'reaper_scythe' }, 1.02, '#3a3f2f'),
  witch: human({ figure: 'female', hair: 'long', hairColor: 0, eyes: 1 }, ['#a8c48a', '#82a066'], { head: 'wizard_hat', body: 'mystic_robe', weapon: 'oak_staff', offhand: 'crystal_orb', neck: 'ruby_amulet' }, 1.05, '#2f5a2a'),
  mummy: { ...human({ hair: 'buzz', hairColor: 3, eyes: 1, body: { weight: -1 } }, ['#cbbd98', '#a8976f'], { legs: 'loincloth', hands: 'linen_wraps', neck: 'gold_chain', head: 'gold_circlet' }, 1.02), bandaged: true },
  skeleton_knight: human({ hair: 'buzz', hairColor: 3, eyes: 1, body: { weight: -1, muscle: -1 } }, ['#d9d4c3', '#b3ad98'], { head: 'iron_helm', body: 'plate_armor', legs: 'chain_loincloth', feet: 'steel_sabatons', weapon: 'longsword', offhand: 'iron_shield' }, 1.05, '#3a3f4a'),
  dark_champion: human({ hair: 'long', hairColor: 0, beard: true, eyes: 1, body: { muscle: 1, shoulders: 1 } }, ['#7a7f8c', '#5b5f6b'], { head: 'horned_helm', body: 'dragon_armor', feet: 'steel_sabatons', hands: 'steel_gauntlets', weapon: 'battle_axe', back: 'shadow_cloak' }, 1.18, '#3b1220'),
};

// ─── Звери ─────────────────────────────────────────────────────────────

const fur = (color: string, rep = 4): Mat => {
  const m = mat(color, 0.95);
  const t = tex('hair', rep, rep);
  if (t) {
    m.bumpMap = t;
    m.bumpScale = 2;
  }
  return m;
};

const eyes = (g: THREE.Group, at: THREE.Vector3, dx: number, r: number, color: string): void => {
  for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(r, 12, 8), M.glow(color, 1.4), [at.x + dx * sx, at.y, at.z]));
};

interface QuadSpec {
  len: number;
  height: number;
  girth: number;
  color: string;
  belly: string;
  head: number;
  snout: number;
  ears: 'pointy' | 'round';
  tail: number;
  eye: string;
}

/** Четвероногий зверь: туловище, голова с мордой, ноги, хвост. */
function quadruped(q: QuadSpec): THREE.Group {
  const g = new THREE.Group();
  const f = fur(q.color);
  const legH = q.height * 0.48;
  const bodyY = legH + q.girth * 0.7;
  g.add(mesh(new THREE.SphereGeometry(1, 32, 20), f, [0, bodyY, 0], [q.girth * 0.95, q.girth, q.len / 2]));
  g.add(mesh(new THREE.SphereGeometry(1, 24, 16), f, [0, bodyY + q.girth * 0.15, q.len * 0.3], [q.girth * 1.02, q.girth * 1.05, q.len * 0.28]));
  g.add(mesh(new THREE.SphereGeometry(1, 20, 12), fur(q.belly), [0, bodyY - q.girth * 0.45, 0.02], [q.girth * 0.7, q.girth * 0.5, q.len * 0.4]));
  // Голова и морда.
  const hp = v(0, bodyY + q.girth * 0.45, q.len / 2 + q.head * 0.55);
  g.add(mesh(new THREE.SphereGeometry(q.head, 24, 16), f, [hp.x, hp.y, hp.z], [1, 0.92, 1.05]));
  const tip = hp.clone().add(v(0, -q.head * 0.35, q.head * 0.8 + q.snout));
  g.add(cone(hp.clone().add(v(0, -q.head * 0.2, q.head * 0.4)), tip, q.head * 0.55, q.head * 0.24, f, 16));
  g.add(mesh(new THREE.SphereGeometry(q.head * 0.16, 12, 8), mat('#1a1414', 0.4), [tip.x, tip.y + q.head * 0.05, tip.z]));
  // Пасть с клыками.
  for (const sx of [-1, 1]) g.add(cone(tip.clone().add(v(q.head * 0.12 * sx, -q.head * 0.12, -q.head * 0.15)), tip.clone().add(v(q.head * 0.12 * sx, -q.head * 0.3, -q.head * 0.12)), q.head * 0.04, 0.001, mat('#f2ead8', 0.4), 6));
  eyes(g, hp.clone().add(v(0, q.head * 0.25, q.head * 0.78)), q.head * 0.38, q.head * 0.1, q.eye);
  for (const sx of [-1, 1]) {
    const base = hp.clone().add(v(q.head * 0.55 * sx, q.head * 0.75, -q.head * 0.1));
    if (q.ears === 'pointy') g.add(cone(base, base.clone().add(v(q.head * 0.15 * sx, q.head * 0.55, -q.head * 0.05)), q.head * 0.22, 0.004, f, 8));
    else g.add(mesh(new THREE.SphereGeometry(q.head * 0.24, 12, 8), f, [base.x, base.y, base.z], [1, 1, 0.5]));
  }
  // Ноги.
  const legR = q.girth * 0.24;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const top = v(q.girth * 0.55 * sx, bodyY - q.girth * 0.2, (q.len / 2 - q.girth * 0.5) * sz);
      const knee = v(top.x * 1.05, legH * 0.5, top.z + (sz > 0 ? 0.02 : -0.04));
      const foot = v(top.x * 1.05, legR * 0.6, top.z + 0.03);
      g.add(limb(top, knee, legR, f), limb(knee, foot, legR * 0.8, f));
      g.add(mesh(new THREE.SphereGeometry(legR * 1.1, 12, 8), fur(q.belly), [foot.x, legR * 0.5, foot.z + legR * 0.4], [1, 0.6, 1.3]));
    }
  }
  if (q.tail > 0) {
    const a = v(0, bodyY + q.girth * 0.2, -q.len / 2);
    const c = new THREE.CatmullRomCurve3([a, a.clone().add(v(0, q.tail * 0.1, -q.tail * 0.5)), a.clone().add(v(0.05, -q.tail * 0.3, -q.tail * 0.9))]);
    g.add(new THREE.Mesh(taperTube(c, q.girth * 0.18, q.girth * 0.06, 16, 10), f));
  }
  return g;
}

function spider(): THREE.Group {
  const g = new THREE.Group();
  const shell = phys('#2a2426', 0.4, { clearcoat: 0.6, clearcoatRoughness: 0.3 });
  g.add(mesh(new THREE.SphereGeometry(0.42, 28, 18), shell, [0, 0.55, -0.35], [1, 0.85, 1.15]));
  g.add(mesh(new THREE.SphereGeometry(0.24, 24, 16), shell, [0, 0.48, 0.18]));
  // Красный узор на брюшке.
  g.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), M.glow('#c62828', 0.5), [0, 0.88, -0.38], [0.6, 0.25, 1.4]));
  for (let i = 0; i < 4; i += 1) {
    for (const sx of [-1, 1]) {
      const z = 0.3 - i * 0.14;
      const root = v(0.16 * sx, 0.5, z);
      const knee = v((0.55 + i * 0.03) * sx, 0.95, z + (1.5 - i) * 0.12);
      const foot = v((0.85 + i * 0.05) * sx, 0.02, z + (1.5 - i) * 0.3);
      g.add(limb(root, knee, 0.035, shell), limb(knee, foot, 0.026, shell));
    }
  }
  for (const [x, y, r] of [[-0.07, 0.6, 0.04], [0.07, 0.6, 0.04], [-0.13, 0.56, 0.025], [0.13, 0.56, 0.025], [-0.04, 0.66, 0.02], [0.04, 0.66, 0.02]] as const) {
    g.add(mesh(new THREE.SphereGeometry(r, 10, 8), M.glow('#ff2b2b', 1.6), [x, y, 0.4]));
  }
  for (const sx of [-1, 1]) g.add(cone(v(0.05 * sx, 0.42, 0.38), v(0.03 * sx, 0.28, 0.46), 0.025, 0.002, mat('#d9cdb0', 0.4), 8));
  return g;
}

function scorpion(): THREE.Group {
  const g = new THREE.Group();
  const shell = phys('#b8863b', 0.35, { clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const dark = phys('#6b4a1e', 0.35, { clearcoat: 0.7 });
  for (let i = 0; i < 5; i += 1) g.add(mesh(new THREE.SphereGeometry(0.3 - i * 0.02, 20, 12), i % 2 ? dark : shell, [0, 0.32, 0.35 - i * 0.2], [1.3, 0.55, 0.7]));
  // Хвост дугой с жалом.
  const tail = new THREE.CatmullRomCurve3([v(0, 0.35, -0.55), v(0, 0.75, -0.8), v(0, 1.3, -0.6), v(0, 1.5, -0.15), v(0, 1.3, 0.12)]);
  for (let i = 0; i < 7; i += 1) {
    const p = tail.getPointAt(i / 7);
    g.add(mesh(new THREE.SphereGeometry(0.13 - i * 0.008, 14, 10), i % 2 ? dark : shell, [p.x, p.y, p.z]));
  }
  const end = tail.getPointAt(1);
  g.add(mesh(new THREE.SphereGeometry(0.1, 14, 10), shell, [end.x, end.y, end.z], [1, 1.2, 1]));
  g.add(cone(end, end.clone().add(v(0, -0.12, 0.22)), 0.05, 0.002, M.glow('#7aff5a', 0.8), 8));
  // Клешни.
  for (const sx of [-1, 1]) {
    const a = v(0.3 * sx, 0.32, 0.45);
    const b = v(0.55 * sx, 0.4, 0.75);
    const c = v(0.5 * sx, 0.35, 1.05);
    g.add(limb(a, b, 0.06, shell), limb(b, c, 0.06, shell));
    g.add(mesh(new THREE.SphereGeometry(0.15, 16, 12), dark, [c.x, c.y, c.z + 0.12], [0.8, 0.6, 1.3]));
    g.add(cone(c.clone().add(v(0.05 * sx, 0.02, 0.2)), c.clone().add(v(-0.02 * sx, 0.04, 0.45)), 0.06, 0.004, shell, 8));
    g.add(cone(c.clone().add(v(-0.06 * sx, -0.02, 0.2)), c.clone().add(v(-0.1 * sx, -0.02, 0.4)), 0.05, 0.004, shell, 8));
    for (let i = 0; i < 4; i += 1) {
      const z = 0.25 - i * 0.2;
      g.add(limb(v(0.3 * sx, 0.3, z), v(0.6 * sx, 0.4, z - 0.05), 0.025, dark), limb(v(0.6 * sx, 0.4, z - 0.05), v(0.78 * sx, 0.02, z - 0.1), 0.02, dark));
    }
  }
  eyes(g, v(0, 0.48, 0.55), 0.06, 0.03, '#ff3d00');
  return g;
}

function toad(): THREE.Group {
  const g = new THREE.Group();
  const skin = phys('#5f8a3a', 0.45, { clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const belly = mat('#d8d29a', 0.6);
  g.add(mesh(new THREE.SphereGeometry(0.75, 32, 20), skin, [0, 0.62, -0.1], [1.1, 0.75, 1]));
  g.add(mesh(new THREE.SphereGeometry(0.6, 28, 16), belly, [0, 0.45, 0.2], [1.05, 0.6, 0.9]));
  g.add(mesh(new THREE.SphereGeometry(0.55, 28, 16), skin, [0, 0.85, 0.42], [1.25, 0.6, 0.85]));
  // Широкая пасть.
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 32, Math.PI), mat('#3c5a24', 0.5));
  lip.position.set(0, 0.78, 0.55);
  lip.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI);
  lip.scale.set(1.1, 0.75, 1);
  g.add(lip);
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.17, 18, 12), skin, [0.4 * sx, 1.12, 0.4]));
    g.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), M.glow('#ffd23a', 0.8), [0.42 * sx, 1.16, 0.5]));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#111', 0.2), [0.43 * sx, 1.17, 0.61], [0.5, 1.2, 0.5]));
    g.add(mesh(new THREE.SphereGeometry(0.3, 18, 12), skin, [0.7 * sx, 0.3, -0.3], [0.8, 0.6, 1.3]));
    g.add(mesh(new THREE.SphereGeometry(0.16, 14, 10), skin, [0.55 * sx, 0.12, 0.55], [1, 0.5, 1.4]));
  }
  const wart = mat('#4a6e2c', 0.6);
  for (let i = 0; i < 18; i += 1) {
    const a = i * 2.4;
    const y = 0.6 + ((i * 37) % 10) / 25;
    g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), wart, [Math.sin(a) * 0.72, y, Math.cos(a) * 0.62 - 0.15]));
  }
  return g;
}

function slime(anim: Anim[]): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.7, 48, 32);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + 0.06 * Math.sin(x * 9 + z * 4) * Math.cos(y * 7);
    if (y < -0.3) y = -0.3 - (y + 0.3) * 0.15;
    p.setXYZ(i, x * n * (1 + Math.max(0, -y) * 0.4), y * n, z * n * (1 + Math.max(0, -y) * 0.4));
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, phys('#58d26a', 0.12, { transmission: 0.55, thickness: 0.6, transparent: true, opacity: 0.85, clearcoat: 1, emissive: new THREE.Color('#1c6a2a'), emissiveIntensity: 0.4 }));
  body.position.y = 0.36;
  g.add(body);
  g.add(mesh(new THREE.IcosahedronGeometry(0.16, 1), M.glow('#c6ff7a', 1.5), [0.05, 0.35, -0.05]));
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.1, 14, 10), mat('#f5f5f0', 0.2), [0.2 * sx, 0.6, 0.48]));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#111', 0.2), [0.2 * sx, 0.6, 0.57]));
  }
  // Пара «проглоченных» костей внутри.
  g.add(limb(v(-0.2, 0.25, -0.1), v(0.15, 0.15, 0.05), 0.025, mat('#e8e0c8', 0.5)));
  anim.push((t) => body.scale.set(1 + Math.sin(t * 2) * 0.03, 1 - Math.sin(t * 2) * 0.04, 1 + Math.sin(t * 2) * 0.03));
  return g;
}

/** Каменный великан: глыбы с рунами вместо мышц. */
function golem(): THREE.Group {
  const g = new THREE.Group();
  const rock = mat('#7d7a73', 0.95);
  rock.flatShading = true;
  const rock2 = mat('#66625b', 0.95);
  rock2.flatShading = true;
  const boulder = (r: number, m: Mat, p: [number, number, number], s: [number, number, number] = [1, 1, 1]): THREE.Mesh => mesh(new THREE.IcosahedronGeometry(r, 1), m, p, s);
  g.add(boulder(0.62, rock, [0, 1.95, 0], [1.25, 1, 0.85]));
  g.add(boulder(0.45, rock2, [0, 1.3, 0.02], [1.1, 0.8, 0.8]));
  g.add(boulder(0.3, rock, [0, 2.75, 0.12], [1, 0.9, 0.95]));
  for (const sx of [-1, 1]) {
    g.add(boulder(0.34, rock2, [0.9 * sx, 2.25, 0]));
    g.add(boulder(0.28, rock, [1.0 * sx, 1.7, 0.08], [0.9, 1.3, 0.9]));
    g.add(boulder(0.36, rock2, [1.05 * sx, 1.1, 0.15]));
    g.add(boulder(0.3, rock, [0.38 * sx, 0.85, 0], [1, 1.2, 1]));
    g.add(boulder(0.34, rock2, [0.42 * sx, 0.3, 0.05], [1.1, 0.9, 1.2]));
  }
  eyes(g, v(0, 2.8, 0.38), 0.11, 0.05, '#5fd4ff');
  const rune = M.glow('#5fd4ff', 1.2);
  for (const [x, y] of [[0, 2.05], [-0.2, 1.85], [0.22, 1.9]] as const) g.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.02), rune, [x, y, 0.53]));
  return g;
}

function serpent(): THREE.Group {
  const g = new THREE.Group();
  const scales = M.scales('#c2903e', 6, 0.15);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const k = i / 40;
    const a = k * Math.PI * 3.2;
    const r = 0.9 - k * 0.55;
    pts.push(v(Math.cos(a) * r, 0.18 + k * k * 1.9, Math.sin(a) * r - 0.2));
  }
  pts.push(v(0.05, 2.35, 0.3));
  const body = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(taperTube(body, 0.24, 0.13, 160, 18), scales));
  const head = v(0.08, 2.4, 0.45);
  g.add(mesh(new THREE.SphereGeometry(0.22, 24, 16), scales, [head.x, head.y, head.z], [1.1, 0.75, 1.5]));
  // Капюшон за головой.
  const hood = phys('#8a5a22', 0.5, { side: THREE.DoubleSide });
  g.add(mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), hood, [head.x, head.y - 0.18, head.z - 0.18], [1.2, 1, 0.35]).rotateX(-1.2));
  eyes(g, head.clone().add(v(0, 0.08, 0.22)), 0.12, 0.035, '#ffe600');
  for (const sx of [-1, 1]) g.add(cone(head.clone().add(v(0.06 * sx, -0.08, 0.28)), head.clone().add(v(0.05 * sx, -0.22, 0.3)), 0.022, 0.001, mat('#f5f0e0', 0.3), 6));
  g.add(limb(head.clone().add(v(0, -0.08, 0.32)), head.clone().add(v(0, -0.1, 0.52)), 0.008, mat('#c62828', 0.5)));
  return g;
}

function wraith(anim: Anim[]): THREE.Group {
  const g = new THREE.Group();
  const cloth = phys('#1e1c2a', 0.8, { transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: new THREE.Color('#2a2050'), emissiveIntensity: 0.4 });
  // Балахон: расширяется книзу, рваный подол.
  const geo = new THREE.CylinderGeometry(0.22, 0.62, 1.6, 40, 8, true);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i += 1) {
    const y = p.getY(i);
    if (y < -0.75) p.setY(i, y + 0.18 * Math.abs(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 7)));
  }
  geo.computeVertexNormals();
  const robe = new THREE.Mesh(geo, cloth);
  robe.position.y = 1.15;
  g.add(robe);
  g.add(mesh(new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.75), cloth, [0, 2.05, -0.02], [1, 1.15, 1.1]));
  g.add(mesh(new THREE.SphereGeometry(0.22, 20, 12), mat('#050508', 1), [0, 2.0, 0.08], [1, 1.1, 0.8]));
  eyes(g, v(0, 2.03, 0.24), 0.08, 0.035, '#7cf3ff');
  for (const sx of [-1, 1]) {
    const sleeve = cone(v(0.2 * sx, 1.75, 0.0), v(0.55 * sx, 1.35, 0.35), 0.1, 0.16, cloth, 16, true);
    g.add(sleeve);
    for (let i = 0; i < 3; i += 1) g.add(limb(v(0.57 * sx, 1.32, 0.38), v((0.62 + i * 0.02) * sx, 1.18, 0.45 + (i - 1) * 0.05), 0.012, M.glow('#9fe9ff', 0.6)));
  }
  const glow = new THREE.PointLight('#7cf3ff', 0.8, 3, 2);
  glow.position.set(0, 1.8, 0.6);
  g.add(glow);
  anim.push((t) => {
    g.position.y = 0.2 + Math.sin(t * 1.6) * 0.06;
  });
  g.position.y = 0.2;
  return g;
}

/** Процедурный монстр (не гуманоид). */
export function buildBeast(id: MonsterId, anim: Anim[]): THREE.Group {
  switch (id) {
    case 'wolf':
      return quadruped({ len: 1.35, height: 0.95, girth: 0.21, color: '#6f6b66', belly: '#a9a39b', head: 0.15, snout: 0.17, ears: 'pointy', tail: 0.6, eye: '#ffd23a' });
    case 'bear':
      return quadruped({ len: 1.6, height: 1.25, girth: 0.48, color: '#5a3d26', belly: '#7a5638', head: 0.28, snout: 0.08, ears: 'round', tail: 0.1, eye: '#ff8a00' });
    case 'giant_spider':
      return spider();
    case 'scorpion':
      return scorpion();
    case 'giant_toad':
      return toad();
    case 'slime':
      return slime(anim);
    case 'stone_giant':
      return golem();
    case 'sand_serpent':
      return serpent();
    case 'wraith':
      return wraith(anim);
    default:
      return new THREE.Group();
  }
}
