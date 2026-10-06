// Motion from the JSX dumps (tools/dump/motion.mjs, D19): segments of key pairs, the AE ease as a cubic-bezier,
// the kind of property, expressions, and the summary of repeating curves, on a synthetic dump root.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { change, extractMotion, propKind, summarize, toBezier, writeMotion } from '../../tools/dump/motion.mjs';

const easy = (speed = 0, influence = 33.333333) => [{ speed, influence }];
const key = (time, value, o = {}) => ({ time, value, inInterp: 'BEZIER', outInterp: 'BEZIER', inEase: easy(), outEase: easy(), ...o });

function comp(name, layers) {
  return { schema: 'crbk-dump/1', comp: { name, frameRate: 25, width: 1920, height: 1080, duration: 10 }, layers };
}

function root() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-motion-'));
  const write = (slug, comps) => {
    mkdirSync(path.join(dir, slug), { recursive: true });
    writeFileSync(path.join(dir, slug, 'index.json'), JSON.stringify({ comps: comps.map((c, i) => ({ file: `c${i}.json` })) }));
    comps.forEach((c, i) => writeFileSync(path.join(dir, slug, `c${i}.json`), JSON.stringify(c)));
  };
  const plate = { index: 1, name: 'Плашка', type: 'shape', switches: { enabled: true }, effects: [], masks: [], props: [
    { matchName: 'ADBE Transform Group', name: 'Transform', children: [
      { matchName: 'ADBE Scale', name: 'Scale', pvt: 'ThreeD', keys: [key(0, [0, 100, 100], { inEase: easy(0).concat(easy(0), easy(0)), outEase: easy(0).concat(easy(0), easy(0)) }), key(0.6, [100, 100, 100], { inEase: easy(0).concat(easy(0), easy(0)) })] },
      { matchName: 'ADBE Opacity', name: 'Opacity', pvt: 'OneD', keys: [key(0, 0, { outInterp: 'LINEAR' }), key(0.4, 100, { inInterp: 'LINEAR' })] },
      { matchName: 'ADBE Position', name: 'Position', pvt: 'TwoD_SPATIAL', keys: [key(1, [960, 600]), key(1.5, [960, 540], { inEase: easy(0, 75) })],
        expression: { text: 'wiggle(2, 5)', enabled: true } },
    ] },
  ] };
  const text = { index: 2, name: 'Имя', type: 'text', switches: { enabled: true }, masks: [], props: [
    { matchName: 'ADBE Text Properties', name: 'Text', children: [{ matchName: 'ADBE Text Animators', name: 'Animators', children: [{ matchName: 'ADBE Text Animator', name: 'A1', children: [
      { matchName: 'ADBE Text Selectors', name: 'Selectors', children: [{ matchName: 'ADBE Text Selector', name: 'Range', children: [
        { matchName: 'ADBE Text Percent Offset', name: 'Offset', pvt: 'OneD', keys: [key(0, -100), key(0.8, 0, { inEase: easy(500, 33.333333) })] },
      ] }] },
    ] }] }] },
  ], effects: [{ index: 1, matchName: 'ADBE Gaussian Blur 2', name: 'Gaussian Blur', enabled: true, params: [
    { matchName: 'ADBE Gaussian Blur 2-0001', name: 'Blurriness', pvt: 'OneD', keys: [key(0, 30), key(0.4, 0), key(0.8, 0, { outInterp: 'HOLD' }), key(1.2, 10)] },
  ] }] };
  const off = { index: 3, name: 'Скрытый', type: 'av', switches: { enabled: false }, effects: [], masks: [], props: [
    { matchName: 'ADBE Transform Group', name: 'Transform', children: [{ matchName: 'ADBE Opacity', name: 'Opacity', pvt: 'OneD', keys: [key(0, 0), key(1, 100)] }] },
  ] };
  write('titles', [comp('Подпись', [plate, text, off])]);
  write('podcast', [comp('Тег', [plate])]);
  write('fixture', [comp('skip', [plate])]);
  return dir;
}

