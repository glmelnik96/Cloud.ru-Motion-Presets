#!/usr/bin/env node
// Fixture media for the phase 0 spikes, written to <work>/fixtures/media (an ASCII path).
//   node spikes/fixtures/make-media.mjs [--force]
// The slot PNGs are drawn with pngjs; video and audio come from ffmpeg lavfi sources.
// Idempotent: an existing non-empty file is kept unless --force is given.
import { existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';

export const MEDIA = [
  { name: 'slot_a.png', kind: 'png', w: 400, h: 400, hex: '#0063FF' },
  { name: 'slot_b.png', kind: 'png', w: 400, h: 400, hex: '#FF4517' },
  {
    name: 'bars_1080p25_30s.mp4', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25'],
  },
  {
    name: 'bars2_1080p25_10s.mp4', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'smptebars=size=1920x1080:rate=25:duration=10',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25'],
  },
  {
    // A 200x200 #26D07C box moving right at 300 px/s over a fully transparent frame.
    name: 'alpha_prores4444_1080p25_5s.mov', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'color=c=black@0.0:s=1920x1080:r=25:d=5,format=rgba',
      '-f', 'lavfi', '-i', 'color=c=0x26D07C:s=200x200:r=25:d=5,format=rgba',
      '-filter_complex', '[0:v][1:v]overlay=x=100+t*300:y=440:format=auto,format=yuva444p10le[v]',
      '-map', '[v]', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
      '-alpha_bits', '16', '-vendor', 'apl0'],
  },
  {
    name: 'tone_48k_5s.wav', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5', '-ac', '2', '-c:a', 'pcm_s16le'],
  },
];

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) throw new Error('bad hex colour: ' + hex);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function solidPng(w, h, hex) {
  const [r, g, b] = hexToRgb(hex);
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function ffmpegArgs(spec, outPath) {
  return ['-y', '-hide_banner', '-loglevel', 'error', ...spec.args, outPath];
}

// ffmpeg: binary name, or false to skip every ffmpeg file (unit tests). only: list of names to make.
export function makeMedia({ dir = workPath('fixtures', 'media'), force = false, ffmpeg = 'ffmpeg', only = null } = {}) {
  ensureDir(dir);
  const canFfmpeg = ffmpeg ? hasBinary(ffmpeg) : false;
  const out = [];
  for (const spec of MEDIA) {
    if (only && !only.includes(spec.name)) continue;
    const file = path.posix.join(String(dir).replace(/\\/g, '/'), spec.name);
    if (!force && existsSync(file) && statSync(file).size > 0) {
      out.push({ name: spec.name, file, status: 'exists', bytes: statSync(file).size });
      continue;
    }
    if (spec.kind === 'png') {
      writeFileSync(file, solidPng(spec.w, spec.h, spec.hex));
      out.push({ name: spec.name, file, status: 'created', bytes: statSync(file).size });
      continue;
    }
    if (!canFfmpeg) {
      out.push({ name: spec.name, file, status: 'skipped-no-ffmpeg', bytes: 0 });
      continue;
    }
    const r = spawnSync(ffmpeg, ffmpegArgs(spec, file), { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(file)) {
      rmSync(file, { force: true });      // a half-written output of ours, never a source file
      out.push({ name: spec.name, file, status: 'failed', bytes: 0,
        error: String(r.stderr || r.error || '').trim().slice(0, 500) });
      continue;
    }
    out.push({ name: spec.name, file, status: 'created', bytes: statSync(file).size });
  }
  return out;
}

function describeFile(r) {
  if (r.name.endsWith('.png') || !hasBinary('ffprobe')) return '';
  const s = probeMedia(r.file);
  if (s.video) return `${s.video.codec}/${s.video.profile || '-'} ${s.video.width}x${s.video.height} ${s.video.fps}fps ${s.video.pixFmt} ${s.duration}s`;
  return `${s.audio.codec} ${s.audio.sampleRate}Hz ${s.audio.channels}ch ${s.duration}s`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const res = makeMedia({ force: process.argv.includes('--force') });
  let bad = 0;
  for (const r of res) {
    const ready = r.status === 'created' || r.status === 'exists';
    if (!ready) bad += 1;
    const info = ready ? describeFile(r) : (r.error || '');
    console.log(`${r.status.padEnd(18)} ${r.name.padEnd(34)} ${String(r.bytes).padStart(10)}  ${info}`);
  }
  if (bad) {
    console.error(bad + ' file(s) not ready: install ffmpeg (ffmpeg -version must work) or see the errors above');
    process.exit(1);
  }
}
