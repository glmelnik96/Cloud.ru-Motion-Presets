import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lint } = require('../../tools/jsx/lint-jsx.cjs');

describe('lint-jsx', () => {
  it('accepts plain ES3', () => {
    const r = lint('var a = 1;\nJSON.stringify({ a: a });');
    expect(r.errors).toEqual([]);
  });
  it('rejects let/const', () => {
    expect(lint('let a = 1; JSON.stringify(a);').errors.join()).toMatch(/let\/const/);
  });
  it('rejects arrow functions', () => {
    expect(lint('var f = (x) => x; JSON.stringify(f(1));').errors.join()).toMatch(/arrow/);
  });
  it('rejects template literals', () => {
    expect(lint('var s = `x`; JSON.stringify(s);').errors.join()).toMatch(/template/);
  });
  it('rejects trailing commas', () => {
    expect(lint('var a = [1, 2,]; JSON.stringify(a);').errors.join()).toMatch(/trailing comma/);
  });
  it('rejects reserved words as object keys', () => {
    expect(lint('var o = { default: 1 }; JSON.stringify(o);').errors.join()).toMatch(/reserved word/);
  });
  it('rejects ES3 future reserved words as names (ExtendScript refuses "native" in Premiere 26.5)', () => {
    expect(lint('var a = 1, native = 2; JSON.stringify(a + native);').errors.join()).toMatch(/reserved word "native" used as a name/);
    expect(lint('function f(int) { return int; } JSON.stringify(f(1));').errors.join()).toMatch(/reserved word "int" used as a name/);
    expect(lint('var nativeName = 1; JSON.stringify(nativeName);').errors).toEqual([]);
  });
  it('rejects Cyrillic outside strings', () => {
    expect(lint('var имя = 1; JSON.stringify(имя);').errors.join()).toMatch(/non-ASCII/);
  });
  it('does not warn about JSON.parse (our prelude polyfills it)', () => {
    const r = lint('var o = JSON.parse("{}"); JSON.stringify(o);');
    expect(r.warnings.join()).not.toMatch(/JSON\.parse/);
  });
});
