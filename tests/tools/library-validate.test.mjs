import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateLibrary, detectKind } from '../../tools/library/validate.mjs';

const example = () => JSON.parse(readFileSync(new URL('../../docs/library/example.src.json', import.meta.url), 'utf8'));
const item = (doc, id) => doc.items.find((i) => i.id === id);
const field = (it, key) => it.fields.find((f) => f.key === key);
const errorsOf = (doc, kind) => validateLibrary(doc, kind).errors.join('\n');

const SHA = 'a'.repeat(64);
function catalog() {
  const it = structuredClone(item(example(), 'TTL_LowerThird'));
  delete it.companions;
  it.requiredFonts = it.requiredFonts.map((f) => ({ ...f, build: '1.002' }));
  it.variants = it.variants.map((v) => ({
    ...v,
    aeComp: v.aeComp + '_v1',
    file: `items/TTL_LowerThird/TTL_LowerThird_${v.key}_v1.mogrt`,
    sha256: SHA,
    bytes: 1000,
  }));
  it.aep = { file: 'items/TTL_LowerThird/TTL_LowerThird_v1.aep', sha256: SHA, bytes: 2000 };
  return { schemaVersion: 1, libraryVersion: '2026.10.02', minPluginVersion: '1.0.0', items: [it] };
}

