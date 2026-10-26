// CRS_Subtitles «Субтитры»: the courses pack's subtitle lines on the plates of the Premiere style «CR Субтитры»,
// its expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs): centred lines on the pack's
// baselines, one line on the lower one, a long line shrinking the block, nothing moving.
// Resolves from the dumps: the build machine only.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';
import { plateOf } from '../helpers/plate-ink.mjs';

const HAS_DUMPS = ['courses/overley_16_na_9.json', 'courses/overley_3_na_2.json'].every((f) => existsSync('C:/CRBK/work/dumps/' + f));
// 17 px per character at 35 px, one px of side bearing, no descenders
const ink = (layer, s) => (s ? { l: 1, w: s.length * 17, b: 0 } : { l: 0, w: 0, b: 0 });

describe.skipIf(!HAS_DUMPS)('CRS_Subtitles', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve } = await import('../../masters/CRS_Subtitles/resolve.mjs');
  const p = resolve();
  const L = p.layout;
  const comp = (texts, opts = {}) => exprComp(p.spec, { ink, texts, ...opts });

  it('takes the lines from the pack and the plates from the Premiere style', () => {
    expect([L.font, L.size, L.tracking]).toEqual(['SBSansText-Regular', 35, -32]);
    expect(L.baselines.map((v) => Math.round(v * 100) / 100)).toEqual([940.73, 988.48]);
    expect(L.step).toBeCloseTo(47.75, 2);
    expect([L.h, L.base, L.pad]).toEqual([49.7, 14.7, 9]);
    expect(L.bottom).toBeCloseTo(1080 - 988.48 - 14.7, 2);
    expect(p.hex).toMatchObject({ black: '#222222', white: '#FFFFFF' });
    expect(p.comp.duration).toBe(300);
    expect(p.duration).toEqual({ introSec: 0, holdSec: 4, outroSec: 0, maxSec: 300 });
    expect(p.markers).toEqual([]);
    expect(p.spec.egpNames).toEqual(['Строка 1', 'Строка 2']);
    expect(p.variants.map((v) => v.key)).toEqual(['16x9', '16x9_4K']);
  });

  it('two lines: centred on the frame, on the pack baselines, each on its plate 9 px past its ink', () => {
    const texts = { TXT_LINE1: 'Пишем текст, много текста', TXT_LINE2: 'и вторая строка' };
    const c = comp(texts);
    L.baselines.forEach((y, i) => {
      const t = `TXT_LINE${i + 1}`;
      const pl = plateOf(c, `PL_${i + 1}`, 1);
      expect(c.at(t, P.pos, 1)[1]).toBeCloseTo(y, 6);
      expect((pl.x0 + pl.x1) / 2).toBeCloseTo(960, 6);
      const e = ink(t, texts[t]);
      expect(pl.w).toBeCloseTo(e.w + 2 * L.pad, 6);
      expect(c.at(t, P.pos, 1)[0] + e.l).toBeCloseTo(pl.x0 + L.pad, 6);
      expect(pl.y0).toBeCloseTo(y - 35, 6);
    });
    // the lower plate ends 14.7 px under its baseline; the upper one reaches into it (the lines are closer
    // than a plate is tall)
    expect(plateOf(c, 'PL_2', 1).y1).toBeCloseTo(L.baselines[1] + 14.7, 6);
    expect(plateOf(c, 'PL_1', 1).y1).toBeGreaterThan(plateOf(c, 'PL_2', 1).y0);
  });

  it('one line stands on the lower baseline, whichever field holds it', () => {
    for (const texts of [{ TXT_LINE1: 'Одна строка', TXT_LINE2: '' }, { TXT_LINE1: '', TXT_LINE2: 'Одна строка' }]) {
      const c = comp(texts);
      const on = texts.TXT_LINE1 ? 1 : 2;
      expect(c.at(`TXT_LINE${on}`, P.pos, 1)[1]).toBeCloseTo(L.baselines[1], 6);
      expect(plateOf(c, `PL_${3 - on}`, 1).w).toBe(0);
    }
  });

  it('a line wider than the frame margins shrinks the block; nothing moves over the clip', () => {
    // 17 px a character: 120 characters are wider than the 1720 px between the margins
    const long = 'Очень длинная строка субтитров, которую стоило бы разбить на две. '.repeat(2);
    const c = comp({ TXT_LINE1: long, TXT_LINE2: 'вторая' });
    const pl = plateOf(c, 'PL_1', 1);
    expect(pl.x0).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(pl.x1).toBeLessThanOrEqual(1820 + 1e-6);
    const f = c.at('TXT_LINE1', P.scale, 1)[0] / 100;
    expect(f).toBeLessThan(1);
    // the block keeps its bottom: the lower plate still ends where it did, the lines closer by f
    const bottom = 1080 - L.bottom;
    expect(plateOf(c, 'PL_2', 1).y1).toBeCloseTo(bottom, 6);
    expect(c.at('TXT_LINE2', P.pos, 1)[1]).toBeCloseTo(bottom - L.base * f, 6);
    expect(c.at('TXT_LINE1', P.pos, 1)[1]).toBeCloseTo(bottom - (L.base + L.step) * f, 6);
    const d = comp({ TXT_LINE1: 'Пишем текст', TXT_LINE2: 'вторая' });
    for (const t of [0, 4, 299.96]) {
      expect(plateOf(d, 'PL_1', t)).toEqual(plateOf(d, 'PL_1', 1));
      expect(d.at('TXT_LINE1', ['selector', 'Rise', 'ADBE Text Percent Start'], t)).toBe(100);
    }
  });

  it('in 4K the block scales with the frame', () => {
    const t = { TXT_LINE1: 'Пишем текст', TXT_LINE2: 'вторая' };
    const fhd = plateOf(comp(t), 'PL_2', 1);
    const uhd = plateOf(comp(t, { w: 3840, h: 2160 }), 'PL_2', 1);
    for (const k of ['x0', 'x1', 'y0', 'y1']) expect(uhd[k]).toBeCloseTo(fhd[k] * 2, 6);
  });
});
