// SMM_FrameNotched «Рамка с вырезами»: the SMM pack's frame overlays as numbers (six dark rectangles of one design in
// two layouts), the frame at rest per format, the steps' drift on M10 through the pack's turning points, the files
// and the library entry; the master's expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs).
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = ['shape_layer_2_comp_1', 'shape_layer_5_comp_1'].every((f) => existsSync(`C:/CRBK/work/dumps/smm/${f}.json`));
const close = (v, d = 3) => (Array.isArray(v) ? v.map((x) => expect.closeTo(x, d)) : expect.closeTo(v, d));

describe.skipIf(!HAS_DUMPS)('SMM_FrameNotched', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve, libraryEntry, restBoxes, WAYPOINTS, COLOURS, FORMATS, PERIOD, DEFAULT_COLOUR } = await import('../../masters/SMM_FrameNotched/resolve.mjs');
  const p = resolve();
  const comp = (Colour = 2, w = 1080, h = 1920) => exprComp(p.spec, { w, h, ctrl: { Colour }, ink: () => ({ l: 0, w: 0, b: 0 }) });
  // a rectangle of the master in its comp's px at time t: the layer's transform applied to the rect's box
  const boxAt = (c, name, t) => {
    const [w, h] = c.at('FRAME', P.rectSize(name), t);
    const [x, y] = c.at('FRAME', P.rectPos(name), t);
    const pos = c.at('FRAME', P.pos, t);
    const sc = c.at('FRAME', P.scale, t).map((v) => v / 100);
    const rot = c.at('FRAME', ['transform', 'ADBE Rotate Z'], t);
    const A = p.spec.layers.find((l) => l.name === 'FRAME').anchor;
    const corner = (u, v) => {
      const dx = sc[0] * (u - A[0]);
      const dy = sc[1] * (v - A[1]);
      return rot === 90 ? [pos[0] - dy, pos[1] + dx] : [pos[0] + dx, pos[1] + dy];
    };
    const a = corner(x - w / 2, y - h / 2);
    const b = corner(x + w / 2, y + h / 2);
    return { l: Math.min(a[0], b[0]), r: Math.max(a[0], b[0]), t: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]) };
  };

  it('reads one design in the pack\'s two layouts: 9:16 squeezed 70 × 130 %, 1:1 the 1440 square', () => {
    const { tall, square } = p.layouts;
    expect(tall).toMatchObject({ pos: [493, 963], scale: [0.7, 1.3], fill: '#222222' });
    expect(square).toMatchObject({ pos: [669, 723], scale: [1, 1] });
    expect(tall.rects.map((x) => x.name)).toEqual(['Rectangle 6', 'Rectangle 5', 'Rectangle 4', 'Rectangle 3', 'Rectangle 2', 'Rectangle 1']);
    // at rest the frame runs along all four edges, thicker on the left; the step hangs from the top
    expect(p.edges['9x16']).toEqual({ left: close(87.95, 2), right: close(76.65, 2), top: close(88.97, 2), bottom: close(75.6, 2) });
  });

  it('draws the pack\'s frame at rest in 9:16 and 1:1, and the 9:16 one turned a quarter in 16:9', () => {
    const tall = Object.fromEntries(restBoxes(p.layouts.tall).map((b) => [b.name, b]));
    const sq = Object.fromEntries(restBoxes(p.layouts.square).map((b) => [b.name, b]));
    for (const name of Object.keys(tall)) {
      const b = boxAt(comp(2), name, 0);
      expect(b).toEqual({ l: close(tall[name].l), r: close(tall[name].r), t: close(tall[name].t), b: close(tall[name].b) });
      const s = boxAt(comp(2, 1080, 1080), name, 0);
      expect(s).toEqual({ l: close(sq[name].l * 0.75), r: close(sq[name].r * 0.75), t: close(sq[name].t * 0.75), b: close(sq[name].b * 0.75) });
      // turned clockwise about the middle: x' = 960 + (960 - y), y' = 540 + (x - 540)
      const w = boxAt(comp(2, 1920, 1080), name, 0);
      expect(w).toEqual({ l: close(1920 - tall[name].b), r: close(1920 - tall[name].t), t: close(tall[name].l), b: close(tall[name].r) });
    }
  });

  it('drifts the steps on M10: the pack\'s turning points 15 s apart, one axis a segment, back at rest in 60 s', () => {
    const c = comp(2);
    for (const [name, pts] of Object.entries(WAYPOINTS)) {
      for (let i = 0; i < pts.length; i += 1) expect(c.at('FRAME', P.rectPos(name), i * 15 % PERIOD)).toEqual(close(pts[i]));
    }
    // eased: slow off a waypoint, a third of the way at 7.5 s (0.775,0,0.667,1), and the loop closes without a seam
    const x = (t) => c.at('FRAME', P.rectPos('Rectangle 6'), t)[0];
    expect((x(7.5) - x(0)) / (x(15) - x(0))).toBeCloseTo(0.222, 2);
    expect(x(59.96)).toBeCloseTo(x(0), 1);
    expect(c.at('FRAME', P.rectPos('Rectangle 3'), 33)).toEqual(c.at('FRAME', P.rectPos('Rectangle 3'), 0));
  });

  it('«Цвет» fills the frame dark, green or white', () => {
    const fill = (i) => comp(i).at('FRAME', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], 0);
    expect([1, 2, 3].map(fill)).toEqual([[0.14902, 0.815686, 0.486275, 1], [0.133333, 0.133333, 0.133333, 1], [1, 1, 1, 1]]);
  });

  it('renders per format and colour the frame at rest and the 60 s drift loop', () => {
    expect(p.files).toHaveLength(FORMATS.length * COLOURS.length * 2);
    expect(p.files.slice(0, 2)).toEqual([
      { key: '9x16_green', variant: '9x16', ctrl: { Colour: 1 }, kind: 'still', t: 0, options: { colour: 1, drift: false } },
      { key: '9x16_green_drift', variant: '9x16', ctrl: { Colour: 1 }, kind: 'loop', seconds: 60, options: { colour: 1, drift: true } },
    ]);
  });

  it('library.src.json has the entry the files make: colour and drift pick the file', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'SMM_FrameNotched');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'smm', tier: 'T2', alpha: true, loop: { periodFrames: 1500 } });
    expect(item.fields.map((f) => [f.key, f.default])).toEqual([['colour', DEFAULT_COLOUR], ['drift', false]]);
    expect([...new Set(item.variants.map((v) => v.aspect))]).toEqual(['9x16', '1x1', '16x9']);
  });
});
