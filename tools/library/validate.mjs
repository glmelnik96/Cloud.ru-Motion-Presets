#!/usr/bin/env node
// Validates library.src.json (source) and library.json (catalog): JSON Schema 2020-12 first,
// then the cross-field rules that a schema cannot express (spec 4.2, 4.4, 6.1).
//   node tools/library/validate.mjs docs/library/example.src.json
//   node tools/library/validate.mjs --catalog <library root>/library.json
// The kind is detected by libraryVersion (catalog only) unless --source or --catalog is given.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Files written by PowerShell 5.1 may start with a BOM, which JSON.parse rejects.
const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));
export const SRC_SCHEMA = readJson(path.join(here, 'schema', 'library.src.schema.json'));
export const CATALOG_SCHEMA = readJson(path.join(here, 'schema', 'library.schema.json'));

// strictRequired is off: "required" inside if/then names properties declared by the parent schema.
// allowUnionTypes: field defaults and switch values are unions (string | number | boolean | null).
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
ajv.addSchema(SRC_SCHEMA);
ajv.addSchema(CATALOG_SCHEMA);
const schemaFor = {
  source: ajv.getSchema(SRC_SCHEMA.$id),
  catalog: ajv.getSchema(CATALOG_SCHEMA.$id),
};

const ASPECTS = { '16x9': 16 / 9, '9x16': 9 / 16, '1x1': 1, '4x5': 4 / 5, '4x3': 4 / 3 };
const FILE_NAME = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export function detectKind(doc) {
  return doc && typeof doc === 'object' && 'libraryVersion' in doc ? 'catalog' : 'source';
}

function formatSchemaError(e) {
  const at = e.instancePath || '/';
  if (e.keyword === 'propertyNames') return `schema: ${at} unknown property "${e.params.propertyName}"`;
  if (e.keyword === 'additionalProperties') return `schema: ${at} unknown property "${e.params.additionalProperty}"`;
  return `schema: ${at} ${e.message}`;
}

function schemaErrors(doc, kind) {
  const validate = schemaFor[kind];
  if (validate(doc)) return [];
  // Errors inside propertyNames carry e.propertyName; the propertyNames error itself names the property.
  return [...new Set(validate.errors.filter((e) => e.propertyName === undefined).map(formatSchemaError))];
}

