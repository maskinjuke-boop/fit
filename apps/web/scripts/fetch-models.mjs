// Скачивает модели Pose Landmarker (Apache 2.0) в public/models.
// Один раз на машине разработчика: `pnpm models`.
// В продакшене файлы раздаются с нашего CDN вместе с остальной статикой.
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'models');

const BASE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';
const MODELS = [
  { file: 'pose_landmarker_lite.task', url: `${BASE}/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task` },
  { file: 'pose_landmarker_full.task', url: `${BASE}/pose_landmarker_full/float16/latest/pose_landmarker_full.task` },
];

mkdirSync(target, { recursive: true });

for (const { file, url } of MODELS) {
  const out = join(target, file);
  if (existsSync(out) && statSync(out).size > 0) {
    console.log(`[models] ${file} уже есть — пропускаю`);
    continue;
  }
  console.log(`[models] скачиваю ${file}…`);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.warn(`[models] нет сети для ${url}: ${e}`);
    continue;
  }
  if (!res.ok || !res.body) {
    // Сборку не роняем: приложение умеет загрузить модель напрямую из хранилища MediaPipe.
    console.warn(`[models] не удалось скачать ${url}: HTTP ${res.status}`);
    continue;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  console.log(`[models] ${file}: ${(statSync(out).size / 1024 / 1024).toFixed(1)} МБ`);
}
