// SMM_ShortsIntro «Интро шортсов»: its numbers from the SMM pack and its expressions run in Node on a stand-in comp
// (tests/helpers/master-expr.mjs): the cards, the lines on the pack's baselines rising two frames apart, empty
// lines, the fit of a long line, the wipe at the clip's end at the chosen speed and the cut under its bars.
// Resolves from the dumps: the build machine only.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bbox, samplePolyline } from '../../tools/dump/geometry.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/smm/zastavka_9x16.json');
// lines: 30 px per character at their size, no descenders
const ink = (layer, s) => (s ? { l: 5, w: s.length * 30, b: 0 } : { l: 0, w: 0, b: 0 });
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};
const TXT = ['TXT_LINE1', 'TXT_LINE2', 'TXT_LINE3', 'TXT_LINE4'];
const PACK = { TXT_LINE1: 'Как быстро создать', TXT_LINE2: 'Telegram-бота с AI', TXT_LINE3: 'под обучение', TXT_LINE4: 'сотрудников?' };

describe.skipIf(!HAS_DUMPS)('SMM_ShortsIntro', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve } = await import('../../masters/SMM_ShortsIntro/resolve.mjs');
  const p = resolve();
  const comp = (opts = {}) => exprComp(p.spec, { w: 1080, h: 1920, ink, ...opts });
  const Ln = p.layout.lines;

  it('takes the cards, the lines, the rise and the wipe from the pack', () => {
    const L = p.layout;
    expect([L.green.x0, L.green.y0, Math.round(L.green.x1), L.green.y1].map((v) => Math.round(v))).toEqual([77, 238, 837, 1276]);
    expect([L.white.x0, L.white.y0, L.white.x1, L.white.y1].map((v) => Math.round(v))).toEqual([141, 588, 901, 1626]);
    expect([Ln.origin, Ln.first, Ln.step, Ln.rise, Ln.size, Ln.font]).toEqual([110, 321, 60, 252, 60, 'SBSansDisplay-Semibold']);
    expect(Ln.below).toBeCloseTo(12.08, 2);
    expect(p.colors).toEqual({ ground: '#222222', green: '#26D07C', white: '#FFFFFF', text: '#222222' });
    const t = p.timing;
    expect([t.rise.frames, t.stagger, Math.round(t.introEnd * 100) / 100]).toEqual([24, 0.083333, 1.21]);
    expect(t.wipe).toEqual({ start: 3.166667, length: 0.875, cover: 0.375 });
    expect(p.duration).toEqual({ introSec: 1.64, holdSec: 1.16, outroSec: 1.2, maxSec: 15 });
    expect(p.comp.duration).toBe(15);
    expect(p.spec.transplant.comps).toEqual([{ name: 'DECOR_WIPE', keep: [{ index: 2, name: 'Transition_gray' }] }]);
    expect(p.spec.egpNames).toEqual(['Видео', 'Заголовок, строка 1', 'Заголовок, строка 2', 'Заголовок, строка 3', 'Заголовок, строка 4', 'Скорость', 'Длительность (служебное, не менять)']);
    // the master logo lands on the pack's logo (its cube fitted, the wordmark where the pack has it)
    const logo = p.spec.layers.find((l) => l.name === 'LOGO');
    const b = bbox(logo.groups.flatMap((g) => g.paths.flatMap((sp) => samplePolyline(sp))));
    expect([b.x0, b.x1, b.y0, b.y1].map((v) => Math.round(v * 10) / 10)).toEqual([255.6, 824.2, 907.2, 1012.4]);
  });

  it('at rest: the lines on the pack baselines in their bands; empty lines collapse', () => {
    const c = comp({ texts: PACK });
    TXT.forEach((t, i) => {
      expect(c.at(t, ['transform', 'ADBE Position'], 3)).toEqual([110, 321 + 60 * i]);
      const band = rectOf(c, `CL_LINE${i + 1}`, 'Band', 3);
      expect([band.y0, band.y1]).toEqual([321 + 60 * i - 60, 321 + 60 * i + Ln.below].map((v) => expect.closeTo(v, 6)));
      expect(c.at(t, ['selector', 'Rise', 'ADBE Text Percent Start'], 3)).toBeCloseTo(100, 6);
    });
    const gap = comp({ texts: { TXT_LINE1: 'Один', TXT_LINE2: '', TXT_LINE3: 'Два', TXT_LINE4: '' } });
    expect(gap.at('TXT_LINE3', ['transform', 'ADBE Position'], 3)).toEqual([110, 381]);
    expect(rectOf(gap, 'CL_LINE2', 'Band', 3).w).toBe(0);
  });

  it('a line longer than the card shrinks the block, the lines closer together', () => {
    const long = 'Х'.repeat(40);
    const c = comp({ texts: { TXT_LINE1: long, TXT_LINE2: 'вторая', TXT_LINE3: '', TXT_LINE4: '' } });
    const f = c.at('TXT_LINE1', ['transform', 'ADBE Scale'], 3)[0] / 100;
    expect((5 + 40 * 30) * f).toBeCloseTo(Ln.room, 6);
    expect(c.at('TXT_LINE2', ['transform', 'ADBE Position'], 3)[1]).toBeCloseTo(321 + 60 * f, 6);
  });

  it('the rise: each line two frames after the one above; all up at 1.21 s, faster at 2×', () => {
    const c = comp({ texts: PACK });
    const start = (t, s, cc = c) => cc.at(t, ['selector', 'Rise', 'ADBE Text Percent Start'], s);
    expect(TXT.map((t) => start(t, 0))).toEqual([0, 0, 0, 0]);
    expect(start('TXT_LINE1', 0.5)).toBeGreaterThan(start('TXT_LINE2', 0.5));
    expect(start('TXT_LINE2', 0.5)).toBeCloseTo(start('TXT_LINE1', 0.5 - 0.083333), 6);
    expect(TXT.map((t) => start(t, 1.22))).toEqual([100, 100, 100, 100].map((v) => expect.closeTo(v, 4)));
    const fast = comp({ texts: PACK, ctrl: { Speed: 5 } });
    expect(start('TXT_LINE4', 0.61, fast)).toBeCloseTo(100, 4);
  });

  it('the wipe plays at the clip\'s end at the chosen speed; the cards are cut under its bars', () => {
    const at = (c, t) => c.at('DECOR_WIPE', ['timeRemap'], t);
    const four = comp({ ctrl: { Duration: 4 } });
    expect(at(four, 2)).toBeCloseTo(3.166667, 6);
    expect(at(four, 3.125)).toBeCloseTo(3.166667, 6);
    expect(at(four, 3.5)).toBeCloseTo(3.166667 + 0.375, 6);
    expect(four.at('CARD', ['transform', 'ADBE Opacity'], 3.49)).toBe(100);
    expect(four.at('CARD', ['transform', 'ADBE Opacity'], 3.51)).toBe(0);
    const eight = comp({ ctrl: { Duration: 8 } });
    expect(at(eight, 7)).toBeCloseTo(3.166667, 6);
    expect(at(eight, 7.5)).toBeCloseTo(3.166667 + 0.375, 6);
    const fast = comp({ ctrl: { Duration: 4, Speed: 5 } });
    expect(at(fast, 4 - 0.4375)).toBeCloseTo(3.166667, 6);
    expect(at(fast, 4 - 0.25)).toBeCloseTo(3.166667 + 0.375, 6);
    expect(fast.at('TXT_LINE1', ['transform', 'ADBE Opacity'], 3.76)).toBe(0);
  });
});
