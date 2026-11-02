import { useId, type ReactNode } from 'react';
import { itemById, type Slot } from '../../game/items';
import { DEFAULT_APPEARANCE, type Appearance, type HairStyle } from '../../game/state';
import { HAIR_COLORS, SKIN_TONES } from './palette';

/**
 * Портрет персонажа: человек по пояс в круглой рамке. Внешность (кожа, волосы, борода)
 * и надетые предметы рисуются слоями: то, что за спиной, — тело — лицо — волосы —
 * головной убор — то, что в руках спереди. Весь арт оригинальный, векторный.
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
  const body = equipped.body;
  const weapon = equipped.weapon;
  const offhand = equipped.offhand;
  // Под шлемом и капюшоном волосы почти не видны, длинные — видны сзади.
  const hairHidden = head === 'iron_helm';

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
        {bodyBack(body)}
        {headBack(head)}
        {weaponBack(weapon, url)}
        {appearance.hair === 'long' && !hairHidden && (
          <path
            d="M65 86 C61 50 82 34 100 34 C118 34 139 50 135 86 C136 112 141 138 148 158 C134 165 121 160 117 150 L83 150 C79 160 66 165 52 158 C59 138 64 112 65 86 Z"
            fill={tone(hair, 0.85)}
          />
        )}

        {/* ── Тело ──────────────────────────────────── */}
        <path d="M16 212 C18 172 44 152 80 146 Q100 156 120 146 C156 152 182 172 184 212 Z" fill={url('shirt')} />
        <path d="M84 147 L100 168 L116 147 Q100 155 84 147 Z" fill={skin.shade} />
        <path d="M84 147 L100 168 L116 147" fill="none" stroke={tone(shirt, 0.7)} strokeWidth="2.5" strokeLinejoin="round" />
        {bodyItem(body, url, color)}

        {/* ── Шея и голова ──────────────────────────── */}
        <path d="M88 110 L88 146 Q100 154 112 146 L112 110 Z" fill={url('neck')} />
        <ellipse cx="70.5" cy="90" rx="5.5" ry="9.5" fill={skin.base} />
        <ellipse cx="71" cy="90.5" rx="2.6" ry="5.5" fill={skin.shade} />
        <ellipse cx="129.5" cy="90" rx="5.5" ry="9.5" fill={skin.base} />
        <ellipse cx="129" cy="90.5" rx="2.6" ry="5.5" fill={skin.shade} />
        <path
          d="M71 82 C71 56 84 43 100 43 C116 43 129 56 129 82 C129 101 122 117 111 124 C107 127 103 128 100 128 C97 128 93 127 89 124 C78 117 71 101 71 82 Z"
          fill={url('skin')}
        />
        <Face skinShade={skin.shade} hair={hair} />
        {appearance.beard && <Beard hair={hair} />}

        {/* ── Волосы и головной убор ────────────────── */}
        {!hairHidden && <HairFront style={appearance.hair} fill={url('hair')} color={hair} covered={head !== undefined && HATS.includes(head)} />}
        {headItem(head, url, color)}

        {/* ── Спереди ───────────────────────────────── */}
        {weaponFront(weapon)}
        {/* Предмет во второй руке сдвинут к центру, чтобы его не обрезала круглая рамка */}
        <g transform="translate(18 -12)">{offhandItem(offhand, url, color)}</g>
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

