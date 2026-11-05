import { useId, type ReactNode } from 'react';
import { itemById, type Slot } from '../../game/items';
import { DEFAULT_APPEARANCE, type Appearance, type HairStyle } from '../../game/state';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from './palette';

/**
 * Портрет персонажа: человек по пояс в круглой рамке. Внешность (кожа, волосы, борода)
 * и головной убор рисуются слоями: тело — лицо — волосы — головной убор. Это запасная
 * картинка на случай, когда 3D недоступен; весь арт оригинальный, векторный.
 */

export { HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from './palette';

/** Затемнение (k < 1) или осветление (k > 1) цвета #rrggbb. */
function tone(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number): number => {
    const v = (n >> shift) & 255;
    const out = k < 1 ? v * k : v + (255 - v) * (k - 1);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

interface Props {
  color: string;
  appearance?: Appearance;
  equipped?: Partial<Record<Slot, string>>;
  size?: number;
  level?: number;
}

export function Avatar({ color, appearance = DEFAULT_APPEARANCE, equipped = {}, size = 96, level }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string): string => `${name}-${uid}`;
  const url = (name: string): string => `url(#${id(name)})`;

  const skin = SKIN_TONES[appearance.skin] ?? SKIN_TONES[1];
  const hair = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
  const shirt = tone(color, 0.62);
  const head = equipped.head;
  const female = appearance.figure === 'female';
  // Цвет верха — по надетой вещи (если для неё задан), иначе — тон цвета героя.
  const shirtFill = equipped.body ? BODY_TINT[equipped.body] : undefined;

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" className="avatar">
      <defs>
        <clipPath id={id('clip')}>
          <circle cx="100" cy="100" r="95" />
        </clipPath>
        <radialGradient id={id('bg')} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={tone(color, 0.55)} />
          <stop offset="100%" stopColor="#121418" />
        </radialGradient>
        <linearGradient id={id('skin')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tone(skin.base, 1.06)} />
          <stop offset="70%" stopColor={skin.base} />
          <stop offset="100%" stopColor={skin.shade} />
        </linearGradient>
        <linearGradient id={id('neck')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone(skin.shade, 0.85)} />
          <stop offset="45%" stopColor={skin.shade} />
          <stop offset="100%" stopColor={skin.base} />
        </linearGradient>
        <linearGradient id={id('shirt')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone(shirt, 1.25)} />
          <stop offset="100%" stopColor={tone(shirt, 0.8)} />
        </linearGradient>
        <linearGradient id={id('hair')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone(hair, 1.35)} />
          <stop offset="60%" stopColor={hair} />
          <stop offset="100%" stopColor={tone(hair, 0.8)} />
        </linearGradient>
        <ItemDefs id={id} />
      </defs>

      <g clipPath={url('clip')}>
        <rect width="200" height="200" fill={url('bg')} />

        {/* ── За спиной ─────────────────────────────── */}
        {appearance.hair === 'ponytail' && (
          <path d="M118 52 C146 48 156 76 150 108 C147 128 152 146 158 158 C146 160 136 150 134 134 C131 112 136 84 116 66 Z" fill={tone(hair, 0.85)} />
        )}
        {appearance.hair === 'bob' && (
          <path d="M64 92 C60 54 80 34 100 34 C120 34 140 54 136 92 C137 106 138 118 134 128 L66 128 C62 118 63 106 64 92 Z" fill={tone(hair, 0.85)} />
        )}
        {appearance.hair === 'long' && (
          <path
            d="M65 86 C61 50 82 34 100 34 C118 34 139 50 135 86 C136 112 141 138 148 158 C134 165 121 160 117 150 L83 150 C79 160 66 165 52 158 C59 138 64 112 65 86 Z"
            fill={tone(hair, 0.85)}
          />
        )}

        {/* ── Тело ──────────────────────────────────── */}
        <path d={female ? BUST.female : BUST.male} fill={shirtFill ?? url('shirt')} />
        <path d="M84 147 L100 168 L116 147 Q100 155 84 147 Z" fill={skin.shade} />
        <path d="M84 147 L100 168 L116 147" fill="none" stroke={tone(shirtFill ?? shirt, 0.7)} strokeWidth="2.5" strokeLinejoin="round" />

        {/* ── Шея и голова ──────────────────────────── */}
        <path d="M88 110 L88 146 Q100 154 112 146 L112 110 Z" fill={url('neck')} />
        <ellipse cx="70.5" cy="90" rx="5.5" ry="9.5" fill={skin.base} />
        <ellipse cx="71" cy="90.5" rx="2.6" ry="5.5" fill={skin.shade} />
        <ellipse cx="129.5" cy="90" rx="5.5" ry="9.5" fill={skin.base} />
        <ellipse cx="129" cy="90.5" rx="2.6" ry="5.5" fill={skin.shade} />
        <path
          d={
            female
              ? 'M72 82 C72 56 85 43 100 43 C115 43 128 56 128 82 C128 100 121 114 111 121 C107 124.5 103 126 100 126 C97 126 93 124.5 89 121 C79 114 72 100 72 82 Z'
              : 'M71 82 C71 56 84 43 100 43 C116 43 129 56 129 82 C129 101 122 117 111 124 C107 127 103 128 100 128 C97 128 93 127 89 124 C78 117 71 101 71 82 Z'
          }
          fill={url('skin')}
        />
        <Face skinShade={skin.shade} hair={hair} female={female} iris={EYE_COLORS[appearance.eyes ?? 0] ?? EYE_COLORS[0]} />
        {appearance.beard && !female && <Beard hair={hair} />}

        {/* ── Волосы и головной убор ────────────────── */}
        <HairFront style={appearance.hair} fill={url('hair')} color={hair} covered={head !== undefined && HATS.includes(head)} />
        {headItem(head, url, color)}
      </g>

      <circle cx="100" cy="100" r="95" fill="none" stroke={color} strokeWidth="5" />
      {level !== undefined && (
        <g>
          <circle cx="34" cy="34" r="24" fill="#0f1114" stroke={color} strokeWidth="4" />
          <text x="34" y="43" textAnchor="middle" fontSize="26" fontWeight="800" fill="#f2f3f5" fontFamily="system-ui, sans-serif">
            {level}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Градиенты металла для украшений на голове. */
function ItemDefs({ id }: { id: (name: string) => string }) {
  return (
    <>
      <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff1b8" />
        <stop offset="45%" stopColor="#e7b442" />
        <stop offset="100%" stopColor="#a8741c" />
      </linearGradient>
      <linearGradient id={id('silver')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#cfd6de" />
        <stop offset="100%" stopColor="#8e98a3" />
      </linearGradient>
    </>
  );
}

/** Цвет верха на портрете для вещей с собственным цветом. */
const BODY_TINT: Record<string, string> = {
  tank_top: '#f2f3f5',
  button_shirt: '#f4f6fa',
  denim_crop: '#3b5a85',
  tracksuit: '#1d2a5a',
  kimono: '#f6f4ef',
  latex_catsuit: '#111114',
  latex_corset: '#111114',
  velvet_bodysuit: '#5b0f2e',
  sports_bra: '#22252b',
  mesh_top: '#111114',
  leather_harness: '#1d1a1a',
  bandeau_top: '#16161a',
  gold_bikini: '#e8b84a',
  diamond_bikini: '#dfe6ee',
};

/** Значок слота для вещей без своего значка. */
const SLOT_GLYPH: Record<Slot, string> = { head: '🧢', neck: '📿', body: '👕', back: '🎒', hands: '⌚', legs: '👖', feet: '👟', weapon: '📱', offhand: '👜' };

/** Значки отдельных вещей (запасная картинка, пока не готова 3D-иконка). */
const ITEM_GLYPH: Record<string, string> = {
  sunglasses: '🕶️',
  headphones: '🎧',
  neck_headphones: '🎧',
  cowboy_hat: '🤠',
  beanie: '🧶',
  devil_horns: '😈',
  angel_halo: '😇',
  masquerade_mask: '🎭',
  lace_veil: '👰',
  silver_tiara: '👑',
  cat_ears: '🐱',
  bunny_ears: '🐰',
  pearl_necklace: '📿',
  marathon_medal: '🏅',
  diamond_necklace: '💎',
  lanyard_badge: '🪪',
  silk_scarf: '🧣',
  feather_boa: '🪶',
  string_bikini_top: '👙',
  chain_bikini: '👙',
  gold_bikini: '👙',
  diamond_bikini: '👙',
  swimsuit: '🩱',
  kimono: '🥋',
  hoodie: '🧥',
  button_shirt: '👔',
  bikini_bottom: '👙',
  gym_shorts: '🩳',
  denim_micro_shorts: '🩳',
  hot_pants: '🩳',
  mini_skirt: '👗',
  pleated_skirt: '👗',
  pencil_skirt: '👗',
  sequin_skirt: '👗',
  silk_sarong: '👗',
  fishnet_stockings: '🧦',
  lace_garters: '🧦',
  house_slippers: '🩴',
  flip_flops: '🩴',
  sandals: '👡',
  gold_sandals: '👡',
  high_heels: '👠',
  designer_heels: '👠',
  knee_boots: '👢',
  suede_thigh_boots: '👢',
  latex_thigh_boots: '👢',
  chelsea_boots: '🥾',
  combat_boots: '🥾',
  running_shoes: '👟',
  fingerless_gloves: '🧤',
  boxing_wraps: '🥊',
  lace_gloves: '🧤',
  silk_opera_gloves: '🧤',
  latex_opera_gloves: '🧤',
  wrist_watch: '⌚',
  diamond_bracelet: '💎',
  gold_bracelets: '💍',
  fairy_wings: '🧚',
  bat_wings: '🦇',
  feather_wings: '🪽',
  angel_wings: '🪽',
  guitar_case: '🎸',
  denim_jacket: '🧥',
  leather_jacket: '🧥',
  rolled_mat: '🧘',
  coffee_cup: '☕',
  water_bottle: '💧',
  dumbbell: '🏋️',
  shaker: '🥤',
  umbrella: '☂️',
  tennis_racket: '🎾',
  kettlebell: '🏋️',
  flower_bouquet: '💐',
  skateboard: '🛹',
  acoustic_guitar: '🎸',
  microphone: '🎤',
  champagne_glass: '🥂',
  gold_trophy: '🏆',
  grocery_bag: '🛍️',
  tote_bag: '👜',
  yoga_mat: '🧘',
  gym_bag: '💼',
  handbag: '👜',
  briefcase: '💼',
  clutch: '👛',
  picnic_basket: '🧺',
  boutique_bags: '🛍️',
  designer_bag: '👜',
};

/** Иконка предмета без персонажа (запасная картинка для магазина и сумки): значок вещи или слота. */
export function ItemIcon({ itemId, color, size = 72 }: { itemId: string; color: string; size?: number }) {
  const item = itemById(itemId);
  if (!item) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" className="item-icon">
      <circle cx="50" cy="50" r="40" fill={color} opacity="0.18" />
      <text x="50" y="64" fontSize="42" textAnchor="middle">
        {ITEM_GLYPH[itemId] ?? SLOT_GLYPH[item.slot]}
      </text>
    </svg>
  );
}

function Face({ skinShade, hair, female, iris }: { skinShade: string; hair: string; female: boolean; iris: string }) {
  const brow = tone(hair, 0.85);
  if (female) return <FemaleFace skinShade={skinShade} brow={brow} iris={iris} />;
  const eye = (cx: number): ReactNode => (
    <g>
      <ellipse cx={cx} cy="89" rx="6.4" ry="4.1" fill="#fbfaf8" />
      <circle cx={cx + 0.6} cy="89.4" r="3.3" fill={iris} />
      <circle cx={cx + 0.6} cy="89.4" r="1.6" fill="#120c09" />
      <circle cx={cx + 1.7} cy="88.2" r="1" fill="#ffffff" />
    </g>
  );
  return (
    <g>
      {/* лёгкая тень по краю лица и щёки */}
      <ellipse cx="84" cy="104" rx="6.5" ry="3.6" fill="#ff7b6b" opacity="0.14" />
      <ellipse cx="116" cy="104" rx="6.5" ry="3.6" fill="#ff7b6b" opacity="0.14" />
      {eye(88)}
      {eye(112)}
      <path d="M81.3 88 Q88 82.6 94.7 88" fill="none" stroke="#2a1d17" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M105.3 88 Q112 82.6 118.7 88" fill="none" stroke="#2a1d17" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M80.5 80.5 Q87 76.5 95 79.5" fill="none" stroke={brow} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M105 79.5 Q113 76.5 119.5 80.5" fill="none" stroke={brow} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M99 92 Q96.6 101.5 98.2 105.5" fill="none" stroke={skinShade} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M95.8 106.6 Q100 109.2 104.2 106.6" fill="none" stroke={skinShade} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M92.6 114.6 Q100 118.6 107.4 114.6" fill="none" stroke="#9c5547" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M95.5 118 Q100 119.8 104.5 118" fill="none" stroke="#c97a68" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      <path d="M88 125 Q100 131 112 125" fill="none" stroke={skinShade} strokeWidth="1.2" opacity="0.5" />
    </g>
  );
}

function FemaleFace({ skinShade, brow, iris }: { skinShade: string; brow: string; iris: string }) {
  const eye = (cx: number, side: number): ReactNode => (
    <g>
      <ellipse cx={cx} cy="89" rx="6.8" ry="4.4" fill="#fbfaf8" />
      <circle cx={cx + 0.6} cy="89.4" r="3.5" fill={iris} />
      <circle cx={cx + 0.6} cy="89.4" r="1.7" fill="#120c09" />
      <circle cx={cx + 1.7} cy="88.1" r="1.1" fill="#ffffff" />
      <path d={`M${cx - 7} 88 Q${cx} 82 ${cx + 7} 88`} fill="none" stroke="#1a1210" strokeWidth="2.2" strokeLinecap="round" />
      <path d={`M${cx + 6.5 * side} 87 L${cx + 9.5 * side} 84.5`} stroke="#1a1210" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      <ellipse cx="84" cy="104" rx="6.5" ry="3.6" fill="#ff7b8a" opacity="0.2" />
      <ellipse cx="116" cy="104" rx="6.5" ry="3.6" fill="#ff7b8a" opacity="0.2" />
      {eye(88, -1)}
      {eye(112, 1)}
      <path d="M81 79.5 Q87.5 74.5 95 78" fill="none" stroke={brow} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M105 78 Q112.5 74.5 119 79.5" fill="none" stroke={brow} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M99.2 93 Q97.4 101 98.6 104.5" fill="none" stroke={skinShade} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M93 113.5 Q100 117.5 107 113.5 Q100 120.5 93 113.5 Z" fill="#c25a64" />
      <path d="M94 113.4 Q97 111.6 100 112.8 Q103 111.6 106 113.4" fill="none" stroke="#a8444f" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

function Beard({ hair }: { hair: string }) {
  return (
    <g fill={tone(hair, 0.95)}>
      <path d="M71 92 C72 113 84 131 100 133 C116 131 128 113 129 92 C126 105 120 113 113 115 C108 112.5 92 112.5 87 115 C80 113 74 105 71 92 Z" />
      <path d="M89.5 113 Q100 107.5 110.5 113 Q105 116 100 114 Q95 116 89.5 113 Z" />
      <path d="M96 121 Q100 123 104 121 L103 125 Q100 126 97 125 Z" opacity="0.6" />
    </g>
  );
}

/** Головные уборы, под которыми не виден пучок на макушке. */
const HATS: readonly string[] = ['sports_cap', 'beanie', 'bandana', 'beret', 'cowboy_hat'];

function HairFront({ style, fill, color, covered }: { style: HairStyle; fill: string; color: string; covered: boolean }) {
  const shine = <path d="M84 46 Q100 39 116 46" fill="none" stroke={tone(color, 1.6)} strokeWidth="3" strokeLinecap="round" opacity="0.35" />;
  switch (style) {
    case 'short':
      return (
        <g>
          <path d="M68 92 C64 62 78 36 100 36 C122 36 136 62 132 92 C130 80 128 70 124 64 C116 70 104 68 96 61 C90 68 80 70 76 66 C72 72 70 80 68 92 Z" fill={fill} />
          {shine}
        </g>
      );
    case 'buzz':
      return <path d="M70.5 86 C68 58 82 40 100 40 C118 40 132 58 129.5 86 C127 70 117 58 100 57.5 C83 58 73 70 70.5 86 Z" fill={fill} opacity="0.92" />;
    case 'long':
      return (
        <g>
          <path d="M67 100 C61 62 80 35 102 35 C124 35 139 62 133 100 C131 82 127 67 119 60 C108 66 93 61 86 53 C80 63 72 78 67 100 Z" fill={fill} />
          {shine}
        </g>
      );
    case 'bun':
      return (
        <g>
          {!covered && <circle cx="100" cy="30" r="14" fill={fill} />}
          {!covered && <path d="M88 38 Q100 33 112 38" fill="none" stroke={tone(color, 0.6)} strokeWidth="3" />}
          <path d="M70 86 C67 57 82 39 100 39 C118 39 133 57 130 86 C127 69 117 56 100 55 C83 56 73 69 70 86 Z" fill={fill} />
          {shine}
        </g>
      );
    case 'ponytail':
      return (
        <g>
          <path d="M70 86 C67 57 82 39 100 39 C118 39 133 57 130 86 C127 69 119 58 106 55 C96 58 84 62 78 70 C74 74 72 80 70 86 Z" fill={fill} />
          {!covered && <path d="M128 60 C138 58 142 64 140 70" fill="none" stroke="#d23a4a" strokeWidth="5" strokeLinecap="round" />}
          {shine}
        </g>
      );
    case 'bob':
      return (
        <g>
          <path d="M66 112 C60 66 78 36 100 36 C122 36 140 66 134 112 C131 98 128 82 124 72 C112 74 92 72 80 62 C74 74 70 92 66 112 Z" fill={fill} />
          {shine}
        </g>
      );
    case 'curly':
      return (
        <g fill={fill}>
          {[
            [70, 80, 10],
            [72, 64, 11],
            [80, 51, 12],
            [92, 43, 12],
            [106, 42, 12],
            [119, 49, 12],
            [128, 62, 11],
            [130, 78, 10],
            [86, 58, 9],
            [100, 55, 9],
            [114, 58, 9],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      );
  }
}

// ─── Головные уборы ────────────────────────────────────────────────────

type Url = (name: string) => string;

/** Силуэт плеч и груди на портрете. */
const BUST = {
  female: 'M28 212 C30 176 52 156 84 148 Q100 156 116 148 C148 156 170 176 172 212 Z',
  male: 'M16 212 C18 172 44 152 80 146 Q100 156 120 146 C156 152 182 172 184 212 Z',
};

function headItem(id: string | undefined, url: Url, color: string): ReactNode {
  switch (id) {
    case 'headband':
      return (
        <g>
          <path d="M69 70 Q100 60 131 70 L131 80 Q100 70 69 80 Z" fill={color} />
          <path d="M69 71 Q100 61 131 71 M69 79 Q100 69 131 79" fill="none" stroke="#f2f3f5" strokeWidth="1.5" />
        </g>
      );
    case 'sports_cap':
      return (
        <g>
          <path d="M68 72 C68 46 83 33 100 33 C117 33 132 46 132 72 Q100 64 68 72 Z" fill={color} />
          <path d="M100 34 L100 66" stroke={tone(color, 0.7)} strokeWidth="1.5" />
          <circle cx="100" cy="34" r="3" fill={tone(color, 0.8)} />
          <path d="M66 73 Q100 62 134 73 Q120 84 100 84 Q80 84 66 73 Z" fill={tone(color, 0.75)} />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d="M68 74 C67 46 82 34 100 34 C118 34 133 46 132 74 Z" fill={color} />
          <path d="M66 66 Q100 58 134 66 L134 80 Q100 72 66 80 Z" fill={tone(color, 0.8)} />
          <circle cx="100" cy="30" r="9" fill="#f2f3f5" />
        </g>
      );
    case 'bandana':
      return (
        <g>
          <path d="M68 74 C68 48 82 38 100 38 C118 38 132 48 132 74 Q100 66 68 74 Z" fill={color} />
          <circle cx="86" cy="56" r="2" fill="#ffffff" opacity="0.7" />
          <circle cx="112" cy="50" r="2" fill="#ffffff" opacity="0.7" />
        </g>
      );
    case 'beret':
      return <ellipse cx="104" cy="50" rx="38" ry="14" transform="rotate(-8 104 50)" fill={color} />;
    case 'cowboy_hat':
      return (
        <g>
          <path d="M78 58 C78 30 88 24 100 30 C112 24 122 30 122 58 Z" fill="#8a5a3a" />
          <path d="M44 56 Q60 70 100 66 Q140 70 156 56 Q150 74 100 76 Q50 74 44 56 Z" fill="#6b4428" />
          <path d="M78 56 Q100 60 122 56" stroke="#2a1f1a" strokeWidth="4" fill="none" />
        </g>
      );
    case 'sunglasses':
      return (
        <g>
          <path d="M76 84 L96 84 Q97 98 86 98 Q76 98 76 84 Z M104 84 L124 84 Q124 98 114 98 Q103 98 104 84 Z" fill="#141a24" />
          <path d="M76 84 L124 84 M71 85 L76 84 M124 84 L129 85" stroke={url('gold')} strokeWidth="2" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M66 86 C62 46 80 30 100 30 C120 30 138 46 134 86" fill="none" stroke={color} strokeWidth="6" />
          <rect x="58" y="78" width="14" height="24" rx="6" fill={color} />
          <rect x="128" y="78" width="14" height="24" rx="6" fill={color} />
        </g>
      );
    case 'cat_ears':
    case 'bunny_ears': {
      const cat = id === 'cat_ears';
      return (
        <g>
          <path d="M70 60 Q100 40 130 60" fill="none" stroke={cat ? '#16161a' : '#f6f2ee'} strokeWidth="3" />
          {cat ? (
            <path d="M74 52 L80 26 L94 44 Z M126 52 L120 26 L106 44 Z" fill="#16161a" />
          ) : (
            <path d="M82 46 C74 20 76 4 84 4 C92 4 92 22 90 44 Z M118 46 C126 20 124 4 116 4 C108 4 108 22 110 44 Z" fill="#f6f2ee" />
          )}
          {cat ? <path d="M79 46 L82 34 L89 43 Z M121 46 L118 34 L111 43 Z" fill="#ff8ad8" /> : <path d="M84 40 C80 22 81 10 84 10 C87 10 88 24 87 40 Z M116 40 C120 22 119 10 116 10 C113 10 112 24 113 40 Z" fill="#ffb3cf" />}
        </g>
      );
    }
    case 'devil_horns':
      return <path d="M78 50 C72 38 74 26 80 20 C80 32 86 40 90 46 Z M122 50 C128 38 126 26 120 20 C120 32 114 40 110 46 Z" fill="#c8102e" />;
    case 'angel_halo':
      return <ellipse cx="100" cy="22" rx="26" ry="7" fill="none" stroke="#ffe27a" strokeWidth="4" />;
    case 'masquerade_mask':
      return <path d="M72 80 Q86 74 98 84 Q100 86 102 84 Q114 74 128 80 Q128 96 112 96 Q102 94 100 90 Q98 94 88 96 Q72 96 72 80 Z" fill={color} />;
    case 'lace_veil':
      return <path d="M66 64 Q100 46 134 64 L150 170 L50 170 Z" fill="#f6f2ee" opacity="0.45" />;
    case 'silver_tiara':
      return (
        <g>
          <path d="M70 66 Q100 56 130 66" fill="none" stroke={url('silver')} strokeWidth="4" strokeLinecap="round" />
          <path d="M94 60 L100 40 L106 60 Z M82 63 L85 52 L89 62 Z M111 62 L115 52 L118 63 Z" fill={url('silver')} />
          <path d="M100 50 L104 56 L100 62 L96 56 Z" fill="#ff8ad8" />
        </g>
      );
    default:
      return null;
  }
}
