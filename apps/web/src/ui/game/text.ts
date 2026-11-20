import type { GameEvent } from '../../game/engine';
import type { Txt } from '../../game/city/types';
import type { I18nKey, Lang } from '../../i18n';

type T = (k: I18nKey) => string;
type TF = (k: I18nKey, vars: Record<string, string | number>) => string;

export const exName = (t: T, id: string): string => t(`exercise.${id}` as I18nKey);

/** Текст на языке интерфейса из пары ru/en. */
export const tx = (x: Txt, lang: Lang): string => x[lang];

/** Текст баннера для игрового события; null — событие без баннера (монеты показываются отдельно). */
export function eventText(t: T, tf: TF, e: GameEvent): string | null {
  switch (e.kind) {
    case 'limit':
      return t('ev.limit');
    case 'offering':
      return tf('ev.offering', { ex: exName(t, e.exercise), n: e.done, m: e.target });
    case 'offeringDone':
      return t('ev.offeringDone');
    case 'cityFire':
      return tf('ev.cityFire', { n: e.houses });
    case 'gold':
      return null;
  }
}