/** Градиенты и узоры предметов (металл, золото, дерево, бронза, кольчуга). */
function ItemDefs({ id }: { id: (name: string) => string }) {
  return (
    <>
          <linearGradient id={id('steel')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e9eef3" />
            <stop offset="45%" stopColor="#a7b0ba" />
            <stop offset="100%" stopColor="#6b747e" />
          </linearGradient>
          <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff1b8" />
            <stop offset="45%" stopColor="#e7b442" />
            <stop offset="100%" stopColor="#a8741c" />
          </linearGradient>
          <linearGradient id={id('wood')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9a6a3c" />
            <stop offset="100%" stopColor="#6a4424" />
          </linearGradient>
          <linearGradient id={id('bronze')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f2c48a" />
            <stop offset="100%" stopColor="#a8682e" />
          </linearGradient>
          <pattern id={id('mail')} width="8" height="7" patternUnits="userSpaceOnUse">
            <rect width="8" height="7" fill="#7d858e" />
            <circle cx="4" cy="3.5" r="3" fill="none" stroke="#b9c0c8" strokeWidth="1.2" />
          </pattern>
    </>
  );
}

function bodyBack(id: string | undefined): ReactNode {
  if (id === 'traveler_cloak') return <path d="M14 210 C16 158 50 136 100 136 C150 136 184 158 186 210 Z" fill="#2c4634" />;
  if (id === 'champion_armor') return <path d="M14 210 C18 160 50 138 100 138 C150 138 182 160 186 210 Z" fill="#8f1f2b" />;
  return null;
}

function headBack(id: string | undefined): ReactNode {
  if (id !== 'ranger_hood') return null;
  return <path d="M58 98 C54 54 76 28 100 28 C124 28 146 54 142 98 C144 122 150 140 160 152 L40 152 C50 140 56 122 58 98 Z" fill="#35553a" />;
}

/** Область рисунка каждого предмета для отдельной иконки (x y ширина высота в координатах портрета). */
const ICON_VIEW: Record<string, string> = {
  headband: '66 60 80 30',
  leather_cap: '60 28 80 58',
  ranger_hood: '36 24 128 132',
  wizard_hat: '50 2 100 72',
  iron_helm: '58 26 84 78',
  champion_crown: '64 36 72 36',
  leather_vest: '14 140 172 74',
  traveler_cloak: '10 132 180 82',
  chainmail: '14 140 172 74',
  mystic_robe: '14 140 172 74',
  plate_armor: '14 140 172 74',
  champion_armor: '14 136 172 78',
  wooden_club: '124 34 64 180',
  iron_dumbbell: '120 112 76 60',
  bronze_sword: '108 36 74 176',
  steel_sword: '108 36 74 176',
  hunter_bow: '4 26 60 184',
  oak_staff: '130 10 60 204',
  wooden_shield: '4 142 72 72',
  kettlebell: '16 140 54 68',
  spell_tome: '10 150 66 58',
  iron_shield: '10 136 60 80',
};

/** Иконка предмета без персонажа — для магазина и инвентаря. */
export function ItemIcon({ itemId, color, size = 72 }: { itemId: string; color: string; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string): string => `${name}-${uid}`;
  const url = (name: string): string => `url(#${id(name)})`;
  const item = itemById(itemId);
  if (!item) return null;
  const view = (ICON_VIEW[itemId] ?? '0 0 200 200').split(' ').map(Number);
  const [x = 0, y = 0, w = 200, h = 200] = view;
  // Квадратная иконка: дополняем меньшую сторону полями.
  const side = Math.max(w, h) * 1.12;
  const vb = `${x + w / 2 - side / 2} ${y + h / 2 - side / 2} ${side} ${side}`;
  return (
    <svg width={size} height={size} viewBox={vb} role="img" className="item-icon">
      <defs>
        <ItemDefs id={id} />
      </defs>
      {item.slot === 'head' && (
        <>
          {headBack(itemId)}
          {headItem(itemId, url, color)}
        </>
      )}
      {item.slot === 'body' && (
        <>
          {bodyBack(itemId)}
          {bodyItem(itemId, url, color)}
        </>
      )}
      {item.slot === 'weapon' && (
        <>
          {weaponBack(itemId, url)}
          {weaponFront(itemId)}
        </>
      )}
      {item.slot === 'offhand' && offhandItem(itemId, url, color)}
    </svg>
  );
}

function Face({ skinShade, hair }: { skinShade: string; hair: string }) {
  const brow = tone(hair, 0.85);
  const eye = (cx: number): ReactNode => (
    <g>
      <ellipse cx={cx} cy="89" rx="6.4" ry="4.1" fill="#fbfaf8" />
      <circle cx={cx + 0.6} cy="89.4" r="3.3" fill="#4a3426" />
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
const HATS: readonly string[] = ['leather_cap', 'ranger_hood', 'wizard_hat', 'iron_helm'];

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

// ─── Предметы ──────────────────────────────────────────────────────────

type Url = (name: string) => string;

function weaponBack(id: string | undefined, url: Url): ReactNode {
  switch (id) {
    case 'wooden_club':
      return (
        <g>
          <path d="M150 210 L160 78" stroke={url('wood')} strokeWidth="11" strokeLinecap="round" />
          <ellipse cx="163" cy="62" rx="15" ry="22" transform="rotate(8 163 62)" fill="#8a5a30" />
          <circle cx="158" cy="56" r="2.5" fill="#5b3a1d" />
          <circle cx="168" cy="70" r="2.5" fill="#5b3a1d" />
        </g>
      );
    case 'bronze_sword':
    case 'steel_sword': {
      const steel = id === 'steel_sword';
      return (
        <g>
          <path d="M152 70 L160 74 L126 206 L116 204 Z" fill={url(steel ? 'steel' : 'bronze')} />
          <path d="M156 72 L121 205" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
          <path d="M140 64 L174 80" stroke={steel ? url('steel') : '#6b4a2b'} strokeWidth="7" strokeLinecap="round" />
          <path d="M158 70 L166 50" stroke="#4a2f1f" strokeWidth="7" strokeLinecap="round" />
          <circle cx="167.5" cy="46" r={steel ? 6 : 5} fill={steel ? '#4da3ff' : url('bronze')} stroke={steel ? url('gold') : 'none'} strokeWidth="2" />
        </g>
      );
    }
    case 'hunter_bow':
      return (
        <g>
          <path d="M40 30 Q0 118 50 206" fill="none" stroke={url('wood')} strokeWidth="7" strokeLinecap="round" />
          <path d="M40 30 L50 206" stroke="#e8e2d0" strokeWidth="1.3" />
          <path d="M150 160 L166 40" stroke="#6a4424" strokeWidth="4" />
          <path d="M160 52 L166 36 L172 54" fill="#d9dee4" />
          <path d="M154 150 L158 166 M146 154 L158 162" stroke="#e45f4f" strokeWidth="3" />
        </g>
      );
    case 'oak_staff':
      return (
        <g>
          <path d="M162 212 L160 44" stroke={url('wood')} strokeWidth="8" strokeLinecap="round" />
          <path d="M160 46 C150 38 150 24 160 18 C170 24 170 38 160 46 Z" fill="#6a4424" />
          <circle cx="160" cy="30" r="13" fill="#8fd3ff" opacity="0.25" />
          <circle cx="160" cy="30" r="7" fill="#8fd3ff" />
          <circle cx="157.5" cy="27.5" r="2" fill="#ffffff" />
        </g>
      );
    default:
      return null;
  }
}

function weaponFront(id: string | undefined): ReactNode {
  if (id !== 'iron_dumbbell') return null;
  return (
    <g>
      <path d="M126 150 L190 136" stroke="#c9ced4" strokeWidth="6" strokeLinecap="round" />
      <rect x="128" y="132" width="12" height="32" rx="3" transform="rotate(-12 134 148)" fill="#2e3339" />
      <rect x="142" y="136" width="8" height="24" rx="2" transform="rotate(-12 146 148)" fill="#40464e" />
      <rect x="170" y="125" width="8" height="24" rx="2" transform="rotate(-12 174 137)" fill="#40464e" />
      <rect x="180" y="121" width="12" height="32" rx="3" transform="rotate(-12 186 137)" fill="#2e3339" />
    </g>
  );
}

function bodyItem(id: string | undefined, url: Url, color: string): ReactNode {
  switch (id) {
    case 'leather_vest':
      return (
        <g fill="#7a4e2d" stroke="#5a3820" strokeWidth="1.5">
          <path d="M22 212 C24 176 48 156 80 148 L94 212 Z" />
          <path d="M178 212 C176 176 152 156 120 148 L106 212 Z" />
          <path d="M80 152 L90 210 M120 152 L110 210" stroke="#d8b48a" strokeDasharray="3 3" fill="none" />
        </g>
      );
    case 'traveler_cloak':
      return (
        <g>
          <path d="M20 204 C26 168 54 148 84 146 Q100 153 116 146 C146 148 174 168 180 204 C162 184 140 174 118 172 L100 180 L82 172 C60 174 38 184 20 204 Z" fill="#3f6b48" />
          <path d="M84 146 Q100 153 116 146" fill="none" stroke="#2c4634" strokeWidth="3" />
          <circle cx="100" cy="166" r="7" fill={url('gold')} />
          <circle cx="100" cy="166" r="3" fill={color} />
        </g>
      );
    case 'chainmail':
      return (
        <g>
          <path d="M20 212 C22 174 46 154 80 148 L100 166 L120 148 C154 154 178 174 180 212 Z" fill={url('mail')} />
          <path d="M80 148 L100 166 L120 148" fill="none" stroke="#5c636b" strokeWidth="3" />
        </g>
      );
    case 'mystic_robe':
      return (
        <g>
          <path d="M18 212 C20 172 46 152 80 146 L100 170 L120 146 C154 152 180 172 182 212 Z" fill="#43337d" />
          <path d="M80 146 L100 170 L120 146" fill="none" stroke={url('gold')} strokeWidth="5" strokeLinejoin="round" />
          <path d="M100 170 L100 212" stroke={url('gold')} strokeWidth="4" />
          <circle cx="62" cy="186" r="4" fill={url('gold')} />
          <circle cx="138" cy="186" r="4" fill={url('gold')} />
        </g>
      );
    case 'plate_armor':
    case 'champion_armor': {
      const metal = url(id === 'champion_armor' ? 'gold' : 'steel');
      const trim = id === 'champion_armor' ? '#8f1f2b' : '#5c656f';
      return (
        <g>
          <path d="M54 212 C56 176 72 160 100 157 C128 160 144 176 146 212 Z" fill={metal} stroke={trim} strokeWidth="2" />
          <path d="M100 160 L100 212" stroke={trim} strokeWidth="2" opacity="0.6" />
          <path d="M70 186 Q100 176 130 186" fill="none" stroke={trim} strokeWidth="2" opacity="0.6" />
          <ellipse cx="50" cy="170" rx="32" ry="19" transform="rotate(-18 50 170)" fill={metal} stroke={trim} strokeWidth="2" />
          <ellipse cx="150" cy="170" rx="32" ry="19" transform="rotate(18 150 170)" fill={metal} stroke={trim} strokeWidth="2" />
          <path d="M80 143 Q100 157 120 143 L123 152 Q100 168 77 152 Z" fill={metal} stroke={trim} strokeWidth="1.5" />
          {id === 'champion_armor' && <circle cx="100" cy="186" r="7" fill="#d23a4a" stroke="#fff1b8" strokeWidth="2" />}
        </g>
      );
    }
    default:
      return null;
  }
}

function headItem(id: string | undefined, url: Url, color: string): ReactNode {
  switch (id) {
    case 'headband':
      return (
        <g>
          <path d="M69 72 Q100 62 131 72 L131 80 Q100 70 69 80 Z" fill={color} />
          <path d="M129 74 L144 84 L139 88 L128 79 Z" fill={tone(color, 0.75)} />
        </g>
      );
    case 'leather_cap':
      return (
        <g>
          <path d="M67 74 C67 48 82 33 100 33 C118 33 133 48 133 74 Q100 64 67 74 Z" fill="#7a4e2d" />
          <path d="M100 34 L100 66" stroke="#5a3820" strokeWidth="2" />
          <path d="M64 75 Q100 63 136 75 L136 81 Q100 70 64 81 Z" fill="#5a3820" />
        </g>
      );
    case 'ranger_hood':
      return <path d="M62 96 C60 58 78 34 100 34 C122 34 140 58 138 96 C136 66 122 48 100 48 C78 48 64 66 62 96 Z" fill="#44704a" />;
    case 'wizard_hat':
      return (
        <g>
          <path d="M72 60 C84 42 92 20 120 6 C113 22 116 42 128 60 Z" fill="#4b3a8a" />
          <path d="M86 46 Q100 42 116 46 L118 54 Q100 50 84 54 Z" fill={url('gold')} />
          <ellipse cx="100" cy="61" rx="47" ry="9" fill="#3b2d70" />
          <path d="M104 28 L106 33 L111 33 L107 36 L109 41 L104 38 L99 41 L101 36 L97 33 L102 33 Z" fill="#ffe27a" />
        </g>
      );
    case 'iron_helm':
      return (
        <g>
          <path d="M63 98 C60 52 79 29 100 29 C121 29 140 52 137 98 L128 100 C128 74 124 62 100 60 C76 62 72 74 72 100 Z" fill={url('steel')} />
          <path d="M66 62 Q100 50 134 62 L134 70 Q100 58 66 70 Z" fill="#7b848e" />
          <path d="M97 60 L103 60 L102.5 96 L97.5 96 Z" fill={url('steel')} stroke="#5c656f" strokeWidth="1" />
          {[74, 87, 113, 126].map((x) => (
            <circle key={x} cx={x} cy="64" r="1.8" fill="#4b535c" />
          ))}
        </g>
      );
    case 'champion_crown':
      return (
        <g>
          <path d="M70 68 L73 46 L85 59 L92 40 L100 56 L108 40 L115 59 L127 46 L130 68 Q100 60 70 68 Z" fill={url('gold')} stroke="#a8741c" strokeWidth="1.5" />
          <circle cx="100" cy="62" r="4" fill="#d23a4a" />
          <circle cx="84" cy="64" r="3" fill="#4da3ff" />
          <circle cx="116" cy="64" r="3" fill="#4da3ff" />
        </g>
      );
    default:
      return null;
  }
}

function offhandItem(id: string | undefined, url: Url, color: string): ReactNode {
  switch (id) {
    case 'wooden_shield':
      return (
        <g>
          <circle cx="40" cy="178" r="32" fill="#8a5a30" stroke="#5c656f" strokeWidth="5" />
          <path d="M18 168 L62 168 M16 186 L64 186" stroke="#6a4424" strokeWidth="2" />
          <circle cx="40" cy="178" r="8" fill={url('steel')} />
        </g>
      );
    case 'iron_shield':
      return (
        <g>
          <path d="M14 140 L66 140 L66 172 C66 196 40 212 40 212 C40 212 14 196 14 172 Z" fill={url('steel')} stroke="#5c656f" strokeWidth="3" />
          <path d="M40 150 L40 198 M24 166 L56 166" stroke={color} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case 'spell_tome':
      return (
        <g transform="rotate(-14 42 178)">
          <rect x="18" y="160" width="48" height="38" rx="4" fill="#5a2f6e" stroke="#2f1838" strokeWidth="2" />
          <rect x="62" y="162" width="5" height="34" fill="#efe4c8" />
          <circle cx="42" cy="179" r="8" fill="none" stroke={url('gold')} strokeWidth="3" />
          <path d="M18 164 L24 160 M18 194 L24 198" stroke={url('gold')} strokeWidth="3" />
        </g>
      );
    case 'kettlebell':
      return (
        <g>
          <path d="M28 170 C26 146 58 146 56 170" fill="none" stroke="#2e3339" strokeWidth="8" strokeLinecap="round" />
          <circle cx="42" cy="184" r="22" fill="#3a4047" />
          <ellipse cx="35" cy="177" rx="7" ry="4" fill="#ffffff" opacity="0.15" />
          <text x="42" y="190" textAnchor="middle" fontSize="13" fontWeight="800" fill={color} fontFamily="system-ui, sans-serif">
            16
          </text>
        </g>
      );
    default:
      return null;
  }
}
