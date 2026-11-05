import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import {
  actionsAt,
  autoAction,
  blocker,
  clientAppearance,
  clientForm,
  clientName,
  clientOutfit,
  clientTarget,
  clock,
  dailyQuota,
  effectiveAppearance,
  fee,
  fitness,
  catMood,
  catName,
  comfort,
  litterDirty,
  gymBlocker,
  gymOpen,
  hasObject,
  mood,
  repsOn,
  sessionTarget,
  skillLevel,
  skillNext,
  trainerLevel,
  SKILL_NAME,
  type Blocker,
} from '../../game/life';
import { BOWL_MAX, GYMS, GYM_HOURS, OBJECTS, SESSION_EXERCISES, actionById, catBreedById, lifeEventById } from '../../game/lifeContent';
import { gymLayout, homeLayout, type P2 } from '../../game/lifeMap';
import { NEEDS, SKILLS, type ActionDef, type Client, type NeedId, type ObjectId } from '../../game/lifeTypes';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { animFor } from './three/actionAnims';
import type { Member } from './three/people';
import { HeroPortrait } from './Renders';

const LifeScene3D = lazy(() => import('./three/LifeScene3D'));

/** Предметы текущей локации (для похода сима к ним). */
const layoutOf = (st: GameState) => (st.life.scene === 'home' ? homeLayout(st.life.furniture, st.life.cats.length > 0) : gymLayout(GYMS[st.life.gym]!.shower, GYMS[st.life.gym]!.bar));

/** Нужные поля события указателя (общие для React и DOM). */
interface PointerLike {
  clientX: number;
  clientY: number;
}

const AUTO_KEY = 'fitness-rpg.lifeAuto';
/** Через сколько после управления игроком сим снова действует сам (между своими делами — без паузы). */
const INPUT_GRACE_MS = 1000;
/** Сколько сим идёт к предмету, прежде чем бросить затею. */
const TASK_TIMEOUT_MS = 15000;

const NEED_ICON: Record<NeedId, string> = { food: '🍔', energy: '⚡', hygiene: '🚿', fun: '🎉', social: '💬' };
const CLIENT_COLORS = ['#e85d2a', '#2f6fb5', '#3a9d6a', '#8e44ad', '#d4a017', '#c0392b', '#16a085', '#e84393'];

/** Ученик как 3D-персонаж (общий для зала и занятия). */
export function clientMember(c: Client): Member {
  return { id: c.id, color: CLIENT_COLORS[c.seed % CLIENT_COLORS.length]!, appearance: clientAppearance(c), equipped: clientOutfit(c) };
}

