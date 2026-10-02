import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lintOrThrow } from '../../tools/host-run.mjs';

const src = readFileSync(new URL('../../spikes/lib/pr-helpers.jsx', import.meta.url), 'utf8');
const TPS = 254016000000;
const TPF = 10160640000; // 25 fps

// A minimal Premiere stand-in: Time keeps ticks and seconds in step, File gives a native path.
function Time() { this._t = 0; }
Object.defineProperty(Time.prototype, 'ticks', { get() { return String(this._t); }, set(v) { this._t = Number(v); } });
Object.defineProperty(Time.prototype, 'seconds', { get() { return this._t / TPS; }, set(v) { this._t = Math.round(v * TPS); } });
function File(p) { this.fsName = String(p).replace(/\//g, '\\'); }

function load(app = {}) {
  const ctx = vm.createContext({ Time, File, app, $: { sleep() {} } });
  vm.runInContext(src, ctx);
  return ctx;
}

const at = (sec) => { const t = new Time(); t.seconds = sec; return t; };
const track = (...ranges) => {
  const clips = { numItems: ranges.length };
  ranges.forEach(([s, e], i) => { clips[i] = { start: at(s), end: at(e), inPoint: at(0), outPoint: at(e - s), name: 'c' + i }; });
  return { clips };
};
const bin = (name, kids, type = 2) => {
  const children = { numItems: kids.length };
  kids.forEach((k, i) => { children[i] = k; });
  return { name, type, nodeId: 'n-' + name, children };
};
const clipItem = (name, media) => ({ name, type: 1, nodeId: 'n-' + name, getMediaPath: () => media });

describe('pr-helpers: time and values', () => {
  const h = load();

  it('converts seconds, ticks and frames at 25 fps', () => {
    expect(h.TICKS_PER_SECOND).toBe(TPS);
    expect(h.secToTicks(1)).toBe(TPS);
    expect(h.ticksToSec(127008000000)).toBe(0.5);
    expect(h.secToFrames(40.48, TPF)).toBe(1012);
    expect(h.framesToTicks(1, TPF)).toBe(TPF);
    expect(h.ticksToFrames('3048192000000', TPF)).toBe(300);
    expect(h.onFrameGrid(TPF * 7, TPF)).toBe(true);
    expect(h.onFrameGrid(TPF * 7 + 1, TPF)).toBe(false);
  });

  it('builds Time objects through ticks', () => {
    const t = h.makeTime(TPF * 25);
    expect(t.ticks).toBe(String(TPS));
    expect(t.seconds).toBe(1);
  });

  it('handles strings and paths without ES5 helpers', () => {
    expect(h.normPath('C:\\CRBK\\Work\\A.mp4')).toBe('c:/crbk/work/a.mp4');
    expect(h.sameFsPath('C:/CRBK/x.png', 'c:\\crbk\\X.PNG')).toBe(true);
    expect(h.strHas('abc', 'b')).toBe(true);
    expect(h.endsWith('x/CRT_pr_test.prproj', 'CRT_pr_test.prproj')).toBe(true);
    expect(h.endsWith('prproj', 'CRT_pr_test.prproj')).toBe(false);
    expect([h.truthy(1), h.truthy(true), h.truthy('true'), h.truthy(0), h.truthy(false)]).toEqual([true, true, true, false, false]);
    expect(h.describeValue([1, 2])).toEqual({ type: 'object', value: '[1,2]' });
    expect(h.describeValue(null)).toEqual({ type: 'null', value: null });
  });
});

describe('pr-helpers: tracks', () => {
  const h = load();

  it('finds free ranges, clips and the first free track', () => {
    const v2 = track([10, 20]);
    expect(h.trackFreeAt(v2, 0, 10)).toBe(true);
    expect(h.trackFreeAt(v2, 19, 21)).toBe(false);
    expect(h.trackFreeAt(v2, 20, 30)).toBe(true);
    expect(h.clipStartingAt(v2, 250, TPF).name).toBe('c0');
    expect(h.clipStartingAt(v2, 251, TPF)).toBe(null);
    const tracks = { numTracks: 3, 0: track([0, 30]), 1: v2, 2: track() };
    expect(h.firstFreeTrack(tracks, 1, 12, 15)).toBe(2);
    expect(h.firstFreeTrack(tracks, 1, 0, 5)).toBe(1);
    expect(h.firstFreeTrack(tracks, 0, 0, 40)).toBe(2);
    expect(h.trackItems(v2, TPF)[0]).toMatchObject({ name: 'c0', startF: 250, endF: 500, onGrid: true });
  });

  it('reports track occupancy by track label', () => {
    const seq = { timebase: String(TPF), videoTracks: { numTracks: 2, 0: track([0, 30]), 1: track([10, 20]) }, audioTracks: { numTracks: 1, 0: track() } };
    const o = h.occupancy(seq);
    expect(o.video.map((t) => [t.track, t.items.map((c) => [c.startF, c.endF])])).toEqual([['V1', [[0, 750]]], ['V2', [[250, 500]]]]);
    expect(o.audio).toEqual([{ track: 'A1', items: [] }]);
  });

  it('trims through outPoint first, then end', () => {
    const order = [];
    const clip = {
      start: at(40), inPoint: at(3600),
      set outPoint(v) { order.push(['out', Number(v.ticks)]); },
      set end(v) { order.push(['end', Number(v.ticks)]); },
    };
    h.trimClip(clip, 375, TPF);
    expect(order).toEqual([['out', (3600 * 25 + 375) * TPF], ['end', (40 * 25 + 375) * TPF]]);
  });
});

describe('pr-helpers: project and MOGRT values', () => {
  it('walks bins, finds items by name and by media path', () => {
    const root = bin('root', [
      bin('CRT_Media', [clipItem('bars.mp4', 'C:\\CRBK\\work\\fixtures\\media\\bars.mp4')]),
      clipItem('loose.png', 'C:\\x\\loose.png'),
    ], 3);
    const h = load({ project: { rootItem: root, path: 'C:\\CRBK\\work\\pr\\CRT_pr_test.prproj' } });
    expect(h.projectIs('CRT_pr_test.prproj')).toBe(true);
    expect(h.projectIs('other.prproj')).toBe(false);
    expect(h.findItemByName('bars.mp4').nodeId).toBe('n-bars.mp4');
    expect(h.findItemByPath('C:/CRBK/work/fixtures/media/BARS.mp4').name).toBe('bars.mp4');
    expect(h.findItemByPath('C:/CRBK/work/none.mp4')).toBe(null);
    expect(h.projectTree().map((t) => t.path).sort()).toEqual(['/CRT_Media', '/CRT_Media/bars.mp4', '/loose.png']);
  });

  it('writes MOGRT text as JSON with one style run and reads it back', () => {
    const h = load();
    const param = {
      v: JSON.stringify({ textEditValue: 'Имя Фамилия', fontEditValue: ['SBSansDisplay-Semibold'], fontTextRunLength: [11] }),
      getValue() { return this.v; },
      setValue(v, ui) { this.v = v; this.ui = ui; return 0; },
    };
    const r = h.setMgtText(param, 'Анна-Мария Ёлкина');
    expect(r.runsBefore).toBe(1);
    expect(param.ui).toBe(1);
    expect(JSON.parse(param.v)).toEqual({ textEditValue: 'Анна-Мария Ёлкина', fontEditValue: ['SBSansDisplay-Semibold'], fontTextRunLength: [17] });
    expect(h.readMgtText(param)).toBe('Анна-Мария Ёлкина');
    expect(() => h.setMgtText({ getValue: () => '{"a":1}' }, 'x')).toThrow(/BK_NOT_AE_TEXT/);
    expect(h.readMgtText({ getValue: () => 'garbage' })).toBe(null);
  });

  it('matches a QE clip by name and start, skipping gaps', () => {
    const h = load();
    const items = [{ type: 'Empty', name: '' }, { type: 'Clip', name: 'slot_b.png', start: { secs: '10' } }, { type: 'Clip', name: 'slot_b.png', start: { secs: '40' } }];
    const qt = { numItems: items.length, getItemAt: (i) => items[i] };
    expect(h.qeItemFor(qt, 'slot_b.png', 40)).toBe(items[2]);
    expect(h.qeItemFor(qt, 'slot_b.png', 41)).toBe(null);
    expect(h.qeItemFor(qt, 'other', 10)).toBe(null);
  });
});

describe('pr-helpers: ES3', () => {
  it('passes the ES3 lint with no warning beyond the library tail', () => {
    expect(lintOrThrow(src)).toEqual([]);
  });
});
