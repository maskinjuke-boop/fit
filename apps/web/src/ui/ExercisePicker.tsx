import { useI18n, type I18nKey } from '../i18n';
import type { ExerciseDef } from '../tracking/exercise';
import { EXERCISES } from '../tracking/exercises';
import type { Metrics } from '../tracking/types';

const VIEW_ICON: Record<ExerciseDef['view'], string> = {
  side: '◧',
  sideOr45: '◩',
  front: '◉',
  frontOrBack: '◉',
};

export function ExercisePicker({ onPick, onAccuracy }: { onPick(def: ExerciseDef<Metrics>): void; onAccuracy(): void }) {
  const { t, lang, setLang } = useI18n();
  return (
    <main className="picker">
      <header className="picker-head">
        <div>
          <h1>{t('appTitle')}</h1>
          <p className="muted">{t('appSubtitle')}</p>
        </div>
        <button className="chip" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} aria-label="language">
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
      </header>

      <p className="privacy">{t('privacy')}</p>
      <h2>{t('chooseExercise')}</h2>

      <ul className="exercise-list">
        {EXERCISES.map((e) => (
          <li key={e.id}>
            <button className={`exercise-card ${e.liteOf ? 'lite' : ''}`} onClick={() => onPick(e)}>
              <span className="exercise-icon" aria-hidden>
                {VIEW_ICON[e.view]}
              </span>
              <span className="exercise-text">
                <span className="exercise-name">
                  {t(`exercise.${e.id}` as I18nKey)}
                  {e.liteOf && <span className="tag">{t('lite')}</span>}
                </span>
                <span className="exercise-setup">{t(`setup.${e.id}` as I18nKey)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button className="btn wide" onClick={onAccuracy}>
        {t('accuracyTitle')}
      </button>
    </main>
  );
}
