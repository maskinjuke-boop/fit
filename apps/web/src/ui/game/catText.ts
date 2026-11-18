import { catAge, isKitten } from '../../game/life';
import { CAT_AGE, catBreedById } from '../../game/lifeContent';
import type { Blood, Cat } from '../../game/lifeTypes';
import { bloodClass, catValue, pedigree, pureBred, purity } from '../../game/catBlood';
import type { I18nKey, Lang } from '../../i18n';

type T = (k: I18nKey) => string;
type TF = (k: I18nKey, vars: Record<string, string | number>) => string;

/** Порода кошки: у метиса — породы с долями крови. */
export function catBreedText(c: Pick<Cat, 'breed' | 'mix'> & { blood?: Blood }, lang: Lang, t: T): string {
  if (c.blood && !pureBred(c.blood)) return `${t('cat.mix')}: ${pedigree(c.blood, lang)}`;
  const a = catBreedById(c.breed).name[lang];
  return c.mix ? `${t('cat.mix')}: ${a} × ${catBreedById(c.mix).name[lang]}` : a;
}

/** Чистота крови и ценность: «чистокровная 100% · ◈ 450». */
export function catBloodText(c: { blood: Blood }, lang: Lang): string {
  return `🧬 ${bloodClass(c.blood)[lang]} ${Math.round(purity(c.blood) * 100)}% · ◈ ${catValue(c.blood)}`;
}

/** Возраст: месяцы до года, дальше — годы. */
export function catAgeText(c: Pick<Cat, 'born'>, day: number, tf: TF): string {
  const m = catAge(c, day);
  return m < CAT_AGE.GROWN ? tf('cat.months', { n: m }) : tf('cat.years', { n: Math.floor(m / 12) });
}

/** Пол, возраст, «котёнок». */
export function catMeta(c: Pick<Cat, 'sex' | 'born'>, day: number, t: T, tf: TF): string {
  const parts = [t(c.sex === 'f' ? 'cat.f' : 'cat.m'), catAgeText(c, day, tf)];
  if (isKitten(c, day)) parts.push(t('cat.kitten'));
  return parts.join(' · ');
}
