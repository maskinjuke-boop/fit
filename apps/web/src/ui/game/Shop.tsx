import { actionsAt, catBlocker, catName, comfort, effectiveAppearance, furnitureBlocker } from '../../game/life';
import { CAT_BREEDS, FURNITURE, MAX_CATS, OBJECTS, catBreedById, mountOf, slotsFor, type HomeKind } from '../../game/lifeContent';
import type { ObjectId } from '../../game/lifeTypes';
import { useState, type MouseEvent } from 'react';
import { canBuy, equipmentBonus } from '../../game/engine';
import { useGame } from '../../game/GameContext';
import { BAG_CAPACITY, ITEMS, RARITY_COLOR, SLOTS, itemById, type ItemDef, type Slot } from '../../game/items';
import { levelOf } from '../../game/levels';
import type { GameState } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import { Hero3D } from './Hero3D';
import { CatImage, HomeImage, ItemImage } from './Renders';

const itemName = (t: (k: I18nKey) => string, id: string): string => t(`item.${id}` as I18nKey);

function BonusLabel({ item }: { item: ItemDef }) {
  const { t, tf } = useI18n();
  return <span className="muted small">{item.xpBonus > 0 ? tf('xpBonus', { n: Math.round(item.xpBonus * 100) }) : t('cosmetic')}</span>;
}

