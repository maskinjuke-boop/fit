import type { Archetype } from '../../game/config';

/**
 * Оригинальный аватар персонажа: силуэт в плаще цвета игрока и знак пути.
 * Простая векторная заготовка до появления арта (ТЗ: арт делается с нуля).
 */
export function Avatar({ archetype, color, size = 96, level }: { archetype: Archetype; color: string; size?: number; level?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={archetype}>
      <defs>
        <radialGradient id={`glow-${archetype}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#191c21" stroke={color} strokeWidth="2" />
      <circle cx="50" cy="45" r="40" fill={`url(#glow-${archetype})`} />
      {/* плащ */}
      <path d="M26 88 C30 62 38 52 50 52 C62 52 70 62 74 88 Z" fill={color} opacity="0.9" />
      {/* голова */}
      <circle cx="50" cy="38" r="12" fill="#e9d7c3" />
      <path d="M38 36 C38 24 62 24 62 36 C58 30 42 30 38 36 Z" fill="#2b2f36" />
      {archetype === 'guardian' && (
        <g>
          <path d="M60 60 L76 60 L76 72 C76 80 68 84 68 84 C68 84 60 80 60 72 Z" fill="#cfd6df" stroke="#2b2f36" strokeWidth="1.5" />
          <path d="M68 64 L68 80" stroke={color} strokeWidth="2.5" />
        </g>
      )}
      {archetype === 'ranger' && (
        <g fill="none" stroke="#cfd6df" strokeWidth="2">
          <path d="M72 50 C82 62 82 74 72 86" />
          <path d="M72 50 L72 86" strokeWidth="1" />
          <path d="M62 68 L80 68" stroke={color} />
        </g>
      )}
      {archetype === 'mystic' && (
        <g>
          <path d="M72 46 L72 88" stroke="#a88b6a" strokeWidth="3" />
          <circle cx="72" cy="44" r="5" fill={color} />
          <circle cx="72" cy="44" r="9" fill={color} opacity="0.25" />
        </g>
      )}
      {level !== undefined && (
        <g>
          <circle cx="22" cy="78" r="13" fill="#0f1114" stroke={color} strokeWidth="2" />
          <text x="22" y="83" textAnchor="middle" fontSize="13" fontWeight="700" fill="#f2f3f5">
            {level}
          </text>
        </g>
      )}
    </svg>
  );
}
