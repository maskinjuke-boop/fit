import { useState, type ChangeEvent } from 'react';
import { adminAddCats, adminCatMoney, adminFire, adminHour, adminNeeds, adminOffering, adminSkip, adminTown } from '../../game/city/city';
import { TOWNS } from '../../game/city/content';
import { hourOf, townLevel } from '../../game/city/sim';
import { applyRep, type GameEvent, type Result } from '../../game/engine';
import { useGame } from '../../game/GameContext';
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
  const { t, tf, lang } = useI18n();
  const L = (ru: string, en: string): string => (lang === 'ru' ? ru : en);
  const { state, admin } = useGame();
  const [exercise, setExercise] = useState<ExerciseId>('squat');
  const [count, setCount] = useState('10');
  const [log, setLog] = useState<string[]>([]);
  if (!state) return null;
  const c = state.city;
  const o = c.offering;

  const report = (events: GameEvent[]): void => {
    const lines = events.map((e) => eventText(t, tf, e)).filter((x): x is string => !!x);
    setLog([L(`Готово, событий: ${events.length}`, `Done, events: ${events.length}`), ...[...new Set(lines)]].slice(0, 8));
  };
  /** Повторы как с камеры: монеты и подношение. */
  const simulate = (ex: ExerciseId, n: number): void =>
    report(
      admin.apply((s): Result => {
        let cur: Result = { state: s, events: [] };
        for (let i = 0; i < n; i += 1) {
          const r = applyRep(cur.state, { exercise: ex, quality: 92 }, new Date(Date.now() + admin.dayOffset * 86_400_000));
          cur = { state: r.state, events: [...cur.events, ...r.events] };
        }
        return cur;
      }),
    );
  const num = (v: string, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const hh = hourOf(c.clock);

  return (
    <div className="overlay">
      <div className="sheet admin-sheet">
        <div className="card-head">
          <h2>{t('admin')}</h2>
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small">{L('Тестовые инструменты: сохранение помечается как изменённое администратором.', 'Test tools: the save is marked as changed by admin.')}</p>
        <div className="admin-row">
          <span>◈</span>
          <button className="btn" onClick={() => admin.grant(100)}>+100</button>
          <button className="btn" onClick={() => admin.grant(1000)}>+1000</button>
          <button className="btn" onClick={() => admin.grant(10000)}>+10000</button>
        </div>

        <h3>{L('Повторы', 'Reps')}</h3>
        <div className="admin-row">
          <select className="admin-input wide" value={exercise} onChange={(e: ChangeEvent<HTMLSelectElement>) => setExercise(e.target.value as ExerciseId)}>
            {EXERCISES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {t(`exercise.${ex.id}` as I18nKey)}
              </option>
            ))}
          </select>
          <span>×</span>
          <input className="admin-input" type="number" min={1} max={500} value={count} onChange={(e: ChangeEvent<HTMLInputElement>) => setCount(e.target.value)} />
          <button className="btn primary" onClick={() => simulate(exercise, Math.min(500, Math.max(1, num(count, 1))))}>
            {L('Сделать', 'Run')}
          </button>
        </div>

        <h3>⛩️ {L('Подношение', 'Offering')}</h3>
        <p className="muted small">
          {o ? `${o.day}: ${o.tasks.map((x) => `${t(`exercise.${x.exercise}` as I18nKey)} ${x.done}/${x.target}`).join(', ')}${o.complete ? ' ✓' : ''}` : '—'}
        </p>
        <div className="admin-grid">
          <button className="btn primary" disabled={!o || o.complete} onClick={() => o && o.tasks.forEach((x) => x.done < x.target && simulate(x.exercise, x.target - x.done))}>
            {L('Выполнить упражнениями', 'Complete with reps')}
          </button>
          <button className="btn" onClick={() => admin.apply((s) => adminOffering(s, true))}>{L('Отметить сделанным', 'Mark done')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminOffering(s, false))}>{L('Сбросить', 'Reset')}</button>
          <button className="btn danger" onClick={() => admin.apply(adminFire)}>🔥 {L('Гнев богов сейчас', 'Wrath of gods now')}</button>
        </div>

        <h3>🏘️ {L('Город', 'Town')}</h3>
        <p className="muted small">
          {L(
            `Кошек: ${c.cats.length}, зданий: ${c.buildings.length}, ступень: ${TOWNS[townLevel(c)]!.name.ru}, время: ${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`,
            `Cats: ${c.cats.length}, buildings: ${c.buildings.length}, tier: ${TOWNS[townLevel(c)]!.name.en}, time: ${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`,
          )}
        </p>
        <div className="admin-grid">
          <button className="btn" onClick={() => admin.apply((s) => adminAddCats(s, 1))}>+1 🐱 {L('с домом', 'with house')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminAddCats(s, 5))}>+5 🐱</button>
          <button className="btn" onClick={() => admin.apply((s) => adminCatMoney(s, 300))}>{L('Кошкам +300', 'Cats +300')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminNeeds(s, 100))}>{L('Все сыты и бодры', 'All needs full')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminNeeds(s, 15))}>{L('Все голодные', 'All needs low')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminTown(s, townLevel(s.city) + 1))}>{L('Ступень +1', 'Tier +1')}</button>
        </div>
        <div className="admin-row">
          <span>🕒</span>
          <button className="btn" onClick={() => admin.apply((s) => adminSkip(s, 60))}>+1 {L('ч', 'h')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminSkip(s, 360))}>+6 {L('ч', 'h')}</button>
          <button className="btn" onClick={() => admin.apply((s) => adminHour(s, 8))}>08:00</button>
          <button className="btn" onClick={() => admin.apply((s) => adminHour(s, 13))}>13:00</button>
          <button className="btn" onClick={() => admin.apply((s) => adminHour(s, 19))}>19:00</button>
          <button className="btn" onClick={() => admin.apply((s) => adminHour(s, 23))}>23:00</button>
        </div>

        <h3>{L('Реальный день', 'Real day')}</h3>
        <p className="muted small">
          {state.today} ({L('сдвиг', 'offset')} {admin.dayOffset})
        </p>
        <div className="admin-row">
          <button className="btn" onClick={() => report(admin.shiftDays(1))}>{L('Следующий день', 'Next day')}</button>
          <button className="btn" onClick={() => report(admin.shiftDays(2))}>{L('Пропустить день', 'Skip a day')}</button>
          <button className="btn" onClick={() => admin.resetClock()}>{L('Сбросить часы', 'Reset clock')}</button>
        </div>

        {log.length > 0 && (
          <ul className="admin-log">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}

        <div className="admin-actions">
          <button className="btn" onClick={() => downloadJson(state, `cat-town-save-${state.today}.json`)}>
            {L('Скачать сохранение', 'Download save')}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              admin.setEnabled(false);
              onClose();
            }}
          >
            {L('Выключить режим', 'Turn admin off')}
          </button>
        </div>
      </div>
    </div>
  );
}