function checkItem(item, byId, kind, err) {
  const fields = item.fields || [];
  const variants = item.variants || [];
  const fieldByKey = new Map();
  for (const f of fields) {
    if (fieldByKey.has(f.key)) err('unique-keys', `field "${f.key}" is declared twice`);
    fieldByKey.set(f.key, f);
  }
  const variantByKey = new Map();
  for (const v of variants) {
    if (variantByKey.has(v.key)) err('unique-keys', `variant "${v.key}" is declared twice`);
    variantByKey.set(v.key, v);
  }

  // Values of switches used by variant options and window conditions.
  const checkSwitches = (where, values) => {
    for (const [k, val] of Object.entries(values || {})) {
      const f = fieldByKey.get(k);
      if (!f || (f.type !== 'dropdown' && f.type !== 'checkbox')) {
        err('switch-ref', `${where}: "${k}" is not a dropdown or checkbox field`);
      } else if (f.type === 'checkbox' && typeof val !== 'boolean') {
        err('switch-ref', `${where}: "${k}" needs true or false`);
      } else if (f.type === 'dropdown' && !(Number.isInteger(val) && val >= 1 && val <= f.options.length)) {
        err('switch-ref', `${where}: "${k}" needs an option index 1..${f.options.length}`);
      }
    }
  };

  // Duration of a trim template: the comp is as long as the longest insert (spec 4.2 "Время", 6.1 step 3).
  const driving = fields.filter((f) => f.drivesDuration);
  if (item.fit === 'trim' && item.duration) {
    const d = item.duration;
    const longest = Math.max(d.introSec + d.holdSec + d.outroSec,
      ...driving.filter((f) => f.type === 'slider').map((f) => f.max * f.unitSec + d.outroSec));
    if (d.maxSec === undefined) err('trim-length', 'a trim template needs duration.maxSec (the length of its comp)');
    else if (d.maxSec + 1e-6 < longest) err('trim-length', `duration.maxSec ${d.maxSec} is shorter than the longest insert ${longest}`);
  } else if (item.duration && item.duration.maxSec !== undefined) {
    err('trim-length', 'duration.maxSec is for fit "trim" only');
  }

  // Fields.
  if (driving.length > 1) err('drives-duration', `${driving.length} fields drive the duration; at most one may`);
  const egpNames = new Set();
  for (const f of fields) {
    if (f.type === 'dropdown') {
      f.options.forEach((o, i) => {
        if (o.index !== i + 1) err('options-index', `field "${f.key}": options must be indexed 1..${f.options.length} in order`);
      });
    }
    if (f.drivesDuration && (f.type !== 'slider' || f.service)) {
      err('drives-duration', `field "${f.key}": only a visible slider can drive the duration`);
    }
    if (f.service) {
      if (f.editable !== false) err('service-field', `field "${f.key}": a service field must set "editable": false`);
      if (f.type !== 'slider') err('service-field', `field "${f.key}": a service field must be a slider`);
    }
    if (f.enabledBy !== undefined) {
      const g = fieldByKey.get(f.enabledBy);
      if (!g || g.type !== 'checkbox') err('enabled-by', `field "${f.key}": enabledBy "${f.enabledBy}" is not a checkbox field`);
    }
    if (f.hosts && f.hosts.some((h) => !item.hosts.includes(h))) {
      err('field-hosts', `field "${f.key}": hosts ${f.hosts.join(',')} are not all item hosts`);
    }
    if (item.tier === 'T1') {
      if (!f.egpName) err('egp-name', `field "${f.key}": a T1 field needs egpName`);
      else if (egpNames.has(f.egpName)) err('egp-name', `field "${f.key}": egpName "${f.egpName}" is used twice`);
      else egpNames.add(f.egpName);
    }
    if (f.type === 'slider' && !(f.min < f.max)) err('field-default', `field "${f.key}": min must be below max`);
    if (f.default !== undefined && f.default !== null) {
      const d = f.default;
      const bad =
        (f.type === 'text' && (typeof d !== 'string' || d.length > f.maxLen)) ||
        (f.type === 'checkbox' && typeof d !== 'boolean') ||
        (f.type === 'dropdown' && !(Number.isInteger(d) && d >= 1 && d <= f.options.length)) ||
        (f.type === 'slider' && !(typeof d === 'number' && d >= f.min && d <= f.max)) ||
        (f.type === 'media' && typeof d !== 'string');
      if (bad) err('field-default', `field "${f.key}": default ${JSON.stringify(d)} does not fit type ${f.type}`);
    }
    if (f.type === 'media' && f.accepts.includes('video') && item.fit !== 'trim') {
      err('media-fit', `field "${f.key}": a slot that accepts video makes the template fit "trim"`);
    }
  }

  // Variants.
  const aeComps = new Set();
  for (const v of variants) {
    if (v.aspect && v.w && v.h && Math.abs(v.w / v.h - ASPECTS[v.aspect]) / ASPECTS[v.aspect] > 0.01) {
      err('aspect', `variant "${v.key}": ${v.w}x${v.h} is not ${v.aspect}`);
    }
    checkSwitches(`variant "${v.key}" options`, v.options);
    if (item.tier === 'T1' && item.hosts.includes('ae')) {
      if (!v.aeComp) {
        err('ae-comp', `variant "${v.key}": an AE-capable variant needs aeComp`);
      } else {
        const versioned = /_v[0-9]+$/.test(v.aeComp);
        if (kind === 'source' && versioned) err('ae-comp', `variant "${v.key}": aeComp in the source has no _vN, the pipeline adds it`);
        if (kind === 'catalog' && !v.aeComp.endsWith('_v' + item.version)) err('ae-comp', `variant "${v.key}": aeComp must end with _v${item.version}`);
        if (aeComps.has(v.aeComp)) err('ae-comp', `variant "${v.key}": aeComp "${v.aeComp}" is used twice`);
        aeComps.add(v.aeComp);
      }
    }
    if (v.parts) {
      const frames = (p) => (Array.isArray(p) ? p[1] - p[0] : p.frames);
      if (kind === 'source') {
        for (const [name, r] of Object.entries(v.parts)) {
          if (!(r[0] < r[1])) err('parts', `variant "${v.key}": part ${name} needs from < to`);
        }
        const order = ['intro', 'loop', 'outro'].filter((n) => v.parts[n]);
        for (let i = 1; i < order.length; i += 1) {
          if (v.parts[order[i - 1]][1] !== v.parts[order[i]][0]) err('parts', `variant "${v.key}": ${order[i - 1]} and ${order[i]} must be contiguous`);
        }
      }
      if (item.loop && v.parts.loop && frames(v.parts.loop) !== item.loop.periodFrames) {
        err('loop', `variant "${v.key}": the loop part has ${frames(v.parts.loop)} frames, the period is ${item.loop.periodFrames}`);
      }
    }
  }
  if (item.alpha !== undefined && item.tier === 'T1') err('alpha', 'alpha is for T2/T3 media; a T1 template brings its own background');

  // Export presets (decisions P18, P21): an AME_ item is T3 of the «Экспорт» category; a preset is one .epr
  // variant with its frame at 25 fps (D2), and in AE the Output Module template of the brand .aom.
  const isExport = item.category === 'export';
  if (isExport !== item.id.startsWith('AME_')) err('export', 'AME_ items and the export category go together');
  if (item.omTemplate !== undefined && !isExport) err('export', 'omTemplate is for export presets');
  if (isExport) {
    const epr = variants.find((v) => v.key === 'epr');
    if (item.tier !== 'T3') err('export', 'an export item is T3');
    if (epr) {
      if (variants.length !== 1) err('export', 'a preset has one variant, epr');
      if (!epr.aspect || !epr.w || !epr.h || !epr.fps) err('export', 'the epr variant needs aspect, w, h and fps');
      else if (epr.fps !== 25) err('export', `the preset is ${epr.fps} fps; D2 fixes 25`);
      if (item.hosts.includes('ae') && !item.omTemplate) err('export', 'an AE preset needs omTemplate');
      if (kind === 'catalog' && epr.file && !epr.file.endsWith('.epr')) err('export', 'the epr variant needs an .epr file');
    } else if (!variants.some((v) => v.key === 'aom')) err('export', 'an export item has an epr or an aom variant');
    if (item.omTemplate) {
      const twin = [...byId.values()].find((o) => o !== item && o.omTemplate === item.omTemplate);
      if (twin) err('export', `omTemplate "${item.omTemplate}" is also on ${twin.id}`);
      if (![...byId.values()].some((o) => o.category === 'export' && o.variants.some((v) => v.key === 'aom'))) {
        err('export', 'an AE preset needs the .aom item with its template');
      }
    }
  }
  if (item.loop && new Set(variants.map((v) => v.fps)).size > 1) {
    err('loop', 'a looped item needs one fps across its variants');
  }

  // Windows.
  for (const win of item.windows || []) {
    for (const r of win.rects) {
      const v = variantByKey.get(r.variant);
      if (!v) { err('windows', `window "${win.key}": no variant "${r.variant}"`); continue; }
      checkSwitches(`window "${win.key}" when`, r.when);
      if (v.w && v.h && (r.x < 0 || r.y < 0 || r.x + r.w > v.w || r.y + r.h > v.h)) {
        err('windows', `window "${win.key}": the rect leaves the ${v.w}x${v.h} frame of "${v.key}"`);
      }
    }
  }

  // Companions.
  for (const c of item.companions || []) {
    const ref = byId.get(c.ref);
    if (!ref || c.ref === item.id) { err('companion-ref', `companion "${c.ref}" does not exist`); continue; }
    if ((c.kind === 'music' || c.kind === 'sfx') && ref.category !== 'sounds') err('companion-kind', `companion "${c.ref}": ${c.kind} must be a sounds item`);
    if (c.kind === 'video' && (ref.tier === 'T1' || c.placement !== 'under')) err('companion-kind', `companion "${c.ref}": a video companion is T2/T3 and goes under`);
  }

  // Previews per format and look.
  for (const p of item.previews || []) {
    if (!variantByKey.has(p.variant)) err('previews', `preview ${p.video.file}: no variant "${p.variant}"`);
    checkSwitches(`preview ${p.video.file} when`, p.when);
  }

  // Catalog files.
  if (kind === 'catalog') {
    const stored = [];
    for (const k of ['aep', 'preview', 'poster']) if (item[k]) stored.push(item[k].file);
    for (const p of item.previews || []) stored.push(p.video.file, p.poster.file);
    for (const v of variants) {
      if (v.file) stored.push(v.file);
      for (const p of Object.values(v.parts || {})) stored.push(p.file);
      if (item.tier === 'T1' && item.hosts.includes('pr') && !(v.file && v.file.endsWith('.mogrt'))) err('files', `variant "${v.key}": a Premiere T1 variant needs a .mogrt file`);
      if (item.tier === 'T2' && !v.file && !v.parts) err('files', `variant "${v.key}": a T2 variant needs a file or parts`);
    }
    if (item.tier === 'T1' && item.hosts.includes('ae') && !(item.aep && item.aep.file.endsWith('.aep'))) err('files', 'an AE T1 item needs its .aep');
    for (const f of stored) {
      const base = f.split('/').pop();
      if (base.length > 64 || !FILE_NAME.test(base)) err('file-name', `"${base}" must be ASCII [A-Za-z0-9_-] and at most 64 characters`);
    }
  }
}

