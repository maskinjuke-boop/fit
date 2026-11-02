/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Версия MediaPipe нужна, чтобы запасной адрес WASM совпадал с версией библиотеки.
const mediapipeVersion = (() => {
  try {
    const require = createRequire(import.meta.url);
    const dir = dirname(require.resolve('@mediapipe/tasks-vision'));
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string };
    return pkg.version;
  } catch {
    return 'latest';
  }
})();

// Камера в браузере работает только по HTTPS (или на localhost).
// basicSsl выпускает самоподписанный сертификат, чтобы открыть dev-сервер
// с телефона в той же Wi-Fi сети: https://<IP-компьютера>:5173
export default defineConfig({
  plugins: [react(), basicSsl()],
  define: {
    __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion),
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  optimizeDeps: {
    // MediaPipe грузит свой WASM сам, пре-бандлинг ему не нужен.
    exclude: ['@mediapipe/tasks-vision'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Тесты 3D лепят тело и одежду из полей расстояний — на медленных CI-машинах это секунды.
    testTimeout: 60_000,
  },
});