describe('library source', () => {
  it('accepts the example', () => {
    expect(validateLibrary(example())).toEqual({ ok: true, kind: 'source', errors: [] });
  });
  it('rejects unknown properties and bad ids (schema)', () => {
    const doc = example();
    doc.items[0].colour = 'green';
    doc.items[1].id = 'whoosh';
    const e = errorsOf(doc);
    expect(e).toMatch(/schema: \/items\/0 unknown property "colour"/);
    expect(e).toMatch(/schema: \/items\/1\/id must match pattern/);
  });
  it('requires fit and duration on T1 items (schema)', () => {
    const doc = example();
    delete item(doc, 'TTL_LowerThird').fit;
    expect(errorsOf(doc)).toMatch(/must have required property 'fit'/);
  });
  it('rejects duplicate ids', () => {
    const doc = example();
    doc.items.push(structuredClone(item(doc, 'SFX_WhooshIn')));
    expect(errorsOf(doc)).toMatch(/SFX_WhooshIn: unique-id/);
  });
  it('rejects a companion that does not exist', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').companions[0].ref = 'SFX_Missing';
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: companion-ref: companion "SFX_Missing"/);
  });
  it('rejects two fields that drive the duration', () => {
    const doc = example();
    const web = item(doc, 'WEB_Screen');
    web.fields.push({ ...field(web, 'minutes'), key: 'minutes2', egpName: 'Минуты 2' });
    expect(errorsOf(doc)).toMatch(/WEB_Screen: drives-duration: 2 fields/);
  });
  it('needs the comp length of a trim template, long enough for the longest insert', () => {
    const doc = example();
    const web = item(doc, 'WEB_Screen');
    delete web.duration.maxSec;
    expect(errorsOf(doc)).toMatch(/WEB_Screen: trim-length: a trim template needs duration\.maxSec/);
    web.duration.maxSec = 900; // 15 min of the timer + 5 s of the outro = 905
    expect(errorsOf(doc)).toMatch(/WEB_Screen: trim-length: duration\.maxSec 900 is shorter than the longest insert 905/);
    web.duration.maxSec = 905;
    item(doc, 'TTL_LowerThird').duration.maxSec = 6;
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: trim-length: duration\.maxSec is for fit "trim" only/);
  });
  it('rejects an AE-capable variant without aeComp', () => {
    const doc = example();
    delete item(doc, 'TTL_LowerThird').variants[2].aeComp;
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: ae-comp: variant "9x16": an AE-capable variant needs aeComp/);
  });
  it('rejects a versioned aeComp in the source', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').variants[0].aeComp = 'CR_TTL_LowerThird_16x9_v1';
    expect(errorsOf(doc)).toMatch(/ae-comp: .*has no _vN/);
  });
  it('rejects dropdown options that are not indexed from 1', () => {
    const doc = example();
    field(item(doc, 'TTL_LowerThird'), 'side').options = [{ index: 0, label_ru: 'Слева' }, { index: 1, label_ru: 'Справа' }];
    expect(errorsOf(doc)).toMatch(/schema: .*options\/0\/index must be >= 1/);
    field(item(doc, 'TTL_LowerThird'), 'side').options = [{ index: 2, label_ru: 'Слева' }, { index: 1, label_ru: 'Справа' }];
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: options-index: field "side"/);
  });
  it('rejects an editable service field', () => {
    const doc = example();
    field(item(doc, 'WEB_Screen'), 'duration').editable = true;
    expect(errorsOf(doc)).toMatch(/WEB_Screen: service-field: field "duration": a service field must set "editable": false/);
  });
  it('rejects a service field that drives the duration', () => {
    const doc = example();
    const web = item(doc, 'WEB_Screen');
    delete field(web, 'minutes').drivesDuration;
    Object.assign(field(web, 'duration'), { drivesDuration: true, unitSec: 1 });
    expect(errorsOf(doc)).toMatch(/drives-duration: field "duration": only a visible slider/);
  });
  it('rejects variant options that are not switch values', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').variants[0].options = { style: 4 };
    item(doc, 'TTL_LowerThird').variants[1].options = { name: 1 };
    const e = errorsOf(doc);
    expect(e).toMatch(/switch-ref: variant "16x9" options: "style" needs an option index 1..3/);
    expect(e).toMatch(/switch-ref: variant "16x9_4K" options: "name" is not a dropdown or checkbox field/);
  });
  it('rejects an enabledBy that is not a checkbox', () => {
    const doc = example();
    field(item(doc, 'WEB_Screen'), 'minutes').enabledBy = 'title';
    expect(errorsOf(doc)).toMatch(/WEB_Screen: enabled-by: field "minutes"/);
  });
  it('rejects a video slot on an rdt template', () => {
    const doc = example();
    item(doc, 'WEB_Screen').fit = 'rdt';
    expect(errorsOf(doc)).toMatch(/WEB_Screen: media-fit: field "visual"/);
  });
  it('rejects a T1 field without egpName and a field host the item lacks', () => {
    const doc = example();
    const ttl = item(doc, 'TTL_LowerThird');
    delete field(ttl, 'role2').egpName;
    ttl.hosts = ['pr'];
    field(ttl, 'name').hosts = ['ae'];
    const e = errorsOf(doc);
    expect(e).toMatch(/egp-name: field "role2"/);
    expect(e).toMatch(/field-hosts: field "name"/);
  });
  it('rejects defaults that do not fit the field', () => {
    const doc = example();
    field(item(doc, 'WEB_Screen'), 'minutes').default = 20;
    field(item(doc, 'TTL_LowerThird'), 'style').default = 0;
    const e = errorsOf(doc);
    expect(e).toMatch(/WEB_Screen: field-default: field "minutes"/);
    expect(e).toMatch(/TTL_LowerThird: field-default: field "style"/);
  });
  it('rejects a loop part that does not match the period and mixed fps', () => {
    const doc = example();
    const bg = item(doc, 'BG_WebinarPortal');
    bg.variants[1].parts.loop = [0, 749];
    bg.variants[1].fps = 30;
    const e = errorsOf(doc);
    expect(e).toMatch(/BG_WebinarPortal: loop: variant "16x9_4K": the loop part has 749 frames, the period is 750/);
    expect(e).toMatch(/BG_WebinarPortal: loop: a looped item needs one fps/);
  });
  it('rejects a frame size that does not match the aspect', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').variants[3].w = 1440;
    expect(errorsOf(doc)).toMatch(/aspect: variant "1x1": 1440x1080 is not 1x1/);
  });
  it('rejects a video companion that is T1 or not under', () => {
    const doc = example();
    item(doc, 'WEB_Screen').companions[0].placement = 'in';
    expect(errorsOf(doc)).toMatch(/WEB_Screen: companion-kind: companion "BG_WebinarPortal"/);
  });
  it('holds export presets to 25 fps, one epr variant and an AE template from the .aom (P18, P21)', () => {
    let doc = example();
    item(doc, 'AME_SMM_9x16').variants[0].fps = 30;
    expect(errorsOf(doc)).toMatch(/AME_SMM_9x16: export: the preset is 30 fps; D2 fixes 25/);
    doc = example();
    delete item(doc, 'AME_FullHD').omTemplate;
    item(doc, 'AME_4K').omTemplate = 'CR SMM 1x1';
    expect(errorsOf(doc)).toMatch(/AME_FullHD: export: an AE preset needs omTemplate/);
    expect(errorsOf(doc)).toMatch(/AME_4K: export: omTemplate "CR SMM 1x1" is also on AME_SMM_1x1/);
    doc = example();
    doc.items = doc.items.filter((i) => i.id !== 'AME_Templates');
    expect(errorsOf(doc)).toMatch(/AME_FullHD: export: an AE preset needs the .aom item/);
    doc = example();
    item(doc, 'BG_Arrows').omTemplate = 'CR Arrows';
    item(doc, 'AME_4K').category = 'sounds';
    expect(errorsOf(doc)).toMatch(/BG_Arrows: export: omTemplate is for export presets/);
    expect(errorsOf(doc)).toMatch(/AME_4K: export: AME_ items and the export category go together/);
    doc = example();
    item(doc, 'AME_4K').omTemplate = 'Lossless';
    expect(errorsOf(doc)).toMatch(/omTemplate/);
  });
});

