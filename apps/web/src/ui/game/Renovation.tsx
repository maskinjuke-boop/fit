import { useEffect, useState } from 'react';
import { DECOR_KINDS, DECOR_KIND_ICON, DECOR_KIND_NAME, KITS, finishesOf, type FinishDef } from '../../game/homeDecor';
import { comfort, finishBlocker, kitBlocker, oldStuff } from '../../game/life';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import { useI18n } from '../../i18n';

/**
 * Ремонт: основная мебель (старьё → новое) и отделка дома по разделам — стены, пол,
 * панели, шторы, ковёр, свет. Нажатие на образец ставит отделку (покупает, если её ещё нет).
 */

type InteriorModule = typeof import('./three/interior');
let mod: Promise<InteriorModule> | null = null;

/** Образец отделки (рисуется холстом; модуль с three.js грузится лениво). */
function Swatch({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (mod ??= import('./three/interior'))
      .then((m) => {
        if (live) setUrl(m.finishSwatch(id));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return url ? <img className="reno-swatch" src={url} alt="" draggable={false} /> : <span className="reno-swatch" />;
}

function FinishCard({ state, def }: { state: GameState; def: FinishDef }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const b = finishBlocker(state, def.id);
  const current = state.life.decor[def.kind] === def.id;
  const owned = state.life.finishes.includes(def.id);
  const label = current ? t('reno.current') : owned ? t('reno.apply') : b === 'level' ? tf('reno.level', { n: def.level ?? 1 }) : `◈ ${def.price}`;
  return (
    <li>
      <button className={`item-card reno-card ${current ? 'equipped' : ''} ${b === 'level' ? 'locked' : ''}`} disabled={b !== null && !current} onClick={() => life.applyFinish(def.id)}>
        <Swatch id={def.id} />
        <b>{def.name[lang]}</b>
        <span className={`small ${def.comfort < 0 ? 'bad' : 'muted'}`}>{tf('reno.comfort', { n: def.comfort > 0 ? `+${def.comfort}` : def.comfort })}</span>
        <span className={`item-price ${current || owned ? 'owned' : ''}`}>{label}</span>
      </button>
    </li>
  );
}

export function Renovation({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const left = oldStuff(state.life);
  return (
    <div className="reno">
      <p className="muted small">{t('reno.hint')}</p>
      <p className="small">
        {tf('home.comfortNow', { n: comfort(state.life) })} · {left > 0 ? tf('reno.oldLeft', { n: left }) : t('reno.allNew')}
      </p>
      <h3>🛋️ {t('reno.kit')}</h3>
      <ul className="life-list">
        {KITS.map((k) => {
          const done = state.life.kit[k.id] === 1;
          const b = kitBlocker(state, k.id);
          return (
            <li key={k.id}>
              <div>
                <b>
                  {k.icon} {done ? k.name[lang] : k.old[lang]}
                </b>
                <div className="muted small">{done ? k.desc[lang] : `${t('reno.oldPenalty')} · ${k.name[lang]}: ${k.desc[lang]}`}</div>
              </div>
              {done ? (
                <span className="good small">{t('reno.kitDone')}</span>
              ) : (
                <button className="btn primary small" disabled={b !== null} onClick={() => life.upgradeKit(k.id)}>
                  {tf('reno.replace', { n: k.price })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {DECOR_KINDS.map((kind) => (
        <section key={kind} className="reno-kind">
          <h3>
            {DECOR_KIND_ICON[kind]} {DECOR_KIND_NAME[kind][lang]}
          </h3>
          <ul className="item-grid reno-grid">
            {finishesOf(kind)
              // Старьё показываем, только пока оно есть (в новое жильё его не вернуть).
              .filter((d) => !d.old || (state.life.finishes.includes(d.id) && (state.life.house === 0 || state.life.decor[kind] === d.id)))
              .map((d) => (
                <FinishCard key={d.id} state={state} def={d} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
