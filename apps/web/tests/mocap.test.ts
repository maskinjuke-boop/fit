import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bvhPose, parseBvh } from '../tools/mocap/bvh';
import { closeLoop, packClip, type ClipFrame } from '../tools/mocap/clip';
import { decodeClip, gaitKeys, makePose, sampleClip, warpPhase } from '../src/ui/game/three/mocap';
import { CLIPS } from '../src/ui/game/three/mocapClips';
import { animate, BONES, buildRig, gaitFreq } from '../src/ui/game/three/rig';

const BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
  JOINT Leg
  {
    OFFSET 1 0 0
    CHANNELS 3 Zrotation Yrotation Xrotation
    End Site
    {
      OFFSET 0 -2 0
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0083333
0 10 0 0 0 0 0 0 0
5 10 0 0 90 0 0 0 90
`;

const Y = new THREE.Vector3(0, 1, 0);

/** Кадр клипа с одной костью: поворот вокруг Y и смещения. */
const frame = (yaw: number, x = 0): ClipFrame => ({
  q: [new THREE.Quaternion().setFromAxisAngle(Y, yaw)],
  root: new THREE.Vector3(x, 0, 0),
  feet: [new THREE.Vector3(x, 0.1, 0), new THREE.Vector3(-x, 0.1, 0)],
});

describe('BVH', () => {
  it('читает иерархию, каналы и кадры', () => {
    const b = parseBvh(BVH);
    expect(b.joints.map((j) => j.name)).toEqual(['Hips', 'Leg']);
    expect(b.joints[1]!.parent).toBe(0);
    expect(b.joints[1]!.chan).toBe(6);
    expect(b.joints[1]!.end!.y).toBe(-2);
    expect(b.frames.length).toBe(2);
    expect(b.dt).toBeCloseTo(1 / 120, 5);
  });

  it('прямая кинематика: поворот корня переносит дочерний сустав', () => {
    const b = parseBvh(BVH);
    const p0 = bvhPose(b, 0);
    expect(p0.pos[1]!.x).toBeCloseTo(1, 5);
    expect(p0.pos[1]!.y).toBeCloseTo(10, 5);
    // Кадр 1: корень сдвинут на x = 5 и повёрнут на 90° вокруг Y — нога уходит на −Z.
    const p1 = bvhPose(b, 1);
    expect(p1.pos[0]!.x).toBeCloseTo(5, 5);
    expect(p1.pos[1]!.x).toBeCloseTo(5, 5);
    expect(p1.pos[1]!.z).toBeCloseTo(-1, 5);
    // Поворот ноги вокруг X на 90° поверх поворота корня: конец (0, −2, 0) уходит по мировой −X.
    const end = b.joints[1]!.end!.clone().applyQuaternion(p1.rot[1]!);
    expect(end.x).toBeCloseTo(-2, 5);
  });

  it('ошибки формата не проглатываются', () => {
    let error = '';
    try {
      parseBvh('HIERARCHY\nROOT Hips\n{\n OFFSET 0 0 x\n}');
    } catch (e) {
      error = String(e);
    }
    expect(error).toContain('ожидалось число');
  });
});

describe('клипы: упаковка, выборка, цикл', () => {
  it('упаковка и распаковка сохраняют повороты и положения', () => {
    const frames = [frame(0.3, 0.12), frame(-1.2, -0.05)];
    const c = decodeClip({ fps: 30, frames: 2, loop: true, stride: 1, data: packClip(frames) }, 1);
    const q = new THREE.Quaternion().fromArray(c.q, 4);
    expect(q.angleTo(new THREE.Quaternion().setFromAxisAngle(Y, -1.2))).toBeLessThan(1e-3);
    expect(c.pos[0]!).toBeCloseTo(0.12, 4);
    expect(c.pos[9 + 3]!).toBeCloseTo(-0.05, 4);
    expect(c.duration).toBeCloseTo(2 / 30, 6);
  });

  it('выборка: середина между кадрами — сферическая интерполяция, цикл замыкается', () => {
    const frames = [frame(0, 0), frame(0.4, 0.1), frame(0.8, 0.2), frame(1.2, 0.3)];
    const c = decodeClip({ fps: 30, frames: 4, loop: true, stride: 1, data: packClip(frames) }, 1);
    const p = makePose(1);
    sampleClip(c, 1.5 / 4, p);
    expect(new THREE.Quaternion().fromArray(p.q, 0).angleTo(new THREE.Quaternion().setFromAxisAngle(Y, 0.6))).toBeLessThan(1e-3);
    expect(p.pos[0]!).toBeCloseTo(0.15, 4);
    // Фаза 1 = фаза 0, после последнего кадра — к первому.
    sampleClip(c, 1, p);
    expect(p.pos[0]!).toBeCloseTo(0, 4);
    sampleClip(c, 3.5 / 4, p);
    expect(p.pos[0]!).toBeCloseTo(0.15, 4);
    // Однократный клип останавливается на последнем кадре.
    const once = { ...c, loop: false };
    sampleClip(once, 2, p);
    expect(p.pos[0]!).toBeCloseTo(0.3, 4);
  });

  it('closeLoop убирает разрыв шва, а у ноги — только пока она в воздухе', () => {
    // 9 кадров (8 + повтор фазы 0); последний на 0,4 рад «убежал» от первого.
    const raw = Array.from({ length: 9 }, (_, k) => frame(k === 8 ? 0.4 : 0, 0));
    const even = closeLoop(raw);
    expect(even.length).toBe(8);
    // Равномерно: к концу — почти весь разрыв (0,4 · 7/8 в сторону первого кадра).
    const yaw = (q: THREE.Quaternion): number => 2 * Math.atan2(q.y, q.w);
    expect(yaw(even[7]!.q[0]!)).toBeCloseTo(-0.35, 5);
    expect(yaw(even[4]!.q[0]!)).toBeCloseTo(-0.2, 5);
    // С переносом ноги в [0,5; 1]: до 0,5 кадры не тронуты.
    const legRaw = Array.from({ length: 9 }, (_, k) => frame((k / 8) * 0.4, 0));
    const leg = closeLoop(legRaw, [{ bones: [0], swing: [0.5, 1], side: 0 }]);
    expect(yaw(leg[2]!.q[0]!)).toBeCloseTo(0.1, 4);
    expect(yaw(leg[4]!.q[0]!)).toBeCloseTo(0.2, 4);
    // В конце цикла — уже к позе первого кадра.
    expect(Math.abs(yaw(leg[7]!.q[0]!))).toBeLessThan(0.1);
  });

  it('выравнивание походок: события шага совпадают, фаза монотонна', () => {
    const a = { lOff: 0.6, rOn: 0.5, rOff: 0.1 };
    const b = { lOff: 0.55, rOn: 0.45, rOff: 0.05 };
    const [ka, kb] = gaitKeys(a, b);
    expect(ka).toEqual([0, 0.1, 0.5, 0.6, 1]);
    const out = new Float32Array(4);
    // В общей фазе события — смесь событий a и b.
    warpPhase(ka, kb, 0.5, 0.475, out);
    expect(out[0]!).toBeCloseTo(0.5, 5);
    expect(out[1]!).toBeCloseTo(0.45, 5);
    let prev = -1;
    for (let u = 0; u < 1; u += 0.01) {
      warpPhase(ka, kb, 0.3, u, out);
      expect(out[0]!).toBeGreaterThan(prev);
      prev = out[0]!;
    }
    // Разный порядок событий (ходьба и бег) — выравниваются только постановки стоп.
    const [kj] = gaitKeys(a, { lOff: 0.2, rOn: 0.5, rOff: 0.7 });
    expect(kj).toEqual([0, 0.5, 1]);
  });

  it('клипы игры: порядок костей скелета, циклы ходьбы с длиной шага и событиями', () => {
    for (const [name, c] of Object.entries(CLIPS)) {
      const clip = decodeClip(c, BONES.length);
      expect(clip.frames).toBeGreaterThan(10);
      if (name !== 'idle') {
        expect(clip.stride).toBeGreaterThan(1);
        expect(clip.events).toBeTruthy();
      }
    }
    const total = Object.values(CLIPS).reduce((a, c) => a + c.data.length, 0);
    expect(total).toBeLessThan(300 * 1024);
  });
});

describe('ходьба на скелете', () => {
  const rigFor = (figure: 'male' | 'female'): ReturnType<typeof buildRig> => {
    const root = new THREE.Group();
    const torso = new THREE.Group();
    root.add(torso);
    return buildRig(root, torso, new THREE.Group(), figure, null, new Set());
  };

  /**
   * Персонаж идёт со скоростью v, фаза копится по gaitFreq. Пока пятка или подушечка стопы
   * на полу, она не должна сдвигаться (в мире) больше чем на 1 см; ничто не уходит под пол.
   */
  const slide = (figure: 'male' | 'female', v: number): { slip: number; under: number } => {
    const rig = rigFor(figure);
    const heelOff = new THREE.Vector3(0, -0.0934, -0.055);
    const tip = new THREE.Vector3(0, -0.03, 0.085);
    const on: Record<string, THREE.Vector3 | null> = {};
    let slip = 0;
    let under = 0;
    let ph = 0;
    const dt = 1 / 120;
    const p = new THREE.Vector3();
    for (let i = 0; i < 120 * 3; i += 1) {
      const t = i * dt;
      ph = (ph + dt * gaitFreq(rig, v, ph)) % 1;
      animate(rig, 'walk', t, ph, 1, { speed: v });
      rig.root.position.z = v * t;
      rig.root.updateMatrixWorld(true);
      for (const s of ['l', 'r'] as const) {
        const heel = heelOff.clone().applyMatrix4(rig.bones[`${s}_foot`].matrixWorld);
        const ball = rig.bones[`${s}_toe`].getWorldPosition(p).clone();
        under = Math.max(under, -heel.y, -tip.clone().applyMatrix4(rig.bones[`${s}_toe`].matrixWorld).y);
        for (const [k, pt, h] of [[`${s}h`, heel, 0.002], [`${s}b`, ball, 0.032]] as const) {
          if (pt.y < h) {
            const start = (on[k] ??= pt.clone());
            if (t > 0.5) slip = Math.max(slip, Math.hypot(pt.x - start.x, pt.z - start.z));
          } else on[k] = null;
        }
      }
    }
    return { slip, under };
  };

  it('опорная стопа не скользит (< 1 см) на шаге и на бегу', () => {
    for (const [fig, v] of [['female', 1.0], ['female', 1.77], ['female', 3.3], ['male', 1.8], ['male', 3.3]] as const) {
      const r = slide(fig, v);
      expect(r.slip).toBeLessThan(0.01);
      expect(r.under).toBeLessThan(0.005);
    }
  });

  it('переход стойка → шаг → действие плавный, ученики и упражнения работают', () => {
    const rig = rigFor('female');
    animate(rig, 'idle', 0);
    const before = rig.bones.l_thigh.quaternion.clone();
    animate(rig, 'walk', 0.016, 0.3, 0.2, { speed: 1.8 });
    // За кадр с долей 0,2 бедро проходит лишь часть пути.
    const step = before.angleTo(rig.bones.l_thigh.quaternion);
    animate(rig, 'walk', 0.016, 0.3, 1, { speed: 1.8 });
    expect(step).toBeLessThan(before.angleTo(rig.bones.l_thigh.quaternion) * 0.5 + 1e-6);
    for (const m of ['squat', 'pushup', 'sit:read', 'stand:cook', 'lie:sleep', 'crouch:pet'] as const) {
      animate(rig, m, 1, 0.5);
      for (const b of BONES) expect(Number.isFinite(rig.bones[b].quaternion.w)).toBe(true);
    }
  });
});
