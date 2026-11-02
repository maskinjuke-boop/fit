import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExerciseId } from '../tracking/exercise';
import { applyRep, ensureDay, newCharacterState, reroll, type GameEvent } from './engine';
import { createState, type Character, type GameState } from './state';
import { clearGame, loadGame, saveGame } from './storage';

interface Game {
  state: GameState | null;
  /** События последнего перехода на новый день (сгоревшая серия и т. п.). */
  dayEvents: GameEvent[];
  createCharacter(c: Omit<Character, 'id' | 'createdDay'>): void;
  /** Засчитанный повтор → игровые события (опыт, уровни, квесты). */
  recordRep(exercise: ExerciseId, quality: number): GameEvent[];
  rerollDaily(index: number): void;
  setHasBar(v: boolean): void;
  reset(): void;
}

const Ctx = createContext<Game | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(() => {
    const loaded = loadGame();
    return loaded ? ensureDay(loaded, new Date()).state : null;
  });
  const [dayEvents, setDayEvents] = useState<GameEvent[]>([]);
  // Повторы приходят из цикла кадров быстрее, чем React перерисовывает: держим актуальное состояние в ref.
  const ref = useRef(state);

  const commit = useCallback((s: GameState | null) => {
    ref.current = s;
    setState(s);
    if (s) saveGame(s);
  }, []);

  // Новый день наступает и при открытой вкладке: проверяем при возврате на неё.
  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState !== 'visible' || !ref.current) return;
      const r = ensureDay(ref.current, new Date());
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
  }, [commit]);

  const value = useMemo<Game>(
    () => ({
      state,
      dayEvents,
      createCharacter: (c) => commit(newCharacterState(c, new Date(), createState)),
      recordRep: (exercise, quality) => {
        const cur = ref.current;
        if (!cur) return [];
        const r = applyRep(cur, { exercise, quality }, new Date());
        commit(r.state);
        return r.events;
      },
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
      reset: () => {
        clearGame();
        commit(null);
      },
    }),
    [state, dayEvents, commit],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): Game {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGame outside GameProvider');
  return g;
}
