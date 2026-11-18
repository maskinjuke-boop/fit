import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import {
  actionsAt,
  autoChoice,
  blocker,
  catGrowth,
  catMood,
  catName,
  tomorrowOffer,
  clock,
  comfort,
  guestAppearance,
  guestDemand,
  guestOutfit,
  guestsNow,
  hasObject,
  hourlyIncome,
  houseBlocker,
  litterDirty,
  maxCats,
  maxFood,
  oldStuff,
  seats,
  ticket,
  type Blocker,
  type Guest,
} from '../../game/life';
import { Renovation } from './Renovation';
import { catBreedText, catMeta } from './catText';
import { BOWL_MAX, FOOD, HOUSES, OBJECTS, actionById, lifeEventById } from '../../game/lifeContent';
import { demonLayout, homeLayout, type P2 } from '../../game/lifeMap';
import type { ActionDef, ObjectId } from '../../game/lifeTypes';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { animFor } from './three/actionAnims';
import type { Member } from './three/people';
import { DemonCard } from './DemonCard';

const LifeScene3D = lazy(() => import('./three/LifeScene3D'));

/** Предметы текущей локации (для похода сима к ним). */
const layoutOf = (st: GameState) => (st.life.scene === 'cafe' ? homeLayout(st.life.furniture, st.life.cats.length > 0, st.life.house) : demonLayout());

/** Нужные поля события указателя (общие для React и DOM). */
interface PointerLike {
  clientX: number;
  clientY: number;
}

const AUTO_KEY = 'fitness-rpg.lifeAuto';
/** Сим начинает действовать сам, если игрок ничего не трогал столько времени. */
const INPUT_GRACE_MS = 15000;
/** Сим бросает затею, если столько времени не приближается к цели (упёрся), и в любом случае через TASK_MAX_MS. */
const TASK_STUCK_MS = 6000;
const TASK_MAX_MS = 60000;
/**
 * Передышка после своего дела: на каждую потраченную игровую минуту — столько мс, пока сим
 * прохаживается и гладит кошку без траты игрового времени (срочное — пустая миска, грязный
 * лоток, ночь — делает сразу). Так игровые сутки идут около 8 минут.
 */
const REST_MS_PER_MINUTE = 400;
const REST_MIN_MS = 4000;
const REST_MAX_MS = 40000;

/** Дело, к которому сим идёт сам: с какого момента, когда в последний раз приблизился и насколько. */
interface AutoTask {
  action: string;
  at: ObjectId;
  since: number;
  moved: number;
  best: number;
}
/** Действие с анимацией; free — занятие между делами без результата. */
interface Perform {
  key: number;
  action: string;
  at: ObjectId | null;
  free?: boolean;
  /** Дело выбрал сам сим (после него следующее — сразу). */
  self?: boolean;
}

const GUEST_COLORS = ['#e85d2a', '#2f6fb5', '#3a9d6a', '#8e44ad', '#d4a017', '#c0392b', '#16a085', '#e84393'];

