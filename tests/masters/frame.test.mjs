// POD_Frame «Рамка подкаста»: its numbers from the podcast pack, and its expressions run in Node on a stand-in
// comp (tests/helpers/master-expr.mjs): the window, the line, the tags at rest, the fly as a scale from the
// centre, the side and an empty tag. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/kontent_1.json');
const metrics = JSON.parse(readFileSync(path.join(REPO, 'masters/POD_Frame/source-metrics.json'), 'utf8'));

// the pack's ink of the tags in FHD units (4K at 85 %); other texts 40 px per character
function tagInk() {
  const by = new Map();
  for (const c of metrics.cases) for (const row of Object.values(c.layers)) by.set(row.text.trim(), { l: 1, w: row.rect[2] * 0.425, b: 0 });
  return (layer, s) => (s ? by.get(s.trim()) || { l: 1, w: s.length * 40, b: 0 } : { l: 0, w: 0, b: 0 });
}
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('POD_Frame', async () => {
  const { resolve } = await import('../../masters/POD_Frame/resolve.mjs');
  const p = resolve();
  const comp = (opts = {}) => exprComp(p.spec, { ink: tagInk(), ...opts });

  it('takes the window, the line and the tags from the pack, the fly from canon M8', () => {
    const L = p.layout;
    expect([L.halfW, L.halfH]).toEqual([907.5, 489]);
    expect(L.line).toEqual({ rest: 3, start: 25 });
    expect(L.tags).toMatchObject({ h: 66, band: 12.5, font: 'SBSansDisplay-Bold', size: 80.75, tracking: -28, rise: { top: 76.67, bot: 72.25 } });
    expect(L.tags.pad).toBeCloseTo(10.09, 2);
    const t = p.timing;
    expect([t.fly.in.frames, t.fly.out.frames, t.thin.frames]).toEqual([23, 26, 20]);
    expect([t.top.wipe.in.frames, t.bot.wipe.in.frames, t.top.rise.frames, t.bot.rise.frames]).toEqual([29, 33, 13, 13]);
    expect([t.introEnd, t.outroStart]).toEqual([1.72, 7.92]);
    expect(p.duration).toEqual({ introSec: 2.32, holdSec: 4.88, outroSec: 2.8 });
    expect(p.variants.map((v) => v.key)).toEqual(['16x9', '16x9_4K']);
    expect(p.spec.egpNames).toEqual(['Тег сверху', 'Тег снизу', 'Сторона тегов', 'Скорость']);
  });

  it('at rest: the line inside the window, the tags where the pack has them (FHD)', () => {
    const c = comp({ ctrl: { Side: 1 } });
    const top = rectOf(c, 'LINE', 'Top', 4);
    expect([top.x0, top.x1, top.y0, top.y1]).toEqual([52.5, 1867.5, 51, 54].map((v) => expect.closeTo(v, 6)));
    expect(rectOf(c, 'LINE', 'Left', 4).w).toBeCloseTo(3, 6);
    const t = rectOf(c, 'PL_TOP', 'Plate', 4);
    const b = rectOf(c, 'PL_BOT', 'Plate', 4);
    for (const [v, want] of [[t.x0, 1432.0], [t.x1, 1867.5], [t.y0, 51], [t.y1, 117], [b.x0, 1447.5], [b.x1, 1867.5], [b.y0, 963], [b.y1, 1029]]) {
      expect(Math.abs(v - want)).toBeLessThan(1);
    }
    // the clip of the text reaches 12.5 px under the plate (the Д of «ПОДКАСТ»)
    expect(rectOf(c, 'CL_BOT', 'Clip', 4).y1).toBeCloseTo(b.y1 + 12.5, 6);
    expect(c.at('TAG_TOP', ['text'], 4)).toBe('CLOUD.RU');
  });

  it('the fly: 1.32 at the start, landed at 0.92 s, out of the picture on the last frame; the line thins', () => {
    const c = comp();
    const w0 = rectOf(c, 'LINE', 'Top', 0).w;
    expect(w0 / 1815).toBeCloseTo(1 / (1 - 1290.1 / 3840 * 36 / 50), 4);
    expect(rectOf(c, 'LINE', 'Top', 0).h / (w0 / 1815)).toBeCloseTo(25, 4);
    expect(rectOf(c, 'LINE', 'Top', 0.92).w).toBeCloseTo(1815, 6);
    expect(rectOf(c, 'LINE', 'Top', 1.0).h).toBeCloseTo(3, 6);
    expect(rectOf(c, 'LINE', 'Top', 9.96).y0).toBeLessThan(0);
    // tags: wiped in from the window edge, gone before the frame flies out
    expect(rectOf(c, 'PL_BOT', 'Plate', 0.2).w).toBe(0);
    expect(rectOf(c, 'PL_BOT', 'Plate', 1.0).w).toBeGreaterThan(0);
    expect(rectOf(c, 'PL_BOT', 'Plate', 1.0).x1).toBeCloseTo(rectOf(c, 'LINE', 'Right', 1.0).x1, 6);
    expect(rectOf(c, 'PL_TOP', 'Plate', 9.2).w).toBe(0);
  });

  it('tags on the left mirror the right; an empty tag has no plate', () => {
    const c = comp({ ctrl: { Side: 2 }, texts: { TAG_TOP: '', TAG_BOT: 'Выпуск 12' } });
    expect(rectOf(c, 'PL_TOP', 'Plate', 4).w).toBe(0);
    const b = rectOf(c, 'PL_BOT', 'Plate', 4);
    expect(b.x0).toBeCloseTo(52.5, 6);
    expect(b.w).toBeCloseTo('ВЫПУСК 12'.length * 40 + 2 * p.layout.tags.pad, 6);
    expect(c.at('TAG_BOT', ['text'], 4)).toBe('ВЫПУСК 12');
  });
});
