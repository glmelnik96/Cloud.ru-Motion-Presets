import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  child, findLayers, isNfd, layerProp, listDumpDirs, loadDumpDir, loadDumpRoot, nodeValues, propAt, walkLayer,
} from '../../tools/dump/model.mjs';

const prop = (matchName, extra) => ({ matchName, name: matchName, ...extra });
const group = (matchName, children, extra) => ({ matchName, name: matchName, group: 'NAMED_GROUP', children, ...extra });
const key = (time, value) => ({ time, value, inInterp: 'LINEAR', outInterp: 'LINEAR' });

function writeDump(root, slug, comps) {
  const dir = path.join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ slug, comps: comps.map((name, i) => ({ name, file: `c${i}.json` })) }));
  comps.forEach((name, i) => writeFileSync(path.join(dir, `c${i}.json`), JSON.stringify({ comp: { name }, layers: [] })));
}

describe('model', () => {
  it('finds layers and properties by matchName path', () => {
    const dump = { layers: [{ name: 'PROBE_SQ', props: [group('ADBE Transform Group', [prop('ADBE Position', { pvt: 'ThreeD_SPATIAL', keys: [key(0, [1, 2, 0])] })])] }] };
    const probe = findLayers(dump, 'PROBE_SQ')[0];
    expect(layerProp(probe, 'ADBE Transform Group', 'ADBE Position').keys).toHaveLength(1);
    expect(propAt(probe.props, ['ADBE Transform Group', 'ADBE Scale'])).toBeNull();
    expect(child(probe.props[0], 'ADBE Position').pvt).toBe('ThreeD_SPATIAL');
    expect(findLayers(dump, 'nope')).toEqual([]);
  });

  it('walks props, effect params and masks with trails', () => {
    const layer = {
      props: [group('ADBE Transform Group', [prop('ADBE Opacity', { value: 50 })])],
      effects: [{ name: 'Fill', matchName: 'ADBE Fill', params: [prop('ADBE Fill-0002', { pvt: 'COLOR', value: [1, 0, 0, 1] })] }],
      masks: [{ name: 'Mask 1', path: prop('ADBE Mask Shape', { pvt: 'SHAPE' }), other: [] }],
    };
    const seen = [...walkLayer(layer)].map((x) => `${x.area}:${x.trail.join('>')}`);
    expect(seen).toEqual(['props:ADBE Transform Group', 'props:ADBE Transform Group>ADBE Opacity', 'effect:Fill>ADBE Fill-0002', 'mask:Mask 1>ADBE Mask Shape']);
  });

  it('marks nodes under a switched-off group or effect', () => {
    const layer = {
      props: [group('ADBE Vector Group', [prop('ADBE Vector Fill Color', { pvt: 'COLOR' })], { enabled: false })],
      effects: [{ name: 'Fill', matchName: 'ADBE Fill', enabled: false, params: [prop('ADBE Fill-0002', { pvt: 'COLOR' })] }],
      masks: [],
    };
    expect([...walkLayer(layer)].map((x) => x.off)).toEqual([true, true, true]);
  });

  it('returns static or keyed values uniformly', () => {
    expect(nodeValues(prop('x', { value: 3 }))).toEqual([{ time: null, value: 3 }]);
    expect(nodeValues(prop('x', { keys: [key(0, 1), key(1, 2)] }))).toEqual([{ time: 0, value: 1 }, { time: 1, value: 2 }]);
    expect(nodeValues(null)).toEqual([]);
  });

  it('detects NFD names', () => {
    expect(isNfd('Дисклеймер'.normalize('NFD'))).toBe(true);
    expect(isNfd('Дисклеймер')).toBe(false);
    expect(isNfd(null)).toBe(false);
  });

  it('loads a dump folder through index.json, BOM or not', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-model-'));
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ slug: 's', comps: [{ name: 'A', file: 'a.json' }] }));
    writeFileSync(path.join(dir, 'a.json'), String.fromCharCode(0xfeff) + JSON.stringify({ comp: { name: 'A' }, layers: [] }));
    const b = loadDumpDir(dir);
    expect(b.project).toBeNull();
    expect(b.comps[0].comp.name).toBe('A');
  });

  it('loads every pack under a root, skipping the fixture and unfinished folders', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-root-'));
    writeDump(root, 'smm', ['A']);
    writeDump(root, 'logo', ['B', 'C']);
    writeDump(root, 'fixture', ['F']);
    writeDump(root, 'podcast.tmp', ['P']);
    expect(listDumpDirs(root).map((d) => path.basename(d))).toEqual(['logo', 'smm']);
    expect(loadDumpRoot(root).map((b) => [b.index.slug, b.comps.length])).toEqual([['logo', 2], ['smm', 1]]);
    expect(loadDumpRoot(path.join(root, 'missing'))).toEqual([]);
  });
});
