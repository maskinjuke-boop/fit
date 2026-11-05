import * as THREE from 'three';
import { M, mat, mesh } from './kit';
import { handPose, type Motion, type Rig } from './rig';

/** Середина ладони в осях кисти (как в rig.handPose). */
const PALM_LOCAL = { r: new THREE.Vector3(0.022, -0.075, 0.018), l: new THREE.Vector3(-0.022, -0.075, 0.018) };

/**
 * Предметы в руках на время действия: книга, телефон, чашка, тарелка с вилкой, лопатка,
 * геймпад, VR-шлем на голове и т. п. Крепятся к костям кистей (в точке хвата кулака) или
 * к голове, появляются и исчезают плавно (масштаб), после действия прячутся. Модели
 * собираются один раз на персонажа и переиспользуются.
 */

export type PropKind =
  | 'book'
  | 'phone'
  | 'phone_ear'
  | 'cup'
  | 'shaker'
  | 'plate'
  | 'fork'
  | 'sandwich'
  | 'spatula'
  | 'gamepad'
  | 'vr'
  | 'vr_l'
  | 'vr_r'
  | 'remote'
  | 'popcorn'
  | 'brush'
  | 'palette'
  | 'notepad'
  | 'pen'
  | 'teaser'
  | 'treat'
  | 'foodbag'
  | 'scoop'
  | 'glove_l'
  | 'glove_r'
  | 'flyers';

/**
 * Как держать. at — правая/левая ладонь, обе (середина между ладонями) или голова.
 * rot — поворот предмета в осях тела (порядок YXZ: наклон x, поворот y, крен z) в той позе,
 * для которой он показан: предмет следует за кистью, и в начале жеста смотрит как задано.
 * off — сдвиг от ладони в осях тела (у левой руки x зеркально). local — поворот и сдвиг
 * в осях самой кисти (перчатки, контроллеры) или головы.
 */
interface Mount {
  at: 'l' | 'r' | 'both' | 'head';
  rot: [number, number, number];
  off: [number, number, number];
  local?: boolean;
}

const MOUNT: Record<PropKind, Mount> = {
  book: { at: 'both', rot: [-0.75, 0, 0], off: [0, 0.05, 0.03] },
  phone: { at: 'r', rot: [-0.64, Math.PI, 0], off: [0.01, 0.03, 0.02] },
  phone_ear: { at: 'r', rot: [0.35, Math.PI / 2, 0], off: [0.035, 0.03, 0.0] },
  cup: { at: 'r', rot: [0, 0, 0], off: [0.01, -0.03, 0.03] },
  shaker: { at: 'r', rot: [0, 0, 0], off: [0.01, -0.06, 0.03] },
  plate: { at: 'l', rot: [0, 0, 0], off: [0.02, 0.03, 0.05] },
  fork: { at: 'r', rot: [1.1, 0, 0], off: [0, 0.01, 0.0] },
  sandwich: { at: 'r', rot: [0, 0, 0.3], off: [0.01, 0.03, 0.03] },
  spatula: { at: 'r', rot: [2.0, 0, 0], off: [0, 0, 0] },
  gamepad: { at: 'both', rot: [-0.35, 0, 0], off: [0, 0.03, 0.02] },
  vr: { at: 'head', rot: [0, 0, 0], off: [0, 0.33, 0.2], local: true },
  vr_l: { at: 'l', rot: [Math.PI / 2, 0, 0], off: [0, 0.04, 0.0], local: true },
  vr_r: { at: 'r', rot: [Math.PI / 2, 0, 0], off: [0, 0.04, 0.0], local: true },
  remote: { at: 'r', rot: [1.4, 0, 0], off: [0, 0.015, -0.02] },
  popcorn: { at: 'l', rot: [0, 0, 0], off: [0.03, 0.03, 0.03] },
  brush: { at: 'r', rot: [1.1, 0, 0], off: [0, 0, -0.02] },
  palette: { at: 'l', rot: [-0.3, 0, 0], off: [0.02, 0.03, 0.05] },
  notepad: { at: 'l', rot: [-0.6, 0, 0], off: [0.03, 0.03, 0.04] },
  pen: { at: 'r', rot: [2.3, 0, 0], off: [0, 0, 0] },
  teaser: { at: 'r', rot: [1.9, 0, 0], off: [0, 0, -0.02] },
  treat: { at: 'r', rot: [0, 0, 0], off: [0, 0.02, 0.0] },
  foodbag: { at: 'r', rot: [0, 0, 0], off: [0.02, 0.02, 0.03] },
  scoop: { at: 'r', rot: [2.0, 0, 0], off: [0, 0, 0] },
  glove_l: { at: 'l', rot: [0, 0, 0], off: [0.005, -0.065, 0.01], local: true },
  glove_r: { at: 'r', rot: [0, 0, 0], off: [0.005, -0.065, 0.01], local: true },
  flyers: { at: 'l', rot: [0, 0, 0], off: [0.02, 0.02, 0.03] },
};

