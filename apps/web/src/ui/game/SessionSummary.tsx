import type { GameEvent } from '../../game/engine';
import { useI18n } from '../../i18n';
import { eventText } from './text';

export interface Session {
  reps: number;
  xp: number;
  gold: number;
  events: GameEvent[];
}

const SHOWN: ReadonlyArray<GameEvent['kind']> = ['levelUp', 'statLevelUp', 'questDone', 'dailyDone', 'dailyBonus', 'streak', 'achievement', 'sessionDone', 'quotaDone'];

/** Итог тренировки: повторы, опыт, золото и что произошло (уровни, квесты, задания). */
export function SessionSummary({ session, onClose }: { session: Session; onClose(): void }) {
  const { t, tf, lang } = useI18n();
  const lines = session.events.filter((e) => SHOWN.includes(e.kind)).map((e) => eventText(t, tf, e, lang)).filter((x): x is string => !!x);
  return (
    <div className="overlay">
      <div className="sheet">
        <h2>{t('summaryTitle')}</h2>
        <div className="summary-grid">
          <div>
            <b>{session.reps}</b>
            <span className="muted small">{t('summaryReps')}</span>
          </div>
          <div>
            <b>+{Math.round(session.xp)}</b>
            <span className="muted small">{t('summaryXp')}</span>
          </div>
          <div>
            <b>+{session.gold}</b>
            <span className="muted small">{t('summaryGold')}</span>
          </div>
        </div>
        {lines.length > 0 && (
          <ul className="summary-events">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn primary" onClick={onClose}>
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}
