import { COATS, HOUSE_LEVELS, WORKSHOP_LEVELS, buildingById, CAT_YEAR_DAYS } from '../../game/city/content';
import type { Building, CityCat, Txt } from '../../game/city/types';
import type { Lang } from '../../i18n';

/** Русское склонение: 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** Окрас под род кошки: «рыжая» → «рыжий». */
export function coatText(k: Pick<CityCat, 'coat' | 'sex'>, lang: Lang): string {
  const n = COATS.find((c) => c.id === k.coat)!.name;
  if (lang === 'en' || k.sex === 'f') return n[lang];
  return n.ru.replace(/([а-яё]+)ая\b/g, (_, stem: string) => (stem.endsWith('луб') ? `${stem}ой` : /[жкгхшщч]$/.test(stem) ? `${stem}ий` : `${stem}ый`));
}

/** Возраст: игровые дни → кошачьи годы и месяцы. */
export function ageText(days: number, lang: Lang): string {
  const years = Math.floor(days / CAT_YEAR_DAYS);
  const months = Math.floor(((days % CAT_YEAR_DAYS) / CAT_YEAR_DAYS) * 12);
  if (lang === 'en') {
    const y = years ? `${years} yr` : '';
    const m = months || !years ? `${months} mo` : '';
    return [y, m].filter(Boolean).join(' ');
  }
  const y = years ? `${years} ${plural(years, 'год', 'года', 'лет')}` : '';
  const m = months || !years ? `${months} мес.` : '';
  return [y, m].filter(Boolean).join(' ');
}

/** Название уровня здания (дом и мастерская), иначе — имя здания. */
export function levelName(b: Building): Txt {
  if (b.kind === 'house') return HOUSE_LEVELS[b.level - 1]!.name;
  if (b.kind === 'workshop') return WORKSHOP_LEVELS[b.level - 1]!.name;
  return buildingById(b.type).name;
}

/** Время суток: 14:05. */
export function clockText(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Обратный отсчёт: 5:07:33. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Сколько осталось до реальной полуночи. */
export function toMidnight(now = new Date()): number {
  const m = new Date(now);
  m.setHours(24, 0, 0, 0);
  return m.getTime() - now.getTime();
}

export const moodFace = (m: number): string => (m >= 80 ? '😻' : m >= 60 ? '😺' : m >= 40 ? '🐱' : m >= 20 ? '😿' : '🙀');
