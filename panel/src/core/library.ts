// library.json -> Library. The panel checks a catalog with the pipeline's own code (plan P8): the caller injects
// the validator generated from tools/library/schema (ajv standalone) together with tools/library/rules.mjs, so the
// panel and the pipeline accept exactly the same catalogs.
import type { HostKey, Issue, Item, Library } from './types';
import { parseSemver, pluginAtLeast } from './versions';

export interface Validation {
  ok: boolean;
  errors: string[];
}

export type ValidateLibrary = (doc: unknown) => Validation;

export type ParsedLibrary = { ok: true; library: Library; issues: Issue[] } | { ok: false; issues: Issue[] };

const SHOWN_ERRORS = 3;

// Files written by PowerShell 5.1 may start with a BOM, which JSON.parse rejects.
const stripBom = (t: string) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

function invalid(errors: string[]): ParsedLibrary {
  const shown = errors.slice(0, SHOWN_ERRORS).join('; ') || 'rejected';
  const more = errors.length > SHOWN_ERRORS ? ` (+${errors.length - SHOWN_ERRORS})` : '';
  return { ok: false, issues: [{ code: 'LIBRARY_INVALID', level: 'error', params: { details: shown + more, count: errors.length } }] };
}

export function parseLibrary(text: string, validate: ValidateLibrary, pluginVersion: string): ParsedLibrary {
  let doc: unknown;
  try {
    doc = JSON.parse(stripBom(String(text)));
  } catch (e) {
    return invalid(['JSON: ' + reason(e)]);
  }
  // A newer library is expected to fail an older panel's schema, so its version speaks first: "update the panel"
  // is the right message, "the library is broken" is not. A malformed version is left to the schema.
  const need = isRecord(doc) ? doc.minPluginVersion : undefined;
  if (typeof need === 'string' && parseSemver(need) && !pluginAtLeast(pluginVersion, need)) {
    return { ok: false, issues: [{ code: 'PLUGIN_TOO_OLD', level: 'error', params: { need, have: String(pluginVersion) } }] };
  }
  let verdict: Validation;
  try {
    verdict = validate(doc);
  } catch (e) {
    return invalid(['validator: ' + reason(e)]);
  }
  if (!verdict.ok) return invalid(Array.isArray(verdict.errors) ? verdict.errors : []);
  if (!isRecord(doc) || !Array.isArray(doc.items)) return invalid(['not a catalog: no items']);
  return { ok: true, library: doc as unknown as Library, issues: [] };
}

// The items this host can insert; the others are hidden in the panel (spec 7).
export function itemsFor(library: Library, host: HostKey): Item[] {
  return library.items.filter((i) => Array.isArray(i.hosts) && i.hosts.includes(host));
}
