import { describe, it, expect } from 'vitest';
import { asciiJson, isAscii, jsxCall } from '../../../panel/src/bridge/ascii';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so fs comes in untyped.
const nodeFs = 'node:fs';
const fs = (await import(nodeFs)) as { readFileSync(p: URL, enc: 'utf8'): string };

interface Es3Json {
  parse(text: string): unknown;
  stringify(value: unknown): string;
}

// The JSON polyfill the adapters carry (tools/jsx/prelude-json.jsx), installed on a fresh object, so its eval-based
// parse is the one that decodes the arguments here, as in ExtendScript, not V8's JSON.parse.
const PRELUDE = fs.readFileSync(new URL('../../../tools/jsx/prelude-json.jsx', import.meta.url), 'utf8');
const es3Json = (new Function('JSON', PRELUDE + '\nreturn JSON;') as (json: undefined) => Es3Json)(undefined);

// Evaluates a jsxCall script as the host would, with CRBK.call replaced by a recorder.
function runCall(script: string, parse: (text: string) => unknown): { fn: string; json: string; args: unknown } {
  let seen: { fn: string; json: string; args: unknown } | undefined;
  const CRBK = {
    call(fn: string, json: string): string {
      seen = { fn, json, args: parse(json) };
      return '{"ok":true,"data":null}';
    },
  };
  (new Function('CRBK', script) as (crbk: typeof CRBK) => void)(CRBK);
  if (!seen) throw new Error('CRBK.call was not called by: ' + script);
  return seen;
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

// Pr insert arguments with everything the host must get back intact: Cyrillic, Ё, ×, quotes, control characters,
// a surrogate pair and U+2028, which ends an ES3 string literal.
const ARGS = {
  seqId: '000f4241',
  mogrtPath: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt',
  startTicks: '2540160000000',
  lenFrames: 200,
  defaultLenFrames: 150,
  expectName: 'TTL_LowerThird_16x9_v1',
  fields: [
    { egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина' },
    { egpName: 'Должность', type: 'text', value: 'Формат 16×9, «кавычки» и "двойные" \\ слеш\nстрока\tтаб' },
    { egpName: 'Стиль', type: 'dropdown', value: 1 },
    { egpName: 'Логотип', type: 'checkbox', value: true },
    { egpName: 'Пусто', type: 'text', value: '' },
  ],
  label: 'Cloud.ru BrandKit: Титр 16×9 \u{1F600} \u2028 \u007f',
  none: null,
};

describe('isAscii', () => {
  it('accepts U+0000..U+007F, tabs and line breaks included', () => {
    expect(isAscii('')).toBe(true);
    expect(isAscii('var a = 1;\r\n\tCRBK.call("ping", "{}") ~ \x7f \x00')).toBe(true);
  });
  it('rejects anything from U+0080 up', () => {
    expect(isAscii('\u0080')).toBe(false);
    expect(isAscii('Ё')).toBe(false);
    expect(isAscii('16×9')).toBe(false);
    expect(isAscii('var s = "Привет";')).toBe(false);
    expect(isAscii('\u{1F600}')).toBe(false);
  });
});

describe('asciiJson', () => {
  it('is JSON.stringify with every character from U+007F up written as \\uXXXX', () => {
    expect(asciiJson({ t: 'Ё×' })).toBe('{"t":"\\u0401\\u00d7"}');
    expect(asciiJson('Привет')).toBe('"\\u041f\\u0440\\u0438\\u0432\\u0435\\u0442"');
    expect(asciiJson('del\x7f')).toBe('"del\\u007f"');
    expect(asciiJson({ a: [1, 'b', true, null], q: 'x"y\\z\n' })).toBe(JSON.stringify({ a: [1, 'b', true, null], q: 'x"y\\z\n' }));
  });
  it('writes a surrogate pair as two escapes and escapes U+2028/U+2029', () => {
    expect(asciiJson('\u{1F600}')).toBe('"\\ud83d\\ude00"');
    expect(asciiJson('\u2028\u2029')).toBe('"\\u2028\\u2029"');
  });
  it('escapes up to the top of the BMP', () => {
    expect(asciiJson('\ufffd\ufffe\uffff')).toBe('"\\ufffd\\ufffe\\uffff"');
  });
  it('is ASCII in its own source: the range bound is an escape, not a raw U+FFFF an editor can lose', () => {
    const src = fs.readFileSync(new URL('../../../panel/src/bridge/ascii.ts', import.meta.url), 'utf8');
    expect(isAscii(src)).toBe(true);
  });
  it('is ASCII and parses back to the same value', () => {
    const json = asciiJson(ARGS);
    expect(PRINTABLE_ASCII.test(json)).toBe(true);
    expect(JSON.parse(json)).toEqual(ARGS);
    expect(es3Json.parse(json)).toEqual(ARGS);
  });
  it('throws on a value that has no JSON form', () => {
    expect(() => asciiJson(undefined)).toThrow(TypeError);
    expect(() => asciiJson(() => 1)).toThrow(TypeError);
  });
});

describe('jsxCall', () => {
  it('builds CRBK.call("fn", "<ascii json>")', () => {
    expect(jsxCall('ping', {})).toBe('CRBK.call("ping", "{}")');
    expect(jsxCall('getContext')).toBe('CRBK.call("getContext", "{}")');
    expect(jsxCall('checkFonts', ['SBSansText-Regular'])).toBe('CRBK.call("checkFonts", "[\\"SBSansText-Regular\\"]")');
    expect(jsxCall('findPlaced', { name: 'Ё' })).toBe('CRBK.call("findPlaced", "{\\"name\\":\\"\\\\u0401\\"}")');
  });
  it('is printable ASCII, and the host gets the original object back with Cyrillic, Ё and ×', () => {
    const script = jsxCall('insertItem', ARGS);
    expect(PRINTABLE_ASCII.test(script)).toBe(true);
    expect(isAscii(script)).toBe(true);
    const viaV8 = runCall(script, (t) => JSON.parse(t));
    expect(viaV8.fn).toBe('insertItem');
    expect(viaV8.json).toBe(asciiJson(ARGS));
    expect(viaV8.args).toEqual(ARGS);
    // The same through the ES3 polyfill's eval-based parse that the adapter uses in ExtendScript.
    const viaEs3 = runCall(script, (t) => es3Json.parse(t));
    expect(viaEs3.args).toEqual(ARGS);
    const fields = (viaEs3.args as typeof ARGS).fields;
    expect(fields[0]?.value).toBe('Анна-Мария Ёлкина');
    expect(fields[1]?.value).toContain('16×9');
  });
  it('refuses a function name that is not a plain identifier', () => {
    expect(() => jsxCall('')).toThrow(TypeError);
    expect(() => jsxCall('a.b')).toThrow(TypeError);
    expect(() => jsxCall('ping")+evil("')).toThrow(TypeError);
    expect(() => jsxCall('вставка')).toThrow(TypeError);
  });
});
