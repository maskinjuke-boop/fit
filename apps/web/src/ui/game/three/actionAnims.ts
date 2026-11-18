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
  // Кафе.
  flyers: front('stand:talk', ['flyers']),
  post: front('stand:text', ['phone']),
  chat_guests: spot('sit:phone', [0, 0.45], 0, 0, 3000),
  relax: spot('sit:relax', [0, 0.45], 0),
  read: front('stand:read', ['book']),
  console: front('stand:game', ['gamepad']),
  piano: spot('sit:piano', [0, 0.45], PI),
  fish: front('stand:watch'),
  paint: front('stand:paint', ['brush', 'palette']),
  armchair: spot('sit:read', [0, 0.52], 0, 0, 3000, ['book']),
  cinema: spot('sit:tv', [0, 0.95], PI, -0.12, 3200, ['remote']),
  dance: front('stand:dance'),
  pet_cat: { motion: 'crouch:pet', place: 'cat', ms: 3000 },
  play_cat: { motion: 'crouch:play', place: 'cat', ms: 3400, prop: ['teaser'] },
  feed_cat: { motion: 'crouch:feed', place: 'cat', ms: 2800, prop: ['treat'] },
  call_cat: { motion: 'crouch:call', place: 'here', ms: 2600 },
  fill_bowl: front('crouch:pour', ['foodbag'], 2800),
  clean_litter: front('crouch:scoop', ['scoop'], 3000),
  // Лавка демона.
  comfort_cat: front('crouch:pet', undefined, 2600),
  // Между делами (без игрового времени): потянуться, оглядеться, размять руки, погладить кошку.
  free_stretch: { motion: 'stand:stretch', place: 'here', ms: 3200 },
  free_look: { motion: 'stand:watch', place: 'here', ms: 3400 },
  free_circles: { motion: 'stand:circles', place: 'here', ms: 3000 },
  free_pet: { motion: 'crouch:pet', place: 'cat', ms: 2600 },
};

export const animFor = (action: string): ActionAnim | undefined => ACTION_ANIMS[action];
