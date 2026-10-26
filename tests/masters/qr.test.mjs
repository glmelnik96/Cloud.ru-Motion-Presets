// POD_QR «QR-блок»: its numbers from the podcast pack and the canon, the vector default QR, and its expressions
// run in Node on a stand-in comp (tests/helpers/master-expr.mjs): the QRs, handles and the call of each layout at
// rest, the wipes, the fit of long handles, an empty call. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/qr_kod_3.json');
const QR = JSON.parse(readFileSync(new URL('../../masters/POD_QR/source-metrics.json', import.meta.url), 'utf8')).qr;
// texts: 30 px per character at their base size (FHD), no descenders
const ink = (layer, s) => (s ? { l: 2, w: s.length * 30, b: 0 } : { l: 0, w: 0, b: 0 });
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('POD_QR', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve, qrPlaceholder } = await import('../../masters/POD_QR/resolve.mjs');
  const p = resolve();
  const comp = (opts = {}) => exprComp(p.spec, { ink, ...opts });
  const L = p.layout;
  const lay = (key) => L.layouts.findIndex((l) => l.key === key) + 1;

  it('takes the window, the QRs, handles and the call from the pack, the wipes from canon M4', () => {
    expect(L.win).toEqual({ x0: 52.5, x1: 1867.5, y0: 51, y1: 1029 });
    expect(L.layouts.map((l) => l.label)).toEqual(['Слева', 'Справа', 'По центру', 'Два QR']);
    expect(L.layouts.map((l) => l.qrs.map((q) => [q.x0, q.y0, q.s].map((v) => Math.round(v))))).toEqual([
      [[53, 51, 512]], [[1355, 51, 512]], [[704, 51, 512]], [[181, 539, 256], [1483, 539, 256]],
    ]);
    expect(L.layouts.map((l) => l.handles.map((h) => h.side).join('') + l.call.side)).toEqual(['LL', 'RR', 'LR', 'LRR']);
    expect(L.handle.h).toBeCloseTo(41.39, 2);
    expect(L.handle.pad).toBeCloseTo(7.57, 2);
    expect([L.handle.size, Math.round(L.handle.sizeCentre * 10) / 10]).toEqual([50, 45.6]);
    expect(L.call).toMatchObject({ h: 66, size: 80.75, tracking: -28, text: 'ПОДПИСАТЬСЯ' });
    expect(L.call.pad).toBeCloseTo(9.13, 2);
    const t = p.timing;
    expect([t.qrIn.frames, t.handleIn.t0, t.callPlate.frames, t.callRise.frames, t.callClip.frames]).toEqual([29, 0.48, 19, 16, 7]);
    expect([t.callPlate.t0, t.callRise.t0, t.rise, Math.round(t.clipDrop * 100) / 100]).toEqual([0.2, 0.52, 72.25, 11]);
    expect([t.introEnd, t.outroStart, t.qrOut.t0]).toEqual([1.64, 6.8, 6.88]);
    expect(p.duration).toEqual({ introSec: 2.2, holdSec: 4.2, outroSec: 1.6 });
    expect(p.spec.egpNames).toEqual(['QR 1', 'Хэндл 1', 'QR 2', 'Хэндл 2', 'Призыв', 'Раскладка', 'Скорость']);
    expect(p.text.TXT_HANDLE1.value).toBe('@CLOUDRUPROVIDER');
    expect(p.ctrl.Layout.value).toBe(lay('centre'));
  });

  it('draws the default QR as vector modules that give back the pack\'s grid', () => {
    const qr = JSON.parse(JSON.stringify(p.spec.layers.find((l) => l.name === 'SLOT_QR1').placeholder));
    expect([qr.name, qr.w, qr.h]).toEqual(['CR_POD_QR_code', 1024, 1024]);
    const groups = qr.layers[0].groups;
    // the first group is drawn in front: the black modules over the white paper
    expect(groups.map((g) => [g.name, g.fill])).toEqual([['Modules', '#000000'], ['Paper', '#FFFFFF']]);
    // every module centre is dark exactly where the grid says
    const { grid, x0, module: m } = QR;
    const runs = groups[0].paths.map((sp) => [sp.vertices[0], sp.vertices[2]]);
    for (let j = 0; j < grid.length; j += 1) {
      for (let i = 0; i < grid.length; i += 1) {
        const cx = x0 + (i + 0.5) * m;
        const cy = x0 + (j + 0.5) * m;
        const dark = runs.some(([a, b]) => cx > a[0] && cx < b[0] && cy > a[1] && cy < b[1]);
        expect(dark ? '1' : '0').toBe(grid[j][i]);
      }
    }
    expect(qrPlaceholder({ size: 4, x0: 1, module: 1, grid: ['10', '11'] }).layers[0].groups[0].paths).toHaveLength(2);
    // both slots share the placeholder
    expect(p.spec.layers.find((l) => l.name === 'SLOT_QR2').placeholder.name).toBe('CR_POD_QR_code');
  });

  it('at rest: each layout puts its QRs, handles and call where the pack has them', () => {
    for (const l of L.layouts) {
      const c = comp({ ctrl: { Layout: lay(l.key) }, texts: { TXT_HANDLE1: '@HANDLE', TXT_HANDLE2: '@SECOND', TXT_CALL: 'ПОДПИСАТЬСЯ' } });
      l.qrs.forEach((q, n) => {
        const m = rectOf(c, `QM_${n + 1}`, 'Reveal', 4);
        expect([m.x0, m.y0, m.w, m.h]).toEqual([q.x0, q.y0, q.s, q.s].map((v) => expect.closeTo(v, 6)));
        expect(c.at(`SLOT_QR${n + 1}`, ['transform', 'ADBE Scale'], 4)[0]).toBeCloseTo((100 * q.s) / 1024, 6);
      });
      expect(c.at('SLOT_QR2', ['transform', 'ADBE Opacity'], 4)).toBe(l.key === 'two' ? 100 : 0);
      l.handles.forEach((h, n) => {
        const r = rectOf(c, `PL_H${n + 1}`, 'Plate', 4);
        if (h.full) expect([r.x0, r.w]).toEqual([h.x, h.full].map((v) => expect.closeTo(v, 6)));
        else expect(h.side === 'L' ? r.x0 : r.x1).toBeCloseTo(h.x, 6);
        expect(r.y0).toBeCloseTo(h.y0, 6);
        expect(r.h).toBeCloseTo(L.handle.h, 6);
      });
      if (l.key !== 'two') expect(rectOf(c, 'PL_H2', 'Plate', 4).w).toBe(0);
      const call = rectOf(c, 'PL_CALL', 'Plate', 4);
      expect(l.call.side === 'L' ? call.x0 : call.x1).toBeCloseTo(l.call.side === 'L' ? 52.5 : 1867.5, 6);
      expect([call.y0, call.y1]).toEqual([963, 1029].map((v) => expect.closeTo(v, 4)));
      expect(call.w).toBeCloseTo(11 * 30 + 2 * L.call.pad, 6);
    }
  });

  it('the 4K variant draws the FHD layout twice as large (the ink comes in its own pixels)', () => {
    for (const l of L.layouts) {
      const texts = { TXT_HANDLE1: '@HANDLE', TXT_HANDLE2: '@SECOND', TXT_CALL: 'ПОДПИСАТЬСЯ' };
      const fhd = comp({ ctrl: { Layout: lay(l.key) }, texts });
      const uhd = comp({ w: 3840, h: 2160, ctrl: { Layout: lay(l.key) }, texts });
      for (const [layer, group] of [['PL_H1', 'Plate'], ['PL_H2', 'Plate'], ['PL_CALL', 'Plate'], ['QM_1', 'Reveal'], ['CL_CALL', 'Clip']]) {
        const a = rectOf(fhd, layer, group, 4);
        const b = rectOf(uhd, layer, group, 4);
        expect([b.x0, b.y0, b.w, b.h]).toEqual([a.x0, a.y0, a.w, a.h].map((v) => expect.closeTo(2 * v, 6)));
      }
      expect(uhd.at('TXT_HANDLE1', ['transform', 'ADBE Position'], 4)[0]).toBeCloseTo(2 * fhd.at('TXT_HANDLE1', ['transform', 'ADBE Position'], 4)[0], 6);
      expect(uhd.at('TXT_HANDLE1', ['transform', 'ADBE Scale'], 4)[0]).toBeCloseTo(fhd.at('TXT_HANDLE1', ['transform', 'ADBE Scale'], 4)[0], 6);
    }
  });

  it('long handles shrink: two keep 40 px apart; in the centre the text fits the QR\'s width', () => {
    const long = '@' + 'X'.repeat(40);
    const two = comp({ ctrl: { Layout: lay('two') }, texts: { TXT_HANDLE1: long, TXT_HANDLE2: long } });
    const a = rectOf(two, 'PL_H1', 'Plate', 4);
    const b = rectOf(two, 'PL_H2', 'Plate', 4);
    expect(b.x0 - a.x1).toBeCloseTo(40, 6);
    const centre = comp({ ctrl: { Layout: lay('centre') }, texts: { TXT_HANDLE1: long } });
    const s = centre.at('TXT_HANDLE1', ['transform', 'ADBE Scale'], 4)[0] / 100;
    expect(41 * 30 * s + 2 * L.handle.pad).toBeCloseTo(512, 6);
    expect(rectOf(centre, 'PL_H1', 'Plate', 4).w).toBeCloseTo(512, 6);
    // a short handle in the centre: the layout's size, the plate still the QR's width
    const short = comp({ ctrl: { Layout: lay('centre') }, texts: { TXT_HANDLE1: '@CR' } });
    expect(short.at('TXT_HANDLE1', ['transform', 'ADBE Scale'], 4)[0]).toBeCloseTo((100 * L.handle.sizeCentre) / 50, 6);
  });

  it('wipes: QRs in from the top, out toward the layout\'s edge; handles from their anchor; no call when empty', () => {
    const left = comp({ ctrl: { Layout: lay('left') } });
    expect(rectOf(left, 'QM_1', 'Reveal', 0).h).toBe(0);
    const half = rectOf(left, 'QM_1', 'Reveal', 0.58);
    expect(half.y0).toBeCloseTo(51, 6);
    expect(half.h).toBeGreaterThan(0);
    expect(half.h).toBeLessThan(512);
    const out = rectOf(left, 'QM_1', 'Reveal', 7.5);
    expect([out.x0, out.h]).toEqual([52.5, 512].map((v) => expect.closeTo(v, 6)));
    expect(out.w).toBeLessThan(512);
    const right = rectOf(comp({ ctrl: { Layout: lay('right') } }), 'QM_1', 'Reveal', 7.5);
    expect(right.x1).toBeCloseTo(1867.5, 4);
    const two = rectOf(comp({ ctrl: { Layout: lay('two') } }), 'QM_1', 'Reveal', 7.5);
    expect(two.y1).toBeCloseTo(795, 6);
    expect(two.y0).toBeGreaterThan(539);
    const centre = rectOf(comp({ ctrl: { Layout: lay('centre') } }), 'QM_1', 'Reveal', 7.5);
    expect(centre.y0).toBeCloseTo(51.06, 2);
    expect(centre.h).toBeLessThan(512);
    // the handle of the left layout grows from the window edge
    const h = rectOf(left, 'PL_H1', 'Plate', 0.9);
    expect(h.x0).toBeCloseTo(52.5, 6);
    expect(h.w).toBeGreaterThan(0);
    expect(rectOf(comp({ texts: { TXT_CALL: '' } }), 'PL_CALL', 'Plate', 4).w).toBe(0);
    // the call's text comes up from 72.25 px under its plate
    expect(left.at('TXT_CALL', ['animator', 'Rise', 'ADBE Text Position 3D'], 0.4)[1]).toBeCloseTo(72.25, 6);
    expect(left.at('TXT_CALL', ['animator', 'Rise', 'ADBE Text Position 3D'], 4)[1]).toBeCloseTo(0, 6);
  });
});
