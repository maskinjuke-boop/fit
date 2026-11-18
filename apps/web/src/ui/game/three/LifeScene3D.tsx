import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { actionsAt, dayFraction } from '../../../game/life';
import { BOWL_MAX } from '../../../game/lifeContent';
import { PLAY_START, BELT, DEMON_FACE, DEMON_ROOM, DEMON_SPOT, GRAVES_SHOWN, REACH, beltSpot, demonLayout, graveSpot, houseRect, playCatBoxes, playParts, type PlayParts, STICK_WALK, bounds as sceneBounds, dist, homeLayout, homeObstacles, petsAt, resolve, spawn, type Box, type P2, type Placed } from '../../../game/lifeMap';
import type { ItemSpot, PlayZoneState, CatBreed, ObjectId, SceneId } from '../../../game/lifeTypes';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { addOutlines } from './outline';
import { furnitureReady, loadFurniture } from './kenney';
import { createCatLife, perchSpots, type CatWorld, type Perch } from './catLife';
import { buildBowls, buildCat, buildLitter, poseCat, type Cat3D } from './cats3d';
import { CAFE_DECOR, NEW_KIT, kitOf, type HomeLook } from '../../../game/homeDecor';
import { contactShadow, objectModel, plasterTexture, playZoneModel, ticksOf, type HomeAnim } from './homeModels';
import { curtains, doorModel, floorMesh, roomLights, roomOcclusion, roomWalls, rugMesh, windowStyle } from './interior';

/** Дом без данных о ремонте — простой новый ремонт и новая мебель. */
const DEFAULT_LOOK: HomeLook = { decor: CAFE_DECOR, kit: NEW_KIT };

/** Демон-лавочник: красная кожа, рожки, крылья летучей мыши, тёмная одежда. */
const DEMON_LOOK: Look = {
  color: '#5b1020',
  appearance: { figure: 'male', skin: 1, hair: 'curly', hairColor: 0, beard: true, eyes: 5 },
  equipped: { head: 'devil_horns', back: 'bat_wings', body: 'button_shirt', legs: 'leather_pants', feet: 'chelsea_boots' },
  skin: { base: '#c8403a', shade: '#8f2a26' },
};
import { M, mat, mesh } from './kit';
import { blobShadow, loadCharacter, type Look, type Member } from './people';
import { animate, seatOffsets, breathe } from './rig';
import { createStudio, setupRenderer } from './studio';

/**
 * 3D-сцены кошачьего дома: сам дом (комната в разрезе, растёт со ступенью) с кошками и лавка
 * демона: тёмная комната со свечами, демон в кресле, лента с кошкой дня и могилки. Людей в
 * доме нет: игрок водит одну кошку (стик, клавиши, касание пола), камера следует за ней,
 * под ней — светящееся кольцо; рядом с предметом или кошкой сцена сообщает, что можно сделать.
 */

export type { Look, Member };

export interface LifeScene3DProps {
  scene: SceneId;
  furniture: ObjectId[];
  /** Ступень кафе. */
  house: number;
  /** Ремонт: отделка и базовая мебель (без него — простой новый ремонт). */
  home?: HomeLook;
  minute: number;
  /** Кошка игрока. */
  pet: string | null;
  /** Кошка дня: едет по ленте к жерлу (null — спасена). */
  offer: { breed: CatBreed; mix?: CatBreed; grow: number } | null;
  /** Завтрашняя кошка — у демона на коленях. */
  tomorrow?: { breed: CatBreed; mix?: CatBreed; grow: number } | null;
  /** Могилки не спасённых кошек (старые — первыми): фото и имя. */
  graves?: Array<{ key: string; breed: CatBreed; mix?: CatBreed; name: string }>;
  /** Кошки кафе и их потребности 0…100 (сытость, игра, туалет). */
  cats: Array<{ id: string; breed: CatBreed; mix?: CatBreed; grow?: number; fed?: number; play?: number; toilet?: number }>;
  /** Корм в миске (порций), вода в миске 0…100 и грязь в лотке 0…100. */
  pets?: { bowl: number; water: number; litter: number };
  /** Игровая зона для кошек: размер, игрушки, коврик. */
  play?: PlayZoneState;
  /** Куда игрок переставил предметы кафе. */
  moved?: Record<string, ItemSpot>;
  /** Режим перестановки: касание пола или предмета — onEditTap (герой не идёт); выбранный предмет подсвечен. */
  editing?: boolean;
  onEditTap?(p: P2, key: string | null): void;
  /** Подсветка выбранного предмета: прямоугольник на полу; ok — можно ли туда. */
  editMark?: { box: Box; ok: boolean } | null;
  /** Кошка игрока выполняет действие у предмета или с кошкой target (анимация до результата). */
  perform: { key: number; action: string; at: ObjectId | null; target?: string | null } | null;
  /** Куда сцена пишет, где другие кошки (ближайшая к кошке игрока — первой). */
  catSpots?: { current: Array<{ id: string; x: number; z: number }> };
  /** Куда сцена пишет, где кошка игрока. */
  heroAt?: { current: P2 };
  stick: { current: { x: number; y: number } };
  goto: { current: P2 | null };
  onNear(target: ObjectId | null): void;
  /** Игрок сам ведёт кошку (клавиши, касание пола) — она перестаёт действовать сама. */
  onInput?(): void;
  /** Кошка дошла и начала действие (отсюда считается его длительность). */
  onSettled?(key: number): void;
  /** Отношения двух кошек −100…100 (друзья трутся друг о друга, недруги шипят). */
  bond?(a: string, b: string): number;
  onFail(): void;
}

const ZOOM_KEY = 'fitness-rpg.catZoom';
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.8;
/** Масштаб по умолчанию: кошка — главный герой, камера ближе. */
const ZOOM_START = 0.62;
const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function loadZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v > 0 ? clampZoom(v) : ZOOM_START;
  } catch {
    return ZOOM_START;
  }
}


function signTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66, 490);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─── Комнаты ───────────────────────────────────────────────────────────

function walls(w: number, d: number, tone: string, H = 3, wainscot?: string): THREE.Group {
  const g = new THREE.Group();
  const tex = plasterTexture();
  const wall = mat(tone, 0.95);
  if (tex) {
    const t = tex.clone();
    t.repeat.set(w / 2.5, H / 2.5);
    t.needsUpdate = true;
    wall.map = t;
  }
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, H, 0.15), wall, [0, H / 2, -d / 2 - 0.07]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.15, H, d + 0.15), wall, [(sx * (w + 0.15)) / 2, H / 2, 0]));
  // Панели внизу стен и плинтус по периметру.
  if (wainscot) {
    const pm = mat(wainscot, 0.7);
    g.add(mesh(new THREE.BoxGeometry(w, 0.9, 0.03), pm, [0, 0.45, -d / 2 + 0.015]));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.03, 0.9, d), pm, [sx * (w / 2 - 0.015), 0.45, 0]));
    const rail = mat('#ffffff', 0.5);
    g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.05), rail, [0, 0.92, -d / 2 + 0.03]));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, d), rail, [sx * (w / 2 - 0.03), 0.92, 0]));
  }
  const base = mat('#f7f5f0', 0.55);
  g.add(mesh(new THREE.BoxGeometry(w, 0.12, 0.05), base, [0, 0.06, -d / 2 + 0.04]));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.12, d), base, [sx * (w / 2 - 0.04), 0.06, 0]));
  return g;
}

