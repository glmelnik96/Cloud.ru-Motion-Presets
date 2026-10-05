import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { asciiEscape, buildPayload, parseResponse, hostPort, hostPorts } from '../../tools/lib/payload.mjs';

describe('payload', () => {
  it('escapes non-ASCII into \\uXXXX', () => {
    expect(asciiEscape('var s = "Привет";')).toBe('var s = "\\u041f\\u0440\\u0438\\u0432\\u0435\\u0442";');
  });
  it('builds an ASCII-only, syntactically valid expression', () => {
    const p = buildPayload('var s = "Глеб"; JSON.stringify({ s: s });', '/* prelude */');
    expect(/[^\x00-\x7f]/.test(p)).toBe(false);
    expect(() => new vm.Script(p)).not.toThrow();
    expect(p).toContain('evalScript');
  });
  it('parses JSON replies', () => {
    expect(parseResponse('{"a":1}')).toEqual({ a: 1 });
  });
  it('wraps non-JSON replies', () => {
    expect(parseResponse('hello')).toEqual({ raw: 'hello' });
  });
  it('throws on empty replies', () => {
    expect(() => parseResponse('')).toThrow(/HOST_EMPTY/);
    expect(() => parseResponse('undefined')).toThrow(/HOST_EMPTY/);
  });
  it('throws on host errors', () => {
    expect(() => parseResponse('EvalScript error.')).toThrow(/HOST_EVAL_ERROR/);
    expect(() => parseResponse('HOST_BRIDGE_ERROR: x')).toThrow(/HOST_BRIDGE_ERROR/);
  });
  it('maps hosts to ports', () => {
    expect(hostPort('ae', {})).toBe(8094);
    expect(hostPort('pr', {})).toBe(8096);
    expect(hostPort('ae', { BRANDKIT_AE_PORT: '9001' })).toBe(9001);
    expect(() => hostPort('ps', {})).toThrow(/unknown host/);
    // the background panel, then the visible one; a port set in the environment alone
    expect(hostPorts('ae', {})).toEqual([8094, 8095]);
    expect(hostPorts('pr', {})).toEqual([8096, 8097]);
    expect(hostPorts('pr', { BRANDKIT_PR_PORT: '9002' })).toEqual([9002]);
  });
});
