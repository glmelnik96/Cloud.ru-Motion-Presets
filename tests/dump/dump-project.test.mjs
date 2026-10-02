import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { composeDumpJsx } from '../../tools/dump/dump.mjs';
import { lintOrThrow } from '../../tools/host-run.mjs';

const FAKE = readFileSync(new URL('./fake-ae-host.js', import.meta.url), 'utf8');

// One project with one comp; the layer set covers every branch the dumper takes.
const SCENE = `
var root = make(FolderItem, { id: 1, name: 'Root' });
var folder = make(FolderItem, { id: 2, name: 'Comps', parentFolder: root });
var solid = make(FootageItem, { id: 3, name: 'Magenta Solid 1', parentFolder: root, width: 40, height: 40, pixelAspect: 1,
  frameRate: 0, duration: 0, hasVideo: true, hasAudio: false, footageMissing: false,
  mainSource: make(SolidSource, { color: [1, 0, 1] }), usedIn: [] });
var comp = make(CompItem, { id: 10, name: 'CRT_Test', parentFolder: folder, width: 1920, height: 1080, pixelAspect: 1,
  frameRate: 25, frameDuration: 0.04, duration: 10, displayStartTime: 0, workAreaStart: 0, workAreaDuration: 10,
  bgColor: [0, 0, 0], renderer: 'ADBE Advanced 3d', renderers: ['ADBE Advanced 3d'], motionBlur: false, shutterAngle: 180,
  shutterPhase: -90, numLayers: 4, usedIn: [],
  markerProperty: new MarkerProp([
    { time: 0, value: { comment: 'in', duration: 1, protectedRegion: true, label: 0, getParameters: function () { return {}; } } },
    { time: 9, value: { comment: 'out', duration: 1, protectedRegion: true, label: 0, getParameters: function () { return {}; } } }
  ]) });
solid.usedIn = [comp];
var probe = makeLayer(AVLayer, { index: 1, id: 101, name: 'PROBE_SQ', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: null, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.NO_TRACK_MATTE,
  trackMatteLayer: null, enabled: true, threeDLayer: false, nullLayer: false, adjustmentLayer: false, source: solid,
  quality: LayerQuality.BEST }, [
  new MarkerProp([]),
  transformGroup([100, 100, 0], [
    { time: 0, value: [100, 100, 0] }, { time: 1, value: [200, 100, 0] },
    { time: 9, value: [200, 100, 0] }, { time: 10, value: [300, 100, 0] }])
]);
probe._group._children[0].matchName = 'ADBE Marker';
var doc = new TextDocument({ text: 'Имя', font: 'SBSansDisplay-Semibold', fontSize: 60, applyFill: true,
  applyStroke: false, fillColor: [1, 1, 1], tracking: 0, autoLeading: true, leading: 0,
  justification: ParagraphJustification.LEFT_JUSTIFY, boxText: false, pointText: true,
  fontObject: { postScriptName: 'SBSansDisplay-Semibold', version: '1.002', location: 'C:/Windows/Fonts/x.otf', isSubstitute: false } });
var txt = makeLayer(TextLayer, { index: 2, id: 102, name: 'TXT_NAME', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: probe, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.ALPHA, trackMatteLayer: null,
  enabled: true, source: null, matchName: 'ADBE Text Layer' }, [
  new Group({ matchName: 'ADBE Text Properties', name: 'Text', children: [
    new Prop({ matchName: 'ADBE Text Document', name: 'Source Text', pvt: 'TEXT_DOCUMENT', value: doc })] }),
  transformGroup([200, 800, 0], [])
]);
var shape = makeLayer(ShapeLayer, { index: 3, id: 103, name: 'PL_NAME', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: null, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.NO_TRACK_MATTE,
  trackMatteLayer: null, enabled: true, source: null, matchName: 'ADBE Vector Layer' }, [
  new Group({ matchName: 'ADBE Root Vectors Group', name: 'Contents', type: 'INDEXED_GROUP', children: [
    new Group({ matchName: 'ADBE Vector Group', name: 'Plate', canSetEnabled: true, children: [
      new Group({ matchName: 'ADBE Vectors Group', name: 'Contents', type: 'INDEXED_GROUP', children: [
        new Group({ matchName: 'ADBE Vector Shape - Group', name: 'Path 1', canSetEnabled: true, children: [
          new Prop({ matchName: 'ADBE Vector Shape', name: 'Path', pvt: 'SHAPE', value: { closed: true,
            vertices: [[0, 0], [10, 0], [10, 10], [0, 10]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]],
            outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]] } })] }),
        new Group({ matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', canSetEnabled: true, children: [
          new Prop({ matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: [0.133333, 0.133333, 0.133333, 1],
            expression: 'thisComp.layer("CTRL").effect("Style")(1) == 1 ? [0.13,0.13,0.13,1] : [0.95,0.95,0.95,1]' })] })
      ] })] })] }),
  transformGroup([960, 540, 0], [])
]);
var ctrl = makeLayer(AVLayer, { index: 4, id: 104, name: 'CTRL', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: null, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.NO_TRACK_MATTE,
  trackMatteLayer: null, enabled: false, nullLayer: true, source: solid }, [
  new Group({ matchName: 'ADBE Effect Parade', name: 'Effects', type: 'INDEXED_GROUP', children: [
    new Group({ matchName: 'ADBE Slider Control', name: 'Duration', canSetEnabled: true, children: [
      new Prop({ matchName: 'ADBE Slider Control-0001', name: 'Slider', value: 10 })] }),
    new Group({ matchName: 'ADBE Dropdown Control', name: 'Style', canSetEnabled: true, children: [
      new Prop({ matchName: 'ADBE Dropdown Control-0001', name: 'Menu', value: 1 })] })] }),
  new Group({ matchName: 'ADBE Mask Parade', name: 'Masks', type: 'INDEXED_GROUP', children: [
    new Group({ matchName: 'ADBE Mask Atom', name: 'Mask 1', extra: { maskMode: MaskMode.ADD, inverted: false, locked: false, color: [1, 0, 0] },
      children: [
        new Prop({ matchName: 'ADBE Mask Shape', name: 'Mask Path', pvt: 'SHAPE', value: { closed: true, vertices: [[0, 0], [5, 0], [5, 5]],
          inTangents: [[0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0]] } }),
        new Prop({ matchName: 'ADBE Mask Feather', name: 'Mask Feather', pvt: 'TwoD', value: [0, 0] }),
        new Prop({ matchName: 'ADBE Mask Opacity', name: 'Mask Opacity', value: 100 }),
        new Prop({ matchName: 'ADBE Mask Offset', name: 'Mask Expansion', value: 0 })] })] }),
  transformGroup([0, 0, 0], [])
]);
txt.trackMatteLayer = shape;
var layers = [probe, txt, shape, ctrl];
comp.layer = function (i) { return layers[i - 1]; };
var items = [folder, solid, comp];
var project = { file: { fsName: 'C:\\\\CRBK\\\\work\\\\fixtures\\\\t.aep' }, dirty: false, rootFolder: root, numItems: 3,
  expressionEngine: 'javascript-1.0', bitsPerChannel: 8, item: function (i) { return items[i - 1]; },
  itemByID: function (id) { for (var i = 0; i < items.length; i++) { if (items[i].id === id) { return items[i]; } } return null; },
  close: function (opt) { __calls.push('close:' + opt); } };
var app = { version: '26.5x50', isoLanguage: 'ru_RU', project: project,
  beginSuppressDialogs: function () { __calls.push('suppress'); }, endSuppressDialogs: function () { __calls.push('unsuppress'); },
  open: function (f) { __calls.push('open:' + f._path); project.file = { fsName: f.fsName }; return project; } };
`;

