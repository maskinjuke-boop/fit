import { useEffect, useState } from 'react';
import { itemById, type Slot } from '../../game/items';
import type { Appearance, Figure } from '../../game/state';
import { Avatar, ItemIcon } from './Avatar';

/**
 * Картинки из 3D-моделей: иконки предметов и портрет героя.
 * Пока three.js загружается (или если WebGL недоступен), показывается векторный вариант.
 */

type SnapModule = typeof import('./three/snapshot');
let mod: Promise<SnapModule> | null = null;
const load = (): Promise<SnapModule> => (mod ??= import('./three/snapshot'));

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let failed = false;

function request(key: string, make: (m: SnapModule) => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  if (failed) return Promise.reject(new Error('webgl'));
  let p = pending.get(key);
  if (!p) {
    p = load()
      .then(make)
      .then((url) => {
        cache.set(key, url);
        return url;
      })
      .catch((e: unknown) => {
        // WebGL недоступен или не загрузился файл 3D — дальше показываем векторные картинки.
        if (!(e instanceof Error) || e.message === 'webgl' || e.name === 'TypeError') failed = true;
        throw e;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

function useSnapshot(key: string, make: (m: SnapModule) => Promise<string>, initial?: string): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? initial ?? null);
  useEffect(() => {
    let alive = true;
    const hit = cache.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    request(key, make).then(
      (u) => alive && setUrl(u),
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // make зависит только от данных, уже вошедших в key.
  }, [key]);
  return url;
}

const itemKey = (id: string, color: string, figure: Figure): string => {
  const slot = itemById(id)?.slot;
  // Одежда, обувь, перчатки и украшения строятся по фигуре; уборы и оружие — нет.
  return `item|${id}|${color}|${slot === 'head' || slot === 'weapon' || slot === 'offhand' ? '-' : figure}`;
};

/** Иконка предмета, отрисованная из его 3D-модели. */
export function ItemImage({ itemId, color, figure, size = 72 }: { itemId: string; color: string; figure: Figure; size?: number }) {
  const url = useSnapshot(itemKey(itemId, color, figure), (m) => m.renderItem(itemId, color, figure, Math.min(256, Math.round(size * 2.4)), 1));
  if (!url) return <ItemIcon itemId={itemId} color={color} size={size} />;
  return <img className="item-render" src={url} width={size} height={size} alt="" draggable={false} />;
}

/** Заранее готовит иконки всех предметов, пока игрок на главной. */
export function preloadItemImages(ids: readonly string[], color: string, figure: Figure): void {
  for (const id of ids) void request(itemKey(id, color, figure), (m) => m.renderItem(id, color, figure, 202)).catch(() => undefined);
}

const PORTRAIT_KEY = 'fitness-rpg.portrait.v1';

function savedPortrait(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(PORTRAIT_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as { key?: string; url?: string };
    return p.key === key ? p.url : undefined;
  } catch {
    return undefined;
  }
}

/** Портрет героя по пояс в круглой рамке (из 3D-модели). */
export function HeroPortrait({ color, appearance, equipped, size = 56, remember = true }: { color: string; appearance: Appearance; equipped: Partial<Record<Slot, string>>; size?: number; remember?: boolean }) {
  const key = `portrait|${JSON.stringify([color, appearance, equipped])}`;
  const url = useSnapshot(
    key,
    (m) =>
      m.renderPortrait(appearance, color, equipped, 192).then((u) => {
        // Портрет своего героя запоминаем, чтобы он появлялся сразу при запуске (портреты персонажей истории — нет).
        if (remember) {
          try {
            localStorage.setItem(PORTRAIT_KEY, JSON.stringify({ key, url: u }));
          } catch {
            // Хранилище недоступно — портрет просто отрисуется заново в следующий раз.
          }
        }
        return u;
      }),
    remember ? savedPortrait(key) : undefined,
  );
  if (!url) return <Avatar color={color} appearance={appearance} equipped={equipped} size={size} />;
  return (
    <span className="portrait" style={{ width: size, height: size, borderColor: color, background: `radial-gradient(circle at 50% 38%, ${color}66, #121418 72%)` }}>
      <img src={url} alt="" draggable={false} />
    </span>
  );
}

