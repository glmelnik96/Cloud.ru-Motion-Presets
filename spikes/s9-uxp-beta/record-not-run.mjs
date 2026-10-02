#!/usr/bin/env node
// S9 when Premiere (Beta) 27 is not available: record the spike as "not-run" with what was looked for.
//   node spikes/s9-uxp-beta/record-not-run.mjs [--reason "<why>"] [--force]
// --force records not-run even if a beta folder exists (for example, UDT cannot connect to it).
// The verdict is locked: notes added with tools/spike/manual.mjs keep it; record-report.mjs replaces it.
import { existsSync, readdirSync } from 'node:fs';
import { makeResult, writeResult } from '../../tools/spike/result.mjs';
import { S9_ID, S9_TITLE, S9_FALLBACK, S9_REVISIT, detectBeta } from './lib.mjs';

const argv = process.argv.slice(2);
const reason = argv.includes('--reason') ? argv[argv.indexOf('--reason') + 1] : '';
const roots = process.platform === 'darwin' ? ['/Applications'] : ['C:/Program Files/Adobe'];
const entries = [];
for (const r of roots) if (existsSync(r)) entries.push(...readdirSync(r));
const found = detectBeta(entries);

if (found.premiereBeta && !argv.includes('--force')) {
  console.error(`Premiere beta found: "${found.premiereBeta}". Run the plugin steps of task 20, or pass --force with --reason.`);
  process.exit(1);
}

const seen = found.premiereBeta ? `найдена «${found.premiereBeta}», но не проверена` : `Premiere (Beta) не найдена в ${roots.join(', ')}`;
const udt = found.udt ? `UDT: «${found.udt}»` : 'UXP Developer Tool не найден';
const result = makeResult({
  id: S9_ID, title: S9_TITLE, host: 'pr-beta', checks: [], verdict: 'not-run', verdictLocked: true, fallback: S9_FALLBACK,
  notes: [seen, udt, reason, S9_REVISIT].filter(Boolean).join('. '),
  evidence: ['spikes/s9-uxp-beta/plugin/'],
});
console.log(`written ${writeResult(result)} (S9: not-run; ${seen}; ${udt})`);