/** Карточка предмета: изображение, характеристики, примерка в 3D и действие (купить / надеть / снять). */
function ItemSheet({ state, item, onClose }: { state: GameState; item: ItemDef; onClose(): void }) {
  const { t, tf } = useI18n();
  const { buy, equip, unequip } = useGame();
  const [tryOn, setTryOn] = useState(false);
  const owned = state.inventory.includes(item.id);
  const isEquipped = state.equipped[item.slot] === item.id;
  const error = canBuy(state, item.id);
  const preview = { ...state.equipped, [item.slot]: item.id };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet item-sheet" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div className="item-sheet-art" style={{ borderColor: RARITY_COLOR[item.rarity] + '66' }}>
          {tryOn ? (
            <Hero3D color={state.character.color} appearance={effectiveAppearance(state.character.appearance, state)} equipped={preview} height={280} />
          ) : (
            <ItemImage itemId={item.id} color={state.character.color} figure={state.character.appearance.figure} size={180} />
          )}
        </div>
        <div className="seg">
          <button className={!tryOn ? 'on' : ''} onClick={() => setTryOn(false)}>
            {t('itemView')}
          </button>
          <button className={tryOn ? 'on' : ''} onClick={() => setTryOn(true)}>
            {t('tryOn3d')}
          </button>
        </div>
        <h2>{itemName(t, item.id)}</h2>
        <p className="muted small">
          {t(`slot.${item.slot}` as I18nKey)} · <span style={{ color: RARITY_COLOR[item.rarity] }}>{t(`rarity.${item.rarity}` as I18nKey)}</span> · <BonusLabel item={item} />
        </p>
        {!owned && error === 'level' && <p className="notice">{tf('needLevel', { n: item.level })}</p>}
        {!owned && error === 'gold' && <p className="notice">{t('notEnoughGold')}</p>}
        <div className="row">
          <button className="btn" onClick={onClose}>
            {t('close')}
          </button>
          {!owned && (
            <button
              className="btn primary"
              disabled={error !== null}
              onClick={() => {
                if (buy(item.id) === null) onClose();
              }}
            >
              {t('buy')} · ◈ {item.price}
            </button>
          )}
          {owned && !isEquipped && (
            <button className="btn primary" onClick={() => equip(item.id)}>
              {t('equip')}
            </button>
          )}
          {owned && isEquipped && (
            <button className="btn" onClick={() => unequip(item.slot)}>
              {t('unequip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({ state, item, onOpen }: { state: GameState; item: ItemDef; onOpen(): void }) {
  const { t, tf } = useI18n();
  const owned = state.inventory.includes(item.id);
  const isEquipped = state.equipped[item.slot] === item.id;
  const locked = !owned && levelOf(state.totalXp) < item.level;
  return (
    <li>
      <button className={`item-card ${locked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}`} style={{ borderColor: isEquipped ? undefined : RARITY_COLOR[item.rarity] + '55' }} onClick={onOpen}>
        <span className="item-art" style={{ background: `radial-gradient(circle at 50% 40%, ${RARITY_COLOR[item.rarity]}26, transparent 70%)` }}>
          <ItemImage itemId={item.id} color={state.character.color} figure={state.character.appearance.figure} size={92} />
        </span>
        <b>{itemName(t, item.id)}</b>
        <BonusLabel item={item} />
        <span className={`item-price ${owned ? 'owned' : ''}`}>
          {isEquipped ? `✓ ${t('equipped')}` : owned ? t('owned') : locked ? `🔒 ${tf('needLevel', { n: item.level })}` : `◈ ${item.price}`}
        </span>
      </button>
    </li>
  );
}

type ShopSection = 'clothes' | 'home' | 'cats';
type HomeFilter = HomeKind | 'all';

const NEED_ICON: Record<string, string> = { food: '🍔', energy: '⚡', hygiene: '🚿', fun: '🎉', social: '💬' };

/** Что даёт предмет для дома: действия, уют, пассивные эффекты. */
function homePerks(id: ObjectId, lang: 'ru' | 'en', tf: (k: I18nKey, v: Record<string, string | number>) => string): string[] {
  const o = OBJECTS[id];
  const out: string[] = actionsAt(id).map((a) => `${a.icon} ${a.label[lang]}`);
  if (o.comfort) out.push(tf('home.comfort', { n: o.comfort }));
  for (const [need, k] of Object.entries(o.slows ?? {})) out.push(tf('home.slows', { need: NEED_ICON[need] ?? need, n: Math.round((k ?? 0) * 100) }));
  return out;
}

function HomeSheet({ state, id, onClose }: { state: GameState; id: ObjectId; onClose(): void }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const o = OBJECTS[id];
  const owned = state.life.furniture.includes(id);
  const b = furnitureBlocker(state, id);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet item-sheet" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div className="item-sheet-art home-art">
          <HomeImage id={id} icon={o.icon} size={200} />
        </div>
        <h2>
          {o.icon} {o.name[lang]}
        </h2>
        <p className="muted small">
          {t(`home.kind.${o.kind ?? 'furniture'}` as I18nKey)} · {o.desc?.[lang]}
        </p>
        <ul className="perks">
          {homePerks(id, lang, tf).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {!owned && b === 'space' && <p className="notice">{t('home.noSpace')}</p>}
        {!owned && b === 'money' && <p className="notice">{t('notEnoughGold')}</p>}
        <div className="row">
          <button className="btn" onClick={onClose}>
            {t('close')}
          </button>
          {owned ? (
            <button
              className="btn"
              onClick={() => {
                life.sellFurniture(id);
                onClose();
              }}
            >
              {tf('life.sell', { n: Math.round((o.price ?? 0) * 0.4) })}
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={b !== null}
              onClick={() => {
                life.buyFurniture(id);
                onClose();
              }}
            >
              {t('buy')} · ◈ {o.price}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeShop({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [open, setOpen] = useState<ObjectId | null>(null);
  const items = FURNITURE.filter((id) => filter === 'all' || OBJECTS[id].kind === filter);
  const used = (m: 'slot' | 'wall' | 'floor'): number => state.life.furniture.filter((x) => mountOf(x) === m).length;
  return (
    <>
      <p className="muted small">
        {tf('home.places', { a: used('slot'), am: slotsFor('slot'), b: used('wall'), bm: slotsFor('wall'), c: used('floor'), cm: slotsFor('floor') })} · {tf('home.comfortNow', { n: comfort(state.life) })}
      </p>
      <div className="chips">
        {(['all', 'furniture', 'tech', 'decor'] as const).map((k) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {t(k === 'all' ? 'slot.all' : (`home.kind.${k}` as I18nKey))}
          </button>
        ))}
      </div>
      <ul className="item-grid">
        {items.map((id) => {
          const o = OBJECTS[id];
          const owned = state.life.furniture.includes(id);
          const b = furnitureBlocker(state, id);
          return (
            <li key={id}>
              <button className={`item-card ${owned ? 'equipped' : ''} ${!owned && b === 'space' ? 'locked' : ''}`} onClick={() => setOpen(id)}>
                <span className="item-art home-art">
                  <HomeImage id={id} icon={o.icon} size={92} />
                </span>
                <b>{o.name[lang]}</b>
                <span className="muted small">{homePerks(id, lang, tf)[0] ?? ''}</span>
                <span className={`item-price ${owned ? 'owned' : ''}`}>{owned ? `✓ ${t('home.owned')}` : b === 'space' ? t('home.full') : `◈ ${o.price}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <HomeSheet state={state} id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CatShop({ state }: { state: GameState }) {
  const { t, tf, lang } = useI18n();
  const { life } = useGame();
  const cats = state.life.cats;
  return (
    <>
      <p className="muted small">{tf('cats.hint', { n: cats.length, m: MAX_CATS })}</p>
      {cats.length > 0 && (
        <ul className="life-list cats-own">
          {cats.map((c) => (
            <li key={c.id}>
              <span className="cat-thumb">
                <CatImage breed={c.breed} size={56} />
              </span>
              <div>
                <b>{catName(c)[lang]}</b>
                <div className="muted small">{catBreedById(c.breed).name[lang]}</div>
              </div>
              <button className="btn ghost small" onClick={() => life.rehomeCat(c.id)}>
                {t('cats.rehome')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="item-grid">
        {CAT_BREEDS.map((b) => {
          const block = catBlocker(state, b.id);
          return (
            <li key={b.id}>
              <button className={`item-card ${block === 'max' ? 'locked' : ''}`} disabled={block !== null} onClick={() => life.adoptCat(b.id)}>
                <span className="item-art home-art">
                  <CatImage breed={b.id} size={92} />
                </span>
                <b>{b.name[lang]}</b>
                <span className="muted small">{b.desc[lang]}</span>
                <span className="item-price">{block === 'max' ? t('cats.max') : `${t('cats.adopt')} · ◈ ${b.price}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ShopTab({ state }: { state: GameState }) {
  const { t } = useI18n();
  const [section, setSection] = useState<ShopSection>('clothes');
  const [filter, setFilter] = useState<Slot | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const items = ITEMS.filter((i) => filter === 'all' || i.slot === filter);
  const openItem = open ? itemById(open) : undefined;
  return (
    <div className="tab-body">
      <div className="shop-head">
        <h2>{t('shop')}</h2>
        <span className="gold-pill">◈ {state.gold}</span>
      </div>
      <div className="segmented shop-sections">
        {(['clothes', 'home', 'cats'] as const).map((x) => (
          <button key={x} className={section === x ? 'on' : ''} onClick={() => setSection(x)}>
            {t(`shop.${x}` as I18nKey)}
          </button>
        ))}
      </div>
      {section === 'home' && <HomeShop state={state} />}
      {section === 'cats' && <CatShop state={state} />}
      {section === 'clothes' && (
        <>
          <div className="chips">
            {(['all', ...SLOTS] as const).map((s) => (
              <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
                {t(`slot.${s}` as I18nKey)}
              </button>
            ))}
          </div>
          <ul className="item-grid">
            {items.map((i) => (
              <ItemCard key={i.id} state={state} item={i} onOpen={() => setOpen(i.id)} />
            ))}
          </ul>
        </>
      )}
      {openItem && <ItemSheet state={state} item={openItem} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Снаряжение во вкладке персонажа: слоты и купленные предметы — только изображения предметов. */
export function InventorySection({ state }: { state: GameState }) {
  const { t, tf } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const openItem = open ? itemById(open) : undefined;
  const bonus = Math.round(equipmentBonus(state) * 100);
  const color = state.character.color;
  const figure = state.character.appearance.figure;
  const equippedIds = Object.values(state.equipped);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('inventory')}</h2>
        <span className="muted small">{tf('bonusTotal', { n: bonus })}</span>
      </div>
      <ul className="slot-list">
        {SLOTS.map((slot) => {
          const id = state.equipped[slot];
          const def = id ? itemById(id) : undefined;
          return (
            <li key={slot}>
              <button className={`slot-tile ${id ? '' : 'empty'}`} disabled={!id} onClick={() => id && setOpen(id)} style={def ? { borderColor: RARITY_COLOR[def.rarity] + '66' } : undefined}>
                <span className="slot-art">{id ? <ItemImage itemId={id} color={color} figure={figure} size={52} /> : <span className="slot-empty-mark">—</span>}</span>
                <span className="slot-text">
                  <span className="muted small">{t(`slot.${slot}` as I18nKey)}</span>
                  <span className="slot-name">{id ? itemName(t, id) : t('emptySlot')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="card-head">
        <p className="muted small">{t('ownedItems')}</p>
        <span className="muted small">{tf('bagCount', { n: state.inventory.length, max: BAG_CAPACITY })}</span>
      </div>
      <ul className="bag-grid">
        {state.inventory.map((id) => {
          const def = itemById(id);
          return (
            <li key={id}>
              <button className={`bag-cell ${equippedIds.includes(id) ? 'on' : ''}`} onClick={() => setOpen(id)} title={itemName(t, id)} aria-label={itemName(t, id)} style={def ? { borderColor: RARITY_COLOR[def.rarity] + '66' } : undefined}>
                <ItemImage itemId={id} color={color} figure={figure} size={52} />
                {equippedIds.includes(id) && <span className="bag-check">✓</span>}
              </button>
            </li>
          );
        })}
        {/* Свободные ячейки рюкзака: не меньше четырёх рядов, ряд всегда заполнен. */}
        {Array.from({ length: Math.min(BAG_CAPACITY, Math.max(32, Math.ceil((state.inventory.length + 1) / 8) * 8)) - state.inventory.length }, (_, i) => (
          <li key={`empty-${i}`}>
            <span className="bag-cell empty" aria-hidden="true" />
          </li>
        ))}
      </ul>
      {openItem && <ItemSheet state={state} item={openItem} onClose={() => setOpen(null)} />}
    </section>
  );
}
