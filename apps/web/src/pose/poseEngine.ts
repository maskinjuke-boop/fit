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
export const modelPath = (v: ModelVariant): string => `${base}models/pose_landmarker_${v}.task`;

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
    let fileset: Fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    } catch (e) {
      throw new PoseEngineError('wasm', `Не удалось загрузить WASM MediaPipe из ${WASM_PATH}: ${String(e)}`);
    }
    const engine = new PoseEngine(fileset, { model, delegate: 'GPU', inputScale: 1 });
    await engine.load(model);
    return engine;
  }

  get info(): PoseEngineInfo {
    return this._info;
  }

  private async build(model: ModelVariant, delegate: Delegate): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: modelPath(model), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
  }

  /** Загружает модель: сначала на GPU, при ошибке — на CPU. */
  async load(model: ModelVariant): Promise<void> {
    let next: PoseLandmarker;
    let delegate: Delegate = 'GPU';
    try {
      next = await this.build(model, 'GPU');
    } catch (gpuError) {
      delegate = 'CPU';
      try {
        next = await this.build(model, 'CPU');
      } catch (cpuError) {
        throw new PoseEngineError('model', `Не удалось загрузить модель ${modelPath(model)}: ${String(cpuError ?? gpuError)}`);
      }
    }
    this.landmarker?.close();
    this.landmarker = next;
    this.lastTs = -1;
    this._info = { ...this._info, model, delegate };
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
