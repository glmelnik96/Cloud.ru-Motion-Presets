import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATES, FORMATS, mbFor, estimate, normalizeRates, renderMarkdown } from '../../tools/library/estimate-weight.mjs';

const rates = { prores4444: { mbPerSec: 15, atPixels: 1920 * 1080 }, png_mov: { mbPerSec: 2.5, atPixels: 1920 * 1080 } };
const row = (extra) => ({ id: 'BG_X', title_ru: 'Фон', codec: 'prores4444', seconds: 10, formats: ['16x9'], ...extra });

describe('estimate-weight', () => {
  it('scales the rate with seconds, copies, pixels and the content factor', () => {
    expect(mbFor({ format: '16x9', seconds: 10, codec: 'prores4444' }, rates)).toBeCloseTo(150);
    expect(mbFor({ format: '16x9_4K', seconds: 10, codec: 'prores4444' }, rates)).toBeCloseTo(600);
    expect(mbFor({ format: '1x1', seconds: 10, copies: 3, codec: 'prores4444', rateFactor: 0.5 }, rates)).toBeCloseTo(15 * (1080 * 1080) / (1920 * 1080) * 10 * 3 * 0.5);
  });
  it('splits the default install and the optional extra', () => {
    const r = estimate({ items: [row({ optionalFormats: ['16x9_4K'] }), row({ id: 'BG_Y', optional: true })] }, rates);
    expect(r.rows[0].defaultMB).toBeCloseTo(150);
    expect(r.rows[0].optionalMB).toBeCloseTo(600);
    expect(r.rows[1].defaultMB).toBe(0);
    expect(r.rows[1].optionalMB).toBeCloseTo(150);
    expect(r.totals.defaultMB).toBeCloseTo(150);
    expect(r.totals.fullMB).toBeCloseTo(900);
  });
  it('adds fixed extras and can override the codec of every row', () => {
    const r = estimate({ items: [row()], extras: [{ title_ru: 'MOGRT', count: 10, mbEach: 3 }] }, rates, { codec: 'png_mov' });
    expect(r.rows[0].codec).toBe('png_mov');
    expect(r.totals.defaultMB).toBeCloseTo(25 + 30);
  });
  it('rejects unknown codecs and formats', () => {
    expect(() => estimate({ items: [row({ codec: 'hap' })] }, rates)).toThrow(/unknown codec hap/);
    expect(() => estimate({ items: [row({ formats: ['21x9'] })] }, rates)).toThrow(/unknown format 21x9/);
  });
  it('reads the S11 table: max MB/s per megapixel, prores_ae for ProRes 4444, png for PNG in MOV', () => {
    const r = normalizeRates({
      spike: 'S11', date: '2026-10-05', platform: 'win32', unit: 'MB/s per megapixel at 25 fps (MB = 10^6 bytes)',
      codecs: {
        prores_ae: { mean: 6, max: 7.5, samples: [] },
        prores_ks: { mean: 9, max: 10, samples: [] },
        png: { mean: 1, max: 1.25, samples: [] },
      },
    });
    expect(Object.keys(r)).toEqual(['prores4444', 'png_mov']);
    expect(r.prores4444.mbPerSec).toBeCloseTo(7.5 * 2.0736);
    expect(r.png_mov.mbPerSec).toBeCloseTo(1.25 * 2.0736);
    expect(normalizeRates({ codecs: { png: { mean: null, max: null, samples: [] } } })).toEqual({});
  });
  it('accepts a hand-made override and rejects a bad one', () => {
    expect(normalizeRates({ prores4444: { mbPerSec: 16, atPixels: 2073600 } }).prores4444.mbPerSec).toBe(16);
    expect(() => normalizeRates({ prores4444: { mbPerSec: 0 } })).toThrow(/bad rate/);
  });
  it('renders totals in GB and a row per item', () => {
    const md = renderMarkdown(estimate({ items: [row({ optionalFormats: ['16x9_4K'] })] }, rates), { rates: DEFAULT_RATES });
    expect(md).toContain('- **Установка по умолчанию:** 0,15 ГБ');
    expect(md).toContain('- **Полный дистрибутив:** 0,75 ГБ');
    expect(md).toContain('| Фон (`BG_X`) | prores4444 | 10 | 1 | 1 | 16x9 | 150 | 16x9_4K | 600 |');
    expect(renderMarkdown(estimate({ items: [row()] }, rates, { codec: 'png_mov' }), { codec: 'png_mov' })).toContain('кодеке png_mov (--codec)');
  });
  it('accepts the draft T2 matrix', () => {
    const matrix = JSON.parse(readFileSync(new URL('../../docs/decisions/t2-matrix.draft.json', import.meta.url), 'utf8'));
    expect(matrix.status).toBe('draft');
    const r = estimate(matrix, DEFAULT_RATES);
    expect(r.rows.map((x) => x.id)).toEqual([
      'BG_Arrows', 'BG_Plus', 'BG_Rack', 'SMM_FrameNotched', 'CRS_LectureDrift', 'WEB_PortalBG',
      'TRN_Stairs', 'TRN_Bars', 'POD_Intro', 'POD_Outro', 'LOGO_SloganPrerenders',
    ]);
    for (const it of matrix.items) for (const f of it.formats.concat(it.optionalFormats)) expect(Object.keys(FORMATS)).toContain(f);
    expect(r.totals.defaultMB).toBeGreaterThan(0);
  });
});
