import { useState, type ChangeEvent } from 'react';
import type { FitnessLevel } from '../../game/config';
import { useGame } from '../../game/GameContext';
import { useI18n, type I18nKey } from '../../i18n';
import { CatPortrait } from '../city/CatPortrait';

type Step = 'welcome' | 'health' | 'town' | 'setup';
const FITNESS: readonly FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];

/** Онбординг: о чём игра, опросник о противопоказаниях и 16+, название поселения, нагрузка и турник. */
export function Onboarding() {
  const { t, lang, setLang } = useI18n();
  const { createGame } = useGame();
  const [step, setStep] = useState<Step>('welcome');
  const [answers, setAnswers] = useState<Array<boolean | null>>([null, null, null]);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState('');
  const [fitness, setFitness] = useState<FitnessLevel>('beginner');
  const [hasBar, setHasBar] = useState<boolean | null>(null);

  const anyRisk = answers.some((a) => a === true);
  const healthDone = answers.every((a) => a !== null) && adult;

  return (
    <main className="onboarding">
      {step === 'welcome' && (
        <section className="ob-step">
          <div className="ob-cats">
            <CatPortrait coat="ginger" profession="baker" items={['bow']} pose="idle" size={116} />
            <CatPortrait coat="tuxedo" profession="painter" items={[]} pose="idle" size={116} />
            <CatPortrait coat="calico" profession="florist" items={['scarf']} pose="dance" size={116} />
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
            <button className="btn primary grow" disabled={!healthDone} onClick={() => setStep('town')}>
              {t('ob.next')}
            </button>
          </div>
        </section>
      )}

      {step === 'town' && (
        <section className="ob-step">
          <h1>{t('ob.townTitle')}</h1>
          <div className="ob-cats">
            <CatPortrait coat="grey" profession="carpenter" items={[]} pose="hammer" size={170} />
          </div>
          <label className="field">
            <span>{t('ob.townName')}</span>
            <input value={name} maxLength={24} placeholder={t('ob.townPlaceholder')} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
          </label>
          <div className="ob-actions">
            <button className="btn" onClick={() => setStep('health')}>
              {t('ob.back')}
            </button>
            <button className="btn primary grow" onClick={() => setStep('setup')}>
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
            <button className="btn" onClick={() => setStep('town')}>
              {t('ob.back')}
            </button>
            <button
              className="btn primary grow"
              disabled={hasBar === null}
              onClick={() => createGame({ name: name.trim() || (lang === 'ru' ? 'Мурлыкино' : 'Purrville'), fitness: anyRisk ? 'beginner' : fitness, hasBar: hasBar ?? false })}
            >
              {t('ob.create')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
