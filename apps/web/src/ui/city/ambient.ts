import * as THREE from 'three';

/**
 * Живые мелочи города: дымок из труб (пока внутри кто-то готовит или работает), бабочки днём
 * у цветов и скверов, светлячки ночью, светлые пятна под фонарями. Всё — инстансы и общие
 * материалы, без отдельных источников света.
 */

export interface Emitter {
  x: number;
  y: number;
  z: number;
  /** Пуфов в секунду. */
  rate: number;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  s: number;
  dx: number;
}

const PUFFS = 140;
const FLIES = 16;
const BUGS = 46;

let poolTex: THREE.Texture | null = null;
/** Мягкое круглое пятно света (радиальный градиент). */
function poolTexture(): THREE.Texture | null {
  if (poolTex) return poolTex;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  poolTex = new THREE.CanvasTexture(cv);
  return poolTex;
}

/** Общий материал пятен света под фонарями: прозрачность меняется с ночью. */
export const POOL = new THREE.MeshBasicMaterial({ color: '#ffc861', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: poolTexture() });

/** Пятно света на земле под светящейся деталью здания. */
export function lightPool(x: number, y: number, z: number, r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), POOL);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.renderOrder = 2;
  m.name = 'pool';
  return m;
}

export class Ambient {
  readonly group = new THREE.Group();
  private smoke: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private acc = new Map<string, number>();
  private flies: THREE.InstancedMesh;
  private bugs: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private seeds: number[] = [];

  constructor() {
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 1, transparent: true, opacity: 0.72, depthWrite: false }), PUFFS);
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;
    // Бабочка: два треугольных крыла, раскрываются по оси x.
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, 0.16, 0, 0.1, 0.12, 0, -0.08, 0, 0, 0.06, 0.12, 0, -0.08, 0, 0, -0.04, 0, 0, 0.06, -0.12, 0, -0.08, -0.16, 0, 0.1, 0, 0, 0.06, 0, 0, -0.04, -0.12, 0, -0.08], 3));
    wing.computeVertexNormals();
    this.flies = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), FLIES);
    this.flies.frustumCulled = false;
    const cols = ['#ffd93d', '#ff9fc8', '#8ac7ff', '#ffffff', '#ffb36b', '#c7a4ff'];
    const c = new THREE.Color();
    for (let i = 0; i < FLIES; i += 1) this.flies.setColorAt(i, c.set(cols[i % cols.length]!));
    this.bugs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#f6ff9a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), BUGS);
    this.bugs.frustumCulled = false;
    for (let i = 0; i < 64; i += 1) this.seeds.push(Math.abs(Math.sin(i * 91.7) * 1000) % 1);
    this.group.add(this.smoke, this.flies, this.bugs);
  }

  /**
   * Кадр: дым из активных труб, бабочки у точек-якорей днём (day → 1), светлячки ночью.
   * anchors — места с цветами и деревьями (центры скверов, дворов, опушка).
   */
  update(t: number, dt: number, day: number, emitters: Emitter[], anchors: Array<[number, number]>): void {
    // Дым.
    for (const e of emitters) {
      const key = `${e.x.toFixed(2)},${e.z.toFixed(2)}`;
      let a = (this.acc.get(key) ?? Math.random()) + e.rate * dt;
      while (a >= 1 && this.puffs.length < PUFFS) {
        a -= 1;
        this.puffs.push({ x: e.x + (Math.random() - 0.5) * 0.06, y: e.y, z: e.z, age: 0, life: 3.2 + Math.random() * 1.2, s: 0.7 + Math.random() * 0.5, dx: 0.12 + Math.random() * 0.1 });
      }
      this.acc.set(key, Math.min(a, 1));
    }
    let n = 0;
    this.puffs = this.puffs.filter((p) => (p.age += dt) < p.life);
    for (const p of this.puffs) {
      const u = p.age / p.life;
      this.dummy.position.set(p.x + p.dx * p.age + Math.sin(p.age * 2 + p.s * 9) * 0.06, p.y + p.age * 0.42, p.z - p.age * 0.05);
      this.dummy.rotation.set(p.age, p.age * 0.7, 0);
      const s = p.s * (0.5 + u * 1.6) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      this.dummy.scale.setScalar(Math.max(0.001, s));
      this.dummy.updateMatrix();
      this.smoke.setMatrixAt(n, this.dummy.matrix);
      n += 1;
    }
    this.smoke.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;

    // Бабочки: кружат вокруг якорей, машут крыльями; ночью прячутся.
    const showFly = day > 0.45 && anchors.length > 0;
    this.flies.visible = showFly;
    if (showFly) {
      for (let i = 0; i < FLIES; i += 1) {
        const [ax, az] = anchors[i % anchors.length]!;
        const s = this.seeds[i]!;
        const w = 0.35 + s * 0.3;
        const ph = s * 20 + i;
        const r = 0.9 + s * 0.9;
        const x = ax + Math.sin(t * w + ph) * r + Math.sin(t * w * 2.3 + ph) * 0.3;
        const z = az + Math.cos(t * w * 0.8 + ph) * r;
        const y = 0.45 + Math.sin(t * 1.7 + ph) * 0.2 + s * 0.4;
        const vx = Math.cos(t * w + ph) * r * w;
        const vz = -Math.sin(t * w * 0.8 + ph) * r * w * 0.8;
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(0, Math.atan2(vx, vz), 0);
        const flap = 0.25 + Math.abs(Math.sin(t * 16 + ph)) * 0.9;
        this.dummy.scale.set(flap, 1, 1);
        this.dummy.updateMatrix();
        this.flies.setMatrixAt(i, this.dummy.matrix);
      }
      this.flies.instanceMatrix.needsUpdate = true;
    }

    // Светлячки: мерцают у деревьев и скверов в темноте.
    const night = 1 - day;
    this.bugs.visible = night > 0.4 && anchors.length > 0;
    if (this.bugs.visible) {
      (this.bugs.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (night - 0.4) * 2.5);
      for (let i = 0; i < BUGS; i += 1) {
        const [ax, az] = anchors[(i * 7) % anchors.length]!;
        const s = this.seeds[(i + 17) % this.seeds.length]!;
        const ph = s * 30 + i * 1.3;
        const x = ax + Math.sin(t * 0.3 + ph) * (1.2 + s * 1.5);
        const z = az + Math.cos(t * 0.23 + ph * 1.3) * (1.2 + s * 1.2);
        const y = 0.35 + s * 1.1 + Math.sin(t * 0.9 + ph) * 0.2;
        const blink = Math.max(0, Math.sin(t * (1.3 + s) + ph));
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0.3 + blink * blink * 1.1);
        this.dummy.updateMatrix();
        this.bugs.setMatrixAt(i, this.dummy.matrix);
      }
      this.bugs.instanceMatrix.needsUpdate = true;
    }
    POOL.opacity = Math.max(0, night - 0.15) * 0.75;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
