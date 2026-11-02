import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CameraError, keepScreenOn, openCamera, stopStream, type Facing } from '../camera/camera';
import { useI18n, type I18nKey } from '../i18n';
import { AdaptiveQuality, FpsMeter } from '../pose/adaptiveQuality';
import type { PoseEngine, PoseEngineInfo } from '../pose/poseEngine';
import { drawSkeleton } from '../render/skeleton';
import { loadRuns, saveRuns } from '../tools/accuracy';
import { Recorder } from '../tools/recording';
import type { ExerciseDef } from '../tracking/exercise';
import { RepCounter, type RepCounterStats } from '../tracking/repCounter';
import type { Phase } from '../tracking/repStateMachine';
import type { FeedbackKey, FrameHint, Metrics } from '../tracking/types';
import { buzz, downloadJson, speak } from './feedback';

type Source = 'camera' | 'video';

interface DebugInfo {
  fps: number;
  engine: PoseEngineInfo;
  phases: Array<{ machine: string; phase: Phase }>;
  metrics: Metrics | null;
  missing: number[];
}

type Dialog = { mode: 'measure'; startCount: number } | { mode: 'record'; startCount: number; recorder: Recorder } | null;

const ACCENT = '#ffb020';
/** Подсказка по кадру показывается, если проблема держится дольше этого времени. */
const HINT_DELAY_MS = 600;
const FEEDBACK_MS = 1600;

