import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../game/engine';
import { useGame } from '../game/GameContext';
import { ITEMS } from '../game/items';
import { useI18n } from '../i18n';
import { PoseEngine, PoseEngineError } from '../pose/poseEngine';
import type { ExerciseDef, ExerciseId } from '../tracking/exercise';
import type { Metrics } from '../tracking/types';
import { AccuracyPanel } from './AccuracyPanel';
import { ExercisePicker } from './ExercisePicker';
import { BottomNav, HeroHeader, HeroTab, HomeTab, QuestsTab, type Tab } from './game/GameScreens';
import { AdminPanel } from './game/AdminPanel';
import { Onboarding } from './game/Onboarding';
import { preloadItemImages } from './game/Renders';
import { ShopTab } from './game/Shop';
import { SessionSummary, type Session } from './game/SessionSummary';
import { eventText } from './game/text';
import { TrackingScreen } from './TrackingScreen';

type EngineState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; engine: PoseEngine } | { status: 'error'; code: 'wasm' | 'model'; detail: string };

export function App() {
  const { t, tf } = useI18n();
  const game = useGame();
  const [tab, setTab] = useState<Tab>('home');
  const [exercise, setExercise] = useState<ExerciseDef<Metrics> | null>(null);
  const [engine, setEngine] = useState<EngineState>({ status: 'idle' });
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [summary, setSummary] = useState<Session | null>(null);
  const [dayBanner, setDayBanner] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const loading = useRef<Promise<void> | null>(null);
  const session = useRef<Session>({ reps: 0, xp: 0, gold: 0, events: [] });

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

  // Модель грузится один раз и заранее, пока человек смотрит задания.
  // Зависимость — только факт наличия персонажа: каждый повтор меняет состояние игры,
  // и перезагрузка модели на каждое изменение сбрасывала бы экран тренировки.
  const hasHero = game.state !== null;
  useEffect(() => {
    if (hasHero && engine.status === 'idle') void loadEngine();
  }, [loadEngine, hasHero, engine.status]);

  // Иконки предметов рисуются из 3D-моделей заранее, пока игрок на главной.
  const heroColor = game.state?.character.color;
  const heroFigure = game.state?.character.appearance.figure;
  useEffect(() => {
    if (!heroColor || !heroFigure) return;
    const id = setTimeout(() => preloadItemImages(ITEMS.map((i) => i.id), heroColor, heroFigure), 1500);
    return () => clearTimeout(id);
  }, [heroColor, heroFigure]);

  // Сообщение о переходе дня (сгоревшая серия, заморозка).
  useEffect(() => {
    const e = game.dayEvents.find((x) => x.kind === 'streakLost' || x.kind === 'freezeUsed');
    if (e) setDayBanner(eventText(t, tf, e));
  }, [game.dayEvents, t, tf]);

  const startExercise = (def: ExerciseDef<Metrics>): void => {
    session.current = { reps: 0, xp: 0, gold: 0, events: [] };
    setExercise(def);
  };

  const onRep = (ex: ExerciseId, quality: number): GameEvent[] => {
    const events = game.recordRep(ex, quality);
    const s = session.current;
    s.reps += 1;
    for (const e of events) {
      if (e.kind === 'xp') s.xp += e.amount;
      if (e.kind === 'questDone' || e.kind === 'dailyDone' || e.kind === 'dailyBonus') {
        s.xp += e.xp;
        s.gold += e.gold;
      }
      if (e.kind !== 'xp') s.events.push(e);
    }
    return events;
  };

  const finishExercise = (): void => {
    setExercise(null);
    setTab('home');
    if (session.current.reps > 0) setSummary({ ...session.current });
  };

  if (!game.state) return <Onboarding />;
  const state = game.state;

  if (exercise && engine.status === 'ready') {
    return <TrackingScreen exercise={exercise} engine={engine.engine} onBack={finishExercise} onRep={onRep} />;
  }

  return (
    <div className="shell">
      <HeroHeader state={state} />
      {dayBanner && (
        <button className="day-banner" onClick={() => setDayBanner(null)}>
          {dayBanner} ✕
        </button>
      )}
      <div className="shell-body">
        {tab === 'home' && <HomeTab state={state} onTrain={() => setTab('train')} />}
        {tab === 'train' && <ExercisePicker embedded onPick={startExercise} />}
        {tab === 'quests' && <QuestsTab state={state} />}
        {tab === 'shop' && <ShopTab state={state} />}
        {tab === 'hero' && <HeroTab state={state} onAccuracy={() => setShowAccuracy(true)} />}
      </div>
      <BottomNav
        tab={tab}
        onTab={(next) => {
          setTab(next);
          window.scrollTo(0, 0);
        }}
      />
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
      {summary && <SessionSummary session={summary} onClose={() => setSummary(null)} />}
      {showAccuracy && <AccuracyPanel onClose={() => setShowAccuracy(false)} />}
    </div>
  );
}
