/**
 * Прогон записанных последовательностей точек (tests/fixtures/*.json).
 * Файлы создаются кнопкой «Запись» на экране трекинга: после остановки
 * указывается реальное число повторов, и запись скачивается в этом формате.
 * Положите файл в tests/fixtures — он станет регрессионным тестом.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recordingToFrames, type Recording } from '../src/tools/recording';
import { getExercise } from '../src/tracking/exercises';
import { run } from './synthetic';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('Записанные последовательности', () => {
  it('папка с записями на месте', () => {
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  for (const file of files) {
    const rec = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Recording;
    if (rec.expectedReps === null) continue;
    it(`${file}: ${rec.expectedReps} повт.`, () => {
      const r = run(getExercise(rec.exercise), recordingToFrames(rec), rec.aspect);
      expect(r.count).toBe(rec.expectedReps);
    });
  }
});