export function TrackingScreen({ exercise, engine, onBack }: { exercise: ExerciseDef<Metrics>; engine: PoseEngine; onBack(): void }) {
  const { t, lang } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef(new RepCounter(exercise));
  const recorderRef = useRef<{ recorder: Recorder; startCount: number } | null>(null);
  const debugRef = useRef<DebugInfo | null>(null);
  const voiceRef = useRef(false);
  const langRef = useRef(lang);
  langRef.current = lang;
  const tRef = useRef(t);
  tRef.current = t;

  const [source, setSource] = useState<Source>('camera');
  // Фронтальная камера по умолчанию: человек видит счётчик и подсказки на экране.
  const [facing, setFacing] = useState<Facing>('user');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [stats, setStats] = useState<RepCounterStats>(counterRef.current.snapshot);
  const [hint, setHint] = useState<FrameHint | null>(null);
  const [feedback, setFeedback] = useState<{ key: FeedbackKey; id: number } | null>(null);
  const [pulse, setPulse] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [voice, setVoice] = useState(false);
  const [recording, setRecording] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  voiceRef.current = voice;

  const mirrored = source === 'camera' && facing === 'user';

  // ── Источник кадров: камера или видеофайл ───────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setStarting(true);
    setError(null);

    if (source === 'camera') {
      openCamera(facing)
        .then((s) => {
          if (cancelled) {
            stopStream(s);
            return;
          }
          stream = s;
          video.srcObject = s;
          video.removeAttribute('src');
          return video.play();
        })
        .then(() => setStarting(false))
        .catch((e: unknown) => {
          if (cancelled) return;
          const code = e instanceof CameraError ? e.code : 'other';
          setError(tRef.current(`error.${code}` as I18nKey));
          setStarting(false);
        });
    } else if (videoUrl) {
      video.srcObject = null;
      video.src = videoUrl;
      video.currentTime = 0;
      void video.play().then(() => setStarting(false)).catch(() => setStarting(false));
    }

    return () => {
      cancelled = true;
      stopStream(stream);
      video.srcObject = null;
    };
  }, [source, facing, videoUrl]);

  // Экран не гаснет, пока открыт экран тренировки.
  useEffect(() => keepScreenOn(), []);

  // ── Цикл обработки кадров ───────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const counter = counterRef.current;
    const meter = new FpsMeter();
    const adaptive = new AdaptiveQuality({ model: engine.info.model, inputScale: engine.info.inputScale });
    let switching = false;
    let stopped = false;
    let invalidSince: number | null = null;
    let lastVideoTime = -1;
    let handle = 0;
    let lastDebugPush = 0;

    // requestVideoFrameCallback вызывает обработку ровно на каждый новый кадр видео;
    // в старых браузерах его нет — тогда requestAnimationFrame.
    const vfc = video as unknown as {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const rvfc = vfc.requestVideoFrameCallback?.bind(video);
    const cancelRvfc = vfc.cancelVideoFrameCallback?.bind(video);
    const schedule = (): void => {
      if (stopped) return;
      handle = rvfc ? rvfc(step) : requestAnimationFrame(step);
    };

    const step = (): void => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        const aspect = vw / vh;
        const raw = engine.detect(video, now);
        const res = counter.process(raw, now, aspect);
        drawSkeleton(ctx, raw, res.pose, aspect, counter.highlight(raw), { visibilityThreshold: exercise.visibilityThreshold, accent: ACCENT });
        recorderRef.current?.recorder.add(raw, now, aspect);

        // Подсказка по кадру — только если проблема держится, чтобы не мигала.
        if (res.hint) {
          if (invalidSince === null) invalidSince = now;
          if (now - invalidSince > HINT_DELAY_MS) setHint(res.hint);
        } else {
          invalidSince = null;
          setHint(null);
        }

        if (res.events.length > 0) {
          setStats(counter.snapshot);
          for (const e of res.events) {
            if (e.kind === 'rep') {
              setPulse((p) => p + 1);
              buzz();
              if (voiceRef.current) speak(String(counter.snapshot.count), langRef.current);
            } else {
              setFeedback({ key: e.reason, id: now });
              if (voiceRef.current) speak(tRef.current(`fb.${e.reason}` as I18nKey), langRef.current);
            }
          }
        }

        // Адаптация модели и разрешения под FPS устройства.
        const fps = meter.tick(now);
        const change = switching ? null : adaptive.update(fps, now);
        if (change?.kind === 'model') {
          switching = true;
          void engine.load(change.to).finally(() => {
            switching = false;
          });
        } else if (change?.kind === 'scale') {
          engine.setInputScale(change.to);
        }

        debugRef.current = { fps, engine: engine.info, phases: res.phases, metrics: res.metrics, missing: res.frame.missing };
        if (now - lastDebugPush > 250) {
          lastDebugPush = now;
          setDebug(debugRef.current);
        }
      }
      schedule();
    };

    schedule();
    return () => {
      stopped = true;
      if (rvfc && cancelRvfc) cancelRvfc(handle);
      else cancelAnimationFrame(handle);
    };
  }, [engine, exercise]);

  // Подсказка о незасчитанном повторе гаснет сама.
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  // ── Действия ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    counterRef.current.reset();
    setStats(counterRef.current.snapshot);
    setFeedback(null);
  }, []);

  const onPickVideo = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setSource('video');
    reset();
  };

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const backToCamera = (): void => {
    setSource('camera');
    reset();
  };

  const toggleRecording = (): void => {
    if (recorderRef.current) {
      const { recorder, startCount } = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      setDialog({ mode: 'record', startCount, recorder });
    } else {
      recorderRef.current = { recorder: new Recorder(exercise.id, source), startCount: counterRef.current.snapshot.count };
      setRecording(true);
    }
  };

  const saveDialog = (expected: number | null): void => {
    if (!dialog) return;
    const counted = counterRef.current.snapshot.count - dialog.startCount;
    if (expected !== null) {
      const runs = loadRuns();
      runs.push({ exercise: exercise.id, expected, counted, source, at: new Date().toISOString() });
      saveRuns(runs);
    }
    if (dialog.mode === 'record') {
      const rec = dialog.recorder.finish(expected);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJson(rec, `${exercise.id}_${expected ?? 'x'}reps_${stamp}.json`);
    }
    setDialog(null);
  };

  // По окончании видео сразу предлагаем записать замер.
  const onVideoEnded = (): void => {
    if (source === 'video') setDialog({ mode: 'measure', startCount: 0 });
  };

  const feedbackText = feedback ? t(`fb.${feedback.key}` as I18nKey) : null;
  const hintText = hint ? t(`hint.${hint}` as I18nKey) : null;

  return (
    <div className="tracking">
      <div className={`stage ${mirrored ? 'mirrored' : ''}`}>
        <video ref={videoRef} playsInline muted onEnded={onVideoEnded} />
        <canvas ref={canvasRef} />
      </div>

      <header className="hud-top">
        <button className="btn ghost" onClick={onBack}>
          ← {t('back')}
        </button>
        <span className="hud-title">{t(`exercise.${exercise.id}` as I18nKey)}</span>
        <button className={`chip ${showDebug ? 'on' : ''}`} onClick={() => setShowDebug((v) => !v)}>
          {t('debug')}
        </button>
      </header>

      <section className="counter" aria-live="polite">
        <div key={pulse} className="count pop">
          {stats.count}
        </div>
        <div className="count-label">{t('reps')}</div>
        <div className="stats">
          {stats.lastQuality !== null && (
            <span>
              {t('quality')} <b>{stats.lastQuality}</b>
            </span>
          )}
          {stats.avgQuality !== null && (
            <span>
              {t('avgQuality')} <b>{stats.avgQuality}</b>
            </span>
          )}
          {stats.rejected > 0 && (
            <span>
              {t('rejected')} <b>{stats.rejected}</b>
            </span>
          )}
        </div>
      </section>

      <div className="toasts">
        {feedbackText && (
          <div key={feedback?.id} className="toast warn">
            {feedbackText}
          </div>
        )}
        {!feedbackText && hintText && <div className="toast">{hintText}</div>}
      </div>

      {showDebug && debug && <DebugPanel info={debug} />}

      {(starting || error) && (
        <div className="stage-message">
          {error ? <p className="error-text">{error}</p> : <p>{t('startingCamera')}</p>}
        </div>
      )}

      <footer className="hud-bottom">
        <button className="btn" onClick={reset}>
          {t('reset')}
        </button>
        {source === 'camera' ? (
          <button className="btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
            ⟲ {t('switchCamera')}
          </button>
        ) : (
          <button className="btn" onClick={backToCamera}>
            {t('useCamera')}
          </button>
        )}
        <label className="btn file">
          {t('loadVideo')}
          <input type="file" accept="video/*" onChange={onPickVideo} />
        </label>
        <button className={`btn ${recording ? 'rec' : ''}`} onClick={toggleRecording}>
          {recording ? `■ ${t('stopRecord')}` : `● ${t('record')}`}
        </button>
        <button className="btn" onClick={() => setDialog({ mode: 'measure', startCount: 0 })}>
          {t('measure')}
        </button>
        <button className={`btn ${voice ? 'on' : ''}`} onClick={() => setVoice((v) => !v)}>
          {t('voice')}
        </button>
      </footer>

      {dialog && <MeasureDialog counted={stats.count - dialog.startCount} onSave={saveDialog} onCancel={() => setDialog(null)} />}
    </div>
  );
}