const cyl = (r0: number, r1: number, h: number, n = 14): THREE.CylinderGeometry => new THREE.CylinderGeometry(r1, r0, h, n);

/** Модель предмета (длинная ось — по +y, точка хвата — в начале координат). */
function model(kind: PropKind): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'book': {
      // Раскрытая книга лежит на ладонях: две половины у корешка (вдоль z), страницами вверх.
      const cover = mat('#2f5d8a', 0.7);
      const paper = mat('#f5f0e4', 0.9);
      for (const sd of [-1, 1]) {
        const half = new THREE.Group();
        half.add(mesh(new THREE.BoxGeometry(0.17, 0.008, 0.25), cover, [sd * 0.085, -0.004, 0]));
        half.add(mesh(new THREE.BoxGeometry(0.16, 0.02, 0.235), paper, [sd * 0.082, 0.01, 0]));
        half.rotation.z = sd * 0.22;
        g.add(half);
      }
      break;
    }
    case 'phone':
    case 'phone_ear':
      g.add(mesh(new THREE.BoxGeometry(0.085, 0.17, 0.012), mat('#1b1d21', 0.3, 0.3)));
      g.add(mesh(new THREE.PlaneGeometry(0.075, 0.15), M.glow('#6fb7ff', 0.9), [0, 0, 0.0065]));
      break;
    case 'cup': {
      g.add(mesh(cyl(0.032, 0.04, 0.07, 18), mat('#ffffff', 0.35), [0, 0.035, 0]));
      g.add(mesh(new THREE.CircleGeometry(0.036, 18), mat('#4a2a17', 0.3), [0, 0.068, 0]).rotateX(-Math.PI / 2));
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12), mat('#ffffff', 0.35));
      h.position.set(0.045, 0.035, 0);
      g.add(h);
      break;
    }
    case 'shaker':
      g.add(mesh(cyl(0.042, 0.046, 0.18, 18), mat('#f2f2f2', 0.25, 0, { transparent: true, opacity: 0.85 }), [0, 0.06, 0]));
      g.add(mesh(cyl(0.04, 0.04, 0.1, 18), mat('#c98a5a', 0.6), [0, 0.02, 0]));
      g.add(mesh(cyl(0.047, 0.03, 0.05, 18), mat('#e85d2a', 0.4), [0, 0.175, 0]));
      break;
    case 'plate': {
      g.add(mesh(cyl(0.12, 0.15, 0.018, 28), mat('#fbfbfb', 0.3), [0, 0, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.05, 12, 8), mat('#7bb661', 0.8), [0.03, 0.02, 0.02], [1.2, 0.5, 1]));
      g.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), mat('#d9a35b', 0.7), [-0.04, 0.02, -0.02], [1.3, 0.5, 1]));
      break;
    }
    case 'fork':
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.16, 0.005), M.chrome(), [0, 0.06, 0]));
      for (const x of [-0.006, 0, 0.006]) g.add(mesh(new THREE.BoxGeometry(0.0025, 0.04, 0.004), M.chrome(), [x, 0.16, 0]));
      break;
    case 'sandwich':
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.022, 0.1), mat('#e8c58a', 0.8), [0, 0.0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.125, 0.012, 0.105), mat('#6fae4c', 0.8), [0, 0.016, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.022, 0.1), mat('#e8c58a', 0.8), [0, 0.032, 0]));
      break;
    case 'spatula':
      g.add(mesh(cyl(0.012, 0.012, 0.2), mat('#2b2b2b', 0.5), [0, 0.05, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.075, 0.09, 0.006), M.steel(), [0, 0.19, 0]));
      break;
    case 'gamepad': {
      const dark = mat('#24272c', 0.45);
      g.add(mesh(new THREE.BoxGeometry(0.15, 0.035, 0.07), dark, [0, 0, 0]));
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), dark, [s * 0.075, -0.005, -0.02], [1, 0.75, 1.3]));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.005, 0.02), M.glow('#39d0ff', 0.8), [0.035, 0.02, 0.01]));
      break;
    }
    case 'vr': {
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.15, 0.13), mat('#f4f4f4', 0.35), [0, 0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.32, 0.13, 0.02), mat('#15171a', 0.2, 0.3), [0, 0, 0.068]));
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 24, Math.PI), mat('#2b2e33', 0.7));
      strap.rotation.x = Math.PI / 2;
      strap.rotation.z = Math.PI;
      strap.scale.set(1, 1.25, 1);
      strap.position.z = -0.05;
      g.add(strap);
      break;
    }
    case 'vr_l':
    case 'vr_r': {
      g.add(mesh(cyl(0.018, 0.022, 0.12), mat('#f4f4f4', 0.35), [0, 0.03, 0]));
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 18), mat('#2b2e33', 0.5));
      r.position.y = 0.11;
      g.add(r);
      break;
    }
    case 'remote':
      g.add(mesh(new THREE.BoxGeometry(0.045, 0.17, 0.022), mat('#1b1d21', 0.4), [0, 0.04, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.014, 0.008, 0.006), M.glow('#ff4d4d', 0.6), [0, 0.11, 0.012]));
      break;
    case 'popcorn': {
      g.add(mesh(cyl(0.075, 0.1, 0.18, 16, ), mat('#d63a3a', 0.6), [0, 0.06, 0]));
      for (let i = 0; i < 9; i += 1) g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('#fff3c4', 0.9), [Math.sin(i * 2.4) * 0.06, 0.16 + (i % 3) * 0.01, Math.cos(i * 2.4) * 0.06]));
      break;
    }
    case 'brush':
      g.add(mesh(cyl(0.007, 0.009, 0.24), mat('#b5651d', 0.6), [0, 0.06, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.012, 0.04, 8), mat('#d62f6d', 0.8), [0, 0.2, 0]));
      break;
    case 'palette': {
      g.add(mesh(cyl(0.13, 0.13, 0.01, 24), mat('#c89a64', 0.7), [0, 0, 0], [1, 1, 0.75]));
      ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'].forEach((c, i) => g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), mat(c, 0.6), [-0.06 + i * 0.04, 0.008, 0.03 - (i % 2) * 0.05], [1, 0.4, 1])));
      break;
    }
    case 'notepad':
      g.add(mesh(new THREE.BoxGeometry(0.15, 0.012, 0.2), mat('#fdfdf7', 0.9), [0, 0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.15, 0.014, 0.02), mat('#e85d2a', 0.6), [0, 0.001, -0.09]));
      break;
    case 'pen':
      g.add(mesh(cyl(0.006, 0.006, 0.14), mat('#2f6fb5', 0.4), [0, 0.03, 0]));
      break;
    case 'teaser': {
      // Удочка-дразнилка: палочка, леска и пёрышко.
      g.add(mesh(cyl(0.007, 0.005, 0.45), mat('#c49a6c', 0.6), [0, 0.18, 0]));
      const string = mesh(cyl(0.0015, 0.0015, 0.25, 4), mat('#eeeeee', 0.6), [0, 0.4, 0.0]);
      string.name = 'string';
      g.add(string);
      const feather = new THREE.Group();
      feather.name = 'feather';
      feather.position.y = 0.4;
      for (let i = 0; i < 4; i += 1) feather.add(mesh(new THREE.ConeGeometry(0.015, 0.09, 6), mat(['#e84393', '#f1c40f', '#39d0ff', '#2ecc71'][i]!, 0.8), [Math.sin(i * 1.6) * 0.01, -0.13, Math.cos(i * 1.6) * 0.01]).rotateZ(Math.PI + (i - 1.5) * 0.25));
      g.add(feather);
      break;
    }
    case 'treat':
      g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), mat('#a0652e', 0.7), [0, 0, 0], [1.4, 0.8, 1]));
      break;
    case 'foodbag':
      g.add(mesh(new THREE.BoxGeometry(0.13, 0.19, 0.06), mat('#f39c12', 0.6), [0, 0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.135, 0.03, 0.062), mat('#2c3e50', 0.5), [0, 0.08, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('#ffffff', 0.7), [0, -0.01, 0.031], [1, 1, 0.2]));
      break;
    case 'scoop':
      g.add(mesh(cyl(0.01, 0.01, 0.14), mat('#2ecc71', 0.5), [0, 0.03, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.012), mat('#27ae60', 0.5), [0, 0.15, 0.015]).rotateX(0.35));
      break;
    case 'glove_l':
    case 'glove_r': {
      const red = mat('#c0262d', 0.45);
      g.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), red, [0, 0, 0], [0.95, 1.1, 1.15]));
      g.add(mesh(cyl(0.052, 0.056, 0.06, 14), mat('#f4f4f4', 0.6), [0, 0.085, 0]));
      break;
    }
    case 'flyers':
      for (let i = 0; i < 3; i += 1) g.add(mesh(new THREE.BoxGeometry(0.11, 0.004, 0.15), mat(['#ffffff', '#ffe08a', '#bfe3ff'][i]!, 0.8), [i * 0.005, i * 0.005, i * 0.004]).rotateY(i * 0.1));
      break;
  }
  g.traverse((o) => {
    o.castShadow = false;
  });
  return g;
}

