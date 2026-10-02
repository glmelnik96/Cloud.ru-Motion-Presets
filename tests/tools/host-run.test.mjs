import { describe, it, expect } from 'vitest';
import { parseCli, lintOrThrow, PRELUDE } from '../../tools/host-run.mjs';

describe('host-run', () => {
  it('parses CLI flags', () => {
    expect(parseCli(['--host', 'pr', '--timeout', '5000', '--no-lint', '@x.jsx']))
      .toEqual({ host: 'pr', timeoutMs: 5000, lint: false, arg: '@x.jsx' });
  });
  it('defaults timeout and lint', () => {
    expect(parseCli(['--host', 'ae', 'JSON.stringify(1)']))
      .toEqual({ host: 'ae', timeoutMs: 120000, lint: true, arg: 'JSON.stringify(1)' });
  });
  it('rejects ES5+ payloads before they reach the host', () => {
    expect(() => lintOrThrow('let a = 1; JSON.stringify(a);')).toThrow(/LINT/);
  });
  it('returns warnings for valid ES3', () => {
    expect(lintOrThrow('var a = 1; JSON.stringify(a);')).toEqual([]);
  });
  it('loads the JSON prelude', () => {
    expect(PRELUDE).toContain('JSON.parse');
  });
});
