import { lazy, Suspense, useState } from 'react';
import type { GameState } from '../../game/state';
import { useI18n } from '../../i18n';
import { clientMember } from './Life';

const SessionCrew3D = lazy(() => import('./three/SessionCrew3D'));

/**
 * Слой занятия поверх камеры: ученики в 3D повторяют каждое засчитанное движение тренера,
 * сверху — прогресс занятия. После последнего повтора — сообщение об оплате;
 * ученики продолжают повторять, пока тренер не закончит.
 */
export function SessionOverlay({ state, count }: { state: GameState; count: number }) {
  const { tf } = useI18n();
  // Состав и упражнение фиксируются при открытии экрана.
  const [start] = useState(() => {
    const s = state.life.session;
    if (!s) return null;
    return { exercise: s.exercise, target: s.target, members: state.life.clients.filter((c) => s.clients.includes(c.id)).map(clientMember) };
  });
  if (!start) return null;
  const sess = state.life.session;
  const progress = sess ? sess.progress : start.target;
  const pay = !sess && state.life.last ? state.life.last.money : 0;
  return (
    <div className="session-layer">
      <div className={`session-bar ${sess ? '' : 'done'}`}>
        <span>{sess ? tf('life.sessionBar', { n: progress, m: start.target }) : tf('life.sessionDoneBar', { pay })}</span>
        <span className="need-bar">
          <span style={{ width: `${Math.min(100, (progress / start.target) * 100)}%` }} />
        </span>
      </div>
      <Suspense fallback={null}>
        <SessionCrew3D clients={start.members} exercise={start.exercise} reps={count} />
      </Suspense>
    </div>
  );
}
