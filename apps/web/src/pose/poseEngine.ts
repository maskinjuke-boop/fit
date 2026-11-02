import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark, RawPose } from '../tracking/types';
import type { ModelVariant } from './adaptiveQuality';

export type Delegate = 'GPU' | 'CPU';

export interface PoseEngineInfo {
  model: ModelVariant;
  delegate: Delegate;
  inputScale: number;
}

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type FrameSource = HTMLVideoElement | HTMLCanvasElement;

const base = import.meta.env.BASE_URL;
/** WASM и модели раздаются с нашего сервера (см. scripts/). */
export const WASM_PATH = `${base}wasm`;
/** Запасной адрес WASM той же версии, что и библиотека. */
export const WASM_FALLBACK_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${__MEDIAPIPE_VERSION__}/wasm`;
export const modelPath = (v: ModelVariant): string => `${base}models/pose_landmarker_${v}.task`;
/** Запасной адрес: официальное хранилище моделей MediaPipe (если своей копии на сервере нет). */
export const modelFallbackPath = (v: ModelVariant): string =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/latest/pose_landmarker_${v}.task`;

/** Ошибки MediaPipe иногда приходят как Event — достаём из них читаемый текст. */
function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof Event !== 'undefined' && e instanceof Event) {
    const src = (e.target as { src?: string } | null)?.src;
    return `ошибка загрузки${src ? ` ${src}` : ''} (${e.type})`;
  }
  return String(e);
}

export class PoseEngineError extends Error {
  constructor(
    readonly code: 'wasm' | 'model',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Обёртка над MediaPipe Pose Landmarker: один человек в кадре, режим VIDEO,
 * GPU-делегат с откатом на CPU, смена модели и разрешения входа на лету.
 */
export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private lastTs = -1;
  private scaleCanvas: HTMLCanvasElement | null = null;
  private _info: PoseEngineInfo;

  private constructor(
    private readonly fileset: Fileset,
    info: PoseEngineInfo,
  ) {
    this._info = info;
  }

  static async create(model: ModelVariant = 'lite'): Promise<PoseEngine> {
    const local = await PoseEngine.hasLocal(`${WASM_PATH}/vision_wasm_internal.js`);
    const wasmPaths = local ? [WASM_PATH, WASM_FALLBACK_PATH] : [WASM_FALLBACK_PATH];
    let lastError: unknown = null;
    for (const wasm of wasmPaths) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(wasm);
        const engine = new PoseEngine(fileset, { model, delegate: 'GPU', inputScale: 1 });
        await engine.load(model);
        return engine;
      } catch (e) {
        lastError = e;
      }
    }
    if (lastError instanceof PoseEngineError) throw lastError;
    throw new PoseEngineError('wasm', `Не удалось загрузить WASM MediaPipe (${wasmPaths.join(' или ')}): ${describe(lastError)}`);
  }

  get info(): PoseEngineInfo {
    return this._info;
  }

  private async build(path: string, delegate: Delegate): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: path, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
  }

  /** Есть ли своя копия модели на сервере (иначе берём запасной адрес). */
  private static async hasLocal(path: string): Promise<boolean> {
    try {
      const res = await fetch(path, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      return res.ok && !type.includes('text/html');
    } catch {
      return false;
    }
  }

  /** Загружает модель: своя копия или запасной адрес; сначала GPU, при ошибке — CPU. */
  async load(model: ModelVariant): Promise<void> {
    const local = modelPath(model);
    const paths = (await PoseEngine.hasLocal(local)) ? [local, modelFallbackPath(model)] : [modelFallbackPath(model)];
    let lastError: unknown = null;
    for (const path of paths) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          const next = await this.build(path, delegate);
          this.landmarker?.close();
          this.landmarker = next;
          this.lastTs = -1;
          this._info = { ...this._info, model, delegate };
          return;
        } catch (e) {
          lastError = e;
        }
      }
    }
    throw new PoseEngineError('model', `Не удалось загрузить модель ${paths.join(' или ')}: ${describe(lastError)}`);
  }

  setInputScale(scale: number): void {
    this._info = { ...this._info, inputScale: scale };
  }

  /** Находит позу на кадре. tMs должен расти от кадра к кадру. */
  detect(source: HTMLVideoElement, tMs: number): RawPose | null {
    if (!this.landmarker) return null;
    if (source.readyState < 2 || source.videoWidth === 0) return null;
    const ts = Math.max(Math.round(tMs), this.lastTs + 1);
    this.lastTs = ts;
    const input = this.prepareInput(source);
    const result = this.landmarker.detectForVideo(input, ts);
    const first = result.landmarks[0];
    if (!first || first.length === 0) return null;
    return first.map(
      (l): Landmark => ({ x: l.x, y: l.y, z: l.z, visibility: (l as { visibility?: number }).visibility ?? 0 }),
    );
  }

  /** При пониженном разрешении кадр сначала уменьшается на canvas; координаты остаются нормированными. */
  private prepareInput(video: HTMLVideoElement): FrameSource {
    const scale = this._info.inputScale;
    if (scale >= 1) return video;
    const w = Math.max(64, Math.round(video.videoWidth * scale));
    const h = Math.max(64, Math.round(video.videoHeight * scale));
    if (!this.scaleCanvas) this.scaleCanvas = document.createElement('canvas');
    const c = this.scaleCanvas;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    c.getContext('2d')?.drawImage(video, 0, 0, w, h);
    return c;
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
