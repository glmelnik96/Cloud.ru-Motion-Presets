// Premiere side of part D: names of the Task 15 fixture, the Premiere install folder and the system
// presets that Node copies under the ASCII work folder. ExtendScript sees only <work> paths (plan conventions).
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { workPath, ensureDir } from '../lib/work.mjs';

export const TICKS_PER_SECOND = 254016000000;
export const TPF_25 = TICKS_PER_SECOND / 25; // 10160640000 ticks per 25p frame
export const PR_PROJECT_FILE = 'CRT_pr_test.prproj';
export const PR_FIXTURE_SEQ = 'CRT_Seq_1080p25';
export const PR_MEDIA_BIN = 'CRT_Media';

// The folder that holds Settings/ and MediaIO/. Same variable and defaults as part E (s8-perf prPaths).
export function prRoot(env = process.env, platform = process.platform) {
  return String(env.BRANDKIT_PR_ROOT || (platform === 'darwin'
    ? '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents'
    : 'C:/Program Files/Adobe/Adobe Premiere Pro 2026')).replace(/\\/g, '/');
}

export function presetSources(env = process.env, platform = process.platform) {
  const root = prRoot(env, platform);
  return {
    seq1080p25: root + '/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset',
    pngStill: root + '/MediaIO/systempresets/3F3F3F3F_504E4720/PNG Sequence (Match Source).epr',
  };
}

// Node copies a preset into <work>/pr/presets under a plain ASCII name; the install path never reaches JSX.
export function stagePreset(src, name, dir = workPath('pr', 'presets')) {
  if (!existsSync(src)) throw new Error('preset not found: ' + src + ' (set BRANDKIT_PR_ROOT)');
  ensureDir(dir);
  const dst = path.posix.join(String(dir).replace(/\\/g, '/'), name);
  copyFileSync(src, dst);
  return dst;
}

// Frames of an earlier attempt look exactly like fresh ones (ae-quirks #27): before a stage exports frames,
// <key>.png and <key>_direct*.png of its keys are removed from the frames folder. Returns how many.
export function clearFrames(dir, keys) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (keys.some((k) => f === k + '.png' || f.startsWith(k + '_direct'))) {
      rmSync(path.join(dir, f), { force: true });
      n += 1;
    }
  }
  return n;
}

export function fixtureMedia(name) {
  return workPath('fixtures', 'media', name);
}

// PARAMS shared by the Premiere stages of S5-S7 (spikes/lib/pr-helpers.jsx reads them).
// copy: false gives the same PARAMS without touching the install (the --check modes, no Premiere needed).
export function prBaseParams({ copy = true } = {}) {
  return {
    projectFile: PR_PROJECT_FILE,
    srcSeq: PR_FIXTURE_SEQ,
    binName: PR_MEDIA_BIN,
    tpf: TPF_25,
    pngPreset: copy ? stagePreset(presetSources().pngStill, 'PNG_still.epr') : workPath('pr', 'presets', 'PNG_still.epr'),
    frameWaitMs: 5000,
  };
}
