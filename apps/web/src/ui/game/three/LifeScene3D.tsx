import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { actionsAt, dayFraction } from '../../../game/life';
import { BOWL_MAX } from '../../../game/lifeContent';
import { PLAY_START, BELT, DEMON_FACE, DEMON_ROOM, DEMON_SPOT, GRAVES_SHOWN, REACH, beltSpot, demonLayout, graveSpot, guestSpots, houseRect, playCatBoxes, playParts, tableChairs, type PlayParts, STICK_WALK, WALK_SPEED, bounds as sceneBounds, blocked, detourPoint, dist, freeSpot, homeLayout, homeObstacles, petsAt, resolve, spawn, stickSpeed, type Box, type P2, type Placed } from '../../../game/lifeMap';
import type { PlayZoneState, CatBreed, ObjectId, SceneId } from '../../../game/lifeTypes';
import { animFor } from './actionAnims';
import { disposeObject, type CharacterParts } from './buildCharacter';
import { addOutlines } from './outline';
import { furnitureReady, loadFurniture } from './kenney';
import { createCatLife, perchSpots, type CatAI, type CatHeroAct, type CatWorld, type Perch } from './catLife';
import { buildBowls, buildCat, buildLitter, poseCat, type Cat3D } from './cats3d';
import { CAFE_DECOR, NEW_KIT, kitOf, type HomeLook } from '../../../game/homeDecor';
import { contactShadow, objectModel, plasterTexture, playZoneModel, ticksOf, type HomeAnim } from './homeModels';
import { curtains, doorModel, floorMesh, kitchenTiles, roomLights, roomOcclusion, roomWalls, rugMesh, windowStyle } from './interior';

/** Кафе без данных о ремонте — простой новый ремонт и новая мебель. */
const DEFAULT_LOOK: HomeLook = { decor: CAFE_DECOR, kit: NEW_KIT };

/** Демон-лавочник: красная кожа, рожки, крылья летучей мыши, тёмная одежда. */
const DEMON_LOOK: Look = {
  color: '#5b1020',
  appearance: { figure: 'male', skin: 1, hair: 'curly', hairColor: 0, beard: true, eyes: 5 },
  equipped: { head: 'devil_horns', back: 'bat_wings', body: 'button_shirt', legs: 'leather_pants', feet: 'chelsea_boots' },
  skin: { base: '#c8403a', shade: '#8f2a26' },
};
import { M, mat, mesh } from './kit';
import { blobShadow, loadCharacter, lookKey, type Look, type Member } from './people';
import { prepareFists, showProps, tickProps, type PropKind } from './props3d';
import { animate, gaitFreq, seatOffsets, type Motion, breathe } from './rig';
import { expressionFor } from './face';
import { createStudio, setupRenderer } from './studio';

/**
 * 3D-сцены котокафе: само кафе (зал в разрезе, растёт со ступенью) с кошками и гостями,
 * которые с ними играют, и лавка демона: тёмная комната со свечами, демон за прилавком
 * и клетка с кошкой дня. Герой ходит джойстиком, клавишами или по касанию пола — со
 * скелетной анимацией шага; рядом с предметом сцена сообщает, с чем можно взаимодействовать.
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
  hero: Look;
  /** Гости кафе (пусто в лавке демона). */
  guests: Member[];
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
  /** Еда на витрине: сколько порций и сколько помещается (пирожные за стеклом). */
  food?: { n: number; max: number };
  /** Герой выполняет действие у предмета (анимация до результата). */
  perform: { key: number; action: string; at: ObjectId | null } | null;
  /** Куда сцена пишет, где сейчас кошки (для самостоятельного сима). */
  catSpots?: { current: P2[] };
  /** Куда сцена пишет, где герой (для самостоятельного сима). */
  heroAt?: { current: P2 };
  stick: { current: { x: number; y: number } };
  goto: { current: P2 | null };
  onNear(target: ObjectId | null): void;
  /** Игрок сам управляет героем (клавиши, касание пола) — сим перестаёт действовать сам. */
  onInput?(): void;
  /** Герой подошёл и занял место действия (отсюда считается его длительность). */
  onSettled?(key: number): void;
  onFail(): void;
}

