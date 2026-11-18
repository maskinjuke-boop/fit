import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import {
  actionsAt,
  autoChoice,
  blocker,
  bondLevel,
  bondOf,
  catGrowth,
  catMood,
  catName,
  cafeLayout,
  moveBlocker,
  petOf,
  playBlocker,
  playBoredom,
  playComfort,
  playFree,
  playSizeBlocker,
  tomorrowOffer,
  clock,
  comfort,
  hasObject,
  houseBlocker,
  litterDirty,
  maxCats,
  oldStuff,
  type Blocker,
} from '../../game/life';
import { Renovation } from './Renovation';
import { catBloodText, catBreedText, catMeta } from './catText';
import { BOWL_MAX, HOUSES, OBJECTS, PLAY_ITEMS, PLAY_RUGS, PLAY_SIZES, STARVE_HOURS, STARVE_WARN, actionById, lifeEventById } from '../../game/lifeContent';
import { demonLayout, movable, onWall, turnable, type P2 } from '../../game/lifeMap';
import type { ActionDef, Cat, LifeState, ObjectId } from '../../game/lifeTypes';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { catActMs } from './three/catLife';
import { catColor } from './three/cats3d';
import { DemonCard } from './DemonCard';

const LifeScene3D = lazy(() => import('./three/LifeScene3D'));

/** Предметы текущей локации (для похода сима к ним). */
const layoutOf = (st: GameState) => (st.life.scene === 'cafe' ? cafeLayout(st.life) : demonLayout());

/** Нужные поля события указателя (общие для React и DOM). */
interface PointerLike {
  clientX: number;
  clientY: number;
}

