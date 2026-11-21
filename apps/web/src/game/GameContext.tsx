import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExerciseId } from '../tracking/exercise';
import { advanceCity, build, clearAsh, demolish, renameCity } from './city/city';
import type { BuildingId, CityState } from './city/types';
import { applyRep, ensureDay, grant, newGameState, type GameEvent, type Result } from './engine';
import { createState, type Character, type GameState } from './state';
import { clearGame, loadGame, saveGame } from './storage';

/** Действия режима администратора. */
export interface AdminActions {
  grant(gold: number): void;
  /** Любой инструмент (см. раздел администратора в city/city.ts): сохранение помечается тестовым. */
  apply(fn: (s: GameState) => GameState | Result): GameEvent[];
  /** Перемотка реального дня на n суток (может быть отрицательной). */
  shiftDays(n: number): GameEvent[];
  resetClock(): void;
  dayOffset: number;
  setEnabled(v: boolean): void;
}

/** Действия бога в городе. */
export interface CityActions {
  build(type: BuildingId, gx: number, gz: number): void;
  demolish(id: number): void;
  clearAsh(id: number): void;
  rename(name: string): void;
}

interface Game {
  state: GameState | null;
  /** Живой город (меняется каждый кадр; state.city обновляется раз в секунду). */
  live(): CityState | null;
  /** События последнего перехода на новый день (пожар). */
  dayEvents: GameEvent[];
  createGame(c: Omit<Character, 'id' | 'createdDay'>): void;
  /** Засчитанный повтор → игровые события (деньги, подношение). */
  recordRep(exercise: ExerciseId, quality: number): GameEvent[];
  setHasBar(v: boolean): void;
  reset(): void;
  city: CityActions;
  /** Режим администратора включён (открыть сайт с ?admin). */
  adminEnabled: boolean;
  admin: AdminActions;
}

const Ctx = createContext<Game | null>(null);

const ADMIN_KEY = 'fitness-rpg.admin';
const OFFSET_KEY = 'fitness-rpg.dev-day-offset';
const DAY_MS = 86_400_000;
/** Как часто город обновляет интерфейс и сохраняется. */
const UI_MS = 1000;
const SAVE_MS = 5000;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // нет доступа к хранилищу
  }
}

/** ?admin или ?admin=1 включает режим, ?admin=0 выключает; выбор запоминается в браузере. */
function initialAdmin(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('admin');
    if (param !== null) {
      const on = param !== '0';
      writeStorage(ADMIN_KEY, on ? '1' : null);
      return on;
    }
  } catch {
    // нет window (тесты)
  }
  return readStorage(ADMIN_KEY) === '1';
}

const touched = (s: GameState): GameState => (s.adminTouched ? s : { ...s, adminTouched: true });

export function GameProvider({ children }: { children: ReactNode }) {
  const [dayOffset, setDayOffset] = useState<number>(() => Number(readStorage(OFFSET_KEY) ?? 0) || 0);
  const offsetRef = useRef(dayOffset);
  offsetRef.current = dayOffset;
  /** Реальные часы плюс перемотка администратора (для дня подношения). */
  const now = useCallback(() => new Date(Date.now() + offsetRef.current * DAY_MS), []);

  const [state, setState] = useState<GameState | null>(() => {
    const loaded = loadGame();
    return loaded ? ensureDay(loaded, new Date(Date.now() + dayOffset * DAY_MS)).state : null;
  });
  const [dayEvents, setDayEvents] = useState<GameEvent[]>([]);
  const [adminEnabled, setAdminEnabled] = useState(initialAdmin);
  // Повторы и кадры города идут быстрее, чем React перерисовывает: актуальное состояние — в ref.
  const ref = useRef(state);
  const savedAt = useRef(0);

  const commit = useCallback((s: GameState | null) => {
    ref.current = s;
    setState(s);
    if (s) {
      saveGame(s);
      savedAt.current = Date.now();
    }
  }, []);

  /** Применяет результат движка и возвращает события. */
  const run = useCallback(
    (fn: (s: GameState) => Result): GameEvent[] => {
      const cur = ref.current;
      if (!cur) return [];
      const r = fn(cur);
      commit(r.state);
      return r.events;
    },
    [commit],
  );

  // Город живёт сам: каждый кадр — шаг симуляции; раз в секунду — интерфейс, раз в 5 с — сохранение.
  useEffect(() => {
    let raf = 0;
    let uiAt = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const cur = ref.current;
      if (!cur || document.visibilityState !== 'visible') return;
      advanceCity(cur.city, Date.now());
      const t = Date.now();
      if (t - uiAt > UI_MS) {
        uiAt = t;
        const next = { ...cur };
        ref.current = next;
        setState(next);
        if (t - savedAt.current > SAVE_MS) {
          saveGame(next);
          savedAt.current = t;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    const away = (): void => {
      if (document.visibilityState === 'hidden' && ref.current) saveGame(ref.current);
    };
    document.addEventListener('visibilitychange', away);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', away);
    };
  }, []);

  // Новый реальный день наступает и при открытой вкладке: проверяем при возврате на неё и раз в минуту.
  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState !== 'visible' || !ref.current) return;
      const r = ensureDay(ref.current, now());
      if (r.state !== ref.current) {
        commit(r.state);
        if (r.events.length > 0) setDayEvents(r.events);
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [commit, now]);

  const value = useMemo<Game>(() => {
    const plain = (fn: (s: GameState) => GameState): void => {
      const cur = ref.current;
      if (!cur) return;
      const s = fn(cur);
      if (s !== cur) commit(s);
    };
    const admin: AdminActions = {
      dayOffset,
      grant: (gold) => run((s) => grant(touched(s), gold)),
      apply: (fn) =>
        run((s) => {
          const r = fn(touched(s));
          return 'events' in r ? r : { state: r, events: [] };
        }),
      shiftDays: (n) => {
        const next = offsetRef.current + n;
        offsetRef.current = next;
        setDayOffset(next);
        writeStorage(OFFSET_KEY, String(next));
        const events = run((s) => ensureDay(touched(s), now()));
        setDayEvents(events);
        return events;
      },
      resetClock: () => {
        offsetRef.current = 0;
        setDayOffset(0);
        writeStorage(OFFSET_KEY, null);
        run((s) => ensureDay(s, now()));
      },
      setEnabled: (v) => {
        writeStorage(ADMIN_KEY, v ? '1' : null);
        setAdminEnabled(v);
      },
    };
    const city: CityActions = {
      build: (type, gx, gz) => plain((s) => build(s, type, gx, gz)),
      demolish: (id) => plain((s) => demolish(s, id)),
      clearAsh: (id) => plain((s) => clearAsh(s, id)),
      rename: (name) => plain((s) => renameCity(s, name)),
    };
    return {
      state,
      live: () => ref.current?.city ?? null,
      dayEvents,
      city,
      createGame: (c) => commit(newGameState(c, now(), (ch) => createState(ch))),
      recordRep: (exercise, quality) => run((s) => applyRep(s, { exercise, quality }, now())),
      setHasBar: (v) => {
        const cur = ref.current;
        if (!cur) return;
        commit({ ...cur, character: { ...cur.character, hasBar: v } });
      },
      reset: () => {
        clearGame();
        setDayEvents([]);
        commit(null);
      },
      adminEnabled,
      admin,
    };
  }, [state, dayEvents, commit, run, now, dayOffset, adminEnabled]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): Game {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGame outside GameProvider');
  return g;
}
