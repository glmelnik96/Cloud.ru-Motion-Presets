import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const prelude = readFileSync(new URL('../../tools/jsx/prelude-json.jsx', import.meta.url), 'utf8');

function runWithoutJson(code) {
  const ctx = vm.createContext({});
  return vm.runInContext('JSON = undefined;\n' + prelude + '\n' + code, ctx);
}

describe('prelude-json', () => {
  it('stringifies when JSON is missing', () => {
    expect(runWithoutJson('JSON.stringify({ a: [1, "x\\n", true, null] })'))
      .toBe('{"a":[1,"x\\n",true,null]}');
  });
  it('parses what it stringified', () => {
    expect(runWithoutJson('JSON.parse(JSON.stringify({ b: "q\\"" })).b')).toBe('q"');
  });
  it('rejects non-JSON input in parse', () => {
    expect(() => runWithoutJson('JSON.parse("alert(1)")')).toThrow();
  });
  it('keeps a native JSON untouched', () => {
    const ctx = vm.createContext({});
    const same = vm.runInContext('var n = JSON; ' + prelude + '; JSON === n', ctx);
    expect(same).toBe(true);
  });
});