function Joystick({ stick, onInput }: { stick: { current: { x: number; y: number } }; onInput(): void }) {
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
    onInput();
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

/** Кнопка действия у предмета. */
function ActionButton({ state, a, onRun }: { state: GameState; a: ActionDef; onRun(): void }) {
  const { t, lang } = useI18n();
  const b: Blocker = blocker(state, a);
  const dur = lang === 'ru' ? hours(a.minutes) : hoursEn(a.minutes);
  return (
    <button className={`btn life-act ${a.open === 'session' ? 'primary' : ''}`} disabled={b !== null} onClick={onRun}>
      <span>
        {a.icon} {a.label[lang]}
      </span>
      <span className="life-act-meta">
        {a.minutes > 0 && `⏱ ${dur}`}
        {a.cost ? ` · ◈ ${a.cost}` : ''}
        {b && b !== 'missing' ? ` · ${t(`block.${b}` as I18nKey)}` : ''}
      </span>
    </button>
  );
}

/** Итог последнего действия. */
function ResultCard({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const { life } = useGame();
  const r = state.life.last;
  // Итог сам скрывается через несколько секунд, чтобы не закрывать сцену.
  useEffect(() => {
    if (!r) return;
    const id = window.setTimeout(() => life.dismiss(), 6000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
  if (!r) return null;
  const chips: Array<{ text: string; cls: string }> = [];
  if (r.minutes) chips.push({ text: `⏱ ${lang === 'ru' ? hours(r.minutes) : hoursEn(r.minutes)}`, cls: '' });
  if (r.money) chips.push({ text: `◈ ${r.money > 0 ? '+' : ''}${r.money}`, cls: r.money > 0 ? 'good' : 'bad' });
  for (const n of NEEDS) {
    const d = Math.round(r.needs[n] ?? 0);
    if (Math.abs(d) >= 2) chips.push({ text: `${NEED_ICON[n]} ${d > 0 ? '+' : ''}${d}`, cls: d > 0 ? 'good' : 'bad' });
  }
  for (const [k, xp] of Object.entries(r.skills ?? {})) chips.push({ text: `${SKILL_NAME[k as keyof typeof SKILL_NAME][lang]} +${xp}`, cls: 'good' });
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
  const name = state.life.clients[0] ? clientName(state.life.clients[0])[lang] : '';
  return (
    <div className="overlay">
      <div className="sheet center life-event">
        <div className="story-icon">{def.icon}</div>
        <h2>{def.title[lang]}</h2>
        <p>{def.text[lang].replace('{client}', name)}</p>
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

/** Полоса нормы дня. */
function QuotaBar({ state, wide = false }: { state: GameState; wide?: boolean }) {
  const { t } = useI18n();
  const quota = dailyQuota(state);
  const done = Math.min(quota, repsOn(state, state.today));
  return (
    <div className={`quota ${done >= quota ? 'done' : ''} ${wide ? 'wide' : ''}`} title={t('life.quota')}>
      <span>🎯</span>
      {wide && <span className="need-name">{t('life.quota')}</span>}
      <span className="need-bar">
        <span style={{ width: `${(done / quota) * 100}%` }} />
      </span>
      <span className="need-val">
        {done}/{quota}
      </span>
    </div>
  );
}

/** Выбор упражнения для занятия. */
function SessionSheet({ state, onPick }: { state: GameState; onPick(ex: ExerciseId): void }) {
  const { t, tf } = useI18n();
  const n = state.life.clients.length;
  return (
    <div>
      <p className="muted small">{t('life.sessionPick')}</p>
      <p className="small">{tf('life.fee', { n: fee(state) })}</p>
      <ul className="life-list">
        {SESSION_EXERCISES.map(([ex]) => {
          const reps = sessionTarget(state, ex);
          return (
            <li key={ex}>
              <div>
                <b>{t(`exercise.${ex}` as I18nKey)}</b>
                <div className="muted small">{tf('life.sessionLine', { n: reps, pay: fee(state) * n })}</div>
              </div>
              <button className="btn small primary" onClick={() => onPick(ex)}>
                {t('life.sessionGo')}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClientsList({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const L = state.life;
  return (
    <>
      <p className="small">{tf('life.clientsInfo', { n: L.clients.length, cap: GYMS[L.gym]!.cap, target: clientTarget(state) })}</p>
      {L.clients.length === 0 && <p className="muted">{t('life.noClients')}</p>}
      <ul className="life-list">
        {L.clients.map((c) => {
          const m = clientMember(c);
          return (
            <li key={c.id}>
              <HeroPortrait color={m.color} appearance={m.appearance} equipped={m.equipped} size={48} remember={false} />
              <div>
                <b>{clientName(c)[lang]}</b>
                <div className="small">{tf('life.clientLine', { form: Math.round(clientForm(c) * 100), n: c.sessions, loyalty: Math.round(c.loyalty) })}</div>
                <span className="need-bar">
                  <span style={{ width: `${clientForm(c) * 100}%` }} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t('life.wantFitter')}</p>
    </>
  );
}

function GymCard({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const g = GYMS[state.life.gym]!;
  const next = GYMS[state.life.gym + 1];
  const b = gymBlocker(state);
  return (
    <div className="gym-card">
      <div className="card inner">
        <div className="muted small">{t('life.gymCurrent')}</div>
        <b>
          {g.icon} {g.name[lang]}
        </b>
        <div className="small">{g.desc[lang]}</div>
        <div className="small">{tf('life.gymCap', { cap: g.cap, mult: g.mult })}</div>
        <div className="small">{tf('life.fee', { n: fee(state) })}</div>
      </div>
      {next ? (
        <div className="card inner">
          <b>
            {next.icon} {tf('life.gymNext', { name: next.name[lang] })}
          </b>
          <div className="small">{next.desc[lang]}</div>
          <div className="small">{tf('life.gymCap', { cap: next.cap, mult: next.mult })}</div>
          <button className="btn primary small" disabled={b !== null} onClick={() => life.upgradeGym()}>
            {b === 'level' ? tf('life.gymNeedLevel', { n: next.level }) : tf('life.gymUpgrade', { n: next.cost })}
          </button>
        </div>
      ) : (
        <p className="good small">{t('life.gymMax')}</p>
      )}
    </div>
  );
}

function FurnitureList({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const owned = state.life.furniture;
  return (
    <>
      <p className="small">
        {t('life.comfort')}: <b>{comfort(state.life)}</b>
      </p>
      {owned.length === 0 && state.life.cats.length === 0 && <p className="muted small">{t('life.homeEmpty')}</p>}
      <ul className="life-list">
        {state.life.cats.length > 0 && (
          <li>
            <div>
              <div className={`small ${state.life.bowl === 0 ? 'bad' : ''}`}>🥣 {tf('life.bowl', { n: state.life.bowl, m: BOWL_MAX })}</div>
              <div className={`small ${litterDirty(state.life) ? 'bad' : ''}`}>🧻 {tf('life.litter', { n: Math.round(state.life.litter) })}</div>
            </div>
          </li>
        )}
        {state.life.cats.map((c) => (
          <li key={c.id}>
            <div>
              <b>🐈 {catName(c)[lang]}</b>
              <div className="muted small">
                {catBreedById(c.breed).name[lang]} · {tf('life.catMood', { n: catMood(c, state.life) })}
              </div>
              {(['fed', 'play', 'toilet'] as const).map((k) => (
                <div key={k} className={`need wide ${c[k] < 25 ? 'low' : c[k] < 50 ? 'mid' : ''}`}>
                  <span className="need-name">{t(k === 'fed' ? 'life.catFed' : k === 'play' ? 'life.catPlay' : 'life.catToilet')}</span>
                  <span className="need-bar">
                    <span style={{ width: `${Math.round(c[k])}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
        {owned.map((id: ObjectId) => {
          const o = OBJECTS[id];
          return (
            <li key={id}>
              <div>
                <b>
                  {o.icon} {o.name[lang]}
                </b>
                <div className="muted small">{o.desc?.[lang]}</div>
              </div>
              <button className="btn ghost small" onClick={() => life.sellFurniture(id)}>
                {tf('life.sell', { n: Math.round((o.price ?? 0) * 0.4) })}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t('life.homeShopHint')}</p>
    </>
  );
}

type Sheet = null | 'phone' | 'session' | 'gym';
type PhoneTab = 'status' | 'clients' | 'gym' | 'home';

function PhoneSheet({ state, tab, setTab }: { state: GameState; tab: PhoneTab; setTab(t: PhoneTab): void }) {
  const { t, tf, lang } = useI18n();
  const L = state.life;
  const quota = dailyQuota(state);
  return (
    <div className="phone">
      <div className="segmented">
        {(['status', 'clients', 'gym', 'home'] as const).map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t(`life.tab.${x}` as I18nKey)}
          </button>
        ))}
      </div>
      {tab === 'status' && (
        <div className="phone-body">
          <QuotaBar state={state} wide />
          <p className="muted small">{tf('life.quotaHint', { n: quota, fine: 20 + 8 * trainerLevel(state) })}</p>
          {NEEDS.map((n) => (
            <NeedBar key={n} need={n} value={L.needs[n]} wide />
          ))}
          <div className="stat-grid">
            <span>⭐ {t('life.level')}</span>
            <b>{trainerLevel(state)}</b>
            <span>😊 {t('life.mood')}</span>
            <b>{mood(L)}</b>
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
        </div>
      )}
      {tab === 'clients' && (
        <div className="phone-body">
          <ClientsList state={state} />
        </div>
      )}
      {tab === 'gym' && (
        <div className="phone-body">
          <GymCard state={state} />
        </div>
      )}
      {tab === 'home' && (
        <div className="phone-body">
          <FurnitureList state={state} />
        </div>
      )}
    </div>
  );
}

/** Вкладка «Тренер»: дом и фитнес-зал в 3D, потребности, норма дня, занятия, телефон. */
export function LifeTab({ state, onTrain, onSession }: { state: GameState; onTrain(): void; onSession(exercise: ExerciseId): void }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const L = state.life;
  const [near, setNear] = useState<ObjectId | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('status');
  const [failed, setFailed] = useState(false);
  const stick = useRef({ x: 0, y: 0 });
  const goto = useRef<P2 | null>(null);

  // ── Самостоятельность: без игрока сим сам подходит к предметам и пользуется ими ──
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [autoTask, setAutoTask] = useState<{ action: string; at: ObjectId; since: number } | null>(null);
  const lastInput = useRef(performance.now() - INPUT_GRACE_MS);
  /** Последние дела сима (чтобы не повторять одно и то же). */
  const recent = useRef<string[]>([]);
  // Действие с анимацией: сначала герой занимает место и двигается, потом результат.
  const [perform, setPerform] = useState<{ key: number; action: string; at: ObjectId } | null>(null);
  const performRef = useRef(perform);
  performRef.current = perform;
  const performKey = useRef(0);
  const settled = useRef<(key: number) => void>(() => {});
  const settleWait = useRef(0);
  const catSpots = useRef<P2[]>([]);
  const live = useRef({ state, near: null as ObjectId | null, sheet: null as Sheet, auto, failed: false });
  const playerInput = (): void => {
    lastInput.current = performance.now();
    if (taskRef.current) {
      taskRef.current = null;
      setAutoTask(null);
      goto.current = null;
    }
  };

  const heroLook = useMemo(
    () => ({ color: state.character.color, appearance: effectiveAppearance(state.character.appearance, state), equipped: state.equipped }),
    // Фигура меняется с тренировками и питанием.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.character.color, state.character.appearance, state.equipped, state.statXp, L.fat],
  );
  const open = gymOpen(L.minute);
  const pets = useMemo(() => ({ bowl: L.bowl, litter: L.litter }), [L.bowl, L.litter]);
  const clientsKey = JSON.stringify(L.clients.map((c) => [c.id, c.fat.toFixed(2), c.muscle.toFixed(2)]));
  const clients = useMemo(
    () => (L.scene === 'gym' && open ? L.clients.map(clientMember) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [L.scene, open, clientsKey],
  );

  live.current = { state, near, sheet, auto, failed };
  const lifeRef = useRef(life);
  lifeRef.current = life;
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Выполнить действие: с анимацией у предмета, если она есть, иначе сразу. */
  const doAction = (a: ActionDef): void => {
    if (performRef.current) return;
    const spec = animFor(a.id);
    const st = stateRef.current;
    lastInput.current = performance.now();
    if (!spec || a.train || a.open || a.go || blocker(st, a) || st.life.event) {
      const out = lifeRef.current.act(a.id);
      if (out.train) onTrain();
      if (out.open === 'session') setSheet('session');
      else if (out.open === 'gym') {
        setPhoneTab('gym');
        setSheet('phone');
      } else if (out.open === 'furniture') {
        setPhoneTab('home');
        setSheet('phone');
      }
      return;
    }
    performKey.current += 1;
    const pf = { key: performKey.current, action: a.id, at: a.at };
    performRef.current = pf;
    setPerform(pf);
    recent.current = [...recent.current.slice(-11), a.id];
    const finish = (): void => {
      if (performRef.current !== pf) return;
      clearTimeout(settleWait.current);
      lifeRef.current.act(a.id);
      performRef.current = null;
      setPerform(null);
      // Следующее дело сим выбирает сразу, без паузы.
      lastInput.current = performance.now() - INPUT_GRACE_MS;
    };
    // Длительность считается с момента, когда герой подошёл и устроился; на всякий случай — не дольше 9 с.
    const ms = spec.ms ?? 2600;
    settled.current = (key: number): void => {
      if (key !== pf.key) return;
      clearTimeout(settleWait.current);
      settleWait.current = window.setTimeout(finish, ms);
    };
    settleWait.current = window.setTimeout(finish, ms + 6000);
  };
  const doActionRef = useRef(doAction);
  doActionRef.current = doAction;
  const taskRef = useRef<{ action: string; at: ObjectId; since: number } | null>(null);
  const lastWander = useRef(0);
  const setTask = (t: { action: string; at: ObjectId; since: number } | null): void => {
    taskRef.current = t;
    setAutoTask(t);
  };
  useEffect(() => {
    const id = window.setInterval(() => {
      const { state: st, near: at, sheet: open, auto: on, failed: off } = live.current;
      const now = performance.now();
      if (!on || off || open || st.life.event || performRef.current) return;
      const task = taskRef.current;
      if (task) {
        // Дошёл — делает; застрял — бросает затею.
        const def = actionById(task.action);
        if (at === task.at && def) {
          setTask(null);
          doActionRef.current(def);
        } else if (task.at === 'cat' && catSpots.current.length) {
          // Кошка ходит — догоняем ближайшую.
          const c = catSpots.current[0]!;
          goto.current = { ...c };
          if (now - task.since > TASK_TIMEOUT_MS) setTask(null);
        } else if (now - task.since > TASK_TIMEOUT_MS) {
          // Не дошёл — запоминает, чтобы сразу не пытаться снова.
          recent.current = [...recent.current.slice(-11), task.action];
          goto.current = null;
          setTask(null);
        } else if (!goto.current) {
          // Подошёл, но не вплотную (упёрся в угол) — ещё шаг к месту.
          const spot = layoutOf(st).find((p) => p.id === task.at);
          if (spot) goto.current = { ...spot.use };
        }
        return;
      }
      if (now - lastInput.current < INPUT_GRACE_MS) return;
      const a = autoAction(st, recent.current);
      if (!a) {
        // Делать нечего (зал закрыт, нет предметов) — сим прохаживается, а не стоит.
        if (!goto.current && now - lastWander.current > 5000) {
          lastWander.current = now;
          const spots = layoutOf(st);
          const p = spots[Math.floor(Math.random() * spots.length)];
          if (p) goto.current = { x: p.use.x + (Math.random() - 0.5), z: p.use.z + (Math.random() - 0.5) };
        }
        return;
      }
      if (a.at === 'cat') {
        const c = catSpots.current[0];
        if (!c) return;
        goto.current = { ...c };
      } else {
        const spot = layoutOf(st).find((p) => p.id === a.at);
        if (!spot) return;
        goto.current = { ...spot.use };
      }
      setTask({ action: a.id, at: a.at, since: now });
    }, 250);
    return () => clearInterval(id);
  }, []);

  const toggleAuto = (): void => {
    const next = !auto;
    setAuto(next);
    if (!next && taskRef.current) {
      taskRef.current = null;
      setAutoTask(null);
      goto.current = null;
    }
    try {
      localStorage.setItem(AUTO_KEY, next ? '1' : '0');
    } catch {
      // без хранилища выбор живёт до перезагрузки
    }
  };

  const run = (a: ActionDef): void => doAction(a);

  let panel: ReactNode = null;
  if (perform) {
    const a = actionById(perform.action);
    panel = (
      <div className="life-panel performing">
        <b>
          {a?.icon} {a?.label[lang]}…
        </b>
      </div>
    );
  } else if (near && hasObject(state, near)) {
    const acts = actionsAt(near);
    panel = (
      <div className="life-panel">
        <div className="life-panel-title">
          <b>
            {OBJECTS[near].icon} {OBJECTS[near].name[lang]}
          </b>
          {near === 'coach' && (
            <span className="muted small">
              👥 {L.clients.length} · ◈ {fee(state) * L.clients.length}
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
  const homeHint = L.cats.length && L.bowl === 0 ? t('life.bowlEmpty') : litterDirty(L) ? t('life.litterDirty') : t('life.hintHome');
  const hint = L.scene === 'home' ? homeHint : open ? t('life.hintGym') : tf('life.hintClosed', { from: GYM_HOURS[0], to: GYM_HOURS[1] });
  const callCat = actionById('call_cat');
  return (
    <div className="world-tab life-tab">
      <div className={`world-view life-view ${perform && /^(sleep|nap)$/.test(perform.action) ? 'sleeping' : ''}`}>
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
              furniture={L.furniture}
              gym={L.gym}
              minute={L.minute}
              hero={heroLook}
              clients={clients}
              stick={stick}
              goto={goto}
              onNear={setNear}
              onInput={playerInput}
              onSettled={(k: number) => settled.current(k)}
              cats={L.cats}
              pets={pets}
              perform={perform}
              catSpots={catSpots}
              onFail={() => setFailed(true)}
            />
          </Suspense>
        )}
        <div className="life-hud">
          <div className="life-clock">
            <b>{clock(L.minute)}</b>
            <span>{tf('life.day', { n: L.day })}</span>
            <span>◈ {state.gold}</span>
            <span title={t('life.clients')}>👥 {L.clients.length}</span>
            <span title={t('life.mood')}>{m >= 70 ? '😄' : m >= 45 ? '🙂' : m >= 25 ? '😕' : '😫'}</span>
          </div>
          <div className="life-needs">
            {NEEDS.map((n) => (
              <NeedBar key={n} need={n} value={L.needs[n]} />
            ))}
          </div>
          <QuotaBar state={state} />
        </div>
        <button className="phone-btn" onClick={() => setSheet('phone')} aria-label={t('life.phone')}>
          📱
        </button>
        <button className={`auto-btn ${auto ? 'on' : ''}`} onClick={toggleAuto} title={t('life.autoHint')}>
          🤖 {t(auto ? 'life.autoOn' : 'life.autoOff')}
        </button>
        {autoTask && (
          <div className="auto-thought" role="status">
            💭 {actionById(autoTask.action)?.icon} {actionById(autoTask.action)?.label[lang]}
          </div>
        )}
        {L.scene === 'home' && L.cats.length > 0 && callCat && !perform && (
          <button className="btn ghost small call-cat-btn" onClick={() => doAction(callCat)} title={callCat.label[lang]}>
            🐈 {t('life.callCat')}
          </button>
        )}
        <Joystick stick={stick} onInput={playerInput} />
        <div className="life-actions">{panel ?? <span className="world-note">{hint}</span>}</div>
        <ResultCard state={state} />
      </div>
      <p className="muted small world-help">{t('life.controls')}</p>
      <EventCard state={state} />
      {sheet && (
        <div className="overlay" onClick={() => setSheet(null)}>
          <div className="sheet wide-sheet life-sheet" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
            <div className="row between">
              <h2>{sheet === 'phone' ? `📱 ${t('life.phone')}` : sheet === 'session' ? `📣 ${t('life.session')}` : `🏋️ ${t('life.tab.gym')}`}</h2>
              <button className="btn ghost" onClick={() => setSheet(null)}>
                ✕
              </button>
            </div>
            {sheet === 'phone' && <PhoneSheet state={state} tab={phoneTab} setTab={setPhoneTab} />}
            {sheet === 'session' && (
              <SessionSheet
                state={state}
                onPick={(ex) => {
                  setSheet(null);
                  life.startSession(ex);
                  onSession(ex);
                }}
              />
            )}
            {sheet === 'gym' && <GymCard state={state} />}
          </div>
        </div>
      )}
    </div>
  );
}
