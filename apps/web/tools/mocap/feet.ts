import * as THREE from 'three';

/**
 * Чистка стоп (офлайн): опорная стопа не скользит и стоит на полу.
 *
 * Опора стопы делится по наклону: пока носок поднят (постановка) — стопа поворачивается
 * вокруг пятки, пока пятка поднята (перекат) — вокруг подушечки, плоская — лежит ровно.
 * Для каждого интервала опоры находится одна точка постановки (где стоял бы голеностоп
 * плоской стопы), пятка и подушечка от неё — неподвижны в мире, голеностоп выводится из
 * них и поворота стопы. Плоская стопа — без поворота (как в покое), пальцы, пока на полу, —
 * тоже. Поправки плавно гаснут за fade кадров в переносе, чтобы не было рывков.
 *
 * Кадры — замкнутый цикл: опора, проходящая через шов, — один интервал (за швом мир
 * сдвинут ещё на stride).
 */

export interface FootGeo {
  /** Голеностоп плоской стопы над полом. */
  ankleY: number;
  /** От голеностопа до точки пятки на полу и до сустава подушечки (покой). */
  heel: THREE.Vector3;
  ball: THREE.Vector3;
}

/** Кадр в мировых поворотах костей: таз, голеностопы. */
export interface RawFrame {
  world: THREE.Quaternion[];
  root: THREE.Vector3;
  feet: [THREE.Vector3, THREE.Vector3];
}

export interface FootFlags {
  /** Голеностоп неподвижен (пятка или вся стопа на полу). */
  ank: boolean[];
  /** Подушечка неподвижна. */
  toe: boolean[];
}

const ss = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

const FWD = new THREE.Vector3(0, 0, 1);
/** Подъём пятки стопы с поворотом q (рад, + — пятка вверх). */
export const heelUp = (q: THREE.Quaternion): number => -Math.asin(Math.max(-1, Math.min(1, FWD.clone().applyQuaternion(q).y)));

const mod = (k: number, n: number): number => ((k % n) + n) % n;

/** Вес «рядом с отмеченным кадром» (по кругу): 1 в нём, гаснет за fade кадров. */
function near(flags: readonly boolean[], fade: number): number[] {
  const n = flags.length;
  return flags.map((_, k) => {
    for (let d = 0; d <= fade; d += 1) if (flags[mod(k - d, n)] || flags[mod(k + d, n)]) return 1 - ss(d / (fade + 1));
    return 0;
  });
}

/**
 * Замкнутый цикл из n кадров; мир = клип + (0, 0, stride · k / n). foot/toe — номера
 * костей стоп и пальцев [левая, правая] в world.
 */