describe('library catalog', () => {
  it('detects the kind', () => {
    expect(detectKind(example())).toBe('source');
    expect(detectKind(catalog())).toBe('catalog');
  });
  it('accepts a minimal catalog', () => {
    expect(validateLibrary(catalog())).toEqual({ ok: true, kind: 'catalog', errors: [] });
  });
  it('requires pinned font builds and a calver libraryVersion (schema)', () => {
    const doc = catalog();
    delete doc.items[0].requiredFonts[0].build;
    doc.libraryVersion = '2026-10-02';
    const e = errorsOf(doc);
    expect(e).toMatch(/requiredFonts\/0 must have required property 'build'/);
    expect(e).toMatch(/libraryVersion must match pattern/);
  });
  it('requires aeComp with the item version', () => {
    const doc = catalog();
    doc.items[0].variants[0].aeComp = 'CR_TTL_LowerThird_16x9_v2';
    expect(errorsOf(doc)).toMatch(/ae-comp: variant "16x9": aeComp must end with _v1/);
  });
  it('requires a .mogrt for Premiere T1 variants and the .aep for AE', () => {
    const doc = catalog();
    delete doc.items[0].variants[0].file;
    delete doc.items[0].variants[0].sha256;
    delete doc.items[0].variants[0].bytes;
    delete doc.items[0].aep;
    const e = errorsOf(doc);
    expect(e).toMatch(/files: variant "16x9": a Premiere T1 variant needs a .mogrt file/);
    expect(e).toMatch(/files: an AE T1 item needs its .aep/);
  });
  it('requires sha256 next to a file (schema)', () => {
    const doc = catalog();
    delete doc.items[0].variants[0].sha256;
    expect(errorsOf(doc)).toMatch(/must have properties sha256, bytes when property file is present/);
  });
  it('rejects file names over 64 characters', () => {
    const doc = catalog();
    doc.items[0].variants[0].file = 'items/TTL_LowerThird/' + 'x'.repeat(60) + '.mogrt';
    expect(errorsOf(doc)).toMatch(/file-name: .*at most 64 characters/);
  });
});
