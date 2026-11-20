import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { buildBlocker, demolishBlocker, tileAt } from '../../game/city/city';
import {
  BUILDINGS,
  CAT_ITEMS,
  CLEAR_ASH,
  DEMOLISH_REFUND,
  HOUSE_LEVELS,
  MAP,
  OFFERING_REWARD,
  TOWNS,
  WORKSHOP_LEVELS,
  buildingById,
  itemDef,
  professionById,
} from '../../game/city/content';
import { buildingAt, catAgeDays, catName, dayOf, doingText, freeBeds, hourOf, houseCapacity, jobsOf, moodParts, productivity, residents, townLevel, workers } from '../../game/city/sim';
import type { BuildingId, BuildingKind, CityCat, CityState } from '../../game/city/types';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { CatPortrait } from './CatPortrait';
import { ageText, clockText, coatText, countdown, levelName, moodFace, plural, toMidnight } from './cityText';
import { catOutfit, type ChibiPose } from './chibi';
import { CityView, setLabelName, type Tap } from './view';

const XRAY_KEY = 'fitness-rpg.city-xray';

type Sel = { kind: 'cat'; id: number } | { kind: 'building'; id: number } | { kind: 'build'; gx: number; gz: number } | { kind: 'offering' } | { kind: 'news' } | { kind: 'residents' } | null;

/** Короткий выбор языка: L('по-русски', 'in English'). */
function useL(): (ru: string, en: string) => string {
  const { lang } = useI18n();
  return (ru, en) => (lang === 'ru' ? ru : en);
}

const POSE_OF: Record<CityCat['act']['kind'], ChibiPose> = {
  arrive: 'idle',
  sleep: 'sleep',
  eat: 'eat',
  work: 'work',
  fun: 'play',
  shop: 'shop',
  stroll: 'idle',
  relax: 'sit',
  upgrade: 'hammer',
  jobhunt: 'pray',
  pray: 'pray',
};

/**
 * Город кошек на весь экран: сверху — поселение, деньги, игровое время и подношение богам;
 * касание кошки — сводка о ней, здания — карточка, пустой клетки — стройка.
 */
