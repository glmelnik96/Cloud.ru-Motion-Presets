import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compFiles, dumpProject, packProject, parseArgs, composeDumpJsx } from '../../tools/dump/dump.mjs';
import { compSlugs } from '../../tools/packs/slug.mjs';

// A fake host that answers the three ops the way dump-project.jsx does and writes the files it is asked to.
function fakeHost(comps, { failId = null } = {}) {
  const calls = [];
  const host = async (params) => {
    calls.push(params.op + (params.compId ? ':' + params.compId : ''));
    if (params.op === 'open') {
      writeFileSync(params.out, JSON.stringify({ schema: 'crbk-dump/1', items: [], comps }));
      return { ok: true, data: { file: 'C:\\x.aep', aeVersion: '26.5', expressionEngine: 'extendscript', numItems: 3, missingFootage: 0, comps, bytes: 10, ms: 1 } };
    }
    if (params.op === 'comp') {
      if (params.compId === failId) return { ok: false, error: { code: 'HOST_EXCEPTION', message: 'boom' } };
      const c = comps.find((x) => x.id === params.compId);
      writeFileSync(params.out, JSON.stringify({ schema: 'crbk-dump/1', comp: { id: c.id, name: c.name }, layers: [{ index: 1 }], truncated: [], stats: {} }));
      return { ok: true, data: { compId: c.id, bytes: 99, truncated: 0, stats: { ms: 5, expressions: 2, expressionErrors: 0 } } };
    }
    return { ok: true, data: { closed: true } };
  };
  return { host, calls };
}

describe('dump.mjs', () => {
  it('derives the relinked copy path from the packs folder (tools/packs/paths.mjs)', () => {
    expect(packProject('logo', {}, 'win32')).toBe('C:/CRBK/packs/logo/logo_relinked.aep');
    expect(packProject('smm', { BRANDKIT_WORK: 'D:\\bk\\work' }, 'win32')).toBe('D:/bk/packs/smm/smm_relinked.aep');
    expect(packProject('podcast', {}, 'darwin')).toBe('/Users/Shared/CRBK/packs/podcast/podcast_relinked.aep');
  });

  it('names comp files by the golden compSlug and moves only index and project aside', () => {
    const comps = [{ id: 796, name: 'Pattern_1' }, { id: 304, name: 'Pattern_1' }, { id: 9, name: 'Project' }, { id: 4, name: 'Index' }, { id: 5, name: 'Pre-comp 1' }];
    const files = compFiles(comps);
    expect([...files.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [4, { compSlug: 'index', file: 'index__4.json' }],
      [5, { compSlug: 'pre_comp_1', file: 'pre_comp_1.json' }],
      [9, { compSlug: 'project', file: 'project__9.json' }],
      [304, { compSlug: 'pattern_1', file: 'pattern_1.json' }],
      [796, { compSlug: 'pattern_1_2', file: 'pattern_1_2.json' }],
    ]);
    const golden = compSlugs(comps); // the names of the golden folders (Task 4)
    for (const [id, f] of files) expect(f.compSlug).toBe(golden.get(id));
  });

  it('parses the CLI', () => {
    expect(parseArgs(['--slug', 'logo'])).toEqual({ slug: 'logo', all: false, project: null, out: null, noEval: false });
    expect(parseArgs(['--slug', 'logo', '--no-eval'])).toMatchObject({ noEval: true });
    expect(parseArgs(['--all'])).toMatchObject({ all: true });
    expect(() => parseArgs([])).toThrow(/usage/);
    expect(() => parseArgs(['--all', '--slug', 'x'])).toThrow(/usage/);
    expect(() => parseArgs(['--slug', 'x', '--bogus'])).toThrow(/unknown argument/);
  });

  it('prepends PARAMS to the JSX', () => {
    expect(composeDumpJsx({ op: 'close', project: 'C:/a.aep' }).split('\n')[0]).toBe('var PARAMS = {"op":"close","project":"C:/a.aep"};');
  });

  it('writes one file per comp, index.json and project.json, then swaps the folder in', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-dump-'));
    const comps = [{ id: 10, name: 'Logo', folder: 'A', numLayers: 1 }, { id: 11, name: 'Logo', folder: 'B', numLayers: 1 }, { id: 12, name: 'Index', folder: 'B', numLayers: 1 }];
    const { host, calls } = fakeHost(comps);
    const index = await dumpProject({ slug: 'logo', project: 'C:/p.aep', outRoot: root.replace(/\\/g, '/'), host, log: () => {} });
    expect(calls).toEqual(['open', 'comp:10', 'comp:11', 'comp:12', 'close']);
    expect(readdirSync(path.join(root, 'logo')).sort()).toEqual(['index.json', 'index__12.json', 'logo.json', 'logo_2.json', 'project.json']);
    expect(existsSync(path.join(root, 'logo.tmp'))).toBe(false);
    expect(index.comps.map((c) => [c.name, c.compSlug, c.file])).toEqual([
      ['Logo', 'logo', 'logo.json'], ['Logo', 'logo_2', 'logo_2.json'], ['Index', 'index', 'index__12.json']]);
    expect(JSON.parse(readFileSync(path.join(root, 'logo', 'index.json'), 'utf8')).schema).toBe('crbk-dump-index/1');
    const one = JSON.parse(readFileSync(path.join(root, 'logo', 'logo_2.json'), 'utf8'));
    expect(one).toMatchObject({ slug: 'logo', compSlug: 'logo_2', comp: { id: 11 } });
  });

  it('records a failed comp and keeps going', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-dump-'));
    const comps = [{ id: 1, name: 'A', numLayers: 1 }, { id: 2, name: 'B', numLayers: 1 }];
    const { host } = fakeHost(comps, { failId: 1 });
    const index = await dumpProject({ slug: 's', project: 'C:/p.aep', outRoot: root.replace(/\\/g, '/'), host, log: () => {} });
    expect(index.errors).toEqual([{ id: 1, name: 'A', error: { code: 'HOST_EXCEPTION', message: 'boom' } }]);
    expect(index.comps.map((c) => c.name)).toEqual(['B']);
  });

  it('stops on a refused open and leaves the previous dump alone', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-dump-'));
    const host = async () => ({ ok: false, error: { code: 'PROJECT_DIRTY', message: 'unsaved' } });
    await expect(dumpProject({ slug: 's', project: 'C:/p.aep', outRoot: root.replace(/\\/g, '/'), host, log: () => {} }))
      .rejects.toThrow(/PROJECT_DIRTY/);
    expect(existsSync(path.join(root, 's'))).toBe(false);
  });
});
