#!/usr/bin/env node
// Builds the shared AE fixture <work>/fixtures/CRT_fixture.aep in the live AE (BrandKit Dev panel, CDP 8094).
//   node spikes/fixtures/build-ae-fixture.mjs
// Preconditions: media made (make-media.mjs); no unsaved user project open in AE (the builder refuses it).
// Prints one line per step, writes <work>/fixtures/build-report.json, exits 1 if a required step failed.
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { run } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { fixtureParams } from './contract.mjs';

const params = fixtureParams();
if (!existsSync(params.media.slotA)) {
  console.error('missing ' + params.media.slotA + ': run node spikes/fixtures/make-media.mjs');
  process.exit(2);
}
ensureDir(workPath('fixtures'));
// Keep the previous build as .prev.aep: AE then saves into a free name and never asks to overwrite.
if (existsSync(params.fixtureAep)) renameSync(params.fixtureAep, params.fixtureAep.replace(/\.aep$/, '.prev.aep'));

const jsx = composeProbe(['spikes/lib/ae-project.jsx', 'spikes/fixtures/build-ae-fixture.jsx'], params);
let r;
try {
  r = await run('ae', jsx, { timeoutMs: 300000 });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  process.exit(1);
}
if (!r || !Array.isArray(r.checks)) {
  console.error('unexpected reply: ' + JSON.stringify(r).slice(0, 300));
  process.exit(1);
}
let failed = 0;
for (const c of r.checks) {
  if (!c.pass && c.required) failed += 1;
  const mark = c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn');
  console.log(mark + ' ' + c.name + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 400)));
}
const report = workPath('fixtures', 'build-report.json');
writeFileSync(report, JSON.stringify(r, null, 2) + '\n', 'utf8');
for (const comp of (r.data && r.data.comps) || []) {
  console.log(comp.name + ': ' + comp.layers.join(', '));
}
console.log((failed ? failed + ' required step(s) failed' : 'fixture built: ' + params.fixtureAep) + '; report ' + report);
process.exit(failed ? 1 : 0);
