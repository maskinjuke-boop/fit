import * as THREE from 'three';
import type { ObjectId } from '../../../game/lifeTypes';
import { M, mat, mesh } from './kit';

/**
 * 3D-модели предметов дома и зала (лицевая сторона — к +Z), процедурные
 * текстуры паркета и штукатурки. Анимированные части (рыбки, часы, экраны,
 * неон, листья) обновляются функциями из userData.tick: (время, игровая минута, ночь).
 */

export type HomeAnim = (t: number, minute: number, night: boolean) => void;

/** Функции анимации модели (собранные со всех вложенных частей). */
export function ticksOf(o: THREE.Object3D): HomeAnim[] {
  const out: HomeAnim[] = [];
  o.traverse((x) => {
    const t = x.userData.tick as HomeAnim[] | undefined;
    if (t) out.push(...t);
  });
  return out;
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Генератор случайных чисел с зерном (для повторяемых текстур). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let parquet: THREE.CanvasTexture | null | undefined;
/** Паркет: доски со смещёнными стыками, оттенками и волокнами (один повтор — 1,2 × 1,2 м). */
export function parquetTexture(): THREE.CanvasTexture | null {
  if (parquet !== undefined) return parquet;
  parquet = canvasTex(1024, 1024, (ctx) => {
    const r = seeded(7);
    const rows = 8;
    const h = 1024 / rows;
    for (let row = 0; row < rows; row += 1) {
      const y = row * h;
      let x = -r() * 600;
      while (x < 1024) {
        const len = 380 + r() * 420;
        const tone = 0.82 + r() * 0.3;
        const base = [Math.round(176 * tone), Math.round(128 * tone), Math.round(84 * tone)];
        const grd = ctx.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, `rgb(${base[0]! + 8},${base[1]! + 6},${base[2]! + 4})`);
        grd.addColorStop(1, `rgb(${base[0]! - 10},${base[1]! - 8},${base[2]! - 6})`);
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, len, h);
        ctx.lineWidth = 1;
        for (let k = 0; k < 14; k += 1) {
          const gy = y + 4 + r() * (h - 8);
          const amp = 1 + r() * 3;
          const f = 0.004 + r() * 0.01;
          ctx.strokeStyle = `rgba(${70 + r() * 30},${40 + r() * 20},20,${0.12 + r() * 0.15})`;
          ctx.beginPath();
          for (let px = 0; px <= len; px += 12) ctx.lineTo(x + px, gy + Math.sin(px * f + k) * amp);
          ctx.stroke();
        }
        if (r() < 0.25) {
          ctx.fillStyle = 'rgba(80,45,20,0.35)';
          ctx.beginPath();
          ctx.ellipse(x + r() * len, y + h * (0.3 + r() * 0.4), 9 + r() * 6, 4 + r() * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(40,24,12,0.65)';
        ctx.fillRect(x, y, 2, h);
        x += len;
      }
      ctx.fillStyle = 'rgba(40,24,12,0.6)';
      ctx.fillRect(0, y, 1024, 2);
    }
  });
  if (parquet) parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping;
  return parquet;
}

let plaster: THREE.CanvasTexture | null | undefined;
/** Мягкая неровность штукатурки (светлая, окрашивается цветом материала). */
export function plasterTexture(): THREE.CanvasTexture | null {
  if (plaster !== undefined) return plaster;
  plaster = canvasTex(256, 256, (ctx) => {
    const r = seeded(3);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i += 1) {
      const v = 222 + Math.floor(r() * 33);
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(r() * 256, r() * 256, 2 + r() * 4, 2 + r() * 4);
    }
  });
  if (plaster) plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  return plaster;
}

let blob: THREE.CanvasTexture | null | undefined;
function contactShadowTexture(): THREE.CanvasTexture | null {
  if (blob !== undefined) return blob;
  blob = canvasTex(
    128,
    128,
    (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    },
    false,
  );
  return blob;
}

/** Мягкая контактная тень под предметом размером w × d (затенение у пола). */
export function contactShadow(w: number, d: number, opacity = 0.8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), color: '#000000', transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  m.renderOrder = 1;
  return m;
}

