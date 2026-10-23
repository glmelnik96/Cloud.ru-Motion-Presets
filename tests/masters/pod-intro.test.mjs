// POD_Intro «Интро подкаста»: the pack's intro read from its dump (everything on the 300 % null, the logo's flashes), the
// vertical copy of the comp from masters/POD_Intro/layout-9x16.json (the null left in place, the title scaled, the top
// hatch run on by a copy a period further, the arrows' flights and the contour's path as expressions run here), the
// master logo per format, the files and the library entry; and the measuring tool's fits on made-up data.
// The master resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { easedProgress } from '../../tools/masters/dump-keys.mjs';
import { goldenMs } from '../../tools/golden/video-frames.mjs';
import { fitFlight, fitScale, turnOf } from '../../masters/POD_Intro/measure-9x16.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = ['zastavka_podkast_cloud_ru', 'cloud_ru_blackcolour', 'lines_2_comp_1'].every((f) => existsSync(`C:/CRBK/work/dumps/podcast/${f}.json`));

// A decor expression run in Node: its last line is its value; createPath gives back its points.
const run = (src, time, value = [0, 0, 0]) => {
  const lines = src.split('\n');
  const body = [...lines.slice(0, -1), `return (${lines[lines.length - 1]});`].join('\n');
  return new Function('time', 'value', 'createPath', body)(time, value, (pts) => pts);
};

describe('POD_Intro measuring', () => {
  it('fits one scale and shift to boxes: the title plates', () => {
    const a = [{ x0: 229, y0: 492, x1: 3166, y1: 962 }, { x0: 595, y0: 1029, x1: 3615, y1: 1499 }];
    const s = 0.546;
    const b = a.map((q) => ({ x0: s * q.x0 + 31, y0: s * q.y0 + 1348, x1: s * q.x1 + 31, y1: s * q.y1 + 1348 }));
    const fit = fitScale(a, b);
    expect(fit.s).toBeCloseTo(0.546, 9);
    expect(fit.t[0]).toBeCloseTo(31, 6);
    expect(fit.residual).toBeLessThan(1e-6);
  });

  it('turns a 16:9 flight onto a vertical one: right to up -90°, down to up 180°', () => {
    expect([turnOf([1, 0], [0, -1]), turnOf([0, 1], [0, -1]), turnOf([1, 0], [1, 0]), turnOf([0, 1], [1, 0])]).toEqual([-90, 180, 0, -90]);
  });

  it('finds a flight from what was seen of it: times, influences and travel', () => {
    const c = { t0: 0.4, t1: 1.2, out: 70.732, in: 83.6, travel: 900 };
    const off = (t) => (t <= c.t0 ? c.travel : t >= c.t1 ? 0 : c.travel * (1 - easedProgress((t - c.t0) / (c.t1 - c.t0), c.out, c.in)));
    // seen from frame 14 on (it pops in), at rest from frame 30
    const obs = Array.from({ length: 40 }, (_, f) => (f >= 14 ? { f, seen: true, off: off(f / 25), edge: false } : { f, seen: false }));
    const fit = fitFlight(obs);
    expect(fit.rms).toBeLessThan(0.5);
    expect(fit.t1).toBeCloseTo(1.2, 5);
    // keyed: the source's keys given, only the travel fitted
    expect(fitFlight(obs, { t0: 0.4, t1: 1.2, out: 70.732, in: 83.6 }).travel).toBeCloseTo(900, 6);
  });

  it('takes the golden moments of a 7 s render as the pack\'s goldens have them', () => {
    expect(goldenMs(7)).toEqual([0, 240, 520, 760, 1000, 1240, 1520, 1760, 2000, 2240, 2520, 2760, 3000, 3240, 3520, 3760, 4000, 4240, 4520, 4760, 5000, 5240, 5520, 5760, 6000, 6240, 6520, 6760, 6960]);
  });
});

