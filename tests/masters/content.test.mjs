// POD_Content «Окно контента»: its numbers from the podcast pack and the canon, and its expressions run in Node
// on a stand-in comp (tests/helpers/master-expr.mjs): the window of each side and its wipe from the top, the
// end of the clip set by «Длительность» (trim), the media whole or filling the window, the caption under it.
// Resolves from the dumps: the build machine only.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/kontent_3.json');
// caption lines: 30 px per character at size 50 (FHD), no descenders
const ink = (layer, s) => (s ? { l: 2, w: s.length * 30, b: 0 } : { l: 0, w: 0, b: 0 });
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('POD_Content', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve } = await import('../../masters/POD_Content/resolve.mjs');
  const p = resolve();
  const comp = (opts = {}) => exprComp(p.spec, { ink, ...opts });

  it('takes the windows and the caption from the pack, the wipe from canon M4, and is trim', () => {
    const L = p.layout;
    expect([L.side.w, L.side.h].map((v) => Math.round(v * 100) / 100)).toEqual([731.11, 720.69]);
    expect(L.mid.w).toBeCloseTo(691.55, 2);
    expect(L.mid.cx).toBe(960);
    expect(L.captionGap).toBeCloseTo(50.75, 2);
    expect(L.fill).toBe('#D3D3D3');
    const t = p.timing;
    expect([t.window.in.frames, t.window.out.frames, t.window.out.t0]).toEqual([29, 28, 8.88]);
    expect(t.window.in.bezier).toEqual([0.67, 0, 0.11, 1]);
    expect([t.caption.start, t.caption.textLag, t.caption.plateLag]).toEqual([0.16, 0.2, 0.08]);
    expect([t.introEnd, t.outroStart]).toEqual([1.96, 8.76]);
    expect(p.duration).toEqual({ introSec: 2.64, holdSec: 5.68, outroSec: 1.68, maxSec: 300 });
    expect(p.comp.duration).toBe(300);
    expect(p.markers).toEqual([]);
    expect(p.spec.egpNames).toEqual(['Медиа', 'Подпись, строка 1', 'Подпись, строка 2', 'Подпись, строка 3', 'Сторона', 'Медиа в окне', 'Скорость', 'Длительность (служебное, не менять)']);
  });

  it('the window of each side at rest, and its wipe from the top edge', () => {
    const L = p.layout;
    const left = rectOf(comp({ ctrl: { Side: 1 } }), 'PANEL', 'Panel', 4);
    expect([left.x0, left.y0, left.w, left.h].map((v) => Math.round(v * 100) / 100)).toEqual([52.5, 51, 731.11, 720.69]);
    expect(rectOf(comp({ ctrl: { Side: 2 } }), 'PANEL', 'Panel', 4).x1).toBeCloseTo(1867.5, 6);
    const mid = rectOf(comp({ ctrl: { Side: 3 } }), 'PANEL', 'Panel', 4);
    expect((mid.x0 + mid.x1) / 2).toBeCloseTo(960, 6);
    expect(mid.h).toBeCloseTo(L.mid.h, 6);
    const c = comp();
    expect(rectOf(c, 'PANEL', 'Panel', 0).h).toBe(0);
    const half = rectOf(c, 'PANEL', 'Panel', 0.58);
    expect(half.y0).toBeCloseTo(51, 6);
    expect(half.h).toBeGreaterThan(0);
    expect(half.h).toBeLessThan(L.side.h);
  });

  it('trim: the clip ends where «Длительность» says, the exit plays there at the chosen speed', () => {
    const h = (c, t) => rectOf(c, 'PANEL', 'Panel', t).h;
    const ten = comp({ ctrl: { Duration: 10 } });
    expect(h(ten, 8)).toBeCloseTo(p.layout.side.h, 6);
    expect(h(ten, 9.98)).toBeLessThan(5);
    const twenty = comp({ ctrl: { Duration: 20 } });
    expect(h(twenty, 15)).toBeCloseTo(p.layout.side.h, 6);
    expect(h(twenty, 19.98)).toBeLessThan(5);
    // at 2× the window is open at 0.58 s and closes in the last 0.56 s
    const fast = comp({ ctrl: { Duration: 20, Speed: 5 } });
    expect(h(fast, 0.58)).toBeCloseTo(p.layout.side.h, 6);
    expect(h(fast, 19.3)).toBeCloseTo(p.layout.side.h, 6);
    expect(h(fast, 19.99)).toBeLessThan(5);
  });

  it('the media: at the window centre, whole or filling the window', () => {
    const L = p.layout;
    const whole = comp({ ctrl: { Side: 1, Fill: 1 } });
    const [x, y] = whole.at('SLOT_MEDIA', ['transform', 'ADBE Position'], 4);
    expect([x, y]).toEqual([52.5 + L.side.w / 2, 51 + L.side.h / 2].map((v) => expect.closeTo(v, 6)));
    expect(whole.at('SLOT_MEDIA', ['transform', 'ADBE Scale'], 4)[0]).toBeCloseTo((100 * L.side.w) / 3840, 6);
    expect(comp({ ctrl: { Side: 1, Fill: 2 } }).at('SLOT_MEDIA', ['transform', 'ADBE Scale'], 4)[0]).toBeCloseTo((100 * L.side.h) / 2160, 6);
  });

  it('the caption: centred under the window of any side, its first plate captionGap under it; none when empty', () => {
    const L = p.layout;
    for (const [side, cx, bottom] of [[1, 52.5 + L.side.w / 2, 51 + L.side.h], [2, 1867.5 - L.side.w / 2, 51 + L.side.h], [3, 960, 51 + L.mid.h]]) {
      const c = comp({ ctrl: { Side: side }, texts: p.pack });
      const r = rectOf(c, 'PL_1', 'Plate', 4);
      expect((r.x0 + r.x1) / 2).toBeCloseTo(cx, 6);
      expect(r.y0).toBeCloseTo(bottom + L.captionGap, 6);
    }
    expect(rectOf(comp(), 'PL_1', 'Plate', 4).w).toBe(0);
  });
});