/** Картина: абстракция из пятен и линий. */
function artTexture(seed: number): THREE.CanvasTexture | null {
  return canvasTex(256, 192, (ctx) => {
    const r = seeded(seed);
    const pal = ['#f4d35e', '#ee964b', '#f95738', '#0d3b66', '#5aa9e6', '#7fc8f8', '#faf0ca', '#3d405b', '#81b29a'];
    ctx.fillStyle = '#faf3e3';
    ctx.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 9; i += 1) {
      ctx.fillStyle = pal[Math.floor(r() * pal.length)]!;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(r() * 256, r() * 192, 20 + r() * 60, 15 + r() * 45, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#1b1d21';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(r() * 256, r() * 192);
      ctx.bezierCurveTo(r() * 256, r() * 192, r() * 256, r() * 192, r() * 256, r() * 192);
      ctx.stroke();
    }
  });
}

/** Фото: силуэты людей на цветном фоне. */
function photoTexture(seed: number): THREE.CanvasTexture | null {
  return canvasTex(96, 96, (ctx) => {
    const r = seeded(seed);
    const bg = ['#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6'];
    ctx.fillStyle = bg[Math.floor(r() * bg.length)]!;
    ctx.fillRect(0, 0, 96, 96);
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i += 1) {
      const x = n === 1 ? 48 : 22 + (i * 52) / (n - 1);
      ctx.fillStyle = ['#e85d2a', '#2f6fb5', '#3a9d6a'][i % 3]!;
      ctx.fillRect(x - 10, 52, 20, 44);
      ctx.fillStyle = '#e0b28f';
      ctx.beginPath();
      ctx.arc(x, 42, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Надпись неоном. */
function neonTexture(text: string): THREE.CanvasTexture | null {
  return canvasTex(512, 192, (ctx) => {
    ctx.font = 'bold 120px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff3d9a';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#ffd0ea';
    ctx.fillText(text, 256, 100);
    ctx.fillText(text, 256, 100);
  });
}

const wood = (c = '#8a5a30'): THREE.Material => M.wood(c, 1, 2);
const paint = (c: string, r = 0.8): THREE.Material => mat(c, r);

/** Модель предмета (лицевая сторона — к +Z). */
export function objectModel(id: ObjectId): THREE.Group {
  const g = new THREE.Group();
  const tick: HomeAnim[] = [];
  g.userData.tick = tick;
  switch (id) {
    case 'bed': {
      g.add(mesh(new THREE.BoxGeometry(2, 0.4, 2.6), wood('#6b4428'), [0, 0.2, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.9, 0.22, 2.45), paint('#f2f0ea', 0.9), [0, 0.5, 0.05]));
      g.add(mesh(new THREE.BoxGeometry(1.92, 0.12, 1.6), M.cloth('#5b7fb3', 4), [0, 0.64, 0.45]));
      g.add(mesh(new THREE.BoxGeometry(0.75, 0.16, 0.45), paint('#ffffff', 0.9), [-0.45, 0.68, -0.9]), mesh(new THREE.BoxGeometry(0.75, 0.16, 0.45), paint('#ffffff', 0.9), [0.45, 0.68, -0.9]));
      g.add(mesh(new THREE.BoxGeometry(2.1, 1.1, 0.12), wood('#5a3a22'), [0, 0.75, -1.3]));
      break;
    }
    case 'sofa': {
      const c = M.cloth('#7d8b99', 5);
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.45, 0.95), c, [0, 0.25, 0]));
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.6, 0.25), c, [0, 0.65, -0.38]));
      for (const x of [-1.15, 1.15]) g.add(mesh(new THREE.BoxGeometry(0.22, 0.5, 0.95), c, [x, 0.5, 0]));
      // Журнальный столик перед диваном (препятствие — homeObstacles, сесть можно сбоку).
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.7), wood('#a0784a'), [0, 0.32, 1.15]));
      // Телевизор напротив дивана (на стене перед ним).
      const tv = new THREE.Group();
      tv.add(mesh(new THREE.BoxGeometry(1.6, 0.5, 0.45), wood('#3a2a1e'), [0, 0.25, 0]));
      tv.add(mesh(new THREE.BoxGeometry(1.5, 0.85, 0.06), paint('#111316', 0.3), [0, 0.95, 0]));
      tv.add(mesh(new THREE.PlaneGeometry(1.4, 0.76), M.glow('#3a6ea5', 0.5), [0, 0.95, 0.035]));
      tv.position.z = 2.9;
      tv.rotation.y = Math.PI;
      g.add(tv);
      break;
    }
    case 'fridge': {
      g.add(mesh(new THREE.BoxGeometry(0.85, 1.9, 0.75), paint('#e8ecef', 0.35), [0, 0.95, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), M.steel(), [0.33, 1.3, 0.39]), mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), M.steel(), [0.33, 0.55, 0.39]));
      g.add(mesh(new THREE.BoxGeometry(0.86, 0.02, 0.02), paint('#9aa3ad'), [0, 0.95, 0.38]));
      break;
    }
    case 'stove': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.9, 0.7), paint('#d9dde1', 0.4), [0, 0.45, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.04, 0.7), paint('#1b1d21', 0.2), [0, 0.92, 0]));
      for (const [x, z] of [[-0.25, -0.15], [0.25, -0.15], [-0.25, 0.15], [0.25, 0.15]] as const) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20), paint('#444'));
        r.rotation.x = Math.PI / 2;
        r.position.set(x, 0.95, z);
        g.add(r);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.12, 16), M.steel(), [0.25, 1.01, -0.15]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.7, 0.4), paint('#cfd5da', 0.5), [0, 1.9, -0.15]));
      break;
    }
    case 'shower': {
      const glass = mat('#bfe6ff', 0.05, 0, { transparent: true, opacity: 0.28, depthWrite: false });
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), paint('#f4f6f8', 0.3), [0, 0.06, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.3, 2.1, 0.03), glass, [0, 1.1, 0.65]), mesh(new THREE.BoxGeometry(0.03, 2.1, 1.3), glass, [-0.65, 1.1, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), M.chrome(), [0.55, 1.1, -0.55]));
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 16), M.chrome(), [0.45, 2.05, -0.45]));
      break;
    }
    case 'mirror': {
      g.add(mesh(new THREE.BoxGeometry(0.85, 1.7, 0.06), wood('#c9a66b'), [0, 1.15, 0]));
      g.add(mesh(new THREE.PlaneGeometry(0.72, 1.55), mat('#cfe3f2', 0.02, 1), [0, 1.15, 0.035]));
      break;
    }
    case 'door': {
      g.add(mesh(new THREE.BoxGeometry(1.1, 2.2, 0.08), wood('#7a4e2d'), [0, 1.1, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.gold(), [0.4, 1.05, 0.06]));
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.08, 0.12), wood('#5a3a22'), [0, 2.24, 0]));
      break;
    }
    case 'computer': {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.05, 0.65), wood('#c9a66b'), [0, 0.75, 0]));
      for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.75, 0.6), wood('#a0784a'), [x, 0.375, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.42, 0.04), paint('#15171b', 0.3), [0, 1.05, -0.15]));
      g.add(mesh(new THREE.PlaneGeometry(0.64, 0.36), M.glow('#5fb3ff', 0.6), [0, 1.05, -0.128]));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), paint('#2a2d33'), [0, 0.79, 0.12]));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.08, 16), paint('#2a2d33'), [0, 0.45, 0.6]), mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), paint('#2a2d33'), [0, 0.75, 0.82]));
      break;
    }
    case 'bookshelf': {
      g.add(mesh(new THREE.BoxGeometry(1.1, 2, 0.4), wood('#8a5a30'), [0, 1, 0]));
      const colors = ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
      for (let shelf = 0; shelf < 4; shelf += 1) {
        for (let i = 0; i < 7; i += 1) g.add(mesh(new THREE.BoxGeometry(0.11, 0.32, 0.28), paint(colors[(i + shelf) % colors.length]!), [-0.42 + i * 0.14, 0.32 + shelf * 0.46, 0.06]));
      }
      break;
    }
    case 'yoga_mat': {
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.02, 1.8), paint('#8e44ad', 0.9), [0, 0.01, 0.3]));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 16), paint('#16a085', 0.9), [0, 0.12, -0.75]).rotateZ(Math.PI / 2));
      break;
    }
    case 'dumbbells': {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), M.darkSteel(), [0, 0.5, 0]));
      for (const x of [-0.55, 0.55]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.35), M.darkSteel(), [x, 0.25, 0]));
      for (let i = 0; i < 4; i += 1) {
        const x = -0.4 + i * 0.27;
        g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), M.chrome(), [x, 0.6, 0]).rotateX(Math.PI / 2));
        for (const z of [-0.12, 0.12]) g.add(mesh(new THREE.CylinderGeometry(0.07 + i * 0.01, 0.07 + i * 0.01, 0.06, 16), M.iron(), [x, 0.6, z]).rotateX(Math.PI / 2));
      }
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 1.2), paint('#2a2d33'), [0, 0.45, 0.9]));
      break;
    }
    case 'coffee_machine': {
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.55), wood('#c9a66b'), [0, 0.45, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.45, 0.35), M.chrome(), [0, 1.13, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 12), paint('#ffffff', 0.4), [0, 0.96, 0.12]));
      break;
    }
    case 'console': {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.45, 0.45), wood('#3a2a1e'), [0, 0.22, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.35, 0.08, 0.28), paint('#f4f4f4', 0.3), [-0.3, 0.49, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.1), paint('#222'), [0.25, 0.47, 0.1]));
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), paint('#111316', 0.3), [0, 1.1, -0.15]));
      g.add(mesh(new THREE.PlaneGeometry(1.1, 0.62), M.glow('#e84393', 0.6), [0, 1.1, -0.12]));
      break;
    }
    case 'piano': {
      g.add(mesh(new THREE.BoxGeometry(1.5, 1.25, 0.6), paint('#141418', 0.25), [0, 0.62, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.25), paint('#f4f4f4', 0.3), [0, 0.78, 0.38]));
      for (let i = 0; i < 9; i += 1) g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.14), paint('#111'), [-0.6 + i * 0.15, 0.82, 0.34]));
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.45, 0.35), paint('#141418', 0.3), [0, 0.22, 0.85]));
      break;
    }
    case 'bathtub': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.6, 1.8), paint('#f4f6f8', 0.25), [0, 0.3, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.82, 0.05, 1.6), mat('#9fd3f0', 0.1, 0, { transparent: true, opacity: 0.8 }), [0, 0.52, 0]));
      for (let i = 0; i < 6; i += 1) g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), paint('#ffffff', 0.9), [-0.25 + (i % 3) * 0.25, 0.58, -0.4 + Math.floor(i / 3) * 0.5]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), M.chrome(), [0, 0.8, -0.85]));
      break;
    }
    case 'aquarium': {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.8, 0.5), wood('#3a2a1e'), [0, 0.4, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.15, 0.65, 0.45), mat('#4fb6d6', 0.05, 0, { transparent: true, opacity: 0.55 }), [0, 1.13, 0]));
      const colors = ['#ff8a00', '#ffd23a', '#e84393'];
      for (let i = 0; i < 5; i += 1) {
        const fish = mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glow(colors[i % 3]!, 0.5), [-0.4 + i * 0.2, 1.0 + (i % 2) * 0.2, (i % 3) * 0.08 - 0.08], [1.6, 1, 0.6]);
        g.add(fish);
        tick.push((t) => {
          const a = t * (0.35 + i * 0.07) + i * 1.3;
          fish.position.x = Math.sin(a) * 0.42;
          fish.position.y = 1.05 + Math.sin(a * 1.7 + i) * 0.12;
          fish.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
        });
      }
      break;
    }
    case 'easel': {
      const w2 = wood('#a0784a');
      for (const x of [-0.35, 0.35]) g.add(mesh(new THREE.BoxGeometry(0.05, 1.8, 0.05), w2, [x, 0.9, 0]).rotateZ(x > 0 ? -0.12 : 0.12));
      g.add(mesh(new THREE.BoxGeometry(0.05, 1.7, 0.05), w2, [0, 0.85, -0.35]).rotateX(-0.25));
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.04), paint('#fbf7ef', 0.9), [0, 1.3, 0.05]));
      g.add(mesh(new THREE.CircleGeometry(0.15, 16), paint('#e67e22'), [-0.15, 1.35, 0.075]), mesh(new THREE.CircleGeometry(0.1, 16), paint('#2e86c1'), [0.18, 1.2, 0.075]));
      break;
    }
    case 'coach': {
      // Платформа тренера и колонка.
      g.add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 32), paint('#e85d2a', 0.6), [0, 0.04, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.9, 0.4), paint('#1b1d21', 0.4), [1.3, 0.45, 0.2]));
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), paint('#555', 0.3), [1.3, 0.62, 0.41]).rotateX(Math.PI / 2));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20), paint('#555', 0.3), [1.3, 0.3, 0.41]).rotateX(Math.PI / 2));
      break;
    }
    case 'reception': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 1.1, 2.4), paint('#f2f2f2', 0.4), [0, 0.55, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.06, 2.5), wood('#a0784a'), [0, 1.13, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 2.2), M.glow('#ff7a3d', 0.8), [0.52, 0.6, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.3, 0.04), paint('#15171b', 0.3), [-0.2, 1.35, 0.3]).rotateY(Math.PI / 2));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 12), paint('#ffffff', 0.4), [0.2, 1.28, -0.7]));
      break;
    }
    case 'gym_door': {
      g.add(mesh(new THREE.BoxGeometry(1.5, 2.3, 0.08), mat('#9fd0ee', 0.05, 0.2, { transparent: true, opacity: 0.55 }), [0, 1.15, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 0.12), M.darkSteel(), [0, 2.35, 0]));
      for (const x of [-0.78, 0.78]) g.add(mesh(new THREE.BoxGeometry(0.06, 2.35, 0.1), M.darkSteel(), [x, 1.17, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.6, 0.06), M.chrome(), [0.1, 1.1, 0.06]));
      break;
    }
    case 'gym_shower': {
      const tile = mat('#d9e7ee', 0.35);
      g.add(mesh(new THREE.BoxGeometry(1.4, 2.3, 0.08), tile, [0, 1.15, -0.65]));
      g.add(mesh(new THREE.BoxGeometry(0.08, 2.3, 2.4), tile, [0, 1.15, 0]).translateX(0));
      for (const z of [-0.6, 0.6]) {
        g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), M.chrome(), [0.5, 1.1, z - 0.55]));
        g.add(mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.05, 16), M.chrome(), [0.4, 2.05, z - 0.45]));
      }
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.04, 2.4), paint('#b7c9d3', 0.3), [0, 0.02, 0]));
      break;
    }
    case 'smoothie': {
      g.add(mesh(new THREE.BoxGeometry(0.9, 1.05, 2.8), paint('#2c3e50', 0.5), [0, 0.52, 0]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 2.9), paint('#f4f6f8', 0.3), [0, 1.08, 0]));
      const fruit = ['#7bc043', '#f37736', '#ee4035', '#fdf498'];
      for (let i = 0; i < 4; i += 1) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.22, 12), M.glow(fruit[i]!, 0.35), [0.1, 1.22, -1 + i * 0.6]));
      g.add(mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), M.chrome(), [-0.1, 1.31, 1.0]));
      break;
    }
    case 'armchair': {
      const c = M.cloth('#6b8f71', 4);
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.42, 0.85), c, [0, 0.31, 0.05]));
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.14, 0.7), M.cloth('#7fa585', 4), [0, 0.58, 0.1]));
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.75, 0.2), c, [0, 0.75, -0.33]).rotateX(-0.12));
      for (const x of [-0.4, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.14, 0.32, 0.8), c, [x, 0.66, 0.05]));
      for (const x of [-0.35, 0.35]) for (const z of [-0.3, 0.4]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.12, 8), wood('#3a2a1e'), [x, 0.06, z]));
      // Столик с лампой и книгами.
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), wood('#a0784a'), [0.72, 0.55, 0.1]), mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), M.darkSteel(), [0.72, 0.27, 0.1]));
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.14), paint('#c0392b'), [0.7, 0.59, 0.12]), mesh(new THREE.BoxGeometry(0.18, 0.04, 0.13), paint('#2e86c1'), [0.71, 0.63, 0.11]));
      break;
    }
    case 'massage_chair': {
      const l = M.leather('#2b2d33', 2);
      g.add(mesh(new THREE.BoxGeometry(0.85, 0.35, 0.9), M.darkSteel(), [0, 0.18, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.75, 0.16, 0.8), l, [0, 0.5, 0.05]));
      g.add(mesh(new THREE.BoxGeometry(0.75, 0.95, 0.25), l, [0, 0.95, -0.38]).rotateX(-0.35));
      g.add(mesh(new THREE.SphereGeometry(0.17, 16, 10), l, [0, 1.42, -0.52], [1.2, 0.8, 0.8]));
      for (const x of [-0.45, 0.45]) {
        g.add(mesh(new THREE.BoxGeometry(0.16, 0.38, 0.8), l, [x, 0.72, 0]));
        g.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.18), M.glow('#39d0ff', 0.6), [x, 0.92, 0.25]));
      }
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.5), l, [0, 0.25, 0.6]).rotateX(0.5));
      break;
    }
    case 'treadmill': {
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.18, 1.7), mat('#24272c', 0.6), [0, 0.09, 0.15]));
      const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.5), mat('#121212', 0.95));
      belt.rotation.x = -Math.PI / 2;
      belt.position.set(0, 0.185, 0.2);
      g.add(belt);
      for (const x of [-0.37, 0.37]) g.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05), M.darkSteel(), [x, 0.7, -0.62]).rotateX(-0.15));
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.35, 0.08), mat('#24272c', 0.4), [0, 1.28, -0.72]).rotateX(-0.5));
      const scr = mesh(new THREE.PlaneGeometry(0.5, 0.2), M.glow('#39d0ff', 0.7), [0, 1.31, -0.67]).rotateX(-0.5);
      g.add(scr);
      tick.push((t) => {
        ((scr as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 0.25 * Math.sin(t * 2);
      });
      break;
    }
    case 'punching_bag': {
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), M.iron(), [0, 2.35, -0.05]));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), M.iron(), [0, 2.35, -0.38]));
      const bag = new THREE.Group();
      bag.position.set(0, 2.3, 0.25);
      bag.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 6), M.chrome(), [0, -0.22, 0]));
      bag.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 20), M.leather('#9b1c1c', 2), [0, -0.95, 0]));
      bag.add(mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.leather('#9b1c1c', 2), [0, -0.45, 0]));
      bag.add(mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.08, 20), paint('#1b1d21'), [0, -0.8, 0]), mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.08, 20), paint('#1b1d21'), [0, -1.2, 0]));
      g.add(bag);
      tick.push((t) => {
        bag.rotation.x = Math.sin(t * 1.4) * 0.025;
        bag.rotation.z = Math.sin(t * 1.1 + 1) * 0.02;
      });
      break;
    }
    case 'big_tv': {
      g.add(mesh(new THREE.BoxGeometry(2.1, 0.45, 0.45), wood('#2d241d'), [0, 0.23, -0.1]));
      g.add(mesh(new THREE.BoxGeometry(2.0, 1.15, 0.05), paint('#0d0e10', 0.25), [0, 1.25, -0.2]));
      const screenMat = new THREE.MeshStandardMaterial({ color: '#000000', emissive: new THREE.Color('#3a6ea5'), emissiveIntensity: 0.9, roughness: 0.2 });
      const screen = mesh(new THREE.PlaneGeometry(1.9, 1.06), screenMat, [0, 1.25, -0.172]);
      g.add(screen);
      const hues = ['#3a6ea5', '#a54a3a', '#3aa56e', '#8a3aa5', '#a5873a'];
      tick.push((t) => {
        const k = Math.floor(t / 3.5) % hues.length;
        screenMat.emissive.lerp(new THREE.Color(hues[k]!), 0.03);
        screenMat.emissiveIntensity = 0.75 + 0.12 * Math.sin(t * 7) * Math.sin(t * 2.3);
      });
      for (const x of [-0.85, 0.85]) g.add(mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), paint('#1b1d21', 0.4), [x, 0.9, -0.05]));
      // Кресло-мешок перед экраном.
      g.add(mesh(new THREE.SphereGeometry(0.42, 20, 14), M.cloth('#e0a33a', 4), [0, 0.22, 1.25], [1.1, 0.55, 1]));
      g.add(mesh(new THREE.SphereGeometry(0.36, 20, 14), M.cloth('#e0a33a', 4), [0, 0.42, 1.55], [1, 0.75, 0.6]));
      break;
    }
    case 'smart_speaker': {
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 24), wood('#c9a66b'), [0, 0.62, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 10), M.darkSteel(), [0, 0.3, 0]), mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 20), M.darkSteel(), [0, 0.015, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.24, 24), M.cloth('#3b3f45', 6), [0, 0.76, 0]));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 32), M.glow('#39d0ff', 1.2));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.885;
      g.add(ring);
      tick.push((t) => {
        (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + 0.7 * Math.abs(Math.sin(t * 3.2));
      });
      break;
    }
    case 'blender':
    case 'microwave': {
      // Кухонная тумба со столешницей.
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.86, 0.6), paint('#e9edf0', 0.5), [0, 0.43, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.94, 0.05, 0.64), paint('#3a3f45', 0.3), [0, 0.885, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), M.chrome(), [0.3, 0.55, 0.31]));
      if (id === 'blender') {
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 16), paint('#d0312d', 0.4), [0, 0.98, 0]));
        g.add(mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.3, 16, 1, true), mat('#cfe8ff', 0.05, 0, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), [0, 1.2, 0]));
        g.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.16, 16), paint('#e8a0b4', 0.6), [0, 1.13, 0]));
        g.add(mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 16), paint('#1b1d21'), [0, 1.36, 0]));
        for (let i = 0; i < 3; i += 1) g.add(mesh(new THREE.SphereGeometry(0.05, 12, 8), paint(['#f9d71c', '#e74c3c', '#2ecc71'][i]!, 0.5), [0.25 + i * 0.05, 0.95, -0.12 + i * 0.09]));
      } else {
        g.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.38), paint('#2a2d33', 0.35), [0, 1.07, -0.05]));
        g.add(mesh(new THREE.PlaneGeometry(0.34, 0.22), mat('#0d0e10', 0.1, 0.3), [-0.06, 1.07, 0.141]));
        const disp = mesh(new THREE.PlaneGeometry(0.08, 0.03), M.glow('#5bff8a', 1), [0.19, 1.15, 0.141]);
        g.add(disp);
        g.add(mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), M.chrome(), [0.13, 1.07, 0.15]));
      }
      break;
    }
    case 'vr_headset': {
      const matg = mesh(new THREE.BoxGeometry(1.2, 0.015, 1.2), paint('#3d4b5c', 0.95), [0, 0.008, 0.45]);
      g.add(matg);
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.75, 0.35), wood('#d9d4cc'), [0, 0.37, -0.25]));
      g.add(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), paint('#f4f4f4', 0.3), [0, 0.8, -0.25]));
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.07, 0.02), mat('#111', 0.1, 0.3), [0, 0.8, -0.18]));
      for (const x of [-0.17, 0.17]) g.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), paint('#f4f4f4', 0.3), [x, 0.78, -0.2]));
      break;
    }
    case 'robot_vacuum': {
      // Станция у стены (сам пылесос ездит отдельно).
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.12, 0.16), paint('#f4f4f4', 0.35), [0, 0.06, -0.05]));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), M.glow('#5bff8a', 1.2), [0, 0.1, 0.035]));
      break;
    }
    case 'air_conditioner': {
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.3, 0.22), paint('#f4f6f8', 0.4), [0, 0, 0.11]));
      for (let i = 0; i < 6; i += 1) g.add(mesh(new THREE.BoxGeometry(0.9, 0.012, 0.03), paint('#c9cfd5', 0.4), [0, -0.1 + i * 0.012, 0.22]));
      const led = mesh(new THREE.CircleGeometry(0.012, 10), M.glow('#5bc8ff', 1.4), [0.42, 0.08, 0.222]);
      g.add(led);
      break;
    }
    case 'painting': {
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.82, 0.04), wood('#c9a66b'), [0, 0, 0.02]));
      g.add(mesh(new THREE.PlaneGeometry(0.98, 0.7), new THREE.MeshStandardMaterial({ map: artTexture(11), roughness: 0.9 }), [0, 0, 0.042]));
      break;
    }
    case 'wall_clock': {
      g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 32), paint('#1b1d21', 0.4), [0, 0, 0.025]).rotateX(Math.PI / 2));
      g.add(mesh(new THREE.CircleGeometry(0.21, 32), paint('#faf7f0', 0.7), [0, 0, 0.052]));
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        g.add(mesh(new THREE.BoxGeometry(0.012, i % 3 === 0 ? 0.04 : 0.022, 0.004), paint('#1b1d21'), [Math.sin(a) * 0.18, Math.cos(a) * 0.18, 0.055]).rotateZ(-a));
      }
      const hour = new THREE.Group();
      hour.add(mesh(new THREE.BoxGeometry(0.016, 0.11, 0.005), paint('#1b1d21'), [0, 0.05, 0]));
      const min = new THREE.Group();
      min.add(mesh(new THREE.BoxGeometry(0.01, 0.16, 0.005), paint('#1b1d21'), [0, 0.075, 0]));
      const sec = new THREE.Group();
      sec.add(mesh(new THREE.BoxGeometry(0.004, 0.17, 0.004), paint('#d0312d'), [0, 0.07, 0]));
      hour.position.z = 0.058;
      min.position.z = 0.062;
      sec.position.z = 0.066;
      g.add(hour, min, sec);
      tick.push((t, minute) => {
        hour.rotation.z = -((minute / 60) % 12) / 12 * Math.PI * 2;
        min.rotation.z = -((minute % 60) / 60) * Math.PI * 2;
        sec.rotation.z = -(Math.floor(t) % 60) / 60 * Math.PI * 2;
      });
      break;
    }
    case 'neon_sign': {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.48, 0.03), mat('#15171b', 0.5, 0.2), [0, 0, 0.015]));
      const nm = new THREE.MeshBasicMaterial({ map: neonTexture('FIT ♥'), transparent: true, toneMapped: false, depthWrite: false });
      g.add(mesh(new THREE.PlaneGeometry(1.15, 0.43), nm, [0, 0, 0.035]));
      tick.push((t, _m, night) => {
        nm.opacity = (night ? 1 : 0.7) * (Math.sin(t * 23) > 0.97 ? 0.6 : 1);
      });
      break;
    }
    case 'photo_wall': {
      const pos: Array<[number, number, number]> = [[-0.42, 0.18, 0.28], [0, 0.22, 0.34], [0.4, 0.15, 0.26], [-0.25, -0.2, 0.3], [0.2, -0.22, 0.28]];
      pos.forEach(([x, y, sz], i) => {
        g.add(mesh(new THREE.BoxGeometry(sz + 0.04, sz + 0.04, 0.02), paint(i % 2 ? '#1b1d21' : '#f4f4f4', 0.5), [x, y, 0.01]));
        g.add(mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshStandardMaterial({ map: photoTexture(20 + i), roughness: 0.6 }), [x, y, 0.022]));
      });
      break;
    }
    case 'house_plant': {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 18), mat('#e8e2d6', 0.6), [0, 0.18, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 18), mat('#4a3526', 0.95), [0, 0.35, 0]));
      const leaf = mat('#2f7d3a', 0.6);
      leaf.side = THREE.DoubleSide;
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2 + i * 0.3;
        const stem = new THREE.Group();
        stem.position.set(0, 0.35, 0);
        stem.rotation.set(0.5 + (i % 3) * 0.2, a, 0);
        stem.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.5, 5), mat('#3d6b2f', 0.7), [0, 0.25, 0]));
        const l = mesh(new THREE.CircleGeometry(0.17, 14), leaf, [0, 0.55, 0.06], [0.85, 1.15, 1]);
        l.rotation.x = -1.1;
        stem.add(l);
        g.add(stem);
        tick.push((t) => {
          stem.rotation.z = Math.sin(t * 0.8 + i) * 0.025;
        });
      }
      break;
    }
    case 'floor_lamp': {
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 24), M.darkSteel(), [0, 0.02, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 10), M.gold(), [0, 0.77, 0]));
      const shadeMat = mat('#f6e7c8', 0.8, 0, { side: THREE.DoubleSide, emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.15 });
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 24, 1, true), shadeMat, [0, 1.6, 0]));
      const bulb = mesh(new THREE.SphereGeometry(0.05, 12, 8), M.glow('#fff1c4', 1.5), [0, 1.52, 0]);
      g.add(bulb);
      const light = new THREE.PointLight('#ffcf8a', 0, 5, 1.8);
      light.position.set(0, 1.45, 0.1);
      g.add(light);
      tick.push((_t, _m, night) => {
        light.intensity = night ? 6 : 0;
        shadeMat.emissiveIntensity = night ? 0.9 : 0.15;
      });
      break;
    }
    case 'flower_vase': {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20), wood('#a0784a'), [0, 0.6, 0]), mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 8), M.darkSteel(), [0, 0.3, 0]), mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.02, 20), M.darkSteel(), [0, 0.01, 0]));
      g.add(mesh(new THREE.LatheGeometry([new THREE.Vector2(0.04, 0), new THREE.Vector2(0.09, 0.08), new THREE.Vector2(0.07, 0.2), new THREE.Vector2(0.045, 0.26)], 20), mat('#5aa9e6', 0.2, 0.1), [0, 0.613, 0]));
      const colors = ['#ff5d8f', '#ffd23a', '#ff8a3d', '#ffffff', '#c86bfa'];
      for (let i = 0; i < 7; i += 1) {
        const a = i * 0.9;
        const x = Math.sin(a) * 0.07;
        const z = Math.cos(a) * 0.07;
        g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4), mat('#3d6b2f'), [x * 0.5, 0.95, z * 0.5]));
        g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(colors[i % colors.length]!, 0.6), [x, 1.07 + (i % 3) * 0.03, z]));
      }
      break;
    }
    case 'palm': {
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 16), wood('#7a5a3a'), [0, 0.21, 0]));
      const trunkMat = mat('#8a6a48', 0.95);
      for (let i = 0; i < 6; i += 1) g.add(mesh(new THREE.CylinderGeometry(0.065 - i * 0.004, 0.075 - i * 0.004, 0.24, 10), trunkMat, [Math.sin(i * 0.4) * 0.03, 0.52 + i * 0.22, 0]));
      const frond = mat('#3f8f3a', 0.65);
      frond.side = THREE.DoubleSide;
      for (let i = 0; i < 8; i += 1) {
        const piv = new THREE.Group();
        piv.position.set(0, 1.8, 0);
        piv.rotation.set(0, (i / 8) * Math.PI * 2, 0);
        const arm = new THREE.Group();
        arm.rotation.x = 0.9 + (i % 2) * 0.25;
        arm.add(mesh(new THREE.PlaneGeometry(0.22, 0.85), frond, [0, 0.42, 0]));
        piv.add(arm);
        g.add(piv);
        tick.push((t) => {
          arm.rotation.x = 0.9 + (i % 2) * 0.25 + Math.sin(t * 0.9 + i) * 0.03;
        });
      }
      break;
    }
  }
  return g;
}
