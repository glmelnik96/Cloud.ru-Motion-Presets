#!/usr/bin/env node
// Phase 0 closure (task 30):
//   node tools/decisions/closure-cli.mjs --write      docs/decisions/phase0-closure.md from spikes/results (never overwrites)
//   node tools/decisions/closure-cli.mjs --fill-c27   contract rule C27 from spikes/results/S3.data.json (field mechanism)
//   node tools/decisions/closure-cli.mjs --check      what phase 0 still lacks; exit 1 while anything is open
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResults, RESULTS_DIR } from '../spike/result.mjs';
import { closureRows, renderClosure, fillC27, closureProblems } from './closure.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = {
  closure: path.join(REPO, 'docs/decisions/phase0-closure.md'),
  decisions: path.join(REPO, 'docs/decisions/phase0-decisions.md'),
  contract: path.join(REPO, 'docs/contract/template-contract.md'),
  panel: path.join(REPO, 'docs/decisions/panel-framework.md'),
  logo: path.join(REPO, 'docs/research/logo-geometry.md'),
  s3data: path.join(RESULTS_DIR, 'S3.data.json'),
};
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const mode = process.argv[2];

if (mode === '--write') {
  if (existsSync(FILES.closure)) {
    console.log('exists: ' + FILES.closure + ' (edit it by hand; to regenerate, delete it yourself first)');
  } else {
    const md = renderClosure(closureRows(readResults()), { date: new Date().toISOString().slice(0, 10) });
    writeFileSync(FILES.closure, md, 'utf8');
    console.log('written ' + FILES.closure);
  }
} else if (mode === '--fill-c27') {
  const data = JSON.parse(readFileSync(FILES.s3data, 'utf8'));
  writeFileSync(FILES.contract, fillC27(readFileSync(FILES.contract, 'utf8'), data.mechanism), 'utf8');
  console.log('C27: ' + data.mechanism);
} else if (mode === '--check') {
  const problems = closureProblems({
    results: readResults(),
    closureMd: read(FILES.closure),
    decisionsMd: read(FILES.decisions),
    contractMd: read(FILES.contract),
    panelMd: read(FILES.panel),
    logoGeometry: existsSync(FILES.logo),
  });
  for (const p of problems) console.log('- ' + p);
  console.log(problems.length ? 'phase 0 closure: ' + problems.length + ' open item(s)' : 'phase 0 closure: OK');
  process.exitCode = problems.length ? 1 : 0;
} else {
  console.error('usage: node tools/decisions/closure-cli.mjs --write | --fill-c27 | --check');
  process.exitCode = 2;
}
