import { describe, it, expect } from 'vitest';
import { parseLibrary, itemsFor, type ValidateLibrary, type Validation } from '../../../panel/src/core/library';
import { checkLibrary } from '../../../tools/library/rules.mjs';
import { validateCatalogSchema } from '../../../panel/src/generated/catalog-validate.mjs';
import { catalog } from './fixture';

const accept = (): Validation => ({ ok: true, errors: [] });
const reject = (...errors: string[]) => (): Validation => ({ ok: false, errors });
// What the panel injects (plan P8): the pipeline's own rules over the generated schema validator.
const real: ValidateLibrary = (doc) => checkLibrary(doc, 'catalog', validateCatalogSchema);

describe('parseLibrary', () => {
  it('returns the catalog the validator accepts', () => {
    const lib = catalog();
    const seen: unknown[] = [];
    const r = parseLibrary(JSON.stringify(lib), (doc) => {
      seen.push(doc);
      return accept();
    }, '0.1.0');
    expect(r).toEqual({ ok: true, library: lib, issues: [] });
    expect(seen).toEqual([lib]);
    if (r.ok) expect(r.library.items.map((i) => i.title_ru)).toEqual(['Логошот с подписью', 'Логотип без подписи', 'Подпись спикера']);
  });
  it('reads a file that starts with a BOM (PowerShell 5.1)', () => {
    const text = '﻿' + JSON.stringify(catalog());
    expect(() => JSON.parse(text)).toThrow(SyntaxError);
    expect(parseLibrary(text, accept, '0.1.0')).toEqual({ ok: true, library: catalog(), issues: [] });
  });
  it('refuses broken JSON with LIBRARY_INVALID', () => {
    const r = parseLibrary('{"items": [', accept, '0.1.0');
    expect(r).toEqual({
      ok: false,
      issues: [{ code: 'LIBRARY_INVALID', level: 'error', params: { details: expect.stringMatching(/^JSON: /), count: 1 } }],
    });
  });
  it('puts the first validator errors into details', () => {
    const one = parseLibrary(JSON.stringify(catalog()), reject('schema: /items/0 unknown property "colour"'), '0.1.0');
    expect(one).toEqual({
      ok: false,
      issues: [{ code: 'LIBRARY_INVALID', level: 'error', params: { details: 'schema: /items/0 unknown property "colour"', count: 1 } }],
    });
    const many = parseLibrary(JSON.stringify(catalog()), reject('e1', 'e2', 'e3', 'e4', 'e5'), '0.1.0');
    expect(many.issues[0]?.params).toEqual({ details: 'e1; e2; e3 (+2)', count: 5 });
  });
  it('turns a validator that throws into LIBRARY_INVALID', () => {
    const r = parseLibrary(JSON.stringify(catalog()), () => {
      throw new Error('boom');
    }, '0.1.0');
    expect(r).toEqual({
      ok: false,
      issues: [{ code: 'LIBRARY_INVALID', level: 'error', params: { details: 'validator: boom', count: 1 } }],
    });
  });
  it('refuses a document without items even when the validator lets it through', () => {
    for (const text of ['[]', '{"items": 5}', 'null']) {
      expect(parseLibrary(text, accept, '0.1.0')).toMatchObject({ ok: false, issues: [{ code: 'LIBRARY_INVALID' }] });
    }
  });
  it('refuses a library made for a newer panel before the schema speaks', () => {
    const lib = { ...catalog(), minPluginVersion: '0.2.0', futureKey: true };
    let called = false;
    const r = parseLibrary(JSON.stringify(lib), () => {
      called = true;
      return { ok: false, errors: ['schema: / unknown property "futureKey"'] };
    }, '0.1.0');
    expect(r).toEqual({ ok: false, issues: [{ code: 'PLUGIN_TOO_OLD', level: 'error', params: { need: '0.2.0', have: '0.1.0' } }] });
    expect(called).toBe(false);
  });
  it('takes the same or a newer panel; a pre-release is older than its release', () => {
    const text = (min: string) => JSON.stringify({ ...catalog(), minPluginVersion: min });
    expect(parseLibrary(text('0.1.0'), accept, '0.1.0').ok).toBe(true);
    expect(parseLibrary(text('0.1.0'), accept, '0.1.1').ok).toBe(true);
    expect(parseLibrary(text('0.1.0'), accept, '0.1.0-rc.1')).toMatchObject({ ok: false, issues: [{ code: 'PLUGIN_TOO_OLD' }] });
  });
  it('counts an unreadable panel version as too old', () => {
    expect(parseLibrary(JSON.stringify(catalog()), accept, 'dev')).toEqual({
      ok: false,
      issues: [{ code: 'PLUGIN_TOO_OLD', level: 'error', params: { need: '0.1.0', have: 'dev' } }],
    });
  });
  it('leaves a malformed minPluginVersion to the validator', () => {
    const text = JSON.stringify({ ...catalog(), minPluginVersion: '1.0' });
    expect(parseLibrary(text, reject('schema: /minPluginVersion must match pattern'), '0.1.0')).toMatchObject({
      ok: false,
      issues: [{ code: 'LIBRARY_INVALID' }],
    });
  });
});

describe('parseLibrary with the real validator (P8: tools/library/rules.mjs + the generated schema)', () => {
  it('accepts the fixture catalog', () => {
    expect(real(catalog())).toEqual({ ok: true, errors: [], kind: 'catalog' });
    expect(parseLibrary(JSON.stringify(catalog()), real, '0.1.0')).toEqual({ ok: true, library: catalog(), issues: [] });
  });
  it('turns a schema error into LIBRARY_INVALID', () => {
    const lib = catalog();
    Object.assign(lib.items[0]!, { colour: 'green' });
    expect(parseLibrary(JSON.stringify(lib), real, '0.1.0')).toEqual({
      ok: false,
      issues: [{ code: 'LIBRARY_INVALID', level: 'error', params: { details: 'schema: /items/0 unknown property "colour"', count: 1 } }],
    });
  });
  it('turns a cross-field rule error into LIBRARY_INVALID', () => {
    const lib = catalog();
    lib.items[0]!.fields![0]!.default = 9; // caption has 3 options
    expect(parseLibrary(JSON.stringify(lib), real, '0.1.0')).toEqual({
      ok: false,
      issues: [{
        code: 'LIBRARY_INVALID', level: 'error',
        params: { details: 'LOGO_Shot: field-default: field "caption": default 9 does not fit type dropdown', count: 1 },
      }],
    });
  });
});

describe('itemsFor', () => {
  it('keeps the items the host can insert', () => {
    const lib = catalog();
    lib.items[0]!.hosts = ['ae'];
    expect(itemsFor(lib, 'ae').map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    expect(itemsFor(lib, 'pr').map((i) => i.id)).toEqual(['LOGO_Mark', 'TTL_LowerThird']);
  });
});
