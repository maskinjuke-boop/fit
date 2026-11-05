import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import {
  actionsAt,
  blocker,
  charmChance,
  clock,
  effectiveAppearance,
  fitness,
  furnitureBlocker,
  hasObject,
  isOpen,
  looks,
  meetsLevel,
  mood,
  personBlocker,
  personPlace,
  peopleAt,
  skillLevel,
  skillNext,
  SKILL_NAME,
  type Blocker,
} from '../../game/life';
import { FURNITURE, HOMES, HOME_IDS, JOBS, JOB_IDS, LOCATIONS, LOCATION_IDS, OBJECTS, PEOPLE, PERSON_ACTIONS, PERSON_IDS, TIER_NAME, lifeEventById, tierOf } from '../../game/lifeContent';
import { personSpot, type P2 } from '../../game/lifeMap';
import { NEEDS, SKILLS, type ActionDef, type JobId, type LocationId, type NeedId, type PersonId } from '../../game/lifeTypes';
import { useI18n, type I18nKey } from '../../i18n';
import type { NearTarget, ScenePerson } from './three/LifeScene3D';
import { HeroPortrait } from './Renders';

const LifeScene3D = lazy(() => import('./three/LifeScene3D'));

/** Нужные поля события указателя (общие для React и DOM). */
interface PointerLike {
  clientX: number;
  clientY: number;
}

const NEED_ICON: Record<NeedId, string> = { food: '🍔', energy: '⚡', hygiene: '🚿', fun: '🎉', social: '💬' };

