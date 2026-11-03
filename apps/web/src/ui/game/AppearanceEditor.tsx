import { COLORS } from '../../game/config';
import { useState, type ChangeEvent } from 'react';
import { sliderValue, withFigure, type Appearance, type BodyPart, type FacePart, type Figure } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import { EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from './palette';

type Slider = { kind: 'body'; part: BodyPart } | { kind: 'face'; part: FacePart };
const body = (part: BodyPart): Slider => ({ kind: 'body', part });
const face = (part: FacePart): Slider => ({ kind: 'face', part });

/** Группы ползунков: общее, верх тела, корпус, бёдра и ноги, лицо. */
const GROUPS: Array<{ id: string; sliders: Slider[] }> = [
  { id: 'general', sliders: [body('height'), body('weight'), body('muscle')] },
  { id: 'upper', sliders: [body('shoulders'), body('chest'), body('arms'), body('neck')] },
  { id: 'core', sliders: [body('waist'), body('belly')] },
  { id: 'lower', sliders: [body('hips'), body('glutes'), body('legs')] },
  { id: 'face', sliders: [face('faceWidth'), face('cheekbones'), face('jaw'), face('chin'), face('nose'), face('lips'), face('eyes'), face('brows')] },
];

/** Ползунки тела и лица по группам: от минимума до максимума («уже — толще»). */
function BodySliders({ appearance, onChange }: { appearance: Appearance; onChange(a: Appearance): void }) {
  const { t } = useI18n();
  const [group, setGroup] = useState('general');
  const current = GROUPS.find((g) => g.id === group) ?? GROUPS[0]!;
  const value = (s: Slider): number => sliderValue(s.kind === 'body' ? appearance.body?.[s.part] : appearance.face?.[s.part]);
  const set = (s: Slider, v: number): void => {
    // Около середины ползунок «прилипает» к нулю — легко вернуть как было.
    const val = Math.abs(v) < 0.04 ? 0 : Math.round(v * 100) / 100;
    if (s.kind === 'body') onChange({ ...appearance, body: { ...appearance.body, [s.part]: val } });
    else onChange({ ...appearance, face: { ...appearance.face, [s.part]: val } });
  };
  const reset = (): void => {
    const b = { ...appearance.body };
    const f = { ...appearance.face };
    for (const s of current.sliders) {
      if (s.kind === 'body') delete b[s.part];
      else delete f[s.part];
    }
    onChange({ ...appearance, body: b, face: f });
  };
  const changed = current.sliders.some((s) => value(s) !== 0);
  return (
    <div className="morph">
      <p className="field-label">{t('morph.title')}</p>
      <div className="segmented wrap morph-tabs">
        {GROUPS.map((g) => (
          <button key={g.id} className={group === g.id ? 'on' : ''} onClick={() => setGroup(g.id)}>
            {t(`morph.group.${g.id}` as I18nKey)}
          </button>
        ))}
      </div>
      <p className="muted small">{t('morph.hint')}</p>
      {current.sliders.map((s) => {
        const v = value(s);
        const id = `morph-${s.part}`;
        return (
          <div key={s.part} className="morph-row">
            <label htmlFor={id}>
              {t(`morph.${s.part}` as I18nKey)}
              <span className="morph-val">{v === 0 ? '·' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}</span>
            </label>
            <div className="morph-slider">
              <span className="small muted">{t(`morph.${s.part}.min` as I18nKey)}</span>
              <input id={id} type="range" min={-1} max={1} step={0.02} value={v} onChange={(e: ChangeEvent<HTMLInputElement>) => set(s, Number(e.target.value))} />
              <span className="small muted">{t(`morph.${s.part}.max` as I18nKey)}</span>
            </div>
          </div>
        );
      })}
      {changed && (
        <button className="btn small" onClick={reset}>
          ↺ {t('morph.reset')}
        </button>
      )}
    </div>
  );
}

/** Выбор внешности: фигура, кожа, причёска, цвет волос, борода, тело и лицо, цвет одежды и рамки. */
export function AppearanceEditor({
  appearance,
  color,
  onChange,
}: {
  appearance: Appearance;
  color: string;
  onChange(a: Appearance, color: string): void;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<Appearance>): void => onChange({ ...appearance, ...patch }, color);
  return (
    <div className="appearance">
      <p className="field-label">{t('figure')}</p>
      <div className="segmented">
        {(['male', 'female'] as const).map((f: Figure) => (
          <button key={f} className={appearance.figure === f ? 'on' : ''} onClick={() => onChange(withFigure(appearance, f), color)}>
            {f === 'male' ? '♂' : '♀'} {t(`figure.${f}` as I18nKey)}
          </button>
        ))}
      </div>
      <p className="field-label">{t('skin')}</p>
      <div className="swatches">
        {SKIN_TONES.map((s, i) => (
          <button key={s.base} className={`swatch ${appearance.skin === i ? 'on' : ''}`} style={{ background: s.base }} aria-label={`${t('skin')} ${i + 1}`} onClick={() => set({ skin: i })} />
        ))}
      </div>
      <p className="field-label">{t('hair')}</p>
      <div className="segmented wrap">
        {HAIR_STYLES.map((h) => (
          <button key={h} className={appearance.hair === h ? 'on' : ''} onClick={() => set({ hair: h })}>
            {t(`hair.${h}` as I18nKey)}
          </button>
        ))}
      </div>
      <p className="field-label">{t('hairColor')}</p>
      <div className="swatches">
        {HAIR_COLORS.map((c, i) => (
          <button key={c} className={`swatch ${appearance.hairColor === i ? 'on' : ''}`} style={{ background: c }} aria-label={`${t('hairColor')} ${i + 1}`} onClick={() => set({ hairColor: i })} />
        ))}
      </div>
      <p className="field-label">{t('eyeColor')}</p>
      <div className="swatches">
        {EYE_COLORS.map((c, i) => (
          <button key={c} className={`swatch eye ${(appearance.eyes ?? 0) === i ? 'on' : ''}`} style={{ background: `radial-gradient(circle, #0c0907 0 22%, ${c} 24% 70%, #f2ede6 72%)` }} aria-label={`${t('eyeColor')} ${i + 1}`} onClick={() => set({ eyes: i })} />
        ))}
      </div>
      {appearance.figure === 'male' && (
        <div className="segmented">
          {[false, true].map((v) => (
            <button key={String(v)} className={appearance.beard === v ? 'on' : ''} onClick={() => set({ beard: v })}>
              {t('beard')}: {t(v ? 'ob.yes' : 'ob.no')}
            </button>
          ))}
        </div>
      )}
      <BodySliders appearance={appearance} onChange={(a) => onChange(a, color)} />
      <p className="field-label">{t('ob.color')}</p>
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => onChange(appearance, c)} />
        ))}
      </div>
    </div>
  );
}
