export type Facing = 'user' | 'environment';

export class CameraError extends Error {
  constructor(
    readonly code: 'insecure' | 'unsupported' | 'denied' | 'notFound' | 'other',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Открывает камеру. Разрешение 640×480 достаточно: модель всё равно
 * уменьшает кадр до 256 точек по стороне, а меньший кадр быстрее.
 */
export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new CameraError('insecure', 'Камера работает только по HTTPS или на localhost');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'Браузер не поддерживает доступ к камере');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', 'Доступ к камере запрещён');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('notFound', 'Камера не найдена');
    throw new CameraError('other', String(e));
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Держит экран включённым во время тренировки (Screen Wake Lock API).
 * Блокировка снимается браузером при сворачивании вкладки, поэтому
 * при возврате на вкладку запрашиваем её снова.
 */
export function keepScreenOn(): () => void {
  type Sentinel = { release(): Promise<void> };
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
  if (!wl) return () => {};
  let sentinel: Sentinel | null = null;
  let active = true;
  const request = (): void => {
    wl.request('screen')
      .then((s) => {
        if (active) sentinel = s;
        else void s.release();
      })
      .catch(() => {});
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible' && active) request();
  };
  request();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release().catch(() => {});
  };
}