const AUTO_KEY = 'fitness-rpg.lifeAuto';
/** Кошка начинает действовать сама, если игрок ничего не трогал столько времени. */
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
/** Действие кошки игрока с анимацией; target — с какой кошкой. */
interface Perform {
  key: number;
  action: string;
  at: ObjectId | null;
  target?: string | null;
  /** Дело выбрала сама кошка (после него следующее — сразу). */
  self?: boolean;
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
function ActionButton({ state, a, target, onRun }: { state: GameState; a: ActionDef; target?: string | null; onRun(): void }) {
  const { t, lang } = useI18n();
  const b: Blocker = blocker(state, a, target);
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

/** Шкала потребности: голод, вода, игра, туалет. */
function NeedBar({ label, v }: { label: string; v: number }) {
  return (
    <div className={`need wide cat-need ${v < 25 ? 'low' : v < 50 ? 'mid' : ''}`}>
      <span className="need-name">{label}</span>
      <span className="need-bar">
        <span style={{ width: `${Math.round(v)}%` }} />
      </span>
    </div>
  );
}

/** Сколько ещё продержится кошка без еды и воды (часы). */
const starveLeft = (c: Cat): number => Math.max(0, Math.ceil(STARVE_HOURS - c.starve));

/** Отношения кошки с остальными: значок, имя, уровень. */
function Bonds({ c, L }: { c: Cat; L: LifeState }) {
  const { t, lang } = useI18n();
  const others = L.cats.filter((o) => o.id !== c.id).map((o) => ({ o, v: bondOf(L, c.id, o.id) }));
  if (!others.length) return null;
  others.sort((a, b) => b.v - a.v);
  const icon: Record<ReturnType<typeof bondLevel>, string> = { enemy: '⚡', cold: '😾', known: '🤝', pal: '😺', friend: '💛', love: '💞' };
  return (
    <div className="bond-row">
      {others.map(({ o, v }) => (
        <span key={o.id} className={`bond-chip ${bondLevel(v)}`} title={t(`bond.${bondLevel(v)}` as I18nKey)}>
          {icon[bondLevel(v)]} {catName(o)[lang]} {Math.round(v)}
        </span>
      ))}
    </div>
  );
}

/** Дом сейчас: кошки (родословная, ценность, потребности, отношения), миски и лоток. */
function HomeStatus({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const L = state.life;
  const me = petOf(L);
  return (
    <>
      <div className="stat-grid">
        <span>🐈 {t('cafe.cats')}</span>
        <b>
          {L.cats.length}/{maxCats(L)}
        </b>
        <span>✨ {t('life.comfort')}</span>
        <b>{comfort(L)}</b>
      </div>
      <p className="muted small">{t('cafe.how')}</p>
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
          <li key={c.id} className={c.id === me?.id ? 'is-pet' : ''}>
            <div>
              <b>
                <span className="cat-dot" style={{ background: catColor(c.breed) }} /> {catName(c)[lang]} {c.sex === 'f' ? '♀' : '♂'}
                {c.id === me?.id ? ` · 🎮 ${t('pet.you')}` : ''}
              </b>
              <div className="muted small">
                {catBreedText(c, lang, t)} · {tf('life.catMood', { n: catMood(c, L) })}
              </div>
              <div className="small">{catBloodText(c, lang)}</div>
              <div className="small">{catMeta(c, L.day, t, tf)}</div>
              {c.pregnant && <div className="small good">🤰 {tf('cat.pregnant', { n: Math.max(0, c.pregnant.due - L.day) })}</div>}
              {c.starve >= STARVE_WARN && <div className="small bad">☠️ {tf('cat.starving', { n: starveLeft(c) })}</div>}
              <NeedBar label={t('life.catFed')} v={c.fed} />
              <NeedBar label={t('life.catDrink')} v={c.drink} />
              <NeedBar label={t('life.catPlay')} v={c.play} />
              <NeedBar label={t('life.catToilet')} v={c.toilet} />
              <Bonds c={c} L={L} />
            </div>
            {c.id !== me?.id && (
              <button className="btn small" onClick={() => life.setPet(c.id)}>
                🎮 {t('pet.take')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">{tf('cafe.stats', { rescued: L.stats.rescued, lost: L.stats.lost, born: L.stats.born ?? 0, played: L.stats.played })}</p>
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
        <div className="small">{tf('life.houseInfo', { w: h.w, d: h.d, slots: h.slots, cats: h.cats, comfort: h.comfort })}</div>
      </div>
      {next ? (
        <div className="card inner">
          <b>
            {next.icon} {tf('life.houseNext', { name: next.name[lang] })}
          </b>
          <div className="small">{next.desc[lang]}</div>
          <div className="small">{tf('life.houseInfo', { w: next.w, d: next.d, slots: next.slots, cats: next.cats, comfort: next.comfort })}</div>
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

/** Игровая зона для кошек: размер (расширить), игрушки (купить, поставить, убрать), коврик. */
function PlayZoneCard({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const play = state.life.play;
  const size = PLAY_SIZES[play.size]!;
  const next = PLAY_SIZES[play.size + 1];
  const sb = playSizeBlocker(state);
  return (
    <>
      <div className="card inner">
        <div className="muted small">{t('play.size')}</div>
        <b>
          🧶 {size.name[lang]} · {size.w}×{size.d} м
        </b>
        <div className="small">{tf('play.info', { slots: size.slots.length, comfort: playComfort(play) + 2, slow: Math.round((1 - playBoredom(play)) * 100) })}</div>
        {next ? (
          <>
            <div className="small">{tf('play.next', { name: next.name[lang], w: next.w, d: next.d, slots: next.slots.length })}</div>
            <button className="btn primary small" disabled={sb !== null} onClick={() => life.upgradePlay()}>
              {sb === 'house' ? tf('play.needHouse', { name: HOUSES[next.needHouse]!.name[lang] }) : tf('play.upgrade', { n: next.cost })}
            </button>
          </>
        ) : (
          <p className="good small">{t('play.max')}</p>
        )}
      </div>
      <div className="small">{t('play.rug')}</div>
      <div className="rug-row">
        {PLAY_RUGS.map((r) => (
          <button key={r.id} className={`rug-chip ${play.rug === r.id ? 'on' : ''}`} style={{ background: r.color, borderColor: r.edge }} title={r.name[lang]} aria-label={r.name[lang]} onClick={() => life.setRug(r.id)} />
        ))}
      </div>
      <p className="muted small">{tf('play.free', { big: playFree(play, 'big'), small: playFree(play, 'small'), long: playFree(play, 'long') })}</p>
      <ul className="life-list">
        {PLAY_ITEMS.map((it) => {
          const placed = play.items.includes(it.id);
          const owned = play.owned.includes(it.id);
          const b = playBlocker(state, it.id);
          return (
            <li key={it.id}>
              <div>
                <b>
                  {it.icon} {it.name[lang]}
                </b>
                <div className="muted small">
                  {it.desc[lang]} · {t(`play.kind.${it.kind}` as I18nKey)}
                  {it.comfort ? ` · ✨+${it.comfort}` : ''}
                </div>
              </div>
              {placed ? (
                <button className="btn ghost small" onClick={() => life.removePlay(it.id)}>
                  {t('life.remove')}
                </button>
              ) : (
                <button className={`btn small ${owned ? '' : 'primary'}`} disabled={b !== null} onClick={() => life.placePlay(it.id)}>
                  {b === 'space' ? t('play.noSpace') : owned ? t('play.place') : `◈ ${it.price}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

type Sheet = null | 'phone' | 'demon';
type PhoneTab = 'status' | 'cafe' | 'play';

function PhoneSheet({ state, tab, setTab }: { state: GameState; tab: PhoneTab; setTab(t: PhoneTab): void }) {
  const { t } = useI18n();
  return (
    <div className="phone">
      <div className="segmented">
        {(['status', 'cafe', 'play'] as const).map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t(`life.tab.${x}` as I18nKey)}
          </button>
        ))}
      </div>
      <div className="phone-body">{tab === 'status' ? <HomeStatus state={state} /> : tab === 'play' ? <PlayZoneCard state={state} /> : <FurnitureList state={state} />}</div>
    </div>
  );
}

/** Вкладка «Дом»: кошачий дом и лавка демона в 3D, кошка игрока, кошка дня, телефон. */
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

  // ── Самостоятельность: без игрока кошка сама подходит к предметам и пользуется ими ──
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
  // Действие с анимацией: сначала кошка подходит и начинает, потом результат.
  const [perform, setPerform] = useState<Perform | null>(null);
  const performRef = useRef(perform);
  performRef.current = perform;
  const performKey = useRef(0);
  const settled = useRef<(key: number) => void>(() => {});
  const settleWait = useRef(0);
  const catSpots = useRef<Array<{ id: string; x: number; z: number }>>([]);
  /** Где герой (сцена пишет каждый кадр) — чтобы видеть, идёт ли он к цели. */
  const heroAt = useRef<P2>({ x: 0, z: 0 });
  const live = useRef({ state, near: null as ObjectId | null, sheet: null as Sheet, auto, failed: false });
  const playerInput = (): void => {
    lastInput.current = performance.now();
    if (taskRef.current) {
      taskRef.current = null;
      setAutoTask(null);
      goto.current = null;
    }
  };
  // Таймер действия не переживает вкладку.
  useEffect(() => () => clearTimeout(settleWait.current), []);

  const pets = useMemo(() => ({ bowl: L.bowl, water: L.water, litter: L.litter }), [L.bowl, L.water, L.litter]);

  // Перестановка: режим, выбранный предмет (ключ раскладки) и подсказка («сюда нельзя»).
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  live.current = { state, near, sheet: editing ? 'phone' : sheet, auto, failed };
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

  /** Выполнить действие: кошка подходит и делает (результат — после анимации); экраны и спасение — сразу. self — дело выбрала сама кошка: после него передышка. */
  const doAction = (a: ActionDef, self = false): void => {
    if (performRef.current) return;
    const st = stateRef.current;
    const target = a.at === 'cat' ? (catSpots.current[0]?.id ?? null) : null;
    lastInput.current = performance.now();
    if (a.train || a.rescue || a.open || blocker(st, a, target) || st.life.event || !st.life.cats.length) {
      const out = lifeRef.current.act(a.id, target);
      if (out.train) onTrain();
      if (out.rescue) onRescue(out.rescue);
      if (out.open === 'demon') setSheet('demon');
      else if (out.open === 'cafe' || out.open === 'play') {
        setPhoneTab(out.open);
        setSheet('phone');
      }
      return;
    }
    performKey.current += 1;
    recent.current = [...recent.current.slice(-11), a.id];
    play({ key: performKey.current, action: a.id, at: a.at, target, self }, catActMs(a.id), () => {
      lifeRef.current.act(a.id, target);
      // Дело съело игровое время — до следующего несрочного дела кошка отдыхает (время стоит).
      if (self) restUntil.current = performance.now() + Math.min(REST_MAX_MS, Math.max(REST_MIN_MS, a.minutes * REST_MS_PER_MINUTE));
    });
  };
  const doActionRef = useRef(doAction);
  doActionRef.current = doAction;
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
        // Делать нечего — иногда прогуливается по дому (а в остальное время сидит, умывается, дремлет).
        if (goto.current || Math.random() < 0.85) return;
        const spots = layoutOf(st);
        const p = spots[Math.floor(Math.random() * spots.length)];
        if (p) goto.current = { x: p.use.x + (Math.random() - 0.5), z: p.use.z + (Math.random() - 0.5) };
        return;
      }
      const a = choice.action;
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
          {near === 'demon' && L.demon && (
            <span className="muted small">
              🐈 {catName(L.demon)[lang]} · {L.demon.progress}/{L.demon.target}
            </span>
          )}
        </div>
        <div className="life-acts">
          {acts.map((a) => (
            <ActionButton key={a.id} state={state} a={a} target={near === 'cat' ? catSpots.current[0]?.id : null} onRun={() => run(a)} />
          ))}
        </div>
      </div>
    );
  }

  const me = petOf(L);
  const dying = L.cats.find((c) => c.starve >= STARVE_WARN);
  const cafeHint = L.cats.length === 0 ? t('life.hintNoCats') : dying ? tf('cat.starvingHint', { name: catName(dying)[lang], n: starveLeft(dying) }) : L.bowl === 0 ? t('life.bowlEmpty') : L.water <= 0 ? t('life.waterEmpty') : litterDirty(L) ? t('life.litterDirty') : t('life.hintHome');
  const hint = L.scene === 'cafe' ? cafeHint : t('life.hintDemon');
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
  // ─── Перестановка ───
  const layoutNow = editing ? cafeLayout(L) : [];
  const selItem = sel ? layoutNow.find((p) => p.key === sel) : undefined;
  const editMark = useMemo(() => (selItem ? { box: selItem.box ?? { x0: selItem.pos.x - 0.35, x1: selItem.pos.x + 0.35, z0: selItem.pos.z - 0.25, z1: selItem.pos.z + 0.25 }, ok: true } : null), [selItem?.box?.x0, selItem?.box?.z0, selItem?.box?.x1, selItem?.box?.z1, selItem?.pos.x, selItem?.pos.z]);
  const blockText = (b: string): string => t(`move.no.${b}` as I18nKey);
  const tryMove = (key: string, at: { x: number; z: number; rot: number }): void => {
    const b = moveBlocker(stateRef.current.life, key, at);
    if (b) {
      setEditMsg(blockText(b));
      return;
    }
    setEditMsg(null);
    life.move(key, at);
  };
  const onEditTap = (p: P2, key: string | null): void => {
    const lay = cafeLayout(stateRef.current.life);
    const hit = key ? lay.find((x) => x.key === key && movable(x)) : undefined;
    // Касание другого предмета — выбрать его; касание пола — переставить выбранный туда.
    if (hit && hit.key !== sel) {
      setSel(hit.key!);
      setEditMsg(null);
      return;
    }
    if (!sel) {
      if (key && !hit) setEditMsg(t('move.fixed'));
      return;
    }
    const cur = lay.find((x) => x.key === sel);
    if (!cur) return;
    tryMove(sel, { x: p.x, z: p.z, rot: cur.rot });
  };
  const rotateSel = (): void => {
    if (!selItem) return;
    tryMove(selItem.key!, { x: selItem.pos.x, z: selItem.pos.z, rot: selItem.rot + Math.PI / 2 });
  };
  const nudge = (dx: number, dz: number): void => {
    if (!selItem) return;
    tryMove(selItem.key!, { x: selItem.pos.x + dx, z: selItem.pos.z + dz, rot: selItem.rot });
  };
  const editPanel = editing ? (
    <div className="life-panel edit-panel">
      <div className="life-panel-title">
        🖐️ {selItem ? OBJECTS[selItem.id].name[lang] : t('move.title')}
      </div>
      <p className="small muted">{editMsg ?? (selItem ? (onWall(selItem) ? t('move.hintWall') : t('move.hintPlace')) : t('move.hintPick'))}</p>
      {selItem && (
        <div className="edit-row">
          <button className="btn small" onClick={() => nudge(-0.25, 0)} aria-label="←">←</button>
          <button className="btn small" onClick={() => nudge(0, -0.25)} aria-label="↑">↑</button>
          <button className="btn small" onClick={() => nudge(0, 0.25)} aria-label="↓">↓</button>
          <button className="btn small" onClick={() => nudge(0.25, 0)} aria-label="→">→</button>
          {turnable(selItem) && !onWall(selItem) && (
            <button className="btn small" onClick={rotateSel}>
              ⟳ {t('move.rotate')}
            </button>
          )}
          <button className="btn small ghost" disabled={!L.moved[selItem.key!]} onClick={() => life.resetMove(selItem.key!)}>
            ↺ {t('move.reset')}
          </button>
        </div>
      )}
      <div className="edit-row">
        <button className="btn ghost small" disabled={!Object.keys(L.moved).length} onClick={() => life.resetMove(null)}>
          {t('move.resetAll')}
        </button>
        <button
          className="btn primary small"
          onClick={() => {
            setEditing(false);
            setSel(null);
            setEditMsg(null);
          }}
        >
          ✓ {t('move.done')}
        </button>
      </div>
    </div>
  ) : null;
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
              pet={me?.id ?? null}
              offer={offerView}
              tomorrow={tomorrow}
              graves={graves}
              stick={stick}
              goto={goto}
              onNear={setNear}
              onInput={playerInput}
              onSettled={(k: number) => settled.current(k)}
              bond={(a: string, b: string) => bondOf(stateRef.current.life, a, b)}
              cats={catsView}
              pets={pets}
              play={L.play}
              moved={L.moved}
              editing={editing}
              onEditTap={onEditTap}
              editMark={editMark}
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
          </div>
          {me && (
            <div className="pet-card">
              <div className="pet-name">
                <span className="cat-dot" style={{ background: catColor(me.breed) }} /> <b>{catName(me)[lang]}</b> {me.sex === 'f' ? '♀' : '♂'}
              </div>
              <div className="pet-needs">
                {(
                  [
                    ['🍗', me.fed],
                    ['💧', me.drink],
                    ['🧶', me.play],
                    ['🚽', me.toilet],
                  ] as const
                ).map(([ic, v]) => (
                  <span key={ic} className={`pet-need ${v < 25 ? 'low' : v < 50 ? 'mid' : ''}`} title={ic}>
                    {ic}
                    <span className="need-bar">
                      <span style={{ width: `${Math.round(v)}%` }} />
                    </span>
                  </span>
                ))}
              </div>
              {me.starve >= STARVE_WARN && <div className="pet-warn">☠️ {tf('cat.starving', { n: starveLeft(me) })}</div>}
            </div>
          )}
          {offer && offer.status === 'waiting' && (
            <button className="demon-chip" onClick={() => setSheet('demon')}>
              😈 {catName(offer)[lang]}: {offer.progress}/{offer.target}
            </button>
          )}
        </div>
        <button className="phone-btn" onClick={() => setSheet('phone')} aria-label={t('life.phone')}>
          📱
        </button>
        {L.scene === 'cafe' && !editing && (
          <button
            className="edit-btn"
            disabled={!!perform}
            onClick={() => {
              setEditing(true);
              setSel(null);
              setEditMsg(null);
              goto.current = null;
            }}
            title={t('move.title')}
            aria-label={t('move.title')}
          >
            🖐️
          </button>
        )}
        {travel && (
          <button className="travel-btn" disabled={!!perform} onClick={() => doAction(travel)} title={travel.label[lang]}>
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
        {L.cats.length > 1 && !editing && (
          <div className="pet-switch" role="group" aria-label={t('pet.switch')}>
            {L.cats.map((c) => (
              <button key={c.id} className={`pet-chip ${c.id === me?.id ? 'on' : ''}`} disabled={!!perform} onClick={() => life.setPet(c.id)} title={catName(c)[lang]}>
                <span className="cat-dot" style={{ background: catColor(c.breed) }} />
                {catName(c)[lang]}
              </button>
            ))}
          </div>
        )}
        <Joystick stick={stick} onInput={playerInput} />
        <div className="life-actions">{editPanel ?? panel ?? <span className="world-note">{hint}</span>}</div>
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