/** Окно в боковой стене со светлым проёмом и пятном света на полу; old — старая облезлая рама. */
function sideWindow(x: number, z: number, side: number, night: boolean, look: HomeLook = DEFAULT_LOOK): THREE.Group {
  const g = new THREE.Group();
  const ws = windowStyle(look);
  const old = ws.old;
  const frame = ws.frame;
  const glass = night ? M.glow('#1d2b55', 0.45) : M.glow('#cfe9ff', 0.9);
  const w = 1.7;
  const h = 1.4;
  g.add(mesh(new THREE.PlaneGeometry(w, h), glass, [0, 0, 0.005]));
  g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.08, 0.1), frame, [0, h / 2 + 0.04, 0.03]), mesh(new THREE.BoxGeometry(w + 0.2, 0.07, 0.2), frame, [0, -h / 2 - 0.03, 0.08]));
  for (const dx of [-w / 2 - 0.04, 0, w / 2 + 0.04]) g.add(mesh(new THREE.BoxGeometry(0.06, h, 0.08), frame, [dx, 0, 0.03]));
  g.add(mesh(new THREE.BoxGeometry(w, 0.04, 0.05), frame, [0, 0.15, 0.03]));
  if (old) {
    // Облупившаяся краска на раме и трещина на стекле.
    const chip = mat('#8d7f66', 0.9);
    for (const [dx, dy] of [[-0.6, h / 2 + 0.04], [0.5, -h / 2 - 0.03], [w / 2 + 0.04, 0.3]] as const) g.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.11), chip, [dx, dy, 0.05]));
    const crack = mat('#ffffff', 0.2, 0, { transparent: true, opacity: 0.6 });
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.008, 0.002), crack, [0.35, 0.35, 0.008]).rotateZ(0.7), mesh(new THREE.BoxGeometry(0.25, 0.008, 0.002), crack, [0.5, 0.42, 0.008]).rotateZ(-0.4));
  }
  const extra = ws.extra(w, h);
  if (extra) g.add(extra);
  g.add(curtains(look, w, h, night));
  g.position.set(x, 1.75, z);
  g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  if (!night) {
    const lightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.6),
      new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    lightPool.rotation.x = -Math.PI / 2;
    lightPool.position.set(x - side * 1.6, 0.012, z);
    const pool = new THREE.Group();
    pool.add(lightPool);
    pool.userData.pool = true;
    const out = new THREE.Group();
    out.add(g, pool);
    return out;
  }
  return g;
}

/** Расставляет предметы: настенные — на высоте, напольным — мягкая контактная тень. */
/** Миски и лоток кошек в сцене (обновляются по состоянию: корм и грязь). */
interface PetModels {
  setFood(k: number): void;
  setWater(k: number): void;
  setDirt(k: number): void;
  surface: number;
}

function addPlaced(g: THREE.Group, placed: ReadonlyArray<Placed & { y?: number }>, pets?: { current: PetModels | null }, look?: HomeLook, tier = 1, play: PlayZoneState = PLAY_START): void {
  for (const p of placed) {
    if (p.id === 'cat_bowl' || p.id === 'litter') {
      // Кошачье хозяйство — свои модели (миски, лоток с наполнителем).
      const prev = pets?.current;
      const made = p.id === 'cat_bowl' ? buildBowls() : buildLitter();
      made.group.position.set(p.pos.x, 0, p.pos.z);
      made.group.rotation.y = p.rot;
      made.group.userData.placedKey = p.key;
      g.add(made.group);
      if (pets) {
        pets.current = {
          setFood: 'setFood' in made ? made.setFood : (prev?.setFood ?? (() => {})),
          setWater: 'setWater' in made ? made.setWater : (prev?.setWater ?? (() => {})),
          setDirt: 'setDirt' in made ? made.setDirt : (prev?.setDirt ?? (() => {})),
          surface: 'surface' in made ? made.surface : (prev?.surface ?? 0.07),
        };
      }
      continue;
    }
    // Старая базовая мебель; дверь в старом помещении тоже старая.
    const kit = kitOf(p.id);
    const old = look ? (kit ? !look.kit[kit] : p.id === 'door' && look.decor.door === 'door_old') : false;
    void tier;
    const custom = p.id === 'play_zone' ? playZoneModel(play) : look && p.id === 'door' && !old ? doorModel(look) : null;
    const m = custom ?? objectModel(p.id, old);
    m.position.set(p.pos.x, p.y ?? 0, p.pos.z);
    m.rotation.y = p.rot;
    m.userData.placedKey = p.key;
    g.add(m);
    if (p.box && !p.y) {
      const sh = contactShadow((p.box.x1 - p.box.x0) * 1.45, (p.box.z1 - p.box.z0) * 1.45, 0.75);
      sh.position.x = p.pos.x;
      sh.position.z = p.pos.z;
      g.add(sh);
    }
  }
}

function house(placed: Array<Placed & { y?: number }>, night: boolean, pets: { current: PetModels | null }, tier: number, look: HomeLook = DEFAULT_LOOK, play: PlayZoneState = PLAY_START): THREE.Group {
  const g = new THREE.Group();
  // Дом растёт влево и к зрителю — комната не по центру координат.
  const { w, d, L, B, F, cx, cz } = houseRect(tier);
  const room = { w, d, cx, cz };
  const wallsG = roomWalls(look, room);
  wallsG.position.set(cx, 0, cz);
  const ao = roomOcclusion(w, d, 0.9);
  ao.position.set(cx, 0, cz);
  g.add(floorMesh(look, room), wallsG, ao);
  // Окна на левой стене (в большом доме — больше окон, в однушке — одно).
  const winZ = tier >= 3 ? [-3.6, 2.2, 6.4] : tier >= 1 ? [-3.6, 2.2] : [-3.2];
  for (const z of winZ) g.add(sideWindow(L + 0.01, z, -1, night, look));
  // Ковёр у дивана.
  const rug = rugMesh(look, 0.4, -0.2);
  if (rug) g.add(rug);
  addPlaced(g, placed, pets, look, tier, play);
  // Потолочные светильники: днём слабее, вечером теплее и ярче.
  const lamps: Array<[number, number]> = tier <= 0 ? [[1.6, (B + F) / 2 + 0.3]] : [[-3.5, -1], [3.5, -1], [0, 2.8]];
  if (tier >= 2) lamps.push([L + 3.5, 1.5]);
  if (tier >= 4) lamps.push([L + 3.5, 6]);
  const ceiling = roomLights(look, lamps, night);
  ceiling.name = 'ceiling';
  g.add(ceiling);
  return g;
}

/** Полосы ленты конвейера (текстура прокручивается — лента едет). */
function beltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#26211f';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#3a3330';
    for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 6, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Лавка демона: тёмные стены, доски пола, полки с банками, свечи, кресло демона, лента-конвейер
 * к огненному жерлу, клочок земли под могилки, дверь и вывеска.
 */
