// Assembles the ES3 host adapters of the panel: tools/jsx/prelude-json.jsx + panel/host/common.jsx +
// panel/host/<host>.jsx. One stamp for both hosts (sha256 of all parts, 12 hex) replaces __CRBK_BUILD__, so the
// panel can tell a stale adapter after a reload (plan 2026-10-05 P4). Every assembly must be pure ASCII
// (evalScript mangles anything else on Windows) and pass the ES3 linter in library mode.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { lint } = require('../jsx/lint-jsx.cjs');

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HOSTS = ['ae', 'pr'];
export const STAMP = '__CRBK_BUILD__';

export function readParts(root = REPO) {
  const read = (p) => readFileSync(path.join(root, p), 'utf8');
  return {
    prelude: read('tools/jsx/prelude-json.jsx'),
    common: read('panel/host/common.jsx'),
    ae: read('panel/host/ae.jsx'),
    pr: read('panel/host/pr.jsx'),
  };
}

export function stampOf(parts) {
  return createHash('sha256').update([parts.prelude, parts.common, parts.ae, parts.pr].join('\n\0')).digest('hex').slice(0, 12);
}

// -> { build, ae, pr, warnings: { ae: [], pr: [] } }; throws on non-ASCII or an ES3 lint error.
export function buildHost(parts = readParts()) {
  const build = stampOf(parts);
  const out = { build, warnings: {} };
  for (const host of HOSTS) {
    const src = [parts.prelude, parts.common, parts[host]].join('\n').split(STAMP).join(build);
    const bad = src.match(/[^\x00-\x7f]/);
    if (bad) {
      const line = src.slice(0, bad.index).split('\n').length;
      throw new Error(`host ${host}: non-ASCII character ${JSON.stringify(bad[0])} on line ${line} of the assembly`);
    }
    const r = lint(src, { lib: true });
    if (r.errors.length) throw new Error(`host ${host}: ES3 lint: ${r.errors.join('; ')}`);
    out[host] = src;
    out.warnings[host] = r.warnings;
  }
  return out;
}
