import { useState, type MouseEvent } from 'react';
import { canBuy, equipmentBonus } from '../../game/engine';
import { useGame } from '../../game/GameContext';
import { ITEMS, RARITY_COLOR, SLOTS, itemById, type ItemDef, type Slot } from '../../game/items';
import { levelOf } from '../../game/levels';
import type { GameState } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import { Hero3D } from './Hero3D';
import { ItemImage } from './Renders';

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
            <Hero3D color={state.character.color} appearance={state.character.appearance} equipped={preview} height={280} />
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

export function ShopTab({ state }: { state: GameState }) {
  const { t } = useI18n();
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
      {state.inventory.length > 0 && (
        <>
          <p className="muted small">{t('ownedItems')}</p>
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
          </ul>
        </>
      )}
      {openItem && <ItemSheet state={state} item={openItem} onClose={() => setOpen(null)} />}
    </section>
  );
}
