import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  nodeCheck, parseOnly, saveStage, loadStages, rebuildResult, runStages, hostVersionOf,
} from '../../tools/spike/multistage.mjs';
import { appendManualCheck } from '../../tools/spike/result.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-ms-'));

describe('multistage', () => {
  it('builds Node checks', () => {
    expect(nodeCheck('a', true)).toEqual({ name: 'a', pass: true, required: true, detail: '' });
    expect(nodeCheck('b', 1, 'x', false)).toEqual({ name: 'b', pass: false, required: false, detail: 'x' });
  });

  it('parses --only', () => {
    expect(parseOnly(['--only', 'a, b'])).toEqual(['a', 'b']);
    expect(parseOnly([])).toBe(null);
  });

  it('reports one host version, or each host when both answered', () => {
    const st = { a: { host: 'pr', hostVersion: '26.5.2' }, n: { host: 'node' }, b: { host: 'ae', hostVersion: '26.5' } };
    expect(hostVersionOf(st, ['a', 'n'])).toBe('26.5.2');
    expect(hostVersionOf(st, ['b', 'a'])).toBe('AE 26.5; Pr 26.5.2');
    expect(hostVersionOf(st, ['n'])).toBe(null);
  });

  it('rebuilds the result in declared stage order and keeps manual checks on request', () => {
    const dir = tmp();
    saveStage('S5', 'second', { host: 'node', checks: [nodeCheck('n', true)] }, dir);
    saveStage('S5', 'first', { host: 'pr', hostVersion: '26.5.2', checks: [nodeCheck('h', true)], evidence: ['C:/x.png'] }, dir);
    writeFileSync(path.join(dir, 'S5.json'), JSON.stringify({
      id: 'S5', checks: [{ name: 'm', pass: false, required: true, detail: '', manual: true }],
    }));
    const { result } = rebuildResult({ id: 'S5', title: 't', host: 'pr', stageOrder: ['first', 'second'] }, { dir });
    expect(result.checks.map((c) => [c.name, c.stage])).toEqual([['h', 'first'], ['n', 'second'], ['m', undefined]]);
    expect(result.hostVersion).toBe('26.5.2');
    expect(result.evidence).toEqual(['C:/x.png']);
    expect(result.verdict).toBe('no');
    const fresh = rebuildResult({ id: 'S5', title: 't', host: 'pr', stageOrder: ['first', 'second'] }, { dir, keepManual: false });
    expect(fresh.result.verdict).toBe('yes');
  });

  it('runs stages in order, records a throwing stage and stops; --only continues the same run', async () => {
    const dir = tmp();
    const runRoot = tmp();
    const seen = [];
    const stages = [
      { name: 'a', run: async (ctx) => { seen.push('a'); return { checks: [nodeCheck('a ok', true)], data: { dir: ctx.runDir } }; } },
      { name: 'b', run: async () => { seen.push('b'); throw new Error('boom'); } },
      { name: 'c', run: async (ctx) => { seen.push('c:' + ctx.stages.a.data.dir); return { checks: [] }; } },
      { name: 'd', onDemand: true, run: async () => { seen.push('d'); return { checks: [] }; } },
    ];
    const first = await runStages({ id: 'S9', title: 't', host: 'node', stages, dir, runRoot });
    expect(seen).toEqual(['a', 'b']);
    expect(first.failed).toBe('b');
    expect(first.result.checks.map((c) => [c.name, c.pass])).toEqual([['a ok', true], ['stage b completed', false]]);
    const again = await runStages({ id: 'S9', title: 't', host: 'node', stages, argv: ['--only', 'c,d'], dir, runRoot });
    expect(seen).toEqual(['a', 'b', 'c:' + first.runDir, 'd']);
    expect(again.runDir).toBe(first.runDir);
    expect(Object.keys(loadStages('S9', dir).stages)).toEqual(['a', 'b', 'c', 'd']);
    expect(JSON.parse(readFileSync(path.join(dir, 'S9.json'), 'utf8')).checks).toHaveLength(2);
  });

  it('keeps each manual check once over --only re-runs; a full run drops them', async () => {
    const opts = {
      id: 'S7', title: 't', host: 'node', dir: tmp(), runRoot: tmp(),
      stages: [{ name: 'a', run: async () => ({ checks: [nodeCheck('a ok', true)] }) }],
    };
    await runStages(opts);
    appendManualCheck('S7', { name: 'visual', pass: false, detail: 'first look' }, opts.dir);
    await runStages({ ...opts, argv: ['--only', 'a'] });
    appendManualCheck('S7', { name: 'visual', pass: true, detail: 'second look' }, opts.dir);
    const again = await runStages({ ...opts, argv: ['--only', 'a'] });
    expect(again.result.checks.map((c) => [c.name, c.pass, c.manual === true]))
      .toEqual([['a ok', true, false], ['visual', true, true]]);
    expect(again.result.verdict).toBe('yes');
    const fresh = await runStages(opts);
    expect(fresh.result.checks.map((c) => c.name)).toEqual(['a ok']);
  });

  it('refuses --only before a first run and unknown stage names', async () => {
    const stages = [{ name: 'a', run: async () => ({ checks: [] }) }];
    await expect(runStages({ id: 'S8', title: 't', host: 'node', stages, argv: ['--only', 'a'], dir: tmp(), runRoot: tmp() }))
      .rejects.toThrow(/no earlier run/);
    await expect(runStages({ id: 'S8', title: 't', host: 'node', stages, argv: ['--only', 'x'], dir: tmp(), runRoot: tmp() }))
      .rejects.toThrow(/unknown stage/);
  });
});
