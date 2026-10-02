import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { upsertStageChecks, mergeHostVersion, writeStageResult, readResult } from '../../tools/spike/stages.mjs';
import { appendManualCheck, makeResult, writeResult } from '../../tools/spike/result.mjs';

const ok = (name) => ({ name, pass: true, required: true, detail: '' });
const bad = (name) => ({ name, pass: false, required: true, detail: 'x' });

describe('spike stages', () => {
  it('replaces only the checks of the same stage and keeps manual ones', () => {
    const prev = [{ ...ok('a'), stage: 'ae' }, { ...ok('m'), manual: true }, { ...bad('b'), stage: 'pr' }];
    const next = upsertStageChecks(prev, 'pr', [ok('b2')]);
    expect(next.map((c) => c.name)).toEqual(['a', 'm', 'b2']);
    expect(next[2].stage).toBe('pr');
  });
  it('requires a stage', () => {
    expect(() => upsertStageChecks([], '', [ok('a')])).toThrow(/stage/);
  });
  it('merges host versions without repeats', () => {
    expect(mergeHostVersion(null, 'AE 26.5')).toBe('AE 26.5');
    expect(mergeHostVersion('AE 26.5', 'AE 26.5')).toBe('AE 26.5');
    expect(mergeHostVersion('AE 26.5', 'Pr 26.5.2')).toBe('AE 26.5; Pr 26.5.2');
    expect(mergeHostVersion('AE 26.5', null)).toBe('AE 26.5');
  });
  it('keeps manual checks and evidence when a stage is re-run', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const s8 = { id: 'S8', title: 't', host: 'ae+pr', stage: 'ae', verdict: 'measured', verdictLocked: true, dir };
    writeStageResult({ ...s8, checks: [ok('export')], evidence: ['a.json'] });
    appendManualCheck('S8', { name: 'playback', pass: false, required: false }, dir);
    const r = writeStageResult({ ...s8, checks: [ok('export again')], evidence: ['b.json'] });
    expect(r.checks.map((c) => c.name)).toEqual(['playback', 'export again']);
    expect(r.verdict).toBe('measured');
    expect(readResult('S8', dir).evidence).toEqual(['a.json', 'b.json']);
    expect(readResult('S99', dir)).toBe(null);
  });
  it('keeps a locked verdict of the previous result unless the stage computes its own', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeStageResult({ id: 'S8', title: 't', host: 'ae+pr', stage: 'ae', checks: [bad('export')], verdict: 'measured', verdictLocked: true, dir });
    expect(writeStageResult({ id: 'S8', title: 't', host: 'ae+pr', stage: 'pr', checks: [ok('insert')], dir }))
      .toMatchObject({ verdict: 'measured', verdictLocked: true });
    writeResult(makeResult({ id: 'S9', title: 't', host: 'pr-beta', checks: [], verdict: 'not-run', verdictLocked: true }), dir);
    expect(writeStageResult({ id: 'S9', title: 't', host: 'pr-beta', stage: 'uxp', checks: [ok('setText')], keepLocked: false, dir }))
      .toMatchObject({ verdict: 'yes', verdictLocked: false });
  });
});
