import * as THREE from 'three';
import { PETS, blocked, dist, resolve, type Box, type P2, type PlayParts, type Placed } from '../../../game/lifeMap';
import type { CatBreed, ObjectId } from '../../../game/lifeTypes';
import { buildCat, buildToy, catLookKey, poseCat, type Cat3D, type CatMode } from './cats3d';
import { loadCatModel } from './catGlb';
import { disposeObject } from './kit';

/**
 * Жизнь кошек в доме: у каждой — план из шагов (дойти, повернуться, побыть в позе,
 * прыгнуть, поохотиться на игрушку, потереться о другую кошку). Одной кошкой управляет
 * игрок (стик, касание пола, действия у предметов — кошка сама подходит и делает их), остальные
 * живут сами по потребностям из сохранения: голодная идёт к миске и ест, «приспичило» — в лоток
 * (запрыгивает, присаживается, закапывает), заскучавшая гоняет мячик или мышку, остальное
 * время бродит, носится, запрыгивает на диван и кресла и спит там, трётся о кошку игрока.
 * В игровой зоне лезет по домику-когтеточке на полку и лежанку, спит в домике, точит когти,
 * бьёт лапой помпон, пробегает через тоннель. На ласку кошки игрока отвечает мурлыканьем
 * (иногда переворачивается на спину), на игру — охотой. Над кошками — эмоции (сердечки,
 * «з-з-з» во сне, ноты, когда мяукают), при поворотах на бегу кошка кренится, при
 * приземлении — чуть приседает.
 */

/** Место на мебели: поверхность, высота и откуда запрыгивать с пола. */
export interface Perch {
  pos: P2;
  y: number;
  edge: P2;
  /** На каком предмете. */
  id?: ObjectId;
}

/** Действие кошки игрока с другой кошкой: та отвечает (мурлычет, играет). */
/** Чем отвечает кошка: мурлычет, жмурится от умывания, играет, нюхается, убегает, засыпает рядом, шипит, ластится. */
type JobReply = 'pet' | 'brush' | 'play' | 'sniff' | 'flee' | 'nap' | 'hiss' | 'love' | 'none';

interface CatJob {
  key: number;
  action: string;
  motion: JobReply;
  /** Убегает (догонялки) — план уже выдан. */
  fled?: boolean;
  /** С какой кошкой. */
  cat: string | null;
  /** Когда кошка игрока начала само действие (null — ещё подходит). */
  settledAt: number | null;
}

/** Всё, что кошкам нужно знать о доме в этот кадр. */
export interface CatWorld {
  bounds: Box;
  /** Препятствия для кошек (без мисок и лотка). */
  boxes: readonly Box[];
  perches: readonly Perch[];
  /** Высота наполнителя в лотке. */
  litterSurface: number;
  /** Где стоит лоток (по умолчанию — как в обычной квартире). */
  litter?: P2;
  /** Где миски с кормом и водой (их можно переставить). */
  bowls?: { food: P2; water: P2 };
  /** Где кошка игрока. */
  hero: P2;
  pets: { bowl: number; water: number; litter: number };
  need(id: string): { fed: number; play: number; toilet: number };
  /** Игровая зона (null — нет). */
  play?: PlayParts | null;
  /** Какой кошкой управляет игрок. */
  pet?: string | null;
  /** Кошка игрока дошла и начала действие (отсюда считается его длительность). */
  onAct?(key: number): void;
  /** Отношения двух кошек −100…100. */
  bond?(a: string, b: string): number;
}

type Step =
  | { k: 'go'; to: P2; run?: boolean; near?: number; detours?: number }
  | { k: 'turn'; heading: number }
  | { k: 'pose'; mode: CatMode; dur: number; tag?: 'eat' | 'drink' | 'litter' | 'wheel' | 'spin' | 'guest' }
  | { k: 'jump'; to: P2; y: number; hop?: boolean; edge?: P2 }
  | { k: 'hunt'; toy: Toy; left: number; phase: 'chase' | 'aim' | 'swat' }
  | { k: 'rub'; dur: number; angle: number; at?: string }
  /** Бежать за другой кошкой (догонялки) dur секунд. */
  | { k: 'follow'; at: string; dur: number }
  /** Кошка игрока начала действие (сообщить сцене). */
  | { k: 'act' };

export interface CatAI {
  cat: Cat3D;
  id: string;
  shadow: THREE.Object3D;
  pos: P2;
  /** Высота над полом (на мебели, в лотке, в прыжке). */
  y: number;
  heading: number;
  mode: CatMode;
  plan: Step[];
  /** Когда начат текущий шаг (−1 — ещё не начат). */
  stepAt: number;
  speed: number;
  seed: number;
  size: number;
  tilt: number;
  /** Подскок на месте (только для вида: игра с дразнилкой). */
  hop: number;
  /** Прыжок: откуда, куда, когда начат, сколько длится полёт и высота дуги. */
  jump: { from: P2; fromY: number; to: P2; toY: number; at: number; dur: number; h: number; edge?: P2 } | null;
  /** Где спрыгнуть, если сидит на мебели. */
  edge: P2 | null;
  stuck: number;
  ateAt: number;
  drankAt: number;
  litterAt: number;
  /** На какой зов уже откликнулась. */
  called: number;
  /** Сколько раз за время жизни ела, ходила в лоток, запрыгивала на мебель (для проверок). */
  log: { eat: number; drink: number; litter: number; perch: number; hunt: number; rub: number; play: number; fun: number; act: number };
  /** Когда кошку игрока последний раз вели (стик, касание, действие): от этого — как долго она сидит без дела. */
  busyAt: number;
  /** Приседание после приземления (1 → 0), крен в повороте, эмоция над головой. */
  squash: number;
  lean: number;
  /** Где была в прошлом кадре и настоящая скорость (для шага). */
  last: P2;
  vel: number;
  emote: { obj: THREE.Sprite | null; kind: Emote | null; k: number };
}

type Emote = 'heart' | 'zzz' | 'note' | 'need' | 'anger';

interface Toy {
  obj: THREE.Group;
  pos: P2;
  vel: P2;
  kind: 'ball' | 'mouse';
}

// ─── Поиск пути ────────────────────────────────────────────────────────

/** Шаг сетки и запас от мебели (как у resolve: 0.3 м). */
const NAV = 0.2;
const NAV_R = 0.36;
interface NavGrid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  free: Uint8Array;
}
const navCache = new WeakMap<readonly Box[], { b: Box; g: NavGrid }>();
function navGrid(b: Box, boxes: readonly Box[]): NavGrid {
  const hit = navCache.get(boxes);
  if (hit && hit.b.x0 === b.x0 && hit.b.x1 === b.x1 && hit.b.z0 === b.z0 && hit.b.z1 === b.z1) return hit.g;
  const nx = Math.max(1, Math.floor((b.x1 - b.x0) / NAV) + 1);
  const nz = Math.max(1, Math.floor((b.z1 - b.z0) / NAV) + 1);
  const free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) free[j * nx + i] = blocked({ x: b.x0 + i * NAV, z: b.z0 + j * NAV }, boxes, NAV_R) ? 0 : 1;
  const g = { x0: b.x0, z0: b.z0, nx, nz, free };
  navCache.set(boxes, { b, g });
  return g;
}
/** Прямой путь свободен (проверка через каждые 0.1 м). */
function lineFree(a: P2, c: P2, boxes: readonly Box[]): boolean {
  const d = dist(a, c);
  const n = Math.ceil(d / 0.1);
  for (let k = 1; k < n; k += 1) if (blocked({ x: a.x + ((c.x - a.x) * k) / n, z: a.z + ((c.z - a.z) * k) / n }, boxes, NAV_R - 0.02)) return false;
  return true;
}
/** Путь по сетке A* в обход мебели (точки поворота, без старта); null — не пройти. */
export function findPath(from: P2, to: P2, b: Box, boxes: readonly Box[]): P2[] | null {
  const g = navGrid(b, boxes);
  const cell = (p: P2): number => {
    const i = Math.max(0, Math.min(g.nx - 1, Math.round((p.x - g.x0) / NAV)));
    const j = Math.max(0, Math.min(g.nz - 1, Math.round((p.z - g.z0) / NAV)));
    return j * g.nx + i;
  };
  const at = (k: number): P2 => ({ x: g.x0 + (k % g.nx) * NAV, z: g.z0 + Math.floor(k / g.nx) * NAV });
  const start = cell(from);
  const goal = cell(to);
  const N = g.nx * g.nz;
  const cost = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  // Открытый список — простая куча по f.
  const heap: Array<[number, number]> = [];
  const push = (k: number, f: number): void => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]![1];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const h = (k: number): number => dist(at(k), at(goal));
  cost[start] = 0;
  push(start, h(start));
  const passable = (k: number): boolean => g.free[k] === 1 || k === goal;
  let steps = 0;
  while (heap.length && steps < 20000) {
    steps += 1;
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) break;
    const i = k % g.nx;
    const j = Math.floor(k / g.nx);
    for (let di = -1; di <= 1; di += 1)
      for (let dj = -1; dj <= 1; dj += 1) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
        const n = nj * g.nx + ni;
        if (!passable(n) || done[n]) continue;
        // По диагонали — только если не срезает угол мебели.
        if (di && dj && (!passable(j * g.nx + ni) || !passable(nj * g.nx + i))) continue;
        const c = cost[k]! + (di && dj ? 1.414 : 1);
        if (c < cost[n]!) {
          cost[n] = c;
          prev[n] = k;
          push(n, c + h(n));
        }
      }
  }
  if (!done[goal]) return null;
  const cells: P2[] = [];
  for (let k = goal; k !== -1 && k !== start; k = prev[k]!) cells.push(at(k));
  cells.reverse();
  // Срезать лишние точки: из каждой — к самой дальней видимой.
  const out: P2[] = [];
  let cur = from;
  let i = 0;
  while (i < cells.length) {
    let far = i;
    for (let k = cells.length - 1; k > i; k -= 1)
      if (lineFree(cur, cells[k]!, boxes)) {
        far = k;
        break;
      }
    cur = cells[far]!;
    out.push(cur);
    i = far + 1;
  }
  // Последняя точка — сама цель.
  if (out.length) out[out.length - 1] = { ...to };
  return out;
}

