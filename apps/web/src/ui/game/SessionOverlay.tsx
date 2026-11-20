import type { GameState } from '../../game/state';
import { useI18n } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { exName } from './text';

/** Полоса поверх камеры: сколько повторов этого упражнения ещё нужно для подношения богам. */
export function OfferingOverlay({ state, exercise }: { state: GameState; exercise: ExerciseId }) {
  const { t, lang } = useI18n();
  const o = state.city.offering;
  const task = o && o.day === state.today ? o.tasks.find((x) => x.exercise === exercise) : undefined;
  if (!o || !task) return null;
  const all = o.tasks.filter((x) => x.done >= x.target).length;
  const done = task.done >= task.target;
  return (
    <div className="session-layer offering-layer">
      <div className={`session-bar ${done ? 'done' : ''}`}>
        <span>
          ⛩️ {exName(t, exercise)} {Math.min(task.done, task.target)}/{task.target}
          {o.complete ? (lang === 'ru' ? ' · подношение принято ✨' : ' · offering accepted ✨') : done ? (lang === 'ru' ? ` · готово (${all}/${o.tasks.length})` : ` · done (${all}/${o.tasks.length})`) : ''}
        </span>
        {!done && (
          <span className="need-bar">
            <span style={{ width: `${Math.min(100, (task.done / task.target) * 100)}%` }} />
          </span>
        )}
      </div>
    </div>
  );
}
