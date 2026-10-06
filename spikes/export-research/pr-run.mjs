// Drive the Premiere half of the export research.
//   node spikes/export-research/pr-run.mjs setup
//   node spikes/export-research/pr-run.mjs export
//   node spikes/export-research/pr-run.mjs ame
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { run } from '../../tools/host-run.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { presetSources, stagePreset } from '../../tools/pr/env.mjs';
import { attribute, probeExport } from './media.mjs';

const ARCHIVE = 'C:/CRBK/archive/2026-10-02/7_Пресеты_Media_Encoder';
const ROOT = workPath('export-research');
const EPR = path.posix.join(ROOT, 'epr');
const MEDIA = path.posix.join(ROOT, 'media');
const OUT = path.posix.join(ROOT, 'pr', 'out');
const PROJECT = path.posix.join(ROOT, 'pr', 'probe.prproj');
const SEQ = 'CRBK_ExportProbe';
const FFMPEG = 'C:/ffmpeg/bin/ffmpeg.exe';
const REPO_EXPORT = path.resolve('docs/research/export');

export const PRESETS = [
  '4K.epr',
  'FullHD.epr',
  'SMM_1440x1080.epr',
  'SMM_16x9.epr',
  'SMM_1x1.epr',
  'SMM_9x16.epr',
  'Webinar_Final render.epr',
  'Webinar_Timer.epr',
  'Webinar_Zastavka.epr',
];

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg ' + args.join(' ') + '\n' + (r.stderr || '').slice(-500));
}

export function makeSources() {
  ensureDir(MEDIA);
  const clip2 = path.posix.join(MEDIA, 'src-2s.mp4');
  const tone2 = path.posix.join(MEDIA, 'tone-2s.wav');
  const clip10 = path.posix.join(MEDIA, 'src-10s.mp4');
  const tone10 = path.posix.join(MEDIA, 'tone-10s.wav');
  if (!existsSync(clip2)) {
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0x26D07C:s=1920x1080:r=25:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', clip2]);
  }
  if (!existsSync(tone2)) {
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=2', '-c:a', 'pcm_s16le', tone2]);
  }
  if (!existsSync(clip10)) {
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0x26D07C:s=1920x1080:r=25:d=10',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=10',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', clip10]);
  }
  if (!existsSync(tone10)) {
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=10', '-c:a', 'pcm_s16le', tone10]);
  }
  return { clip2, tone2, clip10, tone10 };
}

export function stageEpr() {
  ensureDir(EPR);
  const map = {};
  for (const name of PRESETS) {
    const dst = path.posix.join(EPR, name);
    if (!existsSync(dst)) copyFileSync(path.join(ARCHIVE, name), dst);
    map[name] = dst;
  }
  return map;
}

async function host(params, timeoutMs) {
  const jsx = composeProbe(['spikes/lib/pr-helpers.jsx', 'spikes/export-research/pr-probe.jsx'], params);
  return run('pr', jsx, { timeoutMs });
}

function baseParams(extra) {
  return Object.assign({
    project: PROJECT,
    seqName: SEQ,
    seqPreset: stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset', path.posix.join(ROOT, 'pr', 'presets')),
    inSec: 0,
    outSec: 2,
  }, extra);
}

async function setup() {
  const src = makeSources();
  stageEpr();
  const a = await host(baseParams({ op: 'setup', clip: src.clip2, outSec: 2, seqName: 'CRBK_ExportProbe' }), 120000);
  console.log('2s ' + JSON.stringify(a.data || a));
  const b = await host(baseParams({ op: 'setup', clip: src.clip10, outSec: 10, seqName: 'CRBK_Export10' }), 120000);
  console.log('10s ' + JSON.stringify(b.data || b));
  return { a, b };
}

function inventory() {
  return JSON.parse(readFileSync(path.join(REPO_EXPORT, 'epr-inventory.json'), 'utf8'));
}

function safe(name) {
  return name.replace(/\.epr$/i, '').replace(/[^\w.-]+/g, '_');
}

