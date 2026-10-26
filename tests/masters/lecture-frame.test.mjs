// CRS_LectureFrame «Рамка лекции» (D9): the windows from the pack's overlays in the proportion of the recording,
// the layouts and their mirror, which layers each layout shows, the files and the library entry they make; the
// master's expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs).
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = ['overley_16_na_9', 'overley_3_na_2', 'overley_so_spikerom', 'logo'].every((f) => existsSync(`C:/CRBK/work/dumps/courses/${f}.json`));
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x: x - w / 2, y: y - h / 2, w, h };
};
const close = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, expect.closeTo(v, 6)]));

describe.skipIf(!HAS_DUMPS)('CRS_LectureFrame', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve, libraryEntry, LAYOUTS, windowOf } = await import('../../masters/CRS_LectureFrame/resolve.mjs');
  const p = resolve();
  const W = p.layout.windows;
  const comp = (Layout, opts = {}) => exprComp(p.spec, { ink: () => ({ l: 0, w: 0, b: 0 }), ctrl: { Layout }, ...opts });

  it('windows in the proportion of the recording, on whole pixels, close to the pack\'s (D9)', () => {
    expect(W.s169.screen).toEqual({ x: 150, y: 100, w: 1600, h: 900 });
    // the pack's 3:2 mask is 1300x900 (13:9): 1350 wide about its centre
    expect(W.s32.screen).toEqual({ x: 275, y: 100, w: 1350, h: 900 });
    // beside the speaker the pack's 1250x751 (5:3) screen: 16:9 of a width on the 16 px grid, on the speaker's middle
    expect(W.spkL.speaker).toEqual({ x: 50, y: 150, w: 500, h: 750 });
    expect(W.spkL.screen).toEqual({ x: 601, y: 174, w: 1248, h: 702 });
    for (const [r, ratio] of [[W.s169.screen, 16 / 9], [W.s32.screen, 3 / 2], [W.spkL.screen, 16 / 9], [W.spkL.speaker, 2 / 3]]) {
      expect(r.w / r.h).toBeCloseTo(ratio, 9);
    }
    // the mirror keeps the windows' sizes and their distances from the frame's edges
    expect(W.spkR.screen).toEqual({ ...W.spkL.screen, x: 1920 - 601 - 1248 });
    expect(W.spkR.speaker).toEqual({ ...W.spkL.speaker, x: 1920 - 50 - 500 });
    for (const l of ['spkL', 'spkR']) {
      const [a, b] = [W[l].screen, W[l].speaker];
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
      for (const r of [a, b]) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1920 && r.y + r.h <= 1080).toBe(true);
    }
    expect(windowOf({ x: 600, y: 149.5, w: 1250, h: 750.7 }, 16 / 9, { keep: 'w' })).toEqual({ x: 601, y: 174, w: 1248, h: 702 });
  });

  it('the bars drift on a 60 s cycle, the same in the three overlays; the files are one cycle', () => {
    expect(Object.values(p.drift)).toEqual(Array(6).fill([0, 15, 30, 45, 60]));
    expect(p.comp).toMatchObject({ w: 1920, h: 1080, fps: 25, duration: 60 });
    expect(p.files.map((f) => [f.key, f.kind, f.variant])).toEqual(LAYOUTS.flatMap((l) => [
      [`16x9_${l.key}`, 'still', '16x9'], [`16x9_4K_${l.key}`, 'still', '16x9_4K'], [`16x9_${l.key}_drift`, 'loop', '16x9'], [`16x9_4K_${l.key}_drift`, 'loop', '16x9_4K']]));
    // the 4K drift loops are the installer's 4K option (D24); the 4K stills are in every install
    expect(p.files.filter((f) => f.pack).map((f) => f.key)).toEqual(LAYOUTS.map((l) => `16x9_4K_${l.key}_drift`));
    expect(p.files.filter((f) => f.kind === 'loop').every((f) => f.seconds === 60)).toBe(true);
    expect(p.spec.transplant.comps.map((c) => [c.name, c.keep.length])).toEqual([['DECOR_BARS', 6], ['DECOR_PATTERN', 1]]);
  });

  it('each layout shows its windows and layers: the pattern, the plate and the cut bars with the speaker', () => {
    const shows = (c, l) => c.at(l, P.opacity, 10);
    LAYOUTS.forEach((l, i) => {
      const c = comp(i + 1);
      expect(rectOf(c, 'WINDOWS', 'Screen', 10)).toEqual(close(W[l.key].screen));
      if (l.speaker) expect(rectOf(c, 'WINDOWS', 'Speaker', 10)).toEqual(close(W[l.key].speaker));
      else expect(rectOf(c, 'WINDOWS', 'Speaker', 10).w).toBe(0);
      const sp = l.speaker ? 100 : 0;
      expect(['PATTERN', 'PLATE', 'BARS_UNDER', 'BARS'].map((n) => shows(c, n))).toEqual([sp, sp, sp, 100 - sp]);
    });
    expect(p.spec.mattes.map((m) => [m.layer, m.matte, m.type])).toEqual([['GROUND', 'WINDOWS', 'ALPHA_INVERTED'], ['PATTERN', 'WINDOWS', 'ALPHA_INVERTED'], ['BARS_UNDER', 'WINDOWS', 'ALPHA_INVERTED']]);
  });

  it('in 4K the frame is the FHD one twice as large', () => {
    for (const lay of [1, 4]) {
      const fhd = rectOf(comp(lay), 'WINDOWS', 'Screen', 0);
      const uhd = rectOf(comp(lay, { w: 3840, h: 2160 }), 'WINDOWS', 'Screen', 0);
      expect(uhd).toEqual(close({ x: fhd.x * 2, y: fhd.y * 2, w: fhd.w * 2, h: fhd.h * 2 }));
      expect(comp(lay, { w: 3840, h: 2160 }).at('BARS', P.scale, 0)).toEqual([200, 200]);
    }
  });

  it('library.src.json has the entry the files and windows make', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'CRS_LectureFrame');
    expect(item).toEqual(libraryEntry(p));
    // every file has the screen window; the speaker layouts have the speaker one, in their own frame size
    expect(item.windows[0].rects).toHaveLength(16);
    expect(item.windows[1].rects.map((r) => r.variant)).toEqual(['16x9_spkL', '16x9_4K_spkL', '16x9_spkL_drift', '16x9_4K_spkL_drift', '16x9_spkR', '16x9_4K_spkR', '16x9_spkR_drift', '16x9_4K_spkR_drift']);
    expect(item.windows[1].rects[1]).toEqual({ variant: '16x9_4K_spkL', x: 100, y: 300, w: 1000, h: 1500 });
  });
});
