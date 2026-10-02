#!/usr/bin/env node
// Task 15: the Premiere fixture in the open project CRT_pr_test.prproj (BrandKit Dev panel, CDP 8096).
//   node spikes/fixtures/pr/build.mjs           build it, or only check it when the sequence exists
//   node spikes/fixtures/pr/build.mjs --check   compose and lint the probe with real PARAMS, no host
// Writes spikes/fixtures/pr/fixture.json: the checks, the sequence ID and the track occupancy.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lintOrThrow } from '../../../tools/host-run.mjs';
import { composeProbe, REPO } from '../../../tools/spike/runner.mjs';
import { runStage } from '../../../tools/spike/multistage.mjs';
import { workPath } from '../../../tools/lib/work.mjs';
import { hasBinary, probeMedia } from '../../../tools/lib/media-probe.mjs';
import {
  PR_PROJECT_FILE, PR_FIXTURE_SEQ, PR_MEDIA_BIN, TPF_25, presetSources, stagePreset, fixtureMedia,
} from '../../../tools/pr/env.mjs';

const FILES = ['spikes/lib/pr-helpers.jsx', 'spikes/fixtures/pr/build-seq.jsx'];
const OUT = path.join(REPO, 'spikes', 'fixtures', 'pr', 'fixture.json');
const MEDIA = [
  { name: 'bars_1080p25_30s.mp4', sec: 30 },
  { name: 'bars2_1080p25_10s.mp4', sec: 10 },
];
const checkOnly = process.argv.includes('--check');

// Task 7 media, checked before Premiere sees them.
function mediaProblems() {
  if (!hasBinary('ffprobe')) return ['ffprobe not found: install ffmpeg (ffprobe -version must work)'];
  const out = [];
  for (const m of MEDIA) {
    const f = fixtureMedia(m.name);
    if (!existsSync(f)) {
      out.push('missing ' + f + ' (part B, Task 7)');
      continue;
    }
    const s = probeMedia(f);
    const v = s.video || {};
    if (v.width !== 1920 || v.height !== 1080 || Math.abs(v.fps - 25) > 0.01 || Math.abs(s.duration - m.sec) > 0.1) {
      out.push(m.name + ': ' + JSON.stringify({ w: v.width, h: v.height, fps: v.fps, duration: s.duration })
        + ', expected 1920x1080, 25 fps, ' + m.sec + ' s');
    }
  }
  return out;
}

const params = {
  projectFile: PR_PROJECT_FILE,
  seqName: PR_FIXTURE_SEQ,
  binName: PR_MEDIA_BIN,
  tpf: TPF_25,
  preset: checkOnly ? workPath('pr', 'presets', 'HD_1080p_25fps.sqpreset')
    : stagePreset(presetSources().seq1080p25, 'HD_1080p_25fps.sqpreset'),
  bars: fixtureMedia('bars_1080p25_30s.mp4'),
  bars2: fixtureMedia('bars2_1080p25_10s.mp4'),
};

if (checkOnly) {
  lintOrThrow(composeProbe(FILES, params));
  console.log('OK build-seq.jsx composed with real PARAMS and linted');
} else {
  const problems = mediaProblems();
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exitCode = 2;
  } else {
    const r = await runStage({ host: 'pr', files: FILES, params, timeoutMs: 180000 });
    writeFileSync(OUT, JSON.stringify({ date: new Date().toISOString().slice(0, 10), hostVersion: r.hostVersion,
      checks: r.checks, data: r.data }, null, 2) + '\n', 'utf8');
    for (const c of r.checks) {
      console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.pass ? '' : ' - ' + JSON.stringify(c.detail)));
    }
    for (const t of (r.data.occupancy ? r.data.occupancy.video.concat(r.data.occupancy.audio) : [])) {
      console.log(t.track + ': ' + (t.items.map((i) => i.name + ' ' + i.startF + '-' + i.endF).join(', ') || 'empty'));
    }
    const bad = r.checks.filter((c) => c.required !== false && !c.pass);
    console.log(bad.length ? 'fixture NOT ready' : 'fixture ready (' + (r.data.existed ? 'checked' : 'built') + '): ' + OUT);
    process.exitCode = bad.length ? 1 : 0;
  }
}