export function CityScreen({ state, onTrain }: { state: GameState; onTrain(ex?: ExerciseId): void }) {
  const { lang } = useI18n();
  const L = useL();
  const game = useGame();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CityView | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  // Вид внутрь домов и мастерских (прозрачные крыши) — запоминается в браузере.
  const [xray, setXray] = useState<boolean>(() => {
    try {
      return localStorage.getItem(XRAY_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleXray = (): void => {
    const next = !xray;
    setXray(next);
    try {
      localStorage.setItem(XRAY_KEY, next ? '1' : '0');
    } catch {
      // нет доступа к хранилищу
    }
    say(next ? L('👁 Крыши прозрачные: видно, что кошки делают дома и в мастерских', '👁 Roofs are see-through: watch the cats at home and at work') : L('Крыши снова на месте', 'Roofs are back'));
  };
  const c = state.city;
  const stateRef = useRef(state);
  stateRef.current = state;
  const langRef = useRef(lang);
  langRef.current = lang;

  const say = (text: string): void => {
    setToast(text);
  };
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // Касание в 3D: кошка → сводка, здание → карточка, пустая клетка → стройка (или подсказка, когда закрыта).
  const onTap = (tap: Tap): void => {
    const city = game.live();
    if (!city) return;
    const ru = langRef.current === 'ru';
    if (tap.kind === 'cat') {
      setSel({ kind: 'cat', id: tap.id });
      return;
    }
    const b = tileAt(city, tap.gx, tap.gz);
    if (b) {
      setSel({ kind: 'building', id: b.id });
      return;
    }
    const need = Math.max(Math.abs(tap.gx), Math.abs(tap.gz));
    const lv = townLevel(city);
    if (need > TOWNS[lv]!.radius) {
      const next = TOWNS.findIndex((x) => x.radius >= need);
      if (next < 0) {
        setSel(null);
        return;
      }
      const tw = TOWNS[next]!;
      setToast(ru ? `🔒 Откроется, когда поселение станет «${tw.name.ru}» — нужно ${tw.pop} жителей` : `🔒 Opens when the settlement becomes a ${tw.name.en.toLowerCase()} — ${tw.pop} residents needed`);
      setSel(null);
      return;
    }
    setSel({ kind: 'build', gx: tap.gx, gz: tap.gz });
  };
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  // Для автотестов в режиме администратора: касание без 3D.
  useEffect(() => {
    if (!game.adminEnabled) return;
    const w = window as unknown as { cityTap?: (t: Tap) => void };
    w.cityTap = (tp) => onTapRef.current(tp);
    return () => {
      delete w.cityTap;
    };
  }, [game.adminEnabled]);

  useEffect(() => {
    if (!host.current) return;
    let v: CityView | null = null;
    try {
      v = new CityView(host.current, { live: game.live, onTap: (tp) => onTapRef.current(tp) });
    } catch {
      setToast('WebGL недоступен');
      return;
    }
    view.current = v;
    const ro = new ResizeObserver(() => v?.resize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      v?.dispose();
      view.current = null;
    };
    // game.live стабилен по смыслу (читает ref) — пересоздавать сцену не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLabelName((k) => catName(k)[lang]);
  }, [lang]);

  // Выделение в 3D повторяет открытую карточку.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.selectedCat = sel?.kind === 'cat' ? sel.id : null;
    const b = sel?.kind === 'building' ? buildingAt(c, sel.id) : undefined;
    v.selectedTile = sel?.kind === 'build' ? [sel.gx, sel.gz] : b ? [b.gx, b.gz] : null;
    v.follow = sel?.kind === 'cat' && follow;
    v.xray = xray;
  }, [sel, follow, c, xray]);

  // Кошки больше нет (сгорела) — карточка закрывается.
  if (sel?.kind === 'cat' && !c.cats.some((k) => k.id === sel.id)) queueMicrotask(() => setSel(null));
  if (sel?.kind === 'building' && !c.buildings.some((b) => b.id === sel.id)) queueMicrotask(() => setSel(null));

  const lv = townLevel(c);
  const town = TOWNS[lv]!;
  const hour = hourOf(c.clock);
  const o = c.offering && c.offering.day === state.today ? c.offering : null;
  const doneTasks = o ? o.tasks.filter((x) => x.done >= x.target).length : 0;
  const left = toMidnight();
  const night = hour < 6 || hour >= 21;

  /** Свободная открытая клетка поближе к центру экрана — для кнопки «Строить». */
  const openBuild = (): void => {
    const v = view.current;
    const R = Math.min(MAP, town.radius);
    const cx = v ? v.target.x / 4 : 0;
    const cz = v ? v.target.z / 4 : 0;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let gx = -R; gx <= R; gx += 1)
      for (let gz = -R; gz <= R; gz += 1) {
        if (tileAt(c, gx, gz)) continue;
        const d = Math.hypot(gx - cx, gz - cz) + Math.hypot(gx, gz) * 0.3;
        if (d < bd) {
          bd = d;
          best = [gx, gz];
        }
      }
    if (!best) {
      say(L('Свободных клеток нет — поселение должно вырасти', 'No free plots — the settlement must grow'));
      return;
    }
    v?.focus(best[0] * 4, best[1] * 4 + 2);
    setSel({ kind: 'build', gx: best[0], gz: best[1] });
  };

  return (
    <div className="city">
      <div className="city-canvas" ref={host} />

      <header className="city-hud">
        <div className="hud-row">
          <button className="hud-pill name" onClick={() => setSel({ kind: 'news' })}>
            <span>{town.icon}</span>
            <span className="hud-name">{c.name}</span>
            <span className="muted small">{town.name[lang]}</span>
          </button>
          <button className="hud-pill" title={L('Жители', 'Residents')} onClick={() => setSel({ kind: 'residents' })}>
            🐱 {c.cats.length} <span className="muted small">›</span>
          </button>
          <span className="hud-pill gold">◈ {state.gold}</span>
        </div>
        <div className="hud-row">
          <span className="hud-pill small">
            {night ? '🌙' : hour < 8 || hour > 18 ? '🌇' : '☀️'} {L('День', 'Day')} {dayOf(c.clock) + 1} · {clockText(hour)}
          </span>
          <button className={`hud-pill offering ${o?.complete ? 'ok' : left < 3 * 3600_000 ? 'urgent' : ''}`} onClick={() => setSel({ kind: 'offering' })}>
            {o?.complete ? (
              <>✨ {L('Боги довольны', 'The gods are pleased')}</>
            ) : (
              <>
                ⛩️ {L('Подношение', 'Offering')} {doneTasks}/{o?.tasks.length ?? 0} · ⏳ {countdown(left)}
              </>
            )}
          </button>
        </div>
      </header>

      {toast && (
        <button className="city-toast" onClick={() => setToast(null)}>
          {toast}
        </button>
      )}

      {!sel && (
        <div className="city-fabs">
          <button className="fab" onClick={openBuild}>
            <span>🏗️</span>
            <span>{L('Строить', 'Build')}</span>
          </button>
          <button className="fab" onClick={() => setSel({ kind: 'residents' })}>
            <span>🐱</span>
            <span>{L('Жители', 'Residents')}</span>
          </button>
          <button className={`fab ${xray ? 'on' : ''}`} onClick={toggleXray} aria-pressed={xray}>
            <span>{xray ? '🏠' : '👁️'}</span>
            <span>{xray ? L('Крыши', 'Roofs') : L('Внутрь', 'Inside')}</span>
          </button>
          <button className="fab main" onClick={() => (o && !o.complete ? setSel({ kind: 'offering' }) : onTrain())}>
            <span>💪</span>
            <span>{o && !o.complete ? L('Подношение', 'Offering') : L('Тренировка', 'Workout')}</span>
          </button>
        </div>
      )}

      {sel && (
        <Sheet onClose={() => setSel(null)}>
          {sel.kind === 'cat' && <CatCard city={c} id={sel.id} follow={follow} onFollow={setFollow} onBuilding={(id) => setSel({ kind: 'building', id })} />}
          {sel.kind === 'building' && (
            <BuildingCard
              state={state}
              id={sel.id}
              onCat={(id) => setSel({ kind: 'cat', id })}
              onOffering={() => setSel({ kind: 'offering' })}
              onDone={(msg) => {
                say(msg);
                setSel(null);
              }}
            />
          )}
          {sel.kind === 'build' && (
            <BuildMenu
              state={state}
              gx={sel.gx}
              gz={sel.gz}
              onBuilt={(type) => {
                const d = buildingById(type);
                say(`${d.icon} ${L('Построено', 'Built')}: ${d.name[lang]}${type === 'house' ? L(' — скоро приедет жилец', ' — a resident will arrive soon') : ''}`);
                setSel(null);
              }}
            />
          )}
          {sel.kind === 'offering' && <OfferingCard state={state} onTrain={onTrain} />}
          {sel.kind === 'residents' && (
            <ResidentsCard
              city={c}
              onCat={(id) => {
                const k = c.cats.find((x) => x.id === id);
                if (k) view.current?.focus(k.x, k.z + 1);
                setSel({ kind: 'cat', id });
              }}
              onNews={() => setSel({ kind: 'news' })}
            />
          )}
          {sel.kind === 'news' && <NewsCard city={c} onRename={(n) => game.city.rename(n)} />}
        </Sheet>
      )}
      {/* Подсказка под HUD о свободных местах для новых кошек. */}
      {!sel && freeBeds(c) === 0 && c.cats.length < 3 && (
        <div className="city-hint">{L('Купите пустой домик — в него приедет новая кошка', 'Buy an empty cottage — a new cat will move in')}</div>
      )}
    </div>
  );
}

function Sheet({ children, onClose }: { children: ReactNode; onClose(): void }) {
  return (
    <div className="city-sheet" role="dialog">
      <button className="city-sheet-close" onClick={onClose} aria-label="close">
        ✕
      </button>
      {children}
    </div>
  );
}

function Bar({ v, color }: { v: number; color?: string }) {
  return (
    <span className="bar">
      <span style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
    </span>
  );
}

// ─── Сводка о кошке ────────────────────────────────────────────────────

const MOOD_LABEL: Record<string, [string, string]> = {
  food: ['Сытость', 'Food'],
  energy: ['Бодрость', 'Energy'],
  fun: ['Веселье', 'Fun'],
  social: ['Общение', 'Company'],
  home: ['Дом', 'Home'],
  nature: ['Благоустройство', 'Surroundings'],
  items: ['Вещи', 'Things'],
  job: ['Работа', 'Job'],
  blessed: ['Благословение', 'Blessing'],
  sad: ['Горе после пожара', 'Grief after the fire'],
};

function CatCard({ city, id, follow, onFollow, onBuilding }: { city: CityState; id: number; follow: boolean; onFollow(v: boolean): void; onBuilding(id: number): void }) {
  const { lang } = useI18n();
  const L = useL();
  const k = city.cats.find((x) => x.id === id);
  if (!k) return null;
  const p = professionById(k.profession);
  const home = buildingAt(city, k.home);
  const work = buildingAt(city, k.work);
  const parts = moodParts(city, k);
  const pose: ChibiPose = k.act.path?.length ? 'walk' : POSE_OF[k.act.kind];
  const n = k.needs;
  return (
    <div className="cat-card">
      <div className="cat-head">
        <CatPortrait coat={k.coat} profession={k.profession} items={k.items} pose={pose} size={118} seed={k.id} outfit={catOutfit(k)} />
        <div className="cat-title">
          <h2>
            {catName(k)[lang]} <span className="muted">{k.sex === 'f' ? '♀' : '♂'}</span>
          </h2>
          <p className="muted small">
            {coatText(k, lang)} · {ageText(catAgeDays(city, k), lang)}
          </p>
          <p className="cat-prof">
            {p.icon} {p.name[lang]}
          </p>
          <p className="cat-doing">«{doingText(city, k)[lang]}»</p>
        </div>
      </div>

      <div className="cat-mood">
        <span className="cat-mood-face">{moodFace(k.mood)}</span>
        <div className="grow">
          <div className="row-between">
            <b>{L('Настроение', 'Mood')}</b>
            <span>{Math.round(k.mood)}/100</span>
          </div>
          <Bar v={k.mood} color={k.mood >= 60 ? 'var(--good)' : k.mood >= 35 ? 'var(--accent)' : 'var(--bad)'} />
          <p className="muted small">
            {L('Работает на', 'Works at')} {Math.round(productivity(city, k) * 100)}% {L('— чем веселее, тем больше зарабатывает', '— the happier, the more she earns')}
          </p>
        </div>
      </div>
      <div className="mood-parts">
        {parts.map((x) => (
          <span key={x.key} className={`mood-chip ${x.v > 0 ? 'up' : 'down'}`} title={MOOD_LABEL[x.key]?.[lang === 'ru' ? 0 : 1]}>
            {x.icon} {MOOD_LABEL[x.key]?.[lang === 'ru' ? 0 : 1]} {x.v > 0 ? '+' : ''}
            {x.v}
          </span>
        ))}
      </div>

      <div className="needs-grid">
        {(
          [
            ['🍗', L('Сытость', 'Food'), n.food],
            ['💤', L('Бодрость', 'Energy'), n.energy],
            ['🎈', L('Веселье', 'Fun'), n.fun],
            ['💬', L('Общение', 'Company'), n.social],
          ] as const
        ).map(([icon, label, v]) => (
          <div key={label} className="need-row">
            <span>
              {icon} {label}
            </span>
            <Bar v={v} color={v > 50 ? 'var(--good)' : v > 25 ? 'var(--accent)' : 'var(--bad)'} />
          </div>
        ))}
      </div>

      <dl className="facts">
        <dt>{L('Кошелёк', 'Wallet')}</dt>
        <dd>
          ◈ {Math.floor(k.money)} <span className="muted small">({L('заработано всего', 'earned in total')} {Math.floor(k.earned)})</span>
        </dd>
        <dt>{L('Дом', 'Home')}</dt>
        <dd>{home ? <button className="link" onClick={() => onBuilding(home.id)}>🏠 {levelName(home)[lang]}</button> : L('нет', 'none')}</dd>
        <dt>{L('Работа', 'Job')}</dt>
        <dd>
          {work ? (
            <button className="link" onClick={() => onBuilding(work.id)}>
              {buildingById(work.type).icon} {buildingById(work.type).name[lang]}
            </button>
          ) : (
            <span className="bad">
              {L('нет мастерской —', 'no workshop —')} {L('постройте', 'build a')} {buildingById(p.workshop).icon} {buildingById(p.workshop).name[lang].toLowerCase()}
            </span>
          )}
        </dd>
        <dt>{L('Вещи', 'Things')}</dt>
        <dd>{k.items.length ? k.items.map((i) => <span key={i} title={itemDef(i).name[lang]}>{itemDef(i).icon} </span>) : <span className="muted">{L('пока ничего', 'nothing yet')}</span>}</dd>
      </dl>
      <div className="row">
        <button className={`btn ${follow ? 'on' : ''}`} onClick={() => onFollow(!follow)}>
          📍 {follow ? L('Следим', 'Following') : L('Следить', 'Follow')}
        </button>
      </div>
    </div>
  );
}

// ─── Карточка здания ───────────────────────────────────────────────────

function BuildingCard({ state, id, onCat, onOffering, onDone }: { state: GameState; id: number; onCat(id: number): void; onOffering(): void; onDone(msg: string): void }) {
  const { lang } = useI18n();
  const L = useL();
  const game = useGame();
  const c = state.city;
  const b = buildingAt(c, id);
  if (!b) return null;
  const d = buildingById(b.type);
  const catList = (list: CityCat[]): ReactNode => (
    <div className="cat-chips">
      {list.map((k) => (
        <button key={k.id} className="chip" onClick={() => onCat(k.id)}>
          {moodFace(k.mood)} {catName(k)[lang]}
        </button>
      ))}
    </div>
  );
  const blocker = demolishBlocker(c, b);
  const refund = Math.floor(d.cost * DEMOLISH_REFUND);
  const isHouse = b.kind === 'house';
  const burning = !!b.fireUntil && b.fireUntil > Date.now();

  let body: ReactNode = null;
  if (b.kind === 'temple') {
    const o = c.offering;
    body = (
      <>
        <p>{d.desc[lang]}</p>
        <button className="btn primary" onClick={onOffering}>
          ⛩️ {o?.complete ? L('Подношение сделано ✨', 'Offering made ✨') : L('Сделать подношение', 'Make the offering')}
        </button>
      </>
    );
  } else if (isHouse) {
    const res = residents(c, b);
    const lvl = HOUSE_LEVELS[b.level - 1]!;
    const owner = res[0];
    body = (
      <>
        <p className="muted small">
          {L('Жильцов', 'Residents')}: {res.length}/{houseCapacity(b)} · {L('уют', 'comfort')} +{lvl.comfort}
        </p>
        {res.length ? catList(res) : <p>{c.arriveAt !== null ? L(`Ждёт жильца — приедет примерно через ${Math.max(1, Math.ceil((c.arriveAt - c.clock) / 60))} ч игрового времени.`, `Waiting for a resident — arriving in about ${Math.max(1, Math.ceil((c.arriveAt - c.clock) / 60))} game hours.`) : L('Ждёт жильца.', 'Waiting for a resident.')}</p>}
        {lvl.upgrade > 0 && owner && (
          <>
            <p className="muted small">
              {L('Следующий уровень', 'Next level')}: {HOUSE_LEVELS[b.level]!.name[lang]} — {L('хозяйка копит', 'the owner is saving')} ◈ {Math.floor(owner.money)}/{lvl.upgrade}
            </p>
            <Bar v={(owner.money / lvl.upgrade) * 100} />
          </>
        )}
      </>
    );
  } else if (b.kind === 'workshop') {
    const ws = workers(c, b);
    const lvl = WORKSHOP_LEVELS[b.level - 1]!;
    const p = professionById(d.profession!);
    const waiting = c.cats.filter((k) => k.work === null && k.profession === p.id).length;
    body = (
      <>
        <p className="muted small">{d.desc[lang]}</p>
        <p>
          {p.icon} {L('Работников', 'Workers')}: {ws.length}/{jobsOf(b)} · {L('выработка', 'output')} ×{lvl.output}
        </p>
        {ws.length > 0 ? catList(ws) : <p className="muted small">{L(`Пока никого: ${p.name.ru.toLowerCase()} приедет в новый пустой дом.`, `Nobody yet: a ${p.name.en.toLowerCase()} will move into a new empty house.`)}</p>}
        {waiting > 0 && <p className="bad small">{L(`Ещё ${waiting} без места — мест не хватает`, `${waiting} more without a place — not enough jobs`)}</p>}
        {lvl.upgrade > 0 && (
          <>
            <p className="muted small">
              {L('Копилка на', 'Fund for')} «{WORKSHOP_LEVELS[b.level]!.name[lang]}»: ◈ {Math.floor(b.fund)}/{lvl.upgrade} {L('— работники откладывают часть заработка', '— workers save part of their pay')}
            </p>
            <Bar v={(b.fund / lvl.upgrade) * 100} />
          </>
        )}
      </>
    );
  } else if (b.kind === 'amenity') {
    body = (
      <>
        <p>{d.desc[lang]}</p>
        <p className="muted small">
          😺 +{d.mood} {L('к настроению тех, кто живёт или работает в', 'mood for those who live or work within')} {d.radius} {L(plural(d.radius ?? 1, 'клетке', 'клетках', 'клетках'), 'tiles')}
        </p>
      </>
    );
  } else if (b.kind === 'fun') {
    const here = c.cats.filter((k) => k.act.at === b.id && !k.act.path?.length);
    body = (
      <>
        <p>{d.desc[lang]}</p>
        <p className="muted small">
          🎈 +{d.fun} 💬 +{d.social} · {d.ticket ? `${L('билет', 'ticket')} ◈ ${d.ticket}` : L('бесплатно', 'free')} · {L('мест', 'places')}: {d.capacity} · {L('посещений', 'visits')}: {b.visits}
        </p>
        {b.type === 'market' && <p className="small">{CAT_ITEMS.map((i) => `${i.icon} ${i.price}`).join('  ')}</p>}
        {here.length > 0 && (
          <>
            <p className="small">{L('Сейчас здесь', 'Here now')}:</p>
            {catList(here)}
          </>
        )}
      </>
    );
  } else if (b.kind === 'ash') {
    const names = (b.ashOf ?? []).map((n) => catName({ name: n })[lang]);
    body = (
      <>
        <p>{d.desc[lang]}</p>
        {names.length > 0 && (
          <p className="small">
            🕯️ {L('Здесь жили', 'Lived here')}: {names.join(', ')}
          </p>
        )}
        <button
          className="btn primary"
          disabled={state.gold < CLEAR_ASH || burning}
          onClick={() => {
            game.city.clearAsh(b.id);
            onDone(L('Место расчищено', 'The plot is cleared'));
          }}
        >
          🧹 {L('Расчистить', 'Clear')} · ◈ {CLEAR_ASH}
        </button>
      </>
    );
  }

  return (
    <div className="building-card">
      <h2>
        {burning ? '🔥' : d.icon} {b.kind === 'house' || b.kind === 'workshop' ? `${d.kind === 'house' ? '' : `${d.name[lang]} · `}${levelName(b)[lang]}` : d.name[lang]}
      </h2>
      {burning && <p className="bad">{L('Горит! Гнев богов…', 'On fire! The wrath of the gods…')}</p>}
      {body}
      {b.kind !== 'temple' && b.kind !== 'ash' && (
        <div className="row">
          <button
            className="btn danger"
            disabled={blocker !== null}
            title={blocker === 'occupied' ? L('Здесь живут или работают кошки', 'Cats live or work here') : undefined}
            onClick={() => {
              game.city.demolish(b.id);
              onDone(L(`Снесено, возврат ◈ ${refund}`, `Demolished, refund ◈ ${refund}`));
            }}
          >
            {blocker === 'occupied' ? L('Нельзя снести: заняты', 'Occupied — can’t demolish') : `${L('Снести', 'Demolish')} (+◈ ${refund})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Стройка ───────────────────────────────────────────────────────────

const CATS: ReadonlyArray<{ kind: BuildingKind; icon: string; name: [string, string] }> = [
  { kind: 'house', icon: '🏠', name: ['Жильё', 'Homes'] },
  { kind: 'workshop', icon: '🔨', name: ['Мастерские', 'Workshops'] },
  { kind: 'amenity', icon: '🌳', name: ['Благоустройство', 'Amenities'] },
  { kind: 'fun', icon: '🎠', name: ['Развлечения', 'Fun'] },
];

function BuildMenu({ state, gx, gz, onBuilt }: { state: GameState; gx: number; gz: number; onBuilt(type: BuildingId): void }) {
  const { lang } = useI18n();
  const L = useL();
  const game = useGame();
  const c = state.city;
  // Подсказка: по умолчанию — дом, если все дома заняты, иначе мастерская для ждущих работы.
  const unemployed = useMemo(() => c.cats.filter((k) => k.work === null), [c.cats]);
  const [tab, setTab] = useState<BuildingKind>(() => (unemployed.length ? 'workshop' : freeBeds(c) === 0 ? 'house' : 'amenity'));
  const list = BUILDINGS.filter((b) => b.kind === tab);
  return (
    <div className="build-menu">
      <h2>🏗️ {L('Что построить?', 'What to build?')}</h2>
      <div className="seg-tabs">
        {CATS.map((x) => (
          <button key={x.kind} className={tab === x.kind ? 'on' : ''} onClick={() => setTab(x.kind)}>
            {x.icon} {x.name[lang === 'ru' ? 0 : 1]}
          </button>
        ))}
      </div>
      <div className="build-list">
        {list.map((d) => {
          const bl = buildBlocker(state, d.id, gx, gz);
          const waiting = d.profession ? unemployed.filter((k) => k.profession === d.profession).length : 0;
          const has = c.buildings.filter((b) => b.type === d.id).length;
          return (
            <button key={d.id} className={`build-item ${bl ? 'blocked' : ''}`} disabled={bl !== null} onClick={() => (game.city.build(d.id, gx, gz), onBuilt(d.id))}>
              <span className="build-icon">{d.icon}</span>
              <span className="build-main">
                <b>{d.name[lang]}</b>
                <span className="muted small">{d.desc[lang]}</span>
                {waiting > 0 && <span className="good small">🐱 {L(`ждут работы: ${waiting}`, `waiting for jobs: ${waiting}`)}</span>}
                {has > 0 && <span className="muted small">{L(`уже есть: ${has}`, `already built: ${has}`)}</span>}
                {bl === 'town' && <span className="bad small">🔒 {L('ступень', 'tier')}: {TOWNS[d.town]!.name[lang]}</span>}
              </span>
              <span className={`build-cost ${bl === 'money' ? 'bad' : ''}`}>◈ {d.cost}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Подношение богам ──────────────────────────────────────────────────

function OfferingCard({ state, onTrain }: { state: GameState; onTrain(ex?: ExerciseId): void }) {
  const { t } = useI18n();
  const L = useL();
  const o = state.city.offering;
  if (!o) return null;
  return (
    <div className="offering-card">
      <h2>⛩️ {L('Подношение богам', 'Offering to the gods')}</h2>
      {o.complete ? (
        <p className="good">{L('Сделано! Боги благословили город: кошки радуются (+8 к настроению) до полуночи.', 'Done! The gods blessed the town: cats are happier (+8 mood) until midnight.')}</p>
      ) : (
        <p>
          {L('Сделайте упражнения до полуночи', 'Do the exercises before midnight')} (⏳ {countdown(toMidnight())}).{' '}
          <span className="bad">{L('Иначе боги сожгут часть домов вместе с жителями.', 'Otherwise the gods will burn some houses along with their residents.')}</span> {L(`Награда: ◈ ${OFFERING_REWARD}.`, `Reward: ◈ ${OFFERING_REWARD}.`)}
        </p>
      )}
      <div className="offering-tasks">
        {o.tasks.map((x) => {
          const done = x.done >= x.target;
          return (
            <div key={x.exercise} className={`offering-task ${done ? 'done' : ''}`}>
              <div className="grow">
                <div className="row-between">
                  <b>{t(`exercise.${x.exercise}` as I18nKey)}</b>
                  <span>
                    {Math.min(x.done, x.target)}/{x.target}
                  </span>
                </div>
                <Bar v={(x.done / x.target) * 100} color={done ? 'var(--good)' : 'var(--accent)'} />
              </div>
              {done ? <span className="good">✓</span> : <button className="btn primary" onClick={() => onTrain(x.exercise)}>{L('Начать', 'Start')}</button>}
            </div>
          );
        })}
      </div>
      <p className="muted small">{L('Каждый засчитанный повтор любого упражнения ещё и приносит ◈ на стройку.', 'Every counted rep of any exercise also earns ◈ for building.')}</p>
    </div>
  );
}

// ─── Жители ────────────────────────────────────────────────────────────

type ResFilter = 'all' | 'jobless' | 'sad' | 'rich';
type ResSort = 'mood' | 'name' | 'job' | 'money';

function ResidentsCard({ city, onCat, onNews }: { city: CityState; onCat(id: number): void; onNews(): void }) {
  const { lang } = useI18n();
  const L = useL();
  const [filter, setFilter] = useState<ResFilter>('all');
  const [sort, setSort] = useState<ResSort>('mood');
  const cats = city.cats;
  const jobless = cats.filter((k) => k.work === null).length;
  const sad = cats.filter((k) => k.mood < 40).length;
  const avg = cats.length ? Math.round(cats.reduce((a, k) => a + k.mood, 0) / cats.length) : 0;
  const list = cats
    .filter((k) => (filter === 'jobless' ? k.work === null : filter === 'sad' ? k.mood < 40 : filter === 'rich' ? k.money >= 100 : true))
    .sort((a, b) =>
      sort === 'mood'
        ? b.mood - a.mood
        : sort === 'money'
          ? b.money - a.money
          : sort === 'job'
            ? professionById(a.profession).name[lang].localeCompare(professionById(b.profession).name[lang]) || a.id - b.id
            : catName(a)[lang].localeCompare(catName(b)[lang]),
    );
  const FILTERS: ReadonlyArray<[ResFilter, string]> = [
    ['all', `${L('Все', 'All')} ${cats.length}`],
    ['jobless', `🔨 ${L('Без работы', 'Jobless')} ${jobless}`],
    ['sad', `😿 ${L('Грустят', 'Sad')} ${sad}`],
    ['rich', `◈ ${L('Копят 100+', 'Saving 100+')}`],
  ];
  const SORTS: ReadonlyArray<[ResSort, string]> = [
    ['mood', L('настроение', 'mood')],
    ['name', L('имя', 'name')],
    ['job', L('профессия', 'trade')],
    ['money', L('деньги', 'money')],
  ];
  return (
    <div className="residents-card">
      <h2>🐱 {L('Жители', 'Residents')}</h2>
      <p className="muted small">
        {L('Всего', 'Total')}: {cats.length} · {L('настроение в среднем', 'average mood')} {moodFace(avg)} {avg} · 🏠 {L('свободных мест', 'free beds')}: {freeBeds(city)}
      </p>
      <div className="seg-tabs">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="res-sort muted small">
        {L('Сортировка', 'Sort')}:
        {SORTS.map(([id, label]) => (
          <button key={id} className={`link ${sort === id ? 'on' : ''}`} onClick={() => setSort(id)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="res-list">
        {list.map((k) => {
          const p = professionById(k.profession);
          return (
            <li key={k.id}>
              <button className="res-row" onClick={() => onCat(k.id)}>
                <span className="res-face">{moodFace(k.mood)}</span>
                <span className="res-main">
                  <b>
                    {catName(k)[lang]} <span className="muted">{k.sex === 'f' ? '♀' : '♂'}</span>
                    {k.items.length > 0 && <span className="res-items"> {k.items.map((i) => itemDef(i).icon).join('')}</span>}
                  </b>
                  <span className="small">
                    {p.icon} {p.name[lang]}
                    {k.work === null && <span className="bad"> · {L('без работы', 'jobless')}</span>} · {ageText(catAgeDays(city, k), lang)}
                  </span>
                  <span className="muted small res-doing">{doingText(city, k)[lang]}</span>
                </span>
                <span className="res-side">
                  <span className="small">{Math.round(k.mood)}</span>
                  <span className="build-cost small">◈ {Math.floor(k.money)}</span>
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted">{cats.length ? L('Никого под этот фильтр.', 'Nobody matches this filter.') : L('Пока никого — купите пустой домик, и приедет кошка.', 'Nobody yet — buy an empty cottage and a cat will move in.')}</li>}
      </ul>
      {city.lost.length > 0 && (
        <p className="muted small">
          🕯️ {L('Погибли в пожарах', 'Lost in fires')}: {city.lost.length}.{' '}
          <button className="link" onClick={onNews}>
            {L('Память и новости', 'Memory and news')}
          </button>
        </p>
      )}
    </div>
  );
}

// ─── Новости ───────────────────────────────────────────────────────────

function NewsCard({ city, onRename }: { city: CityState; onRename(name: string): void }) {
  const { lang } = useI18n();
  const L = useL();
  const [name, setName] = useState(city.name);
  const lv = townLevel(city);
  const next = TOWNS[lv + 1];
  return (
    <div className="news-card">
      <h2>
        {TOWNS[lv]!.icon} {city.name}
      </h2>
      <p className="muted small">
        {TOWNS[lv]!.name[lang]} · 🐱 {city.cats.length}
        {next ? ` · ${L('до ступени', 'next tier')} «${next.name[lang]}»: ${next.pop} ${L('жителей', 'residents')}` : ''} · 🏠 {L('свободных мест', 'free beds')}: {freeBeds(city)}
      </p>
      <div className="rename">
        <input value={name} maxLength={24} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim() || name.trim() === city.name} onClick={() => onRename(name.trim())}>
          {L('Переименовать', 'Rename')}
        </button>
      </div>
      <h3>📜 {L('Что нового', 'What’s new')}</h3>
      <ul className="news-list">
        {[...city.news].reverse().map((n, i) => (
          <li key={i}>
            <span className="muted small">
              {L('день', 'day')} {dayOf(n.t) + 1}, {clockText(hourOf(n.t))}
            </span>
            <span>
              {n.icon} {n.text[lang]}
            </span>
          </li>
        ))}
        {city.news.length === 0 && <li className="muted">{L('Пока тихо.', 'All quiet so far.')}</li>}
      </ul>
      {city.lost.length > 0 && (
        <>
          <h3>🕯️ {L('Память', 'In memory')}</h3>
          <p className="muted small">{city.lost.map((x) => catName(x)[lang]).join(', ')}</p>
        </>
      )}
    </div>
  );
}
