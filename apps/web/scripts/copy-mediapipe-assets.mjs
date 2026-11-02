// Копирует WASM-файлы MediaPipe из node_modules в public/wasm,
// чтобы они раздавались с нашего сервера, а не с CDN Google (ТЗ, раздел 2).
// Запускается автоматически после `pnpm install`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'wasm');

// package.json пакета закрыт полем exports, поэтому ищем папку пакета от его точки входа.
let source;
try {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@mediapipe/tasks-vision');
  source = join(dirname(entry), 'wasm');
} catch (e) {
  console.error(`[mediapipe] пакет @mediapipe/tasks-vision не найден: ${e}`);
  process.exit(1);
}

if (!existsSync(source)) {
  console.error(`[mediapipe] нет папки ${source}`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`[mediapipe] WASM скопирован в ${target}`);
