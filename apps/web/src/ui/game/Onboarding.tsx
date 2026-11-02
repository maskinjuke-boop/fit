import { useState, type ChangeEvent } from 'react';
import { ARCHETYPES, COLORS, type Archetype, type FitnessLevel } from '../../game/config';
import { useGame } from '../../game/GameContext';
import { DEFAULT_APPEARANCE, type Appearance } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import { AppearanceEditor } from './AppearanceEditor';
import { Avatar } from './Avatar';

/** Стартовый предмет пути — показываем его на портрете сразу при выборе. */
const STARTER: Record<Archetype, { slot: 'head' | 'offhand'; id: string }> = {
  guardian: { slot: 'offhand', id: 'wooden_shield' },
  ranger: { slot: 'head', id: 'leather_cap' },
  mystic: { slot: 'head', id: 'headband' },
};

type Step = 'welcome' | 'health' | 'hero' | 'setup';
const FITNESS: readonly FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];

/** Онбординг (ТЗ, раздел 7): приватность, опросник о противопоказаниях и 16+, персонаж, нагрузка и турник. */
export function Onboarding() {
  const { t, lang, setLang } = useI18n();
  const { createCharacter } = useGame();
  const [step, setStep] = useState<Step>('welcome');
  const [answers, setAnswers] = useState<Array<boolean | null>>([null, null, null]);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<Archetype>('guardian');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const starter = STARTER[archetype];
  const preview = { [starter.slot]: starter.id };
  const [fitness, setFitness] = useState<FitnessLevel>('beginner');
  const [hasBar, setHasBar] = useState<boolean | null>(null);

  const anyRisk = answers.some((a) => a === true);
  const healthDone = answers.every((a) => a !== null) && adult;

  return (
    <main className="onboarding">
      {step === 'welcome' && (
        <section className="ob-step">
          <div className="ob-hero-art">
            <Avatar color={COLORS[0]} appearance={DEFAULT_APPEARANCE} equipped={{ offhand: 'wooden_shield', weapon: 'wooden_club' }} size={160} />
          </div>
          <h1>{t('ob.welcomeTitle')}</h1>
          <p>{t('ob.welcomeText')}</p>
          <p className="privacy">{t('privacy')}</p>
          <div className="ob-actions">
            <button className="chip" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
              {lang === 'ru' ? 'EN' : 'RU'}
            </button>
            <button className="btn primary grow" onClick={() => setStep('health')}>
              {t('ob.start')}
            </button>
          </div>
        </section>
      )}

      {step === 'health' && (
        <section className="ob-step">
          <h1>{t('ob.healthTitle')}</h1>
          <p className="muted">{t('ob.disclaimer')}</p>
          {(['ob.q1', 'ob.q2', 'ob.q3'] as const).map((q, i) => (
            <div key={q} className="ob-question">
              <p>{t(q)}</p>
              <div className="segmented">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    className={answers[i] === v ? 'on' : ''}
                    onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
                  >
                    {t(v ? 'ob.yes' : 'ob.no')}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {anyRisk && <p className="notice">{t('ob.doctor')}</p>}
          <label className="check">
            <input type="checkbox" checked={adult} onChange={(e: ChangeEvent<HTMLInputElement>) => setAdult(e.target.checked)} />
            {t('ob.age')}
          </label>
          <div className="ob-actions">
            <button className="btn" onClick={() => setStep('welcome')}>
              {t('ob.back')}
            </button>
            <button className="btn primary grow" disabled={!healthDone} onClick={() => setStep('hero')}>
              {t('ob.next')}
            </button>
          </div>
        </section>
      )}

      {step === 'hero' && (
        <section className="ob-step">
          <h1>{t('ob.heroTitle')}</h1>
          <div className="ob-hero-art">
            <Avatar color={color} appearance={appearance} equipped={preview} size={170} />
          </div>
          <label className="field">
            <span>{t('ob.name')}</span>
            <input value={name} maxLength={20} placeholder={t('ob.namePlaceholder')} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
          </label>
          <p className="field-label">{t('ob.archetype')}</p>
          <div className="choice-grid">
            {ARCHETYPES.map((a) => (
              <button key={a} className={`choice ${archetype === a ? 'on' : ''}`} onClick={() => setArchetype(a)}>
                <b>{t(`arch.${a}` as I18nKey)}</b>
                <span className="muted small">{t(`arch.${a}.desc` as I18nKey)}</span>
                <span className="small accent">{t(`item.${STARTER[a].id}` as I18nKey)}</span>
              </button>
            ))}
          </div>
          <AppearanceEditor
            appearance={appearance}
            color={color}
            onChange={(a, c) => {
              setAppearance(a);
              setColor(c);
            }}
          />
          <div className="ob-actions">
            <button className="btn" onClick={() => setStep('health')}>
              {t('ob.back')}
            </button>
            <button className="btn primary grow" disabled={name.trim().length === 0} onClick={() => setStep('setup')}>
              {t('ob.next')}
            </button>
          </div>
        </section>
      )}

      {step === 'setup' && (
        <section className="ob-step">
          <h1>{t('ob.setupTitle')}</h1>
          <p className="field-label">{t('ob.fitness')}</p>
          <div className="segmented">
            {FITNESS.map((f) => (
              <button key={f} className={fitness === f ? 'on' : ''} disabled={anyRisk && f !== 'beginner'} onClick={() => setFitness(f)}>
                {t(`fit.${f}` as I18nKey)}
              </button>
            ))}
          </div>
          <p className="field-label">{t('ob.hasBar')}</p>
          <div className="segmented">
            {[true, false].map((v) => (
              <button key={String(v)} className={hasBar === v ? 'on' : ''} onClick={() => setHasBar(v)}>
                {t(v ? 'ob.yes' : 'ob.no')}
              </button>
            ))}
          </div>
          <p className="muted small">{t('ob.hasBarHint')}</p>
          <div className="ob-actions">
            <button className="btn" onClick={() => setStep('hero')}>
              {t('ob.back')}
            </button>
            <button
              className="btn primary grow"
              disabled={hasBar === null}
              onClick={() => createCharacter({ name: name.trim(), archetype, color, appearance, fitness: anyRisk ? 'beginner' : fitness, hasBar: hasBar ?? false })}
            >
              {t('ob.create')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
