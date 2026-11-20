import { rng } from '../random';
import {
  CAT_ITEMS,
  CAT_NAMES,
  COATS,
  DAY_MIN,
  FUND_SHARE,
  HOUSE_LEVELS,
  MAP,
  MEAL,
  NEED_RATES,
  PROFESSIONS,
  TILE,
  TOWNS,
  WORKSHOP_LEVELS,
  buildingById,
  itemDef,
  professionById,
} from './content';
import { frontOf, roadPath, spotWorld, spotsOf } from './spots';
import type { Activity, ActivityKind, Building, CityCat, CityState, Coat, ItemId, Profession, Txt } from './types';

/**
 * Жизнь кошек без участия игрока. Время — игровые минуты (1 реальная секунда = 1 минута).
 * Распорядок: ночью спят дома, утром едят, с 8 до 17 работают в мастерской по профессии
 * (заработок зависит от настроения и уровня мастерской, часть — в копилку мастерской),
 * вечером отдыхают: развлечения, прогулки по скверам, рынок, улучшение своего дома.
 * Настроение — от потребностей, уюта дома, благоустройства рядом, вещей, работы.
 */

/** Скорость шага (м за игровую минуту). */
export const WALK = 1.3;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const hourOf = (clock: number): number => (((clock % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60;
export const dayOf = (clock: number): number => Math.floor(clock / DAY_MIN);

export const buildingAt = (c: CityState, id: number | null): Building | undefined => (id === null ? undefined : c.buildings.find((b) => b.id === id));

/** Ступень поселения по числу жителей (не ниже достигнутой). */
export function townLevel(c: CityState): number {
  let lv = 0;
  TOWNS.forEach((t, i) => {
    if (c.cats.length >= t.pop) lv = i;
  });
  return Math.max(lv, c.town);
}

/** Сколько кошек может жить в доме. */
export const houseCapacity = (b: Building): number => HOUSE_LEVELS[Math.min(HOUSE_LEVELS.length, b.level) - 1]!.capacity;
export const residents = (c: CityState, b: Building): CityCat[] => c.cats.filter((k) => k.home === b.id);
export const workers = (c: CityState, b: Building): CityCat[] => c.cats.filter((k) => k.work === b.id);
export const jobsOf = (b: Building): number => buildingById(b.type).jobs?.[b.level - 1] ?? 0;

/** Свободные места в домах. */
export function freeBeds(c: CityState): number {
  return c.buildings.filter((b) => b.kind === 'house').reduce((n, b) => n + Math.max(0, houseCapacity(b) - residents(c, b).length), 0);
}

/** Прибавка к настроению от благоустройства рядом с клеткой (не больше 20). */
export function amenityBonus(c: CityState, gx: number, gz: number): number {
  let sum = 0;
  for (const b of c.buildings) {
    const d = buildingById(b.type);
    if (!d.mood || !d.radius) continue;
    if (Math.max(Math.abs(b.gx - gx), Math.abs(b.gz - gz)) <= d.radius) sum += d.mood;
  }
  return Math.min(20, sum);
}

/** Подношение на сегодня сделано — боги благословляют. */
export const blessed = (c: CityState): boolean => !!c.offering?.complete;

/** Из чего складывается настроение (для сводки). */
export function moodParts(c: CityState, k: CityCat): Array<{ icon: string; v: number; key: string }> {
  const n = k.needs;
  const home = buildingAt(c, k.home);
  const work = buildingAt(c, k.work);
  const parts = [
    { icon: '🍗', key: 'food', v: Math.round((n.food - 50) * 0.3) },
    { icon: '💤', key: 'energy', v: Math.round((n.energy - 50) * 0.25) },
    { icon: '🎈', key: 'fun', v: Math.round((n.fun - 50) * 0.25) },
    { icon: '💬', key: 'social', v: Math.round((n.social - 50) * 0.2) },
    { icon: '🏠', key: 'home', v: home ? HOUSE_LEVELS[home.level - 1]!.comfort : -15 },
    { icon: '🌳', key: 'nature', v: Math.max(home ? amenityBonus(c, home.gx, home.gz) : 0, work ? Math.round(amenityBonus(c, work.gx, work.gz) / 2) : 0) },
    { icon: '🎀', key: 'items', v: Math.min(15, k.items.reduce((a, i) => a + itemDef(i).mood, 0)) },
    { icon: '🔨', key: 'job', v: k.work !== null ? 4 : -12 },
  ];
  if (blessed(c)) parts.push({ icon: '✨', key: 'blessed', v: 8 });
  if (k.sadUntil && k.sadUntil > c.clock) parts.push({ icon: '😢', key: 'sad', v: -20 });
  return parts.filter((p) => p.v !== 0);
}
const moodTarget = (c: CityState, k: CityCat): number => clamp(50 + moodParts(c, k).reduce((a, p) => a + p.v, 0), 0, 100);

/** Выработка кошки: настроение (0.5…1.5) × уровень мастерской. */
export function productivity(c: CityState, k: CityCat): number {
  const w = buildingAt(c, k.work);
  return (0.5 + k.mood / 100) * (w ? WORKSHOP_LEVELS[w.level - 1]!.output : 1);
}

// ─── Новости ───────────────────────────────────────────────────────────

const NEWS_MAX = 40;
export function news(c: CityState, kind: CityState['news'][number]['kind'], icon: string, text: Txt): void {
  c.news = [...c.news, { t: c.clock, kind, icon, text }].slice(-NEWS_MAX);
}
export const catName = (k: Pick<CityCat, 'name'>): Txt => CAT_NAMES[k.name % CAT_NAMES.length]!;

// ─── Кошки: приезд и работа ────────────────────────────────────────────

/** Свободные места по профессиям в построенных мастерских. */
export function vacancies(c: CityState): Map<Profession, number> {
  const out = new Map<Profession, number>();
  for (const b of c.buildings) {
    const p = buildingById(b.type).profession;
    if (b.kind !== 'workshop' || !p) continue;
    out.set(p, (out.get(p) ?? 0) + Math.max(0, jobsOf(b) - workers(c, b).length));
  }
  return out;
}

/** Взять на работу в свою мастерскую, если там есть место. */
export function hire(c: CityState, k: CityCat): boolean {
  if (k.work !== null) return false;
  const def = professionById(k.profession);
  const shop = c.buildings.find((b) => b.type === def.workshop && workers(c, b).length < jobsOf(b));
  if (!shop) return false;
  k.work = shop.id;
  news(c, 'hired', def.icon, { ru: `${catName(k).ru} — ${def.name.ru.toLowerCase()} в «${buildingById(shop.type).name.ru}»`, en: `${catName(k).en} works as a ${def.name.en.toLowerCase()} at the ${buildingById(shop.type).name.en}` });
  return true;
}

/** Въезд: в пустом доме появляется кошка (идёт от края карты). Профессия — где больше вакансий. */
export function spawnCat(c: CityState, r: () => number = Math.random): CityCat | null {
  const house = c.buildings.find((b) => b.kind === 'house' && residents(c, b).length < houseCapacity(b));
  if (!house) return null;
  const vac = [...vacancies(c).entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const profession: Profession = vac.length && r() < 0.85 ? vac[0]![0] : PROFESSIONS[Math.floor(r() * PROFESSIONS.length)]!.id;
  const used = new Set(c.cats.map((k) => k.name));
  const free = CAT_NAMES.map((_, i) => i).filter((i) => !used.has(i));
  const name = free.length ? free[Math.floor(r() * free.length)]! : Math.floor(r() * CAT_NAMES.length) + CAT_NAMES.length * (1 + Math.floor(r() * 3));
  const coat: Coat = COATS[Math.floor(r() * COATS.length)]!.id;
  const ageDays = 20 + Math.floor(r() * 150);
  // Приходит по дороге с южного края карты.
  const edgeZ = (MAP + 0.5) * TILE;
  const edgeX = (Math.round(house.gx) + 0.5) * TILE;
  const k: CityCat = {
    id: c.nextId++,
    name,
    coat,
    sex: r() < 0.5 ? 'f' : 'm',
    born: c.clock - ageDays * DAY_MIN,
    profession,
    home: house.id,
    work: null,
    money: 10 + Math.floor(r() * 20),
    earned: 0,
    mood: 60,
    needs: { food: 70, energy: 80, fun: 60, social: 50 },
    items: [],
    x: edgeX,
    z: edgeZ,
    heading: Math.PI,
    act: { kind: 'arrive', at: null, until: c.clock },
  };
  c.cats.push(k);
  hire(c, k);
  goTo(c, k, house, 'arrive', 20, 'porch');
  c.stats.arrived += 1;
  news(c, 'arrive', '🧳', { ru: `${catName(k).ru} переехала в новый дом`, en: `${catName(k).en} moved into a new house` });
  return k;
}

// ─── Занятия ───────────────────────────────────────────────────────────

/** Свободное место в здании (не занятое другими кошками). */
function freeSpot(c: CityState, k: CityCat, b: Building, use: Activity['use']): number | null {
  const spots = spotsOf(b, use);
  const taken = new Set(c.cats.filter((o) => o !== k && o.act.at === b.id && o.act.use === use).map((o) => o.act.spot));
  for (let i = 0; i < spots.length; i += 1) if (!taken.has(i) || spots[i]!.pose === 'hidden') return i;
  return null;
}

/** Отправить кошку к зданию на занятие длительностью dur (минут после прихода). */
export function goTo(c: CityState, k: CityCat, b: Building, kind: ActivityKind, dur: number, use: Activity['use'] = 'visit'): boolean {
  let spot: number;
  if (kind === 'work') {
    spot = workers(c, b).indexOf(k);
    if (spot < 0) spot = 0;
  } else {
    const f = freeSpot(c, k, b, use);
    if (f === null) return false;
    spot = f;
  }
  const sp = spotsOf(b, use)[spot % spotsOf(b, use).length]!;
  const to = spotWorld(b, sp);
  const already = k.act.at === b.id && Math.hypot(k.x - to[0], k.z - to[1]) < 0.05;
  k.act = { kind, at: b.id, until: c.clock + dur, spot, use, dur };
  if (!already) {
    const path = roadPath([k.x, k.z], frontOf(b));
    path.push(to);
    k.act.path = path;
  }
  return true;
}

/** Погулять: к точке на дорожке. */
function strollTo(c: CityState, k: CityCat, to: [number, number], dur: number): void {
  k.act = { kind: 'stroll', at: null, until: c.clock + dur, dur, path: roadPath([k.x, k.z], to) };
}

/** Следующее занятие по распорядку и потребностям. */
export function decide(c: CityState, k: CityCat): void {
  const r = rng(`${k.id}:${Math.floor(c.clock)}`);
  const h = hourOf(c.clock);
  const home = buildingAt(c, k.home);
  const work = buildingAt(c, k.work);
  const n = k.needs;
  // Ночь: спать до утра.
  if (home && (h >= 22 || h < 6.5 || n.energy < 12)) {
    const wake = 6.5 + r() * 0.8;
    const left = h >= 22 ? 24 - h + wake : h < wake ? wake - h : 3;
    goTo(c, k, home, 'sleep', Math.max(30, left * 60), 'inside');
    return;
  }
  // Голодная — поесть: в кафе (если по карману и есть место) или дома.
  if (n.food < 40) {
    const cafe = nearestOf(c, k, (b) => b.type === 'cafe' && k.money >= (buildingById('cafe').ticket ?? 0) + 5);
    if (cafe && r() < 0.6 && goTo(c, k, cafe, 'eat', 40)) return;
    if (home) {
      goTo(c, k, home, 'eat', 20, 'inside');
      return;
    }
  }
  // Работа с 8 до 17.
  if (h >= 8 && h < 17) {
    if (k.work === null) hire(c, k);
    const w = buildingAt(c, k.work);
    if (w) {
      goTo(c, k, w, 'work', Math.max(15, (17 - h) * 60));
      return;
    }
    // Без работы — ходит к храму помолиться о работе.
    const temple = c.buildings.find((b) => b.kind === 'temple');
    if (temple && r() < 0.6 && goTo(c, k, temple, 'jobhunt', 60)) return;
  }
  void work;
  // Вечер: улучшить дом, купить вещь, развлечься, погулять, отдохнуть на крыльце.
  if (home && home.level < HOUSE_LEVELS.length && k.money >= HOUSE_LEVELS[home.level - 1]!.upgrade && h < 20.5) {
    if (goTo(c, k, home, 'upgrade', 90, 'hammer')) return;
  }
  const market = nearestOf(c, k, (b) => b.type === 'market');
  if (market && affordableItem(k) && r() < 0.4 && goTo(c, k, market, 'shop', 35)) return;
  const options: Array<[number, () => boolean]> = [];
  for (const b of c.buildings) {
    const d = buildingById(b.type);
    if (b.kind === 'fun' && b.type !== 'market') {
      if (k.money < (d.ticket ?? 0)) continue;
      const busy = c.cats.filter((o) => o.act.at === b.id).length;
      if (busy >= (d.capacity ?? 4)) continue;
      const w = ((100 - n.fun) / 25) * ((d.fun ?? 0) / 30) + ((100 - n.social) / 50) * ((d.social ?? 0) / 20);
      options.push([w + 0.2, () => goTo(c, k, b, 'fun', 50 + r() * 40)]);
    } else if (b.kind === 'amenity' && d.social) {
      options.push([((100 - n.social) / 40) * (d.social / 15) + 0.3, () => goTo(c, k, b, 'stroll', 40 + r() * 40)]);
    } else if (b.kind === 'amenity') {
      options.push([0.35, () => goTo(c, k, b, 'stroll', 25 + r() * 20)]);
    }
  }
  if (home) options.push([0.9 + (100 - n.energy) / 60, () => goTo(c, k, home, 'relax', 40 + r() * 40, 'porch')]);
  const temple = c.buildings.find((b) => b.kind === 'temple');
  if (temple) options.push([0.25, () => goTo(c, k, temple, 'pray', 30)]);
  // Выбор с весами (если место занято — следующее).
  for (let tries = 0; tries < 4 && options.length; tries += 1) {
    const total = options.reduce((a, [w]) => a + w, 0);
    let x = r() * total;
    const i = options.findIndex(([w]) => (x -= w) <= 0);
    const [, run] = options.splice(i < 0 ? options.length - 1 : i, 1)[0]!;
    if (run()) return;
  }
  // Ничего не нашлось — прогулка по дорожке.
  const gx = Math.round((r() - 0.5) * 4);
  const gz = Math.round((r() - 0.5) * 4);
  strollTo(c, k, [(gx + 0.5) * TILE, (gz + 0.5) * TILE], 20);
}

function nearestOf(c: CityState, k: CityCat, f: (b: Building) => boolean): Building | undefined {
  let best: Building | undefined;
  let bd = Infinity;
  for (const b of c.buildings) {
    if (!f(b)) continue;
    const d = Math.abs(b.gx * TILE - k.x) + Math.abs(b.gz * TILE - k.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Вещь, которую кошка может купить с запасом на еду. */
export function affordableItem(k: CityCat): ItemId | null {
  const can = CAT_ITEMS.filter((i) => !k.items.includes(i.id) && k.money >= i.price + 20);
  return can.length ? can[can.length - 1]!.id : null;
}

/** Занятие закончилось: итог (поела, улучшила дом, купила вещь). */
function finish(c: CityState, k: CityCat): void {
  const a = k.act;
  const b = buildingAt(c, a.at);
  if (a.kind === 'eat') {
    const cafe = b?.type === 'cafe';
    const price = cafe ? (buildingById('cafe').ticket ?? 0) : MEAL.price;
    if (k.money >= price) {
      k.money -= price;
      k.needs.food = clamp(k.needs.food + (cafe ? (buildingById('cafe').food ?? MEAL.food) : MEAL.food), 0, 100);
    } else k.needs.food = clamp(k.needs.food + 30, 0, 100);
  }
  if (a.kind === 'upgrade' && b && b.kind === 'house' && b.level < HOUSE_LEVELS.length) {
    const cost = HOUSE_LEVELS[b.level - 1]!.upgrade;
    if (k.money >= cost) {
      k.money -= cost;
      b.level += 1;
      b.visits += 1;
      news(c, 'upgradeHome', '🏡', { ru: `${catName(k).ru} улучшила дом: «${HOUSE_LEVELS[b.level - 1]!.name.ru}»`, en: `${catName(k).en} upgraded the home: ${HOUSE_LEVELS[b.level - 1]!.name.en}` });
    }
  }
  if (a.kind === 'shop') {
    const id = affordableItem(k);
    if (id) {
      const it = itemDef(id);
      k.money -= it.price;
      k.items = [...k.items, id];
      news(c, 'buy', it.icon, { ru: `${catName(k).ru} купила: ${it.name.ru.toLowerCase()}`, en: `${catName(k).en} bought: ${it.name.en.toLowerCase()}` });
    }
  }
  if (a.kind === 'fun' && b) {
    const tk = buildingById(b.type).ticket ?? 0;
    k.money = Math.max(0, k.money - tk);
    b.visits += 1;
  }
}

// ─── Шаг симуляции ─────────────────────────────────────────────────────

/** Потребности за dt минут занятия. */
function needsStep(c: CityState, k: CityCat, dt: number, walking: boolean): void {
  const n = k.needs;
  const hr = dt / 60;
  const a = k.act;
  const b = buildingAt(c, a.at);
  const d = b ? buildingById(b.type) : undefined;
  const here = !walking;
  if (a.kind === 'sleep' && here) {
    n.energy += NEED_RATES.sleepEnergy * hr;
    n.food -= NEED_RATES.sleepFood * hr;
    n.fun -= 0.5 * hr;
    n.social -= 0.5 * hr;
  } else {
    n.food -= NEED_RATES.food * hr;
    n.energy -= NEED_RATES.energy * hr * (a.kind === 'work' && here ? 1.2 : 1);
    n.fun -= NEED_RATES.fun * hr * (a.kind === 'work' && here ? 1.3 : 1);
    n.social -= NEED_RATES.social * hr;
    if (here && (a.kind === 'fun' || a.kind === 'stroll' || a.kind === 'eat') && d) {
      n.fun += (d.fun ?? 6) * hr;
      n.social += (d.social ?? 4) * hr;
    }
    if (here && a.kind === 'relax') {
      n.energy += 6 * hr;
      n.fun += 6 * hr;
    }
    if (here && (a.kind === 'pray' || a.kind === 'jobhunt')) n.social += 6 * hr;
    if (here && a.kind === 'work' && b && workers(c, b).length > 1) n.social += 5 * hr;
    if (here && a.kind === 'shop') n.fun += 10 * hr;
  }
  n.food = clamp(n.food, 0, 100);
  n.energy = clamp(n.energy, 0, 100);
  n.fun = clamp(n.fun, 0, 100);
  n.social = clamp(n.social, 0, 100);
}

/** Шаг кошки: идёт по пути или занимается делом. */
function catStep(c: CityState, k: CityCat, dt: number): void {
  const a = k.act;
  let left = dt;
  // Путь: идёт по точкам, занятие начнётся по приходу.
  if (a.path && a.path.length) {
    let move = WALK * left;
    while (a.path.length && move > 0) {
      const [tx, tz] = a.path[0]!;
      const dx = tx - k.x;
      const dz = tz - k.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) k.heading = Math.atan2(dx, dz);
      if (d <= move) {
        k.x = tx;
        k.z = tz;
        move -= d;
        a.path.shift();
      } else {
        k.x += (dx / d) * move;
        k.z += (dz / d) * move;
        move = 0;
      }
    }
    const used = dt - move / WALK;
    needsStep(c, k, used, true);
    left = move / WALK;
    if (a.path.length) return;
    delete a.path;
    // Пришла: занятие начинается сейчас.
    a.until = c.clock - left + (a.dur ?? 0);
    const b = buildingAt(c, a.at);
    if (b && a.spot !== undefined) {
      const sp = spotsOf(b, a.use)[a.spot % spotsOf(b, a.use).length]!;
      k.heading = sp.h;
    }
  }
  if (left <= 0) return;
  needsStep(c, k, left, false);
  if (a.kind === 'work') {
    const w = buildingAt(c, a.at);
    if (w) {
      const pay = (professionById(k.profession).wage / 60) * productivity(c, k) * left;
      const fund = pay * FUND_SHARE;
      k.money += pay - fund;
      k.earned += pay - fund;
      w.fund += fund;
      const lv = WORKSHOP_LEVELS[w.level - 1]!;
      if (w.level < WORKSHOP_LEVELS.length && w.fund >= lv.upgrade) {
        w.fund -= lv.upgrade;
        w.level += 1;
        w.visits += 1;
        news(c, 'upgradeWork', '⚒️', { ru: `«${buildingById(w.type).name.ru}» выросла: ${WORKSHOP_LEVELS[w.level - 1]!.name.ru.toLowerCase()}`, en: `The ${buildingById(w.type).name.en} grew into a ${WORKSHOP_LEVELS[w.level - 1]!.name.en.toLowerCase()}` });
      }
    }
  }
  if (c.clock >= a.until) {
    finish(c, k);
    decide(c, k);
  }
}

/**
 * Шаг мира на dt игровых минут: кошки живут, настроение подтягивается к цели, приезжают
 * новые кошки в пустые дома. Большие промежутки (игра была закрыта) — кусками.
 */
export function stepCity(c: CityState, dt: number): void {
  let left = Math.max(0, dt);
  while (left > 0) {
    const step = Math.min(left, 2);
    left -= step;
    c.clock += step;
    for (const k of c.cats) {
      catStep(c, k, step);
      k.mood += (moodTarget(c, k) - k.mood) * Math.min(1, step / 90);
    }
    // Новые жители.
    if (freeBeds(c) > 0) {
      if (c.arriveAt === null) c.arriveAt = c.clock + 15 + (c.cats.length % 4) * 10;
      else if (c.clock >= c.arriveAt) {
        spawnCat(c, rng(`spawn:${c.nextId}:${Math.floor(c.clock)}`));
        c.arriveAt = freeBeds(c) > 0 ? c.clock + 25 : null;
      }
    } else c.arriveAt = null;
    const lv = townLevel(c);
    if (lv > c.town) {
      c.town = lv;
      news(c, 'town', TOWNS[lv]!.icon, { ru: `Поселение выросло: теперь это ${TOWNS[lv]!.name.ru.toLowerCase()}!`, en: `The settlement grew into a ${TOWNS[lv]!.name.en.toLowerCase()}!` });
    }
  }
}

/** Возраст кошки в игровых днях. */
export const catAgeDays = (c: CityState, k: CityCat): number => Math.max(0, Math.floor((c.clock - k.born) / DAY_MIN));

/** Чем кошка занята — коротко для сводки. */
export function doingText(c: CityState, k: CityCat): Txt {
  const a = k.act;
  const b = buildingAt(c, a.at);
  const place = b ? buildingById(b.type).name : null;
  if (a.path && a.path.length) {
    const where: Record<ActivityKind, Txt> = {
      arrive: { ru: 'идёт в свой новый дом', en: 'is walking to her new home' },
      sleep: { ru: 'идёт домой спать', en: 'is going home to sleep' },
      eat: { ru: b?.type === 'cafe' ? 'идёт обедать в кафе' : 'идёт домой поесть', en: b?.type === 'cafe' ? 'is going to the café for lunch' : 'is going home to eat' },
      work: { ru: 'идёт на работу', en: 'is going to work' },
      fun: { ru: `идёт развлечься: ${place?.ru.toLowerCase() ?? ''}`, en: `is heading to have fun: ${place?.en.toLowerCase() ?? ''}` },
      shop: { ru: 'идёт на рынок', en: 'is going to the market' },
      stroll: { ru: 'гуляет', en: 'is out for a walk' },
      relax: { ru: 'идёт домой отдохнуть', en: 'is going home to rest' },
      upgrade: { ru: 'идёт улучшать дом', en: 'is going to upgrade the house' },
      jobhunt: { ru: 'идёт к храму просить работу', en: 'is going to the temple to pray for a job' },
      pray: { ru: 'идёт в храм', en: 'is going to the temple' },
    };
    return where[a.kind];
  }
  const p = professionById(k.profession);
  const at: Record<ActivityKind, Txt> = {
    arrive: { ru: 'осматривает новый дом', en: 'is looking around the new home' },
    sleep: { ru: 'спит дома', en: 'is sleeping at home' },
    eat: { ru: b?.type === 'cafe' ? 'обедает в кафе' : 'ест дома', en: b?.type === 'cafe' ? 'is having lunch at the café' : 'is eating at home' },
    work: p.doing,
    fun: { ru: `развлекается: ${place?.ru.toLowerCase() ?? ''}`, en: `is having fun: ${place?.en.toLowerCase() ?? ''}` },
    shop: { ru: 'выбирает обновку на рынке', en: 'is shopping at the market' },
    stroll: { ru: place ? `гуляет: ${place.ru.toLowerCase()}` : 'гуляет', en: place ? `is strolling: ${place.en.toLowerCase()}` : 'is out for a walk' },
    relax: { ru: 'отдыхает на крыльце', en: 'is resting on the porch' },
    upgrade: { ru: 'стучит молотком — улучшает дом', en: 'is hammering away — upgrading the house' },
    jobhunt: { ru: 'молится о работе — нет мастерской по профессии', en: 'prays for a job — no workshop for her trade' },
    pray: { ru: 'молится в храме', en: 'is praying at the temple' },
  };
  return at[a.kind];
}