function runOp(params, tweak = '') {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE + SCENE + tweak, ctx);
  const reply = JSON.parse(vm.runInContext(composeDumpJsx(params), ctx));
  const files = vm.runInContext('__files', ctx);
  const calls = vm.runInContext('__calls', ctx);
  return { reply, files, calls };
}

const PROJECT = 'C:/CRBK/work/fixtures/t.aep';
const OUT = 'C:/CRBK/work/dumps/t/_raw/c10.json';

describe('dump-project.jsx', () => {
  it('passes the ES3 lint used by host-run', () => {
    expect(() => lintOrThrow(composeDumpJsx({ op: 'comp', project: PROJECT, compId: 10, out: OUT }))).not.toThrow();
  });

  it('dumps comp settings and protected-region markers', () => {
    const { reply, files } = runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT });
    expect(reply.ok).toBe(true);
    const d = JSON.parse(files[OUT]);
    expect(d.schema).toBe('crbk-dump/1');
    expect(d.comp).toMatchObject({ name: 'CRT_Test', folder: 'Comps', width: 1920, frameRate: 25, renderer: 'ADBE Advanced 3d' });
    expect(d.comp.markers.map((m) => [m.time, m.comment, m.duration, m.protectedRegion]))
      .toEqual([[0, 'in', 1, true], [9, 'out', 1, true]]);
    expect(d.layers.map((l) => [l.name, l.type])).toEqual([['PROBE_SQ', 'av'], ['TXT_NAME', 'text'], ['PL_NAME', 'shape'], ['CTRL', 'null']]);
  });

  it('records keyframes with interpolation, eases and spatial tangents', () => {
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    const pos = d.layers[0].props.find((p) => p.matchName === 'ADBE Transform Group').children.find((p) => p.matchName === 'ADBE Position');
    expect(pos.keys.map((k) => [k.time, k.value])).toEqual([[0, [100, 100, 0]], [1, [200, 100, 0]], [9, [200, 100, 0]], [10, [300, 100, 0]]]);
    expect(pos.keys[1]).toMatchObject({ inInterp: 'LINEAR', outInterp: 'LINEAR', inSpatial: [0, 0, 0], roving: false });
    expect(pos.keys[1].inEase).toEqual([{ speed: 0, influence: 16.666667 }]);
    expect(pos.dimensionsSeparated).toBe(false);
    expect(d.layers[0].source).toMatchObject({ kind: 'solid', color: [1, 0, 1] });
    expect(d.layers[0].markers).toEqual([]);
  });

  it('reads text documents without touching strokeColor when there is no stroke', () => {
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    const st = d.layers[1].props[0].children[0];
    expect(st.pvt).toBe('TEXT_DOCUMENT');
    expect(st.value).toMatchObject({ font: 'SBSansDisplay-Semibold', fontSize: 60, fillColor: [1, 1, 1], justification: 'LEFT_JUSTIFY' });
    expect(st.value.strokeColor).toBeUndefined();
    expect(st.value.fontObject).toMatchObject({ version: '1.002', isSubstitute: false });
    expect(d.layers[1].parent).toBe(1);
    expect(d.layers[1].trackMatte).toEqual({ type: 'ALPHA', hasTrackMatte: undefined, isTrackMatte: undefined, layer: 3, api: 'trackMatteLayer' });
  });

  it('walks shape contents, expressions, effects and masks', () => {
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    const group = d.layers[2].props[0].children[0];
    expect(group).toMatchObject({ matchName: 'ADBE Vector Group', name: 'Plate', enabled: true, group: 'NAMED_GROUP' });
    const [pathGroup, fill] = group.children[0].children;
    expect(pathGroup.children[0].value).toMatchObject({ closed: true, count: 4, vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] });
    expect(fill.children[0].expression).toMatchObject({ enabled: true, error: '', valueAt0: [0.133333, 0.133333, 0.133333, 1] });
    expect(d.layers[3].effects.map((e) => [e.matchName, e.name, e.params[0].value]))
      .toEqual([['ADBE Slider Control', 'Duration', 10], ['ADBE Dropdown Control', 'Style', 1]]);
    expect(d.layers[3].masks[0]).toMatchObject({ mode: 'ADD', inverted: false, path: { value: { count: 3 } }, opacity: { value: 100 } });
    expect(d.layers[3].props.map((p) => p.matchName)).toEqual(['ADBE Transform Group']);
    expect(d.layers[3].switches.enabled).toBe(false);
    expect(d.stats).toMatchObject({ layers: 4, keys: 4, expressions: 1, expressionErrors: 0 });
  });

  it('evaluates expressions unless told not to', () => {
    const fillColor = (d) => d.layers[2].props[0].children[0].children[0].children[1].children[0];
    const on = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    expect(fillColor(on).expression.valueAt0).toEqual([0.133333, 0.133333, 0.133333, 1]);
    const off = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT, caps: { evalExpressions: 0 } }).files[OUT]);
    expect(fillColor(off).expression.valueAt0).toBeUndefined();
    expect(fillColor(off).expression.text).toContain('Style');
  });

  it('suppresses dialogs while it reads a comp', () => {
    expect(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).calls).toEqual(['suppress', 'unsuppress']);
  });

  it('caps huge arrays and records what it skipped', () => {
    const caps = { maxKeys: 2, maxVertices: 3 };
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT, caps }).files[OUT]);
    const pos = d.layers[0].props[0].children.find((p) => p.matchName === 'ADBE Position');
    expect(pos.keys).toHaveLength(2);
    expect(pos.keysTotal).toBe(4);
    expect(d.truncated).toEqual([
      { path: 'L1/ADBE Transform Group/ADBE Position', what: 'keys', count: 4 },
      { path: 'L3/ADBE Root Vectors Group/ADBE Vector Group/ADBE Vectors Group/ADBE Vector Shape - Group/ADBE Vector Shape', what: 'vertices', count: 4 },
    ]);
  });

  it('refuses a project with unsaved changes and a comp of another project', () => {
    expect(runOp({ op: 'open', project: 'C:/CRBK/packs/a/a.aep', out: 'C:/x.json' }, 'project.dirty = true;').reply.error.code).toBe('PROJECT_DIRTY');
    expect(runOp({ op: 'comp', project: 'C:/CRBK/packs/a/a.aep', compId: 10, out: OUT }).reply.error.code).toBe('WRONG_PROJECT');
  });

  it('opens another project with dialogs suppressed and writes the inventory', () => {
    const { reply, files, calls } = runOp({ op: 'open', project: 'C:/CRBK/packs/a/a.aep', out: 'C:/x.json' },
      "__existing['C:/CRBK/packs/a/a.aep'] = true;");
    expect(calls).toEqual(['suppress', 'open:C:/CRBK/packs/a/a.aep', 'unsuppress']);
    expect(reply.data.comps).toEqual([{ id: 10, name: 'CRT_Test', folder: 'Comps', numLayers: 4 }]);
    const inv = JSON.parse(files['C:/x.json']);
    expect(inv.items.map((i) => i.kind)).toEqual(['folder', 'footage', 'comp']);
    expect(inv.items[1].source).toMatchObject({ kind: 'solid' });
    expect(inv.expressionEngine).toBe('javascript-1.0');
  });

  it('closes only the project it was asked about, without saving', () => {
    expect(runOp({ op: 'close', project: 'C:/other.aep' }).reply.data.closed).toBe(false);
    const { reply, calls } = runOp({ op: 'close', project: PROJECT });
    expect(reply.data.closed).toBe(true);
    expect(calls).toEqual(['close:1212']);
  });
});
