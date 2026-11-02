// Копирует WASM-файлы MediaPipe из node_modules в public/wasm,
// чтобы они раздавались с нашего сервера, а не с CDN Google (ТЗ, раздел 2).
// Запускается автоматически после `pnpm install`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'wasm');

let source;
try {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('@mediapipe/tasks-vision/package.json');
  source = join(dirname(pkgJson), 'wasm');
} catch {
  console.warn('[mediapipe] пакет @mediapipe/tasks-vision не найден — пропускаю копирование WASM');
  process.exit(0);
}

if (!existsSync(source)) {
  console.warn(`[mediapipe] нет папки ${source} — пропускаю копирование WASM`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`[mediapipe] WASM скопирован в ${target}`);
