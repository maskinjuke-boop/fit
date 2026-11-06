import * as THREE from 'three';

/**
 * Чтение BVH (иерархия + кадры) и прямая кинематика: мировые положения и повороты
 * суставов в каждом кадре. Только для офлайн-конвейера клипов (tools/mocap/build.ts).
 */

export interface BvhJoint {
  name: string;
  /** Индекс родителя (−1 у корня). */
  parent: number;
  offset: THREE.Vector3;
  /** Каналы по порядку из файла: Xposition…, Zrotation… */
  channels: string[];
  /** Номер первого канала сустава в строке кадра. */
  chan: number;
  /** Конец цепочки (End Site) — смещение в осях сустава, если есть. */
  end: THREE.Vector3 | null;
}

export interface Bvh {
  joints: BvhJoint[];
  /** Значения каналов: frames[i] — строка кадра i. */
  frames: Float32Array[];
  /** Длительность кадра, с. */
  dt: number;
}

export function parseBvh(text: string): Bvh {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const next = (): string => {
    const s = tok[i++];
    if (s === undefined) throw new Error('BVH: неожиданный конец файла');
    return s;
  };
  const num = (): number => {
    const s = next();
    const x = Number(s);
    if (!Number.isFinite(x)) throw new Error(`BVH: ожидалось число, получено «${s}»`);
    return x;
  };
  const expect = (s: string): void => {
    const got = next();
    if (got !== s) throw new Error(`BVH: ожидалось «${s}», получено «${got}»`);
  };
  const joints: BvhJoint[] = [];
  let chans = 0;
  const readJoint = (parent: number): void => {
    const name = next();
    expect('{');
    const j: BvhJoint = { name, parent, offset: new THREE.Vector3(), channels: [], chan: chans, end: null };
    const id = joints.length;
    joints.push(j);
    for (;;) {
      const key = next();
      if (key === 'OFFSET') j.offset.set(num(), num(), num());
      else if (key === 'CHANNELS') {
        const n = num();
        for (let k = 0; k < n; k += 1) j.channels.push(next());
        chans += n;
      } else if (key === 'JOINT') readJoint(id);
      else if (key === 'End') {
        expect('Site');
        expect('{');
        expect('OFFSET');
        j.end = new THREE.Vector3(num(), num(), num());
        expect('}');
      } else if (key === '}') return;
      else throw new Error(`BVH: неизвестное слово «${key}»`);
    }
  };
  expect('HIERARCHY');
  expect('ROOT');
  readJoint(-1);
  expect('MOTION');
  expect('Frames:');
  const n = num();
  expect('Frame');
  expect('Time:');
  const dt = num();
  const frames: Float32Array[] = [];
  for (let f = 0; f < n; f += 1) {
    const row = new Float32Array(chans);
    for (let c = 0; c < chans; c += 1) row[c] = num();
    frames.push(row);
  }
  return { joints, frames, dt };
}

const AXIS: Record<string, THREE.Vector3> = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };

/** Мировая поза кадра: положения и повороты суставов (единицы файла). */
export interface BvhPose {
  pos: THREE.Vector3[];
  rot: THREE.Quaternion[];
}

/**
 * Прямая кинематика кадра f. Повороты каналов применяются в порядке файла
 * (Z Y X → R = Rz·Ry·Rx), положение корня — каналы плюс OFFSET.
 */
export function bvhPose(bvh: Bvh, f: number): BvhPose {
  const row = bvh.frames[f]!;
  const pos: THREE.Vector3[] = [];
  const rot: THREE.Quaternion[] = [];
  const q = new THREE.Quaternion();
  bvh.joints.forEach((j, id) => {
    const local = new THREE.Quaternion();
    const tr = new THREE.Vector3();
    j.channels.forEach((c, k) => {
      const x = row[j.chan + k]!;
      const axis = c[0]!;
      if (c.endsWith('position')) tr.setComponent('XYZ'.indexOf(axis), x);
      else local.multiply(q.setFromAxisAngle(AXIS[axis]!, (x * Math.PI) / 180));
    });
    if (j.parent < 0) {
      pos[id] = j.offset.clone().add(tr);
      rot[id] = local;
    } else {
      pos[id] = j.offset.clone().applyQuaternion(rot[j.parent]!).add(pos[j.parent]!);
      rot[id] = rot[j.parent]!.clone().multiply(local);
    }
  });
  return { pos, rot };
}

export const jointIndex = (bvh: Bvh, name: string): number => {
  const i = bvh.joints.findIndex((j) => j.name === name);
  if (i < 0) throw new Error(`BVH: нет сустава ${name}`);
  return i;
};
