import { COLORS } from '../../game/config';
import type { Appearance } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from './Avatar';

/** Выбор внешности: кожа, причёска, цвет волос, борода, цвет одежды и рамки. */
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
      <div className="segmented">
        {[false, true].map((v) => (
          <button key={String(v)} className={appearance.beard === v ? 'on' : ''} onClick={() => set({ beard: v })}>
            {t('beard')}: {t(v ? 'ob.yes' : 'ob.no')}
          </button>
        ))}
      </div>
      <p className="field-label">{t('ob.color')}</p>
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => onChange(appearance, c)} />
        ))}
      </div>
    </div>
  );
}
