import * as THREE from 'three';
import { MAP, TILE, TOWNS } from '../../game/city/content';
import { buildRadius, tileAt } from '../../game/city/city';
import { buildingAt, hourOf, townLevel } from '../../game/city/sim';
import { spotsOf, type SpotPose } from '../../game/city/spots';
import type { CityCat, CityState } from '../../game/city/types';
import { setupRenderer } from '../game/three/studio';
import { Ambient, lightPool, type Emitter } from './ambient';
import { MAT, buildingModel, chimneyOf, fireModel, modelKey } from './buildings';
import { animateChibi, buildChibi, catOutfit, disposeChibi, setOutfit, type Chibi, type ChibiPose } from './chibi';
import { buildGround, disposeGround } from './nature';

/**
 * 3D-город: земля с дорожками по границам клеток, лес за пределами поселения, здания, кошки.
 * Камера сверху-спереди: перетаскивание — сдвиг, колесо и щипок — приближение. Касание — кошка
 * или клетка. Свет меняется со временем суток (ночью светятся окна и фонари).
 */

export type Tap = { kind: 'cat'; id: number } | { kind: 'tile'; gx: number; gz: number };

export interface ViewOpts {
  live(): CityState | null;
  onTap(t: Tap): void;
}

interface CatView {
  ch: Chibi;
  key: string;
  /** Плавная позиция и поворот. */
  x: number;
  z: number;
  y: number;
  h: number;
  last: [number, number];
  speed: number;
}

const POSE: Record<SpotPose, ChibiPose> = {
  hidden: 'sleep',
  bed: 'sleep',
  stand: 'idle',
  sit: 'sit',
  work: 'work',
  swing: 'swing',
  slide: 'slide',
  ride: 'ride',
  fish: 'fish',
  climb: 'sit',
  eat: 'eat',
  shop: 'shop',
  pray: 'pray',
  hammer: 'hammer',
  play: 'play',
  dance: 'dance',
};

const ZOOM_MIN = 7;
const ZOOM_MAX = 60;

/** Подпись над кошкой (имя). */
function labelSprite(text: string): THREE.Sprite {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
  if (c) {
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '700 30px system-ui, sans-serif';
    const w = Math.min(244, g.measureText(text).width + 28);
    g.fillStyle = 'rgba(30,24,40,0.82)';
    g.beginPath();
    g.roundRect(128 - w / 2, 8, w, 46, 23);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 32);
    mat.map = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(1.0, 0.25, 1);
  s.renderOrder = 20;
  return s;
}

function zzzTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '900 44px system-ui, sans-serif';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(40,40,80,0.8)';
  g.fillStyle = '#ffffff';
  for (const [t, x, y, s] of [['z', 30, 96, 36], ['z', 60, 66, 46], ['Z', 94, 34, 58]] as const) {
    g.font = `900 ${s}px system-ui, sans-serif`;
    g.strokeText(t, x, y);
    g.fillText(t, x, y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKY = {
  day: new THREE.Color('#bfe6ff'),
  dusk: new THREE.Color('#ffc59a'),
  night: new THREE.Color('#1d2448'),
};

export class CityView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  private sun = new THREE.DirectionalLight('#fff3df', 2.4);
  private hemi = new THREE.HemisphereLight('#fff6e8', '#6f8f6a', 1.15);
  private world = new THREE.Group();
  private ground = new THREE.Group();
  private groundKey = '';
  private buildings = new Map<number, { key: string; g: THREE.Group; fire?: THREE.Group; zzz?: THREE.Sprite; alpha: number }>();
  private cats = new Map<number, CatView>();
  private marker: THREE.Mesh;
  private tileMark: THREE.Mesh;
  private label: THREE.Sprite | null = null;
  private labelFor = -1;
  private zzzTex = zzzTexture();
  private ambient = new Ambient();
  private fog = new THREE.Fog('#bfe6ff', 60, 140);
  /** 1 — день, 0 — ночь (для мелочей вроде бабочек и светлячков). */
  private dayK = 1;
  /** Куда смотрит камера и насколько далеко. */
  target = new THREE.Vector3(0, 0, 2);
  distance = 22;
  selectedCat: number | null = null;
  selectedTile: [number, number] | null = null;
  buildMode = false;
  /** Вид внутрь всех домов и мастерских (крыши и фасады прозрачные). */
  xray = false;
  follow = false;
  private raf = 0;
  private prev = 0;
  private disposed = false;

  constructor(
    private canvasHost: HTMLElement,
    private opts: ViewOpts,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    setupRenderer(this.renderer, true);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.appendChild(this.renderer.domElement);
    this.scene.add(this.world, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.world.add(this.ground, this.ambient.group);
    this.scene.fog = this.fog;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.world.add(this.marker);
    this.tileMark = new THREE.Mesh(new THREE.PlaneGeometry(TILE - 0.5, TILE - 0.5), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.35, depthWrite: false }));
    this.tileMark.rotation.x = -Math.PI / 2;
    this.tileMark.position.y = 0.08;
    this.tileMark.visible = false;
    this.world.add(this.tileMark);
    this.resize();
    this.bindInput();
    this.prev = performance.now();
    const loop = (now: number): void => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.prev) / 1000);
      this.prev = now;
      this.frame(now / 1000, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize(): void {
    const w = this.canvasHost.clientWidth || 1;
    const h = this.canvasHost.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // Узкий экран (телефон стоя): угол обзора шире, чтобы по горизонтали было видно не меньше 30°.
    this.camera.fov = Math.max(32, (2 * Math.atan(Math.tan((15 * Math.PI) / 180) / (w / h)) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind?.();
    for (const c of this.cats.values()) disposeChibi(c.ch);
    this.ambient.dispose();
    for (const o of this.ground.children) disposeGround(o);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ─── Ввод ────────────────────────────────────────────────────────────

  private unbind?: () => void;
  private bindInput(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const down = (e: PointerEvent): void => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent): void => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        // Сдвиг: пиксели → метры на уровне земли.
        const k = (this.distance * 0.0016 * 900) / (this.canvasHost.clientHeight || 800);
        this.target.x -= dx * k;
        this.target.z -= dy * k * 1.35;
        this.follow = false;
        this.clampTarget();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) this.zoomBy(pinch / d);
        pinch = d;
        moved += 100;
      }
    };
    const up = (e: PointerEvent): void => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (p && pts.size === 0 && moved < 8) this.tap(e.clientX, e.clientY);
      if (pts.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0012));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    this.unbind = () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }

  zoomBy(k: number): void {
    this.distance = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.distance * k));
  }

  private clampTarget(): void {
    const lim = (MAP + 1) * TILE;
    this.target.x = Math.max(-lim, Math.min(lim, this.target.x));
    this.target.z = Math.max(-lim, Math.min(lim + 4, this.target.z));
  }

  /** Касание: кошка (ближайшая к лучу) или клетка под пальцем. */
  private tap(cx: number, cy: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let best: number | null = null;
    let bd = Infinity;
    const p = new THREE.Vector3();
    for (const [id, c] of this.cats) {
      if (!c.ch.root.visible) continue;
      p.set(c.x, c.y + 0.32, c.z);
      const d = ray.ray.distanceToPoint(p);
      const lim = 0.35 + this.distance * 0.012;
      if (d < lim && d < bd) {
        bd = d;
        best = id;
      }
    }
    if (best !== null) {
      this.opts.onTap({ kind: 'cat', id: best });
      return;
    }
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      const gx = Math.round(hit.x / TILE);
      const gz = Math.round(hit.z / TILE);
      if (Math.abs(gx) <= MAP && Math.abs(gz) <= MAP) this.opts.onTap({ kind: 'tile', gx, gz });
    }
  }

  /** Навести камеру на точку (м). */
  focus(x: number, z: number, dist?: number): void {
    this.target.set(x, 0, z);
    if (dist) this.distance = dist;
    this.clampTarget();
  }

  // ─── Земля ───────────────────────────────────────────────────────────

  private buildGround(c: CityState): void {
    const R = Math.min(MAP, buildRadius(c));
    const key = `${R}|${c.buildings.map((b) => `${b.gx},${b.gz}`).join(';')}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    for (const o of [...this.ground.children]) {
      disposeGround(o);
      this.ground.remove(o);
    }
    this.ground.add(buildGround(c, R));
  }

  // ─── Кадр ────────────────────────────────────────────────────────────

  private frame(t: number, dt: number): void {
    const c = this.opts.live();
    if (!c) return;
    this.buildGround(c);
    this.syncBuildings(c, t, dt);
    this.syncCats(c, t, dt);
    this.light(c);
    this.ambient.update(t, dt, this.dayK, this.emitters(c), this.anchors(c));
    // Камера: следует за выбранной кошкой (если включено), сверху-спереди.
    if (this.follow && this.selectedCat !== null) {
      const cv = this.cats.get(this.selectedCat);
      if (cv) this.target.lerp(new THREE.Vector3(cv.x, 0, cv.z), Math.min(1, dt * 3));
    }
    const d = this.distance;
    this.camera.position.set(this.target.x, this.target.y + d * 0.78, this.target.z + d * 0.72);
    this.camera.lookAt(this.target.x, 0, this.target.z);
    // Отметки: кольцо под кошкой, клетка стройки.
    const sel = this.selectedCat !== null ? this.cats.get(this.selectedCat) : undefined;
    this.marker.visible = !!sel && sel.ch.root.visible;
    if (sel) {
      this.marker.position.set(sel.x, sel.y + 0.03, sel.z);
      this.marker.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      if (this.labelFor !== this.selectedCat) {
        if (this.label) this.world.remove(this.label);
        const k = c.cats.find((x) => x.id === this.selectedCat);
        this.label = k ? labelSprite(catLabel(k)) : null;
        if (this.label) this.world.add(this.label);
        this.labelFor = this.selectedCat ?? -1;
      }
      if (this.label) {
        this.label.visible = sel.ch.root.visible;
        this.label.position.set(sel.x, sel.y + 0.95, sel.z);
        const s = Math.max(0.6, this.distance / 22);
        this.label.scale.set(1.0 * s, 0.25 * s, 1);
      }
    } else if (this.label) {
      this.world.remove(this.label);
      this.label = null;
      this.labelFor = -1;
    }
    this.tileMark.visible = !!this.selectedTile;
    if (this.selectedTile) {
      this.tileMark.position.x = this.selectedTile[0] * TILE;
      this.tileMark.position.z = this.selectedTile[1] * TILE;
      (this.tileMark.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 4) * 0.12;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** День и ночь по игровому времени. */
  private light(c: CityState): void {
    const h = hourOf(c.clock);
    // 0 — ночь, 1 — день; сумерки 5–7 и 18–21.
    const day = h < 5 ? 0 : h < 7 ? (h - 5) / 2 : h < 18 ? 1 : h < 21 ? 1 - (h - 18) / 3 : 0;
    const dusk = (h > 17 && h < 21) || (h > 5 && h < 7.5) ? 1 - Math.abs(day - 0.5) * 2 : 0;
    const sky = SKY.night.clone().lerp(SKY.day, day).lerp(SKY.dusk, dusk * 0.6);
    this.scene.background = sky;
    this.fog.color.copy(sky);
    this.dayK = day;
    this.sun.intensity = 0.25 + 2.3 * day;
    this.sun.color.set(dusk > 0.3 ? '#ffc890' : '#fff3df');
    this.hemi.intensity = 0.45 + 0.75 * day;
    const ang = ((h - 6) / 12) * Math.PI;
    this.sun.position.set(this.target.x + Math.cos(ang) * 25, 30 + Math.sin(Math.max(0.2, ang)) * 20, this.target.z + 18);
    this.sun.target.position.copy(this.target);
    const night = 1 - day;
    MAT.window.emissiveIntensity = night * 1.3;
    MAT.glow.emissiveIntensity = 0.2 + night * 2;
    MAT.bulb.emissiveIntensity = 0.2 + night * 1.8;
  }

  /** Трубы, из которых сейчас идёт дым: дома, где кто-то не спит, и печи, у которых работают. */
  private emitters(c: CityState): Emitter[] {
    const out: Emitter[] = [];
    const busy = new Map<number, number>();
    for (const k of c.cats) if (k.act.at !== null && !k.act.path?.length && k.act.kind !== 'sleep') busy.set(k.act.at, (busy.get(k.act.at) ?? 0) + 1);
    const h = hourOf(c.clock);
    const cooking = (h > 6 && h < 9) || (h > 17 && h < 21);
    for (const b of c.buildings) {
      const p = chimneyOf(b);
      if (!p) continue;
      const on = b.kind === 'house' ? busy.has(b.id) || (cooking && c.cats.some((k) => k.home === b.id)) : busy.has(b.id);
      if (on) out.push({ x: b.gx * TILE + p[0], y: p[1], z: b.gz * TILE + p[2], rate: b.kind === 'house' ? 1.1 : 1.8 });
    }
    return out;
  }

  /** Где порхают бабочки и светлячки: скверы, клумбы, пруд, дворы домов и опушка. */
  private anchors(c: CityState): Array<[number, number]> {
    if (this.anchorKey === c.buildings.length) return this.anchorList;
    const out: Array<[number, number]> = [];
    for (const b of c.buildings) {
      if (b.kind === 'amenity' || b.type === 'pond' || b.type === 'playground') out.push([b.gx * TILE, b.gz * TILE + 0.5], [b.gx * TILE + 1, b.gz * TILE - 0.6]);
      else if (b.kind === 'house') out.push([b.gx * TILE + 1.2, b.gz * TILE + 0.8]);
    }
    const R = (Math.min(MAP, buildRadius(c)) + 1) * TILE;
    for (let i = 0; i < 8; i += 1) out.push([Math.cos(i * 0.785) * R, Math.sin(i * 0.785) * R]);
    this.anchorKey = c.buildings.length;
    this.anchorList = out;
    return out;
  }
  private anchorKey = -1;
  private anchorList: Array<[number, number]> = [];

  /** Насколько видна крыша здания (1 — сплошная, меньше — видно, что внутри). */
  roofAlpha(id: number): number {
    return this.buildings.get(id)?.alpha ?? 1;
  }

  private syncBuildings(c: CityState, t: number, dt: number): void {
    const seen = new Set<number>();
    const open = new Set<number>();
    for (const b of c.buildings) if (this.xray && (b.kind === 'house' || b.kind === 'workshop')) open.add(b.id);
    if (this.selectedTile) {
      const b = tileAt(c, this.selectedTile[0], this.selectedTile[1]);
      if (b) open.add(b.id);
    }
    if (this.selectedCat !== null) {
      const k = c.cats.find((x) => x.id === this.selectedCat);
      if (k && k.act.at !== null && !k.act.path?.length) open.add(k.act.at);
    }
    const now = Date.now();
    const sleeping = new Set<number>();
    for (const k of c.cats) if (k.act.kind === 'sleep' && !k.act.path && k.act.at !== null) sleeping.add(k.act.at);
    for (const b of c.buildings) {
      seen.add(b.id);
      const key = modelKey(b);
      let v = this.buildings.get(b.id);
      if (!v || v.key !== key) {
        if (v) this.world.remove(v.g);
        const g = buildingModel(b);
        g.position.set(b.gx * TILE, 0, b.gz * TILE);
        addPools(g);
        this.world.add(g);
        v = { key, g, alpha: 1 };
        this.buildings.set(b.id, v);
        // Появление: здание «вырастает».
        g.scale.setScalar(0.01);
      }
      const g = v.g;
      if (g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + 0.05));
      // Огонь над пепелищем, пока горит.
      const burning = (b.fireUntil ?? 0) > now;
      if (burning && !v.fire) {
        v.fire = fireModel();
        g.add(v.fire);
      }
      if (v.fire) {
        v.fire.visible = burning;
        if (burning) animateFire(v.fire, t, (b.fireUntil! - now) / 45000);
      }
      // «З-з-з» над домом, где спят.
      const zz = sleeping.has(b.id);
      if (zz && !v.zzz && this.zzzTex) {
        v.zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zzzTex, transparent: true, depthWrite: false }));
        v.zzz.scale.set(0.9, 0.9, 1);
        g.add(v.zzz);
      }
      if (v.zzz) {
        v.zzz.visible = zz;
        v.zzz.position.set(0.6, 2.4 + b.level * 0.35 + Math.sin(t * 1.5 + b.id) * 0.1, 0);
      }
      tickBuilding(g, b.type, t, c);
      // Прозрачная крыша и фасад: режим «внутрь», выбранное здание или здание, где сидит выбранная кошка.
      const want = open.has(b.id) ? CUT_ALPHA : 1;
      v.alpha += (want - v.alpha) * Math.min(1, dt * 7);
      if (Math.abs(v.alpha - want) < 0.01) v.alpha = want;
      applyCut(g, v.alpha);
    }
    for (const [id, v] of this.buildings)
      if (!seen.has(id)) {
        this.world.remove(v.g);
        this.buildings.delete(id);
      }
  }

  private syncCats(c: CityState, t: number, dt: number): void {
    const seen = new Set<number>();
    for (const k of c.cats) {
      seen.add(k.id);
      const key = `${k.coat}|${k.profession}|${k.items.join(',')}`;
      let v = this.cats.get(k.id);
      if (!v || v.key !== key) {
        if (v) {
          this.world.remove(v.ch.root);
          disposeChibi(v.ch);
        }
        const ch = buildChibi(k.coat, k.profession, k.items, k.id);
        this.world.add(ch.root);
        v = { ch, key, x: k.x, z: k.z, y: 0, h: k.heading, last: [k.x, k.z], speed: 0 };
        this.cats.set(k.id, v);
      }
      this.placeCat(c, k, v, t, dt);
    }
    for (const [id, v] of this.cats)
      if (!seen.has(id)) {
        this.world.remove(v.ch.root);
        disposeChibi(v.ch);
        this.cats.delete(id);
      }
  }

  /** Где и как стоит кошка: в пути — шагает; на месте — поза места (качели, карусель, работа…). */
  private placeCat(c: CityState, k: CityCat, v: CatView, t: number, dt: number): void {
    const a = k.act;
    const walking = !!a.path && a.path.length > 0;
    const moved = Math.hypot(k.x - v.last[0], k.z - v.last[1]);
    v.last = [k.x, k.z];
    v.speed += ((dt > 0 ? moved / dt : 0) - v.speed) * Math.min(1, dt * 8);
    let x = k.x;
    let z = k.z;
    let y = 0;
    let h = k.heading;
    let pose: ChibiPose = walking ? 'walk' : 'idle';
    let visible = true;
    const b = buildingAt(c, a.at);
    if (!walking && b && a.spot !== undefined) {
      const spots = spotsOf(b, a.use);
      const sp = spots[a.spot % spots.length]!;
      pose = POSE[sp.pose];
      if (sp.pose === 'hidden') visible = false;
      // В доме кошку видно, только когда крыша и фасад прозрачные.
      if (b.kind === 'house' && (a.use === 'bed' || a.use === 'table' || a.use === 'inside') && this.roofAlpha(b.id) > 0.6) visible = false;
      y = sp.y;
      h = sp.h;
      const cx = b.gx * TILE;
      const cz = b.gz * TILE;
      if (sp.pose === 'swing') {
        const sw = Math.sin(t * 2.2 + k.id) * 0.5;
        z = cz + sp.z + Math.sin(sw) * 1.0;
        y = 0.32 + (1 - Math.cos(sw)) * 1.0;
        x = cx + sp.x;
      } else if (sp.pose === 'ride') {
        const ang = (sp.h + t * 0.6) % (Math.PI * 2);
        x = cx + Math.sin(ang) * 1.15;
        z = cz + Math.cos(ang) * 1.15;
        y = 0.62 + Math.sin(t * 3 + sp.h) * 0.08;
        h = ang + Math.PI / 2;
      } else if (sp.pose === 'slide') {
        // Цикл: залезть, съехать, обойти.
        const u = (t * 0.25 + k.id * 0.3) % 1;
        if (u < 0.5) {
          const s = u / 0.5;
          x = cx - 1.05;
          z = cz - 0.6 + s * 1.3;
          y = 1.05 - s * 0.95;
          h = 0;
        } else {
          const s = (u - 0.5) / 0.5;
          x = cx - 1.05;
          z = cz + 0.7 - s * 1.3;
          y = s > 0.8 ? (s - 0.8) * 5 * 1.05 : 0;
          pose = s > 0.8 ? 'sit' : 'walk';
          h = Math.PI;
        }
      } else if (sp.pose === 'play') {
        x = cx + sp.x;
        z = cz + sp.z;
      } else {
        x = cx + sp.x;
        z = cz + sp.z;
      }
    }
    // Спит в кровати: лёжа на спинке, головой на подушке.
    const lying = !walking && a.kind === 'sleep' && !!b && b.kind === 'house';
    if (lying) {
      pose = 'sleep';
      y += 0.15;
      h = 0;
    } else if (a.kind === 'sleep' && !walking) visible = false;
    // Плавность: позиция следует за симуляцией, поворот — по кратчайшей дуге.
    const follow = 1 - Math.exp(-dt * 14);
    const jump = Math.hypot(x - v.x, z - v.z) > 3;
    v.x = jump ? x : v.x + (x - v.x) * follow;
    v.z = jump ? z : v.z + (z - v.z) * follow;
    v.y += (y - v.y) * follow;
    let dh = h - v.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    v.h += dh * Math.min(1, dt * 10);
    const root = v.ch.root;
    root.visible = visible;
    root.position.set(v.x, v.y, v.z);
    root.rotation.y = v.h;
    root.rotation.x += ((lying ? -Math.PI / 2 : 0) - root.rotation.x) * Math.min(1, dt * 8);
    // Рабочая форма — только на рабочем месте; во сне — пижама; в остальное время — своя одежда.
    setOutfit(v.ch, catOutfit(k));
    if (visible) animateChibi(v.ch, pose, t + k.id * 0.37, dt, walking ? Math.max(0.5, v.speed) : 0, k.profession);
  }
}

const catLabel = (k: CityCat): string => {
  // Имя на языке интерфейса подставляет экран; здесь — по-русски по умолчанию.
  return labelName(k);
};
let labelName: (k: CityCat) => string = (k) => String(k.name);
/** Как подписывать кошку (имя на языке интерфейса). */
export function setLabelName(f: (k: CityCat) => string): void {
  labelName = f;
}

function animateFire(g: THREE.Group, t: number, left: number): void {
  const k = Math.max(0.3, Math.min(1, left * 1.5));
  g.children.forEach((f, i) => {
    if (f.name === 'smoke') {
      const u = (t * 0.35 + (f.userData.k as number)) % 1;
      f.position.set(Math.sin(i * 2.1) * 0.6, 1.2 + u * 3.5, Math.cos(i * 1.7) * 0.5 - 0.2);
      f.scale.setScalar(0.5 + u * 1.6);
      ((f as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - u);
      return;
    }
    const s = (0.75 + Math.sin(t * 9 + i * 1.7) * 0.2) * k;
    f.scale.set(s, s * (1 + Math.sin(t * 13 + i) * 0.15), s);
  });
}

/** Движущиеся части зданий: качели, карусель, фонтан, огонь храма, угольки. */
function tickBuilding(g: THREE.Object3D, type: string, t: number, c: CityState): void {
  if (type === 'temple') {
    const flame = g.getObjectByName('flame');
    if (flame) flame.scale.set(1 + Math.sin(t * 8) * 0.08, 1 + Math.sin(t * 11) * 0.15, 1 + Math.cos(t * 8) * 0.08);
    const halo = g.getObjectByName('halo') as THREE.Mesh | undefined;
    if (halo) {
      const on = !!c.offering?.complete;
      const m = halo.material as THREE.MeshBasicMaterial;
      m.opacity = on ? 0.55 + Math.sin(t * 2) * 0.25 : 0;
      halo.position.y = 0.5 + Math.sin(t) * 0.2;
      halo.rotation.z = t * 0.3;
    }
    return;
  }
  if (type === 'carousel') {
    const s = g.getObjectByName('spin');
    if (s) s.rotation.y = t * 0.6;
  }
  if (type === 'playground') {
    let i = 0;
    g.traverse((o) => {
      if (o.name === 'swing') {
        o.rotation.x = Math.sin(t * 2.2 + i) * 0.35;
        i += 1;
      }
    });
  }
  if (type === 'fountain') {
    const j = g.getObjectByName('jet');
    if (j) j.scale.set(1 + Math.sin(t * 6) * 0.05, 1 + Math.sin(t * 5) * 0.1, 1 + Math.cos(t * 6) * 0.05);
  }
  if (type === 'ash')
    g.traverse((o) => {
      if (o.name === 'ember') o.scale.setScalar(0.6 + Math.abs(Math.sin(t * 3 + o.position.x * 5)) * 0.8);
    });
}

/** Сколько клеток открыто (для подсказок). */
export const openRadius = (c: CityState): number => Math.min(MAP, TOWNS[townLevel(c)]!.radius);
export { tileAt };

/** Крыша и фасад при взгляде внутрь: такая прозрачность. */
const CUT_ALPHA = 0.14;

/** Прозрачность съёмной части здания (группа «cut»): контур и окна прячутся, тень не падает. */
function applyCut(g: THREE.Object3D, alpha: number): void {
  const cut = g.getObjectByName('cut');
  if (!cut || cut.userData.alpha === alpha) return;
  cut.userData.alpha = alpha;
  const solid = alpha >= 0.999;
  cut.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.outlineHull) {
      m.visible = alpha > 0.9;
      return;
    }
    if (m.name === 'cutShell') {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = alpha;
      // Смена прозрачности меняет шейдер (OPAQUE): без needsUpdate крыша так и остаётся сплошной.
      if (mat.transparent !== !solid) {
        mat.transparent = !solid;
        mat.needsUpdate = true;
      }
      mat.depthWrite = solid;
      m.castShadow = alpha > 0.5;
      return;
    }
    // Окна и вывеска.
    m.visible = alpha > 0.55;
  });
}

/** Под каждой светящейся деталью (фонарь, лампа) — пятно света на земле или полу, видно ночью. */
function addPools(g: THREE.Object3D): void {
  const found: THREE.Vector3[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.material !== MAT.glow) return;
    m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere!;
    // Мелкие огоньки гирлянд пятен не дают; близкие пятна сливаются в одно.
    if (bs.radius < 0.04) return;
    const p = bs.center.clone().add(m.position);
    if (found.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 0.6)) return;
    found.push(p);
  });
  for (const p of found) g.add(lightPool(p.x, 0.17, p.z + 0.05, Math.max(0.45, Math.min(1.3, p.y * 0.95))));
}
