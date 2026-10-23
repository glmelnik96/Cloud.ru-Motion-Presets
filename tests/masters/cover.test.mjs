// CRS_Cover «Обложка курса»: its numbers from the three covers of the courses pack and its expressions run in Node
// on a stand-in comp (tests/helpers/master-expr.mjs): the title per variant, empty lines, the fit of a long line,
// the rise out of the bands, the card and the portals on the pack's keys, the label on the portal's corner, the
// visual, the colours of the green variant, the wipe at the clip's end and the cut under it.
// Resolves from the dumps: the build machine only.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bbox, samplePolyline } from '../../tools/dump/geometry.mjs';
import { GLYPHS } from '../../tools/masters/rig-plate.mjs';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = ['oblozhka_1', 'oblozhka_2', 'oblozhka_3', 'logo', 'visual', 'visual_with_background', 'perekhod']
  .every((f) => existsSync(`C:/CRBK/work/dumps/courses/${f}.json`));
// lines: 50 px per character at their size, no descenders
const ink = (layer, s) => (s ? { l: 9, w: s.length * 50, b: 0 } : { l: 0, w: 0, b: 0 });
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};
const pathOf = (c, layer, group, t) => c.at(layer, ['group', group, 'Path 1', 'ADBE Vector Shape'], t).vertices;
const close = (list) => list.map((p) => p.map((v) => expect.closeTo(v, 5)));
const TXT = ['TXT_LINE1', 'TXT_LINE2', 'TXT_LINE3'];
const PACK = { TXT_LINE1: 'Первая строчка', TXT_LINE2: 'вторая строчка', TXT_LINE3: 'третья последняя', TXT_PRODUCT: 'Cloud.ru Advanced' };
const START_P = ['selector', 'Rise', 'ADBE Text Percent Start'];
const FILL = ['animator', 'Ink', 'ADBE Text Fill Color'];

