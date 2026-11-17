import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ExerciseId } from '../../../tracking/exercise';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { addOutlines } from './outline';
import { blobShadow, loadCharacter, type Member } from './people';
import { animate, breathe } from './rig';
import { createStudio, enableShadows, setupRenderer } from './studio';
import { gymBackdrop } from './gymBackdrop';
import { expressionFor } from './face';

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
/** Длительность одного повтора у ученика (с). */
const REP_TIME: Partial<Record<ExerciseId, number>> = { squat: 1.5, jumping_jack: 0.95, lunge: 1.4, pushup: 1.3, situp: 1.3, high_knees: 0.7 };

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
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    setupRenderer(renderer, true);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.className = 'crew-canvas';
    el.appendChild(canvas);
    const studio = createStudio(renderer, true);
    const { scene } = studio;
    scene.background = new THREE.Color('#1c1f25');
    scene.environmentIntensity = 0.55;
    const fog = new THREE.Fog('#1c1f25', 9, 16);
    scene.fog = fog;
    const backdrop = gymBackdrop();
    addOutlines(backdrop, { thickness: 0.02 });
    scene.add(backdrop);
    scene.add(new THREE.HemisphereLight('#fff4e4', '#3b3530', 0.55));
    // Свет сверху-спереди с мягкими тенями на всю группу.
    const key = studio.key;
    key.position.set(1.6, 6, 4.5);
    key.target.position.set(0, 0, -1);
    key.intensity = 2.3;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.camera.far = 20;
    key.shadow.radius = 4;
    key.shadow.camera.updateProjectionMatrix();

    const lying = LYING.includes(exercise);
    // Лёжа в полосу помещается не больше пяти — остальные занимаются «за кадром».
    const shown = lying ? clients.slice(0, 5) : clients;
    const n = shown.length;
    // Узкий экран (телефон стоя) — больше рядов, чтобы ученики были крупнее.
    const portrait = (el.clientWidth || 1) < (el.clientHeight || 1);
    const rows = lying ? 1 : portrait ? (n <= 2 ? 1 : n <= 6 ? 2 : 3) : n > 5 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    // Полные ученики шире — стоят свободнее.
    const heavy = Math.max(0, ...shown.map((c) => c.appearance.heavy ?? 0));
    const gap = 0.95 + 0.75 * heavy;
    // Лёжа — уступом (тело вдоль x), чтобы все были видны сбоку; стоя — в один-два ряда.
    const STEP_X = 0.5;
    const STEP_Z = 0.85 + 0.5 * heavy;
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
        const inRow = Math.min(perRow, n - row * perRow);
        root.position.set((k - (inRow - 1) / 2) * gap + (row % 2) * gap * 0.5, 0, -row * 1.3);
      }
      const sh = blobShadow(lying ? 1.8 : 0.9);
      sh.position.set(root.position.x - (lying ? shiftX : 0), 0.01, root.position.z);
      scene.add(root, sh);
      const fat = Math.max(0, c.appearance.body?.weight ?? 0) + (c.appearance.heavy ?? 0) * 0.6;
      // Длительность повтора — как у записи движения (приседание медленнее «джампинг-джека»), у полных — дольше.
      const base = REP_TIME[exercise] ?? 1.1;
      return { parts: null, root, delay: 0.12 + ((i * 37) % 7) * 0.04 + fat * 0.2, dur: base * (1 + fat * 0.45) * (0.94 + ((i * 13) % 5) * 0.03), queue: [] };
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
        enableShadows(parts.root);
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
      // На узком экране — шире угол, иначе камера уезжает далеко и все мелкие.
      camera.fov = camera.aspect < 0.8 ? 52 : camera.aspect < 1.2 ? 40 : 30;
      // Отодвинуть камеру, чтобы все поместились по ширине.
      const width = lying ? 2.8 + (n - 1) * STEP_X : perRow * gap + 0.8;
      // Ближний лежащий крупнее — центр кадра чуть к нему.
      const cx = lying ? -0.35 : 0;
      const vfov = (camera.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const depth = lying ? (n - 1) * STEP_Z : (rows - 1) * 1.3;
      const dist = Math.max(lying ? 3.4 : 4.6, width / 2 / Math.tan(hfov / 2) + 0.6);
      const ty = lying ? 0.35 : 0.97;
      camera.position.set(cx, ty + dist * (lying ? 0.32 : 0.18), dist);
      camera.lookAt(cx, ty, -depth / 2);
      fog.near = dist + 3;
      fog.far = dist + 16;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();

    let raf = 0;
    let prev = 0;
    const tick = (ms: number): void => {
      raf = requestAnimationFrame(tick);
      const t = ms / 1000;
      const dt = prev ? Math.min(0.1, t - prev) : 0.016;
      prev = t;
      list.forEach((f, i) => {
        if (!f.parts) return;
        while (f.queue.length > 0 && t - f.queue[0]! > f.dur) f.queue.shift();
        const start = f.queue[0];
        const active = start !== undefined && t >= start;
        const phase = active ? Math.min(1, (t - start) / f.dur) : 0;
        // Между повторами стоящие ученики переминаются (запись стойки), лежащие держат исходную позу;
        // переходы — плавные. Поверх — дыхание и взгляд, у каждого свой ритм.
        if (!active && !lying) animate(f.parts.rig, 'idle', t + i * 1.7, 0, 1 - Math.exp(-dt * 6));
        else animate(f.parts.rig, exercise, t, phase, active ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 8));
        breathe(f.parts.rig, t, i * 1.37, active ? 0.35 : 1);
        // Лицо: напряжение на повторе (сильнее в середине), между повторами — спокойное.
        const [ex, w] = active ? expressionFor(exercise, phase) : [null, 0];
        f.parts.face.want(ex, w);
        f.parts.face.update(dt);
        for (const a of f.parts.anim) a(t);
      });
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
