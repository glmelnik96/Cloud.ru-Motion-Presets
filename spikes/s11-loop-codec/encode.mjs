#!/usr/bin/env node
// S11: T2 loop codec. Cuts 10 s from three package renders into <work>/s11 as ProRes 4444 (stream copy of
// the AE render and a prores_ks re-encode) and as PNG in MOV, measures MB/s and ffmpeg decode speed
// (1 thread and default threads) and writes:
//   spikes/results/S11.json       automatic checks (stage auto:<platform>), manual checks are kept
//   spikes/results/S11.data.json  all numbers, per platform
//   <work>/s11/bitrates.json      MB/s per megapixel per codec for the weight estimate (part F)
//   node spikes/s11-loop-codec/encode.mjs [--package "<package folder>"] [--seconds 10]
// The package defaults to sourceRoot() of tools/packs/paths.mjs (plan 2, task 1; BRANDKIT_SOURCE).
// It is only read: ffmpeg reads the sources, every output goes to the work folder.
import { existsSync, mkdirSync, readFileSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { sourceRoot } from '../../tools/packs/paths.mjs';
import { RESULTS_DIR } from '../../tools/spike/result.mjs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { machineInfo } from '../../tools/spike/machine.mjs';
import {
  S11_ID, S11_TITLE, S11_FALLBACK, S11_SOURCES, VARIANTS, FPS, resolveNfc, encodeArgs, decodeArgs, parseProbe,
  parseBench, decodeFps, mbPerSec, perMegapixel, buildChecks, bitratesTable, formatTable,
} from './lib.mjs';

const argv = process.argv.slice(2);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const pkg = val('--package', sourceRoot());
const seconds = Number(val('--seconds', '10'));
const tag = process.platform;

function ffprobe(file) {
  return parseProbe(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,r_frame_rate:format=duration', '-of', 'json', file],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed (${r.status}): ${String(r.stderr).slice(-600)}`);
  return r.stderr;
}

function ffmpegVersion() {
  const first = execFileSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' }).split('\n')[0];
  const m = /ffmpeg version (\S+)/.exec(first);
  return 'ffmpeg ' + (m ? m[1] : first);
}

if (!existsSync(pkg)) {
  console.error(`package not found: ${pkg} (pass --package or set BRANDKIT_SOURCE)`);
  process.exit(2);
}
const outDir = ensureDir(workPath('s11'));
const free = statfsSync(outDir);
const freeGb = (free.bavail * free.bsize) / 1e9;
if (freeGb < 8) {
  console.error(`only ${freeGb.toFixed(1)} GB free in ${outDir}; S11 needs about 8 GB`);
  process.exit(2);
}

const rows = [];
for (const s of S11_SOURCES) {
  const src = resolveNfc(pkg, s.rel);
  const sp = ffprobe(src);
  const row = { key: s.key, label: s.label, source: s.rel, startSec: s.startSec, w: sp.w, h: sp.h, fps: sp.fps, variants: {} };
  for (const v of VARIANTS) {
    const out = path.posix.join(outDir, `${s.key}_${v}.mov`);
    const t0 = Date.now();
    ffmpeg(encodeArgs(v, src, s.startSec, seconds, out));
    const encodeMs = Date.now() - t0;
    const p = ffprobe(out);
    const bytes = statSync(out).size;
    const one = parseBench(ffmpeg(decodeArgs(out, 1)));
    const many = parseBench(ffmpeg(decodeArgs(out, 0)));
    const mbps = mbPerSec(bytes, p.frames, p.fps || FPS);
    row.frames = p.frames;
    row.variants[v] = {
      file: out, bytes, frames: p.frames, encodeMs, mbps, mbpsPerMp: perMegapixel(mbps, row.w, row.h),
      dec1Fps: decodeFps(one.frames || p.frames, one.rtime), decNFps: decodeFps(many.frames || p.frames, many.rtime),
    };
    console.log(`${s.key} ${v}: ${(bytes / 1e6).toFixed(1)} MB for ${p.frames} frames`);
  }
  rows.push(row);
}

const date = new Date().toISOString().slice(0, 10);
const table = bitratesTable(rows, { date, platform: tag });
const bitratesFile = path.posix.join(outDir, 'bitrates.json');
writeFileSync(bitratesFile, JSON.stringify(table, null, 2) + '\n', 'utf8');

const mFile = path.join(RESULTS_DIR, 'S11.data.json');
const all = existsSync(mFile) ? JSON.parse(readFileSync(mFile, 'utf8')) : {};
all[tag] = { date, machine: machineInfo(), ffmpeg: ffmpegVersion(), seconds, rows, bitrates: table };
mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(mFile, JSON.stringify(all, null, 2) + '\n', 'utf8');

const result = writeStageResult({
  id: S11_ID, title: S11_TITLE, host: 'ffmpeg+pr+ae', hostVersion: ffmpegVersion(), stage: 'auto:' + tag,
  checks: buildChecks(rows, tag), fallback: S11_FALLBACK,
  notes: 'Автоматическая часть — размеры файлов и декодирование ffmpeg; решение по кодеку — вместе с ручной '
    + 'проверкой воспроизведения в Premiere и AE (задача 21). Цифры: spikes/results/S11.data.json.',
  evidence: ['spikes/results/S11.data.json', bitratesFile],
});
console.log('\n' + formatTable(rows).join('\n'));
console.log(`\nbitrates: ${bitratesFile}`);
console.log(`S11: ${result.verdict} (${result.checks.length} checks) -> spikes/results/S11.json`);
