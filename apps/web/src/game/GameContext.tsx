import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExerciseId } from '../tracking/exercise';
import { completeDailies, markTouched, refillNeeds, resetReroll, simulateReps, unlockAllItems } from './admin';
import {
  applyRep,
  buyItem,
  completeActiveQuests,
  ensureDay,
  equipItem,
  grant,
  newCharacterState,
  reroll,
  setLevel,
  settleAfterLife,
  unequipSlot,
  type GameEvent,
  type Result,
  type ShopError,
} from './engine';
import type { Slot } from './items';
import { createState, type Appearance, type Character, type GameState } from './state';
import { clearGame, loadGame, saveGame } from './storage';
import { act, adoptCat, answerEvent, buyFurniture, rehomeCat, dismissResult, endSession, sellFurniture, startSession, upgradeGym, type LifeOutcome } from './life';
import type { CatBreed, ObjectId } from './lifeTypes';

/** Действия режима администратора. */
export interface AdminActions {
  grant(reward: { xp?: number; gold?: number }): GameEvent[];
  setLevel(level: number): GameEvent[];
  simulate(exercise: ExerciseId, count: number, quality: number): GameEvent[];
  completeDailies(): GameEvent[];
  completeQuests(): GameEvent[];
  unlockAll(): void;
  resetReroll(): void;
  refillNeeds(): void;
  /** Перемотка игрового времени на n суток (может быть отрицательной). */
  shiftDays(n: number): GameEvent[];
  resetClock(): void;
  dayOffset: number;
  setEnabled(v: boolean): void;
}

/** Действия симулятора жизни. Действие может попросить открыть тренировку или экран. */
export interface LifeActions {
  act(actionId: string): LifeOutcome;
  answer(choiceId: string): void;
  startSession(exercise: ExerciseId): void;
  endSession(): void;
  upgradeGym(): void;
  buyFurniture(id: ObjectId): void;
  sellFurniture(id: ObjectId): void;
  adoptCat(breed: CatBreed): void;
  rehomeCat(id: string): void;
  dismiss(): void;
}

interface Game {
  state: GameState | null;
  /** События последнего перехода на новый день (сгоревшая серия и т. п.). */
  dayEvents: GameEvent[];
  createCharacter(c: Omit<Character, 'id' | 'createdDay'>): void;
  /** Засчитанный повтор → игровые события (опыт, уровни, квесты). */
  recordRep(exercise: ExerciseId, quality: number): GameEvent[];
  rerollDaily(index: number): void;
  setHasBar(v: boolean): void;
  setAppearance(a: Appearance, color: string): void;
  buy(id: string): ShopError | null;
  equip(id: string): void;
  unequip(slot: Slot): void;
  reset(): void;
  life: LifeActions;
  /** Выбрать титул под именем (undefined — без титула). */
  setTitle(id: string | undefined): void;
  /** Режим администратора включён (открыть сайт с ?admin). */
  adminEnabled: boolean;
  admin: AdminActions;
}

const Ctx = createContext<Game | null>(null);

const ADMIN_KEY = 'fitness-rpg.admin';
const OFFSET_KEY = 'fitness-rpg.dev-day-offset';
const DAY_MS = 86_400_000;

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

