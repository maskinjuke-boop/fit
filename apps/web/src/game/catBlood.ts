import { CAT_BREEDS, catBreedById } from './lifeContent';
import type { Blood, CatBreed, Txt } from './lifeTypes';

/**
 * Родословная кошек: кровь — доли пород (в сумме 1). Чистота крови — доля главной породы;
 * котёнок получает среднее крови родителей (метис двух чистокровных — 50/50). Ценность
 * кошки — цена породы, умноженная на чистоту (у метиса — заметно меньше).
 */

const isBreed = (b: unknown): b is CatBreed => CAT_BREEDS.some((x) => x.id === b);

/** Доли меньше этого отбрасываются (и остальные делятся заново). */
const MIN_SHARE = 1 / 64;

/** Кровь без мусора: только породы, доли > 0, в сумме 1. */
export function normBlood(raw: unknown, fallback: CatBreed): Blood {
  const out: Blood = {};
  let sum = 0;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isBreed(k) || typeof v !== 'number' || !Number.isFinite(v) || v < MIN_SHARE) continue;
      out[k] = v;
      sum += v;
    }
  }
  if (sum <= 0) return { [fallback]: 1 };
  for (const k of Object.keys(out) as CatBreed[]) out[k] = Math.round((out[k]! / sum) * 1024) / 1024;
  return out;
}

/** Кровь по породе и второй породе (старые сохранения): метис — пополам. */
export const bloodOf = (breed: CatBreed, mix?: CatBreed, share = 0.5): Blood => (mix && mix !== breed ? { [breed]: 1 - share, [mix]: share } : { [breed]: 1 });

/** Породы по убыванию доли. */
export function shares(b: Blood): Array<[CatBreed, number]> {
  return (Object.entries(b) as Array<[CatBreed, number]>).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
}

/** Чистота крови 0…1 (доля главной породы). */
export const purity = (b: Blood): number => shares(b)[0]?.[1] ?? 1;

/** Внешность по крови: главная порода и вторая (если её заметно — от 1/8). */
export function looksOf(b: Blood): { breed: CatBreed; mix?: CatBreed } {
  const s = shares(b);
  const breed = s[0]?.[0] ?? 'ginger';
  const second = s[1];
  return second && second[1] >= 0.125 ? { breed, mix: second[0] } : { breed };
}

/** Кровь котёнка: среднее крови родителей. */
export function childBlood(a: Blood, b: Blood): Blood {
  const out: Blood = {};
  for (const [k, v] of shares(a)) out[k] = (out[k] ?? 0) + v / 2;
  for (const [k, v] of shares(b)) out[k] = (out[k] ?? 0) + v / 2;
  return normBlood(out, shares(a)[0]?.[0] ?? 'ginger');
}

/** Чистокровная (100%). */
export const pureBred = (b: Blood): boolean => purity(b) >= 0.999;

/**
 * Ценность кошки: цена породы × (чистота²) плюс понемногу за остальные породы. Чистокровная
 * дорогая, метис 50/50 — около трети цены, «смесь всех» — почти как дворовая.
 */
export function catValue(b: Blood): number {
  const s = shares(b);
  const [main, p] = s[0] ?? ['ginger', 1];
  const top = catBreedById(main).value * p * p;
  const rest = s.slice(1).reduce((a, [k, v]) => a + catBreedById(k).value * v * v, 0);
  return Math.max(20, Math.round((top + rest + 15) / 5) * 5);
}

/** Класс родословной по чистоте: чистокровная, полукровка, метис, смесь. */
export function bloodClass(b: Blood): Txt {
  const p = purity(b);
  if (p >= 0.999) return { ru: 'чистокровная', en: 'purebred' };
  if (p >= 0.75) return { ru: 'почти чистокровная', en: 'high-blood' };
  if (p >= 0.5) return { ru: 'полукровка', en: 'half-blood' };
  return { ru: 'смесь пород', en: 'mixed blood' };
}

/** Родословная словами: «Британская 75% · Сиамская 25%». */
export function pedigree(b: Blood, lang: 'ru' | 'en'): string {
  return shares(b)
    .slice(0, 4)
    .map(([k, v]) => `${catBreedById(k).name[lang]} ${Math.round(v * 100)}%`)
    .join(' · ');
}
