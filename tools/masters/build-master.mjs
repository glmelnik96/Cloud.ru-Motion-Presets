#!/usr/bin/env node
// Builds one master template in the live AE (BrandKit Dev panel, CDP 8094) from masters/<id>/:
// resolve.mjs (Node: numbers from the pack dumps, logo, tokens) -> build.jsx (AE: a new project, saved
// as <work>/build/<id>/<id>_work.aep). One host call; a call that timed out is never re-sent (spec §6).
//   node tools/masters/build-master.mjs --item LOGO_Shot [--dry]
// Preconditions: no unsaved user project open in AE (the builder refuses it).
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { ensureDir } from '../lib/work.mjs';

export const LIBS = ['spikes/lib/ae-project.jsx', 'tools/masters/jsx/ae-build-lib.jsx'];

export async function loadMaster(id) {
  if (!/^[A-Z]+_[A-Za-z0-9]+$/.test(id || '')) throw new Error('bad item id: ' + id);
  const dir = path.join(REPO, 'masters', id);
  const mod = await import(pathToFileURL(path.join(dir, 'resolve.mjs')).href);
  if (typeof mod.resolve !== 'function') throw new Error(`masters/${id}/resolve.mjs must export resolve()`);
  return { dir, params: mod.resolve(), jsx: path.posix.join('masters', id, 'build.jsx') };
}

export function printChecks(checks, log = console.log) {
  let failed = 0;
  for (const c of checks) {
    if (!c.pass && c.required) failed += 1;
    const mark = c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn');
    log(mark + ' ' + c.name + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 600)));
  }
  return failed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const id = argv.includes('--item') ? argv[argv.indexOf('--item') + 1] : null;
  const { params, jsx } = await loadMaster(id);
  const body = composeProbe(LIBS.concat([jsx]), params);
  if (argv.includes('--dry')) {
    console.log(`${id}: payload ${body.length} chars, out ${params.out.aep}`);
    process.exit(0);
  }
  ensureDir(params.out.dir);
  // Keep the previous build as .prev.aep: AE saves into a free name and never asks to overwrite.
  if (existsSync(params.out.aep)) renameSync(params.out.aep, params.out.aep.replace(/\.aep$/, '.prev.aep'));
  let r;
  try {
    r = await run('ae', body, { timeoutMs: 300000 });
  } catch (e) {
    console.error('ERROR: ' + e.message);
    console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
    process.exit(1);
  }
  if (!r || !Array.isArray(r.checks)) {
    console.error('unexpected reply: ' + JSON.stringify(r).slice(0, 400));
    process.exit(1);
  }
  const failed = printChecks(r.checks);
  const report = path.posix.join(params.out.dir, 'build-report.json');
  writeFileSync(report, JSON.stringify(r, null, 2) + '\n', 'utf8');
  console.log((failed ? failed + ' required step(s) failed' : 'built: ' + params.out.aep) + '; report ' + report);
  process.exit(failed ? 1 : 0);
}
