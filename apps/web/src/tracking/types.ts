/** Точка, как её отдаёт MediaPipe: x, y нормированы на ширину и высоту кадра (0..1). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** 33 точки MediaPipe в исходном виде. */
export type RawPose = readonly Landmark[];

/**
 * Точка после сглаживания в пространстве с исправленными пропорциями:
 * x умножен на (ширина / высота кадра), чтобы углы считались без искажений.
 * Ось y направлена вниз, как в изображении.
 */
export interface Point {
  x: number;
  y: number;
  /** Видимость 0..1 */
  v: number;
}

export type Pose = readonly Point[];

/** Набор именованных величин, посчитанных для упражнения на одном кадре. */
export type Metrics = Readonly<Record<string, number>>;

/** Ключи подсказок; тексты лежат в i18n. */
export type FeedbackKey =
  | 'goLower'
  | 'extendArms'
  | 'standUpFully'
  | 'keepBodyStraight'
  | 'chestUp'
  | 'torsoUpright'
  | 'keepFeetStill'
  | 'comeHigher'
  | 'lieBackFully'
  | 'chinAboveBar'
  | 'straightenArmsInHang'
  | 'noSwinging'
  | 'armsAndLegsWider'
  | 'closeArmsAndLegs'
  | 'armsSymmetric'
  | 'kneeHigher'
  | 'lowerSlower'
  | 'tooFast';

export type FrameHint = 'noPerson' | 'stepBack' | 'moreLight' | 'headNotVisible';
