import { useState } from 'react';
import { useI18n, type I18nKey } from '../i18n';
import { loadRuns, saveRuns, summarize, summarizeByExercise, type AccuracySummary } from '../tools/accuracy';
import { downloadJson } from './feedback';

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

export function AccuracyPanel({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const [runs, setRuns] = useState(loadRuns);
  const total = summarize(runs);
  const byExercise = [...summarizeByExercise(runs).entries()];

  const row = (label: string, s: AccuracySummary, strong = false) => (
    <tr key={label} className={strong ? 'total' : ''}>
      <td>{label}</td>
      <td>{s.runs}</td>
      <td>
        {s.counted}/{s.expected}
      </td>
      <td className={s.accuracy >= 0.95 ? 'good' : 'bad'}>{pct(s.accuracy)}</td>
      <td className={s.falsePositiveRate <= 0.02 ? 'good' : 'bad'}>{pct(s.falsePositiveRate)}</td>
      <td>{pct(s.missRate)}</td>
    </tr>
  );

  return (
    <div className="overlay">
      <div className="sheet wide-sheet">
        <h2>{t('accuracyTitle')}</h2>
        <p className="muted small">{t('accuracyNote')}</p>
        {runs.length === 0 ? (
          <p>{t('noRuns')}</p>
        ) : (
          <div className="table-wrap">
            <table className="acc-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('runs')}</th>
                  <th>{t('repsColumn')}</th>
                  <th>{t('accuracy')}</th>
                  <th>{t('falseRate')}</th>
                  <th>{t('missRate')}</th>
                </tr>
              </thead>
              <tbody>
                {byExercise.map(([id, s]) => row(t(`exercise.${id}` as I18nKey), s))}
                {row('Σ', total, true)}
              </tbody>
            </table>
          </div>
        )}
        <div className="row">
          <button className="btn" onClick={onClose}>
            {t('close')}
          </button>
          {runs.length > 0 && (
            <>
              <button
                className="btn"
                onClick={() => {
                  saveRuns([]);
                  setRuns([]);
                }}
              >
                {t('clear')}
              </button>
              <button className="btn primary" onClick={() => downloadJson({ summary: total, runs }, 'accuracy-report.json')}>
                {t('exportJson')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
