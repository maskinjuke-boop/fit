import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Coat, ItemId, Profession } from '../../game/city/types';
import { setupRenderer } from '../game/three/studio';
import { animateChibi, buildChibi, disposeChibi, type Chibi, type ChibiPose } from './chibi';

/**
 * Портрет кошки (сводка, онбординг). Все портреты рисует один общий WebGL-рендерер
 * в свои 2D-холсты — контекстов WebGL не прибавляется, сколько бы портретов ни было на экране.
 */

interface Entry {
  canvas: HTMLCanvasElement;
  ch: Chibi;
  pose: ChibiPose;
  profession: Profession;
  phase: number;
}

let shared: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
const entries = new Set<Entry>();
let raf = 0;
let prev = 0;

function ensure(): NonNullable<typeof shared> {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  setupRenderer(renderer, false);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#9a8aa0', 1.3));
  const sun = new THREE.DirectionalLight('#fff3df', 2.1);
  sun.position.set(1.5, 3, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  camera.position.set(0, 0.95, 2.2);
  camera.lookAt(0, 0.33, 0);
  shared = { renderer, scene, camera };
  return shared;
}

function loop(now: number): void {
  if (!entries.size) {
    raf = 0;
    return;
  }
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - prev) / 1000 || 0.016);
  prev = now;
  const s = ensure();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const e of entries) {
    const w = Math.max(1, Math.round(e.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(e.canvas.clientHeight * dpr));
    if (e.canvas.width !== w || e.canvas.height !== h) {
      e.canvas.width = w;
      e.canvas.height = h;
    }
    const size = s.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
    s.scene.add(e.ch.root);
    animateChibi(e.ch, e.pose, now / 1000 + e.phase, dt, 0, e.profession);
    s.renderer.render(s.scene, s.camera);
    s.scene.remove(e.ch.root);
    const g = e.canvas.getContext('2d');
    if (g) {
      g.clearRect(0, 0, w, h);
      g.drawImage(s.renderer.domElement, 0, 0);
    }
  }
}

export function CatPortrait({ coat, profession, items, pose = 'idle', size = 140, seed = 1 }: { coat: Coat; profession: Profession; items: readonly ItemId[]; pose?: ChibiPose; size?: number; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const itemKey = items.join(',');
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let entry: Entry | null = null;
    try {
      const ch = buildChibi(coat, profession, itemKey ? (itemKey.split(',') as ItemId[]) : [], seed);
      ch.root.rotation.y = 0.35;
      entry = { canvas, ch, pose, profession, phase: seed * 0.71 };
      entries.add(entry);
      if (!raf) raf = requestAnimationFrame(loop);
    } catch {
      // нет WebGL — портрет пустой
    }
    return () => {
      if (!entry) return;
      entries.delete(entry);
      disposeChibi(entry.ch);
    };
  }, [coat, profession, itemKey, pose, seed]);
  return <canvas ref={ref} className="cat-portrait" style={{ width: size, height: size }} />;
}
