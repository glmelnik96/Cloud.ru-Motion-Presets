// TTL_Disclaimer «Дисклеймер»: its numbers from the podcast pack, the decoration it moves over, and its
// expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs): the lines and plates at rest,
// the words across the lines, empty lines, the fit of a long line, the title in the corner, the speed and
// the decoration's own time. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/diskleymer.json');
const metrics = JSON.parse(readFileSync(path.join(REPO, 'masters/TTL_Disclaimer/source-metrics.json'), 'utf8'));
const TXT = ['TXT_LINE1', 'TXT_LINE2', 'TXT_LINE3', 'TXT_LINE4', 'TXT_LINE5'];

// the ink of the pack's texts as the master measured it (FHD); other texts 30 px per character
function packInk(p) {
  const by = new Map(TXT.map((t, i) => [p.text[t].value.toUpperCase(), metrics.master.lines[i]]));
  by.set(p.text.TXT_TITLE.value.toUpperCase(), metrics.master.title);
  return (layer, s) => {
    if (!s) return { l: 0, w: 0, b: 0 };
    const r = by.get(s);
    return r ? { l: r[0], w: r[2], b: 0 } : { l: 5, w: s.length * 30, b: 0 };
  };
}
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('TTL_Disclaimer', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve } = await import('../../masters/TTL_Disclaimer/resolve.mjs');
  const p = resolve();
  const comp = (opts = {}) => exprComp(p.spec, { ink: packInk(p), ...opts });

  it('takes the lines, plates and title from the pack, and its curves', () => {
    const { body: B, title: T } = p.layout;
    expect([B.font, B.size, B.tracking, B.fill]).toEqual(['SBSansDisplay-Bold', 60, -24, '#B3B3B3']);
    expect(B.step).toBeCloseTo(70.5, 6);
    expect(B.origin).toBeCloseTo(265.5, 1);
    expect(B.left).toBeCloseTo(258.27, 2);
    expect(B.baselines[0]).toBeCloseTo(349.88, 2);
    expect([B.rise, B.opacity]).toEqual([54, 0]);
    expect(B.text).toHaveLength(5);
    expect(T).toMatchObject({ size: 79.5, tracking: -22, fill: '#222222', rise: 97.5, text: 'ДИСКЛЕЙМЕР' });
    expect([T.plate.x0, T.plate.x1, T.plate.y0, T.plate.y1].map((v) => Math.round(v * 10) / 10)).toEqual([1261.5, 1867.5, 963.5, 1029.5]);
    expect(T.clip).toMatchObject({ top: 930.5, bottom: 1029.5, drop: 12 });
    expect(p.pad.provisional).toBe(false);
    expect(p.pad.padR).toBeCloseTo(13.37, 2);
    const t = p.timing;
    expect(t.plates.map((s) => s.frames)).toEqual([9, 11, 13, 12, 12]);
    expect(t.plates.map((s) => s.t0)).toEqual([0.4, 0.52, 0.6, 0.76, 0.96]);
    expect(t.words).toEqual({ t0: 0.52, t1: 1.4 });
    expect([t.titlePlate.frames, t.titleRise.frames, t.titleClip.frames, t.introEnd]).toEqual([19, 8, 3, 1.44]);
    expect(p.markers).toEqual([{ comment: 'in', time: 0, duration: 1.92 }]);
    expect(p.duration).toEqual({ introSec: 1.92, holdSec: 8.08, outroSec: 0 });
    expect(p.variants.map((v) => v.key)).toEqual(['16x9', '16x9_4K']);
    expect(p.spec.egpNames).toEqual(['Заголовок', 'Строка 1', 'Строка 2', 'Строка 3', 'Строка 4', 'Строка 5', 'Скорость']);
  });

  it('moves the decoration over from the pack comp as it is', () => {
    const tp = p.spec.transplant;
    expect(tp.aep).toBe('C:/CRBK/packs/podcast/podcast_relinked.aep');
    expect(tp.source).toEqual({ name: 'Дисклеймер', w: 3840, h: 2160, layers: 22 });
    expect(tp.comps.map((c) => [c.name, c.keep.map((k) => k.index)])).toEqual([['DECOR_HIGH', [8, 9, 10, 11, 12, 13, 14]], ['DECOR_LOW', [18, 19, 20, 21]]]);
    expect(tp.extend.map((e) => e.comp)).toEqual(['Vert_lines_1 Comp 1', 'Verts_lines_2 Comp 1']);
    // over the title and under it, as in the pack
    const order = p.spec.order;
    expect(order.indexOf('DECOR_HIGH')).toBeGreaterThan(order.indexOf('PL_5'));
    expect(order.indexOf('DECOR_HIGH')).toBeLessThan(order.indexOf('TXT_TITLE'));
    expect(order[order.length - 1]).toBe('DECOR_LOW');
    for (const [w, h, s] of [[1920, 1080, 50], [3840, 2160, 100]]) {
      const c = comp({ w, h });
      expect(c.at('DECOR_HIGH', ['transform', 'ADBE Scale'], 4)).toEqual([s, s]);
      expect(c.at('DECOR_LOW', ['transform', 'ADBE Position'], 4)).toEqual([w / 2, h / 2]);
    }
  });

  it('at rest: the lines on the pack baselines, plates within 2.5 px of the hand-placed ends, one pixel into the next', () => {
    const c = comp();
    const B = p.layout.body;
    for (let i = 0; i < 5; i += 1) {
      const [x, y] = c.at(TXT[i], ['transform', 'ADBE Position'], 4);
      expect(x).toBeCloseTo(B.origin, 6);
      expect(y).toBeCloseTo(B.baselines[i], 6);
      const r = rectOf(c, `PL_${i + 1}`, 'Plate', 4);
      expect(r.x0).toBeCloseTo(B.left, 6);
      expect(Math.abs(r.x1 - B.plates[i].x1)).toBeLessThan(2.5);
      expect(r.y0).toBeCloseTo(B.plates[i].y0, 6);
      expect(r.y1).toBeCloseTo(B.plates[i].y1 + (i < 4 ? 1 : 0), 6);
      expect(c.at(TXT[i], ['selector', 'Rise', 'ADBE Text Percent Start'], 4)).toBe(100);
    }
    expect(c.at('RIG', ['effect', 'Fit', 'ADBE Slider Control', 1], 4)).toBe(1);
    // the title: the pack's plate round its ink, the baseline on the plate bottom
    const t = rectOf(c, 'PL_TITLE', 'Plate', 4);
    expect([t.x0, t.x1, t.y0, t.y1].map((v) => Math.round(v * 10) / 10)).toEqual([1261.5, 1867.5, 963.5, 1029.5]);
    expect(rectOf(c, 'CL_TITLE', 'Clip', 4).y1).toBeCloseTo(1029.5 + 12, 6);
  });

  it('the words: one sweep across all lines, a line starts when the one above is done', () => {
    const c = comp();
    const start = (i, t) => c.at(TXT[i], ['selector', 'Rise', 'ADBE Text Percent Start'], t);
    expect(TXT.map((_, i) => start(i, 0.5))).toEqual([0, 0, 0, 0, 0]);
    // 26 words: line 1 holds 7 of them, done at 0.52 + 0.88 * 7 / 26
    const t7 = 0.52 + (0.88 * 7) / 26;
    expect(start(0, t7)).toBeCloseTo(100, 6);
    expect(start(1, t7)).toBeCloseTo(0, 6);
    expect(start(1, t7 + 0.88 / 52)).toBeCloseTo(100 / 6, 4);
    expect(TXT.map((_, i) => start(i, 1.4))).toEqual([100, 100, 100, 100, 100]);
    // the plates grow from the left, each on its own delay
    expect(rectOf(c, 'PL_5', 'Plate', 0.96).w).toBe(0);
    expect(rectOf(c, 'PL_1', 'Plate', 0.6).w).toBeGreaterThan(0);
    expect(rectOf(c, 'PL_1', 'Plate', 0.6).x0).toBeCloseTo(p.layout.body.left, 6);
  });

  it('empty lines have no plate; a long line fits the block in the pack box; texts in capitals', () => {
    const long = 'она может не совпадать с позицией компании и её партнёров по рынку';
    const c = comp({ texts: { TXT_TITLE: 'Важно', TXT_LINE1: 'Мнение гостя', TXT_LINE2: long, TXT_LINE3: '', TXT_LINE4: '', TXT_LINE5: '' } });
    const B = p.layout.body;
    expect(c.at('TXT_LINE1', ['text'], 4)).toBe('МНЕНИЕ ГОСТЯ');
    expect(rectOf(c, 'PL_3', 'Plate', 4).w).toBe(0);
    // the longest line ends at the pack box end: its plate no further than the box end and its pad
    const f = c.at('RIG', ['effect', 'Fit', 'ADBE Slider Control', 1], 4);
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo((B.boxRight - B.origin) / (5 + long.length * 30), 6);
    const r2 = rectOf(c, 'PL_2', 'Plate', 4);
    expect(r2.x1).toBeLessThanOrEqual(B.boxRight + p.pad.padR + 1e-6);
    // line 2 has no plate under it now: no extra pixel
    expect(r2.y1 - r2.y0).toBeCloseTo((B.plates[1].y1 - B.plates[1].y0) * f, 6);
    // the title plate fits the new word, still in the corner
    const t = rectOf(c, 'PL_TITLE', 'Plate', 4);
    expect(t.x1).toBeCloseTo(1867.5, 6);
    expect(t.w).toBeCloseTo(5 * 30 + p.layout.title.padL + p.layout.title.padR, 6);
  });

  it('speed: the texts play their intro at 2× and hold; the decoration keeps its own time after the intro', () => {
    const c = comp({ ctrl: { Speed: 5 } });
    expect(rectOf(c, 'PL_5', 'Plate', 0.72).x1).toBeCloseTo(rectOf(comp(), 'PL_5', 'Plate', 1.44).x1, 6);
    expect(c.at('DECOR_HIGH', ['timeRemap'], 0.5)).toBeCloseTo(1.0, 9);
    expect(c.at('DECOR_HIGH', ['timeRemap'], 2.0)).toBeCloseTo(1.44 + (2.0 - 0.72), 9);
    expect(comp().at('DECOR_LOW', ['timeRemap'], 7.3)).toBeCloseTo(7.3, 9);
  });
});
