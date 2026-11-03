import * as THREE from 'three';
import type { Figure } from '../../../game/state';

/**
 * Размеры фигуры. Персонаж смотрит на +Z, ноги на y = 0, рост ≈ 2,3.
 * Пропорции близки к человеческим: голова — около 1/5 роста, длинные ноги, руки до середины бедра.
 */
export const TORSO_Y = 1.16;
/** Голова строится в собственных координатах вокруг HEAD_Y и крепится к шее в точке NECK_Y. */
export const HEAD_Y = 1.9;
export const HEAD_R = 0.27;
/** Приближение черепа эллипсоидом (для головных уборов): ширина, высота, глубина относительно HEAD_R. */
export const HEAD_SCALE = new THREE.Vector3(0.74, 1.06, 0.92);
export const NECK_Y = 1.68;
/** Масштаб головы относительно тела. */
export const HEAD_GROW = 0.76;
/** Где на теле находится шарнир шеи. */
export const NECK_WORLD = TORSO_Y + 0.71;
/** Центр головы в координатах сцены (для камеры портрета). */
export const HEAD_CENTER_WORLD = NECK_WORLD + (HEAD_Y - NECK_Y) * HEAD_GROW;

export interface BodyShape {
  figure: Figure;
  /** Плечо, локоть и запястье руки с x > 0; вторая — зеркально. */
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  foreR: number;
  hand: number;
  legX: number;
  calfR: number;
  neckR: number;
  foot: number;
}

const MALE: BodyShape = {
  figure: 'male',
  shoulder: new THREE.Vector3(0.37, TORSO_Y + 0.52, 0),
  elbow: new THREE.Vector3(0.45, TORSO_Y + 0.13, -0.03),
  wrist: new THREE.Vector3(0.5, TORSO_Y - 0.24, 0.05),
  foreR: 0.073,
  hand: 1,
  legX: 0.15,
  calfR: 0.085,
  neckR: 0.082,
  foot: 1,
};

const FEMALE: BodyShape = {
  figure: 'female',
  shoulder: new THREE.Vector3(0.315, TORSO_Y + 0.505, 0),
  elbow: new THREE.Vector3(0.39, TORSO_Y + 0.14, -0.03),
  wrist: new THREE.Vector3(0.44, TORSO_Y - 0.22, 0.05),
  foreR: 0.058,
  hand: 0.86,
  legX: 0.152,
  calfR: 0.08,
  neckR: 0.066,
  foot: 0.88,
};

export const bodyShape = (figure: Figure): BodyShape => (figure === 'female' ? FEMALE : MALE);
