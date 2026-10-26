// TRN_Bars «Шторка-полосы»: the SMM pack's bar transitions as numbers (two layers of five bars sliding in opposite
// directions, the three colour comps the same bars), where they show and cover each format at 25 fps, the timeline
// with the cover held four frames, the logo by the brandbook, the files and the library entry; the master's
// expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs).
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = ['transition_gray', 'transition_green', 'transition_white', 'transition_with_logo', 'cloud_ru_blackmono_3']
  .every((f) => existsSync(`C:/CRBK/work/dumps/smm/${f}.json`));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe.skipIf(!HAS_DUMPS)('TRN_Bars', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve, libraryEntry, loadSources, barsModel, rectsAt, COLOURS, FORMATS, HOLD, DEFAULT_COLOUR } = await import('../../masters/TRN_Bars/resolve.mjs');
  const p = resolve();
  const comp = (Colour, Logo = 0, w = 1080, h = 1920) => exprComp(p.spec, { w, h, ctrl: { Colour, Logo }, ink: () => ({ l: 0, w: 0, b: 0 }) });

  it('reads the pack\'s bars: two layers of five sliding 0.833 s in opposite directions, the same in the three colours', () => {
    const m = p.model;
    expect(m).toMatchObject({ w: 1080, h: 1920, fps: 24, duration: 0.875, fill: '#222222' });
    expect(m.layers.map((l) => [l.name, l.groups.length, Math.sign(l.x1 - l.x0)])).toEqual([['Transition_2', 5, -1], ['Transition_1', 5, 1]]);
    expect(m.layers.every((l) => l.t0 === 0 && Math.abs(l.t1 - 0.833333) < 1e-6)).toBe(true);
    const s = loadSources();
    expect([s.green, s.white].map((d) => barsModel(d).fill)).toEqual(['#26D07C', '#FFFFFF']);
    // at 0.4 s the two big bars meet in the middle and cover the frame with room to spare
    const big = rectsAt(m, 0.4).filter((r) => r.r - r.l > 1500);
    expect(big).toHaveLength(2);
    expect(Math.min(...big.map((r) => r.l))).toBeLessThan(-100);
  });

  it('at 25 fps the pack covers the frame on frames 10–12; the master holds 10 a frame more: cut on frame 9 of 21', () => {
    const t = p.timing;
    expect(t.per['9x16']).toMatchObject({ full: [10, 11, 12] });
    expect([t.per['9x16'].shown[0], t.per['9x16'].shown.at(-1)]).toEqual([1, 20]);
    expect(t).toMatchObject({ head: 1, tail: 20, extra: HOLD - 3, cutFrame: 9, frames: 21, durationSec: 0.84 });
    for (const k of ['9x16', '16x9', '1x1']) expect(t.covered[k]).toEqual(range(9, 12));
    expect(p.comp).toMatchObject({ w: 1080, h: 1920, fps: 25, duration: 0.84 });
  });

  it('plays the pack from its first shown frame, stands on the first full one, then goes on', () => {
    const c = comp(2);
    const at = (f) => Math.round(c.at('BARS', P.timeRemap, f / 25) * 25 * 1e6) / 1e6;
    expect([0, 8, 9, 10, 11, 20].map(at)).toEqual([1, 9, 10, 10, 11, 20]);
  });

  it('covers every format: 9:16 as in the pack, 16:9 and 4K turned a quarter, 1:1 its middle; the logo stays upright', () => {
    const look = (w, h) => {
      const c = comp(2, 1, w, h);
      return { rot: c.at('BARS', ['transform', 'ADBE Rotate Z'], 0), scale: c.at('BARS', P.scale, 0), logo: c.at('LOGO', P.scale, 0), at: c.at('LOGO', P.pos, 0) };
    };
    expect(look(1080, 1920)).toEqual({ rot: 0, scale: [100, 100], logo: [100, 100], at: [540, 960] });
    expect(look(1920, 1080)).toEqual({ rot: 90, scale: [100, 100], logo: [100, 100], at: [960, 540] });
    expect(look(3840, 2160)).toEqual({ rot: 90, scale: [200, 200], logo: [200, 200], at: [1920, 1080] });
    expect(look(1080, 1080)).toEqual({ rot: 0, scale: [100, 100], logo: [100, 100], at: [540, 540] });
    // the logo turns about the pack frame's middle, where it sits; it shows through the bars only
    expect(p.spec.layers.find((l) => l.name === 'LOGO').anchor).toEqual([540, 960]);
    expect(p.spec.mattes).toEqual([{ layer: 'LOGO', matte: 'BARS', type: 'ALPHA' }]);
  });

  it('«Цвет» fills the bars; the logo by the brandbook (L6): black on green, green cube with white or black letters', () => {
    const fill = (i) => comp(i).at('BARS', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], 0);
    expect([1, 2, 3].map(fill)).toEqual([[0.14902, 0.815686, 0.486275, 1], [0.133333, 0.133333, 0.133333, 1], [1, 1, 1, 1]]);
    const logo = (i) => ['Wordmark', 'Cube'].map((g) => comp(i, 1).at('LOGO', P.fill(g), 0).slice(0, 3).map((v) => Math.round(v * 255)));
    expect(logo(1)).toEqual([[34, 34, 34], [34, 34, 34]]);
    expect(logo(2)).toEqual([[255, 255, 255], [38, 208, 124]]);
    expect(logo(3)).toEqual([[34, 34, 34], [38, 208, 124]]);
    expect([0, 1].map((on) => comp(2, on).at('LOGO', P.opacity, 0))).toEqual([0, 100]);
    // the master cube where the pack's is (D18)
    expect(p.logo.cube).toMatchObject({ x0: expect.closeTo(184.5, 3), y0: expect.closeTo(901.26, 3), w: expect.closeTo(118.4, 3) });
  });

  it('renders a whole clip per format, colour and logo', () => {
    expect(p.files).toHaveLength(FORMATS.length * COLOURS.length * 2);
    expect(p.files.slice(0, 3).map((f) => f.key)).toEqual(['9x16_green', '9x16_green_logo', '9x16_dark']);
    expect(p.files.every((f) => f.kind === 'clip' && f.seconds === 0.84)).toBe(true);
    expect(p.files.find((f) => f.key === '16x9_4K_white_logo')).toMatchObject({ variant: '16x9_4K', ctrl: { Colour: 3, Logo: 1 }, options: { colour: 3, logo: true } });
  });

  it('library.src.json has the entry the files make: a transition cut on frame 9, colour and logo pick the file', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'TRN_Bars');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'transitions', tier: 'T2', cutFrame: 9, alpha: true });
    expect(item.fields.map((f) => [f.key, f.type, f.default])).toEqual([['colour', 'dropdown', DEFAULT_COLOUR], ['logo', 'checkbox', false]]);
    expect([...new Set(item.variants.map((v) => v.aspect))]).toEqual(['9x16', '16x9', '1x1']);
  });
});
