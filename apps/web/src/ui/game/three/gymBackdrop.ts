import * as THREE from 'three';

/**
 * Зал за группой на полноэкранном занятии: резиновый пол, стена с зеркалом в раме,
 * шведская стенка, стойка с гантелями, фитболы, коврики и светильники под потолком.
 */

/** Холст-текстура с повтором. */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx: number, ry: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Детерминированный шум, чтобы зал всегда выглядел одинаково. */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Резиновое покрытие: плитка 1×1 м с цветной крошкой и швом. */
function rubberFloor(g: CanvasRenderingContext2D): void {
  const r = rand(7);
  g.fillStyle = '#2b2e33';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i += 1) {
    const k = r();
    g.fillStyle = k < 0.07 ? 'rgba(90,140,220,0.5)' : k < 0.14 ? 'rgba(210,210,210,0.22)' : `rgba(0,0,0,${0.08 + r() * 0.12})`;
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
}

/** Стена: светлая штукатурка, внизу тёмная панель с оранжевой полосой. */
function gymWall(g: CanvasRenderingContext2D): void {
  const r = rand(11);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#e9ecef');
  gr.addColorStop(1, '#d3d8dc');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 1800; i += 1) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
    g.fillRect(r() * 512, r() * 256, 2, 2);
  }
  g.fillStyle = '#2f3540';
  g.fillRect(0, 214, 512, 42);
  g.fillStyle = '#ff6b35';
  g.fillRect(0, 208, 512, 6);
}

const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  return b;
};

let rubberCanvas: HTMLCanvasElement | null = null;
/** Текстура резинового пола зала на площадь w×d м (плитка 1 м); холст общий. */
export function rubberTexture(w: number, d: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (!rubberCanvas) {
    rubberCanvas = document.createElement('canvas');
    rubberCanvas.width = rubberCanvas.height = 256;
    const g = rubberCanvas.getContext('2d');
    if (!g) return null;
    rubberFloor(g);
  }
  const t = new THREE.CanvasTexture(rubberCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w, d);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function gymBackdrop(): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 20), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, rubberFloor, 14, 20), roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 4.8;
  floor.receiveShadow = true;
  g.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, gymWall, 3, 1), roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.6), wallMat);
  back.position.set(0, 1.8, -5.2);
  back.receiveShadow = true;
  g.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.6), wallMat);
    side.position.set(sx * 7, 1.8, 4.8);
    side.rotation.y = (-sx * Math.PI) / 2;
    side.receiveShadow = true;
    g.add(side);
  }
  // Тень в углу пола у стены (мягкое затемнение вместо дорогого AO).
  const aoC = document.createElement('canvas');
  aoC.width = 4;
  aoC.height = 64;
  const ao = aoC.getContext('2d');
  if (ao) {
    const gr = ao.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ao.fillStyle = gr;
    ao.fillRect(0, 0, 4, 64);
  }
  const aoMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(aoC), transparent: true, depthWrite: false });
  const aoStrip = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.7), aoMat);
  aoStrip.rotation.x = -Math.PI / 2;
  aoStrip.position.set(0, 0.004, -4.85);
  g.add(aoStrip);

  // Зеркало во всю стену в алюминиевой раме.
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.9), new THREE.MeshStandardMaterial({ color: '#c4d2df', roughness: 0.12, metalness: 0.65, envMapIntensity: 1.2 }));
  mirror.position.set(0, 1.45, -5.18);
  g.add(mirror);
  const frame = new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.3, metalness: 0.9 });
  for (const [w, h, x, y] of [
    [6.5, 0.05, 0, 2.42],
    [6.5, 0.05, 0, 0.48],
    [0.05, 1.98, -3.22, 1.45],
    [0.05, 1.98, 3.22, 1.45],
  ] as const)
    g.add(box(w, h, 0.04, frame, x, y, -5.16));

  // Шведская стенка слева.
  const wood = new THREE.MeshStandardMaterial({ color: '#c08a52', roughness: 0.6 });
  for (const x of [-5.6, -4.6]) g.add(box(0.08, 2.8, 0.08, wood, x, 1.4, -5.05));
  for (let i = 0; i < 11; i += 1) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 10), wood);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(-5.1, 0.25 + i * 0.24, -5.05);
    g.add(rung);
  }

  // Стойка с гантелями справа.
  const steel = new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.45, metalness: 0.7 });
  for (const y of [0.55, 0.95]) g.add(box(1.9, 0.05, 0.45, steel, 4.9, y, -4.75));
  for (const sx of [-1, 1]) g.add(box(0.06, 1, 0.45, steel, 4.9 + sx * 0.92, 0.5, -4.75));
  const plate = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6'];
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < 5; i += 1) {
      const db = new THREE.Group();
      const r = 0.05 + i * 0.008;
      const m = new THREE.MeshStandardMaterial({ color: plate[i]!, roughness: 0.5 });
      for (const sx of [-1, 1]) {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.07, 8), m);
        head.rotation.z = Math.PI / 2;
        head.position.x = sx * 0.11;
        head.castShadow = true;
        db.add(head);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), steel);
      bar.rotation.z = Math.PI / 2;
      db.add(bar);
      db.position.set(4.15 + i * 0.37, (row ? 0.98 : 0.58) + r, -4.75);
      db.rotation.y = Math.PI / 2;
      g.add(db);
    }
  }

  // Фитболы и скатанные коврики.
  for (const [x, z, c, r] of [
    [-6.1, -3.9, '#ff7a59', 0.33],
    [-5.5, -4.4, '#59a5ff', 0.28],
    [6.2, -2.6, '#9b7bff', 0.3],
  ] as const) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.6 }));
    ball.position.set(x, r, z);
    ball.castShadow = true;
    g.add(ball);
  }
  ['#2ecc71', '#e67e22', '#1abc9c', '#e84393'].forEach((c, i) => {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    roll.position.set(-3.6 + i * 0.17, 0.3, -4.95);
    roll.castShadow = true;
    g.add(roll);
  });

  // Потолок.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 20), new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, 4.8);
  g.add(ceiling);
  // Линейные светильники под потолком.
  const glow = new THREE.MeshBasicMaterial({ color: '#fff8ea' });
  for (const z of [-4, -1.5, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.04, 0.16), glow);
    lamp.position.set(0, 3.55, z);
    g.add(lamp);
  }
  return g;
}