describe.skipIf(!HAS_DUMPS)('CRS_Cover', async () => {
  const { resolve } = await import('../../masters/CRS_Cover/resolve.mjs');
  const p = resolve();
  const L = p.layout;
  const Tl = L.title;
  const comp = (opts = {}) => exprComp(p.spec, { ink, texts: PACK, ...opts });

  it('takes the title, the label, the visual, the paths and the timing from the pack (FHD = pack x 0.75)', () => {
    expect([Tl.font, Tl.size, Tl.tracking, Tl.step, Tl.rise]).toEqual(['SBSansDisplay-Regular', 93.75, -16, 90, 82.5]);
    // #1 stands 37 pack px right of #2 and #3; #3 sits 23.6 px higher
    expect(Tl.origins.map((v) => Math.round(v * 100) / 100)).toEqual([128.76, 101.01, 100.66]);
    expect(Tl.firsts.map((v) => Math.round(v * 100) / 100)).toEqual([355.95, 355.95, 338.25]);
    expect(Tl.fills).toEqual(['#FFFFFF', '#FFFFFF', '#222222']);
    expect(L.label).toMatchObject({ font: 'SBSansDisplay-Regular', size: 22.5, tracking: 5, fills: ['#CCCCCC', '#CCCCCC', '#222222'], pack: 'Cloud.ru Advanced' });
    expect(L.descriptor).toEqual({ font: 'SBSansDisplay-Semibold', text: 'облачные\rи ИИ-сервисы' });
    expect([L.card.fill, L.portal.fill, L.window.fill]).toEqual(['#333333', '#26D07C', '#FFFFFF']);
    expect([L.card.keys, L.portal.keys, L.window.keys].map((k) => k.map((x) => x.t))).toEqual([[0, 3.04, 6], [0, 2.96, 7.76], [0, 2.96, 7.92]]);
    expect(L.visual.img).toEqual({ w: 1622, h: 1246 });
    expect(L.visual.places.map((x) => x.scale)).toEqual([0.90885, 0.9855, 0.84825]);
    const t = p.timing;
    expect(t.rises.map((r) => [r.t0, r.frames])).toEqual([[0, 27], [0.52, 22], [0.92, 19]]);
    expect([t.label, t.introEnd, t.wipe]).toEqual([{ t0: 1, t1: 2.32 }, 2.32, { at: 4.96, length: 2.04, cover: 1.04 }]);
    expect(p.duration).toEqual({ introSec: 3.12, holdSec: 1.16, outroSec: 2.72, maxSec: 30 });
    expect(p.comp).toMatchObject({ w: 1920, h: 1080, fps: 25, duration: 30 });
    expect(p.spec.fonts).toEqual(['SBSansDisplay-Regular', 'SBSansDisplay-Semibold']);
    expect(p.spec.egpNames).toEqual(['Визуал', 'Заголовок, строка 1', 'Заголовок, строка 2', 'Заголовок, строка 3', 'Продукт', 'Вариант', 'Скорость', 'Длительность (служебное, не менять)']);
    expect(p.spec.transplant.comps.map((c) => [c.name, c.keep.length, c.hide || [], c.duration || null])).toEqual([
      ['DECOR_HEAD', 4, ['Logo'], 30], ['DECOR_BARS', 3, [], 30], ['DECOR_WIPE', 6, [], null]]);
    expect(p.spec.layers.filter((l) => l.type === 'precomp').map((l) => [l.name, l.collapse])).toEqual([['DECOR_BARS', true], ['DECOR_HEAD', true], ['DECOR_WIPE', true]]);
    // the master logo's cube on the pack's
    const cube = p.spec.layers.find((l) => l.name === 'LOGO').groups.find((g) => g.name === 'Cube');
    const b = bbox(cube.paths.flatMap((sp) => samplePolyline(sp)));
    expect([b.x0, b.y0, b.x1 - b.x0].map((v) => Math.round(v * 100) / 100)).toEqual([60.28, 33.95, 38.54]);
  });

  it('at rest: each variant puts the lines on its baselines, in bands from the line above to under the descenders', () => {
    for (const v of [1, 2, 3]) {
      const c = comp({ ctrl: { Variant: v } });
      TXT.forEach((t, i) => {
        const y = Tl.firsts[v - 1] + Tl.step * i;
        expect(c.at(t, P.pos, 4)).toEqual(close([[Tl.origins[v - 1], y]])[0]);
        expect(c.at(t, START_P, 4)).toBeCloseTo(100, 6);
        const band = rectOf(c, `CL_LINE${i + 1}`, 'Band', 4);
        expect([band.y0, band.y1]).toEqual([y - Tl.step, y + Tl.below].map((x) => expect.closeTo(x, 6)));
        expect(band.x0).toBeCloseTo(0, 6);
      });
    }
  });

  it('hidden lines hang out of their bands: no Й, Ё or Å in a band before its rise', () => {
    const c = comp();
    const top = GLYPHS['SBSansDisplay-Regular'].top * Tl.size;
    expect(c.at('TXT_LINE1', P.rise(), 0)[1]).toBeCloseTo(102.6875, 6);
    expect(c.at('TXT_LINE1', START_P, 0)).toBe(0);
    const band = rectOf(c, 'CL_LINE1', 'Band', 0);
    expect(c.at('TXT_LINE1', P.pos, 0)[1] + c.at('TXT_LINE1', P.rise(), 0)[1] - top).toBeCloseTo(band.y1 + 1, 6);
  });

  it('the lines rise one after another as the pack\'s; an empty line gives its place and its timing to the next', () => {
    const c = comp();
    const start = (t, s, cc = c) => cc.at(t, START_P, s);
    expect(TXT.map((t) => start(t, 0.5))).toEqual([expect.any(Number), 0, 0]);
    expect(start('TXT_LINE1', 0.5)).toBeGreaterThan(50);
    expect(start('TXT_LINE2', 0.53)).toBeGreaterThan(0);
    expect(start('TXT_LINE3', 0.92)).toBe(0);
    expect(TXT.map((t) => start(t, 1.68))).toEqual([100, 100, 100].map((v) => expect.closeTo(v, 4)));
    const gap = comp({ texts: { ...PACK, TXT_LINE2: '' } });
    expect(gap.at('TXT_LINE3', P.pos, 4)[1]).toBeCloseTo(Tl.firsts[0] + Tl.step, 6);
    expect(start('TXT_LINE3', 1.4, gap)).toBeCloseTo(100, 4);
    expect(rectOf(gap, 'CL_LINE2', 'Band', 4).w).toBe(0);
    // at 2x the intro is over at 1.16 s
    const fast = comp({ ctrl: { Speed: 5 } });
    expect(start('TXT_LINE3', 0.85, fast)).toBeCloseTo(100, 4);
  });

  it('a line longer than the room shrinks the block from its top line', () => {
    const c = comp({ texts: { ...PACK, TXT_LINE1: 'Х'.repeat(30) } });
    const f = c.at('TXT_LINE1', P.scale, 4)[0] / 100;
    expect((9 + 30 * 50) * f).toBeCloseTo(Tl.room, 6);
    expect(c.at('TXT_LINE1', P.pos, 4)[1]).toBeCloseTo(Tl.firsts[0], 6);
    expect(c.at('TXT_LINE2', P.pos, 4)[1]).toBeCloseTo(Tl.firsts[0] + Tl.step * f, 6);
  });

  it('the card of #1 and the portals of #3 follow the pack\'s keys; #2 has none', () => {
    const one = comp({ ctrl: { Variant: 1 } });
    L.card.keys.forEach((key) => expect(pathOf(one, 'CARD', 'Card', key.t)).toEqual(close(key.v)));
    expect(one.at('CARD', P.fill('Card'), 1)).toEqual([0.2, 0.2, 0.2, 1]);
    expect(one.at('CARD', P.opacity, 1)).toBe(100);
    expect(one.at('WINDOW', P.opacity, 1)).toBe(0);
    // the visual sits in the card
    expect(pathOf(one, 'VMATTE', 'Matte', 3.04)).toEqual(close(L.card.keys[1].v));
    const three = comp({ ctrl: { Variant: 3 } });
    L.portal.keys.forEach((key) => expect(pathOf(three, 'CARD', 'Card', key.t)).toEqual(close(key.v)));
    expect(three.at('CARD', P.fill('Card'), 1)).toEqual([0.14902, 0.815686, 0.486275, 1]);
    L.window.keys.forEach((key) => expect(pathOf(three, 'WINDOW', 'Window', key.t)).toEqual(close(key.v)));
    expect(pathOf(three, 'VMATTE', 'Matte', 2.96)).toEqual(close(L.window.keys[1].v));
    const two = comp({ ctrl: { Variant: 2 } });
    expect([two.at('CARD', P.opacity, 1), two.at('WINDOW', P.opacity, 1), two.at('DECOR_BARS', P.opacity, 1)]).toEqual([0, 0, 100]);
    expect(pathOf(two, 'VMATTE', 'Matte', 1)).toEqual([[0, 0], [1920, 0], [1920, 1080], [0, 1080]]);
    expect(one.at('DECOR_BARS', P.opacity, 1)).toBe(0);
  });

  it('the label fades in after the first line; on #3 it rides the big portal\'s corner, dark like the lines', () => {
    const one = comp({ ctrl: { Variant: 1 } });
    expect(one.at('TXT_PRODUCT', P.pos, 4)).toEqual(close([L.label.at])[0]);
    expect([0.99, 1.66, 2.33].map((t) => one.at('TXT_PRODUCT', P.opacity, t))).toEqual([0, 50, 100].map((v) => expect.closeTo(v, 4)));
    expect(one.at('TXT_PRODUCT', FILL, 4)).toEqual([0.8, 0.8, 0.8, 1]);
    expect(one.at('TXT_LINE1', FILL, 4)).toEqual([1, 1, 1, 1]);
    const three = comp({ ctrl: { Variant: 3 } });
    L.portal.keys.forEach((key) => {
      const corner = key.v[2];
      expect(three.at('TXT_PRODUCT', P.pos, key.t)).toEqual(close([[corner[0] + L.label.corner[0], corner[1] + L.label.corner[1]]])[0]);
    });
    expect(three.at('TXT_PRODUCT', FILL, 4)).toEqual([0.133333, 0.133333, 0.133333, 1]);
    expect(TXT.map((t) => three.at(t, FILL, 4))).toEqual(TXT.map(() => [0.133333, 0.133333, 0.133333, 1]));
  });

  it('the visual: where each cover has it; #1 and #2 push in as the pack, #3 stands still', () => {
    for (const v of [1, 2, 3]) {
      const c = comp({ ctrl: { Variant: v } });
      const pl = L.visual.places[v - 1];
      expect(c.at('SLOT_VISUAL', P.pos, 4)).toEqual(close([pl.centre])[0]);
      expect(c.at('SLOT_VISUAL', P.scale, 0)[0]).toBeCloseTo(100 * pl.scale, 6);
      expect(c.at('SLOT_VISUAL', P.scale, 10)[0]).toBeCloseTo(100 * pl.scale * (v === 3 ? 1 : 153.9 / 146), 6);
    }
  });

  it('the wipe plays at the clip\'s end at the chosen speed; the cover is cut under its bars', () => {
    const at = (c, t) => c.at('DECOR_WIPE', P.timeRemap, t);
    const seven = comp({ ctrl: { Duration: 7 } });
    expect([at(seven, 2), at(seven, 4.96), at(seven, 5.96), at(seven, 7)]).toEqual([0, 0, 1, 2.03].map((v) => expect.closeTo(v, 6)));
    for (const l of ['GROUND', 'CARD', 'SLOT_VISUAL', 'TXT_LINE1', 'DECOR_HEAD', 'LOGO']) {
      expect([seven.at(l, P.opacity, 5.99), seven.at(l, P.opacity, 6.01)]).toEqual([expect.any(Number), 0]);
    }
    expect(seven.at('GROUND', P.opacity, 5.99)).toBe(100);
    const long = comp({ ctrl: { Duration: 20 } });
    expect([at(long, 17.96), at(long, 18.96)]).toEqual([0, 1].map((v) => expect.closeTo(v, 6)));
    expect([long.at('LOGO', P.opacity, 18.99), long.at('LOGO', P.opacity, 19.01)]).toEqual([100, 0]);
    const fast = comp({ ctrl: { Duration: 7, Speed: 5 } });
    expect([at(fast, 5.98), at(fast, 6.48)]).toEqual([0, 1].map((v) => expect.closeTo(v, 6)));
    expect([fast.at('GROUND', P.opacity, 6.49), fast.at('GROUND', P.opacity, 6.51)]).toEqual([100, 0]);
  });

  it('in 4K the cover is the FHD one twice as large', () => {
    for (const v of [1, 3]) {
      const fhd = comp({ ctrl: { Variant: v } });
      const uhd = comp({ ctrl: { Variant: v }, w: 3840, h: 2160 });
      expect(uhd.at('TXT_LINE2', P.pos, 4)).toEqual(close([fhd.at('TXT_LINE2', P.pos, 4).map((x) => 2 * x)])[0]);
      expect(pathOf(uhd, 'CARD', 'Card', 2)).toEqual(close(pathOf(fhd, 'CARD', 'Card', 2).map((pt) => pt.map((x) => 2 * x))));
      expect(uhd.at('TXT_PRODUCT', P.pos, 2)).toEqual(close([fhd.at('TXT_PRODUCT', P.pos, 2).map((x) => 2 * x)])[0]);
      expect(uhd.at('SLOT_VISUAL', P.scale, 2)[0]).toBeCloseTo(2 * fhd.at('SLOT_VISUAL', P.scale, 2)[0], 6);
    }
  });
});
