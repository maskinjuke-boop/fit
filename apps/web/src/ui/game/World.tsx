import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

/** Нужные поля события указателя (общие для React и DOM). */
interface PointerLike {
  clientX: number;
  clientY: number;
}
import { MONSTERS } from '../../game/combat';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import { MAX_ENERGY } from '../../game/story';
import { REGIONS } from '../../game/storyContent';
import {
  CAMPS,
  LAIRS,
  MARKERS_PER_REGION,
  REACH,
  REGION_COUNT,
  REGION_LEN,
  WORLD_END,
  WORLD_HALF_WIDTH,
  WORLD_START,
  barrierZ,
  clampToWorld,
  currentTarget,
  dist,
  markerPos,
  regionAt,
  regionStart,
  roadX,
  type P2,
} from '../../game/world';
import { useI18n } from '../../i18n';

const World3D = lazy(() => import('./three/World3D'));

const POS_KEY = 'fitness-rpg.world.v1';

function savedPos(run: number): P2 | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { x?: number; z?: number; run?: number };
    if (typeof p.x !== 'number' || typeof p.z !== 'number' || p.run !== run) return null;
    return { x: p.x, z: p.z };
  } catch {
    return null;
  }
}

function savePos(p: P2, run: number): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, run }));
  } catch {
    // Позиция просто не запомнится.
  }
}

const BIOME_FILL = ['#3f6b35', '#77746b', '#46553f', '#d2b27a', '#3d3644'];

/** Карта мира: регионы, дорога, вехи, логова, стоянки и герой. */
export function WorldMap({ state, pos, onPick, mini = false }: { state: GameState; pos: P2; onPick?(p: P2): void; mini?: boolean }) {
  const { lang } = useI18n();
  const st = state.story;
  const target = currentTarget(st);
  const road = useMemo(() => {
    const pts: string[] = [];
    for (let z = WORLD_START; z >= WORLD_END; z -= 3) pts.push(`${roadX(z).toFixed(1)},${z.toFixed(1)}`);
    return pts.join(' ');
  }, []);
  const W = WORLD_HALF_WIDTH + 6;
  const view = mini ? `${pos.x - 34} ${pos.z - 40} 68 68` : `${-W} ${WORLD_END - 6} ${W * 2} ${WORLD_START - WORLD_END + 10}`;
  const open = (r: number): boolean => st.ending === 'victory' || r <= st.region;
  const pick = (e: PointerLike & { currentTarget: SVGSVGElement }): void => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    onPick({ x: p.x, z: p.y });
  };
  return (
    <svg className={mini ? 'world-map mini' : 'world-map'} viewBox={view} preserveAspectRatio="xMidYMid meet" onPointerUp={pick} role="img" aria-label="map">
      {REGIONS.map((r, i) => (
        <g key={r.id}>
          <rect x={-W} y={-REGION_LEN * (i + 1)} width={W * 2} height={REGION_LEN} fill={BIOME_FILL[i]} opacity={open(i) ? 1 : 0.35} />
          {!mini && (
            <text x={-W + 3} y={-REGION_LEN * i - 4} className="map-label">
              {r.icon} {r.name[lang]}
            </text>
          )}
        </g>
      ))}
      <rect x={-W} y={0} width={W * 2} height={WORLD_START + 4} fill={BIOME_FILL[0]} />
      <polyline points={road} fill="none" stroke="#a8875c" strokeWidth={mini ? 2.4 : 3} strokeLinejoin="round" />
      {Array.from({ length: REGION_COUNT }, (_, r) =>
        Array.from({ length: MARKERS_PER_REGION + 1 }, (_, k) => {
          const p = markerPos(r, k);
          const done = st.ending === 'victory' || r < st.region || (r === st.region && k < st.step);
          const cur = target && target.region === r && (target.kind === 'boss' ? k === MARKERS_PER_REGION : k === target.step);
          if (k === MARKERS_PER_REGION) {
            return (
              <text key={`${r}-${k}`} x={p.x} y={p.z + 2} className={`map-icon ${cur ? 'cur' : ''}`} fontSize={mini ? 5 : 7}>
                {done ? '🏁' : MONSTERS[(['bear', 'stone_giant', 'witch', 'sand_serpent', 'dark_champion'] as const)[r]!].icon}
              </text>
            );
          }
          return <circle key={`${r}-${k}`} cx={p.x} cy={p.z} r={cur ? 2.2 : 1.4} className={`map-marker ${done ? 'done' : ''} ${cur ? 'cur' : ''}`} />;
        }),
      )}
      {LAIRS.filter((l) => open(l.region)).map((l) => (
        <text key={l.id} x={l.pos.x} y={l.pos.z + 2} className="map-icon" fontSize={mini ? 4.5 : 6}>
          {MONSTERS[l.monster].icon}
        </text>
      ))}
      {CAMPS.map((c, i) => (
        <text key={i} x={c.x} y={c.z + 2} className="map-icon" fontSize={mini ? 4 : 5}>
          🔥
        </text>
      ))}
      {st.ending !== 'victory' && st.region < REGION_COUNT && <line x1={-W} x2={W} y1={barrierZ(st.region)} y2={barrierZ(st.region)} className="map-barrier" />}
      <circle cx={pos.x} cy={pos.z} r={mini ? 2.6 : 3.4} className="map-hero" />
    </svg>
  );
}

