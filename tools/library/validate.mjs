#!/usr/bin/env node
// Validates library.src.json (source) and library.json (catalog): JSON Schema 2020-12 first,
// then the cross-field rules that a schema cannot express (spec 4.2, 4.4, 6.1; tools/library/rules.mjs).
//   node tools/library/validate.mjs docs/library/example.src.json
//   node tools/library/validate.mjs --catalog <library root>/library.json
// The kind is detected by libraryVersion (catalog only) unless --source or --catalog is given.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkLibrary, crossCheck, detectKind } from './rules.mjs';

export { crossCheck, detectKind };

const here = path.dirname(fileURLToPath(import.meta.url));
// Files written by PowerShell 5.1 may start with a BOM, which JSON.parse rejects.
const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));
export const SRC_SCHEMA = readJson(path.join(here, 'schema', 'library.src.schema.json'));
export const CATALOG_SCHEMA = readJson(path.join(here, 'schema', 'library.schema.json'));

// strictRequired is off: "required" inside if/then names properties declared by the parent schema.
// allowUnionTypes: field defaults and switch values are unions (string | number | boolean | null).
// gen-standalone.mjs compiles the panel's validators with the same options.
export const AJV_OPTIONS = { allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true };
const ajv = new Ajv2020(AJV_OPTIONS);
ajv.addSchema(SRC_SCHEMA);
ajv.addSchema(CATALOG_SCHEMA);
const schemaFor = {
  source: ajv.getSchema(SRC_SCHEMA.$id),
  catalog: ajv.getSchema(CATALOG_SCHEMA.$id),
};

export function validateLibrary(doc, kind = detectKind(doc)) {
  return checkLibrary(doc, kind, schemaFor[kind]);
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
