import type { GameState } from '../../game/state';
import { catName, maxCats } from '../../game/life';
import { useI18n } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';

/**
 * Полоса поверх камеры, пока герой спасает кошку дня: сколько повторов назначенного демоном
 * упражнения сделано. После последнего — «спасена!».
 */
export function DemonOverlay({ state, exercise }: { state: GameState; exercise: ExerciseId }) {
  const { t, tf, lang } = useI18n();
  const o = state.life.demon;
  if (!o || o.exercise !== exercise || o.status === 'lost') return null;
  const name = catName(o)[lang];
  const saved = o.status === 'saved';
  return (
    <div className="session-layer demon-layer">
      <div className={`session-bar ${saved ? 'done' : ''}`}>
        <span>{saved ? tf('demon.savedBar', { name }) : tf('demon.bar', { name, n: o.progress, m: o.target })}</span>
        {!saved && (
          <span className="need-bar">
            <span style={{ width: `${Math.min(100, (o.progress / o.target) * 100)}%` }} />
          </span>
        )}
        {!saved && state.life.cats.length >= maxCats(state.life) && <span className="bad small">{t('demon.full')}</span>}
      </div>
    </div>
  );
}
