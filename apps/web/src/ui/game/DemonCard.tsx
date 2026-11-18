import { useEffect, useState } from 'react';
import { catGrowth, catName, maxCats, offerLeftMs } from '../../game/life';
import type { GameState } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { catBreedText } from './catText';
import { CatImage } from './Renders';

/** Сколько осталось до полуночи: «5 ч 12 мин». */
function useLeft(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return offerLeftMs(new Date(now));
}

/**
 * Кошка дня в лавке демона: кто сидит в клетке, какое упражнение и сколько повторов
 * демон просит, сколько осталось времени. Кнопка открывает упражнение перед камерой.
 */
export function DemonCard({ state, onRescue, compact = false }: { state: GameState; onRescue(exercise: ExerciseId): void; compact?: boolean }) {
  const { t, tf, lang } = useI18n();
  const left = useLeft();
  const o = state.life.demon;
  if (!o) return null;
  const name = catName(o)[lang];
  const ex = t(`exercise.${o.exercise}` as I18nKey);
  const full = state.life.cats.length >= maxCats(state.life);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const grow = catGrowth({ born: state.life.day - o.age }, state.life.day);
  return (
    <section className={`card demon-card ${o.status}`}>
      <div className="demon-head">
        <span className="demon-face">😈</span>
        <div>
          <b>{t('demon.title')}</b>
          <div className="muted small">{o.status === 'waiting' ? tf('demon.left', { h, m }) : o.status === 'saved' ? t('demon.doneToday') : t('demon.lostToday')}</div>
        </div>
      </div>
      <div className="demon-cat">
        <CatImage breed={o.breed} mix={o.mix} grow={grow} size={compact ? 84 : 112} />
        <div>
          <b className="big">🐈 {name}</b>
          <div className="muted small">
            {catBreedText(o, lang, t)} · {t(o.sex === 'f' ? 'cat.f' : 'cat.m')} · {o.age < 12 ? tf('cat.months', { n: o.age }) : tf('cat.years', { n: Math.floor(o.age / 12) })}
          </div>
          {o.status === 'waiting' && <p className="demon-quote small">{tf('demon.quote', { ex, n: o.target })}</p>}
          {o.status === 'saved' && <p className="good small">{tf('demon.saved', { name })}</p>}
          {o.status === 'lost' && <p className="bad small">{tf('demon.lost', { name })}</p>}
        </div>
      </div>
      {o.status === 'waiting' && (
        <>
          <div className="need wide">
            <span className="need-name">{ex}</span>
            <span className="need-bar">
              <span style={{ width: `${Math.min(100, (o.progress / o.target) * 100)}%` }} />
            </span>
            <span className="need-val">
              {o.progress}/{o.target}
            </span>
          </div>
          {full && <p className="bad small">{t('demon.full')}</p>}
          <button className="btn primary wide" disabled={full} onClick={() => onRescue(o.exercise)}>
            🏋️ {tf('demon.go', { ex, n: Math.max(0, o.target - o.progress) })}
          </button>
        </>
      )}
      {!compact && <p className="muted small">{t('demon.rules')}</p>}
    </section>
  );
}