export function GameProvider({ children }: { children: ReactNode }) {
  const [dayOffset, setDayOffset] = useState<number>(() => Number(readStorage(OFFSET_KEY) ?? 0) || 0);
  const offsetRef = useRef(dayOffset);
  offsetRef.current = dayOffset;
  /** Игровые часы: реальное время плюс перемотка администратора. */
  const now = useCallback(() => new Date(Date.now() + offsetRef.current * DAY_MS), []);

  const [state, setState] = useState<GameState | null>(() => {
    const loaded = loadGame();
    return loaded ? ensureDay(loaded, new Date(Date.now() + dayOffset * DAY_MS)).state : null;
  });
  const [dayEvents, setDayEvents] = useState<GameEvent[]>([]);
  const [adminEnabled, setAdminEnabled] = useState(initialAdmin);
  // Повторы приходят из цикла кадров быстрее, чем React перерисовывает: держим актуальное состояние в ref.
  const ref = useRef(state);

  const commit = useCallback((s: GameState | null) => {
    ref.current = s;
    setState(s);
    if (s) saveGame(s);
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

  // Новый день наступает и при открытой вкладке: проверяем при возврате на неё и раз в минуту.
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
    const timer = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [commit, now]);

  const value = useMemo<Game>(() => {
    const touch = (s: GameState): GameState => markTouched(s);
    const admin: AdminActions = {
      dayOffset,
      grant: (reward) => run((s) => grant(touch(s), reward)),
      setLevel: (level) => run((s) => setLevel(touch(s), level)),
      simulate: (exercise, count, quality) => run((s) => simulateReps(s, exercise, count, quality, now())),
      completeDailies: () => run((s) => completeDailies(s, now())),
      completeQuests: () => run((s) => completeActiveQuests(touch(s))),
      unlockAll: () => {
        if (ref.current) commit(unlockAllItems(ref.current));
      },
      resetReroll: () => {
        if (ref.current) commit(resetReroll(ref.current));
      },
      refillNeeds: () => {
        if (ref.current) commit(refillNeeds(ref.current));
      },
      shiftDays: (n) => {
        const next = offsetRef.current + n;
        offsetRef.current = next;
        setDayOffset(next);
        writeStorage(OFFSET_KEY, String(next));
        const events = run((s) => ensureDay(touch(s), now()));
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
    // Действия жизни + квесты и достижения после них.
    const lifeRun = (fn: (s: GameState) => LifeOutcome): LifeOutcome => {
      const cur = ref.current;
      if (!cur) return { state: cur as unknown as GameState };
      const r = fn(cur);
      if (r.state === cur) return r;
      const settled = settleAfterLife(r.state, []);
      commit(settled.state);
      return { ...r, state: settled.state };
    };
    const plain = (fn: (s: GameState) => GameState): void => {
      lifeRun((s) => ({ state: fn(s) }));
    };
    const life: LifeActions = {
      act: (id) => lifeRun((s) => act(s, id)),
      answer: (id) => plain((s) => answerEvent(s, id)),
      startSession: (e) => plain((s) => startSession(s, e)),
      endSession: () => plain(endSession),
      upgradeGym: () => plain(upgradeGym),
      buyFurniture: (id) => plain((s) => buyFurniture(s, id)),
      sellFurniture: (id) => plain((s) => sellFurniture(s, id)),
      adoptCat: (b) => plain((s) => adoptCat(s, b)),
      rehomeCat: (id) => plain((s) => rehomeCat(s, id)),
      dismiss: () => plain(dismissResult),
    };
    return {
      state,
      dayEvents,
      life,
      setTitle: (id) => {
        const cur = ref.current;
        if (!cur) return;
        const s = structuredClone(cur);
        if (id) s.title = id;
        else delete s.title;
        commit(s);
      },
      createCharacter: (c) => commit(newCharacterState(c, now(), createState)),
      recordRep: (exercise, quality) => run((s) => applyRep(s, { exercise, quality }, now())),
      rerollDaily: (index) => {
        if (ref.current) commit(reroll(ref.current, index));
      },
      setHasBar: (v) => {
        const cur = ref.current;
        if (!cur) return;
        const s = structuredClone(cur);
        s.character.hasBar = v;
        commit(s);
      },
      setAppearance: (a, color) => {
        const cur = ref.current;
        if (!cur) return;
        const s = structuredClone(cur);
        s.character.appearance = a;
        s.character.color = color;
        commit(s);
      },
      buy: (id) => {
        const cur = ref.current;
        if (!cur) return 'unknown';
        const r = buyItem(cur, id);
        if (!r.error) commit(r.state);
        return r.error;
      },
      equip: (id) => {
        if (ref.current) commit(equipItem(ref.current, id));
      },
      unequip: (slot) => {
        if (ref.current) commit(unequipSlot(ref.current, slot));
      },
      reset: () => {
        clearGame();
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
