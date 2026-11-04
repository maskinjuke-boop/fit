import { titleText } from '../../game/achievements';
import { useGame } from '../../game/GameContext';
import type { GameState } from '../../game/state';
import { ENERGY_XP, MAX_ENERGY, availableChoices, canAfford, checkChance, requirementMet, trialPlan } from '../../game/story';
import { COMPANIONS, FACTION_NAME, FLAG_NAME, REGIONS, REGION_STEPS, storyEvent } from '../../game/storyContent';
import { NPC_MAX, NPC_IDS, FACTIONS, type Choice, type EventDef, type NpcId, type Requirement, type Txt } from '../../game/storyTypes';
import { NPCS, NPC_TIER_NAME, npcTier } from '../../game/storyNpcs';
import type { ExerciseId } from '../../tracking/exercise';
import { useI18n, type I18nKey, type Lang } from '../../i18n';
import { HeroPortrait, ItemImage, MonsterImage } from './Renders';
import { MONSTERS, MONSTER_IDS, heroCombat } from '../../game/combat';
import type { BattleLine, MonsterId } from '../../game/storyTypes';
import { useEffect, useRef, useState } from 'react';
import { exName } from './text';

/** Текст события с подстановками ({npc} и т. п.). */
function fill(text: Txt, lang: Lang, ev: EventDef | undefined, vars: Record<string, number>): string {
  return text[lang].replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'monster' && ev?.monsters) {
      const m = ev.monsters[vars.monster ?? 0];
      return m ? MONSTERS[m].name[lang] : key;
    }
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
  if (req.npc) parts.push(`${NPCS[req.npc[0]].name[lang]} ♥ ${req.npc[1]}+`);
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
        {choice.fight && !locked ? <span className="badge trial">⚔️ {t('battleTitle')}</span> : null}
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
  for (const [id, d] of Object.entries(e.npc ?? {}) as Array<[NpcId, number]>) {
    const n = NPCS[id];
    chips.push({ text: `${n.icon} ${n.name[lang]} ${d ? `♥ ${d > 0 ? '+' : ''}${d}` : `· ${t('storyNpcMet')}`}`, cls: d > 0 ? 'good' : d < 0 ? 'bad' : '' });
  }
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

/** Сердечки отношения персонажа (0…10; ниже нуля — неприязнь). */
function Affinity({ value }: { value: number }) {
  return (
    <span className={`affinity ${value < 0 ? 'hostile' : ''}`} aria-label={`${value}/${NPC_MAX}`}>
      {value < 0
        ? Array.from({ length: -value }, (_, i) => <span key={i}>💔</span>)
        : Array.from({ length: NPC_MAX }, (_, i) => (
            <span key={i} className={i < value ? 'on' : ''}>
              ♥
            </span>
          ))}
    </span>
  );
}

