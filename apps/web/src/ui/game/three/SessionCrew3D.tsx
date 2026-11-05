import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ExerciseId } from '../../../tracking/exercise';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { blobShadow, loadCharacter, type Member } from './people';
import { animate } from './rig';
import { createStudio, setupRenderer } from './studio';

/**
 * Ученики на занятии: полоса с 3D-фигурами поверх камеры. Каждый засчитанный повтор
 * тренера запускает такой же повтор у учеников — с небольшой задержкой, а у
 * полных — медленнее. Между повторами ученики стоят в исходной позе упражнения.
 */

export interface SessionCrew3DProps {
  clients: Member[];
  exercise: ExerciseId;
  /** Счётчик повторов тренера: каждое увеличение — новый повтор у учеников. */
  reps: number;
}

interface Follower {
  parts: CharacterParts | null;
  root: THREE.Group;
  /** Задержка старта и длительность повтора (с). */
  delay: number;
  dur: number;
  /** Очередь повторов: время старта каждого. */
  queue: number[];
}

const LYING: readonly ExerciseId[] = ['pushup', 'situp'];

export default function SessionCrew3D({ clients, exercise, reps }: SessionCrew3DProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const repRef = useRef(reps);
  const followers = useRef<Follower[]>([]);

  // Новый повтор тренера — в очередь каждому ученику.
  useEffect(() => {
    if (reps <= repRef.current) {
      repRef.current = reps;
      return;
    }
    const now = performance.now() / 1000;
    for (const f of followers.current) f.queue.push(now + f.delay);
    repRef.current = reps;
  }, [reps]);

  const key = clients.map((c) => c.id).join(',');
  useEffect(() => {
    const el = host.current;
    if (!el || clients.length === 0) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    setupRenderer(renderer, false);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = 'crew-canvas';
    el.appendChild(canvas);
    const studio = createStudio(renderer, false);
    const { scene } = studio;
    scene.background = null;
    scene.environmentIntensity = 0.6;

    const lying = LYING.includes(exercise);
    // Лёжа в полосу помещается не больше пяти — остальные занимаются «за кадром».
    const shown = lying ? clients.slice(0, 5) : clients;
    const n = shown.length;
    const perRow = n > 5 ? Math.ceil(n / 2) : n;
    const gap = 0.95;
    // Лёжа — уступом (тело вдоль x), чтобы все были видны сбоку; стоя — в один-два ряда.
    const STEP_X = 0.5;
    const STEP_Z = 0.85;
    const shiftX = exercise === 'pushup' ? 0.8 : -1.1;
    let disposed = false;
    const list: Follower[] = shown.map((c, i) => {
      const root = new THREE.Group();
      if (lying) {
        root.position.set((i - (n - 1) / 2) * STEP_X + shiftX, 0, -i * STEP_Z);
        root.rotation.y = -Math.PI / 2;
      } else {
        const row = Math.floor(i / perRow);
        const k = i % perRow;
        const inRow = row === 0 ? Math.min(perRow, n) : n - perRow;
        root.position.set((k - (inRow - 1) / 2) * gap + row * gap * 0.5, 0, -row * 1.3);
      }
      const sh = blobShadow(lying ? 1.8 : 0.9);
      sh.position.set(root.position.x - (lying ? shiftX : 0), 0.01, root.position.z);
      scene.add(root, sh);
      const fat = c.appearance.body?.weight ?? 0;
      return { parts: null, root, delay: 0.12 + ((i * 37) % 7) * 0.04 + Math.max(0, fat) * 0.2, dur: 0.9 + Math.max(0, fat) * 0.6, queue: [] };
    });
    followers.current = list;
    let chain: Promise<void> = Promise.resolve();
    let loading = shown.length;
    shown.forEach((c, i) => {
      chain = chain.then(async () => {
        if (disposed) return;
        const parts = await loadCharacter(c);
        if (disposed) {
          disposeObject(parts.root);
          return;
        }
        list[i]!.parts = parts;
        list[i]!.root.add(parts.root);
      }).catch(() => {
        // Пропускаем ученика, чья модель не собралась.
      }).finally(() => {
        loading -= 1;
      });
    });

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    const fit = (): void => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Отодвинуть камеру, чтобы все поместились по ширине.
      const width = lying ? 2.8 + (n - 1) * STEP_X : perRow * gap + 0.8;
      // Ближний лежащий крупнее — центр кадра чуть к нему.
      const cx = lying ? -0.35 : 0;
      const vfov = (camera.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const depth = lying ? (n - 1) * STEP_Z : n > perRow ? 1.3 : 0;
      const dist = Math.max(lying ? 3.4 : 4.6, width / 2 / Math.tan(hfov / 2) + 0.6);
      const ty = lying ? 0.35 : 0.85;
      camera.position.set(cx, ty + dist * (lying ? 0.32 : 0.18), dist);
      camera.lookAt(cx, ty, -depth / 2);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();

    let raf = 0;
    const tick = (ms: number): void => {
      raf = requestAnimationFrame(tick);
      const t = ms / 1000;
      for (const f of list) {
        if (!f.parts) continue;
        while (f.queue.length > 0 && t - f.queue[0]! > f.dur) f.queue.shift();
        const start = f.queue[0];
        const phase = start !== undefined && t >= start ? Math.min(1, (t - start) / f.dur) : 0;
        animate(f.parts.rig, exercise, t, phase);
        for (const a of f.parts.anim) a(t);
      }
      // Пока ученики собираются, кадры реже: камере и подсчёту повторов нужен процессор.
      if (loading > 0 && ms - lastRender < 250) return;
      lastRender = ms;
      renderer.render(scene, camera);
    };
    let lastRender = 0;
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      followers.current = [];
      disposeObject(scene);
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, exercise]);

  return <div ref={host} className="crew3d" />;
}