/** Джойстик: тянуть палец от центра; длина — скорость. */
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

/** Вкладка «Мир»: ходьба по миру, вехи истории, логова монстров, стоянки и карта. */
export function WorldTab({ state, onOpenStory }: { state: GameState; onOpenStory(): void }) {
  const { t, tf, lang } = useI18n();
  const { story } = useGame();
  const st = state.story;
  const start = useMemo(() => {
    const s = savedPos(st.run);
    return clampToWorld(s ?? regionStart(Math.min(st.region, REGION_COUNT - 1)), st);
    // Стартовая точка нужна только при входе во вкладку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pos, setPos] = useState<P2>(start);
  const [bigMap, setBigMap] = useState(false);
  const [failed, setFailed] = useState(false);
  const stick = useRef({ x: 0, y: 0 });
  const goto = useRef<P2 | null>(null);
  const jump = useRef<P2 | null>(null);
  const lastSave = useRef(0);
  const mapScroll = useRef<HTMLDivElement | null>(null);
  // Большая карта открывается с героем в центре (после раскладки).
  useEffect(() => {
    if (!bigMap) return;
    const id = requestAnimationFrame(() => {
      const el = mapScroll.current;
      if (!el) return;
      // Доля высоты карты от северного края до героя.
      const k = (pos.z - (WORLD_END - 6)) / (WORLD_START - WORLD_END + 10);
      el.scrollTop = Math.max(0, k * el.scrollHeight - el.clientHeight / 2);
    });
    return () => cancelAnimationFrame(id);
    // Только при открытии карты.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bigMap]);

  // Новое путешествие — герой у начала дороги.
  const runRef = useRef(st.run);
  useEffect(() => {
    if (runRef.current !== st.run) {
      runRef.current = st.run;
      jump.current = regionStart(0);
    }
  }, [st.run]);

  const onMove = (p: P2): void => {
    setPos((q) => (Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05 ? q : p));
    const now = Date.now();
    if (now - lastSave.current > 1000) {
      lastSave.current = now;
      savePos(p, st.run);
    }
  };

  const target = currentTarget(st);
  const region = regionAt(pos.z);
  const nearTarget = target && dist(pos, target.pos) < REACH + 1.5;
  const lair = LAIRS.find((l) => l.region <= st.region && dist(pos, l.pos) < REACH + 1);
  const camp = CAMPS.find((c) => dist(pos, c) < REACH + 2);
  const atBarrier = st.ending !== 'victory' && st.region < REGION_COUNT && pos.z < barrierZ(st.region) + 4;
  const idle = st.status === 'idle';
  const go = (fn: () => void): void => {
    fn();
    onOpenStory();
  };

  // Касание карты: переход в открытую часть мира (быстрое перемещение).
  const pickOnMap = (p: P2): void => {
    const r = regionAt(p.z);
    if (!(st.ending === 'victory' || r <= st.region) || p.z > WORLD_START) return;
    jump.current = p;
    setBigMap(false);
  };

  return (
    <div className="world-tab">
      <div className="world-view">
        {failed ? (
          <div className="world-fallback">
            <WorldMap state={state} pos={pos} />
          </div>
        ) : (
          <Suspense fallback={<div className="hero3d-busy"><div className="spinner" /></div>}>
            <World3D
              color={state.character.color}
              appearance={state.character.appearance}
              equipped={state.equipped}
              view={{ region: st.region, step: st.step, ending: st.ending, started: st.started }}
              start={start}
              stick={stick}
              goto={goto}
              jump={jump}
              onMove={onMove}
              onFail={() => setFailed(true)}
            />
          </Suspense>
        )}
        <div className="world-hud">
          <span className="world-region">
            {REGIONS[region]?.icon} {REGIONS[region]?.name[lang]}
          </span>
          <span className="world-energy">
            ⚡ {st.energy}/{MAX_ENERGY} · ♥ {st.resolve}/{st.maxResolve}
          </span>
        </div>
        <button className="world-minimap" onClick={() => setBigMap(true)} aria-label={t('worldMap')}>
          <WorldMap state={state} pos={pos} mini />
          <span>🗺 {t('worldMap')}</span>
        </button>
        <Joystick stick={stick} />
        <div className="world-actions">
          {!st.started ? (
            <button className="btn primary" onClick={() => go(() => story.start())}>
              🗺️ {t('storyStart')}
            </button>
          ) : !idle ? (
            <button className="btn primary" onClick={onOpenStory}>
              📜 {t('worldEventOpen')}
            </button>
          ) : (
            <>
              {nearTarget && target && (
                <button className="btn primary" disabled={st.energy <= 0} onClick={() => go(() => story.travel())}>
                  {target.kind === 'boss' ? `⚔️ ${t('worldBoss')}` : `🧭 ${t('worldExplore')}`} · −1 ⚡
                </button>
              )}
              {lair && (
                <button className="btn" disabled={st.energy <= 0} onClick={() => go(() => story.hunt(lair.monster))}>
                  {MONSTERS[lair.monster].icon} {tf('worldLair', { m: MONSTERS[lair.monster].name[lang] })} · −1 ⚡
                </button>
              )}
              {camp && st.resolve < st.maxResolve && (
                <button className="btn" disabled={st.energy <= 0} onClick={() => story.camp()}>
                  🔥 {t('storyCamp')} · −1 ⚡
                </button>
              )}
              {(nearTarget || lair) && st.energy <= 0 && <span className="world-note">{t('worldNoEnergy')}</span>}
              {!nearTarget && !lair && target && (
                <button className="btn ghost" onClick={() => {
                    goto.current = { x: target.pos.x, z: target.pos.z + 1.5 };
                  }}>
                  🧭 {t('worldGoal')}
                </button>
              )}
            </>
          )}
          {atBarrier && <span className="world-note">{t('worldLocked')}</span>}
        </div>
      </div>
      <p className="muted small world-help">{t('worldControls')}</p>
      {bigMap && (
        <div className="overlay" onClick={() => setBigMap(false)}>
          <div className="sheet world-map-sheet" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
            <div className="row between">
              <h2>🗺 {t('worldMap')}</h2>
              <button className="btn ghost" onClick={() => setBigMap(false)}>
                ✕
              </button>
            </div>
            <p className="muted small">{t('worldMapHint')}</p>
            <div className="world-map-scroll" ref={mapScroll}>
              <WorldMap state={state} pos={pos} onPick={pickOnMap} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
