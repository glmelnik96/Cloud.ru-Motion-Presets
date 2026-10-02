#!/usr/bin/env node
// Record one manual playback observation for S11.
//   Premiere: node spikes/s11-loop-codec/playback.mjs pr png bg_1x1 <dropped frames> ["note"]
//   AE:       node spikes/s11-loop-codec/playback.mjs ae png bg_1x1 <first-pass fps> ["note"]
import { appendManualCheck } from '../../tools/spike/result.mjs';
import { S11_ID, playbackCheck } from './lib.mjs';

const [app, variant, key, value, note] = process.argv.slice(2);
let check;
try {
  check = playbackCheck({ tag: process.platform, app, variant, key, value });
} catch (e) {
  console.error(e.message + '\nusage: node spikes/s11-loop-codec/playback.mjs pr|ae png|prores_ks <source key> <dropped frames | first-pass fps> ["note"]');
  process.exit(2);
}
if (note) check.detail += '; ' + note;
const r = appendManualCheck(S11_ID, check);
console.log(`${check.name}: ${check.pass ? 'PASS' : 'FAIL'} (${check.detail}); S11 now: ${r.verdict}`);
