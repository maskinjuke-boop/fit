import { lazy, Suspense } from 'react';
import type { Slot } from '../../game/items';
import type { Appearance } from '../../game/state';
import { Avatar } from './Avatar';

export interface Hero3DProps {
  color: string;
  appearance: Appearance;
  equipped: Partial<Record<Slot, string>>;
  /** Высота сцены в пикселях; ширина — по контейнеру. */
  height?: number;
  /** Можно ли вращать персонажа пальцем. */
  interactive?: boolean;
}

function Flat({ color, appearance, equipped, height = 260 }: Hero3DProps) {
  return (
    <div className="hero3d fallback" style={{ height }}>
      <Avatar color={color} appearance={appearance} equipped={equipped} size={Math.round(height * 0.75)} />
    </div>
  );
}

// three.js загружается отдельным файлом только когда нужен 3D-персонаж,
// а если файл не загрузился (нет сети), остаётся 2D-портрет.
const Character3D = lazy(() => import('./three/Character3D').catch(() => ({ default: Flat })));

/** 3D-персонаж с 2D-портретом на время загрузки и при отсутствии WebGL. */
export function Hero3D(props: Hero3DProps) {
  return (
    <Suspense fallback={<Flat {...props} />}>
      <Character3D {...props} />
    </Suspense>
  );
}
