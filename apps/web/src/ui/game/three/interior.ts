import * as THREE from 'three';
import { finishById, type FinishDef, type HomeLook } from '../../../game/homeDecor';
import { M, mat, mesh, toonCanvas } from './kit';

/**
 * Отделка дома в 3D: рисунок обоев и пола (процедурные холсты), панели и плинтус,
 * шторы на окнах, ковёр и свет. Те же холсты — образцы в магазине ремонта.
 */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c: string): [number, number, number] => {
  const v = new THREE.Color(c);
  return [Math.round(v.r * 255), Math.round(v.g * 255), Math.round(v.b * 255)];
};
/** Цвет со сдвигом яркости k (−1…1) в CSS. */
const tone = (c: string, k: number, a = 1): string => {
  const [r, g, b] = hex(c);
  const f = (x: number): number => Math.max(0, Math.min(255, Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k))));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
};

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, a: number, size = 3): void {
  for (let i = 0; i < n; i += 1) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${a * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * size, 1 + r() * size);
  }
}

/** Неровное пятно (протечка, грязь, ободранный кусок). */
function blotch(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, r: () => number): void {
  ctx.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.7 + r() * 0.45;
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Рваный край: много мелких зубцов. */
function ragged(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, r: () => number): void {
  ctx.beginPath();
  const n = 46;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const k = (0.62 + r() * 0.5) * (0.85 + 0.25 * Math.sin(a * 3 + x));
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ─── Стены (холст — 4 м в ширину и вся высота стены 3 м) ─────────────────

const WALL_W = 1024;
const WALL_H = 768;
/** Сколько метров стены в одном повторе. */
export const WALL_TILE = 4;

const wallDraw: Record<string, (d: FinishDef) => Draw> = {
  peeling: (d) => (ctx, w, h, r) => {
    const base = d.look.color;
    const acc = d.look.accent ?? tone(base, -0.3);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Выцветший рисунок: полосы и ромбики.
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = tone(acc, 0.15, 0.35);
      ctx.fillRect(x + 26, 0, 12, h);
      for (let y = 20; y < h; y += 56) {
        ctx.fillStyle = tone(acc, 0, 0.35);
        ctx.beginPath();
        ctx.moveTo(x + 8, y);
        ctx.lineTo(x + 14, y + 8);
        ctx.lineTo(x + 8, y + 16);
        ctx.lineTo(x + 2, y + 8);
        ctx.fill();
      }
    }
    // Желтизна сверху и грязь у пола.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(120,90,30,0.18)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(0.92, 'rgba(60,45,25,0.18)');
    g.addColorStop(1, 'rgba(40,30,20,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Протечки сверху.
    for (let i = 0; i < 4; i += 1) {
      const x = r() * w;
      const rad = 40 + r() * 70;
      const st = ctx.createRadialGradient(x, 0, 4, x, 0, rad * 1.6);
      st.addColorStop(0, 'rgba(110,80,40,0.35)');
      st.addColorStop(0.7, 'rgba(110,80,40,0.15)');
      st.addColorStop(1, 'rgba(110,80,40,0)');
      ctx.fillStyle = st;
      ctx.fillRect(x - rad * 2, 0, rad * 4, rad * 2);
      ctx.strokeStyle = 'rgba(100,70,35,0.35)';
      ctx.lineWidth = 2;
      blotch(ctx, x, 6, rad, rad * 0.9, r);
      ctx.stroke();
    }
    // Стыки полотен — тёмные щели, края отходят.
    for (let x = 90 + r() * 40; x < w; x += 180 + r() * 60) {
      ctx.fillStyle = 'rgba(40,30,20,0.35)';
      ctx.fillRect(x, 0, 2, h);
      if (r() < 0.6) {
        const y0 = r() * h * 0.5;
        const len = 60 + r() * 140;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + 2, y0, 8, len);
        ctx.fillStyle = tone(base, 0.12);
        ctx.beginPath();
        ctx.moveTo(x + 2, y0);
        ctx.quadraticCurveTo(x + 18, y0 + len / 2, x + 2, y0 + len);
        ctx.lineTo(x + 6, y0 + len / 2);
        ctx.fill();
      }
    }
    // Ободранные куски: серая штукатурка с рваным краем (бумага по краю светлее).
    for (let i = 0; i < 4; i += 1) {
      const x = r() * w;
      const y = h * (0.35 + r() * 0.55);
      const rx = 30 + r() * 70;
      const ry = 20 + r() * 50;
      ctx.fillStyle = 'rgba(245,238,215,0.7)';
      ragged(ctx, x, y, rx + 6, ry + 6, r);
      ctx.fill();
      ctx.fillStyle = '#b3ad9f';
      ragged(ctx, x, y, rx, ry, r);
      ctx.fill();
      for (let k = 0; k < 40; k += 1) {
        ctx.fillStyle = `rgba(70,65,58,${0.2 * r()})`;
        ctx.fillRect(x - rx * 0.6 + r() * rx * 1.2, y - ry * 0.6 + r() * ry * 1.2, 2 + r() * 3, 2 + r() * 3);
      }
    }
    // Царапины и трещина.
    ctx.strokeStyle = 'rgba(60,50,40,0.45)';
    ctx.lineWidth = 1.5;
    let cx = r() * w;
    let cy = h * 0.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < 14; i += 1) {
      cx += (r() - 0.5) * 40;
      cy += 18 + r() * 16;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    speckle(ctx, w, h, r, 3000, 0.08);
  },
  plaster: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.12, 0.5);
      ctx.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 5);
    }
  },
  // Современные: большие арки-панели второго цвета (модный приём кафе).
  arches: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const acc = d.look.accent ?? tone(d.look.color, -0.12);
    // Холст — 4 м × 3 м: две арки на холст, низ — до пола, верх — полукруг на 2,2 м.
    for (const cx of [w * 0.25, w * 0.75]) {
      const aw = w * 0.16;
      const top = h * 0.3;
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(cx - aw, h);
      ctx.lineTo(cx - aw, top + aw);
      ctx.arc(cx, top + aw, aw, Math.PI, 0);
      ctx.lineTo(cx + aw, h);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 6000; i += 1) {
      ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.08, 0.35);
      ctx.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
    }
  },
  // Мелкий горошек.
  dots: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const acc = d.look.accent ?? tone(d.look.color, -0.2);
    for (let row = 0, y = 24; y < h + 20; row += 1, y += 48) {
      for (let x = row % 2 ? 24 : 0; x < w + 20; x += 48) {
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    speckle(ctx, w, h, r, 2000, 0.04);
  },
  // Кошачьи лапки и мордочки — милые обои для котокафе.
  paws: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const acc = d.look.accent ?? tone(d.look.color, -0.2);
    for (let row = 0, y = 50; y < h + 60; row += 1, y += 110) {
      for (let x = row % 2 ? 60 : 0; x < w + 60; x += 120) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((row * 7 + x) % 5) * 0.2 - 0.4);
        ctx.fillStyle = acc;
        if ((row + Math.round(x / 120)) % 3 === 0) {
          // Мордочка: голова и уши.
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.moveTo(-15, -6);
          ctx.lineTo(-12, -24);
          ctx.lineTo(-3, -14);
          ctx.moveTo(15, -6);
          ctx.lineTo(12, -24);
          ctx.lineTo(3, -14);
          ctx.fill();
          ctx.fillStyle = d.look.color;
          ctx.beginPath();
          ctx.arc(-6, -2, 2.5, 0, Math.PI * 2);
          ctx.arc(6, -2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 4, 11, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          for (const [tx, ty] of [[-12, -8], [-4, -14], [4, -14], [12, -8]] as const) {
            ctx.beginPath();
            ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    speckle(ctx, w, h, r, 2000, 0.04);
  },
  stripes: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const acc = d.look.accent ?? tone(d.look.color, -0.2);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = acc;
      ctx.fillRect(x, 0, 24, h);
      ctx.fillStyle = tone(acc, -0.25, 0.6);
      ctx.fillRect(x + 30, 0, 3, h);
      ctx.fillRect(x + 56, 0, 3, h);
    }
    speckle(ctx, w, h, r, 3000, 0.05);
  },
  floral: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const acc = d.look.accent ?? '#c98a8a';
    for (let row = 0, y = 30; y < h + 40; row += 1, y += 64) {
      for (let x = row % 2 ? 32 : 0; x < w + 40; x += 64) {
        ctx.strokeStyle = 'rgba(110,140,100,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.quadraticCurveTo(x + 6, y + 16, x - 2, y + 24);
        ctx.stroke();
        ctx.fillStyle = 'rgba(110,150,100,0.6)';
        ctx.beginPath();
        ctx.ellipse(x + 6, y + 16, 6, 3, 0.6, 0, Math.PI * 2);
        ctx.fill();
        for (let p = 0; p < 5; p += 1) {
          const a = (p / 5) * Math.PI * 2;
          ctx.fillStyle = tone(acc, (p % 2) * 0.1);
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5.5, 3.6, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f1d27a';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    speckle(ctx, w, h, r, 2500, 0.05);
  },
  brick: (d) => (ctx, w, h, r) => {
    const mortar = d.look.accent ?? '#d9cfc2';
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, w, h);
    // Кирпич 25 × 6,5 см: в холсте 4 м = 1024 пикселя.
    const bw = 64;
    const bh = 17;
    for (let row = 0, y = 0; y < h; row += 1, y += bh + 3) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw + 3) {
        ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.3);
        ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x, y + bh - 3, bw, 3);
        for (let k = 0; k < 6; k += 1) {
          ctx.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0,${0.06 * r()})`;
          ctx.fillRect(x + r() * bw, y + r() * bh, 3 + r() * 6, 2 + r() * 3);
        }
      }
    }
  },
  boards: (d) => (ctx, w, h, r) => {
    for (let x = 0; x < w; x += 48) {
      ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.18);
      ctx.fillRect(x, 0, 48, h);
      ctx.strokeStyle = 'rgba(50,30,15,0.18)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k += 1) {
        const gx = x + 4 + r() * 40;
        ctx.beginPath();
        for (let y = 0; y <= h; y += 16) ctx.lineTo(gx + Math.sin(y * 0.02 + k) * 2, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,18,8,0.5)';
      ctx.fillRect(x, 0, 2, h);
    }
  },
  marble: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.08, 0.6);
      ctx.fillRect(r() * w, r() * h, 3 + r() * 8, 3 + r() * 8);
    }
    veins(ctx, w, h, r, d.look.accent ?? '#b9b2a6', 9);
  },
};

function veins(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, color: string, n: number): void {
  for (let i = 0; i < n; i += 1) {
    let x = r() * w;
    let y = r() * h;
    const a = r() * Math.PI;
    ctx.strokeStyle = tone(color, 0, 0.25 + r() * 0.3);
    ctx.lineWidth = 0.8 + r() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 30; k += 1) {
      x += Math.cos(a + (r() - 0.5) * 1.4) * 14;
      y += Math.sin(a + (r() - 0.5) * 1.4) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ─── Пол (холст — 2,4 × 2,4 м) ─────────────────────────────────────────

const FLOOR_PX = 1024;
export const FLOOR_TILE = 2.4;

function planks(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, color: string, rows: number): void {
  const ph = h / rows;
  for (let row = 0; row < rows; row += 1) {
    const y = row * ph;
    let x = -r() * 600;
    while (x < w) {
      const len = 380 + r() * 420;
      const grd = ctx.createLinearGradient(0, y, 0, y + ph);
      const k = (r() - 0.5) * 0.22;
      grd.addColorStop(0, tone(color, k + 0.04));
      grd.addColorStop(1, tone(color, k - 0.06));
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, len, ph);
      ctx.lineWidth = 1;
      for (let g = 0; g < 12; g += 1) {
        const gy = y + 4 + r() * (ph - 8);
        const amp = 1 + r() * 3;
        const fq = 0.004 + r() * 0.01;
        ctx.strokeStyle = `rgba(50,30,15,${0.08 + r() * 0.12})`;
        ctx.beginPath();
        for (let px = 0; px <= len; px += 12) ctx.lineTo(x + px, gy + Math.sin(px * fq + g) * amp);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(35,22,10,0.6)';
      ctx.fillRect(x, y, 2, ph);
      x += len;
    }
    ctx.fillStyle = 'rgba(35,22,10,0.55)';
    ctx.fillRect(0, y, w, 2);
  }
}

const floorDraw: Record<string, (d: FinishDef) => Draw> = {
  linoleum: (d) => (ctx, w, h, r) => {
    const base = d.look.color;
    const acc = d.look.accent ?? tone(base, -0.25);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Рисунок «под плитку»: квадраты с ромбами, наполовину стёртые.
    const s = 256;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        ctx.strokeStyle = tone(acc, 0, 0.35);
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
        ctx.fillStyle = tone(acc, 0.05, 0.22);
        ctx.beginPath();
        ctx.moveTo(x + s / 2, y + 40);
        ctx.lineTo(x + s - 40, y + s / 2);
        ctx.lineTo(x + s / 2, y + s - 40);
        ctx.lineTo(x + 40, y + s / 2);
        ctx.fill();
      }
    }
    // Протёртые светлые дорожки и пятна.
    for (let i = 0; i < 6; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const rad = 80 + r() * 160;
      const g = ctx.createRadialGradient(x, y, 10, x, y, rad);
      g.addColorStop(0, 'rgba(225,205,165,0.45)');
      g.addColorStop(1, 'rgba(225,205,165,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = `rgba(55,35,20,${0.15 + r() * 0.15})`;
      blotch(ctx, r() * w, r() * h, 14 + r() * 30, 10 + r() * 22, r);
      ctx.fill();
    }
    // Царапины.
    ctx.lineWidth = 1;
    for (let i = 0; i < 120; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const a = r() * Math.PI;
      const l = 10 + r() * 60;
      ctx.strokeStyle = `rgba(240,225,195,${0.15 + r() * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    // Порванный край у шва.
    const sy = h * (0.3 + r() * 0.4);
    ctx.fillStyle = 'rgba(30,25,20,0.45)';
    ctx.fillRect(0, sy, w, 2);
    ctx.fillStyle = '#6e6a62';
    blotch(ctx, r() * w, sy + 6, 50, 9, r);
    ctx.fill();
    speckle(ctx, w, h, r, 6000, 0.08);
  },
  planks: (d) => (ctx, w, h, r) => planks(ctx, w, h, r, d.look.color, 6),
  parquet: (d) => (ctx, w, h, r) => planks(ctx, w, h, r, d.look.color, 8),
  herring: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = tone(d.look.color, -0.3);
    ctx.fillRect(0, 0, w, h);
    const L = 128;
    const W = 32;
    for (let col = -1; col < w / L + 1; col += 1) {
      for (let k = -2; k < h / W + 4; k += 1) {
        const x0 = col * L;
        const y0 = k * W;
        for (const side of [0, 1]) {
          ctx.save();
          ctx.translate(x0 + (side ? L / 2 : 0), y0 + (side ? W / 2 : 0));
          ctx.rotate(side ? -Math.PI / 4 : Math.PI / 4);
          ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.25);
          ctx.fillRect(0, 0, L * 0.7, W * 0.7);
          ctx.strokeStyle = 'rgba(40,25,12,0.45)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0, 0, L * 0.7, W * 0.7);
          ctx.restore();
        }
      }
    }
  },
  // Терраццо: светлая основа с разноцветной крошкой.
  terrazzo: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const chips = (d.look.accent ?? '#e9a9a0,#9cc3b0,#f2d08a,#c9c1e6').split(',');
    for (let i = 0; i < 1400; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const s0 = 3 + r() * (r() < 0.15 ? 16 : 7);
      ctx.fillStyle = tone(chips[i % chips.length]!, (r() - 0.5) * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, y - s0);
      ctx.lineTo(x + s0 * (0.6 + r() * 0.6), y - s0 * 0.2);
      ctx.lineTo(x + s0 * 0.3, y + s0 * (0.6 + r() * 0.4));
      ctx.lineTo(x - s0 * (0.6 + r() * 0.5), y + s0 * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    speckle(ctx, w, h, r, 6000, 0.06, 2);
  },
  // Шестиугольная плитка двух пастельных тонов.
  hexes: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = '#f4efe8';
    ctx.fillRect(0, 0, w, h);
    const R = 48;
    const dx = R * Math.sqrt(3);
    for (let row = -1, y = 0; y < h + R * 2; row += 1, y += R * 1.5) {
      for (let x = row % 2 ? dx / 2 : 0; x < w + dx; x += dx) {
        ctx.fillStyle = tone((x / dx + row) % 4 < 1 ? (d.look.accent ?? '#9cc3b0') : d.look.color, (r() - 0.5) * 0.05);
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = x + Math.cos(a) * (R - 3);
          const py = y + Math.sin(a) * (R - 3);
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    speckle(ctx, w, h, r, 2000, 0.04);
  },
  checker: (d) => (ctx, w, h, r) => {
    const s = 128;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const dark = ((x + y) / s) % 2 === 1;
        ctx.fillStyle = tone(dark ? (d.look.accent ?? '#3d4148') : d.look.color, (r() - 0.5) * 0.05);
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = 'rgba(160,160,160,0.6)';
        ctx.fillRect(x, y, s, 3);
        ctx.fillRect(x, y, 3, s);
      }
    }
    speckle(ctx, w, h, r, 2000, 0.05);
  },
  concrete: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const rad = 60 + r() * 200;
      const g = ctx.createRadialGradient(x, y, 5, x, y, rad);
      const k = r() < 0.5 ? 0 : 255;
      g.addColorStop(0, `rgba(${k},${k},${k},0.07)`);
      g.addColorStop(1, `rgba(${k},${k},${k},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    speckle(ctx, w, h, r, 9000, 0.12, 2);
    ctx.fillStyle = 'rgba(60,60,60,0.35)';
    ctx.fillRect(0, h / 2, w, 2);
    ctx.fillRect(w / 2, 0, 2, h);
  },
  marble: (d) => (ctx, w, h, r) => {
    const s = 256;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, s, s);
        ctx.clip();
        ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.06);
        ctx.fillRect(x, y, s, s);
        ctx.translate(x, y);
        veins(ctx, s, s, r, d.look.accent ?? '#a9a39a', 3);
        ctx.restore();
        ctx.fillStyle = 'rgba(150,145,135,0.6)';
        ctx.fillRect(x, y, s, 2);
        ctx.fillRect(x, y, 2, s);
      }
    }
  },
};

// ─── Ковры (холст 512 × 512 на весь ковёр) ─────────────────────────────

const rugDraw: Record<string, (d: FinishDef) => Draw> = {
  old: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 46) {
      ctx.fillStyle = tone(d.look.accent ?? '#5c4a3c', 0, 0.6);
      ctx.fillRect(x, 0, 14, h);
      ctx.fillStyle = 'rgba(170,120,80,0.35)';
      ctx.fillRect(x + 24, 0, 6, h);
    }
    // Протёртая середина и пятна.
    const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.45);
    g.addColorStop(0, 'rgba(210,190,160,0.45)');
    g.addColorStop(1, 'rgba(210,190,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = 'rgba(50,35,20,0.3)';
      blotch(ctx, r() * w, r() * h, 20 + r() * 30, 15 + r() * 20, r);
      ctx.fill();
    }
    // Бахрома по краям.
    ctx.strokeStyle = 'rgba(220,205,170,0.8)';
    ctx.lineWidth = 2;
    for (let x = 4; x < w; x += 8) {
      for (const y of [0, h]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 6, y === 0 ? 14 + r() * 6 : h - 14 - r() * 6);
        ctx.stroke();
      }
    }
    speckle(ctx, w, h, r, 3000, 0.15);
  },
  stripes: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    const acc = d.look.accent ?? '#3f5f7a';
    for (let y = 30; y < h - 30; y += 56) {
      ctx.fillStyle = acc;
      ctx.fillRect(20, y, w - 40, 18);
      ctx.fillStyle = tone(acc, 0.4);
      ctx.fillRect(20, y + 26, w - 40, 5);
    }
    speckle(ctx, w, h, r, 4000, 0.1);
  },
  persian: (d) => (ctx, w, h, r) => {
    const acc = d.look.accent ?? '#d9b46a';
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1d2c4a';
    ctx.strokeRect(42, 42, w - 84, h - 84);
    for (let x = 30; x < w - 20; x += 22) {
      for (const y of [32, h - 32]) {
        ctx.fillStyle = '#1d2c4a';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let k = 5; k > 0; k -= 1) {
      ctx.fillStyle = k % 2 ? acc : '#1d2c4a';
      ctx.beginPath();
      for (let i = 0; i <= 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const rr = k * 22 * (i % 2 ? 0.75 : 1);
        ctx.lineTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr);
      }
      ctx.fill();
    }
    ctx.restore();
    for (let i = 0; i < 24; i += 1) {
      ctx.fillStyle = tone(acc, -0.2, 0.7);
      const x = 70 + r() * (w - 140);
      const y = 70 + r() * (h - 140);
      if (Math.hypot((x - w / 2) / 1.5, y - h / 2) < 120) continue;
      ctx.beginPath();
      ctx.ellipse(x, y, 8, 4, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, w, h, r, 5000, 0.12);
  },
  fluffy: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9000; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const a = r() * Math.PI * 2;
      ctx.strokeStyle = tone(d.look.color, (r() - 0.6) * 0.25, 0.7);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      ctx.stroke();
    }
  },
  plain: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, r, 4000, 0.12);
  },
};

// ─── Кухонная плитка (холст — 1,2 × 1,2 м) ─────────────────────────────

export const KTILE = 1.2;

/** Плитка с затиркой, бликом и лёгкой неровностью тона. */
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, grout: string, r: () => number, gap = 4): void {
  ctx.fillStyle = grout;
  ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  const k = (r() - 0.5) * 0.08;
  g.addColorStop(0, tone(color, k + 0.08));
  g.addColorStop(1, tone(color, k - 0.06));
  ctx.fillStyle = g;
  ctx.fillRect(x + gap / 2, y + gap / 2, w - gap, h - gap);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + gap / 2, y + gap / 2, w - gap, Math.max(2, h * 0.06));
}

const tileDraw: Record<string, (d: FinishDef) => Draw> = {
  square: (d) => (ctx, w, h, r) => {
    const n = 8;
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) tile(ctx, (i * w) / n, (j * h) / n, w / n, h / n, d.look.color, d.look.accent ?? '#e5e2dc', r, 6);
  },
  subway: (d) => (ctx, w, h, r) => {
    const rows = 16;
    const th = h / rows;
    const tw = th * 2;
    for (let j = 0; j < rows; j += 1) for (let x = j % 2 ? -tw / 2 : 0; x < w; x += tw) tile(ctx, x, j * th, tw, th, d.look.color, d.look.accent ?? '#c4beb3', r, 5);
  },
  mosaic: (d) => (ctx, w, h, r) => {
    const n = 24;
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        const c = r() < 0.35 ? (d.look.accent ?? '#ffffff') : tone(d.look.color, (r() - 0.5) * 0.4);
        tile(ctx, (i * w) / n, (j * h) / n, w / n, h / n, c, '#e8ecec', r, 3);
      }
  },
  marble: (d) => (ctx, w, h, r) => {
    ctx.fillStyle = d.look.color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i += 1) {
      ctx.fillStyle = tone(d.look.color, (r() - 0.5) * 0.08, 0.6);
      ctx.fillRect(r() * w, r() * h, 3 + r() * 6, 3 + r() * 6);
    }
    veins(ctx, w, h, r, d.look.accent ?? '#a9a39a', 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 2, 0);
      ctx.lineTo((i * w) / 2, h);
      ctx.moveTo(0, (i * h) / 2);
      ctx.lineTo(w, (i * h) / 2);
      ctx.stroke();
    }
  },
  old: (d) => (ctx, w, h, r) => {
    const n = 8;
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        const x = (i * w) / n;
        const y = (j * h) / n;
        // Отвалившаяся плитка — серый цемент.
        if (r() < 0.06) {
          ctx.fillStyle = '#8f8a7c';
          ctx.fillRect(x, y, w / n, h / n);
          speckle(ctx, w / n, h / n, r, 40, 0.3);
          continue;
        }
        tile(ctx, x, y, w / n, h / n, tone(d.look.color, (r() - 0.5) * 0.12), d.look.accent ?? '#8f8676', r, 6);
      }
    // Трещины и пятна.
    ctx.strokeStyle = 'rgba(60,52,40,0.7)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i += 1) {
      let x = r() * w;
      let y = r() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k += 1) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.3) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = `rgba(110,85,40,${0.08 + r() * 0.1})`;
      blotch(ctx, r() * w, r() * h, 20 + r() * 40, 14 + r() * 30, r);
      ctx.fill();
    }
  },
};

// ─── Холсты и текстуры ─────────────────────────────────────────────────

const canvases = new Map<string, HTMLCanvasElement | null>();

function canvasOf(key: string, w: number, h: number, draw: Draw, seed: number): HTMLCanvasElement | null {
  if (canvases.has(key)) return canvases.get(key)!;
  if (typeof document === 'undefined') {
    canvases.set(key, null);
    return null;
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) {
    canvases.set(key, null);
    return null;
  }
  draw(ctx, w, h, seeded(seed));
  // Мульт-стиль: рисунок отделки — плоскими заливками.
  toonCanvas(c, 0.6, w > 600 ? 2.5 : 1.4);
  canvases.set(key, c);
  return c;
}

const seedOf = (id: string): number => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

function finishCanvas(d: FinishDef): HTMLCanvasElement | null {
  if (d.kind === 'wall') return canvasOf(d.id, WALL_W, WALL_H, (wallDraw[d.look.style] ?? wallDraw.plaster!)(d), seedOf(d.id));
  if (d.kind === 'floor') return canvasOf(d.id, FLOOR_PX, FLOOR_PX, (floorDraw[d.look.style] ?? floorDraw.planks!)(d), seedOf(d.id));
  if (d.kind === 'rug') return canvasOf(d.id, 512, 512, (rugDraw[d.look.style] ?? rugDraw.plain!)(d), seedOf(d.id));
  if (d.kind === 'kitchen') return canvasOf(d.id, 512, 512, (tileDraw[d.look.style] ?? tileDraw.square!)(d), seedOf(d.id));
  return null;
}

/** Новая текстура из холста отделки (её можно освобождать вместе со сценой — холст остаётся). */
function textureOf(d: FinishDef, rx: number, ry: number): THREE.CanvasTexture | null {
  const c = finishCanvas(d);
  if (!c) return null;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

/** Материал с рисунком отделки (без холста — просто цвет). */
function finishMat(d: FinishDef, rx: number, ry: number, rough: number): THREE.MeshStandardMaterial {
  const t = textureOf(d, rx, ry);
  const m = mat(t ? '#ffffff' : d.look.color, rough);
  if (t) m.map = t;
  return m;
}

// ─── Образцы для магазина ─────────────────────────────────────────────

const swatches = new Map<string, string>();

/** Картинка-образец отделки (data URL) для магазина ремонта. */
export function finishSwatch(id: string, size = 120): string | null {
  const key = `${id}|${size}`;
  if (swatches.has(key)) return swatches.get(key)!;
  const d = finishById(id);
  if (!d || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const src = finishCanvas(d);
  const s = size;
  if (src && d.kind === 'wall') ctx.drawImage(src, 0, 0, src.width * 0.3, src.height * 0.4, 0, 0, s, s);
  else if (src && d.kind === 'kitchen') ctx.drawImage(src, 0, 0, src.width * 0.5, src.height * 0.5, 0, 0, s, s);
  else if (d.kind === 'window' || d.kind === 'door') drawOpeningSwatch(ctx, d, s);
  else if (src && d.kind === 'floor') ctx.drawImage(src, 0, 0, src.width * 0.5, src.height * 0.5, 0, 0, s, s);
  else if (d.kind === 'rug') {
    ctx.fillStyle = '#c9b79c';
    ctx.fillRect(0, 0, s, s);
    if (d.look.style !== 'none') {
      ctx.save();
      const round = d.look.style === 'oval' || d.look.style === 'round';
      ctx.beginPath();
      if (round) ctx.ellipse(s / 2, s / 2, s * 0.42, s * (d.look.style === 'oval' ? 0.3 : 0.42), 0, 0, Math.PI * 2);
      else ctx.rect(s * 0.1, s * 0.2, s * 0.8, s * 0.6);
      ctx.clip();
      if (src) ctx.drawImage(src, 0, 0, s, s);
      else {
        ctx.fillStyle = d.look.color;
        ctx.fillRect(0, 0, s, s);
        if (d.look.accent) {
          ctx.strokeStyle = d.look.accent;
          ctx.lineWidth = s * 0.06;
          ctx.beginPath();
          ctx.ellipse(s / 2, s / 2, s * 0.38, s * (d.look.style === 'oval' ? 0.26 : 0.38), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(s * 0.15, s * 0.25, s * 0.7, s * 0.5);
    }
  } else if (d.kind === 'trim') {
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(0, 0, s, s);
    const style = d.look.style;
    if (style === 'panels' || style === 'molding') {
      ctx.fillStyle = d.look.color;
      ctx.fillRect(0, s * 0.35, s, s * 0.65);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, s * 0.33, s, s * 0.05);
      if (style === 'molding') {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 3;
        ctx.strokeRect(s * 0.12, s * 0.48, s * 0.32, s * 0.36);
        ctx.strokeRect(s * 0.56, s * 0.48, s * 0.32, s * 0.36);
      }
    }
    ctx.fillStyle = style === 'panels' || style === 'molding' ? '#f7f5f0' : d.look.color;
    ctx.fillRect(0, s * 0.86, s, s * 0.14);
    if (style === 'old') {
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = 'rgba(230,220,200,0.6)';
        ctx.fillRect(Math.random() * s, s * (0.86 + Math.random() * 0.1), 4 + Math.random() * 10, 3);
      }
    }
  } else if (d.kind === 'curtains') {
    ctx.fillStyle = '#9fc4e6';
    ctx.fillRect(s * 0.2, s * 0.15, s * 0.6, s * 0.65);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s * 0.49, s * 0.15, s * 0.02, s * 0.65);
    ctx.fillStyle = '#5b5b5b';
    ctx.fillRect(s * 0.05, s * 0.08, s * 0.9, s * 0.04);
    if (d.look.style === 'blinds') {
      for (let y = s * 0.15; y < s * 0.8; y += s * 0.06) {
        ctx.fillStyle = d.look.color;
        ctx.fillRect(s * 0.18, y, s * 0.64, s * 0.04);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(s * 0.18, y + s * 0.04, s * 0.64, s * 0.01);
      }
    } else {
      const panels = d.look.style === 'old' ? [0.08] : [0.08, 0.72];
      for (const x of panels) {
        const grd = ctx.createLinearGradient(s * x, 0, s * (x + 0.2), 0);
        for (let k = 0; k <= 4; k += 1) grd.addColorStop(k / 4, tone(d.look.color, k % 2 ? -0.15 : 0.05));
        ctx.fillStyle = grd;
        ctx.fillRect(s * x, s * 0.1, s * 0.2, d.look.style === 'old' ? s * 0.62 : s * 0.85);
      }
      if (d.look.style === 'old') {
        ctx.fillStyle = 'rgba(90,70,30,0.3)';
        ctx.fillRect(s * 0.1, s * 0.5, s * 0.12, s * 0.08);
      }
      if (d.look.accent) {
        ctx.fillStyle = d.look.accent;
        ctx.fillRect(s * 0.08, s * 0.5, s * 0.2, s * 0.03);
        ctx.fillRect(s * 0.72, s * 0.5, s * 0.2, s * 0.03);
      }
    }
  } else if (d.kind === 'light') {
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s * 0.55, 2, s / 2, s * 0.55, s * 0.5);
    g.addColorStop(0, tone(d.look.color, 0, 0.95));
    g.addColorStop(1, tone(d.look.color, 0, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s * 0.45);
    ctx.stroke();
    if (d.look.style === 'chandelier') {
      ctx.strokeStyle = d.look.accent ?? '#d4af37';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s / 2, s * 0.55, s * 0.25, s * 0.07, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 5; i += 1) {
        ctx.fillStyle = '#fff6dc';
        ctx.beginPath();
        ctx.arc(s * 0.25 + i * s * 0.125, s * 0.5, s * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (d.look.style === 'led') {
      ctx.fillStyle = d.look.accent ?? '#8a6cff';
      ctx.fillRect(0, s * 0.12, s, s * 0.04);
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.55, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.look.style === 'bulb') {
      ctx.fillStyle = '#fff3c8';
      ctx.beginPath();
      ctx.ellipse(s / 2, s * 0.56, s * 0.06, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#f7f3ea';
      ctx.beginPath();
      ctx.ellipse(s / 2, s * 0.5, s * 0.22, s * 0.08, 0, Math.PI, 0);
      ctx.fill();
    }
  }
  const url = c.toDataURL('image/png');
  swatches.set(key, url);
  return url;
}

/** Образец окна или двери: плоский рисунок проёма. */
function drawOpeningSwatch(ctx: CanvasRenderingContext2D, d: FinishDef, s: number): void {
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 0, s, s);
  const st = d.look.style;
  if (d.kind === 'window') {
    ctx.fillStyle = '#bfe0f7';
    ctx.fillRect(s * 0.16, s * 0.14, s * 0.68, s * 0.6);
    ctx.strokeStyle = st === 'old' ? '#b9ae96' : d.look.color === '#ffffff' ? '#ffffff' : d.look.color;
    ctx.lineWidth = st === 'loft' ? s * 0.025 : s * 0.05;
    ctx.strokeRect(s * 0.16, s * 0.14, s * 0.68, s * 0.6);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.14);
    ctx.lineTo(s * 0.5, s * 0.74);
    if (st === 'loft') {
      for (const k of [0.33, 0.67]) {
        ctx.moveTo(s * 0.16, s * (0.14 + 0.6 * k));
        ctx.lineTo(s * 0.84, s * (0.14 + 0.6 * k));
        ctx.moveTo(s * (0.16 + 0.68 * (k - 0.165)), s * 0.14);
        ctx.lineTo(s * (0.16 + 0.68 * (k - 0.165)), s * 0.74);
      }
    }
    ctx.stroke();
    ctx.fillStyle = st === 'wood' ? d.look.color : st === 'old' ? '#c8bea8' : '#f6f4ef';
    ctx.fillRect(s * 0.1, s * 0.74, s * 0.8, s * (st === 'garden' ? 0.09 : 0.06));
    if (st === 'garden') {
      for (const x of [0.25, 0.5, 0.75]) {
        ctx.fillStyle = '#b5603c';
        ctx.fillRect(s * (x - 0.05), s * 0.66, s * 0.1, s * 0.08);
        ctx.fillStyle = d.look.accent ?? '#4f8a4a';
        ctx.beginPath();
        ctx.arc(s * x, s * 0.62, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (st === 'old') {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s * 0.55, s * 0.2);
      ctx.lineTo(s * 0.7, s * 0.4);
      ctx.lineTo(s * 0.65, s * 0.5);
      ctx.stroke();
    }
    return;
  }
  // Дверь.
  ctx.fillStyle = st === 'old' ? '#8a7a64' : '#d8d2c6';
  ctx.fillRect(s * 0.22, s * 0.06, s * 0.56, s * 0.94);
  ctx.fillStyle = d.look.color;
  ctx.fillRect(s * 0.27, s * 0.1, s * 0.46, s * 0.9);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 2;
  if (st === 'panel' || st === 'wood') {
    ctx.strokeRect(s * 0.33, s * 0.16, s * 0.34, s * 0.32);
    ctx.strokeRect(s * 0.33, s * 0.56, s * 0.34, s * 0.36);
  } else if (st === 'steel') {
    for (let y = 0.2; y < 0.95; y += 0.12) {
      ctx.beginPath();
      ctx.moveTo(s * 0.3, s * y);
      ctx.lineTo(s * 0.7, s * y);
      ctx.stroke();
    }
  } else if (st === 'glass') {
    ctx.fillStyle = d.look.accent ?? '#bfe6f2';
    for (const y of [0.16, 0.42, 0.68]) ctx.fillRect(s * 0.34, s * y, s * 0.32, s * 0.2);
  } else if (st === 'old') {
    ctx.fillStyle = '#4a3a2c';
    ctx.fillRect(s * 0.31, s * 0.16, s * 0.38, s * 0.34);
    ctx.fillRect(s * 0.31, s * 0.56, s * 0.38, s * 0.36);
    ctx.fillStyle = '#a59478';
    ctx.fillRect(s * 0.3, s * 0.2, s * 0.06, s * 0.08);
  }
  ctx.fillStyle = st === 'steel' ? d.look.accent ?? '#c9ced4' : st === 'old' ? '#8a8a80' : '#d4af37';
  ctx.beginPath();
  ctx.arc(s * 0.66, s * 0.56, s * 0.025, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Сборка отделки в сцене ────────────────────────────────────────────

export interface RoomRect {
  w: number;
  d: number;
  cx: number;
  cz: number;
}

const H = 3;
const pick = (id: string, fallback: string): FinishDef => finishById(id) ?? finishById(fallback)!;

/** Пол комнаты с рисунком отделки. */
export function floorMesh(look: HomeLook, room: RoomRect): THREE.Mesh {
  const d = pick(look.decor.floor, 'floor_parquet');
  const m = finishMat(d, room.w / FLOOR_TILE, room.d / FLOOR_TILE, d.look.style === 'marble' || d.look.style === 'checker' ? 0.3 : d.look.style === 'linoleum' ? 0.55 : 0.62);
  const floor = mesh(new THREE.PlaneGeometry(room.w, room.d), m, [room.cx, 0, room.cz]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  return floor;
}

/** Стены (задняя и боковые) с обоями, панелями и плинтусом. */
export function roomWalls(look: HomeLook, room: RoomRect): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = room;
  const wd = pick(look.decor.wall, 'wall_plaster');
  const rough = wd.look.style === 'marble' ? 0.45 : 0.95;
  const back = finishMat(wd, (w + 0.3) / WALL_TILE, 1, rough);
  const side = finishMat(wd, (d + 0.15) / WALL_TILE, 1, rough);
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, H, 0.15), back, [0, H / 2, -d / 2 - 0.07]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.15, H, d + 0.15), side, [(sx * (w + 0.15)) / 2, H / 2, 0]));
  const td = pick(look.decor.trim, 'trim_white');
  const style = td.look.style;
  if (style === 'panels' || style === 'molding') {
    // Панели до 0,9 м с поручнем (у молдинга — рамки нарисованы на панели).
    const panel = (len: number): THREE.Material => {
      const m = mat(td.look.color, style === 'molding' ? 0.55 : 0.7);
      if (style === 'molding' && typeof document !== 'undefined') {
        const c = canvasOf('molding', 256, 128, (ctx, cw, ch) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 5;
          ctx.strokeRect(22, 22, cw - 44, ch - 40);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(27, 27, cw - 54, ch - 50);
        }, 1);
        if (c) {
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.set(len / 1.4, 1);
          m.map = t;
        }
      }
      return m;
    };
    g.add(mesh(new THREE.BoxGeometry(w, 0.9, 0.03), panel(w), [0, 0.45, -d / 2 + 0.015]));
    for (const sx of [-1, 1]) {
      const p = mesh(new THREE.BoxGeometry(d, 0.9, 0.03), panel(d), [sx * (w / 2 - 0.015), 0.45, 0]);
      p.rotation.y = Math.PI / 2;
      g.add(p);
    }
    const rail = mat('#ffffff', 0.5);
    g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.05), rail, [0, 0.92, -d / 2 + 0.03]));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, d), rail, [sx * (w / 2 - 0.03), 0.92, 0]));
  }
  const old = style === 'old';
  const base = old ? M.wood(td.look.color, 4, 1) : mat(style === 'panels' || style === 'molding' ? '#f7f5f0' : td.look.color, 0.55);
  const bh = old ? 0.09 : 0.12;
  g.add(mesh(new THREE.BoxGeometry(w, bh, 0.05), base, [0, bh / 2, -d / 2 + 0.04]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, bh, d), base, [sx * (w / 2 - 0.04), bh / 2, 0]));
  if (old) {
    // Отбитые куски плинтуса — светлые сколы.
    const chip = mat('#c9b48e', 0.9);
    for (let i = 0; i < Math.round(w / 1.6); i += 1) g.add(mesh(new THREE.BoxGeometry(0.12 + (i % 3) * 0.06, 0.03, 0.055), chip, [-w / 2 + 0.8 + i * 1.6 + (i % 2) * 0.4, 0.07, -d / 2 + 0.04]));
  }
  // Светодиодная подсветка под потолком.
  const ld = pick(look.decor.light, 'light_warm');
  if (ld.look.style === 'led') {
    const strip = M.glow(ld.look.accent ?? '#8a6cff', 2.2);
    g.add(mesh(new THREE.BoxGeometry(w - 0.1, 0.04, 0.06), strip, [0, H - 0.08, -d / 2 + 0.05]));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, d - 0.1), strip, [sx * (w / 2 - 0.05), H - 0.08, 0]));
  }
  return g;
}

/** Шторы у окна (окно 1,7 × 1,4 м; группа окна смотрит на +Z). old — окно в старой раме. */
export function curtains(look: HomeLook, w: number, h: number, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const cd = pick(look.decor.curtains, 'curt_linen');
  const style = cd.look.style;
  const rod = cd.look.accent ? M.gold() : mat('#5b5b5b', 0.4, 0.6);
  if (style !== 'old') g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, w + 0.9, 8), rod, [0, h / 2 + 0.22, 0.12]).rotateZ(Math.PI / 2));
  if (style === 'blinds') {
    const slat = mat(cd.look.color, 0.5);
    for (let y = h / 2 - 0.05; y > -h / 2 + 0.25; y -= 0.09) g.add(mesh(new THREE.BoxGeometry(w + 0.04, 0.012, 0.06), slat, [0, y, 0.07]).rotateX(-0.6));
    return g;
  }
  const cloth = M.cloth(cd.look.color, 3, style === 'old' ? 0.98 : 0.92);
  // Складки: ряд узких полос с чередующимся выступом.
  const panel = (x: number, width: number, height: number, sag = 0): THREE.Group => {
    const p = new THREE.Group();
    const n = 5;
    for (let i = 0; i < n; i += 1) {
      const fold = mesh(new THREE.BoxGeometry(width / n + 0.01, height - (i % 2) * sag, 0.05), cloth, [x - width / 2 + (i + 0.5) * (width / n), -0.1 - ((i % 2) * sag) / 2, 0.1 + (i % 2) * 0.03]);
      p.add(fold);
    }
    return p;
  };
  if (style === 'old') {
    // Одна выцветшая штора, короткая и косо висит на леске.
    const p = panel(-w / 2 - 0.18, 0.5, h + 0.2, 0.12);
    p.rotation.z = 0.04;
    g.add(p);
    g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, w + 0.8, 4), mat('#d0d0d0', 0.4), [0, h / 2 + 0.2, 0.12]).rotateZ(Math.PI / 2 - 0.02));
    // Выгоревшие пятна.
    g.add(mesh(new THREE.PlaneGeometry(0.2, 0.25), mat('#a8955f', 0.98), [-w / 2 - 0.2, 0, 0.132]));
    return g;
  }
  for (const sx of [-1, 1]) g.add(panel(sx * (w / 2 + 0.25), 0.42, h + 0.5));
  if (cd.look.accent) for (const sx of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), M.gold(), [sx * (w / 2 + 0.25), -0.15, 0.16]).rotateX(Math.PI / 2));
  void night;
  return g;
}

/** Ковёр перед диваном (центр — в точке x, z). */
export function rugMesh(look: HomeLook, x: number, z: number): THREE.Object3D | null {
  const d = pick(look.decor.rug, 'rug_none');
  const st = d.look.style;
  if (st === 'none') return null;
  if (st === 'oval' || st === 'round') {
    const g = new THREE.Group();
    const sx = st === 'oval' ? 1.5 : 1.2;
    const sz = st === 'oval' ? 1.05 : 1.2;
    const rug = mesh(new THREE.CircleGeometry(1.4, 48), M.cloth(d.look.color, 3), [x, 0.008, z]);
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(sx, sz, 1);
    rug.receiveShadow = true;
    const rim = mesh(new THREE.RingGeometry(1.25, 1.4, 48), M.cloth(d.look.accent ?? d.look.color, 3), [x, 0.01, z]);
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(sx, sz, 1);
    g.add(rug, rim);
    return g;
  }
  const size: [number, number] = st === 'old' ? [2.2, 1.5] : st === 'persian' ? [3.4, 2.4] : st === 'fluffy' ? [2.6, 1.9] : [3.0, 2.1];
  const m = finishMat(d, 1, 1, st === 'fluffy' ? 1 : 0.95);
  if (st === 'fluffy') m.bumpMap = m.map;
  const rug = mesh(new THREE.PlaneGeometry(size[0], size[1]), m, [x, st === 'fluffy' ? 0.014 : 0.008, z]);
  rug.rotation.x = -Math.PI / 2;
  if (st === 'old') rug.rotation.z = 0.08;
  rug.receiveShadow = true;
  return rug;
}

/** Свет: лампы под потолком в точках spots. Возвращает группу (лампы и видимые светильники). */
export function roomLights(look: HomeLook, spots: ReadonlyArray<[number, number]>, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const d = pick(look.decor.light, 'light_warm');
  const st = d.look.style;
  const color = d.look.color;
  if (st === 'bulb') {
    // Голая лампочка на проводе: тусклая и жёлтая, вечером слегка мерцает.
    const glass = M.glow('#fff1c4', night ? 2.5 : 0.8);
    const cord = mat('#1b1b1b', 0.6);
    const ticks: Array<(t: number, minute: number, night: boolean) => void> = [];
    for (const [x, z] of spots) {
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), cord, [x, H - 0.35, z]));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 10), mat('#3a3a3a', 0.5, 0.4), [x, H - 0.72, z]));
      g.add(mesh(new THREE.SphereGeometry(0.055, 14, 10), glass, [x, H - 0.8, z], [1, 1.25, 1]));
      const lamp = new THREE.PointLight(color, night ? 8 : 1.6, 9, 1.8);
      lamp.position.set(x, H - 0.85, z);
      g.add(lamp);
      const halo = lampHalo('#ffd590', night ? 1.1 : 0.5, night ? 0.75 : 0.3);
      if (halo) {
        halo.position.set(x, H - 0.8, z);
        g.add(halo);
      }
      ticks.push((t, _m, n) => {
        lamp.intensity = (n ? 8 : 1.6) * (0.92 + 0.08 * Math.sin(t * 23) * Math.sin(t * 3.7));
      });
    }
    g.userData.tick = ticks;
    return g;
  }
  if (st === 'globes') {
    // Подвесные шары-плафоны на латунных крышках: днём мягко светятся, вечером — тепло.
    const glass = M.glow('#fff4e2', night ? 2.0 : 0.9);
    const brass = mat('#c9a24a', 0.35, 0.8);
    // Светлый тонкий шнур: близко к камере не превращается в тёмную полосу.
    const cord = mat('#d8c8b4', 0.6);
    for (const [x, z] of spots) {
      for (const [ox, drop] of [[-0.35, 0.95], [0, 0.75], [0.35, 1.05]] as const) {
        // Без мульт-контура и теней: тонкий шнур с контуром у камеры выглядит толстой чёрной полосой.
        for (const m of [
          mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 6), cord, [x + ox, H - drop / 2, z]),
          mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.06, 12), brass, [x + ox, H - drop - 0.02, z]),
          mesh(new THREE.SphereGeometry(0.13, 18, 14), glass, [x + ox, H - drop - 0.15, z]),
        ]) {
          m.userData.noOutline = true;
          m.castShadow = false;
          g.add(m);
        }
      }
      const lamp = new THREE.PointLight(color, night ? 9 : 2.5, 11, 1.7);
      lamp.position.set(x, H - 1.0, z);
      g.add(lamp);
      if (night) {
        const halo = lampHalo(color, 1.3, 0.45);
        if (halo) {
          halo.position.set(x, H - 1.0, z);
          g.add(halo);
        }
      }
    }
    return g;
  }
  const k = st === 'chandelier' ? 1.25 : st === 'led' ? 1.1 : 1;
  for (const [x, z] of spots) {
    const lamp = new THREE.PointLight(color, (night ? 9 : 2.5) * k, 11, 1.7);
    lamp.position.set(x, 2.85, z);
    g.add(lamp);
    if (night && st !== 'chandelier') {
      const halo = lampHalo(color, 1.4, 0.45);
      if (halo) {
        halo.position.set(x, 2.9, z);
        g.add(halo);
      }
    }
  }
  if (st === 'chandelier') {
    const [x, z] = spots[0] ?? [0, 0];
    const gold = M.gold();
    const ch = new THREE.Group();
    ch.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), gold, [0, 0.25, 0]));
    const ring = mesh(new THREE.TorusGeometry(0.32, 0.018, 8, 32), gold, [0, 0, 0]);
    ring.rotation.x = Math.PI / 2;
    ch.add(ring);
    const flame = M.glow('#fff4d6', night ? 2.4 : 1.1);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      ch.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), mat('#f6f1e4', 0.5), [Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32]));
      ch.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), flame, [Math.cos(a) * 0.32, 0.13, Math.sin(a) * 0.32], [1, 1.5, 1]));
    }
    ch.position.set(x, H - 0.55, z);
    g.add(ch);
    if (night) {
      const halo = lampHalo('#ffe2a8', 1.8, 0.55);
      if (halo) {
        halo.position.set(x, H - 0.45, z);
        g.add(halo);
      }
    }
  }
  return g;
}

export { H as ROOM_H };

// ─── Кухня, окна, дверь ───────────────────────────────────────────────

/** Кухонная зона: плитка на полу (w×d м, центр в начале координат) и фартук на стене. */
export function kitchenTiles(look: HomeLook, w: number, d: number, backZ: number): THREE.Group {
  const g = new THREE.Group();
  const def = pick(look.decor.kitchen, 'ktile_blue');
  const old = def.look.style === 'old';
  const floorMat = finishMat(def, w / KTILE, d / KTILE, old ? 0.6 : def.look.style === 'marble' ? 0.25 : 0.35);
  const tiles = mesh(new THREE.PlaneGeometry(w, d), floorMat, [0, 0.004, backZ + d / 2]);
  tiles.rotation.x = -Math.PI / 2;
  tiles.receiveShadow = true;
  g.add(tiles);
  // Фартук: та же плитка, глянцевая; полка-бортик снизу.
  const bw = w - 0.1;
  const back = mesh(new THREE.PlaneGeometry(bw, 0.7), finishMat(def, bw / KTILE, 0.7 / KTILE, old ? 0.55 : 0.18), [0, 1.25, backZ + 0.02]);
  g.add(back);
  g.add(mesh(new THREE.BoxGeometry(bw, 0.03, 0.03), mat(old ? '#9c9580' : '#e9e6df', 0.4), [0, 0.89, backZ + 0.035]));
  return g;
}

/** Стиль окна: рама, подоконник, дополнительные переплёты и цветы. */
export function windowStyle(look: HomeLook): { old: boolean; frame: THREE.Material; extra(w: number, h: number): THREE.Object3D | null } {
  const def = pick(look.decor.window, 'win_pvc');
  const st = def.look.style;
  const frame = st === 'old' ? M.wood('#d8d0bc', 2, 1) : st === 'wood' ? M.wood(def.look.color, 2, 1) : st === 'loft' ? mat(def.look.color, 0.35, 0.6) : mat(def.look.color, 0.4);
  return {
    old: st === 'old',
    frame,
    extra(w, h) {
      const g = new THREE.Group();
      if (st === 'loft') {
        // Мелкая расстекловка, как в лофте.
        for (const k of [-1 / 3, 1 / 3]) g.add(mesh(new THREE.BoxGeometry(w, 0.025, 0.04), frame, [0, k * h, 0.03]));
        for (const k of [-0.25, 0.25]) g.add(mesh(new THREE.BoxGeometry(0.025, h, 0.04), frame, [k * w, 0, 0.03]));
      }
      if (st === 'garden') {
        // Глубокий подоконник с горшками.
        g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.06, 0.38), mat('#f4f1ea', 0.4), [0, -h / 2 - 0.05, 0.19]));
        [-0.55, 0, 0.55].forEach((x, i) => {
          g.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.14, 12), mat('#b5603c', 0.8), [x, -h / 2 + 0.05, 0.2]));
          const leaf = mat(['#4f8a4a', '#6aa05a', '#3d7a5c'][i]!, 0.8);
          for (let k = 0; k < 5; k += 1) {
            const a = (k / 5) * Math.PI * 2;
            g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), leaf, [x + Math.cos(a) * 0.05, -h / 2 + 0.19 + (k % 2) * 0.05, 0.2 + Math.sin(a) * 0.05]));
          }
        });
      }
      return g.children.length ? g : null;
    },
  };
}

/** Входная дверь по отделке (стоит на полу, смотрит на +Z; ширина 1,1 м). */
export function doorModel(look: HomeLook): THREE.Group | null {
  const def = pick(look.decor.door, 'door_oak');
  const st = def.look.style;
  if (st === 'old') return null;
  const g = new THREE.Group();
  const frameM = mat(st === 'steel' ? '#2b2f35' : st === 'glass' ? '#1f2828' : '#ece8df', 0.5);
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.1, 0.14), frameM, [0, 2.25, 0]));
  for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.1, 2.3, 0.14), frameM, [x, 1.15, 0]));
  const leafM = st === 'wood' ? M.wood(def.look.color, 1, 2) : st === 'steel' ? mat(def.look.color, 0.35, 0.7) : mat(def.look.color, 0.45);
  g.add(mesh(new THREE.BoxGeometry(1.1, 2.2, 0.07), leafM, [0, 1.1, 0]));
  const inset = st === 'wood' ? M.wood(new THREE.Color(def.look.color).multiplyScalar(0.85).getStyle(), 1, 2) : mat(new THREE.Color(def.look.color).multiplyScalar(0.92).getStyle(), 0.5);
  if (st === 'panel' || st === 'wood') {
    for (const [y, h] of [[1.6, 0.75], [0.6, 0.85]] as const) {
      g.add(mesh(new THREE.BoxGeometry(0.78, h, 0.02), inset, [0, y, 0.045]));
      g.add(mesh(new THREE.BoxGeometry(0.7, h - 0.08, 0.02), leafM, [0, y, 0.055]));
    }
  } else if (st === 'steel') {
    for (let i = 0; i < 6; i += 1) g.add(mesh(new THREE.BoxGeometry(0.9, 0.015, 0.01), mat('#1f2328', 0.4, 0.6), [0, 0.35 + i * 0.3, 0.04]));
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), mat('#c9ced4', 0.2, 1), [0, 1.55, 0.05]).rotateX(Math.PI / 2));
  } else if (st === 'glass') {
    const glass = mat(def.look.accent ?? '#bfe6f2', 0.05, 0.1, { transparent: true, opacity: 0.75 });
    for (const y of [1.75, 1.15, 0.55]) g.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.02), glass, [0, y, 0.04]));
  }
  // Ручка и накладка.
  const metal = st === 'steel' ? mat('#c9ced4', 0.25, 1) : M.gold();
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.02), metal, [0.42, 1.05, 0.045]));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.025, 0.025), metal, [0.38, 1.1, 0.07]));
  return g;
}

// ─── Мягкое затенение углов и ореолы ламп ─────────────────────────────

let aoTex: THREE.CanvasTexture | null = null;
function aoTexture(): THREE.CanvasTexture | null {
  if (aoTex) return aoTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  aoTex = new THREE.CanvasTexture(c);
  aoTex.userData.shared = true;
  return aoTex;
}

/**
 * Запечённое «затенение» (вместо дорогого SSAO): тёмная полоса на полу вдоль стен и
 * снизу на стенах — комната выглядит объёмнее, мебель и стены «стоят» на полу.
 * Стены: задняя (z = −d/2) и две боковые; центр комнаты в начале координат.
 */
export function roomOcclusion(w: number, d: number, strength = 1): THREE.Group {
  const g = new THREE.Group();
  const t = aoTexture();
  if (!t) return g;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: strength, polygonOffset: true, polygonOffsetFactor: -2 });
  const floorStrip = (len: number, x: number, z: number, ry: number): void => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), m);
    p.rotation.set(-Math.PI / 2, 0, ry);
    p.position.set(x, 0.006, z);
    p.renderOrder = 1;
    g.add(p);
  };
  // Полоса текстуры тёмная со стороны v=1 (верх холста) — разворачиваем к стене.
  floorStrip(w, 0, -d / 2 + 0.45, 0);
  floorStrip(d, -w / 2 + 0.45, 0, Math.PI / 2);
  floorStrip(d, w / 2 - 0.45, 0, -Math.PI / 2);
  const wallStrip = (len: number, x: number, z: number, ry: number): void => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.6), m);
    p.rotation.set(0, ry, Math.PI);
    p.position.set(x, 0.3, z);
    p.renderOrder = 1;
    g.add(p);
  };
  wallStrip(w, 0, -d / 2 + 0.005, 0);
  wallStrip(d, -w / 2 + 0.005, 0, Math.PI / 2);
  wallStrip(d, w / 2 - 0.005, 0, -Math.PI / 2);
  return g;
}

let haloTex: THREE.CanvasTexture | null = null;
/** Мягкий ореол вокруг светильника (аддитивный спрайт — дешёвая замена bloom). */
export function lampHalo(color: string, size: number, opacity: number): THREE.Sprite | null {
  if (!haloTex) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
    haloTex.userData.shared = true;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(size);
  return sp;
}
