import { describe, expect, it } from 'vitest';
import { MONSTERS, MONSTER_IDS, battleTurn, heroCombat, newBattle, powerStrike, regionBoss, regionMonsters } from '../src/game/combat';
import { applyRep, newCharacterState } from '../src/game/engine';
import { ITEMS, RENAMED_ITEMS, itemById, itemCombat } from '../src/game/items';
import { xpForLevel } from '../src/game/levels';
import { rng } from '../src/game/random';
import { createState, DEFAULT_APPEARANCE, migrate, type GameState } from '../src/game/state';
import { battleAct, choose, finishBattle, hunt, startJourney } from '../src/game/story';
import { STORY_EVENTS, storyEvent } from '../src/game/storyContent';

const now = new Date(2026, 10, 2, 10, 0, 0);

function hero(): GameState {
  return newCharacterState({ name: 'Тест', archetype: 'guardian', color: '#3ddc84', hasBar: true, fitness: 'intermediate', appearance: DEFAULT_APPEARANCE }, now, createState);
}

const started = (): GameState => startJourney(hero()).state;

/** Типичный герой региона: уровни характеристик и экипировка нужной редкости. */
function veteran(region: number): GameState {
  const s = started();
  const lvl = 3 + region * 3;
  for (const k of Object.keys(s.statXp) as Array<keyof GameState['statXp']>) s.statXp[k] = xpForLevel(lvl);
  const tiers = [['common'], ['common', 'uncommon'], ['uncommon', 'rare'], ['rare'], ['rare', 'epic']][region]!;
  s.equipped = {};
  for (const it of ITEMS) if (tiers.includes(it.rarity) && !s.equipped[it.slot]) s.equipped[it.slot] = it.id;
  s.story.region = region;
  return s;
}

describe('боевые свойства предметов', () => {
  it('оружие бьёт, щиты и броня защищают, украшения дают здоровье', () => {
    expect(itemCombat('longsword').atk).toBeGreaterThan(0);
    expect(itemCombat('iron_shield').def).toBeGreaterThan(0);
    expect(itemCombat('chainmail').def).toBeGreaterThan(itemCombat('iron_helm').def);
    expect(itemCombat('pearl_necklace').hp).toBeGreaterThan(0);
    expect(itemCombat('nope')).toEqual({ atk: 0, def: 0, hp: 0 });
  });

  it('редкое оружие сильнее обычного', () => {
    const atk = (r: string) => Math.max(...ITEMS.filter((i) => i.slot === 'weapon' && i.rarity === r).map((i) => itemCombat(i.id).atk));
    expect(atk('legendary')).toBeGreaterThan(atk('common'));
  });
});

describe('переименование вещей', () => {
  it('все новые id существуют, старые сохранения переходят на них', () => {
    for (const id of Object.values(RENAMED_ITEMS)) expect(itemById(id) !== undefined).toBe(true);
    const s = hero();
    const old = { ...s, inventory: ['katana', 'jump_rope', 'longsword'], equipped: { weapon: 'katana', head: 'sports_cap' } } as GameState;
    const m = migrate(old);
    expect(m.inventory).toEqual(['longsword', 'flail']);
    expect(m.equipped).toEqual({ weapon: 'longsword', head: 'feathered_cap' });
  });
});

