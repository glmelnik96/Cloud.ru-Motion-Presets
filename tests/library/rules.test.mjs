// tools/library/rules.mjs: the cross-field rules shared by the Node validator and the panel bundle (plan
// 2026-10-05 P8), and the rules task 2 added: egpIndex 0..n-1 on T1, one variant per frame size (on T2/T3 per frame
// size and switch values), one fps per item.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as rules from '../../tools/library/rules.mjs';
import { crossCheck, detectKind, validateLibrary } from '../../tools/library/validate.mjs';

const REPO = new URL('../../', import.meta.url);
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, REPO), 'utf8'));
const source = () => readJson('library/library.src.json');
const example = () => readJson('docs/library/example.src.json');
const item = (doc, id) => doc.items.find((i) => i.id === id);
const field = (it, key) => it.fields.find((f) => f.key === key);
const errorsOf = (doc) => rules.crossCheck(doc, 'source');

describe('rules.mjs', () => {
  it('imports nothing and touches no Node API, so the panel can bundle it', () => {
    const text = readFileSync(new URL('tools/library/rules.mjs', REPO), 'utf8');
    expect(text).not.toMatch(/^\s*import\b|\bimport\(/m);
    expect(text).not.toMatch(/\brequire\(|\bprocess\.|\bBuffer\b|node:/);
  });

  it('is what validate.mjs exports', () => {
    expect(crossCheck).toBe(rules.crossCheck);
    expect(detectKind).toBe(rules.detectKind);
  });

  it('accepts the pack-1 source and the example', () => {
    expect(validateLibrary(source())).toEqual({ ok: true, kind: 'source', errors: [] });
    expect(validateLibrary(example())).toEqual({ ok: true, kind: 'source', errors: [] });
  });
});

describe('egpIndex of T1 fields', () => {
  it('needs egpIndex next to egpName', () => {
    const doc = source();
    delete field(item(doc, 'TTL_LowerThird'), 'side').egpIndex;
    expect(errorsOf(doc)).toEqual(['TTL_LowerThird: egp-index: field "side": a T1 field needs egpIndex']);
  });

  it('rejects a repeated index', () => {
    const doc = source();
    field(item(doc, 'TTL_LowerThird'), 'side').egpIndex = 3;
    expect(errorsOf(doc)).toContain('TTL_LowerThird: egp-index: field "side": egpIndex 3 is used twice');
  });

  it('rejects a gap: every index stays below the field count', () => {
    const doc = source();
    field(item(doc, 'LOGO_Shot'), 'speed').egpIndex = 4;
    expect(errorsOf(doc)).toEqual(['LOGO_Shot: egp-index: field "speed": egpIndex 4 is outside 0..3']);
  });

  it('checks only T1 items', () => {
    const doc = example();
    item(doc, 'BG_WebinarPortal').fields = [
      { key: 'colour', label_ru: 'Цвет', type: 'dropdown', options: [{ index: 1, label_ru: 'Фиолетовый' }, { index: 2, label_ru: 'Зелёный' }] },
    ];
    expect(errorsOf(doc)).toEqual([]);
  });
});

describe('variants', () => {
  it('rejects two variants with one frame size', () => {
    const doc = source();
    const ttl = item(doc, 'TTL_LowerThird');
    ttl.variants.push({ ...ttl.variants[0], key: '16x9_copy', aeComp: 'CR_TTL_LowerThird_16x9_copy' });
    expect(errorsOf(doc)).toEqual(['TTL_LowerThird: variant-size: variant "16x9_copy": 1920x1080 is already variant "16x9"']);
  });

  it('keeps one variant per frame size on T1 whatever the options: the panel picks a T1 variant by frame alone (P1)', () => {
    const doc = source();
    const ttl = item(doc, 'TTL_LowerThird');
    ttl.variants[0].options = { side: 1 };
    ttl.variants.push({ ...ttl.variants[0], key: '16x9_right', aeComp: 'CR_TTL_LowerThird_16x9_right', options: { side: 2 } });
    expect(errorsOf(doc)).toEqual(['TTL_LowerThird: variant-size: variant "16x9_right": 1920x1080 is already variant "16x9"']);
  });

  // BG_WebinarPortal (T2) as two copies of its 16x9 variant with the given switch values (spec 4.4: items x formats
  // x options; docs/decisions/t2-matrix.draft.json plans such copies per format).
  function copies(a, b) {
    const doc = example();
    const bg = item(doc, 'BG_WebinarPortal');
    bg.fields = [
      { key: 'colour', label_ru: 'Цвет', type: 'dropdown', options: [{ index: 1, label_ru: 'Фиолетовый' }, { index: 2, label_ru: 'Зелёный' }] },
      { key: 'logo', label_ru: 'Логотип', type: 'checkbox' },
    ];
    const base = bg.variants[0];
    bg.variants = [{ ...base, key: 'a', ...(a && { options: a }) }, { ...structuredClone(base), key: 'b', ...(b && { options: b }) }];
    return doc;
  }

  it('lets pre-rendered copies share a frame size when a switch tells them apart', () => {
    expect(errorsOf(copies({ colour: 1 }, { colour: 2 }))).toEqual([]);
    expect(errorsOf(copies({ colour: 1, logo: true }, { logo: false, colour: 1 }))).toEqual([]);
  });

  it('rejects copies of one frame size that no switch tells apart', () => {
    const twin = ['BG_WebinarPortal: variant-size: variant "b": 1920x1080 is already variant "a", and no switch tells them apart'];
    expect(errorsOf(copies({ colour: 1 }, { colour: 1 }))).toEqual(twin);
    // A switch that only one of them sets leaves both fitting the other value: the choice would be a guess.
    expect(errorsOf(copies(undefined, { colour: 2 }))).toEqual(twin);
    expect(errorsOf(copies({ colour: 1 }, { logo: true }))).toEqual(twin);
    expect(errorsOf(copies(undefined, undefined))).toEqual(['BG_WebinarPortal: variant-size: variant "b": 1920x1080 is already variant "a"']);
  });

  it('compares only variants that have a frame size', () => {
    const doc = example();
    item(doc, 'SFX_WhooshIn').variants.push({ key: 'mp3' });
    expect(errorsOf(doc)).toEqual([]);
  });

  it('rejects mixed fps on an item without a loop', () => {
    const doc = source();
    item(doc, 'LOGO_Mark').variants[2].fps = 30;
    expect(errorsOf(doc)).toEqual(['LOGO_Mark: fps: the variants mix 25, 30 fps; an item has one fps']);
  });

  it('keeps the loop message for a looped item and adds no second one', () => {
    const doc = example();
    item(doc, 'BG_WebinarPortal').variants[1].fps = 30;
    expect(errorsOf(doc)).toEqual(['BG_WebinarPortal: loop: a looped item needs one fps across its variants']);
  });
});

describe('checkLibrary', () => {
  const schemaError = (over) => ({ instancePath: '/items/0', schemaPath: '#', keyword: 'type', params: {}, message: 'must be object', ...over });

  it('turns schema errors into unique strings and skips the cross rules', () => {
    const doc = source();
    item(doc, 'LOGO_Mark').variants[2].fps = 30;
    const failing = Object.assign(() => false, {
      errors: [
        schemaError({ keyword: 'additionalProperties', params: { additionalProperty: 'colour' } }),
        schemaError({ keyword: 'additionalProperties', params: { additionalProperty: 'colour' } }),
        schemaError({ keyword: 'pattern', instancePath: '', propertyName: 'colour', message: 'must match pattern "^x$"' }),
        schemaError({ keyword: 'propertyNames', params: { propertyName: 'colour' } }),
        schemaError({ keyword: 'pattern', instancePath: '/items/1/id', message: 'must match pattern "^x$"' }),
      ],
    });
    // The propertyNames error names the property itself; the error inside propertyNames (propertyName set) is dropped.
    expect(rules.checkLibrary(doc, 'source', failing)).toEqual({
      ok: false,
      kind: 'source',
      errors: ['schema: /items/0 unknown property "colour"', 'schema: /items/1/id must match pattern "^x$"'],
    });
  });

  it('runs the cross rules once the schema passes', () => {
    const doc = source();
    item(doc, 'LOGO_Mark').variants[2].fps = 30;
    expect(rules.checkLibrary(doc, 'source', () => true)).toEqual({
      ok: false,
      kind: 'source',
      errors: ['LOGO_Mark: fps: the variants mix 25, 30 fps; an item has one fps'],
    });
    expect(rules.checkLibrary(source(), 'source', () => true)).toEqual({ ok: true, kind: 'source', errors: [] });
  });
});
