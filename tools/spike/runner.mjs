// Runs one spike probe in the host and records its result.
//   runSpike({ id, title, host, files, params, timeoutMs, fallback, notes, evidence, verdict, verdictLocked })
// files: JSX files concatenated after `var PARAMS = <json>;` and spikes/lib/check.jsx.
// The probe must end with finish({...}) from check.jsx. Pass verdict + verdictLocked only for
// spikes that measure without a yes/no (S8 in phase 0).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { makeResult, writeResult } from './result.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../..');
const CHECK_LIB = path.join(REPO, 'spikes', 'lib', 'check.jsx');

export function composeProbe(files, params = {}) {
  const parts = ['var PARAMS = ' + JSON.stringify(params) + ';', readFileSync(CHECK_LIB, 'utf8')];
  for (const f of files) parts.push(readFileSync(path.resolve(REPO, f), 'utf8'));
  return parts.join('\n');
}

export async function runSpike({ id, title, host, files, params = {}, timeoutMs = 300000, fallback = '', notes = '', evidence = [], verdict, verdictLocked = false }) {
  const jsx = composeProbe(files, params);
  const r = await run(host, jsx, { timeoutMs });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error(id + ': the probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  const result = makeResult({
    id, title, host,
    hostVersion: r.data ? r.data.hostVersion : null,
    checks: r.checks, verdict, verdictLocked, fallback, notes, evidence,
  });
  const file = writeResult(result);
  return { result, file, data: r.data };
}
