import { describe, expect, it } from 'vitest';
import { createLogger } from '../../panel/src/core/log';
import { c27Keys, defaultLen, minLen } from '../../panel/src/core/duration';
import { defaults, toWrites } from '../../panel/src/core/fields';
import { buildArgs, planInsert, runInsert } from '../../panel/src/core/insert';
import { chooseVariant } from '../../panel/src/core/variant';
import { fontsFor, item as catalogItem } from '../panel/core/fixture';
import { createAe, markAep, MARK_EPS, TTL_EPS, ttlAep } from './ae-mock.mjs';
import { assembleAdapter, callSource, loadAdapter } from './vm-host.mjs';

const BIN = 'Cloud.ru BrandKit';
const LABEL = 'Cloud.ru BrandKit: Нижняя треть';
const TTL_PATH = 'C:/CRBK/work/library/items/TTL_LowerThird/TTL_LowerThird_v1.aep';
const TTL_KEY = 'TTL_LowerThird@1';
const TTL_COMP = 'CR_TTL_LowerThird_16x9_v1';
const MARK_PATH = 'C:/CRBK/work/library/items/LOGO_Mark/LOGO_Mark_v1.aep';

const TTL_FIELDS = [
  { egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина × 2' },
  { egpName: 'Должность', type: 'text', value: 'Директор по развитию' },
  { egpName: 'Должность, 2-я строка', type: 'text', value: '' },
  { egpName: 'Стиль', type: 'dropdown', value: 2 },
  { egpName: 'Сторона', type: 'dropdown', value: 2 },
  { egpName: 'Скорость', type: 'dropdown', value: 3 },
  { egpName: 'Размер текста', type: 'dropdown', value: 1 },
];

// A project with the TTL .aep on disk and a 1920x1080 25p user comp active; the adapter loaded the way the panel does.
function setup({ aep = ttlAep(), mock = {}, comp = {}, adapter = {} } = {}) {
  const ae = createAe(mock);
  ae.defineAep(TTL_PATH, aep);
  const user = ae.addComp('USER_Comp', { w: 1920, h: 1080, fps: 25, duration: 30, ...comp });
  ae.activate(user);
  const h = loadAdapter('ae', ae.globals, adapter);
  return { ae, h, user };
}

const insertArgs = (user, over = {}) => ({
  compId: String(user.id),
  aepPath: TTL_PATH,
  itemKey: TTL_KEY,
  aeComp: TTL_COMP,
  timeSec: 2,
  lenSec: 6,
  durSec: 6,
  inSec: 2.2,
  outSec: 4,
  fields: [],
  label: LABEL,
  ...over,
});
const insert = (h, user, over) => h.call('insertItem', insertArgs(user, over));
const refused = (r, code) => expect(r).toMatchObject({ ok: false, error: { code } });

// A project that holds the template already: bin > folder labelled with the key > the variant comps.
function seedTemplate(ae, { key = TTL_KEY, comps = [TTL_COMP], binFolder = ae.bin() ?? ae.addFolder(BIN), parent = binFolder } = {}) {
  const folder = ae.addFolder('TTL_LowerThird_v1.aep', parent);
  folder.comment = key;
  for (const name of comps) ae.addComp(name, { duration: 6, eps: TTL_EPS }, folder);
  return folder;
}

// Nothing of the project was touched: no mutation, no undo group, no import.
function expectUntouched(ae) {
  expect(ae.ops()).toEqual([]);
  expect(ae.groups).toEqual([]);
  expect(ae.imports).toEqual([]);
  expect(ae.forbidden).toEqual([]);
}

// Undo groups all closed and dialog suppression balanced, whatever happened.
function expectBalanced(ae) {
  expect(ae.openGroupCount()).toBe(0);
  expect(ae.groups.every((g) => g.closed)).toBe(true);
  expect(ae.suppress.depth).toBe(0);
}

const layerOps = (ae) => ae.ops().filter((o) => /^(layer\.timeRemapEnabled|layer\.outPoint|remap\.)/.test(o));

describe('ae adapter: getContext', () => {
  it('reports the host, the project, the active comp as the target and the colour settings', () => {
    const { h, user } = setup({ comp: { fps: 29.97002997 } });
    user.time = 2.5;
    expect(h.call('getContext')).toEqual({
      ok: true,
      data: {
        host: 'ae',
        hostVersion: '26.5x89',
        project: { path: 'C:\\Users\\Test\\Projects\\job.aep', saved: true },
        target: { kind: 'comp', id: String(user.id), name: 'USER_Comp', w: 1920, h: 1080, fps: 29.97, timeSec: 2.5 },
        colour: { workingSpace: 'None', linearize: false, bpc: 8 },
        expressionEngine: 'javascript-1.0',
      },
    });
  });

  it('has no target when nothing, a folder or footage is active', () => {
    const { ae, h } = setup();
    for (const active of [null, ae.addFolder('Folder'), ae.addFootage('clip.mov')]) {
      ae.activate(active);
      expect(h.call('getContext').data.target).toBeNull();
    }
  });

  it('keeps the colour of the project: linearized 16 bpc sRGB, the extendscript engine', () => {
    const { h } = setup({ mock: { workingSpace: 'sRGB IEC61966-2.1', linearize: true, bpc: 16, engine: 'extendscript' } });
    const data = h.call('getContext').data;
    expect(data.colour).toEqual({ workingSpace: 'sRGB IEC61966-2.1', linearize: true, bpc: 16 });
    expect(data.expressionEngine).toBe('extendscript');
  });

  it('calls an untitled project unsaved, with no path (also an older project converted on opening)', () => {
    const { h } = setup({ mock: { file: null } });
    expect(h.call('getContext').data.project).toEqual({ path: null, saved: false });
  });

  it('reads defensively: a property that is missing or throws does not fail the call', () => {
    const { ae, h } = setup();
    const broken = () => ({ get() { throw new Error('Object is invalid'); } });
    for (const key of ['workingSpace', 'expressionEngine', 'file']) Object.defineProperty(ae.app.project, key, broken());
    Object.defineProperty(ae.app, 'version', broken());
    const r = h.call('getContext');
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({
      host: 'ae',
      hostVersion: '',
      project: { path: null, saved: false },
      target: expect.objectContaining({ kind: 'comp', name: 'USER_Comp' }),
    });
    Object.defineProperty(ae.app.project, 'activeItem', broken());
    expect(h.call('getContext').data.target).toBeNull();
  });

  it('does not change anything in the project', () => {
    const { ae, h } = setup();
    h.call('getContext');
    expectUntouched(ae);
  });
});

describe('ae adapter: insertItem, the first insert of a template', () => {
  it('imports the .aep once into the bin, labels the folder, and adds the template comp as a layer at the time', () => {
    // The CTI preference makes layers.add start the layer at 0: the adapter sets startTime itself.
    const { ae, h, user } = setup({ mock: { createAtCompStart: true } });
    const r = insert(h, user, { timeSec: 2.5, fields: TTL_FIELDS });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    expect(ae.root._children.map((c) => c.name)).toEqual(['USER_Comp', BIN]);
    expect(ae.bin()._children.map((c) => [c.name, c.comment])).toEqual([['TTL_LowerThird_v1.aep', TTL_KEY]]);
    expect(ae.imports).toEqual([{ path: TTL_PATH, suppressed: true }]);
    expect(ae.suppress).toMatchObject({ depth: 0, begins: 1, ends: [false] });

    expect(user.numLayers).toBe(1);
    const layer = user.layer(1);
    expect(layer.source.name).toBe(TTL_COMP);
    expect([layer.startTime, layer.inPoint, layer.outPoint]).toEqual([2.5, 2.5, 8.5]);
    expect(layer.timeRemapEnabled).toBe(false);
    expect(r.data.placed).toEqual({ kind: 'layer', id: String(layer.id), name: TTL_COMP, startSec: 2.5, endSec: 8.5 });
    expect(r.data.warnings).toEqual([]);
    expect(r.data).not.toHaveProperty('remapKeys');
    expect(ae.forbidden).toEqual([]);
  });

  it('is one undo step: every change runs inside one group named by the label, which is closed', () => {
    const { ae, h, user } = setup();
    expect(insert(h, user, { fields: TTL_FIELDS }).ok).toBe(true);
    expect(ae.groups).toEqual([{ name: LABEL, ops: expect.any(Array), closed: true }]);
    expect(ae.opsWithGroup().length).toBeGreaterThan(8);
    expect(ae.opsWithGroup().every((o) => o.group === LABEL)).toBe(true);
    expect(ae.ops('items.addFolder')).toEqual([`items.addFolder ${BIN}`]);
    expectBalanced(ae);
  });

  it('files the imported folder away from where AE put it (the bin made by addFolder may land elsewhere too)', () => {
    const { ae, h, user } = setup();
    const selected = ae.addFolder('Selected in the Project panel');
    ae.cfg.importParent = selected;
    ae.cfg.addFolderParent = selected;
    expect(insert(h, user).ok).toBe(true);
    expect(ae.root._children.map((c) => c.name)).toEqual(['USER_Comp', 'Selected in the Project panel', BIN]);
    expect(selected._children).toEqual([]);
    expect(ae.bin()._children.map((c) => c.comment)).toEqual([TTL_KEY]);
  });

  it('finds the comp in a subfolder of the imported folder', () => {
    const { ae, h, user } = setup({ aep: ttlAep({ nested: true }) });
    expect(insert(h, user).ok).toBe(true);
    expect(user.layer(1).source.name).toBe(TTL_COMP);
    const folder = ae.bin().item(1);
    expect(folder._children.map((c) => c.name)).toEqual(['Solids', 'Variants']);
  });

  it('uses the bin that is there and does not make another', () => {
    const { ae, h, user } = setup();
    ae.addFolder(BIN);
    expect(insert(h, user).ok).toBe(true);
    expect(ae.root._children.filter((c) => c.name === BIN)).toHaveLength(1);
    expect(ae.ops('items.addFolder')).toEqual([]);
  });

  it('takes the bin at the root of the project only, not a folder of that name deeper down', () => {
    const { ae, h, user } = setup();
    const deep = ae.addFolder(BIN, ae.addFolder('Other'));
    expect(insert(h, user).ok).toBe(true);
    expect(deep._children).toEqual([]);
    expect(ae.root._children.map((c) => c.name)).toEqual(['USER_Comp', 'Other', BIN]);
    expect(ae.bin()._children).toHaveLength(1);
  });
});

describe('ae adapter: insertItem, the template is in the project already', () => {
  it('does not import a second time, and adds a second layer', () => {
    const { ae, h, user } = setup();
    const first = insert(h, user, { timeSec: 2, fields: TTL_FIELDS });
    const second = insert(h, user, { timeSec: 10, fields: TTL_FIELDS });
    expect(first.ok && second.ok).toBe(true);
    expect(ae.imports).toHaveLength(1);
    expect(ae.ops('importFile')).toHaveLength(1);
    expect(ae.ops('items.addFolder')).toHaveLength(1);
    expect(ae.bin()._children).toHaveLength(1);
    expect(user.numLayers).toBe(2);
    expect(user.layer(1).startTime).toBe(10); // the newest layer is the top one
    expect(user.layer(2).startTime).toBe(2);
    expect(second.data.placed.id).toBe(String(user.layer(1).id));
    expect(ae.groups.map((g) => g.name)).toEqual([LABEL, LABEL]); // one undo step per insert
    expectBalanced(ae);
  });

  it('shares the folder between the variants of the item', () => {
    const { ae, h, user } = setup();
    expect(insert(h, user).ok).toBe(true);
    expect(insert(h, user, { aeComp: 'CR_TTL_LowerThird_9x16_v1' }).ok).toBe(true);
    expect(ae.imports).toHaveLength(1);
    expect(user.layer(1).source.name).toBe('CR_TTL_LowerThird_9x16_v1');
  });

  it('finds the labelled folder without the file: no import, so the file may be gone', () => {
    const { ae, h, user } = setup();
    seedTemplate(ae);
    const r = insert(h, user, { aepPath: 'C:/library/not-there.aep' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(ae.imports).toEqual([]);
    expect(ae.ops('items.addFolder')).toEqual([]);
    expect(user.layer(1).source.name).toBe(TTL_COMP);
  });

  it('finds the labelled folder where the user moved it inside the bin', () => {
    const { ae, h, user } = setup();
    const bin = ae.addFolder(BIN);
    seedTemplate(ae, { parent: ae.addFolder('Old versions', bin), binFolder: bin });
    expect(insert(h, user).ok).toBe(true);
    expect(ae.imports).toEqual([]);
  });

  it('does not take a folder of another item or version for this one', () => {
    const { ae, h, user } = setup();
    seedTemplate(ae, { key: 'TTL_LowerThird@2' });
    seedTemplate(ae, { key: 'LOGO_Mark@1' });
    ae.addFolder('unlabelled', ae.bin());
    expect(insert(h, user).ok).toBe(true);
    expect(ae.imports).toHaveLength(1);
    expect(ae.bin()._children.map((c) => c.comment)).toEqual(['TTL_LowerThird@2', 'LOGO_Mark@1', '', TTL_KEY]);
  });
});

describe('ae adapter: insertItem refuses before it touches the project', () => {
  it.each([
    ['an empty item key', { itemKey: '' }],
    ['a missing item key', { itemKey: undefined }],
    ['an empty comp name', { aeComp: '' }],
    ['a length that is not a number', { lenSec: 'long' }],
    ['a zero template length', { durSec: 0 }],
    ['a time that is not a number', { timeSec: null }],
    ['fields that are not a list', { fields: { egpName: 'Имя' } }],
    ['a field without a name', { fields: [{ type: 'text', value: 'x' }] }],
    ['a field with an object for a value', { fields: [{ egpName: 'Имя', type: 'text', value: { a: 1 } }] }],
    ['protected regions out of order', { inSec: 5, outSec: 4, lenSec: 9 }],
  ])('BAD_ARGS for %s', (_, over) => {
    const { ae, h, user } = setup();
    refused(insert(h, user, over), 'BAD_ARGS');
    expectUntouched(ae);
  });

  it('never matches a template folder by an empty key: unlabelled folders are not templates', () => {
    const { ae, h, user } = setup();
    const folder = ae.addFolder('unlabelled', ae.addFolder(BIN));
    ae.addComp(TTL_COMP, { duration: 6, eps: TTL_EPS }, folder);
    refused(insert(h, user, { itemKey: '' }), 'BAD_ARGS');
    expect(user.numLayers).toBe(0);
  });

  it('TARGET_CHANGED when another comp, a folder, footage or nothing is active', () => {
    const { ae, h, user } = setup();
    refused(insert(h, user, { compId: String(user.id + 100) }), 'TARGET_CHANGED');
    ae.activate(ae.addComp('Other comp'));
    refused(insert(h, user), 'TARGET_CHANGED');
    for (const active of [ae.addFolder('Folder'), ae.addFootage('clip.mov'), null]) {
      ae.activate(active);
      refused(insert(h, user), 'TARGET_CHANGED');
    }
    expectUntouched(ae);
  });

  it('TARGET_IS_TEMPLATE when the active comp sits anywhere inside the bin', () => {
    const { ae, h, user } = setup({ aep: ttlAep({ nested: true }) });
    expect(insert(h, user).ok).toBe(true);
    const folder = ae.bin().item(1);
    const variants = folder._children.find((c) => c.name === 'Variants');
    const inBin = [
      variants._children.find((c) => c.name === TTL_COMP), // the template comp itself, two folders down
      ae.addComp('A comp the user filed in the bin', {}, ae.bin()),
    ];
    const before = [ae.ops().length, ae.groups.length, user.numLayers];
    for (const comp of inBin) {
      ae.activate(comp);
      refused(h.call('insertItem', insertArgs(comp)), 'TARGET_IS_TEMPLATE');
    }
    expect([ae.ops().length, ae.groups.length, user.numLayers]).toEqual(before);
    expect(ae.imports).toHaveLength(1);
  });

  it('refuses a target in the bin before it imports anything', () => {
    const { ae, h } = setup();
    const inBin = ae.addComp('Filed in the bin', {}, ae.addFolder(BIN));
    ae.activate(inBin);
    refused(h.call('insertItem', insertArgs(inBin)), 'TARGET_IS_TEMPLATE');
    expectUntouched(ae);
  });

  it('LENGTH_TOO_SHORT below intro + outro, and where no hold is left (the key times would coincide)', () => {
    const { ae, h, user } = setup();
    refused(insert(h, user, { lenSec: 4 }), 'LENGTH_TOO_SHORT');
    refused(insert(h, user, { lenSec: 4.2 }), 'LENGTH_TOO_SHORT');
    refused(insert(h, user, { lenSec: 4.2 - 1e-9 }), 'LENGTH_TOO_SHORT');
    expectUntouched(ae); // nothing imported either
    expect(insert(h, user, { lenSec: 4.24 }).ok).toBe(true);
  });

  it('FILE_MISSING when the template is not in the project and the file is gone: no bin is made', () => {
    const { ae, h, user } = setup();
    refused(insert(h, user, { aepPath: 'C:/CRBK/work/library/items/none.aep' }), 'FILE_MISSING');
    refused(insert(h, user, { aepPath: '' }), 'BAD_ARGS');
    expectUntouched(ae);
  });

  it('INSERT_FAILED when the file cannot be imported as a project, or the import throws', () => {
    for (const mock of [{ canImportAsProject: false }, { importThrows: true }]) {
      const { ae, h, user } = setup({ mock });
      const r = insert(h, user);
      refused(r, 'INSERT_FAILED');
      expect(user.numLayers).toBe(0);
      expectBalanced(ae);
    }
  });

  it('INSERT_FAILED, and no layer, when layers.add throws', () => {
    const { ae, h, user } = setup({ mock: { layersAddThrows: true } });
    refused(insert(h, user), 'INSERT_FAILED');
    expect(user.numLayers).toBe(0);
    expectBalanced(ae);
  });

  it('takes the imported folder out again when it cannot be filed in the bin: it would be imported again and again', () => {
    const { ae, h, user } = setup({ mock: { moveThrows: true } });
    refused(insert(h, user), 'INSERT_FAILED');
    expect(ae.root._children.map((c) => c.name)).toEqual(['USER_Comp', BIN]); // no stray TTL_LowerThird_v1.aep
    expect(ae.ops('item.remove')).toEqual(['item.remove TTL_LowerThird_v1.aep']);
    expect(user.numLayers).toBe(0);
    expectBalanced(ae);
  });
});

describe('ae adapter: insertItem never acts on the first match', () => {
  it('TEMPLATE_DUPLICATE for two bins', () => {
    const { ae, h, user } = setup();
    ae.addFolder(BIN);
    ae.addFolder(BIN);
    refused(insert(h, user), 'TEMPLATE_DUPLICATE');
    expectUntouched(ae);
  });

  it('TEMPLATE_DUPLICATE for two folders of the key, one of them deeper in the bin', () => {
    const { ae, h, user } = setup();
    const bin = ae.addFolder(BIN);
    seedTemplate(ae, { binFolder: bin });
    seedTemplate(ae, { binFolder: bin, parent: ae.addFolder('Copy', bin) });
    refused(insert(h, user), 'TEMPLATE_DUPLICATE');
    expectUntouched(ae);
    expect(user.numLayers).toBe(0);
  });

  it('TEMPLATE_DUPLICATE for two comps of that name in the template folder', () => {
    const { ae, h, user } = setup();
    const folder = seedTemplate(ae, { comps: [TTL_COMP, TTL_COMP] });
    refused(insert(h, user), 'TEMPLATE_DUPLICATE');
    expectUntouched(ae);
    expect(folder.numItems).toBe(2);
  });

  it('TEMPLATE_DUPLICATE for two comps of that name inside a fresh import: the group is closed again', () => {
    const aep = ttlAep();
    aep.comps.push({ ...aep.comps[0] });
    const { ae, h, user } = setup({ aep });
    refused(insert(h, user), 'TEMPLATE_DUPLICATE');
    expect(user.numLayers).toBe(0);
    expectBalanced(ae);
  });

  it('TEMPLATE_NOT_FOUND when the labelled folder has no comp of that name', () => {
    const { ae, h, user } = setup();
    seedTemplate(ae, { comps: ['CR_TTL_LowerThird_9x16_v1'] });
    refused(insert(h, user), 'TEMPLATE_NOT_FOUND');
    expectUntouched(ae);
  });

  it('TEMPLATE_NOT_FOUND when the imported file has no such comp; a second try says the same, without importing again', () => {
    const { ae, h, user } = setup();
    refused(insert(h, user, { aeComp: 'CR_TTL_LowerThird_5x4_v1' }), 'TEMPLATE_NOT_FOUND');
    expect(user.numLayers).toBe(0);
    expectBalanced(ae);
    refused(insert(h, user, { aeComp: 'CR_TTL_LowerThird_5x4_v1' }), 'TEMPLATE_NOT_FOUND');
    expect(ae.imports).toHaveLength(1);
  });

  it('does not take a comp of the right name from outside the template folder', () => {
    const { ae, h, user } = setup();
    ae.addComp(TTL_COMP, { duration: 6, eps: TTL_EPS }); // the user's own comp of that name, at the root
    seedTemplate(ae, { comps: ['CR_TTL_LowerThird_9x16_v1'] });
    refused(insert(h, user), 'TEMPLATE_NOT_FOUND');
  });
});

describe('ae adapter: insertItem writes the fields and reads them back', () => {
  it('writes Cyrillic text, 1-based dropdowns, and gives the values read back', () => {
    const { h, user } = setup();
    const r = insert(h, user, { fields: TTL_FIELDS });
    const layer = user.layer(1);
    expect(r.data.fields).toEqual(TTL_FIELDS.map((f) => ({ egpName: f.egpName, written: f.value, back: f.value, ok: true })));
    expect(layer.epValue('Имя')).toBe('Анна-Мария Ёлкина × 2');
    expect(layer.epValue('Должность, 2-я строка')).toBe('');
    expect([layer.epValue('Стиль'), layer.epValue('Сторона'), layer.epValue('Скорость'), layer.epValue('Размер текста')]).toEqual([2, 2, 3, 1]);
  });

  it('writes in the order given, text through a TextDocument', () => {
    const { ae, h, user } = setup();
    insert(h, user, { fields: TTL_FIELDS });
    expect(ae.ops('ep.setValue')).toEqual(TTL_FIELDS.map((f) => `ep.setValue ${f.egpName}`));
  });

  it('writes a checkbox as 0 or 1 and takes a boolean too; a slider as a number', () => {
    const eps = [...MARK_EPS, { name: 'Размер', kind: 'slider', value: 50 }];
    const { ae, h, user } = setup({ aep: markAep({ eps }) });
    ae.defineAep(MARK_PATH, markAep({ eps }));
    const fields = [
      { egpName: 'Подложка', type: 'checkbox', value: 0 },
      { egpName: 'Тема', type: 'dropdown', value: 1 },
      { egpName: 'Размер', type: 'slider', value: 72.5 },
    ];
    const args = insertArgs(user, { aepPath: MARK_PATH, itemKey: 'LOGO_Mark@1', aeComp: 'CR_LOGO_Mark_16x9_v1', durSec: 4, lenSec: 4, inSec: 2.96, outSec: 3.2, fields });
    const r = h.call('insertItem', args);
    expect(r.data.fields).toEqual([
      { egpName: 'Подложка', written: 0, back: 0, ok: true },
      { egpName: 'Тема', written: 1, back: 1, ok: true },
      { egpName: 'Размер', written: 72.5, back: 72.5, ok: true },
    ]);
    const again = h.call('insertItem', { ...args, fields: [{ egpName: 'Подложка', type: 'checkbox', value: true }] });
    expect(again.data.fields).toEqual([{ egpName: 'Подложка', written: true, back: 1, ok: true }]);
    expect(user.layer(1).epValue('Подложка')).toBe(1);
  });

  it('reports a value that did not read back as written (a dropdown clamped by AE) and goes on with the others', () => {
    const eps = TTL_EPS.map((e) => (e.name === 'Стиль' ? { ...e, clamp: true } : e));
    const { h, user } = setup({ aep: ttlAep({ eps }) });
    const r = insert(h, user, { fields: [{ egpName: 'Стиль', type: 'dropdown', value: 9 }, { egpName: 'Имя', type: 'text', value: 'Анна' }] });
    expect(r.ok).toBe(true);
    expect(r.data.fields).toEqual([
      { egpName: 'Стиль', written: 9, back: 3, ok: false },
      { egpName: 'Имя', written: 'Анна', back: 'Анна', ok: true },
    ]);
    expect(user.numLayers).toBe(1); // the layer stays: no rollback on a mismatch
  });

  it('reports a write that AE ignored, and one that throws, without failing the insert', () => {
    const eps = TTL_EPS.map((e) => (e.name === 'Сторона' ? { ...e, frozen: true } : e.name === 'Скорость' ? { ...e, throwOnSet: true } : e));
    const { h, user } = setup({ aep: ttlAep({ eps }) });
    const r = insert(h, user, {
      fields: [
        { egpName: 'Сторона', type: 'dropdown', value: 2 },
        { egpName: 'Скорость', type: 'dropdown', value: 4 },
        { egpName: 'Имя', type: 'text', value: 'Анна' },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.data.fields).toEqual([
      { egpName: 'Сторона', written: 2, back: 1, ok: false },
      { egpName: 'Скорость', written: 4, back: null, ok: false },
      { egpName: 'Имя', written: 'Анна', back: 'Анна', ok: true },
    ]);
    expect(r.data.warnings).toEqual([expect.stringMatching(/^FIELD_WRITE_FAILED: Скорость: /)]);
  });

  it('reports a field with no property of that name, and one that is ambiguous, writing neither', () => {
    const eps = [...TTL_EPS, { name: 'Дубль', kind: 'text', value: 'a' }, { name: 'Дубль', kind: 'text', value: 'b' }];
    const { ae, h, user } = setup({ aep: ttlAep({ eps }) });
    const r = insert(h, user, {
      fields: [
        { egpName: 'Нет такого', type: 'text', value: 'x' },
        { egpName: 'Дубль', type: 'text', value: 'x' },
        { egpName: 'Имя', type: 'text', value: 'Анна' },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.data.fields.map((f) => [f.egpName, f.back, f.ok])).toEqual([['Нет такого', null, false], ['Дубль', null, false], ['Имя', 'Анна', true]]);
    expect(r.data.warnings).toEqual(['FIELD_NOT_FOUND: Нет такого', 'FIELD_AMBIGUOUS: Дубль']);
    expect(ae.ops('ep.setValue')).toEqual(['ep.setValue Имя']);
  });

  it('looks into groups of properties', () => {
    const eps = [{ name: 'Стиль', children: [{ name: 'Тема', kind: 'dropdown', value: 1, count: 2 }] }];
    const { h, user } = setup({ aep: ttlAep({ eps }) });
    const r = insert(h, user, { fields: [{ egpName: 'Тема', type: 'dropdown', value: 2 }] });
    expect(r.data.fields).toEqual([{ egpName: 'Тема', written: 2, back: 2, ok: true }]);
  });

  it('reports every field as not written, with one warning, when the layer has no Essential Properties group', () => {
    const { h, user } = setup({ mock: { noEssentialGroup: true } });
    const r = insert(h, user, { fields: [{ egpName: 'Имя', type: 'text', value: 'Анна' }, { egpName: 'Стиль', type: 'dropdown', value: 2 }] });
    expect(r.ok).toBe(true);
    expect(r.data.fields).toEqual([
      { egpName: 'Имя', written: 'Анна', back: null, ok: false },
      { egpName: 'Стиль', written: 2, back: null, ok: false },
    ]);
    expect(r.data.warnings).toEqual(['NO_ESSENTIAL_PROPERTIES']);
  });

  it('reports a property that is not in the group of the layer', () => {
    const { h, user } = setup({ aep: ttlAep({ eps: [] }) });
    const r = insert(h, user, { fields: [{ egpName: 'Имя', type: 'text', value: 'Анна' }] });
    expect(r.ok).toBe(true);
    expect(r.data.fields).toEqual([{ egpName: 'Имя', written: 'Анна', back: null, ok: false }]);
    expect(r.data.warnings).toEqual(['FIELD_NOT_FOUND: Имя']);
  });

  it('gets the group from the ADBE Layer Overrides match name when layer.essentialProperty is not there', () => {
    const { h, user } = setup({ mock: { essentialProperty: false } });
    const r = insert(h, user, { fields: TTL_FIELDS });
    expect(r.data.fields.every((f) => f.ok)).toBe(true);
    expect(user.layer(1).epValue('Имя')).toBe('Анна-Мария Ёлкина × 2');
  });

  it('reads a line break back as the one it wrote (AE keeps text lines apart with CR)', () => {
    const eps = TTL_EPS.map((e) => (e.name === 'Должность' ? { ...e, readTransform: (v) => v.replace(/\n/g, '\r') } : e));
    const { h, user } = setup({ aep: ttlAep({ eps }) });
    const r = insert(h, user, { fields: [{ egpName: 'Должность', type: 'text', value: 'Директор\nпо развитию' }] });
    expect(r.data.fields).toEqual([{ egpName: 'Должность', written: 'Директор\nпо развитию', back: 'Директор\rпо развитию', ok: true }]);
  });

  it('does not take a trimmed or changed text for a good read-back', () => {
    const eps = TTL_EPS.map((e) => (e.name === 'Имя' ? { ...e, readTransform: (v) => v.trim() } : e));
    const { h, user } = setup({ aep: ttlAep({ eps }) });
    const r = insert(h, user, { fields: [{ egpName: 'Имя', type: 'text', value: ' Анна ' }] });
    expect(r.data.fields).toEqual([{ egpName: 'Имя', written: ' Анна ', back: 'Анна', ok: false }]);
  });

  it('reports a field type it cannot write, and a value that is no number for a number field', () => {
    const { ae, h, user } = setup();
    const r = insert(h, user, {
      fields: [{ egpName: 'Имя', type: 'media', value: 'C:/x.png' }, { egpName: 'Стиль', type: 'dropdown', value: 'abc' }],
    });
    expect(r.ok).toBe(true);
    expect(r.data.fields.map((f) => f.ok)).toEqual([false, false]);
    expect(r.data.warnings).toEqual(['FIELD_TYPE_UNSUPPORTED: Имя', 'FIELD_VALUE_INVALID: Стиль']);
    expect(ae.ops('ep.setValue')).toEqual([]);
  });

  it('accepts a list of no fields', () => {
    const { h, user } = setup();
    const r = insert(h, user, { fields: undefined });
    expect(r.data.fields).toEqual([]);
  });
});

describe('ae adapter: insertItem fits the length by time remap (C27)', () => {
  const KEYS_9 = [[0, 0], [2.2, 2.2], [7, 4], [9, 6]];

  it('adds the keys of a longer insert in the proven order: remap on, out point, our keys, the others out, linear', () => {
    const { ae, h, user } = setup();
    const r = insert(h, user, { lenSec: 9, fields: TTL_FIELDS });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const layer = user.layer(1);
    expect(layerOps(ae)).toEqual([
      'layer.timeRemapEnabled true',
      'layer.outPoint 11', // after enabling: enabling resets the out point (quirk #133)
      'remap.setValueAtTime 2 0',
      'remap.setValueAtTime 4.2 2.2',
      'remap.setValueAtTime 9 4',
      'remap.setValueAtTime 11 6',
      'remap.removeKey 3', // AE's own end key, the one of ours that did not replace one of its
      'remap.interp 1',
      'remap.interp 2',
      'remap.interp 3',
      'remap.interp 4',
    ]);
    expect(layer.timeRemapEnabled).toBe(true);
    expect(layer.remapKeys()).toEqual(KEYS_9);
    expect(layer.remapInterp()).toEqual(KEYS_9.map(() => [6612, 6612])); // LINEAR in and out
    expect([layer.inPoint, layer.outPoint]).toEqual([2, 11]);
    expect(r.data.remapKeys).toEqual(KEYS_9);
    expect(r.data.placed).toEqual({ kind: 'layer', id: String(layer.id), name: TTL_COMP, startSec: 2, endSec: 11 });
    expect(r.data.warnings).toEqual([]);
  });

  it('agrees with the core on the keys (c27Keys)', () => {
    const { h, user } = setup();
    for (const lenSec of [4.24, 5, 7.5, 9, 12]) {
      const r = insert(h, user, { lenSec });
      expect(r.data.remapKeys, String(lenSec)).toEqual(c27Keys(6, 2.2, 4, lenSec));
    }
  });

  it('reads the Essential Properties back from a group fetched again: AE drops the old objects on enabling remap', () => {
    const { h, user } = setup();
    const r = insert(h, user, { lenSec: 9, fields: TTL_FIELDS });
    expect(r.data.fields).toEqual(TTL_FIELDS.map((f) => ({ egpName: f.egpName, written: f.value, back: f.value, ok: true })));
    expect(r.data.warnings).toEqual([]);
  });

  it('keeps the values of the fields written before remap, and reports one that changed when remap was enabled', () => {
    const { ae, h, user } = setup();
    ae.cfg.ownRemapKeys = (layer) => {
      layer._states.find((s) => s.name === 'Имя').value = 'reset by AE'; // a value lost when remap was enabled
      return [[0, 0], [6, 6]];
    };
    const r = insert(h, user, { lenSec: 9, fields: [{ egpName: 'Имя', type: 'text', value: 'Анна' }] });
    expect(r.ok).toBe(true);
    expect(r.data.fields).toEqual([{ egpName: 'Имя', written: 'Анна', back: 'reset by AE', ok: false }]);
  });

  it('adds keys of a shorter insert', () => {
    const { h, user } = setup();
    const r = insert(h, user, { lenSec: 5, timeSec: 1 });
    expect(r.data.remapKeys).toEqual([[0, 0], [2.2, 2.2], [3, 4], [5, 6]]);
    expect([user.layer(1).inPoint, user.layer(1).outPoint]).toEqual([1, 6]);
  });

  it('lets the keys of an insert one outro longer replace both of the keys AE added (nothing to remove)', () => {
    const { ae, h, user } = setup();
    const r = insert(h, user, { lenSec: 8 });
    expect(r.data.remapKeys).toEqual([[0, 0], [2.2, 2.2], [6, 4], [8, 6]]);
    expect(ae.ops('remap.removeKey')).toEqual([]);
    expect(r.data.warnings).toEqual([]);
  });

  it('removes every key of AE from the last index down, and none of its keys that became ours', () => {
    const { ae, h, user } = setup({ mock: { ownRemapKeys: () => [[0, 0], [1, 1], [3, 3], [6, 6]] } });
    const r = insert(h, user, { lenSec: 9 });
    // by time: 0 (ours over AE's), 1, 2.2 (ours), 3, 6, 7 (ours), 9 (ours): indexes 2, 4 and 5 are AE's
    expect(ae.ops('remap.removeKey')).toEqual(['remap.removeKey 5', 'remap.removeKey 4', 'remap.removeKey 2']);
    expect(r.data.remapKeys).toEqual(KEYS_9);
    expect(r.data.warnings).toEqual([]);
  });

  it('keeps its own key when it sits close to a key of AE: AE\'s own keys go, by what they were, not by time', () => {
    // AE's end key at 6 s is 0.008 s from ours at 6.008 (not a tie): going by time would keep the wrong one.
    const { ae, h, user } = setup();
    const r = insert(h, user, { lenSec: 8.008 });
    expect(r.data.remapKeys).toEqual([[0, 0], [2.2, 2.2], [6.008, 4], [8.008, 6]]);
    expect(ae.ops('remap.removeKey')).toEqual(['remap.removeKey 3']);
    expect(user.layer(1).remapKeys()).toEqual(r.data.remapKeys);
  });

  it('is no remap when the length is the template length, within half a frame of the comp', () => {
    const { ae, h, user } = setup();
    for (const lenSec of [6, 6.015, 5.985]) {
      const r = insert(h, user, { lenSec });
      expect(r.ok).toBe(true);
      expect(r.data).not.toHaveProperty('remapKeys');
    }
    expect(layerOps(ae)).toEqual([]);
    expect(user.layer(1).timeRemapEnabled).toBe(false);
    expect(user.layer(1).outPoint - user.layer(1).inPoint).toBe(6);
    const r = insert(h, user, { lenSec: 6.03 }); // more than half a frame of 25 fps
    expect(r.data.remapKeys).toEqual([[0, 0], [2.2, 2.2], [4.03, 4], [6.03, 6]]);
  });

  it('takes half a frame of the target comp, not of the template', () => {
    const { h, user } = setup({ comp: { fps: 60 } }); // half a frame is 8.3 ms
    expect(insert(h, user, { lenSec: 6.01 }).data.remapKeys).toBeDefined();
    expect(insert(h, user, { lenSec: 6.005 }).data).not.toHaveProperty('remapKeys');
  });

  it('keeps its own keys when AE rounds key times to the frame grid (29.97 fps), within half a frame', () => {
    const { h, user } = setup({ mock: { snapKeys: true }, comp: { fps: 30000 / 1001 } });
    const lenSec = 270 / (30000 / 1001);
    const r = insert(h, user, { lenSec, timeSec: 0 });
    expect(r.ok).toBe(true);
    expect(r.data.warnings).toEqual([]);
    expect(r.data.remapKeys).toHaveLength(4);
    expect(r.data.remapKeys[1][0]).toBeCloseTo(66 / (30000 / 1001), 5); // 2.2 s, snapped to frame 66
    expect(r.data.remapKeys[1][1]).toBe(2.2);
    expect(user.layer(1).outPoint).toBeCloseTo(lenSec, 9);
  });

  it('warns when AE collapses two keys onto one frame, and reports the keys that are there', () => {
    const { h, user } = setup({ mock: { snapKeys: true }, comp: { fps: 30000 / 1001 } });
    const r = insert(h, user, { lenSec: 4.21, timeSec: 0 }); // hold of 0.01 s: keys 2 and 3 land on frame 66
    expect(r.ok).toBe(true);
    expect(r.data.warnings).toContain('REMAP_KEYS_MISMATCH');
    expect(r.data.remapKeys).toHaveLength(3);
    expect(user.numLayers).toBe(1);
  });

  it('warns when AE leaves the out point where it was', () => {
    const { ae, h, user } = setup();
    ae.cfg.ownRemapKeys = (layer) => {
      Object.defineProperty(layer, 'outPoint', { get: () => layer._start + 6, set() {} });
      return [[0, 0], [6, 6]];
    };
    const r = insert(h, user, { lenSec: 9 });
    expect(r.ok).toBe(true);
    expect(r.data.warnings).toContain('LENGTH_NOT_APPLIED');
    expect(r.data.placed.endSec).toBe(8);
  });

  it('warns when the template comp is not as long as the library says', () => {
    const { h, user } = setup({ aep: ttlAep({ duration: 5 }) });
    const r = insert(h, user, { lenSec: 6 });
    expect(r.ok).toBe(true);
    expect(r.data.warnings).toContain('TEMPLATE_DURATION_MISMATCH');
  });

  it('takes a template with no intro or no outro: keys at one time are one key', () => {
    const { h, user } = setup();
    expect(insert(h, user, { lenSec: 8, inSec: 0 }).data.remapKeys).toEqual([[0, 0], [6, 4], [8, 6]]);
    expect(insert(h, user, { lenSec: 8, outSec: 6 }).data.remapKeys).toEqual([[0, 0], [2.2, 2.2], [8, 6]]);
  });
});

describe('ae adapter: insertItem leaves one new layer, selected', () => {
  it('selects only the new layer and deselects the rest of the comp', () => {
    const { ae, h, user } = setup();
    const other = ae.addComp('Other', { duration: 10 });
    const old = [user.layers.add(other), user.layers.add(other), user.layers.add(other)];
    old[0].selected = true;
    old[2].selected = true;
    const r = insert(h, user, { fields: TTL_FIELDS });
    expect(r.ok).toBe(true);
    expect(user.numLayers).toBe(4);
    expect(user.selectedLayers.map((l) => l.id)).toEqual([user.layer(1).id]);
    expect(old.map((l) => l.selected)).toEqual([false, false, false]);
    expect(r.data.placed.id).toBe(String(user.layer(1).id));
    expect(r.data.warnings).toEqual([]);
  });

  it('selects the layer of a remapped insert too', () => {
    const { h, user } = setup();
    insert(h, user);
    insert(h, user, { lenSec: 9, timeSec: 20 });
    expect(user.selectedLayers).toHaveLength(1);
    expect(user.selectedLayers[0]).toBe(user.layer(1));
  });

  it('warns, and keeps the layer, when the selection cannot be changed', () => {
    const { h, user } = setup();
    Object.defineProperty(user, 'selectedLayers', { get() { throw new Error('Object is invalid'); } });
    const r = insert(h, user);
    expect(r.ok).toBe(true);
    expect(r.data.warnings).toEqual([expect.stringMatching(/^SELECTION_FAILED: /)]);
    expect(user.numLayers).toBe(1);
  });

  it('names the layer by its index when AE gives layers no id', () => {
    const { h, user } = setup();
    const add = user.layers.add;
    user.layers.add = (item) => {
      const layer = add(item);
      delete layer.id;
      return layer;
    };
    insert(h, user);
    const r = insert(h, user, { timeSec: 5 });
    expect(r.data.placed.id).toBe('1');
    expect(h.call('findPlaced', { kind: 'layer', targetId: String(user.id), startSec: 5, name: TTL_COMP }).data.id).toBe('1');
  });

  it('warns when the layer does not start where it was told to', () => {
    const { h, user } = setup();
    const add = user.layers.add;
    user.layers.add = (item) => {
      const layer = add(item);
      Object.defineProperty(layer, 'startTime', { get: () => layer._start + 1, set() {} });
      return layer;
    };
    const r = insert(h, user);
    expect(r.ok).toBe(true);
    expect(r.data.warnings).toContain('LAYER_START_MISMATCH');
  });
});

describe('ae adapter: insertItem, the library path', () => {
  it('imports from a path with Cyrillic, as the library may sit in a profile folder with a Russian name', () => {
    const ae = createAe();
    const path = 'C:/Users/Глеб/AppData/Local/BrandKit/items/TTL_LowerThird/TTL_LowerThird_v1.aep';
    ae.defineAep(path, ttlAep());
    const user = ae.addComp('USER_Comp', { duration: 30 });
    ae.activate(user);
    const h = loadAdapter('ae', ae.globals);
    const r = h.call('insertItem', insertArgs(user, { aepPath: path }));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(ae.imports).toEqual([{ path, suppressed: true }]);
  });
});

describe('ae adapter: insertItem when something fails after the layer is added', () => {
  it('INSERT_FAILED and no layer when time remap cannot be switched on, the other layers left alone', () => {
    const { ae, h, user } = setup({ mock: { canSetRemap: false } });
    const other = user.layers.add(ae.addComp('Other', { duration: 10 }));
    other.selected = true;
    const r = insert(h, user, { lenSec: 9, fields: TTL_FIELDS });
    refused(r, 'INSERT_FAILED');
    expect(user.numLayers).toBe(1);
    expect(user.layer(1)).toBe(other);
    expect(other.selected).toBe(true);
    expect(ae.ops('layer.remove')).toEqual([`layer.remove ${TTL_COMP}`]);
    expectBalanced(ae);
    expect(ae.groups).toHaveLength(1);
  });

  it('INSERT_FAILED and no layer when AE accepts time remap and does not switch it on', () => {
    const { ae, h, user } = setup({ mock: { remapIgnored: true } });
    refused(insert(h, user, { lenSec: 9 }), 'INSERT_FAILED');
    expect(user.numLayers).toBe(0);
    expect(ae.ops('remap.')).toEqual([]);
    expectBalanced(ae);
  });

  it('removes the layer and reports the exception when any step throws', () => {
    const { ae, h, user } = setup();
    ae.cfg.ownRemapKeys = () => {
      throw new Error('boom inside AE');
    };
    const r = insert(h, user, { lenSec: 9 });
    expect(r).toMatchObject({ ok: false, error: { code: 'HOST_EXCEPTION', message: expect.stringContaining('boom inside AE') } });
    expect(user.numLayers).toBe(0);
    expectBalanced(ae);
  });

  it('closes the undo group and the dialog suppression on every refusal that comes after they open', () => {
    const cases = [
      [{ mock: { importThrows: true } }, {}],
      [{ mock: { layersAddThrows: true } }, {}],
      [{ mock: { canSetRemap: false } }, { lenSec: 9 }],
      [{}, { aeComp: 'nothing' }],
    ];
    for (const [options, over] of cases) {
      const { ae, h, user } = setup(options);
      expect(insert(h, user, over).ok).toBe(false);
      expectBalanced(ae);
      expect(ae.groups.length).toBeGreaterThan(0);
    }
  });

  it('survives a failing endUndoGroup without hiding the result', () => {
    const { ae, h, user } = setup();
    const end = ae.app.endUndoGroup;
    ae.app.endUndoGroup = () => {
      end();
      throw new Error('end failed');
    };
    expect(insert(h, user).ok).toBe(true);
  });
});

describe('ae adapter: findPlaced', () => {
  const probe = (user, over = {}) => ({ kind: 'layer', targetId: String(user.id), startSec: 2, name: TTL_COMP, ...over });

  it('finds the layer by comp, source name and start time', () => {
    const { h, user } = setup();
    insert(h, user, { timeSec: 2 });
    const second = insert(h, user, { timeSec: 5, lenSec: 9 });
    const first = h.call('findPlaced', probe(user));
    expect(first.ok).toBe(true);
    expect(first.data).toEqual({ kind: 'layer', id: String(user.layer(2).id), name: TTL_COMP, startSec: 2, endSec: 8 });
    expect(h.call('findPlaced', probe(user, { startSec: 5 })).data).toEqual(second.data.placed);
  });

  it('matches the start within half a frame, and not beyond', () => {
    const { h, user } = setup();
    insert(h, user, { timeSec: 2 });
    expect(h.call('findPlaced', probe(user, { startSec: 2.015 })).data).toMatchObject({ startSec: 2 });
    expect(h.call('findPlaced', probe(user, { startSec: 2.03 })).data).toBeNull();
    expect(h.call('findPlaced', probe(user, { startSec: 1.97 })).data).toBeNull();
  });

  it('answers with the newest layer (the lowest index) when several match', () => {
    const { h, user } = setup();
    insert(h, user, { timeSec: 2 });
    insert(h, user, { timeSec: 2, lenSec: 9 });
    expect(h.call('findPlaced', probe(user)).data).toMatchObject({ id: String(user.layer(1).id), endSec: 11 });
  });

  it('is null when no layer fits: another source, another start, another comp, a missing comp, a non-comp item', () => {
    const { ae, h, user } = setup();
    insert(h, user, { timeSec: 2 });
    const other = ae.addComp('Other comp', { duration: 10 });
    expect(h.call('findPlaced', probe(user, { name: 'CR_TTL_LowerThird_9x16_v1' })).data).toBeNull();
    expect(h.call('findPlaced', probe(user, { startSec: 9 })).data).toBeNull();
    expect(h.call('findPlaced', probe(other)).data).toBeNull();
    expect(h.call('findPlaced', probe(user, { targetId: '9999' })).data).toBeNull();
    expect(h.call('findPlaced', probe(user, { targetId: String(ae.addFolder('F').id) })).data).toBeNull();
  });

  it('does not use the layer name: the user may rename a layer, its source is what counts', () => {
    const { h, user } = setup();
    insert(h, user, { timeSec: 2 });
    user.layer(1).name = 'My title';
    expect(h.call('findPlaced', probe(user)).data).toMatchObject({ name: 'My title' });
  });

  it('skips a layer whose source cannot be read, and a layer with no source', () => {
    const { ae, h, user } = setup();
    insert(h, user, { timeSec: 2 });
    const bad = user.layers.add(ae.addComp('Bad', { duration: 10 }));
    Object.defineProperty(bad, 'source', { get() { throw new Error('Object is invalid'); } });
    const none = user.layers.add(ae.addComp('None', { duration: 10 }));
    Object.defineProperty(none, 'source', { value: null });
    expect(h.call('findPlaced', probe(user)).data).toMatchObject({ startSec: 2 });
  });

  it('refuses a probe that is not one', () => {
    const { h, user } = setup();
    refused(h.call('findPlaced', { kind: 'layer', startSec: 2, name: TTL_COMP }), 'BAD_ARGS');
    refused(h.call('findPlaced', probe(user, { name: '' })), 'BAD_ARGS');
    refused(h.call('findPlaced', probe(user, { startSec: 'now' })), 'BAD_ARGS');
    refused(h.call('findPlaced', probe(user, { kind: 'clip' })), 'BAD_ARGS');
  });

  it('is a read: it changes nothing', () => {
    const { ae, h, user } = setup();
    insert(h, user, { timeSec: 2 });
    const before = ae.ops().length;
    h.call('findPlaced', probe(user));
    expect(ae.ops().length).toBe(before);
  });
});

describe('ae adapter: checkFonts', () => {
  const SB = (version, over = {}) => ({ version, location: 'C:\\Windows\\Fonts\\SBSansText-Regular.otf', isSubstitute: false, ...over });

  it('says found, with the build, for a font that is installed', () => {
    const { ae, h } = setup();
    ae.setFonts('SBSansText-Regular', [SB('1.003')]);
    expect(h.call('checkFonts', ['SBSansText-Regular'])).toEqual({
      ok: true,
      data: [{ postScriptName: 'SBSansText-Regular', found: true, build: '1.003', substitute: false }],
    });
  });

  it('says substitute for a font AE replaced (isSubstitute, or Times as the file) and missing for none', () => {
    const { ae, h } = setup();
    ae.setFonts('A-Sub', [SB('1.0', { isSubstitute: true })]);
    ae.setFonts('B-Times', [SB('1.0', { location: 'C:\\Windows\\Fonts\\times.ttf' })]);
    ae.setFonts('C-Empty', []);
    expect(h.call('checkFonts', ['A-Sub', 'B-Times', 'C-Empty', 'D-Unknown']).data).toEqual([
      { postScriptName: 'A-Sub', found: false, build: null, substitute: true },
      { postScriptName: 'B-Times', found: false, build: null, substitute: true },
      { postScriptName: 'C-Empty', found: false, build: null, substitute: false },
      { postScriptName: 'D-Unknown', found: false, build: null, substitute: false },
    ]);
  });

  it('takes the font of that name that is not a substitute when AE lists several, the first of them', () => {
    const { ae, h } = setup();
    ae.setFonts('SBSansDisplay-Bold', [SB('1.000', { isSubstitute: true }), SB('1.002'), SB('1.003')]);
    expect(h.call('checkFonts', ['SBSansDisplay-Bold']).data).toEqual([
      { postScriptName: 'SBSansDisplay-Bold', found: true, build: '1.002', substitute: false },
    ]);
  });

  it('has no build when AE gives no version, and a number version as text', () => {
    const { ae, h } = setup();
    ae.setFonts('A', [SB(undefined)]);
    ae.setFonts('B', [SB(1.5)]);
    ae.setFonts('C', [SB('')]);
    expect(h.call('checkFonts', ['A', 'B', 'C']).data.map((f) => [f.found, f.build])).toEqual([[true, null], [true, '1.5'], [true, null]]);
  });

  it('does not call Times New Roman itself a substitute', () => {
    const { ae, h } = setup();
    ae.setFonts('TimesNewRomanPSMT', [SB('7.0', { location: 'C:\\Windows\\Fonts\\times.ttf' })]);
    expect(h.call('checkFonts', ['TimesNewRomanPSMT']).data[0]).toMatchObject({ found: true, build: '7.0', substitute: false });
  });

  it('takes the names as a list or as { psNames }, and nothing else', () => {
    const { ae, h } = setup();
    ae.setFonts('A', [SB('1.0')]);
    expect(h.call('checkFonts', { psNames: ['A'] }).data).toEqual(h.call('checkFonts', ['A']).data);
    expect(h.call('checkFonts', []).data).toEqual([]);
    for (const bad of [{}, { psNames: 'A' }, ['A', 7], [null]]) refused(h.call('checkFonts', bad), 'BAD_ARGS');
  });

  it('fails with a code when the app has no fonts object', () => {
    const { ae, h } = setup();
    ae.app.fonts = undefined;
    refused(h.call('checkFonts', ['A']), 'FONTS_UNAVAILABLE');
  });

  it('is a read: it changes nothing', () => {
    const { ae, h } = setup();
    h.call('checkFonts', ['A']);
    expectUntouched(ae);
  });
});

describe('ae adapter: diag', () => {
  it('reports the app, the build, the language, the project, the colour, the engine and the bin', () => {
    const { ae, h, user } = setup();
    insert(h, user);
    seedTemplate(ae, { key: 'LOGO_Mark@1' });
    expect(h.call('diag')).toEqual({
      ok: true,
      data: {
        app: '26.5x89',
        build: h.build,
        language: 'en_US',
        projectPath: 'C:\\Users\\Test\\Projects\\job.aep',
        dirty: false,
        colour: { workingSpace: 'None', linearize: false, bpc: 8 },
        expressionEngine: 'javascript-1.0',
        json: 'native',
        bins: 1,
        bin: [
          { name: 'TTL_LowerThird_v1.aep', comment: TTL_KEY },
          { name: 'TTL_LowerThird_v1.aep', comment: 'LOGO_Mark@1' },
        ],
      },
    });
  });

  it('works with no bin and an untitled project, and does not fail on duplicate bins', () => {
    const { ae, h } = setup({ mock: { file: null, language: 'ru_RU', dirty: true } });
    expect(h.call('diag').data).toMatchObject({ projectPath: null, dirty: true, language: 'ru_RU', bins: 0, bin: [] });
    ae.addFolder(BIN);
    ae.addFolder(BIN);
    expect(h.call('diag').data).toMatchObject({ bins: 2 });
  });

  it('reads defensively and tells the polyfill from the native JSON', () => {
    const { ae, h } = setup({ adapter: { nativeJson: false } });
    Object.defineProperty(ae.app.project, 'workingSpace', { get() { throw new Error('x'); } });
    const r = h.call('diag');
    expect(r.ok).toBe(true);
    expect(r.data).not.toHaveProperty('colour');
    expect(r.data.json).toBe('polyfill');
  });

  it('is a read: it changes nothing', () => {
    const { ae, h } = setup();
    h.call('diag');
    expectUntouched(ae);
  });
});

describe('ae adapter: the engine of After Effects 26.5', () => {
  // Plain objects of the engine, and in this run the host objects too, inherit '*', '+', '-' and '/' members.
  const NAMES = ['+', '*', '-', '/', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'length'];

  it('finds a property by a name that is an operator or an Object.prototype member, and writes it', () => {
    const eps = NAMES.map((name, i) => ({ name, kind: 'text', value: 'a' + i }));
    const { h, user } = setup({ mock: { operators: true }, aep: ttlAep({ eps }) });
    expect(h.run("typeof ({})['+'] + typeof ({})['/']")).toBe('functionfunction'); // the engine has them
    const fields = NAMES.map((name, i) => ({ egpName: name, type: 'text', value: 'Ё' + i }));
    const r = insert(h, user, { fields, lenSec: 9 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data.fields).toEqual(fields.map((f) => ({ egpName: f.egpName, written: f.value, back: f.value, ok: true })));
    expect(r.data.warnings).toEqual([]);
  });

  it('does not find a property in a table that is not there: no match for a name only Object.prototype has', () => {
    const { h, user } = setup({ mock: { operators: true } });
    const names = ['+', '*', '-', '/', 'constructor', 'toString', 'isPrototypeOf', '__proto__'];
    const r = insert(h, user, { fields: names.map((n) => ({ egpName: n, type: 'text', value: 'x' })) });
    expect(r.ok).toBe(true);
    expect(r.data.fields.map((f) => [f.back, f.ok])).toEqual(names.map(() => [null, false]));
    expect(r.data.warnings).toEqual(names.map((n) => `FIELD_NOT_FOUND: ${n}`));
  });

  it('works through every function with the operators on the host objects and in the engine', () => {
    const { ae, h, user } = setup({ mock: { operators: true } });
    ae.setFonts('A', [{ version: '1.0', location: 'C:\\f.otf', isSubstitute: false }]);
    expect(h.call('getContext').ok).toBe(true);
    expect(insert(h, user, { lenSec: 9, fields: TTL_FIELDS }).ok).toBe(true);
    expect(h.call('findPlaced', { kind: 'layer', targetId: String(user.id), startSec: 2, name: TTL_COMP }).data).not.toBeNull();
    expect(h.call('checkFonts', ['A']).ok).toBe(true);
    expect(h.call('diag').ok).toBe(true);
  });

  it('works without the operators too (Premiere has none, and so does an AE before 26.5)', () => {
    const { h, user } = setup({ adapter: { aeOperators: false } });
    expect(h.run("typeof ({})['+']")).toBe('undefined');
    expect(insert(h, user, { lenSec: 9, fields: TTL_FIELDS }).ok).toBe(true);
  });

  it('runs on the JSON polyfill, the way an AE session with no native JSON does', () => {
    const { h, user } = setup({ adapter: { nativeJson: false } });
    const r = insert(h, user, { lenSec: 9, fields: TTL_FIELDS });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data.remapKeys).toEqual([[0, 0], [2.2, 2.2], [7, 4], [9, 6]]);
    expect(r.data.fields.every((f) => f.ok)).toBe(true);
    expect(h.call('getContext').ok).toBe(true);
  });

  it('answers with ASCII JSON whatever the text', () => {
    const { h, user } = setup();
    const raw = h.run(callSource('insertItem', insertArgs(user, { fields: TTL_FIELDS })));
    expect(raw).toMatch(/^[\x00-\x7f]*$/);
    expect(JSON.parse(raw).data.fields[0].back).toBe('Анна-Мария Ёлкина × 2');
  });

  it('lists the five functions, adds no global but CRBK, and lints without a warning', () => {
    const { h, user } = setup();
    expect(h.run('CRBK.host')).toBe('ae');
    expect(JSON.parse(h.run("JSON.stringify([typeof CRBK.fns.getContext, typeof CRBK.fns.insertItem, typeof CRBK.fns.findPlaced, typeof CRBK.fns.checkFonts, typeof CRBK.fns.diag])")))
      .toEqual(Array(5).fill('function'));
    h.call('getContext');
    insert(h, user, { lenSec: 9 });
    h.call('findPlaced', { kind: 'layer', targetId: String(user.id), startSec: 2, name: TTL_COMP });
    h.call('checkFonts', []);
    h.call('diag');
    h.load();
    expect(h.addedGlobals()).toEqual(['CRBK']);
    expect(assembleAdapter('ae').warnings).toEqual([]);
  });

  it('never opens, saves or closes a project, whatever the call', () => {
    const { ae, h, user } = setup();
    h.call('getContext');
    insert(h, user, { lenSec: 9, fields: TTL_FIELDS });
    insert(h, user, { aeComp: 'nothing' });
    h.call('diag');
    expect(ae.forbidden).toEqual([]);
  });

  it('keeps nothing between calls: a reload of the same build changes no result', () => {
    const { h, user } = setup();
    const first = insert(h, user, { fields: TTL_FIELDS });
    h.load();
    const second = insert(h, user, { fields: TTL_FIELDS, timeSec: 3 });
    expect(second.data.fields).toEqual(first.data.fields);
  });
});

// The adapter and the core agree on the arguments and on the reply: the real library, the real plan.
describe('ae adapter: with the core and the library of pack 1', () => {
  const ROOT = 'C:/CRBK/work/library';
  const KIND = { text: 'text', dropdown: 'dropdown', checkbox: 'checkbox', slider: 'slider' };

  // The EP set of an instance for a catalog item: the fields in reverse (the newest controller first).
  function epsOf(item) {
    return [...(item.fields ?? [])]
      .filter((f) => f.egpName && KIND[f.type])
      .sort((a, b) => b.egpIndex - a.egpIndex)
      .map((f) => ({
        name: f.egpName,
        kind: KIND[f.type],
        value: f.type === 'checkbox' ? (f.default ? 1 : 0) : f.default ?? (f.type === 'text' ? '' : 1),
        count: f.options ? f.options.length : undefined,
      }));
  }

  function project(item, { fps = 25, snapKeys = false } = {}) {
    const ae = createAe({ snapKeys });
    const D = defaultLen(item);
    ae.defineAep(`${ROOT}/${item.aep.file}`, {
      comps: item.variants.map((v) => ({ name: v.aeComp, w: v.w, h: v.h, fps: v.fps, duration: D, eps: epsOf(item) })),
    });
    const user = ae.addComp('Композиция 1', { w: 1920, h: 1080, fps, duration: 60 });
    user.time = Math.round(12 * fps) / fps; // the CTI sits on a frame
    ae.activate(user);
    return { ae, h: loadAdapter('ae', ae.globals), user };
  }

  const hostApi = (h) => ({
    getContext: async () => h.call('getContext'),
    insertItem: async (a) => h.call('insertItem', a),
    findPlaced: async (p) => h.call('findPlaced', p),
    checkFonts: async (n) => h.call('checkFonts', n),
    diag: async () => h.call('diag'),
  });

  const silent = createLogger(() => {}, () => new Date('2026-10-05T12:00:00Z'));

  it.each(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird'])('%s: runInsert gets a clean result at the default and at a longer length', async (id) => {
    const it = catalogItem(id);
    for (const factor of [1, 1.5]) {
      const { ae, h, user } = project(it);
      const ctx = h.call('getContext').data;
      expect(ctx.target).toMatchObject({ id: String(user.id), w: 1920, h: 1080, fps: 25, timeSec: 12 });
      const D = defaultLen(it);
      const values = defaults(it);
      const plan = planInsert({
        item: it, choice: chooseVariant(it, ctx.target), values, lenSec: D * factor, ctx, fonts: fontsFor(it), pluginVersion: '0.1.0',
      });
      expect(plan.issues).toEqual([]);
      const args = buildArgs(plan, ctx, ROOT);
      const out = await runInsert(hostApi(h), plan, ctx, args, silent);
      expect(out, JSON.stringify(out)).toMatchObject({ ok: true, issues: [] });
      expect(out.result.fields).toHaveLength(plan.fieldWrites.length);
      expect(out.result.fields.every((f) => f.ok)).toBe(true);
      expect(out.result.warnings).toEqual([]);
      const layer = user.layer(1);
      expect(layer.source.name).toBe(args.aeComp);
      expect(layer.inPoint).toBe(12);
      expect(layer.outPoint).toBeCloseTo(12 + plan.lenSec, 9);
      if (factor === 1) {
        expect(out.result).not.toHaveProperty('remapKeys');
      } else {
        expect(out.result.remapKeys).toEqual(c27Keys(args.durSec, args.inSec, args.outSec, plan.lenSec));
      }
      // what the core asks after a lost reply finds the layer
      const found = h.call('findPlaced', { kind: 'layer', targetId: ctx.target.id, startSec: ctx.target.timeSec, name: args.aeComp });
      expect(found.data).toEqual(out.result.placed);
      expectBalanced(ae);
    }
  });

  it('TTL_LowerThird: every field of the form lands in the Essential Property of its name', async () => {
    const it = catalogItem('TTL_LowerThird');
    const { h, user } = project(it);
    const ctx = h.call('getContext').data;
    const values = { ...defaults(it), name: 'Анна-Мария Ёлкина', role1: 'Директор × 2', style: 3, side: 2, speed: 5, size: 4 };
    const plan = planInsert({ item: it, choice: chooseVariant(it, ctx.target), values, lenSec: 8, ctx, fonts: fontsFor(it), pluginVersion: '0.1.0' });
    const out = await runInsert(hostApi(h), plan, ctx, buildArgs(plan, ctx, ROOT), silent);
    expect(out.ok).toBe(true);
    const layer = user.layer(1);
    expect(['Имя', 'Должность', 'Стиль', 'Сторона', 'Скорость', 'Размер текста'].map((n) => layer.epValue(n)))
      .toEqual(['Анна-Мария Ёлкина', 'Директор × 2', 3, 2, 5, 4]);
    expect(toWrites(it, values, 'ae').map((w) => w.egpName)).toEqual(out.result.fields.map((f) => f.egpName));
  });

  it('LOGO_Mark: the checkbox goes in as 1 or 0', async () => {
    const it = catalogItem('LOGO_Mark');
    const { h, user } = project(it);
    const ctx = h.call('getContext').data;
    const values = { ...defaults(it), plate: false };
    const plan = planInsert({ item: it, choice: chooseVariant(it, ctx.target), values, lenSec: defaultLen(it), ctx, fonts: fontsFor(it), pluginVersion: '0.1.0' });
    const out = await runInsert(hostApi(h), plan, ctx, buildArgs(plan, ctx, ROOT), silent);
    expect(out.ok).toBe(true);
    expect(user.layer(1).epValue('Подложка')).toBe(0);
  });

  // The lengths the core sends keep a whole frame of hold, so AE rounding key times to the frame grid cannot bring the
  // keys of the end of the intro and the start of the outro onto one frame, at any frame rate of the comp.
  it.each([24, 25, 30000 / 1001, 30, 50, 60])('%s fps comp: the keys of every length the core plans stay four, snapped or not', async (fps) => {
    for (const id of ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']) {
      const it = catalogItem(id);
      for (const lenSec of [minLen(it), defaultLen(it) * 1.5, defaultLen(it) * 3]) {
        const { h, user } = project(it, { fps, snapKeys: true });
        const ctx = h.call('getContext').data;
        const plan = planInsert({ item: it, choice: chooseVariant(it, ctx.target), values: defaults(it), lenSec, ctx, fonts: fontsFor(it), pluginVersion: '0.1.0' });
        const out = await runInsert(hostApi(h), plan, ctx, buildArgs(plan, ctx, ROOT), silent);
        const where = `${id} at ${fps} fps, ${lenSec} s`;
        expect(out.ok, where + ' ' + JSON.stringify(out)).toBe(true);
        expect(out.result.warnings, where).toEqual([]);
        expect(out.result.fields.every((f) => f.ok), where).toBe(true);
        expect(out.result.remapKeys, where).toHaveLength(4);
        expect(user.layer(1).outPoint - user.layer(1).inPoint, where).toBeCloseTo(plan.lenSec, 6);
      }
    }
  });
});

// The mock is only as good as the AE behaviours it keeps; these are the ones the adapter is written around.
describe('ae mock: the After Effects behaviours the adapter relies on', () => {
  function layerOf(mock = {}) {
    const ae = createAe(mock);
    const tpl = ae.addComp('TPL', { duration: 6, eps: TTL_EPS });
    const comp = ae.app.project.items.addComp('USER', 1920, 1080, 1, 30, 25);
    const layer = comp.layers.add(tpl);
    layer.startTime = 2;
    return { ae, comp, tpl, layer };
  }

  it('lets the out point run past the end of the source only with time remap on, and resets it on enabling', () => {
    const { layer } = layerOf();
    layer.outPoint = 17;
    expect(layer.outPoint).toBe(8);
    layer.timeRemapEnabled = true;
    layer.outPoint = 17;
    expect(layer.outPoint).toBe(17);
    layer.timeRemapEnabled = false;
    layer.timeRemapEnabled = true;
    expect(layer.outPoint).toBe(8);
  });

  it('adds two keys of its own on enabling, replaces a key at the same time, and turns remap off with the last key', () => {
    const { layer } = layerOf();
    layer.timeRemapEnabled = true;
    const tr = layer.property('ADBE Time Remapping');
    expect([tr.numKeys, tr.keyTime(1), tr.keyValue(1), tr.keyTime(2), tr.keyValue(2)]).toEqual([2, 2, 0, 8, 6]);
    tr.setValueAtTime(2, 0.5);
    expect([tr.numKeys, tr.keyValue(1)]).toEqual([2, 0.5]);
    tr.removeKey(2);
    tr.removeKey(1);
    expect(layer.timeRemapEnabled).toBe(false);
    expect(layer.property('ADBE Time Remapping')).toBeNull();
    expect(() => tr.numKeys).toThrow(/invalid/);
  });

  it('drops the Essential Properties objects taken before remap was enabled', () => {
    const { layer } = layerOf();
    const group = layer.essentialProperty;
    const prop = group.property(1);
    expect(prop.name).toBe('Размер текста');
    layer.timeRemapEnabled = true;
    expect(() => group.numProperties).toThrow(/invalid/);
    expect(() => prop.value).toThrow(/invalid/);
    expect(layer.essentialProperty.numProperties).toBe(TTL_EPS.length);
  });

  it('takes a text through a TextDocument only, and a number for the others', () => {
    const { layer } = layerOf();
    const props = layer.essentialProperty;
    const find = (name) => [1, 2, 3, 4, 5, 6, 7].map((i) => props.property(i)).find((p) => p.name === name);
    expect(() => find('Имя').setValue('plain string')).toThrow();
    expect(() => find('Стиль').setValue('2')).toThrow();
    const doc = find('Имя').value;
    doc.text = 'Анна';
    find('Имя').setValue(doc);
    expect(find('Имя').value.text).toBe('Анна');
  });

  it('starts a new layer at the CTI, or at 0 with the composition-start preference, on top of the others', () => {
    for (const [createAtCompStart, start] of [[false, 4], [true, 0]]) {
      const { ae, comp, tpl } = layerOf({ createAtCompStart });
      comp.time = 4;
      const second = comp.layers.add(tpl);
      expect(second.startTime).toBe(start);
      expect(second.index).toBe(1);
      expect(comp.layer(2).startTime).toBe(2);
      expect(ae.app.project.numItems).toBe(2);
    }
  });

  it('keeps every host call that opens, saves or closes a project out of reach of the adapter', () => {
    const ae = createAe();
    ae.app.open();
    ae.app.newProject();
    ae.app.project.save();
    ae.app.project.close();
    expect(ae.forbidden).toEqual(['app.open', 'app.newProject', 'project.save', 'project.close']);
  });
});