function Joystick({ stick }: { stick: { current: { x: number; y: number } } }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const base = useRef<HTMLDivElement | null>(null);
  const R = 46;
  const move = (e: PointerLike): void => {
    const b = base.current?.getBoundingClientRect();
    if (!b) return;
    let x = e.clientX - (b.left + b.width / 2);
    let y = e.clientY - (b.top + b.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) {
      x = (x / d) * R;
      y = (y / d) * R;
    }
    setKnob({ x, y });
    stick.current = { x: x / R, y: -y / R };
  };
  const end = (): void => {
    setKnob({ x: 0, y: 0 });
    stick.current = { x: 0, y: 0 };
  };
  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e: PointerLike & { currentTarget: HTMLElement; pointerId: number }) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e: PointerLike & { buttons: number; pointerType: string }) => {
        if (e.buttons || e.pointerType === 'touch') move(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function NeedBar({ need, value, wide = false }: { need: NeedId; value: number; wide?: boolean }) {
  const { t } = useI18n();
  const v = Math.round(value);
  return (
    <div className={`need ${wide ? 'wide' : ''} ${v < 25 ? 'low' : v < 50 ? 'mid' : ''}`} title={t(`need.${need}` as I18nKey)}>
      <span className="need-icon">{NEED_ICON[need]}</span>
      {wide && <span className="need-name">{t(`need.${need}` as I18nKey)}</span>}
      <span className="need-bar">
        <span style={{ width: `${v}%` }} />
      </span>
      {wide && <span className="need-val">{v}</span>}
    </div>
  );
}

const hours = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}` : `${m} мин`);
const hoursEn = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/** Кнопка действия у предмета или места. */
function ActionButton({ state, a, onRun }: { state: GameState; a: ActionDef; onRun(): void }) {
  const { t, lang } = useI18n();
  const b: Blocker = blocker(state, a);
  const job = state.life.job;
  const minutes = a.work && job ? JOBS[job.id].shift : a.minutes;
  if (a.work && b === 'job') return null;
  const dur = lang === 'ru' ? hours(minutes) : hoursEn(minutes);
  return (
    <button className={`btn life-act ${a.work ? 'primary' : ''}`} disabled={b !== null} onClick={onRun}>
      <span>
        {a.icon} {a.label[lang]}
      </span>
      <span className="life-act-meta">
        {minutes > 0 && `⏱ ${dur}`}
        {a.cost ? ` · ◈ ${a.cost}` : ''}
        {b && b !== 'missing' ? ` · ${t(`block.${b}` as I18nKey)}` : ''}
      </span>
    </button>
  );
}

/** Карточка жителя: портрет, отношение, реплика и действия. */
function PersonPanel({ state, id, at, onTrain }: { state: GameState; id: PersonId; at: LocationId; onTrain(): void }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const p = PEOPLE[id];
  const r = state.life.people[id];
  const aff = r?.aff ?? 0;
  const tier = tierOf(aff);
  return (
    <div className="life-panel person">
      <div className="person-head">
        <HeroPortrait color={p.color} appearance={p.appearance} equipped={p.equipped} size={58} remember={false} />
        <div>
          <b>
            {p.icon} {r ? p.name[lang] : t('life.stranger')}
          </b>
          <div className="muted small">{p.role[lang]}</div>
          {r && (
            <div className="small">
              {TIER_NAME[tier]![lang]} · {r.partner ? '💞' : ''} {'♥'.repeat(Math.max(0, aff))}
              <span className="muted">{'♥'.repeat(Math.max(0, 10 - Math.max(0, aff)))}</span>
            </div>
          )}
        </div>
      </div>
      <p className="person-line">«{p.lines[r ? tier : 1][lang]}»</p>
      {r && <p className="muted tiny">{tf('life.likes', { what: p.likes[lang] })}</p>}
      <div className="life-acts">
        {PERSON_ACTIONS.filter((a) => (a.partner !== true || r?.partner) && (!a.where || a.where.includes(at))).map((a) => {
          const b = personBlocker(state, id, a.id, at);
          if (b === 'partner' || b === 'where') return null;
          return (
            <button
              key={a.id}
              className="btn life-act"
              disabled={b !== null}
              onClick={() => {
                const out = life.person(id, a.id, at);
                if (out.train) onTrain();
              }}
            >
              <span>
                {a.icon} {a.label[lang]}
              </span>
              <span className="life-act-meta">
                ⏱ {lang === 'ru' ? hours(a.minutes) : hoursEn(a.minutes)}
                {a.cost ? ` · ◈ ${a.cost}` : ''}
                {a.check !== undefined && b === null ? ` · ${Math.round(charmChance(state, id, a.check) * 100)}%` : ''}
                {b === 'aff' ? ` · ♥ ${a.minAff}+` : b ? ` · ${t(`block.${b}` as I18nKey)}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Итог последнего действия. */
function ResultCard({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const { life } = useGame();
  const r = state.life.last;
  if (!r) return null;
  const chips: Array<{ text: string; cls: string }> = [];
  if (r.minutes) chips.push({ text: `⏱ ${lang === 'ru' ? hours(r.minutes) : hoursEn(r.minutes)}`, cls: '' });
  if (r.money) chips.push({ text: `◈ ${r.money > 0 ? '+' : ''}${r.money}`, cls: r.money > 0 ? 'good' : 'bad' });
  for (const n of NEEDS) {
    const d = Math.round(r.needs[n] ?? 0);
    if (Math.abs(d) >= 2) chips.push({ text: `${NEED_ICON[n]} ${d > 0 ? '+' : ''}${d}`, cls: d > 0 ? 'good' : 'bad' });
  }
  for (const [k, xp] of Object.entries(r.skills ?? {})) chips.push({ text: `${SKILL_NAME[k as keyof typeof SKILL_NAME][lang]} +${xp}`, cls: 'good' });
  if (r.aff && r.aff.delta) chips.push({ text: `${PEOPLE[r.aff.person].name[lang]} ♥ ${r.aff.delta > 0 ? '+' : ''}${r.aff.delta}`, cls: r.aff.delta > 0 ? 'good' : 'bad' });
  return (
    <div className={`life-result ${r.ok ? 'ok' : 'fail'}`} role="status">
      <div className="life-result-head">
        <span className="life-result-icon">{r.icon}</span>
        <b>
          {r.ok ? '' : `${t('life.failed')}: `}
          {r.text[lang]}
        </b>
        <button className="btn ghost small" onClick={() => life.dismiss()} aria-label="OK">
          ✕
        </button>
      </div>
      <div className="effect-chips">
        {chips.map((c, i) => (
          <span key={i} className={`effect ${c.cls}`}>
            {c.text}
          </span>
        ))}
      </div>
      {r.notes.map((n, i) => (
        <p key={i} className="life-note">
          {n[lang]}
        </p>
      ))}
    </div>
  );
}

/** Утреннее событие. */
function EventCard({ state }: { state: GameState }) {
  const { lang } = useI18n();
  const { life } = useGame();
  const e = state.life.event;
  const def = e ? lifeEventById(e.id) : undefined;
  if (!e || !def) return null;
  const name = e.person ? PEOPLE[e.person].name[lang] : '';
  return (
    <div className="overlay">
      <div className="sheet center life-event">
        <div className="story-icon">{def.icon}</div>
        <h2>{def.title[lang]}</h2>
        <p>{def.text[lang].replace('{person}', name)}</p>
        <div className="choices">
          {def.choices.map((c) => (
            <button key={c.id} className="choice" disabled={(c.cost ?? 0) > state.gold} onClick={() => life.answer(c.id)}>
              <span className="choice-label">{c.label[lang]}</span>
              {c.cost ? <span className="badge">◈ {c.cost}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type Sheet = null | 'phone' | 'furniture' | 'realty' | 'jobs';
type PhoneTab = 'status' | 'job' | 'people' | 'home';

function JobsList({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  return (
    <ul className="life-list">
      {JOB_IDS.map((id: JobId) => {
        const j = JOBS[id];
        const l0 = j.levels[0]!;
        const ok = meetsLevel(state, id, 0);
        const mine = state.life.job?.id === id;
        return (
          <li key={id}>
            <div>
              <b>
                {j.icon} {j.name[lang]}
              </b>
              <div className="muted small">{j.desc[lang]}</div>
              <div className="small">
                {tf('life.jobStart', { title: l0.title[lang], pay: l0.pay, place: LOCATIONS[j.location].name[lang] })}
                {l0.fitness ? ` · ${tf('life.needFitness', { n: l0.fitness })}` : ''}
                {l0.looks ? ` · ${tf('life.needLooks', { n: l0.looks })}` : ''}
              </div>
            </div>
            {mine ? (
              <span className="badge">{t('life.yourJob')}</span>
            ) : (
              <button className="btn small" disabled={!ok} onClick={() => life.applyJob(id)}>
                {ok ? t('life.apply') : t('life.notYet')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PhoneSheet({ state, tab, setTab }: { state: GameState; tab: PhoneTab; setTab(t: PhoneTab): void }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const L = state.life;
  const job = L.job;
  const jd = job ? JOBS[job.id] : null;
  const next = job && jd ? jd.levels[job.level + 1] : undefined;
  return (
    <div className="phone">
      <div className="segmented">
        {(['status', 'job', 'people', 'home'] as const).map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t(`life.tab.${x}` as I18nKey)}
          </button>
        ))}
      </div>
      {tab === 'status' && (
        <div className="phone-body">
          {NEEDS.map((n) => (
            <NeedBar key={n} need={n} value={L.needs[n]} wide />
          ))}
          <div className="stat-grid">
            <span>😊 {t('life.mood')}</span>
            <b>{mood(L)}</b>
            <span>✨ {t('life.looks')}</span>
            <b>{looks(state)}</b>
            <span>💪 {t('life.fitness')}</span>
            <b>{fitness(state)}</b>
            <span>⚖️ {t('life.body')}</span>
            <b>{L.fat > 0.25 ? t('life.body.heavy') : L.fat < -0.25 ? t('life.body.lean') : t('life.body.normal')}</b>
            <span>🥕 {t('life.groceries')}</span>
            <b>{L.groceries}</b>
          </div>
          <h3>{t('life.skills')}</h3>
          {SKILLS.map((k) => (
            <div key={k} className="skill-row">
              <span>{SKILL_NAME[k][lang]}</span>
              <b>{skillLevel(L.skills[k])}</b>
              <span className="need-bar">
                <span style={{ width: `${Math.min(100, (L.skills[k] / skillNext(L.skills[k])) * 100)}%` }} />
              </span>
            </div>
          ))}
          <p className="muted small">{t('life.fitnessHint')}</p>
        </div>
      )}
      {tab === 'job' && (
        <div className="phone-body">
          {job && jd ? (
            <div className="card inner">
              <b>
                {jd.icon} {jd.levels[job.level]!.title[lang]}
              </b>
              <div className="small">{tf('life.jobInfo', { pay: jd.levels[job.level]!.pay, place: LOCATIONS[jd.location].name[lang], from: jd.hours[0], to: jd.hours[1], h: jd.shift / 60 })}</div>
              <div className="small">{tf('life.jobProgress', { n: job.shifts, m: jd.promoteAfter, perf: Math.round(job.perf) })}</div>
              {next ? (
                <div className="small muted">
                  {tf('life.nextLevel', { title: next.title[lang], pay: next.pay })}
                  {next.skill ? ` · ${SKILL_NAME[next.skill[0]][lang]} ${next.skill[1]}` : ''}
                  {next.fitness ? ` · ${tf('life.needFitness', { n: next.fitness })}` : ''}
                  {next.looks ? ` · ${tf('life.needLooks', { n: next.looks })}` : ''}
                </div>
              ) : (
                <div className="small good">{t('life.topLevel')}</div>
              )}
              <button className="btn ghost small" onClick={() => life.quitJob()}>
                {t('life.quit')}
              </button>
            </div>
          ) : (
            <p className="muted">{t('life.noJob')}</p>
          )}
          <JobsList state={state} />
        </div>
      )}
      {tab === 'people' && (
        <div className="phone-body">
          {PERSON_IDS.filter((p) => L.people[p]).length === 0 && <p className="muted">{t('life.noPeople')}</p>}
          <ul className="life-list">
            {PERSON_IDS.filter((p) => L.people[p]).map((id) => {
              const p = PEOPLE[id];
              const r = L.people[id]!;
              const where = personPlace(id, L.minute);
              return (
                <li key={id}>
                  <HeroPortrait color={p.color} appearance={p.appearance} equipped={p.equipped} size={48} remember={false} />
                  <div>
                    <b>
                      {p.icon} {p.name[lang]} {r.partner ? '💞' : ''}
                    </b>
                    <div className="small">
                      {TIER_NAME[tierOf(r.aff)]![lang]} · ♥ {r.aff}
                    </div>
                    <div className="muted small">{where ? tf('life.nowAt', { place: LOCATIONS[where].name[lang] }) : t('life.nowHome')}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {tab === 'home' && (
        <div className="phone-body">
          <div className="card inner">
            <b>
              {HOMES[L.home].icon} {HOMES[L.home].name[lang]}
            </b>
            <div className="small">{tf('life.rent', { n: HOMES[L.home].rent, day: L.rentUntil })}</div>
            <div className="small">{tf('life.slots', { n: L.furniture.length, m: HOMES[L.home].slots })}</div>
            {L.debt > 0 && (
              <button className="btn small" disabled={state.gold < L.debt} onClick={() => life.payDebt()}>
                {tf('life.payDebt', { n: L.debt })}
              </button>
            )}
          </div>
          <ul className="life-list">
            {L.furniture.map((id) => (
              <li key={id}>
                <span>
                  {OBJECTS[id].icon} {OBJECTS[id].name[lang]}
                </span>
                <button className="btn ghost small" onClick={() => life.sellFurniture(id)}>
                  {tf('life.sell', { n: Math.round((OBJECTS[id].price ?? 0) * 0.4) })}
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('life.homeHint')}</p>
        </div>
      )}
    </div>
  );
}

function FurnitureSheet({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const { life } = useGame();
  return (
    <ul className="life-list">
      {FURNITURE.map((id) => {
        const o = OBJECTS[id];
        const b = furnitureBlocker(state, id);
        return (
          <li key={id}>
            <div>
              <b>
                {o.icon} {o.name[lang]}
              </b>
              <div className="muted small">{o.desc?.[lang]}</div>
            </div>
            <button className="btn small" disabled={b !== null} onClick={() => life.buyFurniture(id)}>
              {b === 'owned' ? '✓' : b ? t(`fblock.${b}` as I18nKey) : `◈ ${o.price}`}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RealtySheet({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  return (
    <ul className="life-list">
      {HOME_IDS.map((id) => {
        const h = HOMES[id];
        const mine = state.life.home === id;
        return (
          <li key={id}>
            <div>
              <b>
                {h.icon} {h.name[lang]}
              </b>
              <div className="muted small">{tf('life.homeInfo', { rent: h.rent, slots: h.slots, comfort: Math.round(h.comfort * 100) })}</div>
            </div>
            {mine ? (
              <span className="badge">{t('life.yourHome')}</span>
            ) : (
              <button className="btn small" disabled={state.gold < h.rent + state.life.debt} onClick={() => life.moveHome(id)}>
                {tf('life.move', { n: h.rent + state.life.debt })}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Вкладка «Жизнь»: 3D-квартира и город, потребности, действия, телефон. */
export function LifeTab({ state, onTrain, onShop }: { state: GameState; onTrain(): void; onShop(): void }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const L = state.life;
  const [near, setNear] = useState<NearTarget | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('status');
  const [failed, setFailed] = useState(false);
  const stick = useRef({ x: 0, y: 0 });
  const goto = useRef<P2 | null>(null);

  const heroLook = useMemo(
    () => ({ color: state.character.color, appearance: effectiveAppearance(state.character.appearance, state), equipped: state.equipped }),
    // Фигура меняется с тренировками и питанием.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.character.color, state.character.appearance, state.equipped, state.statXp, L.fat],
  );
  const signs = useMemo(() => Object.fromEntries(LOCATION_IDS.map((id) => [id, LOCATIONS[id].name[lang]])) as Record<LocationId, string>, [lang]);
  const hour = Math.floor(L.minute / 60);
  const people: ScenePerson[] = useMemo(() => {
    if (L.scene !== 'city') return [];
    const out: ScenePerson[] = [];
    for (const loc of LOCATION_IDS) {
      peopleAt(loc, L.minute).forEach((id, i) => {
        const p = PEOPLE[id];
        out.push({ id, at: loc, spot: personSpot(loc, i), color: p.color, appearance: p.appearance, equipped: p.equipped });
      });
    }
    return out;
    // Жители меняют места по часам.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.scene, hour]);

  const run = (a: ActionDef): void => {
    const out = life.act(a.id);
    if (out.train) onTrain();
    if (out.open === 'shop') onShop();
    else if (out.open) setSheet(out.open);
  };

  // Что показать рядом.
  let panel: ReactNode = null;
  if (near?.kind === 'person') {
    panel = <PersonPanel state={state} id={near.id} at={near.at} onTrain={onTrain} />;
  } else if (near) {
    const where = near.kind === 'object' ? { object: near.id } : { location: near.id };
    const valid = near.kind === 'object' ? hasObject(L, near.id) : true;
    const acts = valid ? actionsAt(where) : [];
    const title = near.kind === 'object' ? `${OBJECTS[near.id].icon} ${OBJECTS[near.id].name[lang]}` : `${LOCATIONS[near.id].icon} ${LOCATIONS[near.id].name[lang]}`;
    const loc = near.kind === 'location' ? LOCATIONS[near.id] : null;
    const closed = near.kind === 'location' && !isOpen(near.id, L.minute);
    panel = (
      <div className="life-panel">
        <div className="life-panel-title">
          <b>{title}</b>
          {loc?.hours && (
            <span className={`muted small ${closed ? 'bad' : ''}`}>
              {closed ? t('life.closed') : t('life.open')} {loc.hours[0]}:00–{loc.hours[1] % 24}:00
            </span>
          )}
        </div>
        <div className="life-acts">
          {acts.map((a) => (
            <ActionButton key={a.id} state={state} a={a} onRun={() => run(a)} />
          ))}
        </div>
      </div>
    );
  }

  const m = mood(L);
  return (
    <div className="world-tab life-tab">
      <div className="world-view life-view">
        {failed ? (
          <div className="world-fallback">
            <p className="muted" style={{ padding: 16 }}>
              {t('life.no3d')}
            </p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="hero3d-busy">
                <div className="spinner" />
              </div>
            }
          >
            <LifeScene3D
              scene={L.scene}
              home={L.home}
              furniture={L.furniture}
              minute={L.minute}
              hero={heroLook}
              people={people}
              signs={signs}
              stick={stick}
              goto={goto}
              onNear={setNear}
              onFail={() => setFailed(true)}
            />
          </Suspense>
        )}
        <div className="life-hud">
          <div className="life-clock">
            <b>{clock(L.minute)}</b>
            <span>{tf('life.day', { n: L.day })}</span>
            <span>◈ {state.gold}</span>
            <span title={t('life.mood')}>{m >= 70 ? '😄' : m >= 45 ? '🙂' : m >= 25 ? '😕' : '😫'}</span>
          </div>
          <div className="life-needs">
            {NEEDS.map((n) => (
              <NeedBar key={n} need={n} value={L.needs[n]} />
            ))}
          </div>
        </div>
        <button className="phone-btn" onClick={() => setSheet('phone')} aria-label={t('life.phone')}>
          📱
        </button>
        <Joystick stick={stick} />
        <div className="life-actions">{panel ?? <span className="world-note">{L.scene === 'home' ? t('life.hintHome') : t('life.hintCity')}</span>}</div>
        <ResultCard state={state} />
      </div>
      <p className="muted small world-help">{t('life.controls')}</p>
      <EventCard state={state} />
      {sheet && (
        <div className="overlay" onClick={() => setSheet(null)}>
          <div className="sheet wide-sheet life-sheet" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
            <div className="row between">
              <h2>{sheet === 'phone' ? `📱 ${t('life.phone')}` : sheet === 'furniture' ? `🛋️ ${t('life.furniture')}` : sheet === 'realty' ? `🏢 ${t('life.realty')}` : `📋 ${t('life.jobs')}`}</h2>
              <button className="btn ghost" onClick={() => setSheet(null)}>
                ✕
              </button>
            </div>
            {sheet === 'phone' && <PhoneSheet state={state} tab={phoneTab} setTab={setPhoneTab} />}
            {sheet === 'furniture' && <FurnitureSheet state={state} />}
            {sheet === 'realty' && <RealtySheet state={state} />}
            {sheet === 'jobs' && <JobsList state={state} />}
          </div>
        </div>
      )}
    </div>
  );
}
