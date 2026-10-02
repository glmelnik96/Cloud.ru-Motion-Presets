import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layerToCompAt, restValueAt, shapeBoxAt, textBaselineAt } from '../../tools/masters/dump-geometry.mjs';

const k = (time, value) => ({ time, value, inInterp: 'BEZIER', outInterp: 'BEZIER' });
const tr = (vals) => ({
  matchName: 'ADBE Transform Group', children: Object.entries(vals).map(([matchName, v]) =>
    (Array.isArray(v) && v.length && v[0].time !== undefined ? { matchName, name: matchName, keys: v } : { matchName, name: matchName, value: v })),
});
const rectGroup = (size, pos) => ({
  matchName: 'ADBE Root Vectors Group', children: [{
    matchName: 'ADBE Vector Group', children: [
      { matchName: 'ADBE Vectors Group', children: [{ matchName: 'ADBE Vector Shape - Rect', children: [
        { matchName: 'ADBE Vector Rect Size', value: size }, { matchName: 'ADBE Vector Rect Position', value: pos },
      ] }] },
      { matchName: 'ADBE Vector Transform Group', children: [{ matchName: 'ADBE Vector Position', value: [0, 0] }] },
    ],
  }],
});

const dump = {
  comp: { name: 'C' },
  layers: [
    { index: 1, name: 'Plate', parent: null, props: [rectGroup([100, 40], [0, 0]),
      tr({ 'ADBE Anchor Point': [0, 0, 0], 'ADBE Position': [k(0, [500, 300, 0]), k(1, [200, 300, 0]), k(3, [200, 300, 0])], 'ADBE Scale': [100, 100, 100] })] },
    { index: 2, name: 'Child', parent: 1, props: [rectGroup([10, 10], [5, 5]),
      tr({ 'ADBE Anchor Point': [0, 0, 0], 'ADBE Position': [20, 0, 0], 'ADBE Scale': [200, 200, 100] })] },
    { index: 3, name: 'Text', parent: null, props: [
      { matchName: 'ADBE Text Properties', children: [{ matchName: 'ADBE Text Document', value: { text: 'x', fontSize: 100, baselineShift: 8, font: 'F' } }] },
      tr({ 'ADBE Anchor Point': [0, 0, 0], 'ADBE Position': [300, 60, 0], 'ADBE Scale': [40, 40, 100] })] },
  ],
};

describe('dump-geometry', () => {
  it('reads values only where they rest', () => {
    const pos = dump.layers[0].props[1].children[1];
    expect(restValueAt(pos, 2)).toEqual([200, 300, 0]);       // a hold between equal keys
    expect(restValueAt(pos, 5)).toEqual([200, 300, 0]);       // after the last key
    expect(() => restValueAt(pos, 0.5)).toThrow(/not at rest/);
  });

  it('composes parent transforms and shape groups', () => {
    const m = layerToCompAt(dump, dump.layers[1], 2);
    expect([m[0], m[4], m[5]]).toEqual([2, 220, 300]);
    expect(shapeBoxAt(dump, dump.layers[0], 2)).toMatchObject({ x0: 150, x1: 250, y0: 280, y1: 320 });
    expect(shapeBoxAt(dump, dump.layers[1], 2)).toMatchObject({ x0: 220, x1: 240, y0: 300, y1: 320 });
  });

  it('places the text baseline after baselineShift', () => {
    const b = textBaselineAt(dump, dump.layers[2], 0);
    expect(b.origin).toEqual([300, 60]);
    expect(b.baseline).toBeCloseTo(60 - 8 * 0.4, 9);
    expect(b.fontPx).toBeCloseTo(40, 9);
  });
});

const DUMPS = 'C:/CRBK/work/dumps/logo/umnoe_oblako.json';
describe.skipIf(!existsSync(DUMPS))('LOGO_Shot layout from the pack dump', () => {
  it('reproduces the measured lockup: plate 279x80, 1 px gap, master logo at 2/3, caption baseline', async () => {
    const { loadSources, layoutFrom, lockupPaths } = await import('../../masters/LOGO_Shot/resolve.mjs');
    const src = loadSources();
    const L = layoutFrom(src.canon);
    expect(L.plate).toEqual({ w: 279, h: 80 });
    expect(L.gap).toBeCloseTo(1, 6);
    expect(L.lockup.x0).toBeCloseTo(26, 3);
    expect(L.lockup.y0).toBeCloseTo(19, 3);
    expect(L.caption.dy).toBeCloseTo(14.173, 3);
    const lock = lockupPaths(src.svg, L);
    expect(lock.scale).toBeCloseTo(2 / 3, 4);
    expect(Math.abs(lock.drift.cube[0]) + Math.abs(lock.drift.cube[1])).toBeLessThan(0.01);
    expect(Math.abs(lock.drift.wordmark[0]) + Math.abs(lock.drift.wordmark[1])).toBeLessThan(0.01);
  });
});
