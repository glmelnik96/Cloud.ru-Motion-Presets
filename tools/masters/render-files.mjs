#!/usr/bin/env node
// The files of a master that is delivered as files (spec 4.1 T2/T3; D9 CRS_LectureFrame, TRN_StepWipe): the stills,
// loops and clips its resolve lists in `files`, rendered in AE from the packaged project as the golden comparison
// renders (tools/masters/jsx/render-case.jsx), into <work>/build/<id>/ under the names the catalog build takes:
//   still        the frame at t                          -> <id>_<key>_v<N>.png, RGBA
//   loop, clip   the frames of [0, seconds), in batches  -> <id>_<key>_v<N>.mov, PNG in MOV, rgba (D24)
// A loop stops a frame before its period, so played end to end it repeats without a seam; a clip (a transition) is
// played once.
//   node tools/masters/render-files.mjs --item CRS_LectureFrame [--only key,key] [--keep-frames]
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan, withDefaults } from './package.mjs';
import { ffmpeg } from './preview.mjs';

// Frames per host call: AE writes them after the call returns, a batch at a time keeps its queue short.
export const BATCH = 250;

// AE's saveFrameToPng stores the colour multiplied by alpha (an edge of white at alpha 64 is 64,64,64), while PNG
// and the hosts that read the files take it straight: divided back, or every soft edge gets a dark rim.
export const UNPREMULTIPLY = ['-vf', 'unpremultiply=inplace=1'];

export function fileName(params, f) {
  return `${params.id}_${f.key}_v${params.version}.${f.kind === 'still' ? 'png' : 'mov'}`;
}

// The times of a loop's or a clip's frames: [0, seconds) on the frame grid of the comp.
export function loopTimes(seconds, fps) {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n }, (_, i) => Math.round((i / fps) * 1e6) / 1e6);
}

async function render(params, f, frames) {
  const v = variantPlan(params).find((x) => x.key === f.variant);
  if (!v) throw new Error(`${f.key}: no variant ${f.variant}`);
  const set = withDefaults(params, f.ctrl, {});
  const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
    workDir: params.workDir, aep: packagePaths(params).aep, comp: v.comp, ctrl: set.ctrl, text: set.text, frames,
  });
  const r = await run('ae', body, { timeoutMs: 600000 });
  if (printChecks(r.checks, () => {})) throw new Error(`${f.key}: render call failed: ${JSON.stringify(r.checks).slice(0, 400)}`);
  await waitForStableFiles(frames.map((x) => x.file), { timeoutMs: 1200000 });
}

export async function renderFiles(id, { only = null, keepFrames = false } = {}) {
  const { params } = await loadMaster(id);
  if (!params.files || !params.files.length) throw new Error(`${id}: the master lists no files`);
  const fps = params.comp.fps;
  const out = [];
  try {
    for (const f of params.files) {
      if (only && !only.includes(f.key)) continue;
      const file = path.posix.join(params.out.dir, fileName(params, f));
      rmSync(file, { force: true });
      if (f.kind === 'still') {
        const raw = file.replace(/\.png$/, '.raw.png');
        await render(params, f, [{ t: f.t, file: raw }]);
        ffmpeg(['-i', raw, ...UNPREMULTIPLY, '-pix_fmt', 'rgba', file], `${f.key}.png`);
        rmSync(raw, { force: true });
      } else if (f.kind === 'loop' || f.kind === 'clip') {
        const dir = path.posix.join(params.out.dir, 'loop-frames', f.key);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        const frames = loopTimes(f.seconds, fps).map((t, i) => ({ t, file: path.posix.join(dir, `f${String(i).padStart(5, '0')}.png`) }));
        for (let i = 0; i < frames.length; i += BATCH) await render(params, f, frames.slice(i, i + BATCH));
        ffmpeg(['-framerate', String(fps), '-i', path.posix.join(dir, 'f%05d.png'), ...UNPREMULTIPLY, '-c:v', 'png', '-pix_fmt', 'rgba', '-an', file], `${f.key}.mov`);
        if (!keepFrames) rmSync(dir, { recursive: true, force: true });
      } else {
        throw new Error(`${f.key}: unknown kind ${f.kind}`);
      }
      if (!existsSync(file)) throw new Error(`${f.key}: ${file} was not written`);
      const bytes = statSync(file).size;
      out.push({ key: f.key, file, bytes });
      console.log(`ok   ${path.posix.basename(file)} ${(bytes / 1048576).toFixed(1)} MB`);
    }
  } finally {
    const close = composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) + '\nJSON.stringify({ checks: [], released: bkReleaseProject() });';
    await run('ae', close, { timeoutMs: 120000 }).catch((e) => console.error('close: ' + e.message));
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  try {
    const r = await renderFiles(get('--item'), { only: get('--only') ? get('--only').split(',') : null, keepFrames: argv.includes('--keep-frames') });
    console.log(`rendered ${r.length} files, ${(r.reduce((s, x) => s + x.bytes, 0) / 1048576).toFixed(1)} MB`);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  }
}
