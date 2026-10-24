// The three T2 backgrounds (spec 5 «Фоны»): BG_Plus (the SMM grid of pluses flickered by a block noise on M9),
// BG_Arrows (the SMM arrows shown around a wandering point, made a 15 s loop) and BG_Rack (the webinars' arrow grid
// flickered by its noise): what each reads from the packs, how it lays itself out per format, the loop, the files and
// the library entries; the masters' expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs).
// Resolve from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS = (files) => files.every((f) => existsSync(`C:/CRBK/work/dumps/${f}.json`));
const SRC = () => JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
const FN = (n) => `ADBE Fractal Noise-${String(n).padStart(4, '0')}`;
const sizes = [[1080, 1920], [1080, 1080], [1920, 1080]];

describe.skipIf(!HAS(['smm/bg_pattern_9x16_2', 'smm/bg_pattern_1x1_2', 'smm/plus']))('BG_Plus', async () => {
  const { resolve, libraryEntry } = await import('../../masters/BG_Plus/resolve.mjs');
  const p = resolve();
  const comp = (w, h) => exprComp(p.spec, { w, h, ctrl: {}, ink: () => ({ l: 0, w: 0, b: 0 }) });

  it('reads the pack\'s grid: the «+» tile from (9, 12) at 50 %, 35 %, under a block noise of scale 111.7', () => {
    const { tall, square } = p.layouts;
    expect(tall.plus).toMatchObject({ pos: [expect.closeTo(9, 3), expect.closeTo(12, 3)], scale: 50, opacity: 35 });
    expect(tall.noise).toMatchObject({ noiseType: 1, scale: 111.7, offset: [771.2, 708.8], complexity: 1, evolution: 'time*50', opacity: 100 });
    expect(square.noise.opacity).toBe(50);
  });

  it('flickers on M9 (40° a second) and cycles one revolution: a 9 s loop', () => {
    expect(p.period).toBe(9);
    const noise = p.spec.layers.find((l) => l.name === 'NOISE').effects[0];
    expect(noise.values).toMatchObject({ [FN(2)]: 1, [FN(25)]: 1, [FN(26)]: 1 });
    expect(p.spec.expressions.find((e) => e.layer === 'NOISE' && e.path[3] === FN(23)).src).toBe('time*40');
    expect(p.spec.mattes).toEqual([{ layer: 'PLUSES', matte: 'NOISE', type: 'LUMA' }]);
  });

  it('lays the grid out as the pack per format: the square at 0.75 with its matte at 50 %, 16:9 as 9:16', () => {
    const look = ([w, h]) => { const c = comp(w, h); return { pos: c.at('PLUSES', P.pos, 0), scale: c.at('PLUSES', P.scale, 0), matte: c.at('NOISE', P.opacity, 0), noise: c.at('NOISE', ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(10)], 0) }; };
    const [tall, square, wide] = sizes.map(look);
    expect(tall).toEqual({ pos: [expect.closeTo(9, 3), expect.closeTo(12, 3)], scale: [50, 50], matte: 100, noise: 111.7 });
    expect(square).toEqual({ pos: [expect.closeTo(6.75, 3), expect.closeTo(9, 3)], scale: [37.5, 37.5], matte: 50, noise: expect.closeTo(83.775, 3) });
    expect(wide).toEqual(tall);
  });

  it('library.src.json has its entry: a loop per format', () => {
    const item = SRC().items.find((i) => i.id === 'BG_Plus');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'backgrounds', tier: 'T2', alpha: true, loop: { periodFrames: 225 } });
    expect(item.variants.map((v) => v.key)).toEqual(['9x16', '1x1', '16x9', '16x9_4K']);
    // the 4K loop is the installer's 4K option (D24)
    expect(item.variants.filter((v) => v.pack).map((v) => [v.key, v.pack, v.w])).toEqual([['16x9_4K', '4k', 3840]]);
  });
});

