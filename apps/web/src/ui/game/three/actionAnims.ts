import type { PropKind } from './props3d';
import type { Motion } from './rig';

/**
 * Как герой выполняет действие у предмета: какая поза и где встать.
 * - front — у места использования лицом к предмету;
 * - spot — в точке предмета at (в его координатах), лицом по face (0 — как смотрит предмет);
 *   y — высота (кровать, ванна), для поз сидя и лёжа;
 * - cat — присесть рядом с кошкой;
 * - here — там, где стоит (позвать кошку).
 */
export interface ActionAnim {
  motion: Motion;
  place: 'front' | 'spot' | 'cat' | 'here';
  at?: [number, number];
  y?: number;
  face?: number;
  /** Длительность анимации до результата (мс). */
  ms?: number;
  /** Предметы в руках (или на голове) на время действия. */
  prop?: PropKind[];
}

const PI = Math.PI;
const front = (motion: Motion, prop?: PropKind[], ms?: number): ActionAnim => ({ motion, place: 'front', ms, prop });
const spot = (motion: Motion, at: [number, number], face = 0, y = 0, ms?: number, prop?: PropKind[]): ActionAnim => ({ motion, place: 'spot', at, face, y, ms, prop });

export const ACTION_ANIMS: Record<string, ActionAnim> = {
  sleep: spot('lie:sleep', [0, 0.95], 0, 0.71, 3600),
  nap: spot('lie:sleep', [0, 0.95], 0, 0.71, 3000),
  snack: front('stand:eat', ['sandwich']),
  groceries: front('stand:text', ['phone']),
  order: front('stand:text', ['phone']),
  cook: front('stand:cook', ['spatula'], 3000),
  cook_fit: front('stand:cook', ['spatula'], 3200),
  shower: spot('stand:wash', [0, 0], PI / 2, 0.12, 3000),
  tv: spot('sit:tv', [0, 0.45], 0, 0, 3000, ['remote']),
  relax: spot('sit:relax', [0, 0.45], 0),
  call: spot('sit:phone', [0, 0.45], 0, 0, 2800, ['phone_ear']),
  pose: front('stand:talk'),
  consult: spot('sit:type', [0, 0.2], PI),
  study: spot('sit:type', [0, 0.2], PI),
  games: spot('sit:type', [0, 0.2], PI),
  read: front('stand:read', ['book']),
  espresso: front('stand:drink', ['cup']),
  console: front('stand:game', ['gamepad']),
  piano: spot('sit:piano', [0, 0.45], PI),
  bath: spot('sit:relax', [0, 0.15], 0, -0.3, 3000),
  fish: front('stand:watch'),
  paint: front('stand:paint', ['brush', 'palette']),
  plan: front('stand:write', ['notepad', 'pen']),
  armchair_read: spot('sit:read', [0, 0.52], 0, 0, 3000, ['book']),
  massage: spot('sit:massage', [0, 0.55], 0, 0.05, 3000),
  boxing: front('stand:box', ['glove_l', 'glove_r']),
  cinema: spot('sit:eat', [0, 0.95], PI, -0.12, 3200, ['popcorn']),
  dance: front('stand:dance'),
  shake: front('stand:drink', ['shaker']),
  microwave_meal: front('stand:eat', ['plate', 'fork']),
  vr: spot('stand:vr', [0, 0.45], 0, 0, 3000, ['vr', 'vr_l', 'vr_r']),
  pet_cat: { motion: 'crouch:pet', place: 'cat', ms: 3000 },
  play_cat: { motion: 'crouch:play', place: 'cat', ms: 3400, prop: ['teaser'] },
  feed_cat: { motion: 'crouch:feed', place: 'cat', ms: 2800, prop: ['treat'] },
  call_cat: { motion: 'crouch:call', place: 'here', ms: 2600 },
  fill_bowl: front('crouch:pour', ['foodbag'], 2800),
  clean_litter: front('crouch:scoop', ['scoop'], 3000),
  // Зал.
  gym_shower: spot('stand:wash', [0.45, 0], PI / 2, 0, 2600),
  smoothie: front('stand:drink', ['shaker']),
  salad: front('stand:eat', ['plate', 'fork']),
  ads: front('stand:talk', ['flyers']),
  chat_clients: spot('stand:talk', [0, 0], 0, 0, 3000),
  // Между делами (без игрового времени): потянуться, оглядеться, размять руки, погладить кошку.
  free_stretch: { motion: 'stand:stretch', place: 'here', ms: 3200 },
  free_look: { motion: 'stand:watch', place: 'here', ms: 3400 },
  free_circles: { motion: 'stand:circles', place: 'here', ms: 3000 },
  free_pet: { motion: 'crouch:pet', place: 'cat', ms: 2600 },
};

export const animFor = (action: string): ActionAnim | undefined => ACTION_ANIMS[action];