/** Места на мебели, куда кошка запрыгивает (в осях предмета). */
const PERCH: Partial<Record<ObjectId, Array<{ at: [number, number]; y: number; edge: [number, number] }>>> = {
  sofa: [
    { at: [-0.75, 0.05], y: 0.475, edge: [-0.8, 0.88] },
    { at: [0.7, 0.05], y: 0.475, edge: [0.8, 0.88] },
  ],
  armchair: [{ at: [0, 0.12], y: 0.65, edge: [0, 0.9] }],
  big_tv: [{ at: [0, 1.25], y: 0.44, edge: [0.75, 1.25] }],
};

/** Места на мебели этой раскладки (в мировых координатах). */
export function perchSpots(placed: readonly Placed[], bounds: Box, boxes: readonly Box[]): Perch[] {
  const out: Perch[] = [];
  for (const p of placed) {
    const list = PERCH[p.id];
    if (!list) continue;
    const c = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    const w = (l: [number, number]): P2 => ({ x: p.pos.x + l[0] * c + l[1] * sn, z: p.pos.z - l[0] * sn + l[1] * c });
    for (const x of list) out.push({ pos: w(x.at), y: x.y, edge: resolve(w(x.edge), bounds, boxes), id: p.id });
  }
  return out;
}

const angleTo = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const CROUCH = 0.24;
/** Ближе этого к другой кошке на мебели кошка не ложится (место занято). */
const SEAT_CLEAR = 0.6;
const LAND = 0.16;

/** Ответ кошки на действие кошки игрока с ней. */
const JOB_MOTION: Record<string, JobReply> = { rub_cat: 'pet', groom_cat: 'brush', play_cats: 'play', sniff_cat: 'sniff', chase_cat: 'flee', nap_cat: 'nap', hiss_cat: 'hiss', mate_cat: 'love' };

/** Сколько мс после начала действия кошкой игрока ждать результата. */
export function catActMs(action: string): number {
  const ms: Record<string, number> = {
    eat: 4500, drink: 3200, ask_food: 2600, use_litter: 5200, clean_litter: 2200, nap_sofa: 4500, armchair: 4500,
    climb_tree: 4500, house_nap: 4500, pompom: 4200, scratch_post: 4000, tunnel_run: 3200, hammock_nap: 4500, box_sit: 4000,
    tower_climb: 6000, wheel_run: 5200, track_play: 4200, books: 4000, fish: 5000, piano: 3800, cinema: 5000, dance: 4200,
    console: 4200, paint: 5600, rub_cat: 4200, play_cats: 4600, groom_cat: 4200, sniff_cat: 2600, chase_cat: 4800, nap_cat: 5200, hiss_cat: 2400, mate_cat: 4600, comfort_cat: 3600, mourn: 4200, go_demon: 400, go_cafe: 400,
  };
  return ms[action] ?? 3500;
}