function DebugPanel({ info }: { info: DebugInfo }) {
  const { t } = useI18n();
  return (
    <aside className="debug mono">
      <div>
        {t('debug.fps')}: <b>{info.fps.toFixed(1)}</b> · {t('debug.model')}: <b>{info.engine.model}</b> · {t('debug.delegate')}:{' '}
        <b>{info.engine.delegate}</b> · {t('debug.scale')}: <b>{info.engine.inputScale}</b>
      </div>
      <div>
        {t('debug.phase')}:{' '}
        {info.phases.map((p) => (
          <b key={p.machine}>
            {p.machine}={p.phase}{' '}
          </b>
        ))}
      </div>
      {info.metrics && (
        <div>
          {t('debug.metrics')}:{' '}
          {Object.entries(info.metrics).map(([k, v]) => (
            <span key={k}>
              {k}=<b>{Number.isFinite(v) ? v.toFixed(Math.abs(v) < 10 ? 2 : 0) : '—'}</b>{' '}
            </span>
          ))}
        </div>
      )}
      {info.missing.length > 0 && (
        <div>
          {t('debug.missing')}: {info.missing.join(', ')}
        </div>
      )}
    </aside>
  );
}

function MeasureDialog({ counted, onSave, onCancel }: { counted: number; onSave(expected: number | null): void; onCancel(): void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(String(Math.max(0, counted)));
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  return (
    <div className="overlay">
      <form
        className="sheet"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          onSave(valid ? parsed : null);
        }}
      >
        <p>{t('expectedReps')}</p>
        <p className="muted small">
          {t('counted')}: <b>{counted}</b>
        </p>
        <input className="number-input" type="number" inputMode="numeric" min={0} value={value} onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} autoFocus />
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            {t('saveMeasure')}
          </button>
        </div>
      </form>
    </div>
  );
}
