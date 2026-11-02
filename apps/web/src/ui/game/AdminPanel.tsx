import { useState, type ChangeEvent } from 'react';
import type { GameEvent } from '../../game/engine';
import { useGame } from '../../game/GameContext';
import { levelOf } from '../../game/levels';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { EXERCISES } from '../../tracking/exercises';
import { downloadJson } from '../feedback';
import { eventText } from './text';

/**
 * Режим администратора для тестирования. Включается ссылкой с ?admin,
 * выключается здесь же. Все действия идут через игровой движок.
 */
export function AdminPanel({ onClose }: { onClose(): void }) {
  const { t, tf } = useI18n();
  const { state, admin } = useGame();
  const [level, setLevelInput] = useState(String(state ? levelOf(state.totalXp) : 1));
  const [exercise, setExercise] = useState<ExerciseId>('pushup');
  const [count, setCount] = useState('10');
  const [quality, setQuality] = useState('90');
  const [log, setLog] = useState<string[]>([]);
  if (!state) return null;

  const report = (events: GameEvent[]): void => {
    const lines = events.filter((e) => e.kind !== 'xp').map((e) => eventText(t, tf, e)).filter((x): x is string => !!x);
    setLog([tf('adminDone', { n: events.length }), ...lines].slice(0, 8));
  };
  const num = (v: string, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="overlay">
      <div className="sheet admin-sheet">
        <div className="card-head">
          <h2>{t('adminTitle')}</h2>
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small">{t('adminNote')}</p>

        <div className="admin-row">
          <span>{t('adminGold')}</span>
          <button className="btn" onClick={() => report(admin.grant({ gold: 100 }))}>+100</button>
          <button className="btn" onClick={() => report(admin.grant({ gold: 1000 }))}>+1000</button>
          <button className="btn" onClick={() => report(admin.grant({ gold: 10000 }))}>+10000</button>
        </div>
        <div className="admin-row">
          <span>{t('adminXp')}</span>
          <button className="btn" onClick={() => report(admin.grant({ xp: 100 }))}>+100</button>
          <button className="btn" onClick={() => report(admin.grant({ xp: 1000 }))}>+1000</button>
        </div>
        <div className="admin-row">
          <span>{t('adminLevel')}</span>
          <input className="admin-input" type="number" min={1} max={99} value={level} onChange={(e: ChangeEvent<HTMLInputElement>) => setLevelInput(e.target.value)} />
          <button className="btn" onClick={() => report(admin.setLevel(num(level, 1)))}>
            {t('adminSetLevel')}
          </button>
        </div>

        <h3>{t('adminReps')}</h3>
        <div className="admin-row">
          <select className="admin-input wide" value={exercise} onChange={(e: ChangeEvent<HTMLSelectElement>) => setExercise(e.target.value as ExerciseId)}>
            {EXERCISES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {t(`exercise.${ex.id}` as I18nKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-row">
          <span>×</span>
          <input className="admin-input" type="number" min={1} max={500} value={count} onChange={(e: ChangeEvent<HTMLInputElement>) => setCount(e.target.value)} />
          <span>{t('adminQuality')}</span>
          <input className="admin-input" type="number" min={0} max={100} value={quality} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuality(e.target.value)} />
          <button className="btn primary" onClick={() => report(admin.simulate(exercise, Math.min(500, Math.max(1, num(count, 1))), Math.min(100, Math.max(0, num(quality, 90)))))}>
            {t('adminRun')}
          </button>
        </div>

        <div className="admin-actions">
          <button className="btn" onClick={() => report(admin.completeDailies())}>
            {t('adminDailies')}
          </button>
          <button className="btn" onClick={() => report(admin.completeQuests())}>
            {t('adminQuests')}
          </button>
          <button className="btn" onClick={() => admin.resetReroll()}>
            {t('adminReroll')}
          </button>
          <button className="btn" onClick={() => admin.refillStory()}>
            {t('adminStoryRefill')}
          </button>
          <button className="btn" onClick={() => admin.unlockAll()}>
            {t('adminUnlock')}
          </button>
        </div>

        <h3>{t('adminTime')}</h3>
        <p className="muted small">{tf('adminDay', { d: state.today, n: admin.dayOffset })}</p>
        <div className="admin-row">
          <button className="btn" onClick={() => report(admin.shiftDays(1))}>
            {t('adminNextDay')}
          </button>
          <button className="btn" onClick={() => report(admin.shiftDays(2))}>
            {t('adminSkipDay')}
          </button>
          <button className="btn" onClick={() => admin.resetClock()}>
            {t('adminResetClock')}
          </button>
        </div>

        {log.length > 0 && (
          <ul className="admin-log">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}

        <div className="admin-actions">
          <button className="btn" onClick={() => downloadJson(state, `fitness-rpg-save-${state.today}.json`)}>
            {t('adminExport')}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              admin.setEnabled(false);
              onClose();
            }}
          >
            {t('adminOff')}
          </button>
        </div>
      </div>
    </div>
  );
}
