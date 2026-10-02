#!/usr/bin/env node
// Record one manual playback observation for S8 (Program Monitor, dropped frame indicator, 10 s from 00:00).
//   node spikes/s8-perf/playback.mjs S8_podcast_FHD Full 0 ["note"]
import { appendManualCheck } from '../../tools/spike/result.mjs';
import { S8_ID, machineKey, playbackCheck } from './lib.mjs';

const [seq, res, dropped, note] = process.argv.slice(2);
let check;
try {
  check = playbackCheck({ host: machineKey(), seq, res, dropped });
} catch (e) {
  console.error(e.message + '\nusage: node spikes/s8-perf/playback.mjs <S8_sequence> Full|1/2 <dropped frames> ["note"]');
  process.exit(2);
}
if (note) check.detail += '; ' + note;
const r = appendManualCheck(S8_ID, check);
console.log(`${check.name}: ${check.pass ? 'PASS' : 'FAIL'} (${check.detail}); S8 now: ${r.verdict}`);
