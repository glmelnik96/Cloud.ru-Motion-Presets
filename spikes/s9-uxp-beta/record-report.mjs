#!/usr/bin/env node
// S9: turn the plugin report (copied into the repo) into the S9 result. Observations that only a person
// can make (Program Monitor, Properties panel, undo steps) are added later with tools/spike/manual.mjs.
// The verdict is computed from the checks: a real run replaces the locked not-run of branch A.
//   node spikes/s9-uxp-beta/record-report.mjs spikes/s9-uxp-beta/report.json
import { existsSync, readFileSync } from 'node:fs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { S9_ID, S9_TITLE, S9_FALLBACK, S9_REVISIT, checksFromReport } from './lib.mjs';

const file = process.argv[2] || 'spikes/s9-uxp-beta/report.json';
if (!existsSync(file)) {
  console.error(`no plugin report: ${file}\nusage: node spikes/s9-uxp-beta/record-report.mjs [spikes/s9-uxp-beta/report.json]`);
  process.exit(2);
}
const report = JSON.parse(readFileSync(file, 'utf8'));
const checks = checksFromReport(report);
const result = writeStageResult({
  id: S9_ID, title: S9_TITLE, host: 'pr-beta',
  hostVersion: report.host ? `${report.host.name} ${report.host.version}` : null,
  stage: 'uxp', checks, keepLocked: false, fallback: S9_FALLBACK,
  notes: `Отчёт плагина: ${file} (UXP ${report.uxp || '?'}, ${report.platform || '?'}). ${S9_REVISIT}`,
  evidence: [file, 'spikes/s9-uxp-beta/plugin/'],
});
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.required ? '' : '(optional) '}${c.name}${c.detail ? ' | ' + c.detail : ''}`);
console.log(`S9: ${result.verdict} (${result.checks.length} checks) -> spikes/results/S9.json`);
