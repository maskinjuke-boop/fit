/** Даты в игре — локальные сутки игрока (ТЗ: обновление ежедневок в 00:00 по его часовому поясу). */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Ключ дня 'YYYY-MM-DD' по местному времени. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Смещение дня на n суток. */
export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Сколько суток от a до b (b позже → положительное). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

/** Ключ недели — дата её понедельника. */
export function weekKey(day: string): string {
  const d = parseDay(day);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return dayKey(d);
}
