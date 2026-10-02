import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  decideVerdict, makeResult, writeResult, readResults, renderReport, appendManualCheck,
} from '../../tools/spike/result.mjs';

const ok = (name, required = true) => ({ name, pass: true, required, detail: '' });
const bad = (name, required = true) => ({ name, pass: false, required, detail: 'x' });

describe('spike results', () => {
  it('decides verdicts from checks', () => {
    expect(decideVerdict([])).toBe('not-run');
    expect(decideVerdict([ok('a'), ok('b')])).toBe('yes');
    expect(decideVerdict([ok('a'), bad('b', false)])).toBe('partial');
    expect(decideVerdict([ok('a'), bad('b')])).toBe('no');
  });
  it('validates results', () => {
    expect(() => makeResult({ id: 'X1', title: 't', host: 'ae', checks: [] })).toThrow(/spike id/);
    expect(() => makeResult({ id: 'S1', title: 't', host: 'ae', checks: [], verdict: 'maybe' })).toThrow(/verdict/);
    expect(() => makeResult({ id: 'S1', title: 't', host: 'ae', checks: [{ name: 'a' }] })).toThrow(/check/);
  });
  it('round-trips through files and renders a sorted report', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S10', title: 'AME | queue', host: 'ae', checks: [ok('a')], date: '2026-10-05' }), dir);
    writeResult(makeResult({ id: 'S2', title: 'MOGRT export', host: 'ae', checks: [bad('a')], fallback: 'manual export', date: '2026-10-05' }), dir);
    const md = renderReport(readResults(dir));
    expect(md.indexOf('| S2 |')).toBeLessThan(md.indexOf('| S10 |'));
    expect(md).toContain('AME \\| queue');
    expect(md).toContain('| no | 0/1 | manual export |');
  });
  it('appends manual checks and recomputes the verdict', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S5', title: 'importMGT', host: 'pr', checks: [ok('auto')], date: '2026-10-05' }), dir);
    const r = appendManualCheck('S5', { name: 'undo steps', pass: false, detail: '3 steps' }, dir);
    expect(r.checks).toHaveLength(2);
    expect(r.verdict).toBe('no');
  });
  it('replaces a manual check with the same name instead of duplicating it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S10', title: 'AME', host: 'ae', checks: [ok('auto')], date: '2026-10-05' }), dir);
    appendManualCheck('S10', { name: 'persist after restart', pass: false }, dir);
    const r = appendManualCheck('S10', { name: 'persist after restart', pass: true }, dir);
    expect(r.checks).toHaveLength(2);
    expect(r.verdict).toBe('yes');
  });
  it('keeps a locked verdict (measured, not-run) when manual checks are added', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S8', title: 'perf', host: 'pr', checks: [ok('export timed')], verdict: 'measured', verdictLocked: true, date: '2026-10-05' }), dir);
    const r = appendManualCheck('S8', { name: 'playback FHD real time', pass: false, detail: 'drops' }, dir);
    expect(r.verdict).toBe('measured');
    expect(r.verdictLocked).toBe(true);
    expect(() => makeResult({ id: 'S9', title: 'uxp', host: 'pr', checks: [], verdictLocked: true })).toThrow(/locked/);
  });
});
