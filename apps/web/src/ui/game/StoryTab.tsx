import { titleText } from '../../game/achievements';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import { ENERGY_XP, MAX_ENERGY, availableChoices, canAfford, checkChance, requirementMet, trialPlan } from '../../game/story';
import { COMPANIONS, FACTION_NAME, FLAG_NAME, REGIONS, REGION_STEPS, storyEvent } from '../../game/storyContent';
import { FACTIONS, type Choice, type EventDef, type Requirement, type Txt } from '../../game/storyTypes';
import type { ExerciseId } from '../../tracking/exercise';
import { useI18n, type I18nKey, type Lang } from '../../i18n';
import { ItemImage } from './Renders';
import { exName } from './text';

/** Текст события с подстановками ({npc} и т. п.). */
function fill(text: Txt, lang: Lang, ev: EventDef | undefined, vars: Record<string, number>): string {
  return text[lang].replace(/\{(\w+)\}/g, (_, key: string) => {
    const list = ev?.vars?.[key];
    const v = list?.[vars[key] ?? 0];
    return v ? v[lang] : key;
  });
}

function Pips({ n, max, icon, cls }: { n: number; max: number; icon: string; cls: string }) {
  return (
    <span className={`pips ${cls}`} aria-label={`${n}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          {icon}
        </span>
      ))}
    </span>
  );
}

function requirementText(req: Requirement, lang: Lang, t: (k: I18nKey) => string): string {
  const parts: string[] = [];
  if (req.flag) parts.push(FLAG_NAME[req.flag]?.[lang] ?? req.flag);
  if (req.companion) parts.push(COMPANIONS[req.companion].name[lang]);
  if (req.anyCompanion) parts.push(t('storyCompanions').toLowerCase());
  if (req.minCompanions) parts.push(`${req.minCompanions} × ${t('storyCompanions').toLowerCase()}`);
  if (req.rep) parts.push(`${FACTION_NAME[req.rep[0]][lang]} ${req.rep[1]}+`);
  if (req.item) parts.push(req.item);
  return parts.join(', ');
}

function ChoiceButton({ state, choice, onPick }: { state: GameState; choice: Choice; onPick(): void }) {
  const { t, tf, lang } = useI18n();
  const locked = !requirementMet(state, choice.requires);
  const poor = !canAfford(state, choice);
  const plan = choice.trial ? trialPlan(state, choice.trial) : null;
  return (
    <button className={`choice ${locked ? 'locked' : ''}`} disabled={locked || poor} onClick={onPick}>
      <span className="choice-label">
        {locked && '🔒 '}
        {choice.label[lang]}
      </span>
      <span className="choice-badges">
        {choice.cost ? <span className={`badge ${poor ? 'bad' : ''}`}>{tf('storyCost', { n: choice.cost })}</span> : null}
        {choice.check && !locked ? <span className="badge">{tf('storyChance', { n: Math.round(checkChance(state, choice.check) * 100) })} · {t(`stat.${choice.check.stat}` as I18nKey)}</span> : null}
        {plan && !locked ? <span className="badge trial">{tf('storyTrialBadge', { n: plan.target, ex: exName(t, plan.exercise) })}</span> : null}
        {choice.gamble && !locked ? <span className="badge">🎲</span> : null}
        {locked && choice.requires ? <span className="badge muted">{tf('storyNeeds', { what: requirementText(choice.requires, lang, t) })}</span> : null}
      </span>
    </button>
  );
}

function EffectChips({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const last = state.story.last;
  if (!last) return null;
  const e = last.effect;
  const chips: Array<{ text: string; cls: string }> = [];
  if (e.resolve) chips.push({ text: `♥ ${e.resolve > 0 ? '+' : ''}${e.resolve}`, cls: e.resolve > 0 ? 'good' : 'bad' });
  if (e.gold) chips.push({ text: `◈ ${e.gold > 0 ? '+' : ''}${e.gold}`, cls: e.gold > 0 ? 'good' : 'bad' });
  if (e.xp) chips.push({ text: `+${e.xp} XP`, cls: 'good' });
  if (e.energy) chips.push({ text: `⚡ ${e.energy > 0 ? '+' : ''}${e.energy}`, cls: e.energy > 0 ? 'good' : 'bad' });
  if (e.skip) chips.push({ text: `⤳ ${t('storySkip')}`, cls: 'good' });
  for (const [f, d] of Object.entries(e.rep ?? {})) if (d) chips.push({ text: `${FACTION_NAME[f as keyof typeof FACTION_NAME][lang]} ${d > 0 ? '+' : ''}${d}`, cls: d > 0 ? 'good' : 'bad' });
  if (e.companion) chips.push({ text: `${COMPANIONS[e.companion].icon} ${tf('storyNewCompanion', { name: COMPANIONS[e.companion].name[lang] })}`, cls: 'good' });
  if (e.title) chips.push({ text: `🏷️ ${tf('storyNewTitle', { name: titleText(e.title)?.[lang] ?? e.title })}`, cls: 'good' });
  if (e.clear) chips.push({ text: `🏁 ${t('storyRegionClear')}`, cls: 'good' });
  for (const f of e.flag ?? []) if (FLAG_NAME[f] && (f === 'blessed' || f === 'cursed' || f === 'outlaw')) chips.push({ text: FLAG_NAME[f][lang], cls: f === 'blessed' ? 'good' : 'bad' });
  return (
    <>
      <div className="effect-chips">
        {chips.map((c, i) => (
          <span key={i} className={`effect ${c.cls}`}>
            {c.text}
          </span>
        ))}
      </div>
      {last.loot && (
        <div className="loot">
          <ItemImage itemId={last.loot} color={state.character.color} figure={state.character.appearance.figure} size={64} />
          <span>{tf('storyLoot', { item: t(`item.${last.loot}` as I18nKey) })}</span>
        </div>
      )}
    </>
  );
}

function StoryHeader({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const st = state.story;
  const region = REGIONS[Math.min(st.region, REGIONS.length - 1)]!;
  const flags = st.flags.filter((f) => f === 'blessed' || f === 'cursed' || f === 'outlaw');
  return (
    <section className="card story-head">
      <div className="story-region">
        <span className="story-region-icon">{region.icon}</span>
        <div>
          <b>{region.name[lang]}</b>
          <div className="muted small">{st.step >= REGION_STEPS ? t('storyBoss') : tf('storyStep', { n: st.step + 1, m: REGION_STEPS })}</div>
        </div>
      </div>
      <div className="story-track" aria-hidden>
        {REGIONS.map((r, i) => (
          <div key={r.id} className={`track-region ${i < st.region || st.ending === 'victory' ? 'done' : i === st.region ? 'cur' : ''}`}>
            <span>{r.icon}</span>
            {i === st.region && !st.ending && (
              <div className="track-steps">
                {Array.from({ length: REGION_STEPS + 1 }, (_, k) => (
                  <i key={k} className={k < st.step ? 'on' : k === st.step ? 'now' : ''} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="story-stats">
        <div>
          <span className="muted small">{t('storyResolve')}</span>
          <Pips n={st.resolve} max={st.maxResolve} icon="♥" cls="hearts" />
        </div>
        <div>
          <span className="muted small">{t('storyEnergy')}</span>
          <Pips n={st.energy} max={MAX_ENERGY} icon="⚡" cls="bolts" />
          {st.energy < MAX_ENERGY && <span className="muted tiny">{tf('storyEnergyNext', { n: Math.ceil(ENERGY_XP - st.energyXp) })}</span>}
        </div>
      </div>
      <div className="story-party">
        {st.companions.length === 0 ? (
          <span className="muted small">{t('storyNoCompanions')}</span>
        ) : (
          st.companions.map((c) => (
            <span key={c} className="chip companion" title={COMPANIONS[c].perk[lang]}>
              {COMPANIONS[c].icon} {COMPANIONS[c].name[lang]}
            </span>
          ))
        )}
        {flags.map((f) => (
          <span key={f} className={`chip flag ${f}`}>
            {f === 'blessed' ? '✨' : f === 'cursed' ? '🌑' : '🏴'} {FLAG_NAME[f]?.[lang]}
          </span>
        ))}
      </div>
      <div className="story-rep">
        {FACTIONS.map((f) => (
          <span key={f} className={`rep ${st.rep[f] > 0 ? 'good' : st.rep[f] < 0 ? 'bad' : ''}`}>
            {FACTION_NAME[f][lang]}: {st.rep[f] > 0 ? '+' : ''}
            {st.rep[f]}
          </span>
        ))}
      </div>
    </section>
  );
}

function Journal({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const log = [...state.story.log].reverse().slice(0, 12);
  return (
    <details className="card journal">
      <summary>
        <h2>{t('storyJournal')}</h2>
      </summary>
      {log.length === 0 ? (
        <p className="muted">{t('storyEmptyJournal')}</p>
      ) : (
        <ul>
          {log.map((e, i) => {
            const ev = storyEvent(e.event);
            const ch = ev?.choices.find((c) => c.id === e.choice);
            return (
              <li key={i}>
                <span>{REGIONS[e.region]?.icon}</span>
                <span>
                  <b>{ev?.title[lang]}</b> — {ch?.label[lang]}
                </span>
                <span className={e.ok ? 'good' : 'bad'}>{e.ok ? '✓' : '✗'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}

/** Вкладка «История»: путешествие со случайными событиями и выбором. */
export function StoryTab({ state, onTrain }: { state: GameState; onTrain(exercise: ExerciseId): void }) {
  const { t, tf, lang } = useI18n();
  const { story } = useGame();
  const st = state.story;

  if (!st.started) {
    return (
      <div className="tab-body">
        <section className="card story-intro">
          <div className="story-banner">{REGIONS.map((r) => r.icon).join(' ')}</div>
          <h2>{t('storyTitle')}</h2>
          <p>{t('storyIntro')}</p>
          <button className="btn primary wide" onClick={() => story.start()}>
            🗺️ {t('storyStart')}
          </button>
        </section>
      </div>
    );
  }

  const ev = st.event ? storyEvent(st.event.id) : undefined;
  const region = REGIONS[Math.min(st.region, REGIONS.length - 1)]!;

  return (
    <div className="tab-body">
      <StoryHeader state={state} />

      {st.status === 'idle' && (
        <section className="card story-event idle">
          <div className="story-icon">{region.icon}</div>
          <p>{st.step === 0 ? region.intro[lang] : t('storyIdle')}</p>
          {st.energy > 0 ? (
            <div className="row">
              <button className="btn primary" onClick={() => story.travel()}>
                👣 {t('storyTravel')} · −1 ⚡
              </button>
              {st.resolve < st.maxResolve && (
                <button className="btn" onClick={() => story.camp()}>
                  🔥 {t('storyCamp')} · {t('storyCampHint')}
                </button>
              )}
            </div>
          ) : (
            <p className="notice">{tf('storyNoEnergy', { n: ENERGY_XP })}</p>
          )}
        </section>
      )}

      {st.status === 'event' && ev && st.event && (
        <section className={`card story-event ${ev.boss ? 'boss' : ''}`}>
          <div className="story-icon">{ev.icon}</div>
          {ev.boss && <span className="boss-badge">{t('storyBoss')}</span>}
          <h2>{ev.title[lang]}</h2>
          <p>{fill(ev.text, lang, ev, st.event.vars)}</p>
          <div className="choices">
            {[...availableChoices(state, ev), ...ev.choices.filter((c) => !requirementMet(state, c.requires))].map((c) => (
              <ChoiceButton key={c.id} state={state} choice={c} onPick={() => story.choose(c.id)} />
            ))}
          </div>
        </section>
      )}

      {st.status === 'trial' && st.trial && (
        <section className="card story-event trial">
          <div className="story-icon">{storyEvent(st.trial.event)?.icon ?? '💪'}</div>
          <h2>{t('storyTrialTitle')}</h2>
          <p>{tf('storyTrialText', { n: st.trial.target, ex: exName(t, st.trial.exercise) })}</p>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.round((st.trial.progress / st.trial.target) * 100)}%` }} />
          </div>
          <p className="muted small">
            {st.trial.progress}/{st.trial.target}
          </p>
          <div className="row">
            <button className="btn" onClick={() => story.abandon()}>
              {t('storyTrialGiveUp')}
            </button>
            <button className="btn primary" onClick={() => onTrain(st.trial!.exercise)}>
              ▶ {t('storyTrialGo')}
            </button>
          </div>
        </section>
      )}

      {st.status === 'outcome' && st.last && (
        <section className={`card story-event outcome ${st.last.ok ? 'ok' : 'fail'}`}>
          <div className="story-icon">{storyEvent(st.last.event)?.icon}</div>
          <h2>{st.last.ok ? `✓ ${t('storySuccess')}` : `✗ ${t('storyFail')}`}</h2>
          <p>
            {(() => {
              const e = storyEvent(st.last.event);
              const c = e?.choices.find((x) => x.id === st.last?.choice);
              const out = st.last.ok ? c?.success : (c?.fail ?? c?.success);
              return out ? fill(out.text, lang, e, st.last.vars) : '';
            })()}
          </p>
          <EffectChips state={state} />
          <button className="btn primary wide" onClick={() => story.proceed()}>
            {t('storyContinue')} →
          </button>
        </section>
      )}

      {st.status === 'ended' && (
        <section className={`card story-event ended ${st.ending ?? ''}`}>
          <div className="story-icon">{st.ending === 'victory' ? '🏆' : '🪦'}</div>
          <h2>{t('storyResult')}</h2>
          <p>{st.ending === 'victory' ? t('storyVictory') : t('storyDefeat')}</p>
          <p className="muted">{tf('storyRegions', { n: st.ending === 'victory' ? REGIONS.length : st.region })}</p>
          {st.titles.length > 0 && (
            <div className="effect-chips">
              {st.titles.map((id) => (
                <span key={id} className="effect good">
                  🏷️ {titleText(id)?.[lang] ?? id}
                </span>
              ))}
            </div>
          )}
          <button className="btn primary wide" onClick={() => story.start()}>
            🗺️ {t('storyNewRun')}
          </button>
        </section>
      )}

      <Journal state={state} />
    </div>
  );
}