function demonRoom(placed: Placed[], night: boolean): THREE.Group {
  const g = new THREE.Group();
  const tick: HomeAnim[] = [];
  g.userData.tick = tick;
  const { w, d } = DEMON_ROOM;
  const floor = mesh(new THREE.PlaneGeometry(w, d), mat('#3b2a2a', 0.9), [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'ground';
  floor.receiveShadow = true;
  // Доски пола.
  for (let x = -w / 2 + 0.55; x < w / 2; x += 1.1) {
    const seam = mesh(new THREE.PlaneGeometry(0.03, d), mat('#24191a', 0.9), [x, 0.003, 0]);
    seam.rotation.x = -Math.PI / 2;
    g.add(seam);
  }
  g.add(floor, walls(w, d, '#3d2346', 3.2, '#2a1630'), roomOcclusion(w, d, 0.9));
  const B = -d / 2;
  // Пентаграмма-ковёр посреди лавки.
  const rug = mesh(new THREE.CircleGeometry(1.3, 40), mat('#5a1f2c', 0.95), [-0.6, 0.006, 1.0]);
  rug.rotation.x = -Math.PI / 2;
  g.add(rug);
  const ring = mesh(new THREE.RingGeometry(1.1, 1.18, 48), M.glow('#ff5a3c', 0.6), [-0.6, 0.008, 1.0]);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  // Полки с банками у задней стены над лентой.
  for (const y of [1.6, 2.3]) {
    g.add(mesh(new THREE.BoxGeometry(4.6, 0.06, 0.35), mat('#2b1b16', 0.8), [2.4, y, B + 0.2]));
    for (let i = 0; i < 6; i += 1) {
      const c = ['#7fd6a0', '#d65a8f', '#e8c35a', '#7aa0e8'][i % 4]!;
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 10), mat(c, 0.2, 0, { transparent: true, opacity: 0.75 }), [0.5 + i * 0.75, y + 0.15, B + 0.2]));
    }
  }
  // Кресло демона: бархат, тёмное дерево, золото, высокая спинка с рожками.
  const dm = placed.find((x) => x.id === 'demon');
  if (dm) {
    const ch = new THREE.Group();
    const velvet = M.cloth('#8a1528', 3, 0.9);
    const woodD = mat('#2a1512', 0.6);
    const gold = mat('#d4a640', 0.35, 0.8);
    ch.add(mesh(new THREE.BoxGeometry(0.95, 0.32, 0.7), woodD, [0, 0.16, 0]));
    ch.add(mesh(new THREE.BoxGeometry(0.85, 0.13, 0.62), velvet, [0, 0.385, 0.02]));
    ch.add(mesh(new THREE.BoxGeometry(0.95, 1.55, 0.14), woodD, [0, 1.0, -0.36]));
    ch.add(mesh(new THREE.BoxGeometry(0.75, 1.25, 0.06), velvet, [0, 1.0, -0.28]));
    for (const x of [-0.42, 0.42]) {
      ch.add(mesh(new THREE.BoxGeometry(0.14, 0.32, 0.66), velvet, [x, 0.5, 0.0]));
      ch.add(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.7), gold, [x, 0.67, 0.0]));
      ch.add(mesh(new THREE.ConeGeometry(0.07, 0.32, 10), gold, [x * 0.95, 1.92, -0.36]).rotateZ(-x * 0.9));
    }
    ch.add(mesh(new THREE.BoxGeometry(0.99, 0.05, 0.18), gold, [0, 1.78, -0.36]));
    ch.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), M.glow('#ff3b2f', 1.4), [0, 1.62, -0.28]));
    ch.position.set(dm.pos.x, 0, dm.pos.z);
    ch.rotation.y = dm.rot;
    g.add(ch);
    // Свечи на подставке рядом с креслом.
    const stand = new THREE.Group();
    stand.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.75, 12), woodD, [0, 0.375, 0]));
    for (const [x, z, h] of [[-0.06, 0.02, 0.26], [0.07, -0.04, 0.2], [0.0, 0.08, 0.16]] as const) {
      stand.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 10), mat('#efe6d6', 0.6), [x, 0.75 + h / 2, z]));
      stand.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), M.glow('#ffb347', 2), [x, 0.78 + h, z]));
    }
    stand.position.set(dm.pos.x - 1.0, 0, dm.pos.z + 0.1);
    g.add(stand);
  }
  // Лента-конвейер: рама на ножках, движущаяся лента, валы на концах, жёлто-чёрная полоса у жерла.
  const P = BELT.pit;
  const len = BELT.x1 - BELT.x0 + 0.5;
  const cx = (BELT.x0 + BELT.x1) / 2 + 0.05;
  const frame = mat('#3a3f46', 0.5, 0.6);
  const belt = new THREE.Group();
  belt.add(mesh(new THREE.BoxGeometry(len, 0.1, 0.8), frame, [0, 0.42, 0]));
  for (const z of [-0.43, 0.43]) belt.add(mesh(new THREE.BoxGeometry(len, 0.08, 0.06), M.darkSteel(), [0, 0.55, z]));
  for (let x = -len / 2 + 0.2; x <= len / 2 - 0.1; x += 0.9)
    for (const z of [-0.33, 0.33]) belt.add(mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), frame, [x, 0.2, z]));
  for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) belt.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.76, 14), M.chrome(), [x, 0.47, 0]).rotateX(Math.PI / 2));
  const tex = beltTexture();
  tex.repeat.set(len * 2.5, 1);
  const surf = mesh(new THREE.PlaneGeometry(len - 0.1, 0.72), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), [0, 0.53, 0]);
  surf.rotation.x = -Math.PI / 2;
  surf.userData.noOutline = true;
  belt.add(surf);
  // Лента едет к жерлу (медленно, просто чтобы было видно движение).
  tick.push((t) => {
    tex.offset.x = -t * 0.08;
  });
  const hazard = document.createElement('canvas');
  hazard.width = 64;
  hazard.height = 16;
  const hz = hazard.getContext('2d');
  if (hz) {
    hz.fillStyle = '#f1c40f';
    hz.fillRect(0, 0, 64, 16);
    hz.fillStyle = '#111';
    for (let x = -16; x < 64; x += 16) {
      hz.beginPath();
      hz.moveTo(x, 16);
      hz.lineTo(x + 8, 0);
      hz.lineTo(x + 16, 0);
      hz.lineTo(x + 8, 16);
      hz.fill();
    }
  }
  const hzT = new THREE.CanvasTexture(hazard);
  hzT.colorSpace = THREE.SRGBColorSpace;
  belt.add(mesh(new THREE.PlaneGeometry(0.8, 0.12), new THREE.MeshBasicMaterial({ map: hzT }), [len / 2 - 0.4, 0.42, 0.405]));
  belt.position.set(cx, 0, BELT.z);
  g.add(belt);
  // Огненное жерло: каменный край, светящаяся глубина, пламя, искры, мерцающий свет.
  const pit = new THREE.Group();
  pit.add(mesh(new THREE.TorusGeometry(P.r, 0.12, 8, 28), mat('#2b2422', 0.95), [0, 0.05, 0]).rotateX(Math.PI / 2));
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    pit.add(mesh(new THREE.DodecahedronGeometry(0.11 + (i % 3) * 0.03), mat('#3a302c', 0.95), [Math.cos(a) * (P.r + 0.08), 0.08, Math.sin(a) * (P.r + 0.08)]));
  }
  const glow = mesh(new THREE.CircleGeometry(P.r - 0.05, 32), M.glow('#e8380c', 1.1), [0, 0.02, 0]);
  glow.rotation.x = -Math.PI / 2;
  glow.userData.noOutline = true;
  pit.add(glow);
  const inner = mesh(new THREE.CylinderGeometry(P.r - 0.06, P.r * 0.4, 0.6, 24, 1, true), M.glow('#ff7a1f', 0.9), [0, -0.28, 0]);
  (inner.material as THREE.Material).side = THREE.BackSide;
  inner.userData.noOutline = true;
  pit.add(inner);
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i += 1) {
    const f = mesh(new THREE.ConeGeometry(0.1 + (i % 3) * 0.04, 0.45, 8), M.glow(i % 2 ? '#ff4a12' : '#ff9a1f', 1.3), [Math.cos(i * 0.9) * 0.35, 0.2, Math.sin(i * 1.7) * 0.3]);
    f.userData.noOutline = true;
    flames.push(f);
    pit.add(f);
  }
  const fire = new THREE.PointLight('#ff6a2a', 9, 6, 1.6);
  fire.position.set(0, 0.9, 0);
  pit.add(fire);
  pit.position.set(P.x, 0, BELT.z);
  g.add(pit);
  tick.push((t) => {
    flames.forEach((f, i) => {
      const k = 0.75 + 0.35 * Math.sin(t * (5 + i) + i * 1.3);
      f.scale.set(1, k, 1);
      f.position.y = 0.12 + 0.22 * k;
    });
    fire.intensity = 8 + Math.sin(t * 9) * 1.5 + Math.sin(t * 23) * 0.8;
  });
  // Клочок земли под могилки с низкой оградкой.
  const gv = placed.find((x) => x.id === 'graves');
  if (gv) {
    const soil = mesh(new THREE.PlaneGeometry(4.9, 2.5), mat('#2a1d17', 0.98), [gv.pos.x, 0.007, gv.pos.z]);
    soil.rotation.x = -Math.PI / 2;
    soil.userData.noOutline = true;
    g.add(soil);
    const iron = M.darkSteel();
    for (const [x0, z0, x1, z1] of [[-2.45, -1.25, 2.45, -1.25], [-2.45, -1.25, -2.45, 1.25], [2.45, -1.25, 2.45, 1.25]] as const) {
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.25);
      for (let i = 0; i <= n; i += 1) g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 5), iron, [gv.pos.x + x0 + ((x1 - x0) * i) / n, 0.21, gv.pos.z + z0 + ((z1 - z0) * i) / n]));
      const rail = mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0), 0.025, 0.025), iron, [gv.pos.x + (x0 + x1) / 2, 0.38, gv.pos.z + (z0 + z1) / 2]);
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      g.add(rail);
    }
  }
  // Дверь-выход.
  const door = placed.find((x) => x.id === 'demon_door');
  if (door) {
    const dg = new THREE.Group();
    dg.add(mesh(new THREE.BoxGeometry(1.3, 2.3, 0.08), mat('#2b1716', 0.7), [0, 1.15, 0]));
    dg.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glow('#ffb347', 1.2), [0.5, 1.1, 0.06]));
    dg.position.set(door.pos.x, 0, door.pos.z);
    dg.rotation.y = door.rot;
    g.add(dg);
  }
  // Вывеска.
  g.add(mesh(new THREE.PlaneGeometry(3.6, 0.8), new THREE.MeshBasicMaterial({ map: signTexture('😈 ЛАВКА', '#5b1020'), toneMapped: false }), [-2.4, 2.85, B + 0.03]));
  // Свет: тёплые свечные огоньки и багровая подсветка.
  const red = new THREE.PointLight('#ff4a3a', 9, 9, 1.8);
  red.position.set(-2.2, 2.4, B + 2.2);
  const warm = new THREE.PointLight('#ffb36b', night ? 7 : 6, 10, 1.6);
  warm.position.set(1.5, 2.6, 1.6);
  g.add(red, warm);
  return g;
}

