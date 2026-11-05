import type { Motion } from './rig';

/**
 * Как герой выполняет действие у предмета: какая поза и где встать.
 * - front — у места использования лицом к предмету;
 * - spot — в точке предмета at (в его координатах), лицом по face (0 — как смотрит предмет);
 *   y — высота (кровать, ванна), для поз сидя и лёжа;
 * - cat — присесть рядом с кошкой.
 */
export interface ActionAnim {
  motion: Motion;
  place: 'front' | 'spot' | 'cat';
  at?: [number, number];
  y?: number;
  face?: number;
  /** Длительность анимации до результата (мс). */
  ms?: number;
}

const PI = Math.PI;
const front = (motion: Motion, ms?: number): ActionAnim => ({ motion, place: 'front', ms });
const spot = (motion: Motion, at: [number, number], face = 0, y = 0, ms?: number): ActionAnim => ({ motion, place: 'spot', at, face, y, ms });

export const ACTION_ANIMS: Record<string, ActionAnim> = {
  sleep: spot('lie:sleep', [0, 0.95], 0, 0.71, 3600),
  nap: spot('lie:sleep', [0, 0.95], 0, 0.71, 3000),
  snack: front('stand:eat'),
  groceries: front('stand:phone'),
  order: front('stand:phone'),
  cook: front('stand:cook', 3000),
  cook_fit: front('stand:cook', 3200),
  shower: spot('stand:wash', [0, 0], PI / 2, 0.12, 3000),
  tv: spot('sit:relax', [0, 0.45], 0),
  relax: spot('sit:relax', [0, 0.45], 0),
  call: spot('sit:phone', [0, 0.45], 0),
  pose: front('stand:talk'),
  consult: spot('sit:type', [0, 0.2], PI),
  study: spot('sit:type', [0, 0.2], PI),
  games: spot('sit:game', [0, 0.2], PI),
  read: front('stand:read'),
  espresso: front('stand:drink'),
  console: front('stand:game'),
  piano: spot('sit:piano', [0, 0.45], PI),
  bath: spot('sit:relax', [0, 0.15], 0, -0.3, 3000),
  fish: front('stand:none'),
  paint: front('stand:paint'),
  plan: front('stand:paint'),
  armchair_read: spot('sit:read', [0, 0.52], 0),
  massage: spot('sit:massage', [0, 0.55], 0, 0.05, 3000),
  boxing: front('stand:box'),
  cinema: spot('sit:relax', [0, 0.95], PI, -0.12, 3200),
  dance: front('stand:dance'),
  shake: front('stand:drink'),
  microwave_meal: front('stand:eat'),
  vr: spot('stand:vr', [0, 0.45], 0, 0, 3000),
  pet_cat: { motion: 'crouch:pet', place: 'cat' },
  play_cat: { motion: 'crouch:play', place: 'cat', ms: 3000 },
  feed_cat: { motion: 'crouch:pet', place: 'cat' },
  // Зал.
  gym_shower: spot('stand:wash', [0.45, 0], PI / 2, 0, 2600),
  smoothie: front('stand:drink'),
  salad: front('stand:eat'),
  ads: front('stand:talk'),
};

export const animFor = (action: string): ActionAnim | undefined => ACTION_ANIMS[action];
