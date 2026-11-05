import { effectiveAppearance } from '../../game/life';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { ACHIEVEMENTS, titleText, unlockedTitles } from '../../game/achievements';
import { STATS } from '../../game/config';
import { taskProgress } from '../../game/dailies';
import { useGame } from '../../game/GameContext';
import { levelInfo } from '../../game/levels';
import { QUESTS, effectiveObjective, objectiveTarget, questById } from '../../game/quests';
import type { GameState } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import type { ExerciseId } from '../../tracking/exercise';
import { AppearanceEditor } from './AppearanceEditor';
import { Hero3D } from './Hero3D';
import { HeroPortrait } from './Renders';
import { InventorySection } from './Shop';
import { exName, objectiveText, questName, taskText } from './text';

export type Tab = 'home' | 'train' | 'life' | 'quests' | 'shop' | 'hero';

function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

/** Шапка: аватар, уровень, золото, серия. */
export function HeroHeader({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const info = levelInfo(state.totalXp);
  const c = state.character;
  return (
    <header className="hero-header">
      <HeroPortrait color={c.color} appearance={effectiveAppearance(c.appearance, state)} equipped={state.equipped} size={56} />
      <div className="hero-header-main">
        <div className="hero-name">
          {c.name} <span className="lvl-chip">{info.level}</span>
          {state.title && <span className="hero-title">{titleText(state.title)?.[lang]}</span>}
        </div>
        <Bar value={info.progress} color={c.color} />
        <div className="muted small">
          {t('level')} {info.level} · {Math.floor(info.into)}/{info.span} XP
        </div>
      </div>
      <div className="hero-header-side">
        <span title={t('gold')}>◈ {state.gold}</span>
        <span title={t('streak')}>🔥 {state.streak.count}</span>
      </div>
    </header>
  );
}

export function BottomNav({ tab, onTab }: { tab: Tab; onTab(t: Tab): void }) {
  const { t } = useI18n();
  const items: Array<[Tab, string, I18nKey]> = [
    ['home', '⌂', 'tab.home'],
    ['train', '▶', 'tab.train'],
    ['life', '🏙', 'tab.life'],
    ['quests', '✦', 'tab.quests'],
    ['shop', '◈', 'tab.shop'],
    ['hero', '☺', 'tab.hero'],
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([id, icon, label]) => (
        <button key={id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>
          <span className="nav-icon" aria-hidden>
            {icon}
          </span>
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Reward({ xp, gold }: { xp: number; gold: number }) {
  return (
    <span className="reward">
      +{xp} XP · ◈ {gold}
    </span>
  );
}

function DailyList({ state }: { state: GameState }) {
  const { t, tf } = useI18n();
  const { rerollDaily } = useGame();
  const d = state.dailies;
  if (!d) return null;
  const stats = state.days[state.today];
  return (
    <Section title={t('daily')} aside={<span className="muted small">{d.bonusClaimed ? t('dailyBonusClaimed') : t('dailyBonusHint')}</span>}>
      <ul className="task-list">
        {d.tasks.map((task, i) => {
          const p = Math.min(task.target, taskProgress(task, stats));
          return (
            <li key={task.key} className={`task ${task.done ? 'done' : ''}`}>
              <div className="task-top">
                <span className="task-check" aria-hidden>
                  {task.done ? '✓' : '○'}
                </span>
                <span className="task-text">{taskText(t, tf, task)}</span>
              </div>
              <Bar value={p / task.target} />
              <div className="task-bottom">
                <span className="muted small">
                  {p}/{task.target}
                </span>
                <Reward {...task.reward} />
                {!task.done && !d.rerollUsed && (
                  <button className="link" onClick={() => rerollDaily(i)}>
                    ↻ {t('reroll')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {d.rerollUsed && <p className="muted small">{t('rerollUsed')}</p>}
    </Section>
  );
}

function QuestCard({ state, id }: { state: GameState; id: string }) {
  const { t, tf } = useI18n();
  const def = questById(id);
  const qs = state.quests[id];
  if (!def || !qs) return null;
  const isDone = qs.status === 'done';
  return (
    <li className={`quest ${def.kind} ${isDone ? 'done' : ''}`}>
      <div className="quest-head">
        <b>{questName(t, id)}</b>
        <Reward {...def.reward} />
      </div>
      {def.objectives.map((o, i) => {
        const target = objectiveTarget(effectiveObjective(o, state.character));
        const p = isDone ? target : Math.min(target, qs.progress[i] ?? 0);
        return (
          <div key={i} className="objective">
            <span>{objectiveText(t, tf, o, state.character)}</span>
            {!isDone && <Bar value={p / target} />}
            {!isDone && (
              <span className="muted small">
                {p}/{target}
              </span>
            )}
          </div>
        );
      })}
    </li>
  );
}

export function HomeTab({ state, onTrain }: { state: GameState; onTrain(): void }) {
  const { t } = useI18n();
  const active = Object.values(state.quests).filter((q) => q.status === 'active');
  return (
    <div className="tab-body">
      <section className="card streak-card">
        <div>
          <div className="big">🔥 {state.streak.count}</div>
          <div className="muted small">{t('streakDays')}</div>
        </div>
        <div className="muted small right">
          {t('freezes')}: {'❄'.repeat(state.streak.freezes) || '—'}
          <br />
          {t('bestStreak')}: {state.streak.best}
        </div>
      </section>
      <DailyList state={state} />
      <Section title={t('activeQuests')}>
        <ul className="quest-list">
          {active.slice(0, 2).map((q) => (
            <QuestCard key={q.id} state={state} id={q.id} />
          ))}
        </ul>
        {active.length === 0 && <p className="muted">{t('noActiveQuests')}</p>}
      </Section>
      <button className="btn primary wide big-cta" onClick={onTrain}>
        ▶ {t('train')}
      </button>
    </div>
  );
}

export function QuestsTab({ state }: { state: GameState }) {
  const { t } = useI18n();
  const order = QUESTS.map((q) => q.id);
  const active = order.filter((id) => state.quests[id]?.status === 'active');
  const done = order.filter((id) => state.quests[id]?.status === 'done').reverse();
  return (
    <div className="tab-body">
      <Section title={t('activeQuests')}>
        <ul className="quest-list">
          {active.map((id) => (
            <QuestCard key={id} state={state} id={id} />
          ))}
        </ul>
        {active.length === 0 && <p className="muted">{t('noActiveQuests')}</p>}
        <p className="muted small">{t('weeklyNote')}</p>
      </Section>
      {done.length > 0 && (
        <Section title={t('completedQuests')}>
          <ul className="quest-list">
            {done.map((id) => (
              <QuestCard key={id} state={state} id={id} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function HeroTab({ state, onAccuracy }: { state: GameState; onAccuracy(): void }) {
  const { t, lang, setLang } = useI18n();
  const { setHasBar, setAppearance, reset, setTitle } = useGame();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<{ appearance: GameState['character']['appearance']; color: string } | null>(null);
  const c = state.character;
  const info = levelInfo(state.totalXp);
  const reps = Object.entries(state.lifetimeReps) as Array<[ExerciseId, number]>;
  return (
    <div className="tab-body">
      <section className="card hero-card">
        <div className="hero-stage">
          <Hero3D color={c.color} appearance={effectiveAppearance(c.appearance, state)} equipped={state.equipped} height={340} zoomable />
          <span className="hero-stage-level">{info.level}</span>
          <span className="hero-stage-hint muted small">⟲ {t('rotateHint')}</span>
        </div>
        <div className="hero-card-info">
          <h2>{c.name}</h2>
          {state.title && <p className="hero-title big">«{titleText(state.title)?.[lang]}»</p>}
          <p className="muted">
            {t(`arch.${c.archetype}` as I18nKey)} · {t(`fit.${c.fitness}` as I18nKey)}
          </p>
          <p>
            {t('level')} {info.level} · ◈ {state.gold} {t('gold')}
          </p>
          <button className="link" onClick={() => setEditing({ appearance: c.appearance, color: c.color })}>
            ✎ {t('editAppearance')}
          </button>
        </div>
      </section>

      <InventorySection state={state} />
      <AchievementsSection state={state} onTitle={setTitle} />
      {editing && (
        <div className="overlay">
          <div className="sheet wide-sheet">
            <h2>{t('appearance')}</h2>
            <div className="ob-hero-art sticky">
              <Hero3D color={editing.color} appearance={editing.appearance} equipped={state.equipped} height={260} zoomable />
            </div>
            <AppearanceEditor appearance={editing.appearance} color={editing.color} onChange={(a, col) => setEditing({ appearance: a, color: col })} />
            <div className="row">
              <button className="btn" onClick={() => setEditing(null)}>
                {t('cancel')}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setAppearance(editing.appearance, editing.color);
                  setEditing(null);
                }}
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Section title={t('stats')}>
        <ul className="stat-list">
          {STATS.map((s) => {
            const li = levelInfo(state.statXp[s]);
            return (
              <li key={s}>
                <div className="stat-head">
                  <span>{t(`stat.${s}` as I18nKey)}</span>
                  <b>
                    {t('lvl')} {li.level}
                  </b>
                </div>
                <Bar value={li.progress} color={c.color} />
              </li>
            );
          })}
        </ul>
      </Section>

      {reps.length > 0 && (
        <Section title={t('lifetime')}>
          <ul className="lifetime">
            {reps.map(([ex, n]) => (
              <li key={ex}>
                <span>{exName(t, ex)}</span>
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('settings')}>
        <label className="check">
          <input type="checkbox" checked={c.hasBar} onChange={(e: ChangeEvent<HTMLInputElement>) => setHasBar(e.target.checked)} />
          {t('barToggle')}
        </label>
        <div className="row left">
          <button className="btn" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
            {t('language')}: {lang.toUpperCase()}
          </button>
          <button className="btn" onClick={onAccuracy}>
            {t('accuracyTitle')}
          </button>
        </div>
        <p className="muted small">{t('storageNote')}</p>
        {!confirm ? (
          <button className="btn danger" onClick={() => setConfirm(true)}>
            {t('resetProgress')}
          </button>
        ) : (
          <div className="notice">
            <p>{t('resetConfirm')}</p>
            <div className="row left">
              <button className="btn" onClick={() => setConfirm(false)}>
                {t('cancel')}
              </button>
              <button className="btn danger" onClick={reset}>
                {t('resetProgress')}
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/** Достижения и выбор титула. */
function AchievementsSection({ state, onTitle }: { state: GameState; onTitle(id: string | undefined): void }) {
  const { t, tf, lang } = useI18n();
  const [all, setAll] = useState(false);
  const titles = unlockedTitles(state);
  const done = ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length;
  // Сначала открытые, затем ближайшие к выполнению.
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const ua = state.achievements[a.id] ? 1 : 0;
    const ub = state.achievements[b.id] ? 1 : 0;
    if (ua !== ub) return ub - ua;
    const [ca, ga] = a.progress(state);
    const [cb, gb] = b.progress(state);
    return cb / gb - ca / ga;
  });
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <Section title={t('achievements')} aside={<span className="muted small">{tf('achievementsCount', { n: done, m: ACHIEVEMENTS.length })}</span>}>
      <ul className="ach-list">
        {shown.map((a) => {
          const unlocked = Boolean(state.achievements[a.id]);
          const [cur, goal] = a.progress(state);
          return (
            <li key={a.id} className={unlocked ? 'on' : ''}>
              <span className="ach-icon">{a.icon}</span>
              <div className="ach-main">
                <b>{a.name[lang]}</b>
                <span className="muted small">{a.desc[lang]}</span>
                {!unlocked && <Bar value={cur / goal} />}
              </div>
              <span className="ach-reward">
                {unlocked ? '✓' : `${Math.min(cur, goal)}/${goal}`}
                {a.title && <span className="tiny">🏷️</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <button className="link" onClick={() => setAll((v) => !v)}>
        {all ? '▲' : `▼ ${ACHIEVEMENTS.length - shown.length}`}
      </button>
      <p className="field-label">{t('titles')}</p>
      {titles.length === 0 ? (
        <p className="muted small">{t('titleHint')}</p>
      ) : (
        <div className="chips">
          <button className={`chip ${!state.title ? 'on' : ''}`} onClick={() => onTitle(undefined)}>
            {t('noTitle')}
          </button>
          {titles.map((id) => (
            <button key={id} className={`chip ${state.title === id ? 'on' : ''}`} onClick={() => onTitle(id)}>
              🏷️ {titleText(id)?.[lang] ?? id}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}