export function lockFeet(frames: RawFrame[], flags: [FootFlags, FootFlags], stride: number, geo: FootGeo, foot: [number, number], toe: [number, number], fade = 3): void {
  const id = new THREE.Quaternion();
  const n = frames.length;
  for (const side of [0, 1] as const) {
    const fl = flags[side];
    const fi = foot[side];
    const ti = toe[side];
    const stance = fl.ank.map((a, k) => a || fl.toe[k]!);
    // Повороты: почти плоская опорная стопа (наклон до 2…5°) — ровно, пальцы на полу — ровно.
    const wf = frames.map((f, k) => (stance[k] ? 1 - ss((Math.abs(heelUp(f.world[fi]!)) - 0.035) / 0.05) : 0));
    const wt = near(fl.toe, fade);
    frames.forEach((f, k) => {
      f.world[fi]!.slerp(id, wf[k]!);
      f.world[ti]!.slerp(id, wt[k]!);
    });
    const ball = (k: number): number => ss((heelUp(frames[k]!.world[fi]!) + 0.03) / 0.06);
    const delta = frames.map(() => new THREE.Vector3());
    const has = new Array<boolean>(n).fill(false);
    if (stance.every(Boolean)) stance.fill(true);
    // Начало обхода — кадр переноса (иначе опора, идущая через шов, разрежется).
    const start = stance.indexOf(false);
    for (let s = 0; s < n; ) {
      const a = start < 0 ? 0 : mod(start + s, n);
      if (start >= 0 && !stance[a]) {
        s += 1;
        continue;
      }
      // Интервал опоры: кадры idx и их сдвиг мира.
      const idx: number[] = [];
      while (s < n && (start < 0 || stance[mod(start + s, n)])) {
        idx.push(start < 0 ? s : mod(start + s, n));
        s += 1;
      }
      const shift = (k: number, j: number): number => (stride * k) / n + (j > 0 && k < idx[0]! ? stride : 0);
      const anchor = new THREE.Vector3();
      idx.forEach((k, j) => {
        const R = frames[k]!.world[fi]!;
        const at = frames[k]!.feet[side].clone();
        at.z += shift(k, j);
        const viaHeel = at.clone().add(geo.heel.clone().applyQuaternion(R)).sub(geo.heel);
        const viaBall = at.clone().add(geo.ball.clone().applyQuaternion(R)).sub(geo.ball);
        anchor.add(viaHeel.lerp(viaBall, ball(k)));
      });
      anchor.divideScalar(idx.length);
      anchor.y = geo.ankleY;
      const H = anchor.clone().add(geo.heel);
      const B = anchor.clone().add(geo.ball);
      idx.forEach((k, j) => {
        const R = frames[k]!.world[fi]!;
        const locked = H.clone().sub(geo.heel.clone().applyQuaternion(R)).lerp(B.clone().sub(geo.ball.clone().applyQuaternion(R)), ball(k));
        locked.z -= shift(k, j);
        delta[k]!.subVectors(locked, frames[k]!.feet[side]);
        has[k] = true;
      });
    }
    // В переносе поправка гаснет от ближайших кадров опоры (по кругу).
    const fadeIn = delta.map((d) => d.clone());
    for (let k = 0; k < n; k += 1) {
      if (has[k]) continue;
      const acc = new THREE.Vector3();
      let back = false;
      let fwd = false;
      for (let d = 1; d <= fade; d += 1) {
        const g = 1 - ss(d / (fade + 1));
        const kb = mod(k - d, n);
        const kf = mod(k + d, n);
        if (!back && has[kb]) {
          acc.addScaledVector(delta[kb]!, g);
          back = true;
        }
        if (!fwd && has[kf]) {
          acc.addScaledVector(delta[kf]!, g);
          fwd = true;
        }
      }
      fadeIn[k]!.copy(acc);
    }
    frames.forEach((f, k) => {
      f.feet[side].add(fadeIn[k]!);
      // Ничто не уходит под пол; в воздухе стопа хотя бы на CLEAR над полом (у нашей стопы
      // пятка ниже, чем у актёра, и перед постановкой иначе чиркала бы по полу).
      const clear = has[k] ? 0 : CLEAR;
      f.feet[side].y -= Math.min(0, lowest(f, side, fi, ti, geo) - clear);
    });
  }
}

/** Зазор под стопой в воздухе (м модели). */
const CLEAR = 0.006;
const SOLE = new THREE.Vector3(0, -0.03, 0);
const TIP = new THREE.Vector3(0, -0.03, 0.085);
/** Самая низкая точка стопы (пятка, подушечка, кончики пальцев) над полом. */
export function lowest(f: RawFrame, side: 0 | 1, fi: number, ti: number, geo: FootGeo): number {
  const a = f.feet[side];
  const R = f.world[fi]!;
  const heel = a.y + geo.heel.clone().applyQuaternion(R).y;
  const ball = geo.ball.clone().applyQuaternion(R);
  const sole = a.y + ball.y + SOLE.clone().applyQuaternion(R).y;
  const tip = a.y + ball.y + TIP.clone().applyQuaternion(f.world[ti]!).y;
  return Math.min(heel, sole, tip);
}
