import { useState, type MouseEvent } from 'react';
import { canBuy, equipmentBonus } from '../../game/engine';
import { useGame } from '../../game/GameContext';
import { ITEMS, RARITY_COLOR, SLOTS, itemById, type ItemDef, type Slot } from '../../game/items';
import { levelOf } from '../../game/levels';
import type { GameState } from '../../game/state';
import { useI18n, type I18nKey } from '../../i18n';
import { Avatar } from './Avatar';

const itemName = (t: (k: I18nKey) => string, id: string): string => t(`item.${id}` as I18nKey);

function BonusLabel({ item }: { item: ItemDef }) {
  const { t, tf } = useI18n();
  return <span className="muted small">{item.xpBonus > 0 ? tf('xpBonus', { n: Math.round(item.xpBonus * 100) }) : t('cosmetic')}</span>;
}

/** Карточка-примерка: персонаж с предметом, характеристики и действие (купить / надеть / снять). */
function ItemSheet({ state, item, onClose }: { state: GameState; item: ItemDef; onClose(): void }) {
  const { t, tf } = useI18n();
  const { buy, equip, unequip } = useGame();
  const owned = state.inventory.includes(item.id);
  const isEquipped = state.equipped[item.slot] === item.id;
  const error = canBuy(state, item.id);
  const preview = { ...state.equipped, [item.slot]: item.id };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet item-sheet" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div className="item-sheet-art">
          <Avatar color={state.character.color} appearance={state.character.appearance} equipped={preview} size={200} />
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
  const preview = { ...state.equipped, [item.slot]: item.id };
  return (
    <li>
      <button className={`item-card ${locked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}`} style={{ borderColor: isEquipped ? undefined : RARITY_COLOR[item.rarity] + '55' }} onClick={onOpen}>
        <Avatar color={state.character.color} appearance={state.character.appearance} equipped={preview} size={84} />
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

/** Снаряжение во вкладке персонажа: слоты и купленные предметы. */
export function InventorySection({ state }: { state: GameState }) {
  const { t, tf } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const openItem = open ? itemById(open) : undefined;
  const bonus = Math.round(equipmentBonus(state) * 100);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('inventory')}</h2>
        <span className="muted small">{tf('bonusTotal', { n: bonus })}</span>
      </div>
      <ul className="slot-list">
        {SLOTS.map((slot) => {
          const id = state.equipped[slot];
          return (
            <li key={slot}>
              <span className="muted small">{t(`slot.${slot}` as I18nKey)}</span>
              {id ? (
                <button className="link" onClick={() => setOpen(id)}>
                  {itemName(t, id)}
                </button>
              ) : (
                <span className="muted">{t('emptySlot')}</span>
              )}
            </li>
          );
        })}
      </ul>
      {state.inventory.length > 0 && (
        <div className="chips owned-list">
          {state.inventory.map((id) => (
            <button key={id} className={`chip ${Object.values(state.equipped).includes(id) ? 'on' : ''}`} onClick={() => setOpen(id)}>
              {itemName(t, id)}
            </button>
          ))}
        </div>
      )}
      {openItem && <ItemSheet state={state} item={openItem} onClose={() => setOpen(null)} />}
    </section>
  );
}
