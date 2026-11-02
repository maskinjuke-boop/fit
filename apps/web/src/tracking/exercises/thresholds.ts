/**
 * Пороги упражнений — стартовые значения из ТЗ (раздел 3).
 * Калибруются на тестовом наборе видео; логика подсчёта от них не зависит.
 * Углы в градусах, расстояния — в длинах корпуса (плечи → бёдра).
 */
export const THRESHOLDS = {
  /** Зона гистерезиса для угловых метрик, градусы. */
  hysteresisDeg: 10,
  /** Минимальная длительность повтора, мс. */
  minDurationMs: { strength: 600, cardio: 250 },

  pushup: {
    elbowTop: 155,
    elbowBottom: 90,
    bodyStraightMin: 160,
  },
  squat: {
    kneeTop: 160,
    kneeBottom: 100,
    torsoMinFromFloor: 45,
  },
  lunge: {
    kneeTop: 160,
    frontKneeBottom: 100,
    torsoMaxFromVertical: 20,
    visibility: 0.5,
  },
  situp: {
    hipAngleLying: 120,
    hipAngleUp: 70,
    /** Допустимый сдвиг голеностопа за повтор, длин корпуса. */
    feetMaxShift: 0.2,
  },
  jumpingJack: {
    /** Стопы «вместе»: расстояние между голеностопами ≤ этой доли ширины плеч. */
    feetTogetherMax: 0.9,
    /** Стопы «шире плеч». */
    feetApartMin: 1.2,
    feetHysteresis: 0.15,
    /** Гистерезис для положения рук, длин корпуса. */
    armHysteresis: 0.15,
    /** Допустимая разница высоты запястий, длин корпуса. */
    armSymmetryMax: 0.35,
  },
  highKnees: {
    /** Бедро «опущено»: угол к вертикали меньше. */
    thighDown: 30,
    /** Бедро «поднято»: угол к вертикали не меньше (ТЗ: ≥ 60°). */
    thighUp: 60,
  },
  pullup: {
    hangElbowMin: 150,
    /** Начальный вис перед первым повтором, мс. */
    hangHoldMs: 300,
    /** Подбородок ниже линии турника на эту долю корпуса — считаем, что пошёл вниз. */
    chinDropHysteresis: 0.1,
    /** Калибровка линии турника, мс. */
    barCalibrationMs: 2000,
    /** Раскачка: горизонтальный сдвиг бёдер ≤ 0,5 корпуса (≈ 15% роста). */
    maxHipSwing: 0.5,
    /** Если рты не видны (съёмка сзади), подбородок оценивается по ушам + смещение. */
    chinBelowEars: 0.15,
    headVisibility: 0.5,
  },
  pullupNegative: {
    minLoweringMs: 3000,
  },
  australian: {
    elbowStraight: 150,
    elbowBent: 90,
    bodyStraightMin: 160,
  },
} as const;