/** Предметы персонажа: модели и куда стремится их масштаб (0 — спрятан). */
interface PropState {
  obj: THREE.Group;
  want: number;
}
const store = new WeakMap<Rig, Map<PropKind, PropState>>();

const e = new THREE.Euler(0, 0, 0, 'YXZ');
const qw = new THREE.Quaternion();
const off = new THREE.Vector3();
const mid = new THREE.Vector3();

/**
 * Показать на время действия эти предметы (остальные плавно прячутся); null — убрать всё.
 * motion — поза действия: предметы ориентируются по ладоням в её исходной фазе.
 */
export function showProps(rig: Rig, kinds: readonly PropKind[] | null | undefined, motion?: Motion): void {
  let map = store.get(rig);
  if (!map) store.set(rig, (map = new Map()));
  for (const [k, st] of map) st.want = kinds?.includes(k) ? 1 : 0;
  if (!kinds?.length) return;
  const hands = motion ? handPose(rig, motion, 0) : null;
  for (const k of kinds) {
    let st = map.get(k);
    if (!st) {
      const holder = new THREE.Group();
      holder.add(model(k));
      holder.scale.setScalar(0.001);
      holder.visible = false;
      map.set(k, (st = { obj: holder, want: 1 }));
    }
    const m = MOUNT[k];
    const holder = st.obj;
    const hand = m.at === 'l' ? 'l' : 'r';
    const bone = m.at === 'head' ? rig.head : rig.bones[hand === 'l' ? 'l_hand' : 'r_hand'];
    if (holder.parent !== bone) bone.add(holder);
    const sx = hand === 'l' ? -1 : 1;
    if (m.local || !hands) {
      // В осях кисти (от середины ладони) или головы.
      holder.position.set(m.off[0] * sx, m.off[1], m.off[2]);
      if (m.at !== 'head') holder.position.add(PALM_LOCAL[hand]);
      holder.quaternion.setFromEuler(e.set(m.rot[0], m.rot[1] * sx, m.rot[2] * sx));
      continue;
    }
    // Нужный поворот в осях тела → в осях кисти (в исходной фазе позы).
    const h = hands[hand];
    const inv = h.q.clone().invert();
    qw.setFromEuler(e.set(m.rot[0], m.rot[1] * sx, m.rot[2] * sx));
    holder.quaternion.copy(inv).multiply(qw);
    // Центр — ладонь (или середина между ладонями) плюс сдвиг; из осей тела — в оси кисти.
    off.set(m.off[0] * sx, m.off[1], m.off[2]);
    if (m.at === 'both') off.add(mid.addVectors(hands.l.palm, hands.r.palm).multiplyScalar(0.5).sub(h.palm));
    holder.position.copy(off.applyQuaternion(inv)).add(PALM_LOCAL[hand]);
  }
}

/** Плавное появление и исчезание предметов; t — время (с) для мелкой анимации (пёрышко). */
export function tickProps(rig: Rig, dt: number, t: number): void {
  const map = store.get(rig);
  if (!map) return;
  const k = 1 - Math.exp(-dt * 12);
  for (const [kind, st] of map) {
    const s = st.obj.scale.x + (st.want - st.obj.scale.x) * k;
    st.obj.scale.setScalar(Math.max(0.001, s));
    st.obj.visible = s > 0.03;
    if (kind === 'teaser' && st.obj.visible) {
      const f = st.obj.getObjectByName('feather');
      if (f) f.rotation.set(0.5 * Math.sin(t * 7), 0, 0.4 * Math.sin(t * 5.3));
    }
  }
}
