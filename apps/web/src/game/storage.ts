import type { GameState } from './state';

/**
 * До появления сервера (этап 2) прогресс хранится в браузере на устройстве.
 * Очистка данных сайта или другой браузер — это новый персонаж.
 */
const KEY = 'fitness-rpg.game.v1';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === 1 && s.character ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Хранилище недоступно (приватный режим) — прогресс живёт до закрытия вкладки.
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // нет доступа к хранилищу
  }
}
