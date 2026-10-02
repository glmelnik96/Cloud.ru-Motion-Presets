import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../spikes/lib/ae-project.jsx', import.meta.url), 'utf8');

function CompItem(name) { this.name = name; }
function FootageItem(name) { this.name = name; }

// A tiny After Effects stand-in: only what ae-project.jsx touches.
function host({ dirty = false, file = null, items = [], existing = [] } = {}) {
  const calls = [];
  const dialogs = [];
  function File(p) {
    this.path = String(p);
    this.fsName = String(p).replace(/\//g, '\\');
    this.exists = existing.includes(String(p));
    this.length = 1234;
  }
  const project = {
    dirty,
    file: file ? { fsName: file } : null,
    numItems: items.length,
    item: (i) => items[i - 1],
    close: (opt) => { calls.push(['close', opt]); return true; },
    save: (f) => { calls.push(['save', f.path]); existing.push(f.path); },
  };
  const app = {
    project,
    open: (f) => { calls.push(['open', f.path]); return { opened: f.path }; },
    newProject: () => { calls.push(['newProject']); return {}; },
    beginSuppressDialogs: () => { dialogs.push('begin'); },
    endSuppressDialogs: (alert) => { dialogs.push('end:' + alert); },
  };
  const ctx = vm.createContext({
    PARAMS: { workDir: 'C:/CRBK/work' }, app, File, CompItem, FootageItem,
    CloseOptions: { DO_NOT_SAVE_CHANGES: 'no-save' },
  });
  vm.runInContext(SRC, ctx);
  return { ctx, calls, dialogs };
}

const FIXTURE = 'C:/CRBK/work/fixtures/CRT_fixture.aep';

describe('ae-project.jsx', () => {
  it('recognises the work folder by prefix, case and slash insensitive', () => {
    const { ctx } = host();
    expect(ctx.bkIsWorkPath('C:\\CRBK\\Work\\fixtures\\a.aep')).toBe(true);
    expect(ctx.bkIsWorkPath('C:/CRBK/workshop/a.aep')).toBe(false);
    expect(ctx.bkIsWorkPath('C:\\Users\\me\\job.aep')).toBe(false);
  });

  it('refuses to close a dirty project of the user', () => {
    const { ctx, calls } = host({ dirty: true, file: 'C:\\Users\\me\\job.aep', existing: [FIXTURE] });
    expect(() => ctx.bkOpenProject(FIXTURE)).toThrow(/BK_DIRTY_USER_PROJECT/);
    expect(calls).toEqual([]);
  });

  it('refuses a dirty untitled project too', () => {
    const { ctx, calls } = host({ dirty: true, existing: [FIXTURE] });
    expect(() => ctx.bkNewProject()).toThrow(/untitled/);
    expect(calls).toEqual([]);
  });

  it('closes its own dirty project without saving, then opens the fixture', () => {
    const { ctx, calls } = host({ dirty: true, file: 'C:\\CRBK\\work\\s4\\scratch.aep', existing: [FIXTURE] });
    expect(ctx.bkOpenProject(FIXTURE)).toEqual({ opened: FIXTURE });
    expect(calls).toEqual([['close', 'no-save'], ['open', FIXTURE]]);
  });

  it('reports a missing project file before touching the open project', () => {
    const { ctx, calls } = host({ dirty: true, file: 'C:\\CRBK\\work\\x.aep' });
    expect(() => ctx.bkOpenProject(FIXTURE)).toThrow(/BK_NO_FILE/);
    expect(calls).toEqual([]);
  });

  it('saves only into the work folder, with dialogs suppressed', () => {
    const { ctx, calls, dialogs } = host();
    expect(() => ctx.bkSaveAs('C:/Users/me/x.aep')).toThrow(/BK_NOT_WORK_PATH/);
    expect(ctx.bkSaveAs('C:/CRBK/work/fixtures/copy.aep').bytes).toBe(1234);
    expect(calls).toEqual([['save', 'C:/CRBK/work/fixtures/copy.aep']]);
    expect(dialogs).toEqual(['begin', 'end:false']);
  });

  it('always ends dialog suppression, even when the call throws', () => {
    const { ctx, dialogs } = host();
    expect(ctx.bkQuiet(() => 42)).toBe(42);
    expect(() => ctx.bkQuiet(() => { throw new Error('boom'); })).toThrow(/boom/);
    expect(dialogs).toEqual(['begin', 'end:false', 'begin', 'end:false']);
  });

  it('lists expression properties by index path and resolves them back', () => {
    const PT = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
    const prop = (matchName, expression = '') => ({ matchName, propertyType: PT.PROPERTY, canSetExpression: true, expression });
    const group = (matchName, children) => ({
      matchName, propertyType: PT.NAMED_GROUP, numProperties: children.length, property: (i) => children[i - 1],
    });
    const broken = { matchName: 'ADBE Broken', propertyType: PT.NAMED_GROUP, get numProperties() { throw new Error('no'); } };
    const opacity = prop('ADBE Opacity', 'x * 100');
    const layer = { name: 'TXT_ROLE', ...group('ADBE AV Layer', [group('ADBE Transform Group', [prop('ADBE Position'), opacity]), broken]) };
    const comp = { numLayers: 1, layer: () => layer };
    const { ctx } = host();
    ctx.PropertyType = PT;
    const list = ctx.bkExpressionProps(comp);
    expect(JSON.parse(JSON.stringify(list))).toEqual([
      { layerIndex: 1, layerName: 'TXT_ROLE', idx: [1, 2], label: 'TXT_ROLE/ADBE Transform Group/ADBE Opacity' },
    ]);
    expect(ctx.bkResolve(comp, list[0])).toBe(opacity);
  });

  it('turns composition markers into plain data', () => {
    const keys = [
      { t: 0, v: { comment: 'in', duration: 1, protectedRegion: true } },
      { t: 9, v: { comment: 'out', duration: 1, protectedRegion: true } },
    ];
    const comp = { markerProperty: { numKeys: 2, keyTime: (k) => keys[k - 1].t, keyValue: (k) => keys[k - 1].v } };
    const { ctx } = host();
    expect(JSON.parse(JSON.stringify(ctx.bkMarkers(comp)))).toEqual([
      { time: 0, comment: 'in', duration: 1, protectedRegion: true },
      { time: 9, comment: 'out', duration: 1, protectedRegion: true },
    ]);
  });

  it('finds exactly one item by name and type', () => {
    const items = [new CompItem('A'), new FootageItem('A'), new CompItem('B'), new CompItem('B')];
    const { ctx } = host({ items });
    expect(ctx.bkComp('A')).toBe(items[0]);
    expect(ctx.bkFindItem('C', CompItem)).toBe(null);
    expect(() => ctx.bkComp('C')).toThrow(/BK_NO_COMP/);
    expect(() => ctx.bkComp('B')).toThrow(/BK_DUPLICATE_ITEM/);
  });

  it('finds a dropdown by its menu: AE 26.5 gives each one a pseudo match name', () => {
    const { ctx } = host();
    const fx = (name, matchName, dropdown) => ({
      name, matchName, property: () => ({ isDropdownEffect: dropdown }),
    });
    // Seen live in AE 26.5: addProperty('ADBE Dropdown Control') yields matchName "Pseudo/@@<id>".
    const effects = [fx('Duration', 'ADBE Slider Control', false), fx('Style', 'Pseudo/@@EVFDU9N0RLeO8coJyvLkjg', true)];
    const layer = {
      name: 'CTRL',
      property: () => ({ numProperties: effects.length, property: (i) => effects[i - 1] }),
    };
    expect(ctx.bkEffect(layer, 'Style', 'ADBE Dropdown Control')).toBe(effects[1]);
    expect(ctx.bkEffect(layer, 'Duration', 'ADBE Slider Control')).toBe(effects[0]);
    expect(() => ctx.bkEffect(layer, 'Duration', 'ADBE Dropdown Control')).toThrow(/BK_EFFECT/);
  });
});