describe('motion: curves', () => {
  it('turns the AE ease into a cubic-bezier: easy ease, linear, overshoot, hold', () => {
    expect(toBezier({ dur: 1, delta: 100, out: { speed: 0, influence: 33.333333 }, inn: { speed: 0, influence: 33.333333 }, outInterp: 'BEZIER', inInterp: 'BEZIER' })).toEqual({ x1: 0.333, y1: 0, x2: 0.667, y2: 1 });
    expect(toBezier({ dur: 1, delta: 100, outInterp: 'LINEAR', inInterp: 'LINEAR' })).toEqual({ x1: 0.333, y1: 0.333, x2: 0.667, y2: 0.667 });
    // arriving faster than the average speed: the curve overshoots
    expect(toBezier({ dur: 0.8, delta: 100, out: { speed: 0, influence: 33.333333 }, inn: { speed: 500, influence: 33.333333 }, outInterp: 'BEZIER', inInterp: 'BEZIER' }).y2).toBeLessThan(0);
    // a falling value: the sign of the speed follows the change
    expect(toBezier({ dur: 1, delta: -100, out: { speed: -100, influence: 50 }, inn: { speed: 0, influence: 50 }, outInterp: 'BEZIER', inInterp: 'BEZIER' })).toEqual({ x1: 0.5, y1: 0.5, x2: 0.5, y2: 1 });
    expect(toBezier({ dur: 1, delta: 5, outInterp: 'HOLD', inInterp: 'BEZIER' })).toEqual({ hold: true });
    expect(toBezier({ dur: 1, delta: 0, outInterp: 'BEZIER', inInterp: 'BEZIER' })).toBeNull();
  });

  it('measures the change of numbers, of the dimension that moves most, and along a spatial path', () => {
    expect(change(0, 100)).toMatchObject({ delta: 100, dim: 0 });
    expect(change([0, 100, 100], [100, 100, 100], 'ThreeD')).toMatchObject({ delta: 100, dim: 0 });
    expect(change([960, 600], [960, 540], 'TwoD_SPATIAL')).toMatchObject({ delta: 60, dim: 0 });
    expect(change('a', 'b')).toBeNull();
  });

  it('names the kind of a property', () => {
    expect(propKind('ADBE Scale', 'props')).toBe('scale');
    expect(propKind('ADBE Text Percent Offset', 'props')).toBe('text.selector');
    expect(propKind('ADBE Gaussian Blur 2-0001', 'effect', { matchName: 'ADBE Gaussian Blur 2' })).toBe('effect:ADBE Gaussian Blur 2');
    expect(propKind('ADBE Foo', 'props')).toBe('other:ADBE Foo');
  });
});

describe('motion: extraction', () => {
  it('reads every pack but the fixture, segment by segment, and the expressions', () => {
    const res = extractMotion(root());
    expect(res.packs.map((p) => [p.pack, p.truncatedKeys])).toEqual([['podcast', []], ['titles', []]]);
    const titles = res.segments.filter((s) => s.pack === 'titles');
    expect(titles.map((s) => [s.kind, s.frames])).toEqual([
      ['scale', 15], ['opacity', 10], ['position', 12.5], ['text.selector', 20],
      ['effect:ADBE Gaussian Blur 2', 10], ['effect:ADBE Gaussian Blur 2', 10], ['effect:ADBE Gaussian Blur 2', 10], ['opacity', 25],
    ]);
    const scale = titles[0];
    expect(scale).toMatchObject({ comp: 'Подпись', layer: 'Плашка', trail: 'Transform / Scale', bezier: { x1: 0.333, y1: 0, x2: 0.667, y2: 1 }, overshoot: false });
    expect(titles.find((s) => s.kind === 'text.selector')).toMatchObject({ overshoot: true, trail: 'Text / Animators / A1 / Selectors / Range / Offset' });
    expect(titles.find((s) => s.kind === 'position')).toMatchObject({ expression: true, ease: { inInfluence: 75 } });
    expect(titles.filter((s) => s.bezier?.hold)).toHaveLength(1);
    expect(titles.at(-1)).toMatchObject({ layer: 'Скрытый', off: true });
    expect(res.expressions).toEqual([
      expect.objectContaining({ pack: 'podcast', kind: 'position', patterns: ['wiggle'], text: 'wiggle(2, 5)' }),
      expect.objectContaining({ pack: 'titles', kind: 'position', patterns: ['wiggle'] }),
    ]);
  });

  it('summarizes kinds and repeating curves, without layers that are switched off', () => {
    const res = extractMotion(root());
    const s = summarize(res.segments);
    expect(s.scale).toMatchObject({ count: 2, packs: { podcast: 1, titles: 1 }, frames: { p50: 15 }, topCurves: [{ curve: '0.33,0.00,0.67,1.00', count: 2, packs: { podcast: 1, titles: 1 } }] });
    expect(s.opacity).toMatchObject({ count: 2, linear: 2 });
    expect(s['effect:ADBE Gaussian Blur 2']).toMatchObject({ count: 3, hold: 1 });
  });

  it('writes the segments gzipped, the expressions, the summary and a readable page', () => {
    const res = extractMotion(root());
    const out = mkdtempSync(path.join(os.tmpdir(), 'bk-motion-out-'));
    writeMotion(res, out);
    expect(JSON.parse(gunzipSync(readFileSync(path.join(out, 'segments.json.gz'))).toString())).toHaveLength(res.segments.length);
    expect(existsSync(path.join(out, 'expressions.json'))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(out, 'summary.json'), 'utf8')).kinds.scale.count).toBe(2);
    expect(readFileSync(path.join(out, 'summary.md'), 'utf8')).toContain('| 0.33,0.00,0.67,1.00 | 2 | podcast, titles |');
  });
});
