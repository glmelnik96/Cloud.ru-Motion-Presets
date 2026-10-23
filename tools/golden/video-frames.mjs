#!/usr/bin/env node
// Golden frames from a rendered video, for a pack comp that exists only as its render (D12: the vertical podcast intro):
// the frames at the given times as PNG into <work>/golden/<slug>/<name>/t<ms>.png, the colour premultiplied by alpha as
// AE's saveFrameToPng writes it, so tools/masters/compare.mjs reads them as it reads the comp goldens.
//   node tools/golden/video-frames.mjs --file <mov> --slug podcast --name render_zastavka_9x16 [--fps 25] [--ms 0,240,...]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { ffmpeg } from '../masters/preview.mjs';

// The pack goldens' moments (docs/research/golden: every 0.25 s on the frame grid), up to a duration.
export function goldenMs(durationSec, fps = 25) {
  const out = [];
  for (let t = 0; t < durationSec - 1e-9; t += 0.25) out.push(Math.round(Math.round(t * fps) * 1000 / fps));
  const last = Math.round((Math.round(durationSec * fps) - 1) * 1000 / fps);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function videoFrames({ file, slug, name, fps = 25, ms }) {
  const dir = workPath('golden', slug, name);
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const m of ms) {
    const out = path.posix.join(dir, `t${m}.png`);
    // an intra-only render (ProRes, Animation) seeks to the frame exactly
    ffmpeg(['-ss', (m / 1000).toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'format=rgba,premultiply=inplace=1', '-pix_fmt', 'rgba', out], `${name} t${m}`);
    written.push(out);
  }
  return { dir, written };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const fps = Number(get('--fps') || 25);
  const ms = get('--ms') ? get('--ms').split(',').map(Number) : goldenMs(Number(get('--duration') || 7), fps);
  const r = videoFrames({ file: get('--file'), slug: get('--slug'), name: get('--name'), fps, ms });
  console.log(`wrote ${r.written.length} frames into ${r.dir}`);
}
