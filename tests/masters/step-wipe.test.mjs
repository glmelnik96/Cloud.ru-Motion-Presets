// TRN_StepWipe «Ступенчатая шторка»: the pack's «Переход» as numbers (the big rectangle and its five steps), where it
// shows and covers the frame of each format, the master's timeline with the cover held four frames for the cut, the
// files and the library entry; the master's expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs).
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/courses/perekhod.json');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe.skipIf(!HAS_DUMPS)('TRN_StepWipe', async () => {
  const { resolve, libraryEntry, loadSources, wipeModel, rectsAt, coverOf, COLOURS, FORMATS, HOLD } = await import('../../masters/TRN_StepWipe/resolve.mjs');
  const p = resolve();
  const comp = (Colour, w = 1920, h = 1080) => exprComp(p.spec, { w, h, ctrl: { Colour }, ink: () => ({ l: 0, w: 0, b: 0 }) });

  it('reads the pack\'s wipe: one rectangle crossing 4231 -> -2099 px in 2 s, five steps on it, all brand green', () => {
    const m = p.model;
    expect(m.parent.x).toMatchObject({ t0: 0, t1: 2, v0: 4231, v1: -2099 });
    expect(m.parent.scale).toBe(1.13);
    expect(m.steps).toHaveLength(5);
    expect(m.fill).toBe('#26D07C');
    // the big rectangle alone covers the frame at 1.00 s with room to spare
    const big = rectsAt(m, 1)[0];
    expect(big.l).toBeLessThan(-100);
    expect(big.r).toBeGreaterThan(2560);
    expect(() => wipeModel({ ...loadSources().wipe, layers: loadSources().wipe.layers.slice(1) })).toThrow(/not the pack/);
  });

  it('covers a window only when every point of it is under a rectangle, with a pixel to spare', () => {
    const win = { l: 0, r: 100, t: 0, b: 100 };
    expect(coverOf([{ l: -1, r: 101, t: -1, b: 101 }], win)).toEqual({ full: true, shows: true });
    expect(coverOf([{ l: 0, r: 100, t: 0, b: 100 }], win).full).toBe(false);
    // two halves that meet cover it; a gap between them does not
    expect(coverOf([{ l: -1, r: 50, t: -1, b: 101 }, { l: 50, r: 101, t: -1, b: 101 }], win).full).toBe(true);
    expect(coverOf([{ l: -1, r: 50, t: -1, b: 101 }, { l: 51, r: 101, t: -1, b: 101 }], win).full).toBe(false);
    expect(coverOf([{ l: 99.8, r: 200, t: 0, b: 100 }], win)).toEqual({ full: false, shows: false });
  });

  it('the pack shows the wipe on frames 4..42 and covers the frame on 25 only; the master holds that frame four times', () => {
    const t = p.timing;
    expect(t.per['16x9']).toMatchObject({ full: [25] });
    expect([t.per['16x9'].shown[0], t.per['16x9'].shown.at(-1)]).toEqual([4, 42]);
    expect(t.per['1x1'].full).toEqual([24, 25, 26]);
    expect(t).toMatchObject({ head: 4, tail: 42, extra: HOLD - 1, cutFrame: 21, frames: 42, durationSec: 1.68 });
    // four frames of full cover from the cut in 16:9 and the turned 9:16; the middle square of 1:1 a frame more each side
    expect(t.covered['16x9']).toEqual(range(21, 24));
    expect(t.covered['9x16']).toEqual(range(21, 24));
    expect(t.covered['1x1']).toEqual(range(20, 25));
    expect(p.comp).toMatchObject({ w: 1920, h: 1080, fps: 25, duration: 1.68 });
  });

  it('plays the pack from its first shown frame, stands on the full cover, then goes on', () => {
    const c = comp(1);
    const at = (f) => Math.round(c.at('WIPE', P.timeRemap, f / 25) * 25 * 1e6) / 1e6;
    expect([0, 20, 21, 22, 23, 24, 25, 41].map(at)).toEqual([4, 24, 25, 25, 25, 25, 26, 42]);
  });

  it('covers every format: 16:9 and 4K at the pack\'s proportion, 9:16 turned a quarter, 1:1 its middle', () => {
    const look = (w, h) => {
      const c = comp(1, w, h);
      return { pos: c.at('WIPE', P.pos, 0), rot: c.at('WIPE', ['transform', 'ADBE Rotate Z'], 0), scale: c.at('WIPE', P.scale, 0) };
    };
    expect(look(1920, 1080)).toEqual({ pos: [960, 540], rot: 0, scale: [75, 75] });
    expect(look(3840, 2160)).toEqual({ pos: [1920, 1080], rot: 0, scale: [150, 150] });
    expect(look(1080, 1920)).toEqual({ pos: [540, 960], rot: 90, scale: [75, 75] });
    expect(look(1080, 1080)).toEqual({ pos: [540, 540], rot: 0, scale: [75, 75] });
  });

  it('«Цвет» fills the wipe with the brand green, dark or white', () => {
    const fill = (i) => comp(i).at('WIPE', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], 0);
    expect(fill(1)).toEqual([0.14902, 0.815686, 0.486275, 1]);
    expect(fill(2)).toEqual([0.133333, 0.133333, 0.133333, 1]);
    expect(fill(3)).toEqual([1, 1, 1, 1]);
    expect(p.colours.map((c) => c.hex)).toEqual(['#26D07C', '#222222', '#FFFFFF']);
  });

  it('renders a whole clip per format and colour', () => {
    expect(p.files).toHaveLength(FORMATS.length * COLOURS.length);
    expect(p.files.map((f) => f.key).slice(0, 4)).toEqual(['16x9_green', '16x9_dark', '16x9_white', '16x9_4K_green']);
    expect(p.files.every((f) => f.kind === 'clip' && f.seconds === 1.68)).toBe(true);
    expect(p.files.find((f) => f.key === '9x16_white')).toMatchObject({ variant: '9x16', ctrl: { Colour: 3 }, options: { colour: 3 } });
  });

  it('library.src.json has the entry the files make: a transition cut on frame 21, the colour picks the file', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'TRN_StepWipe');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'transitions', tier: 'T2', cutFrame: 21, alpha: true });
    expect(item.fields[0].options.map((o) => o.label_ru)).toEqual(['Зелёный', 'Тёмный', 'Белый']);
    expect([...new Set(item.variants.map((v) => v.aspect))]).toEqual(['16x9', '9x16', '1x1']);
    expect(item.variants.find((v) => v.key === '16x9_4K_dark')).toMatchObject({ aspect: '16x9', w: 3840, h: 2160, options: { colour: 2 } });
  });
});