describe('монстры', () => {
  it('в каждом регионе есть обычные монстры и хранитель', () => {
    for (let r = 0; r < 5; r += 1) {
      expect(regionMonsters(r).length).toBeGreaterThan(1);
      expect(MONSTERS[regionBoss(r)].boss).toBe(true);
    }
  });

  it('у каждого хранителя есть бой с ним, у засад — монстры для {monster}', () => {
    for (const ev of STORY_EVENTS.filter((e) => e.boss)) expect(ev.choices.some((c) => c.fight && c.fight !== true && MONSTERS[c.fight].boss)).toBe(true);
    for (const ev of STORY_EVENTS) {
      if (ev.text.ru.includes('{monster}')) expect((ev.monsters ?? []).length).toBeGreaterThan(0);
      if (ev.choices.some((c) => c.fight === true)) expect((ev.monsters ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('бой', () => {
  it('охота стоит шаг пути, не двигает по тропе и даёт награду за победу', () => {
    const s0 = veteran(0);
    const s1 = hunt(s0).state;
    expect(s1.story.status).toBe('battle');
    expect(s1.story.energy).toBe(s0.story.energy - 1);
    let s = s1;
    for (let i = 0; i < 60 && !s.story.battle?.result; i += 1) s = battleAct(s, s.story.battle!.heroHp < s.story.battle!.heroMax * 0.35 && s.story.battle!.potions > 0 ? 'potion' : 'attack').state;
    const result = s.story.battle!.result;
    expect(result !== null).toBe(true);
    const monster = s.story.battle!.monster;
    const end = finishBattle(s).state;
    expect(end.story.status).toBe('outcome');
    expect(end.story.step).toBe(s0.story.step);
    expect(end.story.last?.monster).toBe(monster);
    if (result === 'won') {
      expect(end.story.bestiary[monster]).toBe(1);
      expect(end.gold).toBeGreaterThan(s0.gold);
    }
  });

  it('от хранителя не сбежать', () => {
    const s = veteran(0);
    const b = newBattle(s, 'bear', null);
    expect(battleTurn(b, heroCombat(s), 'flee', rng('x'), 0)).toBe('boss');
  });

  it('мощный удар — после повторов в тренировке: урон сквозь броню и оглушение', () => {
    let s = veteran(1);
    s.story.status = 'battle';
    s.story.battle = newBattle(s, 'stone_giant', null);
    s = battleAct(s, 'power').state;
    const p = s.story.battle!.power!;
    expect(p.target).toBeGreaterThan(0);
    const hp0 = s.story.battle!.hp;
    for (let i = 0; i < p.target; i += 1) s = applyRep(s, { exercise: p.exercise, quality: 90 }, now).state;
    const b = s.story.battle!;
    expect(b.power).toBe(null);
    expect(b.hp).toBeLessThan(hp0);
    expect(b.log.some((l) => l.kind === 'power')).toBe(true);
    expect(b.log.some((l) => l.kind === 'stun')).toBe(true);
  });

  it('бой из засады: победа — успех события', () => {
    let s = veteran(0);
    s.story.event = { id: 'ambush_0', vars: { monster: 1 } };
    s.story.status = 'event';
    s = choose(s, 'fight').state;
    expect(s.story.battle?.monster).toBe(storyEvent('ambush_0')!.monsters![1]);
    s.story.battle!.hp = 1;
    for (let i = 0; i < 20 && !s.story.battle?.result; i += 1) s = battleAct(s, 'attack').state;
    if (s.story.battle!.result !== 'won') return;
    const step = s.story.step;
    s = finishBattle(s).state;
    expect(s.story.last?.ok).toBe(true);
    expect(s.story.step).toBe(step + 1);
  });

  it('баланс: типичный герой региона чаще побеждает обычных монстров, а хранителя — с мощными ударами', () => {
    for (let region = 0; region < 5; region += 1) {
      const s = veteran(region);
      const h = heroCombat(s);
      const fight = (id: (typeof MONSTER_IDS)[number], usePower: boolean, seed: number): boolean => {
        const b = newBattle(s, id, null);
        const r = rng(`bal:${id}:${seed}`);
        for (let i = 0; i < 80 && !b.result; i += 1) {
          if (b.heroHp < b.heroMax * 0.35 && b.potions > 0) battleTurn(b, h, 'potion', r, region);
          else if (b.charging) battleTurn(b, h, 'block', r, region);
          else if (usePower && i % 2 === 0) {
            battleTurn(b, h, 'power', r, region);
            powerStrike(b, h, r);
          } else battleTurn(b, h, 'attack', r, region);
        }
        return b.result === 'won';
      };
      for (const id of regionMonsters(region)) {
        const wins = Array.from({ length: 40 }, (_, k) => fight(id, false, k)).filter(Boolean).length;
        expect(wins).toBeGreaterThan(20);
      }
      const boss = regionBoss(region);
      const plain = Array.from({ length: 40 }, (_, k) => fight(boss, false, k)).filter(Boolean).length;
      const power = Array.from({ length: 40 }, (_, k) => fight(boss, true, k)).filter(Boolean).length;
      expect(power).toBeGreaterThan(20);
      expect(power).toBeGreaterThanOrEqual(plain);
    }
  });
});
