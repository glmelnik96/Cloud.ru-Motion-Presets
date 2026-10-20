// TTL_PlateSwap «Текст на плашке: смена фразы»: TTL_Plate's plates with a second phrase. Its expressions run in
// Node on a stand-in comp (tests/helpers/master-expr.mjs), which hangs the words of a text under it when its
// selector holds them all, as AE's sourceRectAtTime does. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';
import { packInk, plateOf } from '../helpers/plate-ink.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/tekst_na_plashke_1.json') && existsSync('C:/CRBK/work/dumps/smm/plashki_9x16.json');
const metrics = JSON.parse(readFileSync(path.join(REPO, 'masters/TTL_Plate/source-metrics.json'), 'utf8'));
// the 9x16 pack: phrase 1, then phrase 2
const PHRASES = { TXT_1: 'Разверните свой сервис', TXT_2: 'видеоконференций', TXT_3: '', TXT2_1: 'На виртуальной машине', TXT2_2: 'Cloud.ru Evolution', TXT2_3: '' };

describe.skipIf(!HAS_DUMPS)('TTL_PlateSwap', async () => {
  const { resolve } = await import('../../masters/TTL_PlateSwap/resolve.mjs');
  const p = resolve();
  const plate = (await import('../../masters/TTL_Plate/resolve.mjs')).resolve();
  const comp = (spec, opts) => exprComp(spec, { ink: packInk(metrics), ...opts });

  it('a master of its own: phrase 1, the change and phrase 2 in the protected intro', () => {
    expect(p.spec.egpNames).toEqual(['Фраза 1: строка 1', 'Фраза 1: строка 2', 'Фраза 1: строка 3', 'Фраза 2: строка 1', 'Фраза 2: строка 2', 'Фраза 2: строка 3',
      'Стиль', 'Позиция', 'Скорость', 'Размер текста']);
    expect(p.timing.change).toMatchObject({ start: 4, gap: 0.8, resize: { frames: 20 } });
    expect([p.timing.introEnd, p.timing.outroStart]).toEqual([6.4, 9.8]);
    expect(p.duration).toEqual({ introSec: 8.56, holdSec: 0.48, outroSec: 2.96 });
    expect(p.spec.comp).toMatchObject({ name: 'CR_TTL_PlateSwap', duration: 12 });
  });

  it('SMM 9x16: the plates of phrase 1 change to the widths of phrase 2, the pack\'s texts swap', () => {
    const c = comp(p.spec, { w: 1080, h: 1920, ctrl: { Style: 2, Position: 1 }, texts: PHRASES });
    const one = comp(plate.spec, { w: 1080, h: 1920, ctrl: { Style: 2, Position: 1 }, texts: { TXT_1: PHRASES.TXT_1, TXT_2: PHRASES.TXT_2, TXT_3: '' } });
    const two = comp(plate.spec, { w: 1080, h: 1920, ctrl: { Style: 2, Position: 1 }, texts: { TXT_1: PHRASES.TXT2_1, TXT_2: PHRASES.TXT2_2, TXT_3: '' } });
    for (const n of ['PL_SMM_1', 'PL_SMM_2']) {
      // phrase 1 at rest as in TTL_Plate; phrase 2 at rest as TTL_Plate with its lines
      expect(plateOf(c, n, 3).w).toBeCloseTo(plateOf(one, n, 3).w, 6);
      expect(plateOf(c, n, 8.8).w).toBeCloseTo(plateOf(two, n, 3).w, 6);
      expect(plateOf(c, n, 8.8).y0).toBeCloseTo(plateOf(two, n, 3).y0, 6);
    }
    const end = (n, t) => c.at(n, ['selector', 'Rise', 'ADBE Text Percent End'], t);
    const start = (n, t) => c.at(n, ['selector', 'Rise', 'ADBE Text Percent Start'], t);
    expect([end('SMM_1', 3), end('SMM_1', 8.8), start('SMM2_1', 3), start('SMM2_1', 8.8)]).toEqual([100, 0, 0, 100]);
    // bottom line first: at 4.2 s its phrase 1 is leaving, the top line's waits until 4.4 s
    expect(end('SMM_2', 4.2)).toBeLessThan(100);
    expect(end('SMM_1', 4.2)).toBe(100);
    // the bottom plate resizes from 4.8 s, the top one from 5.2 s
    expect(plateOf(c, 'PL_SMM_2', 4.8).w).toBeCloseTo(plateOf(one, 'PL_SMM_2', 3).w, 6);
    expect(plateOf(c, 'PL_SMM_1', 5.2).w).toBeCloseTo(plateOf(one, 'PL_SMM_1', 3).w, 6);
    expect(Math.abs(plateOf(c, 'PL_SMM_2', 5.4).w - plateOf(one, 'PL_SMM_2', 3).w)).toBeGreaterThan(1);
    expect(c.at('SMM2_1', ['text'], 3)).toBe(PHRASES.TXT2_1);
  });

  it('no phrase 2: nothing changes, phrase 1 stays until the exit', () => {
    const c = comp(p.spec, { ctrl: { Style: 2, Position: 1 }, texts: { TXT_1: PHRASES.TXT_1, TXT_2: PHRASES.TXT_2, TXT2_1: '', TXT2_2: '', TXT2_3: '' } });
    expect(plateOf(c, 'PL_SMM_1', 8.8).w).toBeCloseTo(plateOf(c, 'PL_SMM_1', 3).w, 6);
    expect(c.at('SMM_1', ['selector', 'Rise', 'ADBE Text Percent End'], 8.8)).toBe(100);
    expect(c.at('SMM_1', ['selector', 'Rise', 'ADBE Text Percent End'], 11.96)).toBe(0);
  });

  it('lines of either phrase keep their places: one line, then two', () => {
    const c = comp(p.spec, { ctrl: { Style: 1, Position: 1 }, texts: { TXT_1: '', TXT_2: 'Одна строка', TXT_3: '', TXT2_1: 'Первая из двух', TXT2_2: 'вторая из двух', TXT2_3: '' } });
    // line 1 has phrase 2 only: no plate until the change, then it grows
    expect(plateOf(c, 'PL_POD_1', 3).w).toBe(0);
    expect(plateOf(c, 'PL_POD_1', 8.8).w).toBeGreaterThan(0);
    // line 2 stands at the bottom in both phrases
    expect(plateOf(c, 'PL_POD_2', 3).y0).toBeCloseTo(plateOf(c, 'PL_POD_2', 8.8).y0, 6);
    expect(plateOf(c, 'PL_POD_3', 8.8).w).toBe(0);
  });

  it('the descenders of phrase 1 are measured at rest though it has left by the moment of measure', () => {
    const c = comp(p.spec, { ctrl: { Style: 1, Position: 1 }, texts: { TXT_1: 'И тут, и так далее', TXT_2: '', TXT_3: '', TXT2_1: 'Вторая фраза', TXT2_2: '', TXT2_3: '' } });
    const h = p.layout.podcast.h;
    // one line: the plate reaches 8.3 px under the comma and Д with phrase 1, not 95 px more
    expect(plateOf(c, 'PL_POD_1', 3).h - h).toBeCloseTo(8.26 - p.layout.podcast.base, 1);
    expect(plateOf(c, 'PL_POD_1', 8.8).h).toBeCloseTo(h, 6);
  });
});
