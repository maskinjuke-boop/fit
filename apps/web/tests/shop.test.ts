import { describe, expect, it } from 'vitest';
import { completeDailies, simulateReps, unlockAllItems } from '../src/game/admin';
import { applyRep, buyItem, canBuy, completeActiveQuests, equipItem, equipmentBonus, grant, newCharacterState, setLevel, unequipSlot } from '../src/game/engine';
import { ITEMS, MAX_EQUIPMENT_BONUS, RENAMED_ITEMS, SLOTS, itemById, renamedItem } from '../src/game/items';
import { levelOf } from '../src/game/levels';
import { createState, DEFAULT_APPEARANCE, migrate, withFigure, type GameState } from '../src/game/state';

const now = new Date(2026, 10, 2, 10);
const hero = (): GameState =>
  newCharacterState({ name: 'Тест', archetype: 'mystic', color: '#4da3ff', hasBar: true, fitness: 'beginner', appearance: DEFAULT_APPEARANCE }, now, createState);
// Сумма сверх стартовых денег.
const rich = (gold: number, level = 1): GameState => setLevel(grant({ ...hero(), gold: 0 }, { gold }).state, level).state;

describe('Магазин', () => {
  it('стартовый предмет пути уже надет', () => {
    const [id] = hero().inventory;
    const item = itemById(id ?? '');
    expect(hero().inventory.length).toBe(1);
    expect(item).toBeTruthy();
    expect(hero().equipped[item!.slot]).toBe(id);
  });

  it('покупка списывает золото и сразу надевает', () => {
    const r = buyItem(rich(200), 'basic_tee');
    expect(r.error).toBe(null);
    expect(r.state.gold).toBe(100);
    expect(r.state.inventory).toContain('basic_tee');
    expect(r.state.equipped.body).toBe('basic_tee');
  });

  it('нельзя купить без золота, без уровня и повторно', () => {
    expect(canBuy({ ...hero(), gold: 0 }, 'sports_cap')).toBe('gold');
    expect(canBuy(rich(5000), 'devil_horns')).toBe('level');
    const once = buyItem(rich(500), 'basic_tee').state;
    expect(canBuy(once, 'basic_tee')).toBe('owned');
  });

  it('новая покупка надевается, старая остаётся в инвентаре', () => {
    let s = rich(1000, 3);
    s = buyItem(s, 'coffee_cup').state;
    s = buyItem(s, 'tennis_racket').state;
    expect(s.equipped.weapon).toBe('tennis_racket');
    expect(s.inventory).toContain('coffee_cup');
    s = equipItem(s, 'coffee_cup');
    expect(s.equipped.weapon).toBe('coffee_cup');
    s = unequipSlot(s, 'weapon');
    expect(s.equipped.weapon).toBe(undefined);
  });

  it('нельзя надеть то, чего нет в инвентаре', () => {
    const s = hero();
    expect(equipItem(s, 'gold_trophy')).toBe(s);
  });

  it('экипировка увеличивает опыт, но не больше 25%', () => {
    // Опыт за сам повтор (без наград за достижения, которые тоже могут прийти).
    const repXp = (r: { events: Array<{ kind: string; amount?: number }> }): number => r.events.find((e) => e.kind === 'xp')?.amount ?? 0;
    const base = repXp(applyRep(hero(), { exercise: 'pushup', quality: 100 }, now));
    const s = buyItem(rich(500), 'basic_tee').state;
    // Стартовый предмет уже даёт свой бонус — футболка прибавляет к нему ещё 1%.
    const b0 = equipmentBonus(hero());
    expect(repXp(applyRep(s, { exercise: 'pushup', quality: 100 }, now))).toBeCloseTo((base / (1 + b0)) * (1 + b0 + 0.01), 6);

    let all = unlockAllItems(hero());
    for (const id of ['silver_tiara', 'diamond_bikini', 'gold_trophy', 'designer_bag']) all = equipItem(all, id);
    expect(equipmentBonus(all)).toBe(MAX_EQUIPMENT_BONUS);
  });

  it('у всех предметов корректные слоты и цены', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    expect(ids.size).toBe(ITEMS.length);
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    for (const i of ITEMS) {
      expect(SLOTS).toContain(i.slot);
      expect(i.price).toBeGreaterThanOrEqual(60);
      expect(i.price).toBeLessThanOrEqual(3500);
      expect(i.level).toBeGreaterThanOrEqual(1);
      expect(i.level).toBeLessThanOrEqual(12);
      expect(i.xpBonus).toBeLessThanOrEqual(0.1);
    }
    // Каждый слот заполнен, редкие вещи дороже и требуют уровня выше.
    for (const slot of SLOTS) expect(ITEMS.filter((i) => i.slot === slot).length).toBeGreaterThanOrEqual(8);
    for (const a of ITEMS) for (const b of ITEMS) if (order.indexOf(a.rarity) < order.indexOf(b.rarity) && a.slot === b.slot) expect(a.price).toBeLessThan(b.price);
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
  it('старые id предметов переходят на существующие современные', () => {
    for (const [from, to] of Object.entries(RENAMED_ITEMS)) {
      expect(itemById(from)).toBe(undefined);
      expect(itemById(to)).toBeTruthy();
      expect(renamedItem(from)).toBe(to);
    }
    expect(renamedItem('gambeson')).toBe('hoodie');
    expect(renamedItem('healing_flask')).toBe('water_bottle');
    expect(renamedItem('phone')).toBe('phone');
    expect(renamedItem('longsword')).toBe('longsword');
  });

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
    expect(m.character.appearance).toEqual({ figure: 'male', skin: 3, hair: 'curly', hairColor: 2, beard: true, eyes: 0 });
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
