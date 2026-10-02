#!/usr/bin/env node
// Record a manual observation: node tools/spike/manual.mjs --id S8 --check "FHD real time" --pass true --detail "no drops"
import { appendManualCheck } from './result.mjs';

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const id = val('--id');
const name = val('--check');
const pass = val('--pass');
if (!id || !name || (pass !== 'true' && pass !== 'false')) {
  console.error('usage: node tools/spike/manual.mjs --id SN --check "<name>" --pass true|false [--detail "<text>"] [--optional]');
  process.exit(2);
}
const r = appendManualCheck(id, {
  name, pass: pass === 'true', detail: val('--detail') || '', required: !argv.includes('--optional'),
});
console.log(id + ': ' + r.verdict + ' (' + r.checks.length + ' checks)');
