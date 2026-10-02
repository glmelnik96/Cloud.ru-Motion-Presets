import { describe, it, expect } from 'vitest';
import {
  applyPoint, bbox, compareOutlines, dropPlate, fingerprint, groupMatrix, multiply, normalize, pathData, samplePolyline, transformSubpath,
} from '../../tools/dump/geometry.mjs';

const poly = (pts, closed = true) => ({
  closed, vertices: pts, inTangents: pts.map(() => [0, 0]), outTangents: pts.map(() => [0, 0]),
});
const square = () => poly([[0, 0], [1, 0], [1, 1], [0, 1]]);
const K = 0.5522847498; // cubic Bezier circle constant
const circle = (r) => ({
  closed: true,
  vertices: [[r, 0], [0, r], [-r, 0], [0, -r]],
  inTangents: [[0, -K * r], [K * r, 0], [0, K * r], [-K * r, 0]],
  outTangents: [[0, K * r], [-K * r, 0], [0, -K * r], [K * r, 0]],
});

describe('geometry', () => {
  it('builds AE group transforms: position + rotation * scale * (p - anchor)', () => {
    const m = groupMatrix({ anchor: [10, 0], position: [100, 50], scale: [200, 100], rotation: 90 });
    const p = applyPoint(m, [11, 0]);
    expect(p[0]).toBeCloseTo(100, 9);
    expect(p[1]).toBeCloseTo(52, 9);
  });

  it('composes outer after inner', () => {
    const inner = groupMatrix({ position: [5, 0] });
    const outer = groupMatrix({ scale: [200, 200] });
    expect(applyPoint(multiply(outer, inner), [1, 1])).toEqual([12, 2]);
  });

  it('moves tangents with the linear part only', () => {
    const sp = transformSubpath({ closed: false, vertices: [[1, 1]], inTangents: [[2, 0]], outTangents: [[0, 3]] },
      groupMatrix({ position: [100, 100], scale: [50, 50] }));
    expect(sp).toEqual({ closed: false, vertices: [[100.5, 100.5]], inTangents: [[1, 0]], outTangents: [[0, 1.5]] });
  });

  it('samples Bezier outlines (a 4-arc circle stays on its radius)', () => {
    const pts = samplePolyline(circle(10), 16);
    expect(pts).toHaveLength(65);
    for (const [x, y] of pts) expect(Math.abs(Math.hypot(x, y) - 10)).toBeLessThan(0.005);
  });

  it('normalizes to the box origin and unit width', () => {
    const n = normalize([transformSubpath(square(), groupMatrix({ position: [500, 20], scale: [300, 150] }))]);
    const b = bbox(n.subpaths.flatMap((sp) => samplePolyline(sp)));
    expect(b.x0).toBeCloseTo(0, 12);
    expect(b.y0).toBeCloseTo(0, 12);
    expect(b.x1).toBeCloseTo(1, 12);
    expect(n.aspect).toBeCloseTo(0.5, 12);
  });

  it('measures zero for the same outline at another scale and place', () => {
    const a = normalize([square()]).subpaths;
    const b = normalize([transformSubpath(square(), groupMatrix({ position: [300, -40], scale: [250, 250] }))]).subpaths;
    expect(compareOutlines(a, b).max).toBeLessThan(1e-9);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('measures the Hausdorff distance between different outlines', () => {
    const a = normalize([square()]).subpaths;
    const b = normalize([poly([[0, 0], [1, 0], [1, 1.05], [0, 1.05]])]).subpaths;
    const d = compareOutlines(a, b);
    expect(d.max).toBeCloseTo(0.05, 6);
    expect(d.mean).toBeGreaterThan(0);
    expect(d.mean).toBeLessThan(d.max);
  });

  it('catches an extra contour', () => {
    const a = normalize([square()]).subpaths;
    const b = normalize([square(), poly([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]])]).subpaths;
    expect(compareOutlines(a, b).max).toBeCloseTo(0.4, 6);
  });

  it('fingerprints ignore subpath order', () => {
    const s1 = poly([[0, 0], [1, 0], [1, 1]]);
    const s2 = poly([[2, 2], [3, 2], [3, 3]]);
    expect(fingerprint([s1, s2])).toBe(fingerprint([s2, s1]));
    expect(fingerprint([s1, s2])).not.toBe(fingerprint([s1, poly([[2, 2], [3, 2], [3, 3.1]])]));
  });

  it('drops a plate: an axis-aligned rectangle around all other contours (AE 26.5 dumps, logo D18)', () => {
    const glyph = poly([[2, 2], [3, 2], [3, 4]]);
    const plate = poly([[0, 0], [10, 0], [10, 6], [0, 6]]);
    expect(dropPlate([plate, glyph])).toEqual({ subpaths: [glyph], dropped: true });
    const touching = poly([[2, 0.005], [3, 0.005], [3, 4]]); // ends 0.005 above the plate top: within 0.2 %
    expect(dropPlate([plate, touching]).dropped).toBe(true);
    const inner = poly([[2.5, 2.5], [2.8, 2.5], [2.8, 2.8], [2.5, 2.8]]);
    expect(dropPlate([glyph, inner]).dropped).toBe(false);
    expect(dropPlate([plate]).dropped).toBe(false);
    const tilted = poly([[0, 0], [10, 1], [10, 6], [0, 6]]);
    expect(dropPlate([tilted, glyph]).dropped).toBe(false);
  });

  it('writes SVG path data', () => {
    expect(pathData([poly([[0, 0], [1, 0], [1, 1]])], 10)).toBe('M0 0C0 0 10 0 10 0C10 0 10 10 10 10C10 10 0 0 0 0Z');
  });
});
