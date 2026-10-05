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
  // AE 26.5 gives every object inherited '*', '+', '-' and '/' members (ExtendScript operator overloading, seen
  // live 2026-10-05; Premiere has none): an escape table looked up without hasOwnProperty finds a function there.
  const AE_OPERATORS = "Object.prototype['*'] = Object.prototype['+'] = Object.prototype['-'] = Object.prototype['/'] = function () { throw new Error('Object of type Function found where a Number, Array, or Property is needed'); };\n";
  it('stringifies operator characters on an AE-like engine', () => {
    expect(runWithoutJson(AE_OPERATORS + 'JSON.stringify({ path: "C:/CRBK/work", name: "Анна-Мария", x: "2*3+1" })'))
      .toBe('{"path":"C:/CRBK/work","name":"Анна-Мария","x":"2*3+1"}');
  });
  it('replaces a JSON.stringify that fails on operator characters (an older copy of this polyfill)', () => {
    const ctx = vm.createContext({});
    const broken = 'JSON = { stringify: function (v) { var esc = {}; var c = String(v).charAt(1); var e = esc[c]; return e ? e() : "x"; }, parse: function (t) { return t; } };\n';
    const out = vm.runInContext(AE_OPERATORS + broken + prelude + '\nJSON.stringify("a/b")', ctx);
    expect(out).toBe('"a/b"');
  });
  it('keeps a native JSON untouched', () => {
    const ctx = vm.createContext({});
    const same = vm.runInContext('var n = JSON; ' + prelude + '; JSON === n', ctx);
    expect(same).toBe(true);
  });
});
