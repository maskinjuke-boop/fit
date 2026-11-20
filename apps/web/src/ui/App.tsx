import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../game/engine';
import { useGame } from '../game/GameContext';
import { useI18n, type I18nKey } from '../i18n';
import { PoseEngine, PoseEngineError } from '../pose/poseEngine';
import type { ExerciseDef, ExerciseId } from '../tracking/exercise';
import { getExercise } from '../tracking/exercises';
import type { Metrics } from '../tracking/types';
import { AccuracyPanel } from './AccuracyPanel';
import { CityScreen } from './city/CityScreen';
import { countdown, toMidnight } from './city/cityText';
import { ExercisePicker } from './ExercisePicker';
import { AdminPanel } from './game/AdminPanel';
import { Onboarding } from './game/Onboarding';
import { OfferingOverlay } from './game/SessionOverlay';
import { SessionSummary, type Session } from './game/SessionSummary';
import { TrackingScreen } from './TrackingScreen';

type EngineState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; engine: PoseEngine } | { status: 'error'; code: 'wasm' | 'model'; detail: string };
type Tab = 'city' | 'train';

export function App() {
  const { t, lang } = useI18n();
  const L = (ru: string, en: string): string => (lang === 'ru' ? ru : en);
  const game = useGame();
  const [tab, setTab] = useState<Tab>('city');
  const [returnTab, setReturnTab] = useState<Tab>('city');
  const [exercise, setExercise] = useState<ExerciseDef<Metrics> | null>(null);
  const [engine, setEngine] = useState<EngineState>({ status: 'idle' });
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [summary, setSummary] = useState<Session | null>(null);
  const [fire, setFire] = useState<Extract<GameEvent, { kind: 'cityFire' }> | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const loading = useRef<Promise<void> | null>(null);
  const session = useRef<Session>({ reps: 0, gold: 0, events: [] });

  const loadEngine = useCallback(() => {
    if (loading.current) return loading.current;
    setEngine({ status: 'loading' });
    loading.current = PoseEngine.create('lite')
      .then((e) => setEngine({ status: 'ready', engine: e }))
      .catch((err: unknown) => {
        const code = err instanceof PoseEngineError ? err.code : 'model';
        setEngine({ status: 'error', code, detail: String(err) });
      })
      .finally(() => {
        loading.current = null;
      });
    return loading.current;
  }, []);

  // Модель грузится один раз и заранее, пока игрок смотрит на город.
  const hasGame = game.state !== null;
  useEffect(() => {
    if (hasGame && engine.status === 'idle') void loadEngine();
  }, [loadEngine, hasGame, engine.status]);

  // Гнев богов при смене дня — окно с новостью.
  useEffect(() => {
    const e = game.dayEvents.find((x): x is Extract<GameEvent, { kind: 'cityFire' }> => x.kind === 'cityFire');
    if (e) setFire(e);
  }, [game.dayEvents]);

  const startExercise = (def: ExerciseDef<Metrics>, from: Tab): void => {
    session.current = { reps: 0, gold: 0, events: [] };
    setReturnTab(from);
    setExercise(def);
  };

  const onRep = (ex: ExerciseId, quality: number): GameEvent[] => {
    const events = game.recordRep(ex, quality);
    const s = session.current;
    s.reps += 1;
    for (const e of events) {
      if (e.kind === 'gold') s.gold += e.amount;
      else s.events.push(e);
    }
    return events;
  };

  const finishExercise = (): void => {
    setExercise(null);
    setTab(returnTab);
    if (session.current.reps > 0) setSummary({ ...session.current });
  };

  if (!game.state) return <Onboarding />;
  const state = game.state;
  const offering = state.city.offering && state.city.offering.day === state.today ? state.city.offering : null;

  if (exercise && engine.status === 'ready') {
    const overlay = offering?.tasks.some((x) => x.exercise === exercise.id) ? () => <OfferingOverlay state={state} exercise={exercise.id} /> : undefined;
    return <TrackingScreen exercise={exercise} engine={engine.engine} onBack={finishExercise} onRep={onRep} overlay={overlay} />;
  }

  const offeringLine = offering ? (offering.complete ? '✨' : `${offering.tasks.filter((x) => x.done >= x.target).length}/${offering.tasks.length}`) : null;

  return (
    <div className={`shell ${tab === 'city' ? 'shell-city' : ''}`}>
      {tab === 'city' && <CityScreen state={state} onTrain={(ex) => (ex ? startExercise(getExercise(ex), 'city') : setTab('train'))} />}
      {tab === 'train' && (
        <div className="shell-body">
          {offering && (
            <div className={`train-offering ${offering.complete ? 'ok' : ''}`}>
              <b>⛩️ {offering.complete ? L('Подношение принято — боги довольны', 'Offering accepted — the gods are pleased') : L(`Подношение богам · ⏳ ${countdown(toMidnight())}`, `Offering to the gods · ⏳ ${countdown(toMidnight())}`)}</b>
              <div className="train-offering-tasks">
                {offering.tasks.map((x) => (
                  <button key={x.exercise} className={`chip ${x.done >= x.target ? 'on' : ''}`} onClick={() => startExercise(getExercise(x.exercise), 'train')}>
                    {x.done >= x.target ? '✓ ' : ''}
                    {t(`exercise.${x.exercise}` as I18nKey)} {Math.min(x.done, x.target)}/{x.target}
                  </button>
                ))}
              </div>
              <span className="muted small">{L('Каждый повтор любого упражнения — ◈ 1 на стройку города.', 'Every rep of any exercise earns ◈ 1 for the town.')}</span>
            </div>
          )}
          <ExercisePicker embedded onPick={(def) => startExercise(def, 'train')} onAccuracy={() => setShowAccuracy(true)} />
        </div>
      )}
      <nav className="bottom-nav two">
        <button className={tab === 'city' ? 'on' : ''} onClick={() => setTab('city')}>
          <span className="nav-icon">🏘️</span>
          <span>{t('tab.city')}</span>
        </button>
        <button
          className={tab === 'train' ? 'on' : ''}
          onClick={() => {
            setTab('train');
            window.scrollTo(0, 0);
          }}
        >
          <span className="nav-icon">💪</span>
          <span>
            {t('tab.train')}
            {offeringLine && !offering?.complete ? ` · ⛩️ ${offeringLine}` : ''}
          </span>
        </button>
      </nav>
      {game.adminEnabled && (
        <button className="admin-fab" onClick={() => setShowAdmin(true)} aria-label={t('admin')}>
          ⚙
        </button>
      )}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {exercise && engine.status === 'loading' && (
        <div className="overlay">
          <div className="sheet center">
            <div className="spinner" />
            <p>{t('loading')}</p>
          </div>
        </div>
      )}
      {exercise && engine.status === 'error' && (
        <div className="overlay">
          <div className="sheet">
            <p className="error-text">{t(engine.code === 'wasm' ? 'error.wasm' : 'error.model')}</p>
            <p className="muted small mono">{engine.detail}</p>
            <div className="row">
              <button className="btn" onClick={() => setExercise(null)}>
                {t('back')}
              </button>
              <button className="btn primary" onClick={() => void loadEngine()}>
                {t('retry')}
              </button>
            </div>
          </div>
        </div>
      )}
      {fire && (
        <div className="overlay">
          <div className="sheet fire-sheet">
            <h2>🔥 {L('Боги разгневались', 'The gods are angry')}</h2>
            <p>
              {L(
                `Подношение не было сделано до полуночи. Сгорело домов: ${fire.houses}.`,
                `The offering was not made before midnight. Houses burned: ${fire.houses}.`,
              )}
            </p>
            {fire.cats.length > 0 && (
              <p className="bad">
                🕯️ {L('Погибли', 'Lost')}: {fire.cats.join(', ')}
              </p>
            )}
            <p className="muted small">{L('На месте домов — горки пепла. Расчистите их и сделайте сегодняшнее подношение.', 'Only piles of ash remain. Clear them and make today’s offering.')}</p>
            <div className="row">
              <button className="btn primary" onClick={() => setFire(null)}>
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      )}
      {summary && (
        <SessionSummary
          session={summary}
          offering={offering ? (offering.complete ? '✨' : `${offering.tasks.filter((x) => x.done >= x.target).length}/${offering.tasks.length}`) : null}
          onClose={() => setSummary(null)}
        />
      )}
      {showAccuracy && <AccuracyPanel onClose={() => setShowAccuracy(false)} />}
    </div>
  );
}
