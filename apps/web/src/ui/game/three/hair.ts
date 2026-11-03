import * as THREE from 'three';
import type { Appearance, Figure } from '../../../game/state';
import { anatomy } from './anatomy';
import { HEAD_GROW, HEAD_Y, NECK_WORLD, NECK_Y } from './body';
import { faceKey, faceNeutral, faceValues, skullPoint } from './head';
import { hairTexture, isMeshHair, loadHairTexture, meshHairGeometry } from './hairMesh';
import { M, mesh, v, type Mat } from './kit';
import type { Drape } from './strands';

/**
 * Причёски — готовые причёски MakeHuman (CC0, см. hairMesh): сетки из карточек с текстурой
 * прядей, сделанные для той же модели головы. Под шляпой волосы прижаты к голове, под шлемом
 * видны только длинные пряди; длинные волосы ложатся поверх тела и одежды.
 * Координаты — собственные координаты головы.
 */

export type Cover = 'none' | 'hat' | 'helm';

/** Направление от центра головы: th — угол от макушки, phi — от лица (+Z) вокруг вертикали. */
const dir = (th: number, phi: number): THREE.Vector3 => v(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));

function drapeFor(figure: Figure, clearance: number): Drape & { clearance: number } {
  const a = anatomy(figure);
  const G = HEAD_GROW;
  const f = (x: number, y: number, z: number): number => a.eval(G * x, NECK_WORLD + G * (y - NECK_Y), G * z) / G;
  const h = 0.004;
  return {
    // Зазор до кожи: толщина одежды поверх тела (в единицах головы) и немного объёма.
    clearance: clearance / G + 0.008,
    dist: (p) => f(p.x, p.y, p.z),
    normal: (p, out) => out.set(f(p.x + h, p.y, p.z) - f(p.x - h, p.y, p.z), f(p.x, p.y + h, p.z) - f(p.x, p.y - h, p.z), f(p.x, p.y, p.z + h) - f(p.x, p.y, p.z - h)).normalize(),
  };
}

const hairCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  // Причёска по изменённому ползунками лицу строится для героя заново и освобождается вместе с ним.
  if (!faceNeutral()) return make();
  let g = hairCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    hairCache.set(key, g);
  }
  return g;
}

/**
 * Готовая причёска MakeHuman: сетка из карточек с текстурой прядей. Пока текстура
 * загружается, материал причёски скрыт (без неё карточки выглядели бы сплошными полосами).
 */
function meshHair(style: string, m: Mat, cover: Cover, figure: Figure, clearance: number): THREE.Mesh {
  const female = figure === 'female';
  const drape = drapeFor(figure, clearance);
  const q = new THREE.Vector3();
  const n = new THREE.Vector3();
  const key = `mh|${style}|${figure}|${cover}|${clearance.toFixed(3)}|${faceKey()}`;
  const geo = cached(key, () =>
    meshHairGeometry(style as never, female, {
      face: faceValues(),
      neutral: faceNeutral(),
      cover,
      skull: (d, off) => skullPoint(d, female, off),
      // Пряди ниже головы ложатся поверх тела и одежды.
      push: (p) => {
        for (let k = 0; k < 2; k += 1) {
          q.set(p.x, p.y + HEAD_Y, p.z);
          const dist = drape.dist(q);
          if (dist >= drape.clearance) return;
          drape.normal(q, n);
          p.addScaledVector(n, drape.clearance - dist);
        }
      },
    }),
  );
  // Карточкам — простой материал без анизотропного блика: на плоских полосках он даёт
  // белые «искры»; объём и блеск прядей уже нарисованы в текстуре.
  const base = m as THREE.MeshStandardMaterial;
  m = new THREE.MeshStandardMaterial({ color: base.color, roughness: 0.62, metalness: 0, envMapIntensity: 0.45, side: THREE.DoubleSide, alphaTest: 0.45 });
  base.dispose();
  const me = new THREE.Mesh(geo, m);
  me.position.y = HEAD_Y;
  const t = hairTexture(style);
  if (t) m.map = t;
  else if (typeof document !== 'undefined') {
    m.visible = false;
    void loadHairTexture(style).then((tx) => {
      if (tx) {
        m.map = tx;
        m.needsUpdate = true;
      }
      m.visible = true;
    });
  }
  return me;
}

/**
 * Пучок на затылке поверх зачёсанных назад волос: приплюснутый шар с той же текстурой прядей
 * (участок текстуры, целиком покрытый волосами) и резинка.
 */
function bunKnot(hair: THREE.Mesh, female: boolean): THREE.Group {
  const g = new THREE.Group();
  const c = skullPoint(dir(Math.PI * 0.36, Math.PI), female, 0.03).add(v(0, HEAD_Y, 0));
  const geo = new THREE.SphereGeometry(0.085, 28, 18);
  const uv = geo.getAttribute('uv');
  // Участок текстуры bun.webp без прозрачности (u 0.17…0.46, v 0.56…0.85).
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.18 + 0.27 * ((uv.getX(i) * 3) % 1), 0.57 + 0.27 * uv.getY(i));
  const ball = new THREE.Mesh(geo, hair.material);
  ball.position.copy(c);
  ball.scale.set(1, 0.85, 0.8);
  g.add(ball);
  const tie = mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), M.cloth('#d23a4a', 2), [c.x, c.y - 0.01, c.z + 0.035]);
  tie.rotation.x = -0.5;
  g.add(tie);
  return g;
}

/** clearance — насколько одежда выступает над кожей: длинные пряди ложатся поверх неё. */
export function buildHair(style: Appearance['hair'], m: Mat, cover: Cover, figure: Figure, clearance = 0.016): THREE.Group {
  const g = new THREE.Group();
  if (!isMeshHair(style)) return g;
  const me = meshHair(style, m, cover, figure, clearance);
  g.add(me);
  if (style === 'bun' && cover === 'none') g.add(bunKnot(me, figure === 'female'));
  return g;
}