const ZOOM_KEY = 'fitness-rpg.lifeZoom';
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.8;
const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function loadZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v > 0 ? clampZoom(v) : 1;
  } catch {
    return 1;
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

/** Меловая доска-меню кафе: название и пара строк мелом с рисунками чашки и пирожного. */
function menuTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2b3a33';
    ctx.fillRect(0, 0, 512, 288);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle = '#fdf8ee';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 58px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('КОТОКАФЕ', 256, 52, 470);
    ctx.font = '34px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('капучино ......... 9', 150, 132, 340);
    ctx.fillText('чизкейк ........... 12', 150, 186, 340);
    ctx.fillText('круассан ......... 8', 150, 240, 340);
    // Чашка с паром и кусок торта.
    ctx.beginPath();
    ctx.moveTo(48, 130);
    ctx.lineTo(56, 172);
    ctx.lineTo(104, 172);
    ctx.lineTo(112, 130);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(116, 148, 10, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    for (const x of [70, 90]) {
      ctx.beginPath();
      ctx.moveTo(x, 122);
      ctx.bezierCurveTo(x - 8, 112, x + 8, 104, x, 94);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(44, 256);
    ctx.lineTo(116, 256);
    ctx.lineTo(116, 222);
    ctx.lineTo(44, 240);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(100, 214, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8fa8';
    ctx.fill();
    // Рамка.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(14, 14, 484, 260);
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
  const { w, d, L, R, B, F, cx, cz } = houseRect(tier);
  const room = { w, d, cx, cz };
  const wallsG = roomWalls(look, room);
  wallsG.position.set(cx, 0, cz);
  const ao = roomOcclusion(w, d, 0.9);
  ao.position.set(cx, 0, cz);
  g.add(floorMesh(look, room), wallsG, ao);
  // Зона за стойкой: плитка на полу и фартук на стене (по отделке «Плитка у стойки»).
  const kitchen = kitchenTiles(look, 3.4, 2.6, B);
  kitchen.position.x = R - 1.7;
  g.add(kitchen);
  // Меловая доска-меню над стойкой в деревянной раме.
  const board = new THREE.Group();
  board.add(mesh(new THREE.BoxGeometry(1.84, 1.06, 0.05), mat('#6e4a2c', 0.8), [0, 0, 0]));
  const face = mesh(new THREE.PlaneGeometry(1.7, 0.95), new THREE.MeshBasicMaterial({ map: menuTexture(), toneMapped: false }), [0, 0, 0.03]);
  face.userData.noOutline = true;
  board.add(face);
  board.position.set(R - 1.7, 2.25, B + 0.06);
  g.add(board);
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
  g.add(roomLights(look, lamps, night));
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

interface Crew {
  root: THREE.Group;
  parts: CharacterParts | null;
  key: string;
  shadow: THREE.Mesh;
  spot: P2;
  seed: number;
  /** Сидит за столиком (стул и куда смотрит) — ест и пьёт; null — играет с кошками. */
  seat: { pos: P2; face: number } | null;
  /** Движение в прошлом кадре (смена — другие предметы в руках). */
  motion: Motion | null;
}

export default function LifeScene3D(props: LifeScene3DProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const api = useRef<{ rebuildScene(): void; rebuildHero(): void; syncClients(): void; syncCats(): void; syncDemon(): void; zoomBy(k: number): void } | null>(null);
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
    /** Игровая зона кафе для кошек (в лавке демона — нет). */
    let playNow: PlayParts | null = null;
    /** Пирожные в витрине стойки (видно столько, сколько еды на витрине). */
    let cakes: THREE.Object3D[] = [];
    /** Беговые колёса игровой зоны: крутятся, пока в них бегает кошка. */
    let wheels: THREE.Object3D[] = [];
    let wheelSpeed = 0;
    const pos = new THREE.Vector3();
    const camPos = new THREE.Vector3();
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
        const placed = homeLayout(p.furniture, p.cats.length > 0, p.house, play);
        world.add(house(placed, night, petModels, p.house, p.home ?? DEFAULT_LOOK, play));
        boxes = [...placed.map((x) => x.box).filter((b): b is Box => b !== null), ...homeObstacles()];
        // Кошки подходят к мискам и лотку вплотную и ходят по игровой зоне (мешают только домик и столбик).
        const zone = placed.find((x) => x.id === 'play_zone');
        catBoxes = [...placed.filter((x) => x.id !== 'cat_bowl' && x.id !== 'litter' && x.id !== 'play_zone').map((x) => x.box).filter((b): b is Box => b !== null), ...homeObstacles(), ...(zone ? playCatBoxes(zone.pos, play) : [])];
        playNow = zone ? playParts(zone.pos, play) : null;
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
      cakes = [];
      wheels = [];
      world.traverse((o) => {
        if (typeof o.userData.cake === 'number') cakes.push(o);
        if (o.name === 'cat_wheel_spin') wheels.push(o);
      });
      sun.position.set(-9, 10, 3);
      ground = world.getObjectByName('ground') ?? null;
      // Новое место — герой у двери; та же сцена — остаётся где был.
      if (builtScene !== p.scene) {
        builtScene = p.scene;
        const sp = spawn(p.scene, p.house);
        pos.set(sp.x, 0, sp.z);
        camPos.set(sp.x * 0.6, 7, sp.z + 7);
        facing = Math.PI / 2;
      } else {
        const c = resolve({ x: pos.x, z: pos.z }, bounds, boxes);
        pos.set(c.x, 0, c.z);
      }
      lastNear = undefined;
      syncClients();
      syncCats();
      syncDemon();
      vacuum.visible = p.scene === 'cafe' && p.furniture.includes('robot_vacuum');
    };

    // Текущее действие героя (объявлено до кошек: они на него реагируют).
    let act: Acting | null = null;

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
    const catAct: CatHeroAct = { key: 0, motion: 'idle', cat: null, settledAt: null, at: { x: 0, z: 0 } };
    const world0: CatWorld = {
      bounds,
      boxes: catBoxes,
      perches,
      litterSurface: 0.07,
      hero: pos,
      act: null,
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
      world0.litter = petsAt(p.house).litter.pos;
      world0.pets = p.pets ?? world0.pets;
      world0.play = playNow;
      if (act) {
        catAct.key = act.key;
        catAct.motion = act.motion;
        catAct.cat = act.cat;
        catAct.settledAt = act.settle && !act.approach ? act.settle.at : null;
        catAct.at = act.anchor;
        world0.act = catAct;
      } else world0.act = null;
      return world0;
    };
    const syncCats = (): void => {
      const p = propsRef.current;
      catLife.sync(p.scene === 'cafe' ? p.cats : [], catWorld());
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

    // Гости кафе: играют с кошками, фотографируют их, болтают.
    const crew = new Map<string, Crew>();
    /** Чем занят гость (по кругу, у каждого свой порядок): движение и сколько секунд. */
    const GUEST_ACTS: ReadonlyArray<[Motion, number]> = [
      ['crouch:pet', 7],
      ['stand:phone', 5],
      ['crouch:play', 6],
      ['stand:talk', 5],
      ['idle', 3],
    ];
    /** Гость за столиком: ест пирожное, пьёт кофе, болтает, листает телефон. */
    const TABLE_ACTS: ReadonlyArray<[Motion, number]> = [
      ['sit:eat', 9],
      ['sit:drink', 6],
      ['sit:talk', 6],
      ['sit:phone', 4],
    ];
    /** Что у гостя за столиком в руках при каждом занятии. */
    const TABLE_PROPS: Partial<Record<Motion, PropKind[]>> = { 'sit:eat': ['plate', 'fork'], 'sit:drink': ['cup'], 'sit:phone': ['phone'] };
    const actCycle = (acts: ReadonlyArray<[Motion, number]>, e: Crew, t: number): { motion: Motion; phase: number } => {
      const len = acts.reduce((a, x) => a + x[1], 0);
      const tt = (t + e.seed * 13) % len;
      const start = Math.floor(e.seed * 3.1) % acts.length;
      let acc = 0;
      for (let k = 0; k < acts.length; k += 1) {
        const [m, d] = acts[(start + k) % acts.length]!;
        if (tt < acc + d) return { motion: m, phase: (tt - acc) / d };
        acc += d;
      }
      return { motion: 'idle', phase: 0 };
    };
    const crewSet = (e: Crew, t: number): { motion: Motion; phase: number } => actCycle(e.seat ? TABLE_ACTS : GUEST_ACTS, e, t);
    const catSpotsNow = (): P2[] => [...cats.values()].map((c) => c.pos);
    let crewQueue: Promise<void> = Promise.resolve();
    const syncClients = (): void => {
      const p = propsRef.current;
      const want = p.scene === 'cafe' ? p.guests : [];
      // Больше половины гостей сидят за столиками (пока есть стулья), остальные — с кошками.
      const chairs = p.scene === 'cafe' ? tableChairs(p.house, p.play?.size ?? 0) : [];
      const seated = Math.min(chairs.length, Math.ceil(want.length * 0.6));
      const spots = guestSpots(p.house, boxes, want.length - seated);
      for (const [id, e] of crew) {
        if (!want.some((w) => w.id === id && lookKey(w) === e.key)) {
          scene.remove(e.root, e.shadow);
          disposeObject(e.root);
          crew.delete(id);
        }
      }
      want.forEach((w, i) => {
        const chair = i < seated ? chairs[i]! : null;
        const spot = chair ? chair.pos : (spots[i - seated] ?? spots[spots.length - 1] ?? { x: 0, z: 0 });
        const seat = chair ? { pos: chair.pos, face: chair.face } : null;
        const e = crew.get(w.id);
        if (e) {
          e.spot = spot;
          e.seat = seat;
          e.motion = null;
          return;
        }
        const root = new THREE.Group();
        const shadow = blobShadow(1);
        scene.add(root, shadow);
        const entry: Crew = { root, parts: null, key: lookKey(w), shadow, spot, seed: i * 1.7 + 0.3, seat, motion: null };
        crew.set(w.id, entry);
        // По одному, чтобы не подвешивать кадр сборкой десяти персонажей сразу.
        crewQueue = crewQueue.then(async () => {
          if (disposed || crew.get(w.id) !== entry) return;
          const parts = await track(loadCharacter(w));
          if (disposed || crew.get(w.id) !== entry) {
            disposeObject(parts.root);
            return;
          }
          entry.parts = parts;
          root.add(parts.root);
        }).catch(() => {
          // Ученик без модели не должен останавливать загрузку остальных.
        });
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

    // Герой.
    const heroRoot = new THREE.Group();
    const shadow = blobShadow();
    scene.add(heroRoot, shadow);
    sun.target = heroRoot;
    let hero: CharacterParts | null = null;
    let heroToken = 0;
    const rebuildHero = (): void => {
      const my = (heroToken += 1);
      void track(loadCharacter(propsRef.current.hero)).then((parts) => {
        if (disposed || my !== heroToken) {
          disposeObject(parts.root);
          return;
        }
        if (hero) {
          heroRoot.remove(hero.root);
          disposeObject(hero.root);
        }
        hero = parts;
        heroRoot.add(hero.root);
        // Сжатие кистей для предметов в руках — заранее, чтобы не тормозить в начале действия.
        prepareFists(hero.rig);
        setReady(true);
      });
    };
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
    api.current = { rebuildScene, rebuildHero, syncClients, syncCats, syncDemon, zoomBy };

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

    let facing = Math.PI / 2;
    rebuildScene();
    rebuildHero();
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

    // ── Действие героя: подходит шагом, плавно занимает место (садится, ложится), берёт
    //    предметы в руки, после действия так же плавно встаёт и убирает их. ──
    interface Acting {
      key: number;
      motion: Motion;
      anchor: P2;
      y: number;
      face: number;
      cat: string | null;
      /** Куда сначала подойти шагом (null — уже на месте). */
      approach: P2 | null;
      /** Потом — последние шаги к месту стоя мимо препятствий (к дивану вплотную), null — уже там. */
      inTo: P2 | null;
      /** Где стоят стопы перед посадкой (у поз сидя — впереди места, иначе само место). */
      stand: P2;
      /** Свободная точка рядом с местом: отсюда подходит, сюда отходит после действия. */
      free: P2;
      /** Садится (посадка с неподвижными стопами), а не устраивается плавным переходом. */
      sit: boolean;
      /**
       * Начало «устраивания» на месте: откуда, с какой высоты и поворота, сколько длится
       * поворот перед посадкой и началась ли посадка.
       */
      settle: { at: number; from: P2; fromY: number; fromFace: number; turn: number; down: boolean } | null;
      props: PropKind[] | undefined;
    }
    /**
     * После действия: встаёт (up — ход 1…0 посадки или плавный переход в стойку за rise с), затем
     * шагом отходит к свободной точке (out).
     */
    let exiting: { at: number; from: P2; fromY: number; motion: Motion; sit: boolean; rise: number; stand: P2; to: P2; out: boolean } | null = null;
    let heroY = 0;
    const SETTLE = 0.75;
    /** Посадка и вставание (с). */
    const SIT = 1.0;
    /** Встать из позы лёжа (с переходом на край кровати) и из позы стоя или присев. */
    const EXIT_LIE = 0.6;
    const EXIT_STAND = 0.35;
    /** Ход посадки в этом кадре (для анимации). */
    let seatK = 1;
    const nearestCat = (): CatAI | null => catLife.nearest(pos);
    const startPerform = (pf: { key: number; action: string; at: ObjectId | null }): void => {
      const spec = animFor(pf.action);
      const here = { x: pos.x, z: pos.z };
      // Одинаковых предметов несколько (столики) — ближайший к герою.
      const placed = placedNow.filter((x) => x.id === pf.at).sort((a, b) => dist(a.use, here) - dist(b.use, here))[0];
      const base ={ key: pf.key, y: 0, cat: null, approach: null, inTo: null, sit: false, settle: null, props: spec?.prop };
      if (!spec) {
        act = { ...base, motion: 'stand:none', anchor: here, stand: here, free: here, face: facing };
        return;
      }
      if (spec.place === 'here') {
        // На месте; зовёт кошку — лицом к ближайшей.
        const c = spec.motion === 'crouch:call' ? nearestCat() : null;
        act = { ...base, motion: spec.motion, anchor: here, stand: here, free: here, face: c ? Math.atan2(c.pos.x - pos.x, c.pos.z - pos.z) : facing };
        return;
      }
      if (spec.place === 'cat') {
        const best = nearestCat();
        if (!best) {
          act = { ...base, motion: spec.motion, anchor: here, stand: here, free: here, face: facing };
          return;
        }
        // Кошка на мебели — спрыгивает к герою; дальше ждёт его на полу.
        const cp = catLife.claim(best, catWorld());
        const dx = pos.x - cp.x;
        const dz = pos.z - cp.z;
        const d = Math.hypot(dx, dz) || 1;
        const anchor = resolve({ x: cp.x + (dx / d) * 0.55, z: cp.z + (dz / d) * 0.55 }, bounds, boxes);
        act = { ...base, motion: spec.motion, anchor, stand: anchor, free: anchor, face: Math.atan2(cp.x - anchor.x, cp.z - anchor.z), cat: best.id, approach: anchor };
        return;
      }
      if (!placed) {
        act = { ...base, motion: spec.motion, anchor: here, stand: here, free: here, face: facing };
        return;
      }
      if (spec.place === 'front') {
        act = { ...base, motion: spec.motion, anchor: { ...placed.use }, stand: { ...placed.use }, free: { ...placed.use }, face: Math.atan2(placed.pos.x - placed.use.x, placed.pos.z - placed.use.z), approach: { ...placed.use } };
        return;
      }
      const [lx, lz] = spec.at ?? [0, 0];
      const c = Math.cos(placed.rot);
      const sn = Math.sin(placed.rot);
      const anchor = { x: placed.pos.x + lx * c + lz * sn, z: placed.pos.z - lx * sn + lz * c };
      const face = placed.rot + (spec.face ?? 0);
      const sit = spec.motion.startsWith('sit:');
      const lie = spec.motion.startsWith('lie:');
      // Сидя стопы впереди таза: встаёт перед местом так, чтобы сесть, не сдвигая стоп. Там
      // мебель (стол, ванна) — встаёт там, где окажется таз, и стопы при посадке уходят вперёд.
      let stand: P2 = anchor;
      if (sit && hero) {
        const o = seatOffsets(hero.rig);
        const at = (k: number): P2 => ({ x: anchor.x + Math.sin(face) * k, z: anchor.z + Math.cos(face) * k });
        stand = [at(o.feet), at(o.hips)].find((q) => !blocked(q, boxes, 0.12)) ?? anchor;
      }
      // Место на предмете (диван, кровать): шагом к свободной точке рядом, потом вплотную.
      const free = freeSpot(lie ? anchor : stand, placed.use, bounds, boxes);
      const far = dist(pos, stand) > dist(free, stand) + 0.1;
      act = { ...base, motion: spec.motion, anchor, stand, free, sit, y: spec.y ?? 0, face, approach: far ? free : null, inTo: lie || dist(far ? free : pos, stand) < 0.03 ? null : stand };
    };
    const angleTo = (from: number, to: number): number => {
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const smooth01 = (x: number): number => {
      const k = Math.max(0, Math.min(1, x));
      return k * k * (3 - 2 * k);
    };

    const updateVacuum = (t: number, dt: number): void => {
      if (!vacuum.visible) return;
      const step = 0.3 * dt;
      const next = resolve({ x: vac.pos.x + Math.sin(vac.heading) * step, z: vac.pos.z + Math.cos(vac.heading) * step }, bounds, boxes);
      const moved = Math.hypot(next.x - vac.pos.x, next.z - vac.pos.z);
      if (vac.turn > 0) {
        vac.heading += dt * 2.2;
        vac.turn -= dt;
      } else if (moved < step * 0.5 || dist(next, pos) < 0.5) vac.turn = 0.6 + catRand() * 1.2;
      else vac.pos = next;
      vacuum.position.set(vac.pos.x, 0, vac.pos.z);
      vacuum.rotation.y = vac.heading;
      const brush = vacuum.children[3];
      if (brush) brush.rotation.y = t * 12;
    };

    let raf = 0;
    let prev = performance.now();
    let speed = 0;
    let cycle = 0;
    let lean = 0;
    let walkBlend = 0;
    /** Обход мебели по пути к цели: промежуточная точка, для какой цели и сколько раз уже обходил. */
    let via: P2 | null = null;
    const detourFor: P2 = { x: Infinity, z: Infinity };
    let detours = 0;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!visible || document.visibilityState === 'hidden') return;
      const p = propsRef.current;
      const t = now / 1000;
      const ease = 1 - Math.exp(-dt * 10);
      // ── Действие у предмета: герой подходит, занимает место и играет анимацию ──
      const pf = p.perform;
      if (pf && (!act || act.key !== pf.key)) {
        exiting = null;
        startPerform(pf);
      }
      if (!pf && act) {
        // Действие кончилось: встаёт (сидя — обратной посадкой), предметы убирает и шагом
        // отходит от мебели. Не дошёл до места — просто идёт дальше.
        const seated = act.sit && Boolean(act.settle?.down);
        const placed = Boolean(act.settle);
        exiting = !placed ? null : {
          at: t,
          from: { x: pos.x, z: pos.z },
          fromY: heroY,
          motion: act.motion,
          sit: seated,
          rise: seated ? SIT * seatK : act.motion.startsWith('lie:') ? EXIT_LIE : EXIT_STAND,
          stand: seated ? act.stand : act.motion.startsWith('lie:') ? act.free : { x: pos.x, z: pos.z },
          to: act.free,
          out: false,
        };
        if (hero) showProps(hero.rig, null);
        act = null;
      }
      // Управление: стик и клавиши (во время действия — нет), иначе идёт к цели касания или подхода.
      let dx = 0;
      let dz = 0;
      if (!act && !exiting) {
        dx = p.stick.current.x;
        dz = -p.stick.current.y;
        if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) dz -= 1;
        if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) dz += 1;
        if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright') || keys.has('в')) dx += 1;
      }
      let mag = Math.min(1, Math.hypot(dx, dz));
      if (keys.size > 0 && !runKey) mag = Math.min(mag, STICK_WALK);
      // Стиком — шаг или (до упора) бег трусцой, сам (к цели касания, к предмету) сим идёт шагом.
      let pace = stickSpeed(mag);
      if (mag > 0.05) {
        // Игрок держит управление — сим не перехватывает.
        p.goto.current = null;
        p.onInput?.();
      }
      // Последние шаги к месту и от него — напрямую, мимо препятствий (место у самой мебели).
      const ghost = act ? !act.approach && act.inTo : exiting?.out ? exiting.to : null;
      const target = act ? (act.approach ?? act.inTo) : exiting ? (exiting.out ? exiting.to : null) : p.goto.current;
      // Новая цель — обходы мебели считаются заново.
      if (!target) via = null;
      else if (Math.hypot(target.x - detourFor.x, target.z - detourFor.z) > 0.5) {
        detourFor.x = target.x;
        detourFor.z = target.z;
        via = null;
        detours = 0;
      }
      const aim = via ?? target;
      if (mag <= 0.05 && aim) {
        const gx = aim.x - pos.x;
        const gz = aim.z - pos.z;
        const d = Math.hypot(gx, gz);
        if (d < (via ? 0.2 : ghost ? 0.02 : act ? 0.1 : 0.25)) {
          if (via) via = null;
          else if (act && act.approach) act.approach = null;
          else if (act) act.inTo = null;
          else if (exiting) exiting = null;
          else p.goto.current = null;
        } else {
          dx = gx / d;
          dz = gz / d;
          mag = Math.min(1, d / 1.2 + 0.15);
          pace = WALK_SPEED * mag;
        }
      }
      speed += ((mag > 0.05 ? pace : 0) - speed) * Math.min(1, dt * (mag > 0.05 ? 6 : 9));
      const before = facing;
      if (mag > 0.05) facing += angleTo(facing, Math.atan2(dx, dz)) * Math.min(1, dt * 9);
      seatK = 1;
      if (act && !act.approach && !act.inTo) {
        // Устраивается на месте: поворачивается и садится (стопы на месте), ложится или
        // встаёт к делу — плавно, не скользя.
        if (!act.settle) {
          const turn = Math.abs(angleTo(facing, act.face));
          act.settle = { at: t, from: { x: pos.x, z: pos.z }, fromY: heroY, fromFace: facing, turn: act.sit ? 0.2 + (0.4 * turn) / Math.PI : 0, down: !act.sit };
          if (hero) showProps(hero.rig, act.props, act.motion);
          if (!act.sit) p.onSettled?.(act.key);
        }
        const st = act.settle;
        if (act.sit) {
          // Сначала поворот спиной к месту, потом посадка: тело уходит назад на место ровно
          // настолько, насколько стопы в позе сидя впереди, — стопы стоят.
          facing = st.fromFace + angleTo(st.fromFace, act.face) * smooth01((t - st.at) / Math.max(0.01, st.turn));
          seatK = Math.max(0, Math.min(1, (t - st.at - st.turn) / SIT));
          if (seatK > 0 && !st.down) {
            st.down = true;
            p.onSettled?.(act.key);
          }
          const k = smooth01(seatK);
          pos.x = st.from.x + (act.anchor.x - st.from.x) * k;
          pos.z = st.from.z + (act.anchor.z - st.from.z) * k;
          heroY = st.fromY + (act.y - st.fromY) * k;
        } else {
          const k = smooth01((t - st.at) / SETTLE);
          pos.x = st.from.x + (act.anchor.x - st.from.x) * k;
          pos.z = st.from.z + (act.anchor.z - st.from.z) * k;
          heroY = st.fromY + (act.y - st.fromY) * smooth01((t - st.at - SETTLE * 0.25) / (SETTLE * 0.75));
          facing = st.fromFace + angleTo(st.fromFace, act.face) * smooth01((t - st.at) / (SETTLE * 0.6));
        }
        speed = 0;
      } else if (exiting && !exiting.out) {
        // Встаёт: сидя — посадка в обратную сторону (стопы на месте), из кровати — на край.
        const k = exiting.rise > 0 ? Math.min(1, (t - exiting.at) / exiting.rise) : 1;
        if (exiting.sit) seatK = (1 - k) * (exiting.rise / SIT);
        const e = exiting.sit ? 1 - smooth01(seatK) / Math.max(1e-3, smooth01(exiting.rise / SIT)) : smooth01(k);
        heroY = exiting.fromY * (1 - e);
        pos.x = exiting.from.x + (exiting.stand.x - exiting.from.x) * e;
        pos.z = exiting.from.z + (exiting.stand.z - exiting.from.z) * e;
        speed = 0;
        if (k >= 1) {
          heroY = 0;
          // Отходит от мебели шагом (если стоит у неё вплотную).
          if (dist(pos, exiting.to) > 0.03) exiting.out = true;
          else exiting = null;
        }
      } else if (ghost && speed > 0.01) {
        // Вплотную к месту и обратно — по прямой к точке.
        const gx = ghost.x - pos.x;
        const gz = ghost.z - pos.z;
        const d = Math.hypot(gx, gz);
        const step = Math.min(d, speed * dt);
        if (d > 1e-6) {
          pos.x += (gx / d) * step;
          pos.z += (gz / d) * step;
        }
      } else if (speed > 0.01) {
        const next = resolve({ x: pos.x + Math.sin(facing) * speed * dt, z: pos.z + Math.cos(facing) * speed * dt }, bounds, boxes);
        const moved = Math.hypot(next.x - pos.x, next.z - pos.z);
        // Упёрся в мебель — обходит её (несколько попыток), иначе дальше не идёт (цель касания сбрасывается).
        if (moved < speed * dt * 0.2) {
          const goal = act ? act.approach : p.goto.current;
          const alt = goal && detours < 6 ? detourPoint(pos, goal, bounds, boxes) : null;
          if (alt) {
            via = alt;
            detours += 1;
          } else if (act) {
            // Не пройти — устраивается отсюда; далеко от места — без шагов сквозь мебель.
            act.approach = null;
            if (dist(pos, act.stand) > 1.5) act.inTo = null;
          } else if (p.goto.current) p.goto.current = null;
        }
        speed = Math.min(speed, moved / Math.max(dt, 1e-3) + 0.3);
        pos.x = next.x;
        pos.z = next.z;
      }
      // Наклон в повороте на ходу.
      const turn = angleTo(before, facing) / Math.max(dt, 1e-3);
      lean += (Math.max(-0.14, Math.min(0.14, -turn * speed * 0.02)) - lean) * Math.min(1, dt * 6);
      heroRoot.position.set(pos.x, heroY, pos.z);
      heroRoot.rotation.set(0, facing, 0);
      shadow.position.set(pos.x, 0.02, pos.z);
      shadow.visible = heroY < 0.3;
      if (hero) {
        const posed = act && !act.approach && !act.inTo;
        const rising = exiting && !exiting.out;
        if (posed) animate(hero.rig, act!.motion, t, 0, 1 - Math.exp(-dt * (act!.sit ? 12 : 6)), act!.sit ? { settle: seatK } : undefined);
        else if (rising && exiting!.sit) animate(hero.rig, exiting!.motion, t, 0, 1 - Math.exp(-dt * 12), { settle: seatK });
        else if (speed > 0.06 && !rising) {
          // Шаг: фаза копится по частоте шагов для этой скорости — стопы не скользят.
          cycle = (cycle + dt * gaitFreq(hero.rig, speed, cycle)) % 1;
          // Переход в шаг: доля догоняния растёт плавно до 1 (без скачка позы в конце перехода).
          const kIn = 1 - Math.exp(-dt * 12);
          const wb = walkBlend * walkBlend * (3 - 2 * walkBlend);
          animate(hero.rig, 'walk', t, cycle, walkBlend < 1 ? kIn + (1 - kIn) * wb : 1, { speed, lean });
          walkBlend = Math.min(1, walkBlend + dt * 4);
        } else {
          animate(hero.rig, 'idle', t, 0, ease);
          walkBlend = 0;
        }
        tickProps(hero.rig, dt, t);
        // Мимика героя: сон, упражнение, развлечения (см. expressionFor).
        const [hx, hw] = expressionFor(posed ? act!.motion : null, (t * 0.5) % 1);
        hero.face.want(hx, hw);
        hero.face.update(dt);
        for (const f of hero.anim) f(t);
      }
      const nightNow = isNight(p.minute);
      for (const f of ticks) f(t, p.minute, nightNow);
      catLife.update(t, dt, catWorld());
      updateVacuum(t, dt);
      // Гости смотрят на ближайшую кошку (или на героя) и играют с кошками.
      const catPos = catSpotsNow();
      for (const e of crew.values()) {
        const set = crewSet(e, t);
        if (e.seat) {
          // За столиком: стопы впереди таза — корень сдвинут от стула к столику так, чтобы таз
          // пришёлся на сиденье; смотрит на столик.
          const k = e.parts ? -seatOffsets(e.parts.rig).hips : 0;
          const x = e.seat.pos.x + Math.sin(e.seat.face) * k;
          const z = e.seat.pos.z + Math.cos(e.seat.face) * k;
          e.root.position.set(x, 0, z);
          e.root.rotation.y = e.seat.face;
          e.shadow.position.set(e.seat.pos.x, 0.02, e.seat.pos.z);
        } else {
          e.root.position.set(e.spot.x, 0, e.spot.z);
          e.shadow.position.set(e.spot.x, 0.02, e.spot.z);
        }
        if (e.parts && e.motion !== set.motion) {
          e.motion = set.motion;
          showProps(e.parts.rig, TABLE_PROPS[set.motion] ?? null, set.motion);
        }
        // Гости с кошками поворачиваются к ближайшей кошке (или к герою рядом).
        if (!e.seat) {
          const near = Math.hypot(pos.x - e.spot.x, pos.z - e.spot.z) < 2;
          let look: P2 = pos;
          if (!near) {
            let best = Infinity;
            for (const c of catPos) {
              const d = Math.hypot(c.x - e.spot.x, c.z - e.spot.z);
              if (d < best) {
                best = d;
                look = c;
              }
            }
          }
          const want = Math.atan2(look.x - e.spot.x, look.z - e.spot.z);
          let diff = want - e.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          e.root.rotation.y += diff * Math.min(1, dt * 3);
        }
        if (e.parts) {
          animate(e.parts.rig, set.motion, t + e.seed * 3, set.phase, 1 - Math.exp(-dt * 7));
          breathe(e.parts.rig, t, e.seed * 2.3, set.motion === 'idle' ? 0.8 : 0.3);
          const [ex, ew] = expressionFor(set.motion, set.phase);
          e.parts.face.want(ex, ew);
          e.parts.face.update(dt);
          for (const f of e.parts.anim) f(t + e.seed);
          tickProps(e.parts.rig, dt, t);
        }
      }
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
      // Ближе — камера следует за героем плотнее, дальше — видна вся комната.
      const follow = 1 - 0.45 * Math.min(1, zoom);
      const want = new THREE.Vector3(pos.x * follow, 0.9 + (6.8 - 0.9) * zoom, pos.z + 6.4 * zoom);
      camPos.lerp(want, Math.min(1, dt * 5));
      camera.position.copy(camPos);
      const lookF = 1 - 0.2 * Math.min(1, zoom);
      camera.lookAt(pos.x * lookF, 0.6 + 0.5 * Math.max(0, 1 - zoom), pos.z - 1.2 * Math.min(1, zoom));
      const light = daylight(p.minute);
      hemi.intensity = 0.6 + light * 0.45;
      sun.intensity = 0.7 + light * 1.1;
      // Свет из окон слева; тени падают вправо и к зрителю.
      sun.position.set(pos.x - 7, 10, pos.z + 3);
      // Ближайший предмет или кошка (во время действия — без изменений).
      let near: ObjectId | null = lastNear ?? null;
      if (!act && !exiting) {
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
        p.catSpots.current = [...cats.values()].sort((a, b) => dist(pos, a.pos) - dist(pos, b.pos)).map((c) => ({ ...c.pos }));
      }
      // Миска и лоток показывают состояние: сколько корма и грязи.
      if (wheels.length) {
        wheelSpeed += ((catLife.inWheel() > 0 ? 3.2 : 0) - wheelSpeed) * Math.min(1, dt * 1.5);
        for (const w of wheels) w.rotation.z += wheelSpeed * dt;
      }
      if (cakes.length) {
        const f = p.food;
        const show = f ? Math.ceil((Math.max(0, f.n) / Math.max(1, f.max)) * cakes.length) : cakes.length;
        for (const c of cakes) c.visible = (c.userData.cake as number) < show;
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
  const sceneKey = JSON.stringify([props.scene, props.furniture, props.house, props.home, night, props.cats.length > 0, props.play]);
  const firstScene = useRef(sceneKey);
  useEffect(() => {
    if (sceneKey === firstScene.current) return;
    firstScene.current = sceneKey;
    api.current?.rebuildScene();
  }, [sceneKey]);

  const heroKey = lookKey(props.hero);
  const firstHero = useRef(heroKey);
  useEffect(() => {
    if (heroKey === firstHero.current) return;
    firstHero.current = heroKey;
    api.current?.rebuildHero();
  }, [heroKey]);

  const catsKey = JSON.stringify(props.cats.map((c) => [c.id, c.breed, c.mix, Math.round((c.grow ?? 1) * 10)]));
  useEffect(() => {
    api.current?.syncCats();
  }, [catsKey]);

  const clientsKey = JSON.stringify(props.guests.map((c) => [c.id, lookKey(c)]));
  useEffect(() => {
    api.current?.syncClients();
  }, [clientsKey]);

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