/** Картинки эмоций над кошками (рисуются один раз). */
let emoteTex: Record<Emote, THREE.Texture> | null = null;
function emoteTextures(): Record<Emote, THREE.Texture> {
  if (emoteTex) return emoteTex;
  const make = (draw: (g: CanvasRenderingContext2D) => void): THREE.Texture => {
    // Без DOM (проверки) — пустая картинка.
    if (typeof document === 'undefined') return new THREE.Texture();
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (g) draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const heart = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void => {
    g.beginPath();
    g.moveTo(x, y + r * 0.9);
    g.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.8, y - r * 1.3, x, y - r * 0.45);
    g.bezierCurveTo(x + r * 0.8, y - r * 1.3, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#ffffff';
    g.stroke();
  };
  const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string): void => {
    g.font = `900 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(40,30,60,0.85)';
    g.strokeText(s, x, y);
    g.fillStyle = fill;
    g.fillText(s, x, y);
  };
  emoteTex = {
    heart: make((g) => {
      heart(g, 70, 64, 34, '#ff5c8a');
      heart(g, 30, 30, 14, '#ff9bb8');
    }),
    zzz: make((g) => {
      text(g, 'z', 34, 92, 40, '#dfe8ff');
      text(g, 'z', 62, 62, 52, '#dfe8ff');
      text(g, 'Z', 96, 30, 62, '#ffffff');
    }),
    note: make((g) => {
      text(g, '♪', 44, 70, 76, '#ffd45c');
      text(g, '♫', 92, 44, 56, '#9be7ff');
    }),
    anger: make((g) => {
      // Молния: шипит и злится.
      g.beginPath();
      g.moveTo(74, 8);
      g.lineTo(34, 70);
      g.lineTo(60, 70);
      g.lineTo(46, 120);
      g.lineTo(96, 50);
      g.lineTo(68, 50);
      g.closePath();
      g.fillStyle = '#ffd23c';
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(120,30,20,0.9)';
      g.stroke();
    }),
    need: make((g) => {
      g.beginPath();
      g.arc(64, 60, 46, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(40,30,60,0.85)';
      g.stroke();
      text(g, '!', 64, 62, 72, '#ff6a3d');
    }),
  };
  return emoteTex;
}

/** Кошки дома: parent — куда добавлять модели, shadow — тень под кошкой. */
export function createCatLife(parent: THREE.Object3D, shadow: () => THREE.Object3D) {
  // Реалистичная модель грузится в фоне; когда готова, кошки пересобираются (меняется ключ внешности).
  void loadCatModel();
  const cats = new Map<string, CatAI>();
  let dtLast = 1 / 60;
  const toys: Toy[] = [];
  let a = 12345;
  const rand = (): number => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length]!;
  const randomSpot = (w: CatWorld): P2 => {
    const b = w.bounds;
    for (let i = 0; i < 20; i += 1) {
      const q = { x: b.x0 + 0.6 + rand() * (b.x1 - b.x0 - 1.2), z: b.z0 + 0.6 + rand() * (b.z1 - b.z0 - 1.2) };
      const r = resolve(q, b, w.boxes);
      if (Math.hypot(r.x - q.x, r.z - q.z) < 0.01) return q;
    }
    return { x: 0, z: 0.5 };
  };
  const restDur = (mode: CatMode): number => ({ sit: 4 + rand() * 5, groom: 3 + rand() * 3, idle: 1.5 + rand() * 2.5, lie: 6 + rand() * 7, sleep: 12 + rand() * 14 } as Partial<Record<CatMode, number>>)[mode] ?? 3;
  /** Отдых: перед тем как лечь — иногда «топчет» лапками; проснувшись — потягивается. */
  const rest = (m: CatMode, extra = 0): Step[] => [
    ...((m === 'lie' || m === 'sleep') && rand() < 0.5 ? ([{ k: 'pose', mode: 'knead', dur: 2 + rand() * 2 }] as Step[]) : []),
    { k: 'pose', mode: m, dur: restDur(m) + extra },
    ...(m === 'sleep' ? ([{ k: 'pose', mode: 'stretch', dur: 1.6 + rand() }] as Step[]) : []),
  ];
  /** Точка перед миской (кошка стоит мордой к ней, на +x). */
  const bowlFront = (bowl: P2, c: CatAI): P2 => ({ x: bowl.x - 0.3 * c.size, z: bowl.z });
  let litterAt: P2 = PETS.litter.pos;
  const food = (w: CatWorld): P2 => w.bowls?.food ?? PETS.food;
  const water = (w: CatWorld): P2 => w.bowls?.water ?? PETS.water;
  const litterIn = (): P2 => ({ x: litterAt.x, z: litterAt.z + 0.02 });
  const litterOut = (): P2 => ({ x: litterAt.x, z: litterAt.z - 0.6 });

  /** Кошка игрока без дела: сидит, умывается, оглядывается, мяукает; долго без дела — ложится и засыпает. */
  const petIdle = (c: CatAI, t: number, w: CatWorld): void => {
    const need = w.need(c.id);
    const still = t - c.busyAt;
    if (c.y > 0.05) {
      // На мебели — устраивается поудобнее и спит.
      c.plan = rest(still > 15 ? pick(['sleep', 'sleep', 'lie'] as const) : pick(['lie', 'sit', 'groom'] as const), 6);
      return;
    }
    const opts: Array<[number, () => Step[]]> = [
      [3, () => [{ k: 'pose', mode: 'sit', dur: 3 + rand() * 4 }]],
      [1.4, () => [{ k: 'pose', mode: 'groom', dur: 2.5 + rand() * 2.5 }]],
      [1, () => [{ k: 'pose', mode: 'idle', dur: 1.5 + rand() * 2 }]],
      [need.fed < 40 || need.toilet < 30 ? 2.5 : 0.35, () => [{ k: 'pose', mode: 'meow', dur: 1.6 + rand() }, { k: 'pose', mode: 'sit', dur: 2 }]],
      [0.6, () => [{ k: 'pose', mode: 'sniff', dur: 2 + rand() * 2 }]],
      [0.3 + (100 - need.play) / 200, () => [{ k: 'pose', mode: 'roll', dur: 2.5 + rand() * 2 }, { k: 'pose', mode: 'sit', dur: 1.2 }]],
      [still > 20 ? 2.2 : 0.4, () => rest('lie', 4)],
      [still > 40 ? 3 : 0.1, () => rest('sleep', 10)],
    ];
    const total = opts.reduce((a0, [x]) => a0 + x, 0);
    let r = rand() * total;
    for (const [x, make] of opts) {
      r -= x;
      if (r <= 0) {
        c.plan = make();
        return;
      }
    }
    c.plan = [{ k: 'pose', mode: 'sit', dur: 3 }];
  };

  /** Свободна ли лежанка: на ней (или рядом) нет другой кошки. */
  const perchFree = (pr: { pos: P2 }, me: CatAI): boolean => ![...cats.values()].some((o) => o !== me && (o.y > 0.05 || o.jump) && dist(o.jump ? o.jump.to : o.pos, pr.pos) < SEAT_CLEAR);

  /**
   * Занятия в игровой зоне: у каждой игрушки свои (id — действие кошки игрока, если есть);
   * заскучавшая кошка играет охотнее, сытая и спокойная — лезет наверх поспать.
   */
  const zonePlans = (c: CatAI, w: CatWorld, play: number): Array<{ id: string | null; w: number; make: () => Step[] }> => {
    const out: Array<{ id: string | null; w: number; make: () => Step[] }> = [];
    const pz = w.play;
    if (!pz) return out;
    const bored = (100 - play) / 40;
    const face = (from: P2, to: P2): number => Math.atan2(to.x - from.x, to.z - from.z);
    const zone = (): void => {
      c.log.play += 1;
    };
    const add = (id: string | null, weight: number, make: () => Step[]): void => {
      out.push({ id, w: weight, make: () => (zone(), make()) });
    };
    for (const it of pz.items) {
      switch (it.id) {
        case 'tree':
          add('climb_tree', 1.4, () => {
            const m = pick(['lie', 'sleep', 'sleep', 'groom', 'sit'] as const);
            return [
              { k: 'go', to: it.base },
              { k: 'turn', heading: face(it.base, it.mid.pos) },
              { k: 'jump', to: it.mid.pos, y: it.mid.y, edge: it.base },
              { k: 'pose', mode: 'sit', dur: 1.2 + rand() * 1.5 },
              { k: 'turn', heading: face(it.mid.pos, it.top.pos) },
              { k: 'jump', to: it.top.pos, y: it.top.y, edge: it.base },
              { k: 'turn', heading: 0.3 },
              { k: 'pose', mode: m, dur: restDur(m) + 4 },
            ];
          });
          add('house_nap', 1.0, () => {
            const m = pick(['sleep', 'sleep', 'lie'] as const);
            return [
              { k: 'go', to: it.door },
              { k: 'turn', heading: Math.PI },
              { k: 'jump', to: it.house, y: it.houseY, hop: true, edge: it.door },
              { k: 'turn', heading: 0 },
              { k: 'pose', mode: m, dur: restDur(m) + 3 },
              { k: 'jump', to: it.door, y: 0, hop: true },
            ];
          });
          add('pompom', 0.7 + bored, () => [
            { k: 'go', to: it.pompomAt, run: rand() < 0.5 },
            { k: 'turn', heading: Math.PI },
            { k: 'pose', mode: 'crouch', dur: 0.8 },
            { k: 'pose', mode: 'reach', dur: 3 + rand() * 3 },
            { k: 'pose', mode: 'sit', dur: 1.2 },
          ]);
          break;
        case 'post':
          add('scratch_post', 0.9 + bored, () => [{ k: 'go', to: it.scratch }, { k: 'turn', heading: Math.PI }, { k: 'pose', mode: 'scratch', dur: 3 + rand() * 3 }, { k: 'pose', mode: 'sit', dur: 1.5 }]);
          add(null, 0.6, () => {
            const m = pick(['sit', 'lie', 'groom'] as const);
            return [{ k: 'go', to: it.top.edge }, { k: 'turn', heading: face(it.top.edge, it.top.pos) }, { k: 'jump', to: it.top.pos, y: it.top.y, edge: it.top.edge }, { k: 'turn', heading: 0 }, { k: 'pose', mode: m, dur: restDur(m) }];
          });
          break;
        case 'tunnel':
          add('tunnel_run', 0.7 + bored, () => {
            const [a0, b0] = rand() < 0.5 ? it.ends : ([it.ends[1], it.ends[0]] as const);
            return [
              { k: 'go', to: a0, run: true },
              { k: 'turn', heading: face(a0, b0) },
              { k: 'pose', mode: 'crouch', dur: 0.6 },
              { k: 'go', to: b0, run: true, detours: 5 },
              { k: 'pose', mode: 'idle', dur: 0.8 },
              ...(rand() < 0.5 ? ([{ k: 'turn', heading: face(b0, a0) }, { k: 'go', to: a0, run: true, detours: 5 }] as Step[]) : []),
            ];
          });
          break;
        case 'hammock':
          add('hammock_nap', 1.1, () => {
            const m = pick(['sleep', 'lie', 'lie'] as const);
            return [{ k: 'go', to: it.edge }, { k: 'turn', heading: Math.PI }, { k: 'jump', to: it.bed.pos, y: it.bed.y, edge: it.edge }, { k: 'turn', heading: Math.PI / 2 }, { k: 'pose', mode: m, dur: restDur(m) + 4 }];
          });
          break;
        case 'boxes':
          add('box_sit', 0.9, () => {
            const b = pick(it.boxes);
            const m = pick(['sit', 'sit', 'lie'] as const);
            return [{ k: 'go', to: b.door }, { k: 'turn', heading: Math.PI }, { k: 'jump', to: b.in, y: 0.03, hop: true, edge: b.door }, { k: 'turn', heading: 0 }, { k: 'pose', mode: m, dur: restDur(m) + 2 }, { k: 'jump', to: b.door, y: 0, hop: true }];
          });
          break;
        case 'tower':
          add('tower_climb', 1.0 + bored * 0.5, () => {
            const [s1, s2, s3] = it.steps as [{ pos: P2; y: number }, { pos: P2; y: number }, { pos: P2; y: number }];
            const m = pick(['lie', 'sleep', 'sit', 'groom'] as const);
            return [
              { k: 'go', to: it.base },
              { k: 'turn', heading: face(it.base, s1.pos) },
              { k: 'jump', to: s1.pos, y: s1.y, edge: it.base },
              { k: 'pose', mode: 'sit', dur: 0.8 + rand() },
              { k: 'turn', heading: face(s1.pos, s2.pos) },
              { k: 'jump', to: s2.pos, y: s2.y, edge: it.base },
              { k: 'pose', mode: 'sit', dur: 0.8 + rand() },
              { k: 'turn', heading: face(s2.pos, s3.pos) },
              { k: 'jump', to: s3.pos, y: s3.y, edge: it.base },
              { k: 'turn', heading: 0.2 },
              { k: 'pose', mode: m, dur: restDur(m) + 3 },
            ];
          });
          break;
        case 'wheel':
          add('wheel_run', 0.8 + bored * 1.2, () => {
            const dir = rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
            return [
              { k: 'go', to: it.entry },
              { k: 'turn', heading: Math.PI },
              { k: 'jump', to: it.inside, y: 0.06, hop: true, edge: it.entry },
              { k: 'turn', heading: dir },
              { k: 'pose', mode: 'trot', dur: 5 + rand() * 5, tag: 'wheel' },
              { k: 'pose', mode: 'idle', dur: 0.8 },
              { k: 'turn', heading: 0 },
              { k: 'jump', to: it.entry, y: 0, hop: true },
            ];
          });
          break;
        case 'track':
          add('track_play', 0.8 + bored, () => {
            const sp = pick(it.spots);
            return [{ k: 'go', to: sp.at }, { k: 'turn', heading: sp.face }, { k: 'pose', mode: 'crouch', dur: 0.7 }, { k: 'pose', mode: 'swat', dur: 3 + rand() * 3 }, { k: 'pose', mode: 'sit', dur: 1.5 }];
          });
          break;
      }
    }
    return out;
  };

  const planNext = (c: CatAI, t: number, w: CatWorld): void => {
    if (c.id === w.pet) {
      petIdle(c, t, w);
      return;
    }
    const need = w.need(c.id);
    // На мебели: ещё полежать или спрыгнуть.
    if (c.y > 0.05) {
      const urgent = need.toilet < 40 || (need.fed < 50 && w.pets.bowl > 0);
      if (!urgent && rand() < 0.45) {
        const m = pick(['lie', 'sleep', 'groom', 'sit'] as const);
        c.plan = rest(m);
      } else c.plan = [{ k: 'jump', to: c.edge ?? randomSpot(w), y: 0 }];
      return;
    }
    const opts: Array<[number, () => Step[]]> = [];
    if (need.toilet < 40 && w.pets.litter < 100 && t - c.litterAt > 60)
      opts.push([
        12,
        () => [
          // Приспичило — издалека бежит.
          { k: 'go', to: litterOut(), run: dist(c.pos, litterOut()) > 4 },
          { k: 'turn', heading: 0 },
          { k: 'jump', to: litterIn(), y: w.litterSurface, hop: true },
          { k: 'turn', heading: Math.PI },
          { k: 'pose', mode: 'litter', dur: 4, tag: 'litter' },
          { k: 'turn', heading: 0 },
          { k: 'pose', mode: 'dig', dur: 2.5 },
          { k: 'turn', heading: Math.PI },
          { k: 'jump', to: litterOut(), y: 0, hop: true },
        ],
      ]);
    if (w.pets.bowl > 0 && t - c.ateAt > 45 && need.fed < 85)
      opts.push([
        need.fed < 55 ? 10 : 1,
        () => [
          { k: 'go', to: bowlFront(food(w), c), run: need.fed < 40 && dist(c.pos, food(w)) > 4 },
          { k: 'turn', heading: Math.PI / 2 },
          { k: 'pose', mode: 'eat', dur: 6 + rand() * 4, tag: 'eat' },
          ...(rand() < 0.6 && w.pets.water > 0 ? ([{ k: 'go', to: bowlFront(water(w), c) }, { k: 'turn', heading: Math.PI / 2 }, { k: 'pose', mode: 'eat', dur: 3, tag: 'drink' }] as Step[]) : []),
          { k: 'pose', mode: 'groom', dur: 3 },
        ],
      ]);
    if (t - c.drankAt > 70 && w.pets.water > 0) opts.push([0.8, () => [{ k: 'go', to: bowlFront(water(w), c) }, { k: 'turn', heading: Math.PI / 2 }, { k: 'pose', mode: 'eat', dur: 3.5, tag: 'drink' }]]);
    if (toys.length) opts.push([0.8 + (100 - need.play) / 22, () => [{ k: 'hunt', toy: pick(toys), left: 2 + Math.floor(rand() * 3), phase: 'chase' }, { k: 'pose', mode: 'sit', dur: 2 }]]);
    // Друзья трутся друг о друга и спят рядом, недруги шипят (по отношениям).
    for (const o of cats.values()) {
      if (o === c || o.y > 0.05 || o.jump || job?.cat === o.id || dist(o.pos, c.pos) > 6) continue;
      const b = w.bond?.(c.id, o.id) ?? 0;
      const look = (): number => Math.atan2(o.pos.x - c.pos.x, o.pos.z - c.pos.z);
      if (b >= 25)
        opts.push([
          0.25 + b / 120,
          () =>
            rand() < 0.6
              ? [{ k: 'go', to: o.pos, run: dist(o.pos, c.pos) > 2.5, near: 0.5 }, { k: 'rub', dur: 3 + rand() * 2, angle: rand() * 6, at: o.id }, { k: 'pose', mode: 'sit', dur: 2 }]
              : [{ k: 'go', to: o.pos, near: 0.42 }, { k: 'pose', mode: 'sniff', dur: 1.5 }, { k: 'pose', mode: 'knead', dur: 1.5 }, { k: 'pose', mode: 'sleep', dur: 12 + rand() * 10 }],
        ]);
      else if (b <= -30 && dist(o.pos, c.pos) < 4.5) opts.push([1 + -b / 60, () => [{ k: 'turn', heading: look() }, { k: 'pose', mode: 'hiss', dur: 1.8 + rand() }, { k: 'go', to: randomSpot(w), run: true }]]);
    }
    opts.push([2, () => [{ k: 'go', to: randomSpot(w) }]]);
    opts.push([0.7, () => [{ k: 'go', to: randomSpot(w), run: true }, { k: 'go', to: randomSpot(w), run: true }, { k: 'pose', mode: 'idle', dur: 1.5 }]]);
    // Свободные места на мебели (на занятом другой кошкой не ложится).
    const perches = w.perches.filter((pr) => perchFree(pr, c));
    if (perches.length)
      opts.push([
        2.2,
        () => {
          const pr = pick(perches);
          const m = pick(['lie', 'sleep', 'sleep', 'groom', 'sit'] as const);
          return [{ k: 'go', to: pr.edge }, { k: 'turn', heading: Math.atan2(pr.pos.x - pr.edge.x, pr.pos.z - pr.edge.z) }, { k: 'jump', to: pr.pos, y: pr.y }, ...rest(m)];
        },
      ]);
    for (const z of zonePlans(c, w, need.play)) opts.push([z.w, z.make]);
    opts.push([
      1.8,
      () => {
        const m = pick(['sit', 'groom', 'idle', 'lie', 'sleep'] as const);
        return rest(m);
      },
    ]);
    // Свои кошачьи забавы: обнюхать угол, покататься на спине, погоняться за хвостом.
    opts.push([
      0.8,
      () => {
        c.log.fun += 1;
        return [{ k: 'go', to: randomSpot(w) }, { k: 'pose', mode: 'sniff', dur: 2 + rand() * 2 }, { k: 'pose', mode: 'idle', dur: 0.8 }];
      },
    ]);
    opts.push([
      0.45 + (100 - need.play) / 120,
      () => {
        c.log.fun += 1;
        return [{ k: 'pose', mode: 'roll', dur: 3 + rand() * 2 }, { k: 'pose', mode: 'sit', dur: 1.2 }, { k: 'pose', mode: 'groom', dur: 2 }];
      },
    ]);
    opts.push([
      0.25 + (100 - need.play) / 150,
      () => {
        c.log.fun += 1;
        return [{ k: 'pose', mode: 'crouch', dur: 0.6 }, { k: 'pose', mode: 'chase', dur: 1.8 + rand() * 1.5, tag: 'spin' }, { k: 'pose', mode: 'sit', dur: 1.5 }];
      },
    ]);
    const total = opts.reduce((s, [x]) => s + x, 0);
    let r = rand() * total;
    for (const [x, make] of opts) {
      r -= x;
      if (r <= 0) {
        c.plan = make();
        return;
      }
    }
    c.plan = [{ k: 'pose', mode: 'idle', dur: 2 }];
  };

  /** Начать прыжок к цели (вверх на мебель, вниз на пол, в лоток). */
  const startJump = (c: CatAI, to: P2, y: number, t: number, hop = false, edge?: P2): void => {
    const d = dist(c.pos, to);
    c.jump = { from: { ...c.pos }, fromY: c.y, to: { ...to }, toY: y, at: t, dur: hop ? 0.32 : 0.38 + Math.abs(y - c.y) * 0.35, h: hop ? 0.1 : 0.12 + Math.max(0, y - c.y) * 0.35 + d * 0.05, edge };
    if (d > 0.05) c.heading = Math.atan2(to.x - c.pos.x, to.z - c.pos.z);
    if (y > 0.2) c.log.perch += 1;
  };
  /** Прыжок идёт: присела → полёт по дуге → приземлилась. true — закончен. */
  const runJump = (c: CatAI, t: number): boolean => {
    const j = c.jump!;
    const e = t - j.at;
    if (e < CROUCH) {
      c.mode = 'crouch';
      return false;
    }
    const s = Math.min(1, (e - CROUCH) / j.dur);
    c.pos = { x: j.from.x + (j.to.x - j.from.x) * s, z: j.from.z + (j.to.z - j.from.z) * s };
    c.y = j.fromY + (j.toY - j.fromY) * s + j.h * 4 * s * (1 - s);
    const vy = j.toY - j.fromY + j.h * 4 * (1 - 2 * s);
    const horiz = Math.max(0.2, dist(j.from, j.to));
    c.tilt = Math.max(-0.7, Math.min(0.7, -Math.atan2(vy, horiz) * 0.8));
    c.mode = s < 1 ? 'jump' : 'crouch';
    if (s < 1) return false;
    c.tilt = 0;
    if (c.squash < 0.5 && e - CROUCH - j.dur < dtLast * 1.5) c.squash = 1;
    if (e - CROUCH - j.dur < LAND) return false;
    c.y = j.toY;
    // Откуда спрыгивать: задано (домик, лежанка на домике) или откуда запрыгнула.
    c.edge = j.edge ? { ...j.edge } : j.toY > 0.2 ? { ...j.from } : null;
    c.jump = null;
    return true;
  };
  const kickToy = (toy: Toy, heading: number, power: number): void => {
    const ang = heading + (rand() - 0.5) * 1.2;
    toy.vel = { x: Math.sin(ang) * power, z: Math.cos(ang) * power };
  };
  /** Движение к точке: true — дошла (или упёрлась). */
  const walkTo = (c: CatAI, to: P2, want: number, near: number, dt: number, w: CatWorld): boolean => {
    const gx = to.x - c.pos.x;
    const gz = to.z - c.pos.z;
    const d = Math.hypot(gx, gz);
    if (d < near) return true;
    c.heading += angleTo(c.heading, Math.atan2(gx, gz)) * Math.min(1, dt * 6);
    const target = want * Math.min(1, 0.4 + d * 1.5);
    c.speed += (target - c.speed) * Math.min(1, dt * 6);
    const step = c.speed * dt;
    const next = resolve({ x: c.pos.x + Math.sin(c.heading) * step, z: c.pos.z + Math.cos(c.heading) * step }, w.bounds, w.boxes);
    // Упёрлась в мебель — через секунду бросает затею.
    if (Math.hypot(next.x - c.pos.x, next.z - c.pos.z) < step * 0.3) c.stuck += dt;
    else c.stuck = Math.max(0, c.stuck - dt);
    c.pos = next;
    // Рысь и шаг — с запасом (без мелькания туда-обратно на границе).
    c.mode = c.speed > (c.mode === 'trot' ? 0.75 : 0.95) ? 'trot' : 'walk';
    return c.stuck > 0.35;
  };
  /** Обход препятствия: точка сбоку от пути к цели, свободная от мебели (null — обойти нельзя). */
  const detour = (c: CatAI, to: P2, w: CatWorld): P2 | null => {
    const base = Math.atan2(to.x - c.pos.x, to.z - c.pos.z);
    let best: P2 | null = null;
    let bestD = Infinity;
    for (const turn of [1.2, -1.2, 0.7, -0.7, 2.0, -2.0]) {
      for (const len of [0.8, 1.4]) {
        const q = { x: c.pos.x + Math.sin(base + turn) * len, z: c.pos.z + Math.cos(base + turn) * len };
        const r = resolve(q, w.bounds, w.boxes);
        if (Math.hypot(r.x - q.x, r.z - q.z) > 0.01) continue;
        // Путь до точки свободен (проверка по шагам).
        let free = true;
        for (let k = 1; k <= 4 && free; k += 1) {
          const m = { x: c.pos.x + ((q.x - c.pos.x) * k) / 4, z: c.pos.z + ((q.z - c.pos.z) * k) / 4 };
          const rm = resolve(m, w.bounds, w.boxes);
          if (Math.hypot(rm.x - m.x, rm.z - m.z) > 0.01) free = false;
        }
        if (!free) continue;
        const d = dist(q, to) + rand() * 0.3;
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    return best;
  };
  /** Ответ кошки на действие кошки игрока с ней (трётся, умывает, зовёт играть). */
  const react = (c: CatAI, act: CatJob, from: P2, t: number): void => {
    c.speed = 0;
    // После ласки — новые дела.
    c.plan = [];
    c.stepAt = -1;
    c.heading += angleTo(c.heading, Math.atan2(from.x - c.pos.x, from.z - c.pos.z)) * 0.08;
    const e = act.settledAt !== null ? t - act.settledAt : 0;
    c.tilt = 0;
    if (act.motion === 'pet') c.mode = e > 1.4 && (act.key + Math.round(c.seed)) % 2 === 0 ? 'belly' : 'purr';
    else if (act.motion === 'brush') c.mode = e > 2.6 && (act.key + Math.round(c.seed)) % 2 === 0 ? 'roll' : 'purr';
    else if (act.motion === 'sniff') c.mode = e < 2.2 ? 'sniff' : 'sit';
    else if (act.motion === 'nap') c.mode = e < 1.6 ? 'knead' : 'sleep';
    else if (act.motion === 'hiss') c.mode = e < 0.6 ? 'idle' : 'hiss';
    else if (act.motion === 'love') c.mode = e < 2.5 ? 'purr' : 'knead';
    else if (act.motion === 'play') {
      // Играет в ответ: припадает, подпрыгивает, бьёт лапой.
      const k = (e * 0.9 + 0.5) % 1;
      c.mode = k < 0.4 ? 'crouch' : k < 0.6 ? 'jump' : 'swat';
      c.hop = k >= 0.4 && k < 0.6 ? 0.16 * Math.sin(((k - 0.4) / 0.2) * Math.PI) : 0;
      c.tilt = k < 0.5 ? -0.5 : 0.3;
    } else c.mode = 'sit';
  };

  /** Действие кошки игрока (с другой кошкой — та ждёт и отвечает). */
  let job: CatJob | null = null;
  /** Стик: направление (по полу) и сила 0…1. */
  const steer = { x: 0, z: 0, mag: 0 };

  /** Кошка игрока ведётся стиком: сворачивает плавно, разгоняется шагом до бега. */
  const steerPet = (c: CatAI, dt: number, w: CatWorld): void => {
    c.plan = [];
    c.stepAt = -1;
    const want = Math.atan2(steer.x, steer.z);
    c.heading += angleTo(c.heading, want) * Math.min(1, dt * 7);
    const m = steer.mag;
    const target = m < 0.8 ? 0.25 + 0.6 * m : 0.75 + 1.25 * ((m - 0.8) / 0.2);
    c.speed += (target - c.speed) * Math.min(1, dt * 5);
    // Пока разворачивается на месте — почти не идёт вперёд.
    const ahead = Math.max(0.15, Math.cos(angleTo(c.heading, want)));
    const step = c.speed * dt * ahead;
    c.pos = resolve({ x: c.pos.x + Math.sin(c.heading) * step, z: c.pos.z + Math.cos(c.heading) * step }, w.bounds, w.boxes);
    c.mode = c.speed > (c.mode === 'trot' ? 0.85 : 1.05) ? 'trot' : 'walk';
  };

  const updateCat = (c: CatAI, t: number, dt: number, w: CatWorld): void => {
    c.tilt *= 0.9;
    c.hop = 0;
    const mine = c.id === w.pet;
    if (mine && steer.mag > 0.05 && !job && !c.jump) {
      c.busyAt = t;
      if (c.y > 0.05) {
        // На мебели — сначала спрыгнуть в сторону стика.
        if (c.plan[0]?.k !== 'jump') {
          const to = c.edge ?? resolve({ x: c.pos.x + steer.x * 0.7, z: c.pos.z + steer.z * 0.7 }, w.bounds, w.boxes);
          c.plan = [{ k: 'jump', to, y: 0 }];
          c.stepAt = -1;
        }
      } else {
        steerPet(c, dt, w);
        return;
      }
    }
    // Кошка игрока занялась этой кошкой — ждёт её, потом отвечает.
    if (job && job.cat === c.id && !c.jump && c.y < 0.05) {
      const me = w.pet ? cats.get(w.pet) : undefined;
      if (job.settledAt !== null && me && job.motion === 'flee') {
        // Догонялки: убегает, петляя по дому (дальше живёт своим планом).
        if (!job.fled) {
          job.fled = true;
          c.plan = [{ k: 'go', to: randomSpot(w), run: true }, { k: 'go', to: randomSpot(w), run: true }, { k: 'pose', mode: 'sit', dur: 1.5 }];
          c.stepAt = -1;
        }
      } else if (job.settledAt !== null && me) {
        react(c, job, me.pos, t);
        return;
      } else if (c.plan[0]?.k !== 'pose' || c.plan[0].mode !== 'sit') {
        c.plan = [{ k: 'pose', mode: 'sit', dur: 30 }];
        c.stepAt = -1;
      }
    }
    if (c.jump) {
      // Прыжок шага плана закончен — следующий шаг (прыжок охоты продолжает охоту).
      if (runJump(c, t) && c.plan[0]?.k === 'jump') {
        c.plan.shift();
        c.stepAt = -1;
      }
      return;
    }
    if (!c.plan.length) {
      planNext(c, t, w);
      c.stepAt = -1;
    }
    const step = c.plan[0]!;
    const first = c.stepAt < 0;
    if (first) {
      c.stepAt = t;
      c.stuck = 0;
    }
    let done = false;
    switch (step.k) {
      case 'go':
        if (c.y > 0.05) {
          // Цель на полу, а кошка на мебели — сначала спрыгнуть.
          c.plan.unshift({ k: 'jump', to: c.edge ?? randomSpot(w), y: 0 });
          c.stepAt = -1;
          break;
        }
        // Мебель на пути — путь в обход по сетке (один раз на шаг).
        if (first && (step.detours ?? 0) < 5 && dist(c.pos, step.to) > 0.5 && !lineFree(c.pos, step.to, w.boxes)) {
          const path = findPath(c.pos, step.to, w.bounds, w.boxes);
          if (path && path.length > 1) {
            const legs: Step[] = path.slice(0, -1).map((p) => ({ k: 'go', to: p, run: step.run, near: 0.18, detours: 5 }));
            step.detours = 5;
            c.plan.splice(c.plan.indexOf(step), 0, ...legs);
            c.stepAt = -1;
            break;
          }
        }
        if (walkTo(c, step.to, step.run ? 1.7 : mine ? 0.75 : 0.5, step.near ?? 0.08, dt, w)) {
          // Упёрлась — обходит мебель (несколько попыток), иначе бросает затею.
          const reached = dist(c.pos, step.to) < (step.near ?? 0.08) + 0.02;
          const via = reached || (step.detours ?? 0) >= 5 ? null : detour(c, step.to, w);
          if (via) {
            step.detours = (step.detours ?? 0) + 1;
            c.plan.unshift({ k: 'go', to: via, run: step.run, near: 0.15, detours: 5 });
            c.stepAt = -1;
          } else if (reached) done = true;
          // Кошка игрока не дошла — делает дело там, где стоит (иначе действие не начнётся).
          else if (mine && job && job.settledAt === null) {
            const rest0 = c.plan.slice(c.plan.indexOf(step) + 1);
            const ai = rest0.findIndex((x) => x.k === 'act');
            c.plan = [{ k: 'act' }, ...rest0.slice(ai + 1).filter((x) => x.k === 'pose')];
            c.stepAt = -1;
          } else c.plan = [];
        }
        break;
      case 'turn': {
        const d = angleTo(c.heading, step.heading);
        c.heading += d * Math.min(1, dt * 5);
        c.mode = 'idle';
        done = Math.abs(d) < 0.08;
        break;
      }
      case 'pose':
        c.mode = step.mode;
        // За хвостом — крутится на месте.
        if (step.tag === 'spin') c.heading += dt * 7;
        // В колесе бежит на месте (колесо крутится под ней).
        if (step.tag === 'wheel') c.speed = 1.2;
        if (t - c.stepAt > step.dur) {
          done = true;
          if (step.tag === 'eat') {
            c.ateAt = t;
            c.log.eat += 1;
          }
          if (step.tag === 'drink') {
            c.drankAt = t;
            c.log.drink += 1;
          }
          if (step.tag === 'litter') {
            c.litterAt = t;
            c.log.litter += 1;
          }
        }
        break;
      case 'jump':
        if (first) startJump(c, step.to, step.y, t, step.hop, step.edge);
        break;
      case 'follow': {
        const o = cats.get(step.at);
        if (!o || t - c.stepAt > step.dur) done = true;
        else if (walkTo(c, o.pos, 1.9, 0.5 * c.size, dt, w)) c.mode = 'swat';
        break;
      }
      case 'act':
        done = true;
        c.log.act += 1;
        if (job && mine) {
          job.settledAt = t;
          w.onAct?.(job.key);
        }
        break;
      case 'hunt': {
        const toy = step.toy;
        if (step.phase === 'chase') {
          // Бежит к игрушке, останавливается в прыжке от неё.
          if (dist(c.pos, toy.pos) < 0.5 || walkTo(c, toy.pos, 1.5, 0.5, dt, w)) {
            step.phase = 'aim';
            c.stepAt = t;
          }
        } else if (step.phase === 'aim') {
          c.speed = 0;
          c.heading += angleTo(c.heading, Math.atan2(toy.pos.x - c.pos.x, toy.pos.z - c.pos.z)) * Math.min(1, dt * 8);
          c.mode = 'crouch';
          if (t - c.stepAt > 0.7) {
            // Прыжок на игрушку (присела уже — сразу полёт).
            const to = resolve({ x: toy.pos.x - Math.sin(c.heading) * 0.18, z: toy.pos.z - Math.cos(c.heading) * 0.18 }, w.bounds, w.boxes);
            c.jump = { from: { ...c.pos }, fromY: 0, to, toY: 0, at: t - CROUCH, dur: 0.3, h: 0.14 };
            step.phase = 'swat';
            c.stepAt = t + 0.3 + LAND;
          }
        } else {
          c.mode = 'swat';
          if (t - c.stepAt > 0.25 && Math.hypot(toy.vel.x, toy.vel.z) < 0.2) kickToy(toy, c.heading, 1.4 + rand() * 1.3);
          if (t - c.stepAt > 0.9) {
            step.left -= 1;
            step.phase = 'chase';
            c.log.hunt += 1;
            done = step.left <= 0;
          }
        }
        break;
      }
      case 'rub': {
        // Кругами вокруг другой кошки, касаясь боком.
        step.angle += dt * 1.5;
        const r = 0.42 * c.size;
        const mid = (step.at ? cats.get(step.at)?.pos : null) ?? w.hero;
        const to = { x: mid.x + Math.sin(step.angle) * r, z: mid.z + Math.cos(step.angle) * r };
        c.heading += angleTo(c.heading, step.angle + Math.PI / 2) * Math.min(1, dt * 6);
        c.pos = resolve({ x: c.pos.x + (to.x - c.pos.x) * Math.min(1, dt * 3), z: c.pos.z + (to.z - c.pos.z) * Math.min(1, dt * 3) }, w.bounds, w.boxes);
        c.speed = 0.3;
        c.mode = 'rub';
        if (first) c.log.rub += 1;
        done = t - c.stepAt > step.dur;
        break;
      }
    }
    if (step.k !== 'go' && step.k !== 'rub' && step.k !== 'follow' && !(step.k === 'hunt' && step.phase === 'chase') && !(step.k === 'pose' && step.tag === 'wheel')) c.speed += (0 - c.speed) * Math.min(1, dt * 8);
    if (!c.plan.length) c.stepAt = -1;
    else if (done && c.plan[0] === step) {
      c.plan.shift();
      c.stepAt = -1;
      if (step.k === 'go' || step.k === 'hunt') c.speed *= 0.5;
    }
  };

  /** Ближайшее к кошке место предмета id (лежанка на нём). */
  const perchOf = (id: ObjectId, from: P2, w: CatWorld): Perch | null => {
    const list = w.perches.filter((p) => p.id === id);
    list.sort((p, q) => dist(p.edge, from) - dist(q.edge, from));
    return list[0] ?? null;
  };

  /**
   * План действия кошки игрока: подойти, начать (шаг act — отсюда считается длительность),
   * сделать. После действия кошка ещё какое-то время остаётся в позе (спит, сидит).
   */
  const actionPlan = (c: CatAI, action: string, at: Placed | null, w: CatWorld, other: CatAI | null): Step[] => {
    const A: Step = { k: 'act' };
    const front = (pl: Placed): Step[] => [{ k: 'go', to: pl.use, near: 0.1 }, { k: 'turn', heading: Math.atan2(pl.pos.x - pl.use.x, pl.pos.z - pl.use.z) }];
    const onPerch = (id: ObjectId, after: Step[]): Step[] | null => {
      const pr = perchOf(id, c.pos, w);
      if (!pr) return null;
      return [{ k: 'go', to: pr.edge }, { k: 'turn', heading: Math.atan2(pr.pos.x - pr.edge.x, pr.pos.z - pr.edge.z) }, { k: 'jump', to: pr.pos, y: pr.y }, A, ...after];
    };
    switch (action) {
      case 'eat':
        return [{ k: 'go', to: bowlFront(food(w), c), run: dist(c.pos, food(w)) > 4 }, { k: 'turn', heading: Math.PI / 2 }, A, { k: 'pose', mode: 'eat', dur: 5.5, tag: 'eat' }, { k: 'pose', mode: 'groom', dur: 2.5 }];
      case 'drink':
        return [{ k: 'go', to: bowlFront(water(w), c) }, { k: 'turn', heading: Math.PI / 2 }, A, { k: 'pose', mode: 'eat', dur: 3.5, tag: 'drink' }, { k: 'pose', mode: 'sit', dur: 1.5 }];
      case 'ask_food':
        return [{ k: 'go', to: bowlFront(food(w), c) }, { k: 'turn', heading: Math.PI / 2 }, A, { k: 'pose', mode: 'meow', dur: 1.6 }, { k: 'pose', mode: 'reach', dur: 0.8 }, { k: 'pose', mode: 'sit', dur: 1.2 }];
      case 'use_litter':
        return [
          { k: 'go', to: litterOut(), run: dist(c.pos, litterOut()) > 4 },
          { k: 'turn', heading: 0 },
          { k: 'jump', to: litterIn(), y: w.litterSurface, hop: true },
          A,
          { k: 'turn', heading: Math.PI },
          { k: 'pose', mode: 'litter', dur: 3.5, tag: 'litter' },
          { k: 'turn', heading: 0 },
          { k: 'pose', mode: 'dig', dur: 2 },
          { k: 'turn', heading: Math.PI },
          { k: 'jump', to: litterOut(), y: 0, hop: true },
        ];
      case 'clean_litter':
        return [{ k: 'go', to: litterOut() }, { k: 'turn', heading: 0 }, A, { k: 'pose', mode: 'reach', dur: 1.2 }, { k: 'pose', mode: 'sit', dur: 1.2 }];
      case 'nap_sofa':
        return onPerch('sofa', [{ k: 'pose', mode: 'knead', dur: 2 }, { k: 'pose', mode: 'sleep', dur: 25 }, { k: 'pose', mode: 'stretch', dur: 1.8 }]) ?? [A, ...rest('sleep')];
      case 'armchair':
        return onPerch('armchair', [{ k: 'pose', mode: 'knead', dur: 2 }, { k: 'pose', mode: 'sleep', dur: 25 }]) ?? [A, ...rest('lie')];
      case 'rub_cat':
      case 'groom_cat':
      case 'sniff_cat':
      case 'chase_cat':
      case 'nap_cat':
      case 'hiss_cat':
      case 'mate_cat':
      case 'play_cats': {
        if (!other) return [A, { k: 'pose', mode: 'meow', dur: 1.5 }];
        const to = other.jump ? other.jump.to : other.pos;
        const dx = c.pos.x - to.x;
        const dz = c.pos.z - to.z;
        const d = Math.hypot(dx, dz) || 1;
        const gap = action === 'play_cats' || action === 'chase_cat' || action === 'hiss_cat' ? 0.8 : action === 'sniff_cat' ? 0.34 : 0.45;
        const spot = resolve({ x: to.x + (dx / d) * gap * c.size, z: to.z + (dz / d) * gap * c.size }, w.bounds, w.boxes);
        const look = Math.atan2(to.x - spot.x, to.z - spot.z);
        const approach: Step[] = [{ k: 'go', to: spot, run: d > 3, near: 0.12 }, { k: 'turn', heading: look }, A];
        if (action === 'rub_cat') return [...approach, { k: 'rub', dur: 3.5, angle: Math.atan2(-dx, -dz) + Math.PI, at: other.id }, { k: 'pose', mode: 'purr', dur: 2 }];
        if (action === 'groom_cat') return [...approach, { k: 'pose', mode: 'groom', dur: 3.5 }, { k: 'pose', mode: 'purr', dur: 1.5 }];
        if (action === 'sniff_cat') return [...approach, { k: 'pose', mode: 'sniff', dur: 2.2 }, { k: 'pose', mode: 'sit', dur: 1.2 }];
        if (action === 'chase_cat') return [...approach, { k: 'pose', mode: 'crouch', dur: 0.5 }, { k: 'follow', at: other.id, dur: 4 }, { k: 'pose', mode: 'sit', dur: 1.2 }];
        if (action === 'nap_cat') return [...approach, { k: 'pose', mode: 'knead', dur: 1.6 }, { k: 'pose', mode: 'sleep', dur: 25 }, { k: 'pose', mode: 'stretch', dur: 1.6 }];
        if (action === 'hiss_cat') return [...approach, { k: 'pose', mode: 'hiss', dur: 2 }, { k: 'pose', mode: 'sit', dur: 1 }];
        if (action === 'mate_cat') return [...approach, { k: 'rub', dur: 3.2, angle: Math.atan2(-dx, -dz) + Math.PI, at: other.id }, { k: 'pose', mode: 'purr', dur: 2 }];
        return [...approach, { k: 'pose', mode: 'crouch', dur: 0.7 }, { k: 'pose', mode: 'swat', dur: 1.4 }, { k: 'pose', mode: 'reach', dur: 1.2 }, { k: 'pose', mode: 'crouch', dur: 0.5 }, { k: 'pose', mode: 'swat', dur: 1.2 }];
      }
    }
    // Игровая зона: то же занятие, что кошки делают сами; начало — когда дошла до игрушки.
    const z = zonePlans(c, w, w.need(c.id).play).find((x) => x.id === action);
    if (z) {
      const plan = z.make();
      const i = plan.findIndex((st) => st.k !== 'go');
      plan.splice(i < 0 ? plan.length : i, 0, A);
      return plan;
    }
    if (!at) return [A, { k: 'pose', mode: 'sit', dur: 1.5 }];
    const near = front(at);
    switch (action) {
      case 'books':
        return [...near, A, { k: 'pose', mode: 'reach', dur: 2.2 }, { k: 'pose', mode: 'swat', dur: 1.5 }, { k: 'pose', mode: 'sit', dur: 1.2 }];
      case 'fish':
        return [...near, A, { k: 'pose', mode: 'sit', dur: 3.5 }, { k: 'pose', mode: 'reach', dur: 1.4 }, { k: 'pose', mode: 'sit', dur: 3 }];
      case 'piano':
        return [...near, A, { k: 'pose', mode: 'reach', dur: 1.2 }, { k: 'pose', mode: 'swat', dur: 1.2 }, { k: 'pose', mode: 'reach', dur: 1.4 }, { k: 'pose', mode: 'meow', dur: 1.2 }];
      case 'cinema':
        return [...near, A, { k: 'pose', mode: 'sit', dur: 4 }, { k: 'pose', mode: 'lie', dur: 8 }];
      case 'dance':
        return [...near, A, { k: 'pose', mode: 'roll', dur: 2.6 }, { k: 'pose', mode: 'chase', dur: 1.5, tag: 'spin' }, { k: 'pose', mode: 'sit', dur: 1.2 }];
      case 'console':
        return [...near, A, { k: 'pose', mode: 'swat', dur: 1.8 }, { k: 'pose', mode: 'crouch', dur: 0.6 }, { k: 'pose', mode: 'swat', dur: 1.8 }];
      case 'paint':
        return [...near, A, { k: 'pose', mode: 'reach', dur: 1.8 }, { k: 'pose', mode: 'swat', dur: 1.4 }, { k: 'pose', mode: 'reach', dur: 1.8 }, { k: 'pose', mode: 'sit', dur: 1.2 }];
      case 'comfort_cat':
        return [...near, A, { k: 'pose', mode: 'meow', dur: 1.6 }, { k: 'pose', mode: 'sit', dur: 2 }];
      case 'mourn':
        return [...near, A, { k: 'pose', mode: 'sit', dur: 3 }, { k: 'pose', mode: 'lie', dur: 4 }];
      case 'go_demon':
      case 'go_cafe':
        return [{ k: 'go', to: at.use, run: dist(c.pos, at.use) > 3, near: 0.15 }, A, { k: 'pose', mode: 'sit', dur: 1 }];
      default:
        return [...near, A, { k: 'pose', mode: 'sit', dur: 2 }];
    }
  };

  /** Эмоция над кошкой по позе: сердечко — мурлычет и ластится, з-з-з — спит, ноты — мяукает, «!» — голодна. */
  const emoteFor = (c: CatAI, w: CatWorld): Emote | null => {
    const m = c.mode;
    if (m === 'sleep') return 'zzz';
    if (m === 'purr' || m === 'rub' || m === 'belly' || m === 'knead') return 'heart';
    if (m === 'meow') return 'note';
    if (m === 'hiss') return 'anger';
    if (c.id === w.pet) {
      const n = w.need(c.id);
      if ((n.fed < 20 || n.toilet < 15) && c.speed < 0.1 && (m === 'sit' || m === 'idle')) return 'need';
    }
    return null;
  };
  const showEmote = (c: CatAI, w: CatWorld, t: number, dt: number): void => {
    const want = emoteFor(c, w);
    const e = c.emote;
    if (want && want !== e.kind && e.k < 0.05) e.kind = want;
    e.k += ((want && want === e.kind ? 1 : 0) - e.k) * Math.min(1, dt * 5);
    if (e.k < 0.02) {
      if (e.obj) e.obj.visible = false;
      return;
    }
    if (!e.obj) {
      e.obj = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      e.obj.renderOrder = 10;
      parent.add(e.obj);
    }
    const mat = e.obj.material;
    const tex = e.kind ? emoteTextures()[e.kind] : null;
    if (tex && mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
    mat.opacity = Math.min(1, e.k * 1.2);
    e.obj.visible = true;
    const bob = Math.sin(t * 2.4 + c.seed) * 0.03;
    const s = 0.2 * c.size * (0.7 + 0.3 * e.k);
    e.obj.scale.set(s, s, 1);
    e.obj.position.set(c.pos.x + Math.sin(c.heading) * 0.12 * c.size, c.y + (c.mode === 'sleep' || c.mode === 'lie' ? 0.34 : 0.56) * c.size + bob + 0.08 * e.k, c.pos.z + Math.cos(c.heading) * 0.12 * c.size);
  };

  return {
    cats,
    toys,
    /** Кошки и игрушки по списку (новые появляются в случайном месте, лишние убираются). */
    sync(want: ReadonlyArray<{ id: string; breed: CatBreed; mix?: CatBreed; grow?: number }>, w: CatWorld): void {
      litterAt = w.litter ?? PETS.litter.pos;
      for (const [id, c] of cats) {
        if (!want.some((x) => x.id === id && catLookKey(x.breed, x) === c.cat.key)) {
          parent.remove(c.cat.root, c.shadow);
          disposeObject(c.cat.root);
          if (c.emote.obj) parent.remove(c.emote.obj);
          cats.delete(id);
        }
      }
      want.forEach((x, i) => {
        if (cats.has(x.id)) return;
        const cat = buildCat(x.breed, Number(x.id.replace(/\D/g, '')) || i + 1, x);
        const sh = shadow();
        const start = randomSpot(w);
        cat.root.position.set(start.x, 0, start.z);
        parent.add(cat.root, sh);
        const size = cat.root.children[0]?.scale.x ?? 1;
        cats.set(x.id, {
          cat, id: x.id, shadow: sh, pos: start, y: 0, heading: rand() * Math.PI * 2, mode: 'idle', plan: [], stepAt: -1, speed: 0, seed: i * 2.1, size, tilt: 0, hop: 0, jump: null, edge: null, stuck: 0,
          ateAt: -999, drankAt: -999, litterAt: -999, called: -1, log: { eat: 0, drink: 0, litter: 0, perch: 0, hunt: 0, rub: 0, play: 0, fun: 0, act: 0 }, busyAt: 0, squash: 0, lean: 0, last: { ...start }, vel: 0, emote: { obj: null, kind: null, k: 0 },
        });
      });
      if (!want.length || w.play === null) {
        for (const toy of toys) {
          parent.remove(toy.obj);
          disposeObject(toy.obj);
        }
        toys.length = 0;
      } else if (!toys.length) {
        for (const [kind, at] of [['ball', { x: -1.4, z: 0.6 }], ['mouse', { x: 2.2, z: -0.4 }]] as const) {
          const obj = buildToy(kind);
          const pos = resolve(at, w.bounds, w.boxes);
          obj.position.set(pos.x, 0, pos.z);
          parent.add(obj);
          toys.push({ obj, pos, vel: { x: 0, z: 0 }, kind });
        }
      }
    },
    /** Поставить кошку в точку (вход в новое место) — без прыжков и планов. */
    place(id: string, p: P2, heading = 0): void {
      const c = cats.get(id);
      if (!c) return;
      c.pos = { ...p };
      c.y = 0;
      c.jump = null;
      c.edge = null;
      c.plan = [];
      c.stepAt = -1;
      c.speed = 0;
      c.vel = 0;
      c.last = { ...p };
      c.heading = heading;
    },
    /** Стик: направление по полу (x, z) и сила 0…1. */
    steer(x: number, z: number, mag: number): void {
      steer.x = x;
      steer.z = z;
      steer.mag = mag;
    },
    /** Кошка игрока идёт к точке (касание пола, самостоятельность). */
    goTo(id: string, to: P2, w: CatWorld, t: number): void {
      const c = cats.get(id);
      if (!c || job) return;
      c.busyAt = t;
      c.plan = [{ k: 'go', to: resolve(to, w.bounds, w.boxes), run: dist(c.pos, to) > 3.5, near: 0.2 }];
      c.stepAt = -1;
    },
    /** Идёт ли кошка игрока куда-то (план из шага «дойти»). */
    walking(id: string): boolean {
      const st = cats.get(id)?.plan[0];
      return !!st && st.k === 'go';
    },
    /** Начать действие кошки игрока у предмета at (с кошкой target — для действий с кошкой). */
    perform(id: string, pf: { key: number; action: string; at: Placed | null; target: string | null }, w: CatWorld, t: number): void {
      const c = cats.get(id);
      if (!c) {
        job = null;
        return;
      }
      const other = pf.target ? (cats.get(pf.target) ?? null) : null;
      if (other && other.y > 0.05 && !other.jump) {
        const to = other.edge ?? resolve({ x: other.pos.x, z: other.pos.z + 0.6 }, w.bounds, w.boxes);
        other.plan = [{ k: 'jump', to, y: 0 }];
        other.stepAt = -1;
      }
      job = { key: pf.key, action: pf.action, motion: JOB_MOTION[pf.action] ?? 'none', cat: other ? other.id : null, settledAt: null };
      c.busyAt = t;
      c.plan = actionPlan(c, pf.action, pf.at, w, other);
      c.stepAt = -1;
    },
    /** Действие закончено (результат применён): другие кошки снова живут сами. */
    endJob(): void {
      job = null;
    },
    jobKey(): number | null {
      return job ? job.key : null;
    },
    /** Сколько кошек бегает в колесе (колесо крутится). */
    inWheel(): number {
      let n = 0;
      for (const c of cats.values()) {
        const st = c.plan[0];
        if (st && st.k === 'pose' && st.tag === 'wheel' && !c.jump) n += 1;
      }
      return n;
    },
    /** Ближайшая к точке кошка (кроме except). */
    nearest(p: P2, except?: string | null): CatAI | null {
      let best: CatAI | null = null;
      for (const c of cats.values()) if (c.id !== except && (!best || dist(p, c.pos) < dist(p, best.pos))) best = c;
      return best;
    },
    /** Кадр: поведение, позы, тени, эмоции; игрушки катятся и отскакивают. */
    update(t: number, dt: number, w: CatWorld, render = true): void {
      litterAt = w.litter ?? PETS.litter.pos;
      dtLast = dt;
      const blend = 1 - Math.exp(-dt * 7);
      const me = w.pet ? cats.get(w.pet) : undefined;
      for (const c of cats.values()) {
        const h0 = c.heading;
        updateCat(c, t, dt, w);
        if (!render) continue;
        const mine = c === me;
        // Голова поворачивается к кошке игрока (или у неё — к ближайшей кошке рядом).
        let look = 0;
        const focus = mine ? [...cats.values()].filter((o) => o !== c).sort((a1, b1) => dist(a1.pos, c.pos) - dist(b1.pos, c.pos))[0]?.pos : me?.pos;
        if (focus && dist(focus, c.pos) < 2.8 && dist(focus, c.pos) > 0.05) look = Math.max(-1, Math.min(1, angleTo(c.heading, Math.atan2(focus.x - c.pos.x, focus.z - c.pos.z)) / 1.2));
        // Скорость для шага — настоящая (сколько кошка прошла за кадр): лапы не «буксуют» у мебели и
        // не семенят на месте; в колесе — скорость колеса.
        const step = c.plan[0];
        const inWheel = !!step && step.k === 'pose' && step.tag === 'wheel';
        const moved = dt > 0 ? dist(c.last, c.pos) / dt : 0;
        c.last = { ...c.pos };
        c.vel += ((c.jump ? 0 : Math.min(3, moved)) - c.vel) * Math.min(1, dt * 10);
        const pace = inWheel ? c.speed : c.vel;
        const turnRate = angleTo(h0, c.heading) / Math.max(dt, 1e-3);
        let mode: CatMode = c.mode === 'walk' || c.mode === 'trot' ? (pace > 0.06 ? c.mode : 'idle') : c.mode;
        // Разворот на месте — переступает лапами, а не крутится на скользящих лапах.
        let animPace = pace;
        if ((mode === 'idle' || mode === 'walk') && !c.jump && c.y < 0.05 && Math.abs(turnRate) > 1.2 && pace < 0.25) {
          mode = 'walk';
          animPace = Math.max(pace, Math.min(0.35, Math.abs(turnRate) * 0.12));
        }
        poseCat(c.cat, mode, t + c.seed, animPace, blend, mode === 'sleep' || mode === 'belly' ? 0 : look, c.tilt);
        // Крен на бегу в повороте (внутрь поворота), мягко.
        const leanWant = c.jump || c.y > 0.05 ? 0 : Math.max(-0.22, Math.min(0.22, -turnRate * pace * 0.05));
        c.lean += (leanWant - c.lean) * Math.min(1, dt * 6);
        // Приземлилась — коротко присела (и чуть раздалась в стороны).
        c.squash = Math.max(0, c.squash - dt * 5);
        const sq = Math.sin(c.squash * Math.PI) * 0.09;
        c.cat.root.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
        c.cat.root.position.set(c.pos.x, c.y + c.hop, c.pos.z);
        c.cat.root.rotation.set(0, c.heading, c.lean);
        c.shadow.position.set(c.pos.x, c.jump ? 0.015 : c.y + 0.015, c.pos.z);
        c.shadow.scale.setScalar(c.jump ? Math.max(0.5, 1 - c.y * 0.8) : 1);
        showEmote(c, w, t, dt);
      }
      for (const toy of toys) {
        const v = Math.hypot(toy.vel.x, toy.vel.z);
        if (v < 0.01) continue;
        const next = { x: toy.pos.x + toy.vel.x * dt, z: toy.pos.z + toy.vel.z * dt };
        const r = resolve(next, w.bounds, w.boxes);
        if (Math.abs(r.x - next.x) > 1e-4) toy.vel.x = -toy.vel.x * 0.6;
        if (Math.abs(r.z - next.z) > 1e-4) toy.vel.z = -toy.vel.z * 0.6;
        toy.pos = r;
        const f = Math.exp(-dt * (toy.kind === 'ball' ? 1.3 : 3));
        toy.vel.x *= f;
        toy.vel.z *= f;
        toy.obj.position.set(toy.pos.x, 0, toy.pos.z);
        toy.obj.rotation.y = Math.atan2(toy.vel.x, toy.vel.z);
        const spin = toy.obj.getObjectByName('spin');
        if (spin) spin.rotation.x += (v * dt) / 0.045;
      }
    },
  };
}

export type CatLife = ReturnType<typeof createCatLife>;
