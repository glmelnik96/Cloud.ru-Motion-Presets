// Run our JSX files in the live AE with PARAMS (like runSpike, without the spike check helpers).
// Every JSX here returns JSON.stringify({ ok, error, detail, ... }); a reply with `error` throws.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../..');

export function composeJsx(files, params = {}) {
  return ['var PARAMS = ' + JSON.stringify(params) + ';']
    .concat(files.map((f) => readFileSync(path.resolve(REPO, f), 'utf8')))
    .join('\n');
}

export async function callJsx(files, params = {}, { timeoutMs = 120000 } = {}) {
  const r = await run('ae', composeJsx([].concat(files), params), { timeoutMs });
  if (r && r.error) {
    const e = new Error(r.error + (r.detail === undefined ? '' : ': ' + JSON.stringify(r.detail)));
    e.result = r;
    throw e;
  }
  return r;
}
