#!/usr/bin/env node
// Test projects for the panel's live E2E (plan 2026-10-05, task 10): one target per format of pack 1, plus a frame
// with no variant (QHD, the NO_VARIANT refusal) and, in AE, a 30 fps comp (the FPS_MISMATCH warning). They live
// in the ASCII work folder; the user's projects are never opened, saved or closed (the JSX helpers refuse).
//   node tools/panel/fixtures.mjs --host ae|pr
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe } from '../spike/runner.mjs';
import { printChecks } from '../masters/build-master.mjs';
import { workDir, workPath, ensureDir } from '../lib/work.mjs';
import { presetSources, stagePreset } from '../pr/env.mjs';

export const AE_FIXTURE = () => workPath('panel', 'CRT_panel_ae.aep');
export const PR_FIXTURE = () => workPath('pr', 'CRT_panel_pr.prproj');

export const TARGETS = [
  { key: '16x9', w: 1920, h: 1080 },
  { key: '16x9_4K', w: 3840, h: 2160 },
  { key: '9x16', w: 1080, h: 1920 },
  { key: '1x1', w: 1080, h: 1080 },
  { key: 'QHD', w: 2560, h: 1440 },
];

export const AE_COMPS = [
  ...TARGETS.map((t) => ({ name: 'T_' + t.key, w: t.w, h: t.h, fps: 25, dur: 30 })),
  { name: 'T_16x9_30p', w: 1920, h: 1080, fps: 30, dur: 30 },
];
export const PR_SEQS = TARGETS.map((t) => ({ name: 'S_' + t.key, w: t.w, h: t.h }));

export async function ensureFixture(host) {
  if (host === 'ae') {
    ensureDir(workPath('panel'));
    const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/panel/jsx/fixture-ae.jsx'], {
      workDir: workDir(), path: AE_FIXTURE(), comps: AE_COMPS,
    });
    const r = await run('ae', body, { timeoutMs: 120000 });
    if (printChecks(r.checks, () => {})) throw new Error('AE fixture failed: ' + JSON.stringify(r.checks));
    return r.data;
  }
  const seqPreset = stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset');
  const body = composeProbe(['spikes/lib/pr-helpers.jsx', 'tools/panel/jsx/fixture-pr.jsx'], {
    path: PR_FIXTURE(), seqPreset, seqs: PR_SEQS,
  });
  const r = await run('pr', body, { timeoutMs: 180000 });
  if (printChecks(r.checks, () => {})) throw new Error('Premiere fixture failed: ' + JSON.stringify(r.checks));
  return r.data;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--host');
  const host = i > 0 ? process.argv[i + 1] : 'ae';
  if (host !== 'ae' && host !== 'pr') throw new Error('--host ae|pr');
  const data = await ensureFixture(host);
  console.log(JSON.stringify(data, null, 1));
}