async function exportAll() {
  const epr = stageEpr();
  const inv = inventory();
  const byFile = Object.fromEntries(inv.presets.map((p) => [p.file, p]));
  ensureDir(OUT);
  const source = probeExport(path.posix.join(MEDIA, 'src-2s.mp4'));
  const results = [];
  for (const name of PRESETS) {
    const out = path.posix.join(OUT, safe(name) + '.mp4');
    const t0 = Date.now();
    let hostResult = null;
    let error = null;
    try {
      hostResult = await host(baseParams({
        op: 'export', label: name, epr: epr[name], out, inSec: 0, outSec: 2,
      }), 240000);
    } catch (e) {
      error = String(e.message || e);
    }
    let file = null;
    let attr = null;
    if (!error && existsSync(out)) {
      try {
        file = probeExport(out);
        attr = attribute(byFile[name], file, { width: 1920, height: 1080, fps: 25, audioSampleRate: 48000 });
      } catch (e2) {
        error = 'ffprobe: ' + e2.message;
      }
    }
    const row = {
      file: name,
      preset: byFile[name] && {
        size: byFile[name].video.width + 'x' + byFile[name].video.height,
        fps: byFile[name].video.fps,
        profileCode: byFile[name].video.profile.code,
        level: byFile[name].video.level.label,
        targetBitrateMbps: byFile[name].video.targetBitrateMbps,
        maxBitrateMbps: byFile[name].video.maxBitrateMbps,
        audio: byFile[name].audio,
      },
      out,
      hostMs: hostResult && hostResult.data && hostResult.data.export ? hostResult.data.export.ms : null,
      wallMs: Date.now() - t0,
      returned: hostResult && hostResult.data && hostResult.data.export ? hostResult.data.export.returned : null,
      checks: hostResult ? hostResult.checks : null,
      error,
      probed: file,
      attribute: attr,
    };
    results.push(row);
    console.log(name + ' ' + (error || ('ok ' + row.hostMs + 'ms ' + (file && file.video ? file.video.width + 'x' + file.video.height + ' ' + file.video.fps + 'fps ' + file.video.profile : ''))));
    writeReport(source, results);
  }
  return results;
}

function writeReport(source, results) {
  mkdirSync(REPO_EXPORT, { recursive: true });
  const doc = {
    sequence: { width: 1920, height: 1080, fps: 25, durationSec: 2, picture: 'flat #26D07C', audio: '1 kHz sine, AAC 48 kHz stereo in the source clip' },
    source: source,
    note: 'A flat colour underruns a VBR target, so the file bitrate is not the preset target. Size, fps, profile and audio sample rate are the comparison.',
    exports: results,
  };
  writeFileSync(path.join(REPO_EXPORT, 'pr-epr.json'), JSON.stringify(doc, null, 2) + '\n');
}

async function ame(outName, seconds, seqName) {
  const epr = stageEpr();
  ensureDir(OUT);
  const out = path.posix.join(OUT, outName);
  const t0 = Date.now();
  const hostResult = await host(baseParams({
    op: 'ame', label: 'FullHD', epr: epr['FullHD.epr'], out, inSec: 0, outSec: seconds, seqName,
  }), 120000);
  console.log(JSON.stringify(hostResult.data || hostResult, null, 2));
  const file = await waitFile(out, 300000, t0);
  console.log(JSON.stringify(file));
  return { host: hostResult.data, file, wallMs: Date.now() - t0 };
}

function waitFile(file, timeoutMs, t0) {
  return new Promise((resolve) => {
    let last = -1;
    let stable = 0;
    const timer = setInterval(() => {
      if (!existsSync(file)) {
        if (Date.now() - t0 > timeoutMs) { clearInterval(timer); resolve({ error: 'timeout', ms: Date.now() - t0 }); }
        return;
      }
      let size = 0;
      try { size = statSync(file).size; } catch (e) { size = 0; }
      if (size > 0 && size === last) {
        stable += 1;
        if (stable >= 3) {
          clearInterval(timer);
          let probed = null;
          try { probed = probeExport(file); } catch (e) { probed = { error: e.message }; }
          resolve({ ms: Date.now() - t0, bytes: size, probed });
        }
      } else {
        stable = 0;
        last = size;
      }
    }, 1000);
  });
}

async function time10() {
  const epr = stageEpr();
  ensureDir(OUT);
  const out = path.posix.join(OUT, 'fullhd-10s.mp4');
  const t0 = Date.now();
  const hostResult = await host(baseParams({
    op: 'export', label: 'FullHD-10s', epr: epr['FullHD.epr'], out,
    seqName: 'CRBK_Export10', inSec: 0, outSec: 10,
  }), 300000);
  const row = {
    method: 'premiere-direct',
    out,
    hostMs: hostResult.data && hostResult.data.export ? hostResult.data.export.ms : null,
    wallMs: Date.now() - t0,
    bytes: hostResult.data && hostResult.data.export ? hostResult.data.export.bytes : null,
    inOut: hostResult.data && hostResult.data.inOut,
    probed: existsSync(out) ? probeExport(out) : null,
    error: hostResult.checks && hostResult.checks.some((c) => c.pass === false) ? hostResult.checks : null,
  };
  console.log(JSON.stringify(row));
  return row;
}

const cmd = process.argv[2];
if (cmd === 'setup') await setup();
else if (cmd === 'export') await exportAll();
else if (cmd === 'ame') await ame(process.argv[3] || 'ame-10s.mp4', Number(process.argv[4] || 10), process.argv[5] || SEQ);
else if (cmd === 'time10') await time10();
else if (cmd === 'media') console.log(makeSources());
else {
  console.error('usage: pr-run.mjs setup|export|ame|media');
  process.exit(2);
}