/** Персонаж на карточке события: портрет, имя, отношение и реплика. */
function NpcCard({ id, affinity }: { id: NpcId; affinity: number | undefined }) {
  const { lang } = useI18n();
  const n = NPCS[id];
  const a = affinity ?? 0;
  return (
    <div className="npc-card">
      <HeroPortrait color={n.color} appearance={n.appearance} equipped={n.equipped} size={76} remember={false} />
      <div className="npc-info">
        <b>{n.name[lang]}</b>
        <span className="muted small">{n.role[lang]}</span>
        {affinity !== undefined && (
          <>
            <span className="small">
              {NPC_TIER_NAME[npcTier(a)]![lang]} <Affinity value={a} />
            </span>
            <span className="npc-line">{n.lines[npcTier(a)][lang]}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Знакомые персонажи: портреты, отношение и что о них известно. */
function Acquaintances({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const met = NPC_IDS.filter((id) => state.story.npcs[id] !== undefined);
  return (
    <details className="card acquaintances" open={met.length > 0 && met.length <= 3}>
      <summary>
        <h2>
          {t('storyNpcs')} <span className="muted small">{met.length}/{NPC_IDS.length}</span>
        </h2>
      </summary>
      {met.length === 0 ? (
        <p className="muted">{t('storyNpcsEmpty')}</p>
      ) : (
        <ul>
          {met.map((id) => {
            const n = NPCS[id];
            const a = state.story.npcs[id] ?? 0;
            return (
              <li key={id}>
                <HeroPortrait color={n.color} appearance={n.appearance} equipped={n.equipped} size={56} remember={false} />
                <div className="npc-info">
                  <b>
                    {n.icon} {n.name[lang]}
                  </b>
                  <span className="muted small">{n.role[lang]}</span>
                  <span className="small">
                    {NPC_TIER_NAME[npcTier(a)]![lang]} <Affinity value={a} />
                  </span>
                  <span className="muted small">{n.bio[lang]}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </details>
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

function Bar({ n, max, cls }: { n: number; max: number; cls: string }) {
  return (
    <div className={`hp-bar ${cls}`}>
      <div style={{ width: `${Math.max(0, Math.min(100, (n / max) * 100))}%` }} />
      <span>
        {n}/{max}
      </span>
    </div>
  );
}

function lineText(l: BattleLine, m: string, tf: (k: I18nKey, v: Record<string, string | number>) => string): string {
  return tf(`bl.${l.who}.${l.kind}` as I18nKey, { m, n: l.n ?? 0 });
}

/** Экран боя: монстр и герой, полоски здоровья, журнал и действия. */
function BattleView({ state, onTrain }: { state: GameState; onTrain(exercise: ExerciseId): void }) {
  const { t, tf, lang } = useI18n();
  const { story } = useGame();
  const b = state.story.battle!;
  const m = MONSTERS[b.monster];
  const h = heroCombat(state);
  const name = m.name[lang];
  // Встряска: монстр — когда по нему попали, герой — когда попали по герою.
  const [shake, setShake] = useState<'monster' | 'hero' | null>(null);
  const prev = useRef({ hp: b.hp, hero: b.heroHp });
  useEffect(() => {
    const p = prev.current;
    if (b.hp < p.hp) setShake('monster');
    else if (b.heroHp < p.hero) setShake('hero');
    prev.current = { hp: b.hp, hero: b.heroHp };
    const id = setTimeout(() => setShake(null), 450);
    return () => clearTimeout(id);
  }, [b.hp, b.heroHp]);
  const last = b.log[b.log.length - 1];
  return (
    <section className={`card story-event battle ${m.boss ? 'boss' : ''}`}>
      {m.boss && <span className="boss-badge">{t('storyBoss')}</span>}
      <h2>
        ⚔️ {name}
      </h2>
      <p className="muted small">
        {m.lore[lang]}
        {m.special ? ` · ${t(`sp.${m.special}` as I18nKey)}` : ''}
      </p>
      <div className="arena">
        <div className={`fighter monster ${shake === 'monster' ? 'hit' : ''} ${b.result === 'won' ? 'dead' : ''}`}>
          <MonsterImage id={b.monster} size={170} />
          <Bar n={b.hp} max={b.maxHp} cls="enemy" />
          {last && last.who === 'hero' && last.n && (last.kind === 'hit' || last.kind === 'crit' || last.kind === 'power') ? (
            <span key={b.round + last.kind} className={`dmg ${last.kind}`}>
              −{last.n}
            </span>
          ) : null}
        </div>
        <div className="vs">VS</div>
        <div className={`fighter hero ${shake === 'hero' ? 'hit' : ''} ${b.result === 'lost' ? 'dead' : ''}`}>
          <HeroPortrait color={state.character.color} appearance={state.character.appearance} equipped={state.equipped} size={120} />
          <Bar n={b.heroHp} max={b.heroMax} cls="ally" />
          <span className="muted tiny">
            ⚔ {h.atk} · 🛡 {h.def} · ✦ {Math.round(h.crit * 100)}% · ↯ {Math.round(h.dodge * 100)}%
          </span>
        </div>
      </div>
      {b.charging && !b.result && <p className="notice">{tf('battleCharging', { m: name })}</p>}
      {b.poison > 0 && !b.result && <p className="muted small">🟢 {tf('battlePoisoned', { n: b.poison })}</p>}
      <ul className="battle-log">
        {[...b.log].reverse().slice(0, 5).map((l, i) => (
          <li key={`${b.round}-${i}`} className={`${l.who} ${l.kind}`}>
            {lineText(l, name, tf)}
          </li>
        ))}
      </ul>
      {b.result ? (
        <>
          <h2 className={b.result === 'won' ? 'good' : 'bad'}>{b.result === 'won' ? `🏆 ${t('battleWon')}` : b.result === 'lost' ? `🪦 ${t('battleLost')}` : `🏃 ${t('battleFled')}`}</h2>
          <button className="btn primary wide" onClick={() => story.finishBattle()}>
            {t('battleContinue')} →
          </button>
        </>
      ) : b.power ? (
        <div className="power">
          <p>
            💥 {tf('battlePowerProgress', { p: b.power.progress, n: b.power.target, ex: exName(t, b.power.exercise) })}
          </p>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.round((b.power.progress / b.power.target) * 100)}%` }} />
          </div>
          <div className="row">
            <button className="btn" onClick={() => story.battle('attack')}>
              ⚔️ {t('battleAttack')}
            </button>
            <button className="btn primary" onClick={() => onTrain(b.power!.exercise)}>
              ▶ {t('battlePowerGo')}
            </button>
          </div>
        </div>
      ) : (
        <div className="battle-actions">
          <button className="btn primary" onClick={() => story.battle('attack')}>
            ⚔️ {t('battleAttack')}
          </button>
          <button className="btn power-btn" onClick={() => story.battle('power')} title={t('battlePowerHint')}>
            💥 {t('battlePower')}
          </button>
          <button className="btn" onClick={() => story.battle('block')}>
            🛡️ {t('battleBlock')}
          </button>
          <button className="btn" disabled={b.potions <= 0} onClick={() => story.battle('potion')}>
            🧪 {t('battlePotion')} ×{b.potions}
          </button>
          <button className="btn" disabled={Boolean(m.boss)} title={m.boss ? t('battleNoFleeBoss') : undefined} onClick={() => story.battle('flee')}>
            🏃 {t('battleFlee')}
          </button>
        </div>
      )}
    </section>
  );
}

/** Побеждённые монстры. */
function Bestiary({ state }: { state: GameState }) {
  const { t, lang } = useI18n();
  const met = MONSTER_IDS.filter((id) => state.story.bestiary[id]);
  return (
    <details className="card bestiary">
      <summary>
        <h2>
          {t('storyBestiary')} <span className="muted small">{met.length}/{MONSTER_IDS.length}</span>
        </h2>
      </summary>
      {met.length === 0 ? (
        <p className="muted">{t('storyBestiaryEmpty')}</p>
      ) : (
        <ul>
          {met.map((id: MonsterId) => (
            <li key={id}>
              <MonsterImage id={id} size={64} />
              <div>
                <b>{MONSTERS[id].name[lang]}</b> <span className="muted small">× {state.story.bestiary[id]}</span>
                <div className="muted small">{MONSTERS[id].lore[lang]}</div>
              </div>
            </li>
          ))}
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
              <button className="btn" onClick={() => story.hunt()} title={t('storyHuntHint')}>
                🏹 {t('storyHunt')} · −1 ⚡
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
          {ev.npc && <NpcCard id={ev.npc} affinity={st.npcs[ev.npc]} />}
          <p>{fill(ev.text, lang, ev, st.event.vars)}</p>
          <div className="choices">
            {[...availableChoices(state, ev), ...ev.choices.filter((c) => !requirementMet(state, c.requires))].map((c) => (
              <ChoiceButton key={c.id} state={state} choice={c} onPick={() => story.choose(c.id)} />
            ))}
          </div>
        </section>
      )}

      {st.status === 'battle' && st.battle && <BattleView state={state} onTrain={onTrain} />}

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
          {st.last.monster ? <MonsterImage id={st.last.monster} size={110} className={st.last.ok ? 'dead' : ''} /> : <div className="story-icon">{storyEvent(st.last.event)?.icon}</div>}
          <h2>{st.last.ok ? `✓ ${t('storySuccess')}` : `✗ ${t('storyFail')}`}</h2>
          {(() => {
            const npc = storyEvent(st.last.event)?.npc;
            return npc && st.npcs[npc] !== undefined ? <NpcCard id={npc} affinity={st.npcs[npc]} /> : null;
          })()}
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

      <Acquaintances state={state} />
      <Bestiary state={state} />
      <Journal state={state} />
    </div>
  );
}