describe.skipIf(!HAS(['smm/pattern_edit_2', 'smm/bg_pattern_9x16_1', 'smm/bg_pattern_1x1_1']))('BG_Arrows', async () => {
  const { resolve, libraryEntry, loopWiggleJs } = await import('../../masters/BG_Arrows/resolve.mjs');
  const p = resolve();
  const comp = (w, h) => exprComp(p.spec, { w, h, ctrl: {}, ink: () => ({ l: 0, w: 0, b: 0 }) });

  it('reads the pack\'s pattern: 390 arrows shown around a point wandering by wiggle(0.3, 1000)', () => {
    expect(p.pattern).toMatchObject({ freq: 0.3, amp: 1000, rest: [1920, 1080], tiles: 390 });
    expect(p.spec.transplant.comps[0].keep).toHaveLength(394);
  });

  it('makes the wandering a 15 s loop: the wiggle cross-faded into itself a period earlier', () => {
    const set = p.spec.transplant.comps[0].set;
    expect(set).toEqual([{ layer: 'Null 1', path: ['transform', 'ADBE Position'], expr: loopWiggleJs(p.pattern, 15) }]);
    // as a function of a stand-in wiggle: the loop starts where the wiggle does and ends where it started
    const run = (time, wig) => new Function('time', 'wiggle', 'linear', set[0].expr.replace(/\n([^\n]*)$/, '\nreturn ($1);'))(time, wig, (t, a, b, x, y) => x.map((v, i) => v + (y[i] - v) * Math.max(0, Math.min(1, (t - a) / (b - a)))));
    const wig = (f, a, o, m, t) => [Math.sin(t), Math.cos(t * 1.3)];
    expect(run(0, wig)).toEqual(wig(0, 0, 0, 0, 0));
    const r4 = (v) => +v.toFixed(4) + 0;
    expect(run(14.999999, wig).map(r4)).toEqual(wig(0, 0, 0, 0, 0).map(r4));
  });

  it('places the 4K pattern as the pack per format: 9:16 at 125 %, the square at 0.75 of 100 %, 16:9 whole', () => {
    const look = ([w, h]) => { const c = comp(w, h); return { pos: c.at('PATTERN', P.pos, 0).map((v) => +v.toFixed(3)), scale: c.at('PATTERN', P.scale, 0) }; };
    expect(sizes.map(look)).toEqual([
      { pos: [570, 933], scale: [125, 125] },
      { pos: [517.5, 562.5], scale: [75, 75] },
      { pos: [960, 540], scale: [50, 50] },
    ]);
  });

  it('library.src.json has its entry: a 15 s loop per format', () => {
    const item = SRC().items.find((i) => i.id === 'BG_Arrows');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'backgrounds', loop: { periodFrames: 375 } });
  });
});

describe.skipIf(!HAS(['webinars/pattern_rack_animation', 'webinars/pattern_rack']))('BG_Rack', async () => {
  const { resolve, libraryEntry } = await import('../../masters/BG_Rack/resolve.mjs');
  const p = resolve();
  const comp = (w, h, Colour = 1) => exprComp(p.spec, { w, h, ctrl: { Colour }, ink: () => ({ l: 0, w: 0, b: 0 }) });

  it('reads the pack\'s rack: 15 rows of 27 arrows 150 px apart, 4 px #222222, shown by a block noise on M9', () => {
    expect(p.model.grid).toEqual({ rows: 15, columns: 27, step: [150, 0], strokes: ['4px 34,34,34'] });
    expect(p.model.noise).toMatchObject({ type: 5, noiseType: 1, scale: 225, cycle: 0 });
    expect(p.period).toBe(9);
    const t = p.spec.transplant.comps[0];
    expect(t).toMatchObject({ keep: [{ name: 'Fractal Noice' }, { name: 'PATTERN RACK' }], flat: true });
    expect(t.set.map((s) => [s.path[3], s.value])).toEqual([[FN(25), 1], [FN(26), 1]]);
  });

  it('covers every frame with the 4K grid and colours it: light white at 25 %, dark #222222', () => {
    expect(sizes.map(([w, h]) => comp(w, h).at('RACK', P.scale, 0).map((v) => +v.toFixed(3)))).toEqual([[88.889, 88.889], [50, 50], [50, 50]]);
    const look = (c) => [comp(1920, 1080, c).at('RACK', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], 0), comp(1920, 1080, c).at('RACK', P.opacity, 0)];
    expect(look(1)).toEqual([[1, 1, 1, 1], 25]);
    expect(look(2)).toEqual([[0.133333, 0.133333, 0.133333, 1], 100]);
  });

  it('library.src.json has its entry: a 9 s loop per format and colour', () => {
    const item = SRC().items.find((i) => i.id === 'BG_Rack');
    expect(item).toEqual(libraryEntry(p));
    expect(item.variants.map((v) => v.key)).toEqual(['16x9_light', '16x9_4K_light', '16x9_dark', '16x9_4K_dark', '9x16_light', '9x16_dark', '1x1_light', '1x1_dark']);
    expect(item.variants.filter((v) => v.pack).map((v) => v.options)).toEqual([{ colour: 1 }, { colour: 2 }]);
  });
});
