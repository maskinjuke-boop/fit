import * as THREE from 'three';

/**
 * Кэш вылепленных сеток в IndexedDB: тело и одежда строятся на устройстве один раз,
 * при следующих запусках загружаются за доли секунды. Ключ сетки включает «отпечаток»
 * поля расстояний (см. anatomy), поэтому после изменения анатомии сетки строятся заново,
 * а устаревшие записи удаляются. Без IndexedDB (приватный режим, тесты) всё работает
 * как раньше — просто без кэша.
 */

const DB_NAME = 'fit-meshes';
const STORE = 'geometry';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

interface Stored {
  position: Float32Array;
  /** Нормали — 16-битные (без потери качества освещения, вдвое компактнее). */
  normal: Int16Array;
  uv: Float32Array;
  color?: Uint8Array;
  index: Uint16Array | Uint32Array;
}

function toStored(g: THREE.BufferGeometry): Stored {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const col = g.getAttribute('color');
  const n = new Int16Array(nor.count * 3);
  for (let i = 0; i < n.length; i += 1) n[i] = Math.round(Math.max(-1, Math.min(1, (nor.array as Float32Array)[i]!)) * 32767);
  const out: Stored = {
    position: Float32Array.from(pos.array as Float32Array),
    normal: n,
    uv: Float32Array.from(uv.array as Float32Array),
    index: pos.count < 65536 ? Uint16Array.from(g.index!.array) : Uint32Array.from(g.index!.array),
  };
  if (col) {
    const c = new Uint8Array(col.count * 3);
    for (let i = 0; i < c.length; i += 1) c[i] = Math.round(Math.max(0, Math.min(1, (col.array as Float32Array)[i]!)) * 255);
    out.color = c;
  }
  return out;
}

function fromStored(s: Stored): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(s.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(s.normal, 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(s.uv, 2));
  if (s.color) g.setAttribute('color', new THREE.BufferAttribute(s.color, 3, true));
  g.setIndex(new THREE.BufferAttribute(s.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** Сетка из кэша устройства или null. */
export async function loadMesh(key: string): Promise<THREE.BufferGeometry | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<THREE.BufferGeometry | null>((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const s = req.result as Stored | undefined;
        try {
          resolve(s && s.position && s.normal && s.index ? fromStored(s) : null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Сохраняет сетку под ключом и удаляет прежние версии той же сетки (тот же prefix). */
export function saveMesh(key: string, prefix: string, g: THREE.BufferGeometry): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      store.put(toStored(g), key);
      const req = store.openKeyCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        const k = String(cur.key);
        if (k !== key && k.startsWith(prefix)) store.delete(cur.key);
        cur.continue();
      };
    } catch {
      // Нет места или база недоступна — сетка просто будет построена снова.
    }
  });
}
