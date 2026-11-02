import type { HairStyle } from '../../game/state';

/** Палитры внешности, общие для 2D-портрета и 3D-модели. */
export const SKIN_TONES = [
  { base: '#f6dcc8', shade: '#dfb398' },
  { base: '#eec3a0', shade: '#d09a76' },
  { base: '#d29a72', shade: '#b07650' },
  { base: '#a76e4b', shade: '#875335' },
  { base: '#71462e', shade: '#563320' },
] as const;

export const HAIR_COLORS = ['#1f1612', '#4a2f1f', '#8a5a2b', '#d6ab62', '#a8392a', '#a3a8b0'] as const;
export const HAIR_STYLES: readonly HairStyle[] = ['short', 'buzz', 'long', 'ponytail', 'bob', 'bun', 'curly'];
