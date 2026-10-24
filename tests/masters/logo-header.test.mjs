// LOGO_Header «Шапка с логотипом»: its numbers from the webinars pack's «Логоблок с челкой» and its expressions run in
// Node on a stand-in comp (tests/helpers/master-expr.mjs): the hatching on M11 without a seam, its window with and
// without the descriptor on 16:9, 4K and 9:16, the library entry. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/webinars/logoblok_s_chelkoy.json');
const ink = () => ({ l: 0, w: 0 });
const rect = (c, t) => {
  const [w, h] = c.at('WINDOW', ['group', 'Window', 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at('WINDOW', ['group', 'Window', 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
};

describe.skipIf(!HAS_DUMPS)('LOGO_Header', async () => {
  const { resolve, libraryEntry } = await import('../../masters/LOGO_Header/resolve.mjs');
  const p = resolve();
  const L = p.layout;
  const comp = (w, h, ctrl = {}) => exprComp(p.spec, { w, h, ink, ctrl });

  it('takes the header from the logo block: the hatching, its window, the descriptor, the cube', () => {
    expect([L.hatch.base, L.hatch.step, L.hatch.width, L.hatch.y0, L.hatch.y1].map((v) => Math.round(v * 100) / 100)).toEqual([413.04, 18.08, 2.17, 46.58, 102.39]);
    expect(Object.values(L.hatch.window).map((v) => Math.round(v * 10) / 10)).toEqual([415.1, 40.9, 1629.1, 106.6]);
    expect(L.descriptor).toMatchObject({ font: 'SBSansDisplay-Semibold', tracking: -18, text: 'облачные \rи ИИ-сервисы' });
    expect([L.descriptor.size, L.descriptor.leading, L.descriptor.base].map((v) => Math.round(v * 100) / 100)).toEqual([28.64, 29.65, 67.74]);
    expect([L.margin.right, L.gap].map((v) => Math.round(v * 100) / 100)).toEqual([76.68, 22.24]);
    expect(L.logo.cube.x0).toBeCloseTo(80.03, 2);
    expect(p.duration).toEqual({ introSec: 0, holdSec: 10, outroSec: 0, maxSec: 900 });
  });

  it('the hatching runs half a line a second and has no seam: the lines at 2 s are where they were at 0', () => {
    const c = comp(1920, 1080);
    const x = (t) => c.at('HATCH', ['transform', 'ADBE Position'], t)[0];
    expect(x(0)).toBe(0);
    expect(x(1)).toBeCloseTo(L.hatch.step / 2, 6);
    expect(x(1.96)).toBeCloseTo(L.hatch.step * 0.98, 6);
    expect(x(2)).toBeCloseTo(0, 6);
    expect(x(899.5)).toBeCloseTo(L.hatch.step * 0.75, 6);
    // the lines cover the window wherever the layer is: one before its left edge, one past its widest right edge
    const lines = p.spec.layers.find((l) => l.name === 'HATCH').groups[0].paths.map((sp) => sp.vertices[0][0]);
    expect(Math.min(...lines)).toBeLessThan(L.hatch.window.x0 - L.hatch.step * 0.99);
    expect(Math.max(...lines)).toBeGreaterThan(p.fit.wRight.h.off);
  });

  it('the window runs from the logo to the descriptor, or to the right margin without it; 9:16 keeps the margins', () => {
    const on = rect(comp(1920, 1080), 1);
    expect([on.x0, on.x1].map((v) => Math.round(v * 10) / 10)).toEqual([415.1, 1629.1]);
    expect(rect(comp(1920, 1080, { Descriptor: 0 }), 1).x1).toBeCloseTo(1920 - L.margin.right, 6);
    expect(comp(1920, 1080, { Descriptor: 0 }).at('TXT_DESCRIPTOR', ['transform', 'ADBE Opacity'], 1)).toBe(0);
    const v = comp(1080, 1920);
    const desc = v.at('TXT_DESCRIPTOR', ['transform', 'ADBE Position'], 1);
    // the descriptor's ink ends at the same right margin; the window stops the same gap before it
    expect(desc[0] + L.descriptor.reach).toBeCloseTo(1080 - L.margin.right, 6);
    expect(L.descriptor.ink.x0 - L.descriptor.origin[0] + desc[0] - rect(v, 1).x1).toBeCloseTo(L.gap, 6);
    expect(rect(comp(1080, 1920, { Descriptor: 0 }), 1).x1).toBeCloseTo(1080 - L.margin.right, 6);
    // 4K: twice the place, the same lines scaled
    const k = comp(3840, 2160);
    expect(rect(k, 1).x0).toBeCloseTo(on.x0 * 2, 6);
    expect(k.at('HATCH', ['transform', 'ADBE Scale'], 1)).toEqual([200, 200]);
    expect(k.at('HATCH', ['transform', 'ADBE Position'], 1)[0]).toBeCloseTo(L.hatch.step, 6);
  });

  it('the panel\'s form, Essential Graphics and the library entry agree', () => {
    expect(p.spec.egpNames).toEqual(['Дескриптор']);
    const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
    expect(lib.items.find((i) => i.id === 'LOGO_Header')).toEqual(libraryEntry(p));
  });
});