/** Табличка на могилке: фото кошки в овальной рамке и имя. */
function graveTexture(name: string): { tex: THREE.CanvasTexture; photo(url: string): void } {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (img?: HTMLImageElement): void => {
    if (!ctx) return;
    ctx.fillStyle = '#8d8a86';
    ctx.fillRect(0, 0, 128, 160);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(64, 62, 44, 54, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e9e3d6';
    ctx.fill();
    ctx.clip();
    if (img) ctx.drawImage(img, 14, 2, 100, 116);
    ctx.restore();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#c9a24a';
    ctx.beginPath();
    ctx.ellipse(64, 62, 44, 54, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2b2622';
    ctx.font = 'bold 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 64, 140, 120);
    tex.needsUpdate = true;
  };
  draw();
  return {
    tex,
    photo(url: string) {
      const img = new Image();
      img.onload = () => draw(img);
      img.src = url;
    },
  };
}

// ─── Свет и время ──────────────────────────────────────────────────────

const isNight = (minute: number): boolean => minute < 6 * 60 || minute >= 20 * 60;
const daylight = (minute: number): number => {
  const h = minute / 60;
  if (h < 5 || h > 21) return 0.15;
  if (h < 8) return 0.15 + ((h - 5) / 3) * 0.85;
  if (h > 18) return 1 - ((h - 18) / 3) * 0.85;
  return 1;
};

export default function LifeScene3D(props: LifeScene3DProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const api = useRef<{ rebuildScene(): void; syncCats(): void; syncDemon(): void; zoomBy(k: number): void } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      propsRef.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    setupRenderer(renderer, true);
    // Мягкие края теней.
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.className = 'world-canvas';
    el.appendChild(canvas);
    const studio = createStudio(renderer, true);
    const { scene } = studio;
    scene.environmentIntensity = 0.4;
    studio.rim.intensity = 0.15;
    const sun = studio.key;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.camera.far = 30;
    sun.shadow.radius = 4;
    sun.shadow.camera.updateProjectionMatrix();
    const hemi = new THREE.HemisphereLight('#fff1dc', '#5a4a3a', 1);
    scene.add(hemi);
    scene.background = new THREE.Color('#1a1d22');

    let disposed = false;
    const world = new THREE.Group();
    scene.add(world);
    let ground: THREE.Object3D | null = null;
    let bounds: Box = sceneBounds('cafe');
    let boxes: Box[] = [];
    let catBoxes: Box[] = [];
    const petModels: { current: PetModels | null } = { current: null };
    let targets: Array<{ id: ObjectId; pos: P2; obj: Placed }> = [];
    let placedNow: Placed[] = [];
    let ticks: HomeAnim[] = [];
    /** Игровая зона для кошек (в лавке демона — нет). */
    let playNow: PlayParts | null = null;
    // Подсветка предмета в режиме перестановки: зелёный — можно, красный — нельзя.
    const markMat = new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.32, depthWrite: false });
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), markMat);
    mark.rotation.x = -Math.PI / 2;
    mark.renderOrder = 5;
    const markLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0.5, 0), new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(-0.5, -0.5, 0)]), new THREE.LineBasicMaterial({ color: '#3ddc84' }));
    mark.add(markLine);
    mark.visible = false;
    scene.add(mark);
    /** Беговые колёса игровой зоны: крутятся, пока в них бегает кошка. */
    let wheels: THREE.Object3D[] = [];
    let lampMeshes: THREE.Object3D[] = [];
    let wheelSpeed = 0;
    const pos = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const lookV = new THREE.Vector3();
    let builtScene: SceneId | null = null;
    let lastNear: ObjectId | null | undefined;

    const rebuildScene = (): void => {
      const p = propsRef.current;
      disposeObject(world);
      world.clear();
      const night = isNight(p.minute);
      petModels.current = null;
      if (p.scene === 'cafe') {
        const play = p.play ?? PLAY_START;
        const placed = homeLayout(p.furniture, p.cats.length > 0, p.house, play, p.moved ?? {});
        world.add(house(placed, night, petModels, p.house, p.home ?? DEFAULT_LOOK, play));
        const zone = placed.find((x) => x.id === 'play_zone');
        // Кошки подходят к мискам и лотку вплотную и ходят по игровой зоне (мешают только домик и столбик).
        catBoxes = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter' && x.id !== 'play_zone').map((x) => x.box).filter((b): b is Box => b !== null), ...homeObstacles(placed), ...(zone ? playCatBoxes(zone.pos, play) : [])];
        playNow = zone ? playParts(zone.pos, play) : null;
        boxes = catBoxes;
        placedNow = placed;
      } else {
        const placed = demonLayout();
        world.add(demonRoom(placed, night));
        boxes = placed.map((x) => x.box).filter((b): b is Box => b !== null);
        catBoxes = boxes;
        playNow = null;
        placedNow = placed;
      }
      // Мульт-контур у мебели (пол и стены — без контура).
      addOutlines(world, { thickness: 0.035 });
      bounds = sceneBounds(p.scene, p.house);
      perches = perchSpots(placedNow, bounds, catBoxes);
      // Подойти можно только к предметам с действиями (декор просто украшает).
      targets = placedNow.filter((x) => actionsAt(x.id).length > 0).map((x) => ({ id: x.id, pos: x.use, obj: x }));
      ticks = ticksOf(world);
      // Подвесные светильники: камера близко у кошки — висят перед глазами, их прячем (свет остаётся).
      lampMeshes = [];
      world.getObjectByName('ceiling')?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) lampMeshes.push(o);
      });
      wheels = [];
      world.traverse((o) => {
        if (o.name === 'cat_wheel_spin') wheels.push(o);
      });
      sun.position.set(-9, 10, 3);
      ground = world.getObjectByName('ground') ?? null;
      lastNear = undefined;
      syncCats();
      // Новое место — кошка игрока входит в дверь; та же сцена — остаётся где была.
      if (builtScene !== p.scene) {
        const first = builtScene === null;
        builtScene = p.scene;
        const sp = spawn(p.scene, p.house);
        if (p.pet && (!first || p.scene === 'demon')) catLife.place(p.pet, sp, Math.PI / 2);
        const at = p.pet ? (cats.get(p.pet)?.pos ?? sp) : sp;
        pos.set(at.x, 0, at.z);
        camPos.set(at.x * 0.6, 4.5, at.z + 4.5);
      } else {
        const c = resolve({ x: pos.x, z: pos.z }, bounds, boxes);
        pos.set(c.x, 0, c.z);
      }
      syncDemon();
      vacuum.visible = p.scene === 'cafe' && p.furniture.includes('robot_vacuum');
    };

    // ── Кошки: живут своей жизнью по потребностям (см. catLife.ts). ──
    const catLife = createCatLife(scene, () => blobShadow(0.55));
    const cats = catLife.cats;
    let perches: Perch[] = [];
    let vacRand = 777;
    const catRand = (): number => {
      vacRand = (vacRand * 1103515245 + 12345) & 0x7fffffff;
      return vacRand / 0x7fffffff;
    };
    /** Что кошки знают о доме в этот кадр (один объект на всё время — без мусора в кадре). */
    const world0: CatWorld = {
      bounds,
      boxes: catBoxes,
      perches,
      litterSurface: 0.07,
      hero: pos,
      pet: null,
      onAct: (k) => propsRef.current.onSettled?.(k),
      bond: (a, b) => propsRef.current.bond?.(a, b) ?? 0,
      pets: { bowl: BOWL_MAX, water: 100, litter: 0 },
      need: (id) => {
        const c = propsRef.current.cats.find((x) => x.id === id);
        return { fed: c?.fed ?? 80, play: c?.play ?? 70, toilet: c?.toilet ?? 90 };
      },
    };
    const catWorld = (): CatWorld => {
      const p = propsRef.current;
      world0.bounds = bounds;
      world0.boxes = catBoxes;
      world0.perches = perches;
      world0.litterSurface = petModels.current?.surface ?? 0.07;
      const lit = placedNow.find((x) => x.id === 'litter');
      world0.litter = lit ? lit.pos : petsAt(p.house).litter.pos;
      const bw = placedNow.find((x) => x.id === 'cat_bowl');
      world0.bowls = bw ? { food: { x: bw.pos.x, z: bw.pos.z - 0.2 }, water: { x: bw.pos.x, z: bw.pos.z + 0.2 } } : undefined;
      world0.pets = p.pets ?? world0.pets;
      world0.play = playNow;
      world0.pet = p.pet;
      return world0;
    };
    const syncCats = (): void => {
      const p = propsRef.current;
      // В лавку демона кошка игрока приходит одна.
      catLife.sync(p.scene === 'cafe' ? p.cats : p.cats.filter((c) => c.id === p.pet), catWorld());
    };

    // Робот-пылесос: катается по дому и отворачивает от препятствий.
    const vacuum = new THREE.Group();
    vacuum.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 28), mat('#2b2e33', 0.35, 0.2), [0, 0.045, 0]));
    vacuum.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), mat('#c8ccd1', 0.3, 0.6), [0, 0.09, 0]));
    vacuum.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.02), M.glow('#5bff8a', 1.4), [0, 0.098, 0.1]));
    vacuum.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12), mat('#e85d2a', 0.5), [0.12, 0.012, 0.11]));
    vacuum.visible = false;
    scene.add(vacuum);
    const vac = { pos: { x: -6.2, z: 2.4 } as P2, heading: 0.4, turn: 0 };

    // Пока строятся сетки персонажей, кадры рисуются реже, чтобы сборка шла быстрее.
    let loading = 0;
    const track = <T,>(p: Promise<T>): Promise<T> => {
      loading += 1;
      return p.finally(() => {
        loading -= 1;
      });
    };

    // Демон за прилавком и кошка дня в клетке (только в лавке).
    const demonRoot = new THREE.Group();
    demonRoot.position.set(DEMON_SPOT.x, 0, DEMON_SPOT.z);
    scene.add(demonRoot);
    let demonParts: CharacterParts | null = null;
    let demonLoading = false;
    /** Кошка дня на ленте, завтрашняя — на коленях у демона, падающая в жерло, могилки. */
    let beltCat: Cat3D | null = null;
    let lapCat: Cat3D | null = null;
    let fallCat: { cat: Cat3D; at: number } | null = null;
    let beltKey = '';
    let lapKey = '';
    let gravesKey = '';
    let gravesSeen = -1;
    const gravesGroup = new THREE.Group();
    scene.add(gravesGroup);
    const dropCat = (c: Cat3D | null): void => {
      if (!c) return;
      scene.remove(c.root);
      disposeObject(c.root);
    };
    /** Колени демона: чуть впереди сиденья кресла. */
    const LAP = { x: DEMON_SPOT.x + Math.sin(DEMON_FACE) * 0.18, z: DEMON_SPOT.z + Math.cos(DEMON_FACE) * 0.18, y: 0.74 };
    const syncDemon = (): void => {
      const p = propsRef.current;
      const show = p.scene === 'demon';
      demonRoot.visible = show;
      gravesGroup.visible = show;
      if (show && !demonParts && !demonLoading) {
        demonLoading = true;
        void track(loadCharacter(DEMON_LOOK)).then((parts) => {
          if (disposed) {
            disposeObject(parts.root);
            return;
          }
          demonParts = parts;
          demonRoot.add(parts.root);
        });
      }
      // Кошка дня на ленте.
      const bk = show && p.offer ? JSON.stringify(p.offer) : '';
      if (bk !== beltKey) {
        beltKey = bk;
        dropCat(beltCat);
        beltCat = null;
        if (bk && p.offer) {
          beltCat = buildCat(p.offer.breed, 7, { mix: p.offer.mix, grow: p.offer.grow });
          scene.add(beltCat.root);
        }
      }
      // Завтрашняя кошка на коленях.
      const lk = show && p.tomorrow ? JSON.stringify(p.tomorrow) : '';
      if (lk !== lapKey) {
        lapKey = lk;
        dropCat(lapCat);
        lapCat = null;
        if (lk && p.tomorrow) {
          lapCat = buildCat(p.tomorrow.breed, 9, { mix: p.tomorrow.mix, grow: Math.max(0.8, p.tomorrow.grow) });
          lapCat.root.position.set(LAP.x, LAP.y, LAP.z);
          lapCat.root.rotation.y = DEMON_FACE + Math.PI / 2;
          scene.add(lapCat.root);
        }
      }
      // Могилки (последние GRAVES_SHOWN): камень, фото кошки, имя.
      const graves = p.graves ?? [];
      // Новая могилка, пока лавка открыта, — кошка на глазах падает с ленты в жерло.
      if (gravesSeen >= 0 && graves.length > gravesSeen && show) {
        const last = graves[graves.length - 1]!;
        if (fallCat) dropCat(fallCat.cat);
        fallCat = { cat: buildCat(last.breed, 11, { mix: last.mix }), at: -1 };
        scene.add(fallCat.cat.root);
      }
      gravesSeen = graves.length;
      const gk = show ? graves.map((x) => x.key).join(',') : '';
      if (gk === gravesKey) return;
      gravesKey = gk;
      disposeObject(gravesGroup);
      gravesGroup.clear();
      graves.slice(-GRAVES_SHOWN).forEach((gr, i) => {
        const at = graveSpot(i);
        const st = new THREE.Group();
        const stone = mat('#7b7874', 0.95);
        st.add(mesh(new THREE.BoxGeometry(0.46, 0.5, 0.1), stone, [0, 0.25, 0]));
        st.add(mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.1, 18, 1, false, -Math.PI / 2, Math.PI), stone, [0, 0.5, 0]).rotateX(Math.PI / 2));
        st.add(mesh(new THREE.BoxGeometry(0.56, 0.06, 0.2), mat('#5f5c58', 0.95), [0, 0.03, 0.02]));
        // Холмик.
        st.add(mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3a281e', 0.98), [0, 0, 0.35], [0.9, 0.35, 1.3]));
        const plate = graveTexture(gr.name);
        const ph = mesh(new THREE.PlaneGeometry(0.34, 0.42), new THREE.MeshBasicMaterial({ map: plate.tex }), [0, 0.36, 0.052]);
        ph.userData.noOutline = true;
        st.add(ph);
        // Цветок у камня.
        st.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), M.glow('#ff8fb1', 0.4), [0.18, 0.09, 0.12]));
        st.position.set(at.x, 0, at.z);
        st.rotation.y = ((i * 37) % 7) * 0.02 - 0.06;
        st.scale.setScalar(1.5);
        gravesGroup.add(st);
        void import('./snapshot').then((m) => m.renderCat(gr.breed, 128, gr.mix, 1)).then((url) => plate.photo(url)).catch(() => {});
      });
      addOutlines(gravesGroup, { thickness: 0.02 });
    };

    // Кошка игрока: мягкое светящееся кольцо под ней (видно, кого ведёшь).
    const ring = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: '#7ff0d0', transparent: true, opacity: 0.55, depthWrite: false });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 48), ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ring.add(ringMesh);
    const ringIn = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshBasicMaterial({ color: '#7ff0d0', transparent: true, opacity: 0.12, depthWrite: false }));
    ringIn.rotation.x = -Math.PI / 2;
    ring.add(ringIn);
    ring.renderOrder = 3;
    scene.add(ring);
    sun.target = ring;
    // Масштаб: колесо мыши, щипок двумя пальцами или кнопки ＋/−.
    let zoom = loadZoom();
    let saveTimer = 0;
    const zoomBy = (k: number): void => {
      zoom = clampZoom(zoom * k);
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(ZOOM_KEY, String(zoom));
        } catch {
          // хранилище недоступно — масштаб живёт до перезагрузки
        }
      }, 300);
    };
    api.current = { rebuildScene, syncCats, syncDemon, zoomBy };

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    const resize = (): void => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    rebuildScene();
    setReady(true);
    // Мульт-мебель Kenney: как загрузится — пересобрать комнату.
    if (!furnitureReady())
      void loadFurniture().then(() => {
        if (!disposed && furnitureReady()) rebuildScene();
      });

    const keys = new Set<string>();
    /** С Shift клавишами — бегом, без него — шагом. */
    let runKey = false;
    const onKey = (e: KeyboardEvent): void => {
      runKey = e.shiftKey;
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'ц', 'ф', 'ы', 'в'].includes(k)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.type === 'keydown') {
        keys.add(k);
        propsRef.current.onInput?.();
      } else keys.delete(k);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const ray = new THREE.Raycaster();
    let downAt = { x: 0, y: 0, t: 0 };
    const touches = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let pinched = false;
    const spread = (): number => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (e: PointerEvent): void => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        pinch = spread();
        pinched = true;
      } else if (touches.size === 1) {
        pinched = false;
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
    };
    const onMove = (e: PointerEvent): void => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch > 0) {
        const d = spread();
        if (d > 0) zoomBy(pinch / d);
        pinch = d;
      }
    };
    const onLeave = (e: PointerEvent): void => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = 0;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.0015));
    };
    const onUp = (e: PointerEvent): void => {
      const multi = touches.size > 1 || pinched;
      onLeave(e);
      if (multi || !ground || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12 || performance.now() - downAt.t > 500) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(ground, false)[0];
      if (propsRef.current.editing) {
        // Перестановка: какой предмет под пальцем (первый задетый) и точка пола.
        let key: string | null = null;
        for (const h of ray.intersectObject(world, true)) {
          let o: THREE.Object3D | null = h.object;
          while (o && o !== world && typeof o.userData.placedKey !== 'string') o = o.parent;
          if (o && o !== world) {
            key = o.userData.placedKey as string;
            break;
          }
        }
        if (hit || key) propsRef.current.onEditTap?.({ x: hit?.point.x ?? 0, z: hit?.point.z ?? 0 }, key);
        return;
      }
      if (hit) {
        propsRef.current.onInput?.();
        propsRef.current.goto.current = { x: hit.point.x, z: hit.point.z };
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((x) => x.isIntersecting);
    });
    io.observe(el);
    const onLost = (e: Event): void => {
      e.preventDefault();
      propsRef.current.onFail();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const updateVacuum = (t: number, dt: number): void => {
      if (!vacuum.visible) return;
      const step = 0.3 * dt;
      const next = resolve({ x: vac.pos.x + Math.sin(vac.heading) * step, z: vac.pos.z + Math.cos(vac.heading) * step }, bounds, boxes);
      const moved = Math.hypot(next.x - vac.pos.x, next.z - vac.pos.z);
      if (vac.turn > 0) {
        vac.heading += dt * 2.2;
        vac.turn -= dt;
      } else if (moved < step * 0.5 || [...cats.values()].some((c) => dist(next, c.pos) < 0.5)) vac.turn = 0.6 + catRand() * 1.2;
      else vac.pos = next;
      vacuum.position.set(vac.pos.x, 0, vac.pos.z);
      vacuum.rotation.y = vac.heading;
      const brush = vacuum.children[3];
      if (brush) brush.rotation.y = t * 12;
    };

    let raf = 0;
    let prev = performance.now();
    /** Касание пола: куда уже отправлена кошка игрока. */
    let sentTo: P2 | null = null;
    /** Действие кошки игрока, которое уже начато в сцене. */
    let jobKey: number | null = null;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      const p = propsRef.current;
      const t = now / 1000;
      const w = catWorld();
      // ── Действие кошки игрока: подходит сама и делает (сцена сообщает, когда начала) ──
      const pf = p.perform;
      if (pf && jobKey !== pf.key && p.pet) {
        jobKey = pf.key;
        const me = cats.get(p.pet);
        const here = me ? me.pos : { x: pos.x, z: pos.z };
        const placed = pf.at && pf.at !== 'cat' ? (placedNow.filter((x) => x.id === pf.at).sort((a, b) => dist(a.use, here) - dist(b.use, here))[0] ?? null) : null;
        const target = pf.at === 'cat' ? (pf.target ?? catLife.nearest(here, p.pet)?.id ?? null) : null;
        catLife.perform(p.pet, { key: pf.key, action: pf.action, at: placed, target }, w, t);
        sentTo = null;
      }
      if (!pf && jobKey !== null) {
        jobKey = null;
        catLife.endJob();
      }
      // Управление: стик и клавиши (во время действия — нет).
      let dx = 0;
      let dz = 0;
      if (!pf) {
        dx = p.stick.current.x;
        dz = -p.stick.current.y;
        if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) dz -= 1;
        if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) dz += 1;
        if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright') || keys.has('в')) dx += 1;
      }
      let mag = Math.min(1, Math.hypot(dx, dz));
      if (keys.size > 0 && !runKey) mag = Math.min(mag, STICK_WALK);
      if (mag > 0.05) {
        // Игрок ведёт кошку — сама она не идёт.
        p.goto.current = null;
        sentTo = null;
        p.onInput?.();
        const d = Math.hypot(dx, dz) || 1;
        catLife.steer(dx / d, dz / d, mag);
      } else catLife.steer(0, 0, 0);
      // Касание пола или самостоятельность: кошка идёт к точке.
      const goal = pf ? null : p.goto.current;
      if (goal && p.pet && (!sentTo || Math.hypot(goal.x - sentTo.x, goal.z - sentTo.z) > 0.3)) {
        sentTo = { ...goal };
        catLife.goTo(p.pet, goal, w, t);
      }
      if (goal && sentTo && p.pet && !catLife.walking(p.pet)) {
        // Дошла (или упёрлась) — цель снята.
        p.goto.current = null;
        sentTo = null;
      }
      const nightNow = isNight(p.minute);
      for (const f of ticks) f(t, p.minute, nightNow);
      catLife.update(t, dt, w);
      const me = p.pet ? cats.get(p.pet) : undefined;
      if (me) pos.set(me.pos.x, 0, me.pos.z);
      // Кольцо под кошкой игрока: дышит, на мебели — поднимается вместе с ней.
      ring.visible = !!me;
      if (me) {
        ring.position.set(me.pos.x, (me.jump ? 0 : me.y) + 0.02, me.pos.z);
        const k = me.size / 1.35;
        ring.scale.setScalar(k * (1 + 0.05 * Math.sin(t * 3)));
        ringMat.opacity = 0.4 + 0.15 * Math.sin(t * 3);
      }
      updateVacuum(t, dt);
      if (demonParts && demonRoot.visible) {
        // Демон сидит в кресле и гладит завтрашнюю кошку на коленях; герой рядом — ухмыляется
        // и что-то говорит. Таз — на сиденье кресла (стопы впереди).
        const nearHero = Math.hypot(pos.x - DEMON_SPOT.x, pos.z - DEMON_SPOT.z) < 3.2;
        const k = -seatOffsets(demonParts.rig).hips;
        demonRoot.position.set(DEMON_SPOT.x + Math.sin(DEMON_FACE) * k, 0, DEMON_SPOT.z + Math.cos(DEMON_FACE) * k);
        demonRoot.rotation.y = DEMON_FACE;
        const talk = nearHero && Math.sin(t * 0.7) > 0.2;
        animate(demonParts.rig, talk ? 'sit:talk' : 'sit:pet', t, (t * 0.4) % 1, 1 - Math.exp(-dt * 5));
        breathe(demonParts.rig, t, 1.7, 0.8);
        demonParts.face.want(nearHero ? 'smile' : null, 0.8);
        demonParts.face.update(dt);
        for (const f of demonParts.anim) f(t);
      }
      if (lapCat) poseCat(lapCat, Math.sin(t * 0.2) > 0.4 ? 'purr' : 'lie', t, 0, Math.min(1, dt * 4));
      if (beltCat) {
        // Кошка дня едет по ленте весь день: где она — по времени суток (в полночь — у жерла).
        const f = dayFraction(new Date());
        const at = beltSpot(f);
        beltCat.root.position.set(at.x, BELT.y - 0.03, at.z);
        const near = Math.hypot(pos.x - at.x, pos.z - at.z) < 2.6;
        const want = near ? Math.atan2(pos.x - at.x, pos.z - at.z) : 0.25;
        beltCat.root.rotation.y += (want - beltCat.root.rotation.y) * Math.min(1, dt * 2);
        // Чем ближе к жерлу, тем тревожнее: прижимается и оглядывается.
        poseCat(beltCat, f > 0.8 ? 'crouch' : Math.sin(t * 0.3) > 0.5 ? 'lie' : 'sit', t, 0, Math.min(1, dt * 4), near ? 0.5 : 0);
      }
      if (fallCat) {
        // С конца ленты — шаг к жерлу, кувырок вниз и огонь.
        if (fallCat.at < 0) fallCat.at = t;
        const e = t - fallCat.at;
        const c = fallCat.cat;
        const x0 = BELT.x1;
        const x1 = BELT.pit.x;
        const s1 = Math.min(1, e / 1.2);
        c.root.position.set(x0 + (x1 - x0) * s1, BELT.y - 0.03 + 0.25 * Math.sin(Math.PI * s1) - Math.max(0, e - 1.2) ** 2 * 2.5, BELT.z);
        c.root.rotation.set(Math.max(0, e - 1.0) * 2.2, Math.PI / 2, 0);
        poseCat(c, e < 1.2 ? 'jump' : 'belly', t, 0, Math.min(1, dt * 6));
        if (e > 2.6) {
          dropCat(c);
          fallCat = null;
        }
      }
      // Камера сверху-спереди, комната видна в разрезе.
      // Ближе — камера следует за кошкой плотнее и ниже, дальше — видна вся комната.
      // Близко — кошка в центре кадра; издалека — камера тянется к середине комнаты.
      const far = Math.max(0, Math.min(1, (zoom - 0.8) / 1));
      const follow = 1 - 0.45 * far;
      const cy = me ? me.y * 0.6 : 0;
      const want = new THREE.Vector3(pos.x * follow, 0.55 + (6.8 - 0.55) * zoom + cy, pos.z + 0.6 + 5.8 * zoom);
      camPos.lerp(want, Math.min(1, dt * 4));
      camera.position.copy(camPos);
      const lookF = 1 - 0.2 * far;
      camLook.lerp(lookV.set(pos.x * lookF, 0.2 + 0.3 * Math.min(1, zoom) + cy, pos.z - 0.25 - 0.9 * far), Math.min(1, dt * 6));
      camera.lookAt(camLook);
      const showLamps = zoom > 1.05;
      if (lampMeshes[0] && lampMeshes[0].visible !== showLamps) for (const m of lampMeshes) m.visible = showLamps;
      const light = daylight(p.minute);
      hemi.intensity = 0.6 + light * 0.45;
      sun.intensity = 0.7 + light * 1.1;
      // Свет из окон слева; тени падают вправо и к зрителю.
      sun.position.set(pos.x - 7, 10, pos.z + 3);
      // Ближайший предмет или кошка (во время действия — без изменений).
      let near: ObjectId | null = lastNear ?? null;
      if (!pf) {
        near = null;
        let best = REACH;
        for (const x of targets) {
          const d = dist(pos, x.pos);
          if (d < best) {
            best = d;
            near = x.id;
          }
        }
        for (const c of cats.values()) {
          if (c.id === p.pet) continue;
          const d = dist(pos, c.pos) + 0.25;
          if (d < Math.min(best, 1.4)) {
            best = d;
            near = 'cat';
          }
        }
      }
      if (p.heroAt) {
        p.heroAt.current.x = pos.x;
        p.heroAt.current.z = pos.z;
      }
      // Где кошки (ближайшая — первой) — для самостоятельного сима (раз в 0,2 с, без мусора в каждом кадре).
      if (p.catSpots && t - spotsAt > 0.2) {
        spotsAt = t;
        p.catSpots.current = [...cats.values()].filter((c) => c.id !== p.pet).sort((a, b) => dist(pos, a.pos) - dist(pos, b.pos)).map((c) => ({ id: c.id, x: c.pos.x, z: c.pos.z }));
      }
      // Миска и лоток показывают состояние: сколько корма и грязи.
      {
        const em = p.editing ? p.editMark : null;
        mark.visible = !!em;
        if (em) {
          const w = Math.max(0.3, em.box.x1 - em.box.x0);
          const d = Math.max(0.3, em.box.z1 - em.box.z0);
          mark.position.set((em.box.x0 + em.box.x1) / 2, 0.035, (em.box.z0 + em.box.z1) / 2);
          mark.scale.set(w, d, 1);
          const c = em.ok ? '#3ddc84' : '#ff4a4a';
          markMat.color.set(c);
          (markLine.material as THREE.LineBasicMaterial).color.set(c);
          markMat.opacity = 0.25 + 0.12 * Math.sin(t * 5);
        }
      }
      if (wheels.length) {
        wheelSpeed += ((catLife.inWheel() > 0 ? 3.2 : 0) - wheelSpeed) * Math.min(1, dt * 1.5);
        for (const w of wheels) w.rotation.z += wheelSpeed * dt;
      }
      if (petModels.current && p.pets) {
        petModels.current.setFood(p.pets.bowl / BOWL_MAX);
        petModels.current.setWater(p.pets.water / 100);
        petModels.current.setDirt(p.pets.litter / 100);
      }
      if (near !== lastNear) {
        lastNear = near;
        p.onNear(near);
      }
      // Во время сборки — не больше ~20% времени на отрисовку.
      if (loading > 0 && now - lastRender < renderCost * 4) return;
      const r0 = performance.now();
      renderer.render(scene, camera);
      lastRender = now;
      renderCost = renderCost * 0.8 + (performance.now() - r0) * 0.2;
    };
    let lastRender = 0;
    let renderCost = 8;
    let spotsAt = -1;
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      clearTimeout(saveTimer);
      canvas.removeEventListener('webglcontextlost', onLost);
      api.current = null;
      disposeObject(scene);
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  // Перестройка сцены: другое место, мебель, уровень зала, смена дня и ночи.
  const night = isNight(props.minute);
  const sceneKey = JSON.stringify([props.scene, props.furniture, props.house, props.home, night, props.cats.length > 0, props.play, props.moved]);
  const firstScene = useRef(sceneKey);
  useEffect(() => {
    if (sceneKey === firstScene.current) return;
    firstScene.current = sceneKey;
    api.current?.rebuildScene();
  }, [sceneKey]);

  const catsKey = JSON.stringify([props.pet, props.cats.map((c) => [c.id, c.breed, c.mix, Math.round((c.grow ?? 1) * 10)])]);
  useEffect(() => {
    api.current?.syncCats();
  }, [catsKey]);

  const offerKey = JSON.stringify([props.offer, props.tomorrow, props.graves?.map((g) => g.key)]);
  useEffect(() => {
    api.current?.syncDemon();
  }, [offerKey]);

  return (
    <div ref={host} className="world3d">
      <div className="zoom-btns">
        <button className="btn ghost" aria-label="+" onClick={() => api.current?.zoomBy(1 / 1.25)}>
          ＋
        </button>
        <button className="btn ghost" aria-label="−" onClick={() => api.current?.zoomBy(1.25)}>
          −
        </button>
      </div>
      {!ready && (
        <div className="hero3d-busy">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
