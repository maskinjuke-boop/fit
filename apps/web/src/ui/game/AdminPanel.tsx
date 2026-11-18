import { useState, type ChangeEvent } from 'react';
import type { GameEvent } from '../../game/engine';
import { useGame } from '../../game/GameContext';
import { levelOf } from '../../game/levels';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { EXERCISES } from '../../tracking/exercises';
import { downloadJson } from '../feedback';
import { eventText } from './text';
import {
  adminAddCat,
  adminAddMix,
  adminBonds,
  adminBuyAll,
  adminCatNeeds,
  adminDropCat,
  adminEvent,
  adminFillCats,
  adminGraves,
  adminRemoveCats,
  adminRerollOffer,
  adminScene,
  adminSetHouse,
  adminSetHour,
  adminSkipTime,
  getBeltOverride,
  setBeltOverride,
} from '../../game/life';
import { CAT_BREEDS, HOUSES, LIFE_EVENTS } from '../../game/lifeContent';
import type { CatBreed } from '../../game/lifeTypes';

/**
 * Режим администратора для тестирования. Включается ссылкой с ?admin,
 * выключается здесь же. Все действия идут через игровой движок.
 */
export function AdminPanel({ onClose }: { onClose(): void }) {
  const { t, tf, lang } = useI18n();
  const { state, admin } = useGame();
  const [level, setLevelInput] = useState(String(state ? levelOf(state.totalXp) : 1));
  const [exercise, setExercise] = useState<ExerciseId>('pushup');
  const [count, setCount] = useState('10');
  const [quality, setQuality] = useState('90');
  const [log, setLog] = useState<string[]>([]);
  const [breed, setBreed] = useState<CatBreed>('ginger');
  const [eventId, setEventId] = useState(LIFE_EVENTS[0]!.id);
  const [belt, setBelt] = useState<number | null>(getBeltOverride());
  const [reroll, setReroll] = useState(1);
  if (!state) return null;
  const L = state.life;
  const offer = L.demon;
  const moveBelt = (v: number | null): void => {
    setBeltOverride(v);
    setBelt(v);
  };

  const report = (events: GameEvent[]): void => {
    const lines = events.filter((e) => e.kind !== 'xp').map((e) => eventText(t, tf, e)).filter((x): x is string => !!x);
    setLog([tf('adminDone', { n: events.length }), ...lines].slice(0, 8));
  };
  const num = (v: string, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="overlay">
      <div className="sheet admin-sheet">
        <div className="card-head">
          <h2>{t('adminTitle')}</h2>
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small">{t('adminNote')}</p>

        <div className="admin-row">
          <span>{t('adminGold')}</span>
          <button className="btn" onClick={() => report(admin.grant({ gold: 100 }))}>+100</button>
          <button className="btn" onClick={() => report(admin.grant({ gold: 1000 }))}>+1000</button>
          <button className="btn" onClick={() => report(admin.grant({ gold: 10000 }))}>+10000</button>
        </div>
        <div className="admin-row">
          <span>{t('adminXp')}</span>
          <button className="btn" onClick={() => report(admin.grant({ xp: 100 }))}>+100</button>
          <button className="btn" onClick={() => report(admin.grant({ xp: 1000 }))}>+1000</button>
        </div>
        <div className="admin-row">
          <span>{t('adminLevel')}</span>
          <input className="admin-input" type="number" min={1} max={99} value={level} onChange={(e: ChangeEvent<HTMLInputElement>) => setLevelInput(e.target.value)} />
          <button className="btn" onClick={() => report(admin.setLevel(num(level, 1)))}>
            {t('adminSetLevel')}
          </button>
        </div>

        <h3>{t('adminReps')}</h3>
        <div className="admin-row">
          <select className="admin-input wide" value={exercise} onChange={(e: ChangeEvent<HTMLSelectElement>) => setExercise(e.target.value as ExerciseId)}>
            {EXERCISES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {t(`exercise.${ex.id}` as I18nKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-row">
          <span>×</span>
          <input className="admin-input" type="number" min={1} max={500} value={count} onChange={(e: ChangeEvent<HTMLInputElement>) => setCount(e.target.value)} />
          <span>{t('adminQuality')}</span>
          <input className="admin-input" type="number" min={0} max={100} value={quality} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuality(e.target.value)} />
          <button className="btn primary" onClick={() => report(admin.simulate(exercise, Math.min(500, Math.max(1, num(count, 1))), Math.min(100, Math.max(0, num(quality, 90)))))}>
            {t('adminRun')}
          </button>
        </div>

        <div className="admin-actions">
          <button className="btn" onClick={() => report(admin.completeDailies())}>
            {t('adminDailies')}
          </button>
          <button className="btn" onClick={() => report(admin.completeQuests())}>
            {t('adminQuests')}
          </button>
          <button className="btn" onClick={() => admin.resetReroll()}>
            {t('adminReroll')}
          </button>
          <button className="btn" onClick={() => admin.refillNeeds()}>
            {t('adminNeedsRefill')}
          </button>
          <button className="btn" onClick={() => admin.unlockAll()}>
            {t('adminUnlock')}
          </button>
        </div>

        <h3>🐾 {t('adm.cafe')}</h3>
        <p className="muted small">
          {tf('adm.cafeNow', { cats: L.cats.length, max: HOUSES[L.house]!.cats, tier: L.house, graves: L.graves.length, hh: String(Math.floor(L.minute / 60)).padStart(2, '0') })}
        </p>
        <div className="admin-row">
          <span>{t('adm.house')}</span>
          <select className="admin-input wide" value={L.house} onChange={(e: ChangeEvent<HTMLSelectElement>) => admin.apply((st) => adminSetHouse(st, Number(e.target.value)))}>
            {HOUSES.map((h, i) => (
              <option key={i} value={i}>
                {h.icon} {h.name[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-row">
          <select className="admin-input wide" value={breed} onChange={(e: ChangeEvent<HTMLSelectElement>) => setBreed(e.target.value as CatBreed)}>
            {CAT_BREEDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name[lang]}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => admin.apply((st) => adminAddCat(st, breed))}>
            {t('adm.addCat')}
          </button>
          <button className="btn" onClick={() => admin.apply((st) => adminAddCat(st, breed, true))}>
            {t('adm.addKitten')}
          </button>
        </div>
        <div className="admin-grid">
          <button className="btn" onClick={() => admin.apply(adminFillCats)}>{t('adm.fillCats')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminRemoveCats(st, false))}>{t('adm.removeCat')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminRemoveCats(st, true))}>{t('adm.removeCats')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminCatNeeds(st, { play: 5 }))}>{t('adm.bored')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminCatNeeds(st, { fed: 10 }))}>{t('adm.hungry')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminCatNeeds(st, { toilet: 10 }))}>{t('adm.toilet')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminCatNeeds(st, { drink: 8 }))}>{t('adm.thirsty')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminCatNeeds(st, { fed: 0, starve: 22 }))}>{t('adm.dying')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminBonds(st, 80))}>{t('adm.friends')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminBonds(st, null))}>{t('adm.strangers')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminAddMix(st, breed, CAT_BREEDS[(CAT_BREEDS.findIndex((b) => b.id === breed) + 3) % CAT_BREEDS.length]!.id))}>{t('adm.addMix')}</button>
          <button className="btn" onClick={() => admin.apply(adminBuyAll)}>{t('adm.buyAll')}</button>
        </div>
        <div className="admin-row">
          <span>{t('adm.clock')}</span>
          <button className="btn" onClick={() => admin.apply((st) => adminSkipTime(st, 60))}>+1 ч</button>
          <button className="btn" onClick={() => admin.apply((st) => adminSkipTime(st, 360))}>+6 ч</button>
          <button className="btn" onClick={() => admin.apply((st) => adminSetHour(st, 13))}>13:00</button>
          <button className="btn" onClick={() => admin.apply((st) => adminSetHour(st, 3))}>03:00</button>
        </div>
        <div className="admin-row">
          <select className="admin-input wide" value={eventId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEventId(e.target.value)}>
            {LIFE_EVENTS.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.icon} {ev.title[lang]}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => admin.apply((st) => adminEvent(st, eventId))}>
            {t('adm.event')}
          </button>
        </div>

        <h3>😈 {t('adm.demon')}</h3>
        <p className="muted small">
          {offer ? tf('adm.offerNow', { status: t(`adm.st.${offer.status}` as I18nKey), n: offer.progress, m: offer.target, ex: t(`exercise.${offer.exercise}` as I18nKey) }) : '—'}
        </p>
        <div className="admin-grid">
          <button className="btn" onClick={() => admin.apply((st) => adminScene(st, st.life.scene === 'cafe' ? 'demon' : 'cafe'))}>
            {L.scene === 'cafe' ? t('adm.toDemon') : t('adm.toCafe')}
          </button>
          <button
            className="btn primary"
            disabled={!offer || offer.status !== 'waiting'}
            onClick={() => offer && report(admin.simulate(offer.exercise, Math.max(1, offer.target - offer.progress), 95))}
          >
            {t('adm.rescue')}
          </button>
          <button className="btn danger" disabled={!offer || offer.status !== 'waiting'} onClick={() => report(admin.apply(adminDropCat))}>
            {t('adm.drop')}
          </button>
          <button
            className="btn"
            onClick={() => {
              admin.apply((st) => adminRerollOffer(st, reroll));
              setReroll(reroll + 1);
            }}
          >
            {t('adm.reroll')}
          </button>
          <button className="btn" onClick={() => admin.apply((st) => adminGraves(st, 5))}>{t('adm.addGraves')}</button>
          <button className="btn" onClick={() => admin.apply((st) => adminGraves(st, 0))}>{t('adm.clearGraves')}</button>
        </div>
        <div className="admin-row">
          <span>{t('adm.belt')}</span>
          <input className="admin-range" type="range" min={0} max={100} value={Math.round((belt ?? 0) * 100)} onChange={(e: ChangeEvent<HTMLInputElement>) => moveBelt(Number(e.target.value) / 100)} />
          <button className="btn" disabled={belt === null} onClick={() => moveBelt(null)}>
            {t('adm.beltClock')}
          </button>
        </div>

        <h3>{t('adminTime')}</h3>
        <p className="muted small">{tf('adminDay', { d: state.today, n: admin.dayOffset })}</p>
        <div className="admin-row">
          <button className="btn" onClick={() => report(admin.shiftDays(1))}>
            {t('adminNextDay')}
          </button>
          <button className="btn" onClick={() => report(admin.shiftDays(2))}>
            {t('adminSkipDay')}
          </button>
          <button className="btn" onClick={() => admin.resetClock()}>
            {t('adminResetClock')}
          </button>
        </div>

        {log.length > 0 && (
          <ul className="admin-log">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}

        <div className="admin-actions">
          <button className="btn" onClick={() => downloadJson(state, `fitness-rpg-save-${state.today}.json`)}>
            {t('adminExport')}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              admin.setEnabled(false);
              onClose();
            }}
          >
            {t('adminOff')}
          </button>
        </div>
      </div>
    </div>
  );
}
