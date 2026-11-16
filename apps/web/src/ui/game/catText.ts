import { catAge, isKitten } from '../../game/life';
import { CAT_AGE, catBreedById } from '../../game/lifeContent';
import type { Cat } from '../../game/lifeTypes';
import type { I18nKey, Lang } from '../../i18n';

type T = (k: I18nKey) => string;
type TF = (k: I18nKey, vars: Record<string, string | number>) => string;

/** Порода кошки: у метиса — обе породы. */
export function catBreedText(c: Pick<Cat, 'breed' | 'mix'>, lang: Lang, t: T): string {
  const a = catBreedById(c.breed).name[lang];
  return c.mix ? `${t('cat.mix')}: ${a} × ${catBreedById(c.mix).name[lang]}` : a;
}

/** Возраст: месяцы до года, дальше — годы. */
export function catAgeText(c: Cat, day: number, tf: TF): string {
  const m = catAge(c, day);
  return m < CAT_AGE.GROWN ? tf('cat.months', { n: m }) : tf('cat.years', { n: Math.floor(m / 12) });
}

/** Пол, возраст, «котёнок», «ждёт котят». */
export function catMeta(c: Cat, day: number, t: T, tf: TF): string {
  const parts = [t(c.sex === 'f' ? 'cat.f' : 'cat.m'), catAgeText(c, day, tf)];
  if (isKitten(c, day)) parts.push(t('cat.kitten'));
  if (c.pregnant) parts.push(tf('cat.pregnant', { n: Math.max(0, c.pregnant.due - day) }));
  return parts.join(' · ');
}