export function crossCheck(doc, kind = detectKind(doc)) {
  const errors = [];
  const items = doc.items || [];
  const byId = new Map();
  for (const it of items) {
    if (byId.has(it.id)) errors.push(`${it.id}: unique-id: the id is used twice`);
    byId.set(it.id, it);
  }
  for (const it of items) checkItem(it, byId, kind, (rule, msg) => errors.push(`${it.id}: ${rule}: ${msg}`));
  return errors;
}

export function validateLibrary(doc, kind = detectKind(doc)) {
  const errors = schemaErrors(doc, kind);
  // Cross-field rules assume the shape is right, so they run only on a schema-valid document.
  if (!errors.length) errors.push(...crossCheck(doc, kind));
  return { ok: errors.length === 0, kind, errors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node tools/library/validate.mjs [--source|--catalog] <library.src.json|library.json>');
    process.exit(2);
  }
  const doc = readJson(file);
  const forced = argv.includes('--catalog') ? 'catalog' : argv.includes('--source') ? 'source' : undefined;
  const r = validateLibrary(doc, forced);
  if (r.ok) {
    console.log(`OK ${file}: ${r.kind}, ${doc.items.length} items`);
  } else {
    for (const e of r.errors) console.error(e);
    console.error(`FAIL ${file}: ${r.kind}, ${r.errors.length} errors`);
    process.exit(1);
  }
}
