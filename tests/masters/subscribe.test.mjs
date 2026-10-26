// TTL_Subscribe «Призыв „Подписывайся“»: its numbers from the pack dump, and its expressions run in Node on a
// stand-in comp (tests/helpers/master-expr.mjs). Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../../tools/masters/rig-plate.mjs';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/podpisyvaysya_ssylki_v_opisanii.json');
const metrics = JSON.parse(readFileSync(path.join(REPO, 'masters/TTL_Subscribe/source-metrics.json'), 'utf8'));

// The pack's ink in FHD units (4K at 85 %): «ПОДПИСЫВАЙСЯ!» reaches 10.57 px under its baseline (Д).
function packInk() {
  const byText = new Map();
  for (const row of Object.values(metrics.cases[0].layers)) {
    const s = 0.85 / 2;
    const base = row.lines.find(Boolean)[1];
    byText.set(row.text, { l: 1, w: row.rect[2] * s, b: (row.rect[1] + row.rect[3] - base) * s });
  }
  return (layer, text) => {
    if (!text) return { l: 0, w: 0, b: 0 };
    return byText.get(text.toUpperCase()) || { l: 1, w: text.length * 40, b: 0 };
  };
}

const plateOf = (c, n, t) => {
  const [w, h] = c.at(n, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(n, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('TTL_Subscribe', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve } = await import('../../masters/TTL_Subscribe/resolve.mjs');
  const p = resolve();
  const comp = (opts) => exprComp(p.spec, { ink: packInk(), ...opts });

  it('takes its numbers and its own curves from the pack', () => {
    const L = p.layout;
    expect([L.font, L.size, L.tracking]).toEqual(['SBSansDisplay-Bold', 80.75, -28]);
    expect(L.rise).toBeCloseTo(71.825, 3);
    expect(L.h).toBeCloseTo(66.0, 2);
    expect(L.step).toBeCloseTo(76.0, 2);
    expect(L.reach).toBeCloseTo(10.75, 2);
    expect(L.bottom).toBeCloseTo(108.25, 2);
    expect(L.edge).toBeCloseTo(52.46, 2);
    const t = p.timing;
    expect([t.plateIn.frames, t.textIn.frames, t.textOut.frames, t.plateOut.frames]).toEqual([19, 9, 8, 17]);
    expect(t).toMatchObject({ inDelays: [0, 0.36], textLag: 0.4, outStagger: 0.24, plateLag: 0 });
    expect(p.duration).toEqual({ introSec: 1.52, holdSec: 3.2, outroSec: 1.28 });
    expect(p.spec.egpNames).toEqual(['Строка 1', 'Строка 2', 'Позиция', 'Скорость', 'Размер текста']);
  });

  it('capitals by expression, as the pack typed them: All Caps would space them 1.25 % wider', () => {
    expect(p.text.TXT_LINE1.style.allCaps).toBeUndefined();
    const c = comp({ ctrl: { Position: 1 }, texts: { TXT_LINE1: 'Подписывайся, ёлки!', TXT_LINE2: 'ссылки в описании' } });
    expect([c.at('TXT_LINE1', ['text'], 3), c.at('TXT_LINE2', ['text'], 3)]).toEqual(['ПОДПИСЫВАЙСЯ, ЁЛКИ!', 'ССЫЛКИ В ОПИСАНИИ']);
  });

  it('hidden words hang out of their plate: the breve of Й is not in it before the rise', () => {
    // the pack's 71.8 px left the top of Й, Ё and Å 10.7 px deep in line 1's plate, which reaches under its Д
    // and into line 2; the words hang 87.81 px, so that a capital Q's tail would not bring it back
    const c = comp({ ctrl: { Position: 1 }, texts: {} });
    const top = GLYPHS['SBSansDisplay-Bold'].top * p.layout.size;
    for (const i of [1, 2]) {
      const hide = c.at(`TXT_LINE${i}`, P.rise(), 3)[1];
      expect(hide).toBeCloseTo(87.81, 2);
      expect(c.at(`TXT_LINE${i}`, P.pos, 3)[1] + hide - top).toBeGreaterThan(plateOf(c, `PL_${i}`, 3).y1 + 1);
    }
  });

  it('«Авто»: both lines centred low, line 1 reaches under its Д into line 2, as the pack', () => {
    const c = comp({ w: 3840, h: 2160, ctrl: { Position: 1 }, texts: { TXT_LINE1: 'ПОДПИСЫВАЙСЯ!', TXT_LINE2: 'ССЫЛКИ В ОПИСАНИИ' } });
    const a = plateOf(c, 'PL_1', 3);
    const b = plateOf(c, 'PL_2', 3);
    // the pack (4K): line 1 x 1150.5–2686.0 y 1659.5–1813.0, line 2 x 954.5–2884.8 y 1811.5–1943.5; its plates
    // are scaled by hand (pads 11.9 / 11.2 and 7.9 / 9.3 px FHD, the master takes their mean, 10.07)
    for (const [v, want] of [[a.x0, 1150.5], [a.x1, 2686.0], [a.y0, 1659.5], [a.y1, 1813.0], [b.x0, 954.5], [b.x1, 2884.8], [b.y0, 1811.5], [b.y1, 1943.5]]) {
      expect(Math.abs(v - want)).toBeLessThan(5);
    }
    // line 1 reaches under its Д, at least 1 px into line 2
    expect(a.y1).toBeGreaterThanOrEqual(b.y0 + 1);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(1920, 6);
  });

  it('one line stands on the bottom; the sides keep the podcast frame edge; 160 % fits', () => {
    const one = comp({ ctrl: { Position: 2 }, texts: { TXT_LINE1: 'Жми на колокольчик', TXT_LINE2: '' } });
    expect(plateOf(one, 'PL_2', 3).w).toBe(0);
    expect(plateOf(one, 'PL_1', 3).y1).toBeCloseTo(1080 - p.layout.bottom, 6);
    expect(plateOf(one, 'PL_1', 3).x0).toBeCloseTo(p.layout.edge, 6);
    const big = comp({ ctrl: { Position: 4, Size: 5 }, texts: { TXT_LINE1: 'Ставь лайк', TXT_LINE2: 'и делись выпуском с коллегами по цеху' } });
    const f = big.at('RIG', ['effect', 'FitSub', 'ADBE Slider Control', 1], 3);
    expect(f).toBeLessThan(1.6);
    expect(plateOf(big, 'PL_2', 3).x1).toBeCloseTo(1920 - p.layout.edge, 6);
    expect(plateOf(big, 'PL_2', 3).x0).toBeGreaterThanOrEqual(p.layout.edge);
  });

  it('timing: line 2 follows by 0.36 s, the words of each line 0.4 s after its plate, gone on the last frame', () => {
    const c = comp({ ctrl: { Position: 1 }, texts: {} });
    expect(plateOf(c, 'PL_1', 0.2).w).toBeGreaterThan(0);
    expect(plateOf(c, 'PL_2', 0.2).w).toBe(0);
    const start = (n, t) => c.at(n, ['selector', 'Rise', 'ADBE Text Percent Start'], t);
    expect([start('TXT_LINE1', 0.4), start('TXT_LINE1', 0.76), start('TXT_LINE2', 0.76), start('TXT_LINE2', 1.12)]).toEqual([0, 100, 0, 100]);
    expect([plateOf(c, 'PL_1', 5.96).w, plateOf(c, 'PL_2', 5.96).w]).toEqual([0, 0]);
    expect(start('TXT_LINE1', 5.04)).toBe(100);
    expect(start('TXT_LINE1', 5.36)).toBe(0);
  });
});
