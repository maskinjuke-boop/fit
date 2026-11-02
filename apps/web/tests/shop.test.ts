import { describe, expect, it } from 'vitest';
import { completeDailies, simulateReps, unlockAllItems } from '../src/game/admin';
import { applyRep, buyItem, canBuy, completeActiveQuests, equipItem, equipmentBonus, grant, newCharacterState, setLevel, unequipSlot } from '../src/game/engine';
import { ITEMS, MAX_EQUIPMENT_BONUS } from '../src/game/items';
import { levelOf } from '../src/game/levels';
import { createState, DEFAULT_APPEARANCE, migrate, withFigure, type GameState } from '../src/game/state';

const now = new Date(2026, 10, 2, 10);
const hero = (): GameState =>
  newCharacterState({ name: 'Тест', archetype: 'mystic', color: '#4da3ff', hasBar: true, fitness: 'beginner', appearance: DEFAULT_APPEARANCE }, now, createState);
const rich = (gold: number, level = 1): GameState => setLevel(grant(hero(), { gold }).state, level).state;

describe('Магазин', () => {
  it('стартовый предмет пути уже надет', () => {
    expect(hero().equipped.head).toBe('headband');
    expect(hero().inventory).toEqual(['headband']);
  });

  it('покупка списывает золото и сразу надевает', () => {
    const r = buyItem(rich(200), 'leather_vest');
    expect(r.error).toBe(null);
    expect(r.state.gold).toBe(50);
    expect(r.state.inventory).toContain('leather_vest');
    expect(r.state.equipped.body).toBe('leather_vest');
  });

  it('нельзя купить без золота, без уровня и повторно', () => {
    expect(canBuy(hero(), 'leather_cap')).toBe('gold');
    expect(canBuy(rich(5000), 'iron_helm')).toBe('level');
    const once = buyItem(rich(500), 'leather_vest').state;
    expect(canBuy(once, 'leather_vest')).toBe('owned');
  });

  it('новая покупка надевается, старая остаётся в инвентаре', () => {
    let s = rich(1000, 3);
    s = buyItem(s, 'wooden_club').state;
    s = buyItem(s, 'bronze_sword').state;
    expect(s.equipped.weapon).toBe('bronze_sword');
    expect(s.inventory).toContain('wooden_club');
    s = equipItem(s, 'wooden_club');
    expect(s.equipped.weapon).toBe('wooden_club');
    s = unequipSlot(s, 'weapon');
    expect(s.equipped.weapon).toBe(undefined);
  });

  it('нельзя надеть то, чего нет в инвентаре', () => {
    const s = hero();
    expect(equipItem(s, 'steel_sword')).toBe(s);
  });

  it('экипировка увеличивает опыт, но не больше 25%', () => {
    const base = applyRep(hero(), { exercise: 'pushup', quality: 100 }, now).state.totalXp;
    let s = buyItem(rich(500), 'leather_vest').state;
    const before = s.totalXp;
    s = applyRep(s, { exercise: 'pushup', quality: 100 }, now).state;
    expect(s.totalXp - before).toBeCloseTo(base * 1.02, 6);

    let all = unlockAllItems(hero());
    for (const id of ['champion_crown', 'champion_armor', 'steel_sword', 'iron_shield']) all = equipItem(all, id);
    expect(equipmentBonus(all)).toBe(MAX_EQUIPMENT_BONUS);
  });

  it('у всех предметов корректные слоты и цены', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    expect(ids.size).toBe(ITEMS.length);
    for (const i of ITEMS) {
      expect(i.price).toBeGreaterThan(0);
      expect(i.xpBonus).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('Режим администратора', () => {
  it('уровень ставится в обе стороны', () => {
    const up = setLevel(hero(), 10).state;
    expect(levelOf(up.totalXp)).toBe(10);
    expect(levelOf(setLevel(up, 2).state.totalXp)).toBe(2);
  });

  it('имитация повторов проходит через квесты', () => {
    const r = simulateReps(hero(), 'squat', 5, 90, now);
    expect(r.state.quests.first_steps?.status).toBe('done');
    expect(r.state.adminTouched).toBe(true);
  });

  it('выполнить все ежедневки', () => {
    const r = completeDailies(hero(), now);
    expect(r.state.dailies?.tasks.every((t) => t.done)).toBe(true);
    expect(r.events.some((e) => e.kind === 'dailyBonus')).toBe(true);
  });

  it('закрыть активные квесты открывает следующие', () => {
    const r = completeActiveQuests(hero());
    expect(r.state.quests.first_steps?.status).toBe('done');
    expect(r.state.quests.warmup?.status).toBe('active');
  });
});

describe('Миграция сохранений', () => {
  it('старое сохранение получает внешность, инвентарь и экипировку', () => {
    const old = hero() as Partial<GameState> & GameState;
    const legacy = JSON.parse(JSON.stringify(old)) as Record<string, unknown> & { character: Record<string, unknown> };
    delete legacy.inventory;
    delete legacy.equipped;
    delete legacy.character.appearance;
    const m = migrate(legacy as unknown as GameState);
    expect(m.inventory).toEqual([]);
    expect(m.equipped).toEqual({});
    expect(m.character.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('сохранение без фигуры получает мужскую, остальная внешность не меняется', () => {
    const legacy = JSON.parse(JSON.stringify(hero())) as GameState;
    const app = { skin: 3, hair: 'curly', hairColor: 2, beard: true } as unknown as GameState['character']['appearance'];
    legacy.character.appearance = app;
    const m = migrate(legacy);
    expect(m.character.appearance).toEqual({ figure: 'male', skin: 3, hair: 'curly', hairColor: 2, beard: true });
  });

  it('смена фигуры убирает бороду и подбирает причёску', () => {
    const f = withFigure({ ...DEFAULT_APPEARANCE, beard: true }, 'female');
    expect(f.figure).toBe('female');
    expect(f.beard).toBe(false);
    expect(f.hair).toBe('long');
    expect(withFigure({ ...f, hair: 'ponytail' }, 'male').hair).toBe('short');
    expect(withFigure({ ...f, hair: 'curly' }, 'male').hair).toBe('curly');
  });
});
