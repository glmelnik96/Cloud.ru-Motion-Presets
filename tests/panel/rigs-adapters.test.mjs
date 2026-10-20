// applyRig of the After Effects adapter (panel/host/ae-rigs.jsx) on the fake of tests/panel/fake-ae-rig.js, with the
// operations of the core (panel/src/core/rigs.ts), and the chain core -> bridge -> adapter.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { brandRigs, planRig, runRig } from '../../panel/src/core/rigs.ts';

const FAKE = readFileSync(new URL('./fake-ae-rig.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const ctx = (w = 1920, h = 1080) => ({ host: 'ae', version: '26.5', project: { saved: true, path: null }, target: { kind: 'comp', id: '7', name: 'Main', w, h, fps: 25, timeSec: 2, durationSec: 30 } });
const reqOf = (key, w, h) => planRig(ctx(w, h), brandRigs().find((r) => r.key === key)).request;

// A comp at time 2 with these layers (top first) and the host bundle.
function ae(layers, comp = {}) {
  const c = vm.createContext({});
  vm.runInContext(FAKE, c);
  vm.runInContext(BUNDLE, c);
  const run = (code) => vm.runInContext(code, c);
  run(`__ae.comp(${JSON.stringify({ time: 2, ...comp })}, ${JSON.stringify(layers)})`);
  const call = (fn, args) => JSON.parse(run(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`));
  const node = (layer, ...path) => JSON.parse(run(`JSON.stringify(__ae.node(${JSON.stringify(layer)}, ${JSON.stringify(path)}))`));
  const keys = (layer, ...path) => node(layer, ...path).keys;
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  return { run, call, node, keys, bridge };
}

const T = ['ADBE Transform Group'];
const near = (a, b) => Math.abs(a - b) < 1e-6;

describe('applyRig: keys on transform properties', () => {
  it('M1: Scale X from 0 to the plate as it is, the eases of the canon; Y and Z kept; one undo group', () => {
    const h = ae([{ name: 'Plate', type: 'shape', selected: true, scale: [80, 50] }]);
    const r = h.call('applyRig', reqOf('M1.titles.in'));
    expect(r.data.layers).toEqual([{ name: 'Plate', done: true, keys: 2 }]);
    const k = h.keys('Plate', ...T, 'ADBE Scale');
    expect(k.map((x) => [x.t, x.v])).toEqual([[2, [0, 50, 100]], [2.8, [80, 50, 100]]]);
    expect(k[0].outE).toEqual([{ speed: 0, influence: 33.3 }, { speed: 0, influence: 33.3 }, { speed: 0, influence: 33.3 }]);
    expect(k[1].inE.map((e) => e.influence)).toEqual([100, 100, 100]);
    expect(k[0].outI).toBe(6613);
    expect(h.run('JSON.stringify([__ae.undo, __ae.suppress])')).toBe(JSON.stringify([['begin BrandKit: Плашка по X (M1): титры, вход', 'end'], 0]));
  });

  it('several layers go top first by the stagger of the style, whatever order they were selected in', () => {
    const h = ae([{ name: 'Top', type: 'shape', selected: true }, { name: 'Bottom', type: 'shape', selected: true }], { selectOrder: ['Bottom', 'Top'] });
    const r = h.call('applyRig', reqOf('M1.smm.in'));
    expect(r.data.layers.map((l) => l.name)).toEqual(['Top', 'Bottom']);
    expect(h.keys('Top', ...T, 'ADBE Scale')[0].t).toBe(2);
    expect(near(h.keys('Bottom', ...T, 'ADBE Scale')[0].t, 2.4)).toBe(true);
  });

  it('M6: a 2D layer is made 3D first; Rotation X ends at its own rotation, the speeds of the pack as they are', () => {
    const h = ae([{ name: 'Logo', type: 'solid', selected: true }]);
    const r = h.call('applyRig', reqOf('M6.in'));
    expect(r.data.layers[0]).toMatchObject({ done: true, made3D: true, keys: 3 });
    const k = h.keys('Logo', ...T, 'ADBE Rotate X');
    expect(k.map((x) => [x.t, x.v])).toEqual([[2, -90], [2.667, -3.612], [3.267, 0]]);
    expect(k[0].outE).toEqual([{ speed: 11930.136, influence: 0.541 }]);
    expect(k[1].inE).toEqual([{ speed: 28.415, influence: 34.504 }]);
    expect(k[1].outE).toEqual([{ speed: 27.418, influence: 19.152 }]);
  });

  it('M8: Z from the layer\'s own position, the stroke of a shape thins to its own width; a text layer gets Z only', () => {
    const h = ae([{ name: 'Frame', type: 'shape', selected: true, threeD: true, strokes: [4, 6] }, { name: 'Title', type: 'text', selected: true }]);
    const r = h.call('applyRig', reqOf('M8.in'));
    expect(r.data.layers.map((l) => [l.name, l.done, l.made3D ?? false])).toEqual([['Frame', true, false], ['Title', true, true]]);
    expect(h.keys('Frame', ...T, 'ADBE Position').map((x) => x.v)).toEqual([[960, 540, -645], [960, 540, 0]]);
    const widths = (g) => h.keys('Frame', 'ADBE Root Vectors Group', g, 'ADBE Vectors Group', 'ADBE Vector Graphic - Stroke', 'ADBE Vector Stroke Width').map((x) => x.v);
    expect(widths('Group 1')).toEqual([48, 4]);
    expect(widths('Group 2')).toEqual([50, 6]);
    expect(h.keys('Title', ...T, 'ADBE Position').map((x) => x.v)).toEqual([[960, 540, -645], [960, 540, 0]]);
  });

  it('M10: a loop with loopOut(), straight in space; neighbours get the drawings in turn; separated dimensions keyed apart', () => {
    const h = ae([{ name: 'A', type: 'shape', selected: true, position: [100, 200] }, { name: 'B', type: 'shape', selected: true, separated: true, position: [300, 400] }]);
    h.call('applyRig', reqOf('M10.a60'));
    const a = h.node('A', ...T, 'ADBE Position');
    expect(a.keys.map((x) => [x.t, x.v])).toEqual([[2, [100, 200, 0]], [17, [40, 200, 0]], [32, [40, 215, 0]], [47, [40, 185, 0]], [62, [100, 200, 0]]]);
    expect(a.expression).toBe('loopOut()');
    expect(a.keys.every((x) => x.auto === false && JSON.stringify(x.tangents) === JSON.stringify([[0, 0, 0], [0, 0, 0]]))).toBe(true);
    expect(a.keys[0].outE).toEqual([{ speed: 0, influence: 77.5 }]);
    // B: the second drawing (20, -36 … in steps of 80 px), on X Position and Y Position
    expect(h.keys('B', ...T, 'ADBE Position_0').map((x) => x.v)).toEqual([300, 315, 360, 360, 300]);
    expect(h.keys('B', ...T, 'ADBE Position_1').map((x) => x.v)).toEqual([400, 373, 373, 392.5, 400]);
    expect(h.node('B', ...T, 'ADBE Position_1').expression).toBe('loopOut()');
    expect(h.keys('B', ...T, 'ADBE Position')).toEqual([]);
  });

  it('M12: Scale and X from the layer\'s own, speeds scaled with them and positive along the path; Opacity up to its own', () => {
    const h = ae([{ name: 'Cube', type: 'shape', selected: true, scale: [189, 189], position: [960, 540], opacity: 80 }]);
    h.call('applyRig', reqOf('M12.in'));
    const s = h.keys('Cube', ...T, 'ADBE Scale');
    expect(s.map((x) => x.v[0])).toEqual([250.0092, 350.0091, 220.6197, 189].map((v) => expect.closeTo(v, 4)));
    expect(s[2].inE[0].speed).toBeCloseTo(-1.07371 * 189, 6);
    expect(s[2].inE[2].speed).toBeCloseTo(-1.07371 * 100, 6);
    const p = h.keys('Cube', ...T, 'ADBE Position');
    expect(p.map((x) => x.v)).toEqual([[1156.641, 540, 0], [1237.065, 540, 0], [1014.422, 540, 0], [960, 540, 0]]);
    expect(p[2].inE).toEqual([{ speed: 349.226, influence: 25.673 }]);
    expect(h.keys('Cube', ...T, 'ADBE Opacity').map((x) => x.v)).toEqual([0, 80]);
  });
});

describe('applyRig: text, masks, mattes, expressions', () => {
  const RECT = { top: -40, left: 0, width: 300, height: 50 };

  it('M2: an animator rising by 1.15 of the block, by words, Start 0 -> 100; the exit keys the same animator; a shape is skipped', () => {
    const h = ae([{ name: 'Title', type: 'text', selected: true, rect: RECT }, { name: 'Plate', type: 'shape', selected: true }]);
    const r = h.call('applyRig', reqOf('M2.podcast.in'));
    expect(r.data.layers).toEqual([{ name: 'Title', done: true, keys: 2 }, { name: 'Plate', done: false, skipped: 'text', keys: 0 }]);
    const A = ['ADBE Text Properties', 'ADBE Text Animators', 'BrandKit M2'];
    expect(h.node('Title', ...A, 'ADBE Text Animator Properties', 'ADBE Text Position 3D').value).toEqual([0, 57.5, 0]);
    expect(h.node('Title', ...A, 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Range Advanced', 'ADBE Text Range Type2').value).toBe(3);
    const start = () => h.keys('Title', ...A, 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Percent Start');
    expect(start().map((k) => [k.t, k.v])).toEqual([[2, 0], [2.92, 100]]);
    expect(start()[0].outE).toEqual([{ speed: 0, influence: 41 }]);
    h.run('app.project.activeItem.time = 5');
    h.call('applyRig', reqOf('M2.podcast.out'));
    expect(h.node('Title', 'ADBE Text Properties', 'ADBE Text Animators').children).toHaveLength(1);
    expect(start().map((k) => [k.t, k.v])).toEqual([[2, 0], [2.92, 100], [5, 100], [5.72, 0]]);
  });

  it('M2 lines of courses: the delays of the canon for the first three, then on by the last step', () => {
    const lines = ['L1', 'L2', 'L3', 'L4'].map((name) => ({ name, type: 'text', selected: true, rect: RECT }));
    const h = ae(lines);
    h.call('applyRig', reqOf('M2.courses.in'));
    const A = ['ADBE Text Properties', 'ADBE Text Animators', 'BrandKit M2', 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Percent Start'];
    expect(lines.map((l) => h.keys(l.name, ...A)[0].t)).toEqual([2, 2.52, 2.92, 2.92].map((t) => expect.closeTo(t, 6)));
    expect(h.node('L1', 'ADBE Text Properties', 'ADBE Text Animators', 'BrandKit M2', 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Range Advanced', 'ADBE Text Range Type2').value).toBe(4);
  });

  it('M3: the line rises 1.1 of its height on an animator of all characters; the lower edge of its mask opens at the end', () => {
    const h = ae([{ name: 'Line', type: 'text', selected: true, rect: RECT }]);
    const r = h.call('applyRig', reqOf('M3.in'));
    expect(r.data.layers[0]).toMatchObject({ done: true, keys: 4 });
    const A = ['ADBE Text Properties', 'ADBE Text Animators', 'BrandKit M3'];
    expect(h.keys('Line', ...A, 'ADBE Text Animator Properties', 'ADBE Text Position 3D').map((k) => [k.t, k.v])).toEqual([[2, [0, 55, 0]], [2.64, [0, 0, 0]]]);
    expect(h.node('Line', ...A, 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Range Advanced', 'ADBE Text Range Type2').value).toBe(1);
    const m = h.keys('Line', 'ADBE Mask Parade', 'BrandKit M3', 'ADBE Mask Shape');
    // the rect with a margin of 2 % of 300 + 2 = 8 px: y from -48 to 18; closed at 0.83 of that, open at its foot
    expect(m.map((k) => [k.t, k.v.vertices[0][1], k.v.vertices[2][1]])).toEqual([[2.36, -48, -48 + 0.83 * 66], [2.64, -48, 18]].map(([t, a, b]) => [expect.closeTo(t, 6), a, expect.closeTo(b, 6)]));
    expect(m[0].v.vertices[0][0]).toBe(-8);
    expect(m[0].v.closed).toBe(true);
  });

  it('M4: the mask opens from the left edge and an exit closes the same mask after it; a layer without masks is skipped', () => {
    const h = ae([{ name: 'Card', type: 'solid', selected: true, rect: { top: 0, left: 0, width: 200, height: 100 } }, { name: 'Sound', type: 'audio', selected: true, rect: { top: 0, left: 0, width: 10, height: 10 } }]);
    const r = h.call('applyRig', reqOf('M4.x.in'));
    expect(r.data.layers.map((l) => [l.name, l.done, l.skipped])).toEqual([['Card', true, undefined], ['Sound', false, 'masks']]);
    h.run('app.project.activeItem.time = 6');
    h.call('applyRig', reqOf('M4.x.out'));
    expect(h.node('Card', 'ADBE Mask Parade').children).toHaveLength(1);
    const m = h.keys('Card', 'ADBE Mask Parade', 'BrandKit M4', 'ADBE Mask Shape');
    // margin 2 % of 200 + 2 = 6: x from -6 to 206
    expect(m.map((k) => [k.t, k.v.vertices[0][0], k.v.vertices[1][0]])).toEqual([[2, -6, -6], [3.16, -6, 206], [6, -6, 206], [7.12, 206, 206]]);
    expect(m[1].inE).toEqual([{ speed: 0, influence: 89 }]);
  });

  it('M7 and M9: a white solid of the comp right over the layer with Fractal Noise of the packs, its Luma matte', () => {
    const h = ae([{ name: 'Above', type: 'shape' }, { name: 'Arrows', type: 'shape', selected: true }]);
    const r = h.call('applyRig', reqOf('M7.in'));
    expect(r.data.layers[0]).toMatchObject({ done: true, matte: 'BrandKit M7 · Arrows' });
    expect(JSON.parse(h.run('JSON.stringify(__ae.layerNames())'))).toEqual(['Above', 'BrandKit M7 · Arrows', 'Arrows']);
    expect(JSON.parse(h.run("JSON.stringify(__ae.matteOf('Arrows'))"))).toEqual({ layer: 'BrandKit M7 · Arrows', type: 5015, off: true });
    const fx = (m) => h.node('BrandKit M7 · Arrows', 'ADBE Effect Parade', 'ADBE Fractal Noise', m);
    expect(['0001', '0002', '0004', '0005', '0006', '0010'].map((n) => fx('ADBE Fractal Noise-' + n).value)).toEqual([5, 1, 400, -100, 1, 224.48]);
    expect(fx('ADBE Fractal Noise-0027').expression).toBe('Math.floor(time * 25 / 8)');
    expect(fx('ADBE Fractal Noise-0023').expression).toBe('');
    const h9 = ae([{ name: 'Grid', type: 'solid', selected: true }], { w: 3840, h: 2160 });
    h9.call('applyRig', reqOf('M9.in', 3840, 2160));
    expect(h9.node('BrandKit M9 · Grid', 'ADBE Effect Parade', 'ADBE Fractal Noise', 'ADBE Fractal Noise-0023').expression).toBe('time*40');
    expect(h9.node('BrandKit M9 · Grid', 'ADBE Effect Parade', 'ADBE Fractal Noise', 'ADBE Fractal Noise-0010').value).toBe(225);
    expect(JSON.parse(h9.run('JSON.stringify(app.project.activeItem.layer(1)._solid)'))).toEqual({ color: [1, 1, 1], w: 3840, h: 2160, pa: 1, dur: 30 });
  });

  it('M11: every Repeater Offset of a shape gets the expression; a shape without a repeater and a text layer are skipped', () => {
    const h = ae([{ name: 'Hatch', type: 'shape', selected: true, repeaters: 2 }, { name: 'Plain', type: 'shape', selected: true }, { name: 'Words', type: 'text', selected: true }]);
    const r = h.call('applyRig', reqOf('M11.in'));
    expect(r.data.layers.map((l) => [l.name, l.done, l.skipped])).toEqual([['Hatch', true, undefined], ['Plain', false, 'repeater'], ['Words', false, 'shape']]);
    expect(['Repeater 1', 'Repeater 2'].map((g) => h.node('Hatch', 'ADBE Root Vectors Group', g, 'ADBE Vector Repeater Offset').expression)).toEqual(['-100 + time*0.5', '-100 + time*0.5']);
  });

  it('no selection, another comp active, a layer without a size', () => {
    expect(ae([{ name: 'A', type: 'shape' }]).call('applyRig', reqOf('M5.in')).error.code).toBe('NO_SELECTION');
    const other = ae([{ name: 'A', type: 'shape', selected: true }]);
    expect(other.call('applyRig', { ...reqOf('M5.in'), targetId: '99' }).error.code).toBe('NO_TARGET');
    const flat = ae([{ name: 'Empty', type: 'text', selected: true, rect: { top: 0, left: 0, width: 0, height: 0 } }]);
    expect(flat.call('applyRig', reqOf('M3.in')).data.layers[0]).toEqual({ name: 'Empty', done: false, skipped: 'bounds', keys: 0 });
  });
});

describe('the chain: core -> bridge -> adapter', () => {
  it('runRig answers the layers it moved, with the warning for the one it skipped', async () => {
    const h = ae([{ name: 'Title', type: 'text', selected: true, rect: { top: -40, left: 0, width: 300, height: 50 } }, { name: 'Plate', type: 'shape', selected: true }]);
    const out = await runRig(h.bridge, reqOf('M2.titlesName.in'));
    expect(out.ok).toBe(true);
    expect(out.reply.layers.map((l) => l.done)).toEqual([true, false]);
    expect(out.problems.map((p) => p.code)).toEqual(['RIG_SKIPPED']);
  });
});
