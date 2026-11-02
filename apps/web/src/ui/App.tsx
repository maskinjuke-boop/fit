import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { PoseEngine, PoseEngineError } from '../pose/poseEngine';
import type { ExerciseDef } from '../tracking/exercise';
import type { Metrics } from '../tracking/types';
import { AccuracyPanel } from './AccuracyPanel';
import { ExercisePicker } from './ExercisePicker';
import { TrackingScreen } from './TrackingScreen';

type EngineState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; engine: PoseEngine } | { status: 'error'; code: 'wasm' | 'model'; detail: string };

export function App() {
  const { t } = useI18n();
  const [exercise, setExercise] = useState<ExerciseDef<Metrics> | null>(null);
  const [engine, setEngine] = useState<EngineState>({ status: 'idle' });
  const [showAccuracy, setShowAccuracy] = useState(false);
  const loading = useRef<Promise<void> | null>(null);

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

  // Модель начинает грузиться сразу, пока человек выбирает упражнение.
  useEffect(() => {
    void loadEngine();
  }, [loadEngine]);

  if (exercise && engine.status === 'ready') {
    return <TrackingScreen exercise={exercise} engine={engine.engine} onBack={() => setExercise(null)} />;
  }

  return (
    <>
      <ExercisePicker onPick={setExercise} onAccuracy={() => setShowAccuracy(true)} />
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
      {showAccuracy && <AccuracyPanel onClose={() => setShowAccuracy(false)} />}
    </>
  );
}
