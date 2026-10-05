#!/usr/bin/env node
// Card previews of a packaged master (spec 4.4 step 5, spec 7 «Играет только карточка под курсором, 480 px
// MP4»): AE renders frames of one variant with chosen values (tools/masters/jsx/render-case.jsx, as the
// golden comparison does), ffmpeg lays them over a backdrop and writes
//   <work>/build/<id>/preview.mp4   480 px wide, H.264, no sound, the whole template once
//   <work>/build/<id>/poster.jpg    the same width, one frame in the hold
// where tools/library/build-catalog.mjs picks them up.
//   node tools/masters/preview.mjs --item TTL_LowerThird [--no-render]
// What each item shows comes from "preview" in masters/<id>/ref.json:
//   { "variant": "16x9", "ctrl": { "Style": 1 }, "text": { "TXT_NAME": "..." }, "backdrop": "#5A5A5A", "fps": 12.5 }
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan } from './package.mjs';

export const PREVIEW_WIDTH = 480;
export const DEFAULTS = { variant: '16x9', ctrl: {}, text: {}, backdrop: '#222222', fps: 12.5 };

// Template length and the poster moment (the middle of the hold) from the item's duration in library.src.json.
export function previewSpec(item, ref = {}) {
  const spec = { ...DEFAULTS, ...(ref.preview || {}) };
  const d = item.duration;
  const D = Math.round((d.introSec + d.holdSec + d.outroSec) * 1e6) / 1e6;
  return { ...spec, durationSec: D, posterSec: spec.posterSec ?? Math.round((d.introSec + d.holdSec / 2) * 1e6) / 1e6 };
}

// Frame times on the preview grid, the last one inside the template.
export function previewFrames(spec, dir) {
  const n = Math.max(1, Math.floor(spec.durationSec * spec.fps + 1e-6));
  return Array.from({ length: n }, (_, i) => ({ t: Math.round((i / spec.fps) * 1e6) / 1e6, file: path.posix.join(dir, `f${String(i).padStart(4, '0')}.png`) }));
}

const hex = (c) => '0x' + c.replace('#', '').toUpperCase();

// ffmpeg arguments: the frames over the backdrop, scaled to the card width (even height), H.264 yuv420p.
export function videoArgs({ dir, spec, w, h, out }) {
  return [
    '-f', 'lavfi', '-i', `color=c=${hex(spec.backdrop)}:s=${w}x${h}:r=${spec.fps}`,
    '-framerate', String(spec.fps), '-i', path.posix.join(dir, 'f%04d.png'),
    '-filter_complex', `[0:v][1:v]overlay=shortest=1:format=auto,scale=${PREVIEW_WIDTH}:-2:flags=lanczos,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', out,
  ];
}

export function posterArgs({ frame, spec, w, h, out }) {
  return [
    '-f', 'lavfi', '-i', `color=c=${hex(spec.backdrop)}:s=${w}x${h}`,
    '-i', frame,
    '-filter_complex', `[0:v][1:v]overlay=format=auto,scale=${PREVIEW_WIDTH}:-2:flags=lanczos[v]`,
    '-map', '[v]', '-frames:v', '1', '-q:v', '3', out,
  ];
}

export function ffmpeg(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: process.platform === 'win32' ? 'C:/' : os.tmpdir(), encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26,
  });
  if (r.status !== 0) throw new Error(`${label}: ffmpeg ${r.status}: ${(r.stderr || '').slice(0, 1500)}`);
}

// Encodes the rendered frames; the poster is the frame nearest to spec.posterSec.
export function encodePreview({ dir, spec, w, h, outDir }) {
  const frames = previewFrames(spec, dir);
  const posterIndex = Math.min(frames.length - 1, Math.round(spec.posterSec * spec.fps));
  const video = path.posix.join(outDir, 'preview.mp4');
  const poster = path.posix.join(outDir, 'poster.jpg');
  ffmpeg(videoArgs({ dir, spec, w, h, out: video }), 'preview.mp4');
  ffmpeg(posterArgs({ frame: frames[posterIndex].file, spec, w, h, out: poster }), 'poster.jpg');
  return { video, poster, frames: frames.length, posterSec: frames[posterIndex].t };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const id = argv.includes('--item') ? argv[argv.indexOf('--item') + 1] : null;
  const { params } = await loadMaster(id);
  const src = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
  const item = src.items.find((i) => i.id === id);
  const refFile = path.join(REPO, 'masters', id, 'ref.json');
  const spec = previewSpec(item, existsSync(refFile) ? JSON.parse(readFileSync(refFile, 'utf8')) : {});
  const v = variantPlan(params).find((x) => x.key === spec.variant);
  if (!v) throw new Error(`${id}: no variant ${spec.variant}`);
  const outDir = params.out.dir;
  const dir = path.posix.join(outDir, 'preview-frames');
  const frames = previewFrames(spec, dir);
  try {
    if (!argv.includes('--no-render')) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
        workDir: params.workDir, aep: packagePaths(params).aep, comp: v.comp, ctrl: spec.ctrl, text: spec.text, frames: frames.map((f) => ({ t: f.t, file: f.file })),
      });
      const r = await run('ae', body, { timeoutMs: 600000 });
      if (printChecks(r.checks)) throw new Error('render call failed');
      await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 600000 });
      const close = composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) + '\nJSON.stringify({ checks: [], released: bkReleaseProject() });';
      await run('ae', close, { timeoutMs: 120000 });
    }
    const r = encodePreview({ dir, spec, w: v.w, h: v.h, outDir });
    console.log(`OK ${r.video} (${r.frames} frames at ${spec.fps} fps), ${r.poster} at ${r.posterSec} s`);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  }
}
