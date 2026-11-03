import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import * as THREE from 'three';
import { Avatar } from '../Avatar';
import type { Hero3DProps } from '../Hero3D';
import { isPrepared, prepare } from './anatomy';
import { HEAD_CENTER_WORLD, HEAD_GROW } from './body';
import { buildCharacter, disposeObject, garmentsFor, type CharacterParts } from './buildCharacter';
import { hairTexture, loadHairTexture } from './hairMesh';
import { createStudio, enableShadows, setupRenderer } from './studio';

/** Мягкая тень под ногами — текстура с радиальным градиентом вместо теневых карт (дёшево для телефонов). */
function groundShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

function pedestal(color: string): THREE.Group {
  const g = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.84, 0.08, 64), new THREE.MeshStandardMaterial({ color: '#232a3a', roughness: 0.55, metalness: 0.25 }));
  disk.position.y = -0.04;
  disk.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.002;
  g.add(disk, ring);
  return g;
}

/**
 * 3D-персонаж на three.js: вращается пальцем, слегка покачивается и «дышит».
 * Если WebGL недоступен, показывает 2D-портрет.
 */
export default function Character3D({ color, appearance, equipped, height = 260, interactive = true, zoomable = false }: Hero3DProps) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement | null>(null);
  const [close, setClose] = useState(false);
  const closeRef = useRef(false);
  closeRef.current = close;
  const api = useRef<{ setCharacter(c: CharacterParts, color: string): void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [sculpting, setSculpting] = useState(false);

  // Сцена, камера, рендер и цикл анимации создаются один раз.
  useEffect(() => {
    const el = host.current;
    if (!el || failed) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    setupRenderer(renderer, true);
    const canvas = renderer.domElement;
    canvas.className = 'hero3d-canvas';
    el.appendChild(canvas);

    const studio = createStudio(renderer, true);
    const { scene, rim } = studio;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const target = new THREE.Vector3(0, 1.36, 0);
    camera.position.set(0, 1.66, 6.9);
    camera.lookAt(target);

    const stage = new THREE.Group();
    scene.add(stage);
    let base = pedestal('#ffffff');
    stage.add(base, groundShadow());

    let parts: CharacterParts | null = null;
    api.current = {
      setCharacter(c, col) {
        if (parts) {
          stage.remove(parts.root);
          disposeObject(parts.root);
        }
        parts = c;
        enableShadows(c.root);
        stage.add(c.root);
        rim.color.set(col);
        stage.remove(base);
        disposeObject(base);
        base = pedestal(col);
        stage.add(base);
      },
    };

    // Размер холста следует за контейнером.
    // Камера плавно переходит между «во весь рост» и «крупный план лица».
    let zoom = closeRef.current ? 1 : 0;
    const place = (): void => {
      const narrow = Math.max(1, 0.62 / camera.aspect);
      const far = { y: 1.66, ty: 1.36, d: 6.9 * narrow };
      const near = { y: HEAD_CENTER_WORLD + 0.02, ty: HEAD_CENTER_WORLD - 0.04, d: 2 * HEAD_GROW * Math.max(1, 0.8 / camera.aspect) };
      const k = zoom * zoom * (3 - 2 * zoom);
      target.set(0, far.ty + (near.ty - far.ty) * k, 0);
      camera.position.set(0, far.y + (near.y - far.y) * k, far.d + (near.d - far.d) * k);
      camera.lookAt(target);
    };
    const resize = (): void => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      place();
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Поворот пальцем: перетаскивание меняет угол, после отпускания — инерция и лёгкое покачивание.
    let angle = 0.35;
    let velocity = 0;
    let dragging = false;
    let lastX = 0;
    let idleSince = performance.now();
    const onDown = (e: PointerEvent): void => {
      dragging = true;
      lastX = e.clientX;
      velocity = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const d = (dx / Math.max(120, el.clientWidth)) * Math.PI * 1.6;
      angle += d;
      velocity = d * 60;
    };
    const onUp = (): void => {
      dragging = false;
      idleSince = performance.now();
    };
    if (interactive) {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
    }

    // Рисуем только когда персонаж на экране и вкладка активна.
    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((x) => x.isIntersecting);
    });
    io.observe(el);

    const onLost = (e: Event): void => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    let raf = 0;
    let prev = performance.now();
    let sway = 0;
    // Если телефон не успевает, отключаем тени и снижаем чёткость (проверяем первые ~90 кадров).
    let perfFrames = 0;
    let perfTime = 0;
    let tuned = false;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      const goal = closeRef.current ? 1 : 0;
      if (zoom !== goal) {
        zoom = goal > zoom ? Math.min(goal, zoom + dt * 2.2) : Math.max(goal, zoom - dt * 2.2);
        place();
      }
      if (!dragging) {
        angle += velocity * dt;
        velocity *= Math.pow(0.04, dt);
        // Через пару секунд без касаний персонаж плавно покачивается.
        const idle = Math.min(1, Math.max(0, (now - idleSince - 1500) / 1500));
        sway += dt;
        stage.rotation.y = angle + Math.sin(sway * 0.6) * 0.32 * idle;
      } else {
        stage.rotation.y = angle;
      }
      if (parts) {
        const t = now / 1000;
        const b = Math.sin(t * 1.9);
        // Дыхание: грудь чуть расширяется (масштаб от земли — ноги остаются на месте).
        parts.torso.scale.set(1 + b * 0.006, 1 + b * 0.0025, 1 + b * 0.012);
        parts.head.position.y = Number(parts.head.userData.baseY ?? 0) * (1 + b * 0.0025);
        parts.head.rotation.y = Math.sin(t * 0.7) * 0.06;
        parts.head.rotation.z = Math.sin(t * 0.5) * 0.025;
        // Моргание раз в несколько секунд: веко опускается и поднимается.
        const cycle = t % 4.2;
        const shut = cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) : 0;
        for (const l of parts.lids) l.obj.rotation.x = l.open + (l.closed - l.open) * shut;
        for (const f of parts.anim) f(t);
      }
      renderer.render(scene, camera);
      if (!tuned) {
        perfFrames += 1;
        perfTime += dt;
        if (perfFrames >= 90) {
          tuned = true;
          if (perfTime / perfFrames > 1 / 38) {
            studio.key.castShadow = false;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
            resize();
          }
        }
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      api.current = null;
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [interactive, failed]);

  // Персонаж пересобирается при смене внешности, цвета или снаряжения.
  // Тело и одежда лепятся один раз за сессию — порциями, чтобы интерфейс не замирал.
  const sig = JSON.stringify([color, appearance, equipped]);
  useEffect(() => {
    if (failed) return;
    let alive = true;
    const garments = garmentsFor(appearance.figure, equipped);
    const apply = (): void => {
      if (alive) api.current?.setCharacter(buildCharacter(appearance, color, equipped), color);
    };
    let timer = 0;
    if (isPrepared(appearance.figure, garments) && hairTexture(appearance.hair)) {
      setSculpting(false);
      // Ползунки меняют внешность много раз в секунду — пересобираем героя чуть позже, один раз.
      timer = window.setTimeout(apply, 40);
    } else {
      setSculpting(true);
      void Promise.all([prepare(appearance.figure, garments), loadHairTexture(appearance.hair)]).then(() => {
        if (!alive) return;
        setSculpting(false);
        apply();
      });
    }
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [sig, failed]);

  if (failed) {
    return (
      <div className="hero3d fallback" style={{ height }}>
        <Avatar color={color} appearance={appearance} equipped={equipped} size={Math.round(height * 0.75)} />
      </div>
    );
  }
  return (
    <div className="hero3d-wrap" style={{ height }}>
      <div ref={host} className={`hero3d ${interactive ? 'grab' : ''}`} style={{ height }} />
      {sculpting && (
        <div className="hero3d-busy" aria-live="polite">
          <div className="spinner" />
          <span>{t('sculpting')}</span>
        </div>
      )}
      {zoomable && (
        <button className="zoom-btn" onClick={() => setClose((c) => !c)}>
          {close ? `⤢ ${t('zoomOut')}` : `🔍 ${t('zoomFace')}`}
        </button>
      )}
    </div>
  );
}