describe.skipIf(!HAS_DUMPS)('POD_Intro', async () => {
  const { resolve, libraryEntry, loadSources, introModel, hatchPeriod, LOGO_FRAMES, TALL } = await import('../../masters/POD_Intro/resolve.mjs');
  const sources = loadSources();
  const p = resolve(sources);
  const [wide, tall] = p.spec.transplant.comps;
  const setOf = (layer, path) => tall.set.find((s) => s.layer === layer && !s.comp && s.path.join('/') === path);
  const C9 = [TALL.w / 2, TALL.h / 2];
  const local = (q) => [(q[0] - C9[0]) / 3 + 50, (q[1] - C9[1]) / 3 + 50];

  it('reads the pack\'s intro: every element on the 300 % null at the middle, the logo flashing white, then dark from 1 s', () => {
    const m = introModel(sources.intro);
    expect(m.null16).toEqual({ pos: [1920, 1080], anchor: [50, 50], scale: 3 });
    expect(LOGO_FRAMES).toEqual({ flashes: [10, 12], from: 14, dark: 25 });
    expect(m.contour.keys.map((k) => k.t)).toEqual([0, 0.44]);
    expect([m.contour.keys[0].out, m.contour.keys[1].in].map((v) => +v.toFixed(3))).toEqual([79.268, 83.038]);
    expect(m.card.size).toEqual([11520, 6480]);
  });

  it('moves the 16:9 comp over whole but for its logo, its music and a switched-off still', () => {
    expect(wide.keep).toHaveLength(28);
    expect(wide.keep.map((k) => k.name)).not.toEqual(expect.arrayContaining(['Cloud.ru_BlackColour']));
    expect(wide.keep.some((k) => /\.wav$|^Still/.test(k.name))).toBe(false);
    expect(wide.size).toBeUndefined();
  });

  it('re-lays the comp out in 2160x3840: the null left where it was, the title scaled, the hatches turned', () => {
    expect(tall.size).toEqual([2160, 3840]);
    expect(setOf('scale', 'transform/ADBE Position')).toBeUndefined();
    expect(tall.keep.some((k) => /Стрелка_(3|5|4|7) /.test(k.name))).toBe(false);
    expect(setOf('ПОДКАСТ', 'transform/ADBE Scale').value).toEqual([54.6, 54.6, 100]);
    expect(setOf('GREEN_CUBE_1 Outlines', 'transform/ADBE Scale').expr).toBe('[value[0] * 0.546, value[1] * 0.546, value[2]]');
    expect(setOf('Pattern_1', 'transform/ADBE Scale').value).toEqual([150, 150, 100]);
    for (const h of ['LINES Comp 1', 'LINES 2 Comp 1', 'LINES 2 Comp 1 b']) expect(setOf(h, 'transform/ADBE Rotate Z').value).toBe(-90);
    // the hatch comps' own mattes made wide (the resized comp cut them short)
    expect(tall.set.filter((s) => s.comp).map((s) => [s.comp, s.layer, s.value])).toEqual([
      ['LINES 2 Comp 1', 'Background Outlines', [1000, 1000, 100]], ['LINES Comp 1', 'Background Outlines', [1000, 1000, 100]]]);
  });

  it('runs the top hatch on by a copy a period of its lines further, under the same window', () => {
    expect(hatchPeriod(sources.hatch)).toEqual({ period: 343, lines: 18 });
    expect(tall.copies.map((c) => c.name)).toEqual(['Стрелка_12 Outlines 3', 'Стрелка_2 Outlines 3', 'LINES 2 Comp 1 b']);
    const a = setOf('LINES 2 Comp 1', 'transform/ADBE Position').value;
    const b = setOf('LINES 2 Comp 1 b', 'transform/ADBE Position').value;
    expect([b[0] - a[0], b[1] - a[1]]).toEqual([0, 343]);
    const mask = (layer) => run(setOf(layer, 'mask/Mask 1/ADBE Mask Shape').expr, 0).map((v) => v[0]);
    expect(mask('LINES 2 Comp 1 b').map((x, i) => +(x - mask('LINES 2 Comp 1')[i]).toFixed(6))).toEqual([343, 343, 343, 343]);
  });

  it('flies each arrow to its rest on its curve, from its own frame, z 0', () => {
    for (const a of sources.layout.arrows) {
      const layer = a.copy || a.source;
      const src = setOf(layer, 'transform/ADBE Position').expr;
      const E = local(a.anchor9);
      const rest = run(src, 7);
      expect([rest[0], rest[1], rest[2]].map((v) => +v.toFixed(3))).toEqual([+E[0].toFixed(3), +E[1].toFixed(3), 0]);
      const start = run(src, a.flight.t0);
      expect(Math.hypot(start[0] - E[0], start[1] - E[1]) * 3).toBeCloseTo(a.flight.travel, 3);
      const span = tall.span.find((s) => s.layer === layer);
      expect(span.inPoint).toBeGreaterThanOrEqual(Math.min(a.inPoint, 1.04));
    }
    expect(setOf('Стрелка_2 Outlines', 'transform/ADBE Scale').value).toEqual([102.01, 102.01, 100]);
  });

  it('contracts the contour from its start to its rest on the pack\'s keys (0–0.44 s)', () => {
    const src = setOf('LINES', 'group/Shape 1/Path 1/ADBE Vector Shape').expr;
    const toComp = (v) => [C9[0] + 3 * (0.46 + 1.0012 * v[0]), C9[1] + 3 * (0.86 + v[1])];
    const end = run(src, 0.44).map(toComp);
    expect(end).toHaveLength(22);
    end.forEach((q, i) => {
      expect(q[0]).toBeCloseTo(sources.layout.contour.end[i][0], 1);
      expect(q[1]).toBeCloseTo(sources.layout.contour.end[i][1], 1);
    });
    const start = run(src, 0).map(toComp);
    expect(start[0][0]).toBeCloseTo(sources.layout.contour.start[0][0], 0);
  });

  it('draws the master logo where the pack\'s stands: white letters in the flashes, dark ones from 1 s, 70 % in 9:16', () => {
    const c = (w, h) => exprComp(p.spec, { w, h, ctrl: {}, ink: () => ({ l: 0, w: 0, b: 0 }) });
    const W = c(1920, 1080);
    expect([9, 10, 11, 12, 13, 14, 24, 25, 174].map((f) => W.at('LOGO', P.opacity, f / 25))).toEqual([0, 100, 0, 100, 0, 100, 100, 100, 100]);
    expect(W.at('LOGO', P.fill('Wordmark'), 0.6)).toEqual([1, 1, 1, 1]);
    expect(W.at('LOGO', P.fill('Wordmark'), 1).map((v) => +v.toFixed(4))).toEqual([0.1333, 0.1333, 0.1333, 1]);
    expect(W.at('LOGO', P.scale, 3)).toEqual([100, 100]);
    const T = c(1080, 1920);
    expect(T.at('LOGO', P.scale, 3).map((v) => +v.toFixed(3))).toEqual([112.903, 112.903]);
    expect([W.at('DECOR_16X9', P.opacity, 3), W.at('DECOR_9X16', P.opacity, 3), T.at('DECOR_16X9', P.opacity, 3), T.at('DECOR_9X16', P.opacity, 3)]).toEqual([100, 0, 0, 100]);
    expect([W.at('DECOR_16X9', P.scale, 3), T.at('DECOR_9X16', P.scale, 3)]).toEqual([[50, 50], [50, 50]]);
  });

  it('library.src.json has its entry: a 7 s clip on alpha per proportion', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'POD_Intro');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'podcast', tier: 'T2', alpha: true, duration: { holdSec: 7 } });
    expect([item.loop, item.cutFrame, item.fields]).toEqual([undefined, undefined, undefined]);
    expect(item.variants.map((v) => [v.key, v.w, v.h])).toEqual([['16x9', 1920, 1080], ['9x16', 1080, 1920]]);
    expect(src.items.map((i) => i.id).filter((id) => /^POD_(Intro|Outro)$/.test(id))).toEqual(['POD_Intro', 'POD_Outro']);
  });
});