/** Гость кафе как 3D-персонаж. */
export function guestMember(g: Guest): Member {
  return { id: g.id, color: GUEST_COLORS[g.seed % GUEST_COLORS.length]!, appearance: guestAppearance(g), equipped: guestOutfit(g) };
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


const hours = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}` : `${m} мин`);
const hoursEn = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/** Кнопка действия у предмета. */
function ActionButton({ state, a, onRun }: { state: GameState; a: ActionDef; onRun(): void }) {
  const { t, lang } = useI18n();
  const b: Blocker = blocker(state, a);
  const dur = lang === 'ru' ? hours(a.minutes) : hoursEn(a.minutes);
  return (
    <button className={`btn life-act ${a.rescue ? 'primary' : ''}`} disabled={b !== null} onClick={onRun}>
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
  if (r.guests) chips.push({ text: `👥 +${r.guests}`, cls: 'good' });
  if (r.money) chips.push({ text: `◈ ${r.money > 0 ? '+' : ''}${r.money}`, cls: r.money > 0 ? 'good' : 'bad' });
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
  return (
    <div className="overlay">
      <div className="sheet center life-event">
        <div className="story-icon">{def.icon}</div>
        <h2>{def.title[lang]}</h2>
        <p>{def.text[lang]}</p>
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

/** Кафе сейчас: гости, вход, уют, доход; кошки и их потребности; миски и лоток. */
function CafeStatus({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const L = state.life;
  return (
    <>
      <div className="stat-grid">
        <span>🐈 {t('cafe.cats')}</span>
        <b>
          {L.cats.length}/{maxCats(L)}
        </b>
        <span>👥 {t('cafe.guestsHour')}</span>
        <b>
          {Math.round(guestDemand(L) * 10) / 10}/{seats(L)}
        </b>
        <span>🎟️ {t('cafe.ticket')}</span>
        <b>◈ {ticket(L)}</b>
        <span>✨ {t('life.comfort')}</span>
        <b>{comfort(L)}</b>
        <span>💰 {t('cafe.income')}</span>
        <b>◈ {hourlyIncome(L)}</b>
        <span>🍰 {t('cafe.food')}</span>
        <b className={L.food === 0 ? 'bad' : ''}>
          {L.food}/{maxFood(L)}
        </b>
        <span>🕙 {t('cafe.hours')}</span>
        <b>{t('cafe.allDay')}</b>
      </div>
      <p className="muted small">{t('cafe.how')}</p>
      <p className="muted small">{tf('cafe.foodHow', { price: FOOD.price, cost: FOOD.cost })}</p>
      {L.food === 0 && L.cats.length > 0 && <p className="bad small">{t('cafe.noFood')}</p>}
      {L.cats.length === 0 && <p className="muted">{t('cafe.noCats')}</p>}
      <ul className="life-list">
        {L.cats.length > 0 && (
          <li>
            <div>
              <div className={`small ${L.bowl === 0 ? 'bad' : ''}`}>🥣 {tf('life.bowl', { n: L.bowl, m: BOWL_MAX })}</div>
              <div className={`small ${L.water <= 0 ? 'bad' : ''}`}>💧 {tf('life.water', { n: Math.round(L.water) })}</div>
              <div className={`small ${litterDirty(L) ? 'bad' : ''}`}>🧻 {tf('life.litter', { n: Math.round(L.litter) })}</div>
            </div>
          </li>
        )}
        {L.cats.map((c) => (
          <li key={c.id}>
            <div>
              <b>🐈 {catName(c)[lang]}</b>
              <div className="muted small">
                {catBreedText(c, lang, t)} · {tf('life.catMood', { n: catMood(c, L) })}
              </div>
              <div className="small">{catMeta(c, L.day, t, tf)}</div>
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
      </ul>
      <p className="muted small">
        {tf('cafe.stats', { visitors: L.stats.visitors, earned: L.stats.earned, rescued: L.stats.rescued, lost: L.stats.lost, meals: L.stats.meals })}
      </p>
    </>
  );
}

/** Ступень кафе и расширение (по числу кошек). */
function HouseCard({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const h = HOUSES[state.life.house]!;
  const next = HOUSES[state.life.house + 1];
  const b = houseBlocker(state);
  return (
    <div className="gym-card">
      <div className="card inner">
        <div className="muted small">{t('life.houseCurrent')}</div>
        <b>
          {h.icon} {h.name[lang]}
        </b>
        <div className="small">{h.desc[lang]}</div>
        <div className="small">{tf('life.houseInfo', { w: h.w, d: h.d, slots: h.slots, cats: h.cats, seats: h.seats, comfort: h.comfort })}</div>
      </div>
      {next ? (
        <div className="card inner">
          <b>
            {next.icon} {tf('life.houseNext', { name: next.name[lang] })}
          </b>
          <div className="small">{next.desc[lang]}</div>
          <div className="small">{tf('life.houseInfo', { w: next.w, d: next.d, slots: next.slots, cats: next.cats, seats: next.seats, comfort: next.comfort })}</div>
          <div className={`small ${state.life.cats.length >= next.needCats ? 'good' : 'bad'}`}>{tf('life.houseNeedCats', { n: next.needCats, have: state.life.cats.length })}</div>
          <button className="btn primary small" disabled={b !== null} onClick={() => life.upgradeHouse()}>
            {b === 'cats' ? tf('life.houseNeedCatsBtn', { n: next.needCats }) : tf('life.houseUpgrade', { n: next.cost })}
          </button>
        </div>
      ) : (
        <p className="good small">{t('life.houseMax')}</p>
      )}
    </div>
  );
}

function FurnitureList({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const { life } = useGame();
  const owned = state.life.furniture;
  const [reno, setReno] = useState(false);
  return (
    <>
      <HouseCard state={state} />
      <button className={`btn small ${oldStuff(state.life) > 0 ? 'primary' : ''}`} onClick={() => setReno((v) => !v)}>
        {reno ? t('life.renovateHide') : t('life.renovate')}
      </button>
      {reno && <Renovation state={state} />}
      <p className="small">
        {t('life.comfort')}: <b>{comfort(state.life)}</b>
      </p>
      {owned.length === 0 && <p className="muted small">{t('life.homeEmpty')}</p>}
      <ul className="life-list">
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
                {t('life.remove')}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t('life.homeShopHint')}</p>
    </>
  );
}

type Sheet = null | 'phone' | 'demon';
type PhoneTab = 'status' | 'cafe';

function PhoneSheet({ state, tab, setTab }: { state: GameState; tab: PhoneTab; setTab(t: PhoneTab): void }) {
  const { t } = useI18n();
  return (
    <div className="phone">
      <div className="segmented">
        {(['status', 'cafe'] as const).map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t(`life.tab.${x}` as I18nKey)}
          </button>
        ))}
      </div>
      <div className="phone-body">{tab === 'status' ? <CafeStatus state={state} /> : <FurnitureList state={state} />}</div>
    </div>
  );
}

/** Вкладка «Кафе»: котокафе и лавка демона в 3D, гости, кошки, кошка дня, телефон. */
export function LifeTab({ state, onTrain, onRescue }: { state: GameState; onTrain(): void; onRescue(exercise: ExerciseId): void }) {
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
  const [autoTask, setAutoTask] = useState<AutoTask | null>(null);
  const lastInput = useRef(performance.now());
  /** Последние дела сима (чтобы не повторять одно и то же). */
  const recent = useRef<string[]>([]);
  /** До какого момента сим берёт только срочное: прохаживается и потягивается, игровое время стоит. */
  const restUntil = useRef(0);
  /** Сим только что прошёлся — теперь можно потянуться или погладить кошку. */
  const strolled = useRef(false);
  // Действие с анимацией: сначала герой занимает место и двигается, потом результат.
  // free — занятие без игрового времени и результата (потянуться, погладить кошку между делами).
  const [perform, setPerform] = useState<Perform | null>(null);
  const performRef = useRef(perform);
  performRef.current = perform;
  const performKey = useRef(0);
  const settled = useRef<(key: number) => void>(() => {});
  const settleWait = useRef(0);
  const catSpots = useRef<P2[]>([]);
  /** Где герой (сцена пишет каждый кадр) — чтобы видеть, идёт ли он к цели. */
  const heroAt = useRef<P2>({ x: 0, z: 0 });
  const live = useRef({ state, near: null as ObjectId | null, sheet: null as Sheet, auto, failed: false });
  /** Прервать занятие между делами (игрок взял управление или выбрал действие). */
  const stopFree = (): void => {
    if (!performRef.current?.free) return;
    clearTimeout(settleWait.current);
    performRef.current = null;
    setPerform(null);
  };
  const playerInput = (): void => {
    lastInput.current = performance.now();
    stopFree();
    if (taskRef.current) {
      taskRef.current = null;
      setAutoTask(null);
      goto.current = null;
    }
  };
  // Таймер действия не переживает вкладку.
  useEffect(() => () => clearTimeout(settleWait.current), []);

  const heroLook = useMemo(
    () => ({ color: state.character.color, appearance: state.character.appearance, equipped: state.equipped }),
    [state.character.color, state.character.appearance, state.equipped],
  );
  const pets = useMemo(() => ({ bowl: L.bowl, water: L.water, litter: L.litter }), [L.bowl, L.water, L.litter]);
  const foodMax = maxFood(L);
  const food = useMemo(() => ({ n: L.food, max: foodMax }), [L.food, foodMax]);
  // Гости в кафе: меняются по часам (внешность — по номеру гостя).
  const guestKey = L.scene === 'cafe' ? guestsNow(L).map((g) => g.id).join(',') : '';
  const guests = useMemo(
    () => (L.scene === 'cafe' ? guestsNow(L).map(guestMember) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guestKey],
  );

  live.current = { state, near, sheet, auto, failed };
  const lifeRef = useRef(life);
  lifeRef.current = life;
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Анимация у предмета: длительность считается с момента, когда герой подошёл и устроился. */
  const play = (pf: Perform, ms: number, done: () => void): void => {
    performRef.current = pf;
    setPerform(pf);
    const finish = (): void => {
      if (performRef.current !== pf) return;
      clearTimeout(settleWait.current);
      done();
      performRef.current = null;
      setPerform(null);
      // После своего дела сим выбирает следующее сразу; после дела игрока — ждёт, пока игрок не бездействует.
      lastInput.current = pf.self ? performance.now() - INPUT_GRACE_MS : performance.now();
    };
    settled.current = (key: number): void => {
      if (key !== pf.key) return;
      clearTimeout(settleWait.current);
      settleWait.current = window.setTimeout(finish, ms);
    };
    // На всякий случай (не дошёл, сцена не отвечает) — не дольше чем ms + 6 с.
    clearTimeout(settleWait.current);
    settleWait.current = window.setTimeout(finish, ms + 6000);
  };

  /** Выполнить действие: с анимацией у предмета, если она есть, иначе сразу. self — дело выбрал сам сим: после него передышка. */
  const doAction = (a: ActionDef, self = false): void => {
    stopFree();
    if (performRef.current) return;
    const spec = animFor(a.id);
    const st = stateRef.current;
    lastInput.current = performance.now();
    if (!spec || a.train || a.rescue || a.open || a.go || blocker(st, a) || st.life.event) {
      const out = lifeRef.current.act(a.id);
      if (out.train) onTrain();
      if (out.rescue) onRescue(out.rescue);
      if (out.open === 'demon') setSheet('demon');
      else if (out.open === 'cafe') {
        setPhoneTab('cafe');
        setSheet('phone');
      }
      return;
    }
    performKey.current += 1;
    recent.current = [...recent.current.slice(-11), a.id];
    play({ key: performKey.current, action: a.id, at: a.at, self }, spec.ms ?? 2600, () => {
      lifeRef.current.act(a.id);
      // Дело съело игровое время — до следующего несрочного дела сим прохаживается (время стоит).
      if (self) restUntil.current = performance.now() + Math.min(REST_MAX_MS, Math.max(REST_MIN_MS, a.minutes * REST_MS_PER_MINUTE));
    });
  };
  /** Занятие между делами: без игрового времени и последствий. */
  const doFree = (id: string): void => {
    const spec = animFor(id);
    if (!spec || performRef.current) return;
    performKey.current += 1;
    play({ key: performKey.current, action: id, at: spec.place === 'cat' ? 'cat' : null, free: true, self: true }, spec.ms ?? 2600, () => {});
  };
  const doActionRef = useRef(doAction);
  doActionRef.current = doAction;
  const doFreeRef = useRef(doFree);
  doFreeRef.current = doFree;
  const taskRef = useRef<AutoTask | null>(null);
  const choiceMemo = useRef<{ st: GameState | null; urgent: boolean; recent: readonly string[] | null; choice: ReturnType<typeof autoChoice> }>({ st: null, urgent: false, recent: null, choice: null });
  const setTask = (t: AutoTask | null): void => {
    taskRef.current = t;
    setAutoTask(t);
  };
  useEffect(() => {
    const id = window.setInterval(() => {
      const { state: st, near: at, sheet: open, auto: on, failed: off } = live.current;
      const now = performance.now();
      if (!on || off || open || st.life.event || performRef.current) return;
      const task = taskRef.current;
      const hero = heroAt.current;
      if (task) {
        // Дошёл — делает; не продвигается к цели — бросает затею.
        const def = actionById(task.action);
        const cat = task.at === 'cat' ? catSpots.current[0] : undefined;
        const spot = cat ? null : layoutOf(st).find((p) => p.id === task.at);
        const target = cat ?? spot?.use ?? null;
        if (target) {
          // Время считается от последнего шага к цели — на медленном устройстве герой не бросает дело на полпути.
          const d = Math.hypot(hero.x - target.x, hero.z - target.z);
          if (d < task.best - 0.1) {
            task.best = d;
            task.moved = now;
          }
        }
        if (at === task.at && def) {
          setTask(null);
          doActionRef.current(def, true);
        } else if (!target || now - task.moved > TASK_STUCK_MS || now - task.since > TASK_MAX_MS) {
          // Не дошёл — запоминает, чтобы сразу не пытаться снова.
          recent.current = [...recent.current.slice(-11), task.action];
          goto.current = null;
          setTask(null);
        } else if (cat) {
          // Кошка ходит — догоняем ближайшую.
          goto.current = { ...cat };
        } else if (!goto.current) {
          // Подошёл, но не вплотную (упёрся в угол) — ещё шаг к месту.
          goto.current = { ...target };
        }
        return;
      }
      if (now - lastInput.current < INPUT_GRACE_MS) return;
      // Выбор пересчитывается, только когда изменилось состояние (он «проигрывает» все действия).
      const urgent = now < restUntil.current;
      const memo = choiceMemo.current;
      if (memo.st !== st || memo.urgent !== urgent || memo.recent !== recent.current) choiceMemo.current = { st, urgent, recent: recent.current, choice: autoChoice(st, recent.current, urgent) };
      const choice = choiceMemo.current.choice;
      if (!choice) {
        // Досуг пока не нужен или делать нечего — прохаживается, потягивается, гладит кошку.
        if (goto.current) return;
        if (strolled.current && Math.random() < 0.65) {
          strolled.current = false;
          const near = catSpots.current[0];
          const petting = st.life.scene === 'cafe' && near && Math.hypot(near.x - hero.x, near.z - hero.z) < 4 && Math.random() < 0.5;
          doFreeRef.current(petting ? 'free_pet' : 'free_look');
          return;
        }
        const spots = layoutOf(st);
        const p = spots[Math.floor(Math.random() * spots.length)];
        if (p) goto.current = { x: p.use.x + (Math.random() - 0.5), z: p.use.z + (Math.random() - 0.5) };
        strolled.current = true;
        return;
      }
      const a = choice.action;
      strolled.current = false;
      let target: P2;
      if (a.at === 'cat') {
        const c = catSpots.current[0];
        if (!c) return;
        target = c;
      } else {
        const spot = layoutOf(st).find((p) => p.id === a.at);
        if (!spot) return;
        target = spot.use;
      }
      goto.current = { ...target };
      setTask({ action: a.id, at: a.at, since: now, moved: now, best: Math.hypot(hero.x - target.x, hero.z - target.z) });
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
  if (perform && !perform.free) {
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
          {near === 'demon' && L.demon && (
            <span className="muted small">
              🐈 {catName(L.demon)[lang]} · {L.demon.progress}/{L.demon.target}
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

  const cafeHint = L.cats.length === 0 ? t('life.hintNoCats') : L.bowl === 0 ? t('life.bowlEmpty') : L.water <= 0 ? t('life.waterEmpty') : litterDirty(L) ? t('life.litterDirty') : L.food === 0 ? t('cafe.noFood') : t('life.hintHome');
  const hint = L.scene === 'cafe' ? cafeHint : t('life.hintDemon');
  const callCat = actionById('call_cat');
  const catsView = useMemo(() => L.cats.map((c) => ({ ...c, grow: catGrowth(c, L.day) })), [L.cats, L.day]);
  const offer = L.demon;
  const offerView = useMemo(() => (L.scene === 'demon' && offer?.status === 'waiting' ? { breed: offer.breed, mix: offer.mix, grow: catGrowth({ born: L.day - offer.age }, L.day) } : null), [L.scene, offer?.status, offer?.breed, offer?.mix, offer?.age, L.day]);
  // Завтрашняя кошка (на коленях у демона) и могилки не спасённых.
  const tomorrow = useMemo(() => {
    if (L.scene !== 'demon' || !state.today) return null;
    const o = tomorrowOffer(state);
    return { breed: o.breed, mix: o.mix, grow: catGrowth({ born: L.day - o.age }, L.day) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.scene, state.today, state.character.id]);
  const graves = useMemo(() => L.graves.map((g) => ({ key: `${g.day}:${g.name}`, breed: g.breed, mix: g.mix, name: catName(g)[lang] })), [L.graves, lang]);
  const travel = actionById(L.scene === 'cafe' ? 'go_demon' : 'go_cafe');
  return (
    <div className="world-tab life-tab">
      <div className={`world-view life-view ${L.scene === 'demon' ? 'demon-view' : ''} `}>
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
              house={L.house}
              home={{ decor: L.decor, kit: L.kit }}
              minute={L.minute}
              hero={heroLook}
              guests={guests}
              offer={offerView}
              tomorrow={tomorrow}
              graves={graves}
              stick={stick}
              goto={goto}
              onNear={setNear}
              onInput={playerInput}
              onSettled={(k: number) => settled.current(k)}
              cats={L.scene === 'cafe' ? catsView : []}
              pets={pets}
              food={food}
              perform={perform}
              catSpots={catSpots}
              heroAt={heroAt}
              onFail={() => setFailed(true)}
            />
          </Suspense>
        )}
        <div className="life-hud">
          <div className="life-clock">
            <b>{clock(L.minute)}</b>
            <span>{tf('life.day', { n: L.day })}</span>
            <span>◈ {state.gold}</span>
            <span title={t('cafe.cats')}>
              🐈 {L.cats.length}/{maxCats(L)}
            </span>
            {L.scene === 'cafe' && <span title={t('cafe.guestsNow')}>{`👥 ${L.guests}`}</span>}
          </div>
          {offer && offer.status === 'waiting' && (
            <button className="demon-chip" onClick={() => setSheet('demon')}>
              😈 {catName(offer)[lang]}: {offer.progress}/{offer.target}
            </button>
          )}
        </div>
        <button className="phone-btn" onClick={() => setSheet('phone')} aria-label={t('life.phone')}>
          📱
        </button>
        {travel && (
          <button className="travel-btn" disabled={!!perform && !perform.free} onClick={() => doAction(travel)} title={travel.label[lang]}>
            {L.scene === 'cafe' ? `😈 ${t('life.toDemon')}` : `🏠 ${t('life.toCafe')}`}
          </button>
        )}
        <button className={`auto-btn ${auto ? 'on' : ''}`} onClick={toggleAuto} title={t('life.autoHint')}>
          🤖 {t(auto ? 'life.autoOn' : 'life.autoOff')}
        </button>
        {autoTask && (
          <div className="auto-thought" role="status">
            💭 {actionById(autoTask.action)?.icon} {actionById(autoTask.action)?.label[lang]}
          </div>
        )}
        {L.scene === 'cafe' && L.cats.length > 0 && callCat && (!perform || perform.free) && (
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
              <h2>{sheet === 'phone' ? `📱 ${t('life.phone')}` : `😈 ${t('demon.title')}`}</h2>
              <button className="btn ghost" onClick={() => setSheet(null)}>
                ✕
              </button>
            </div>
            {sheet === 'phone' && <PhoneSheet state={state} tab={phoneTab} setTab={setPhoneTab} />}
            {sheet === 'demon' && (
              <DemonCard
                state={state}
                onRescue={(ex) => {
                  setSheet(null);
                  onRescue(ex);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
