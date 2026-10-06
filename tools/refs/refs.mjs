#!/usr/bin/env node
// Video references of the effects the user wants in the panel: what the reference shows, so that it can be
// studied and rebuilt in AE or Premiere without the video at hand.
//   node tools/refs/refs.mjs add <url | file> --slug <slug> [--note "что нравится, таймкоды"]
//   node tools/refs/refs.mjs fetch [--slug <slug>]       downloads the links with yt-dlp into <work>/refs/
//   node tools/refs/refs.mjs analyze [--slug <slug>] [--strip 1.5,2] [--every 1]
// The list is docs/research/refs/refs.json. The videos stay in <work>/refs/ (someone else's work: not in git);
// docs/research/refs/<slug>/ gets what is small and enough to study:
//   probe.json      size, fps, duration, codec
//   sheet.jpg       one frame per --every seconds (or 16 spread over the video), 4 to a row, with timecodes
//   cuts.json/.jpg  the scene changes (ffmpeg scene > 0.3) and the first frame after each
//   motion.json     the motion energy per frame (mean difference to the previous frame, 0..255) and the spans
//                   above a quarter of its peak, cuts left out: where something moves, how long a move lasts
//   strip-<t>.jpg   every frame of a short span (--strip start,duration): the curve of a move frame by frame
//   notes.md        the template the analysis fills: what moves, how, by what technique in AE / Premiere
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LIST = path.join(REPO, 'docs', 'research', 'refs', 'refs.json');
const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi|gif)$/i;

export const slugOk = (s) => /^[a-z0-9][a-z0-9-]{1,40}$/.test(String(s));
const r3 = (v) => Math.round(v * 1000) / 1000;

export function readList(file = LIST) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { refs: [] };
}

export function addRef(list, { source, slug, note = '' }) {
  if (!slugOk(slug)) throw new Error(`slug: латиница, цифры и дефис, 2–41 знак: ${slug}`);
  if (list.refs.some((r) => r.slug === slug)) throw new Error(`slug ${slug} уже есть`);
  const url = /^https?:\/\//i.test(source);
  list.refs.push({ slug, url: url ? source : null, file: url ? null : String(source).replace(/\\/g, '/'), note, added: new Date().toISOString().slice(0, 10) });
  return list;
}

// The local video of a reference: its file, or what fetch left in <work>/refs/<slug>.*.
export function videoOf(ref, dir) {
  if (ref.file && existsSync(ref.file)) return ref.file;
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => f.startsWith(`${ref.slug}.`) && VIDEO.test(f));
  return hit ? path.join(dir, hit).replace(/\\/g, '/') : null;
}

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

export function probe(file) {
  const p = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(p.stdout || '{}');
  const v = (j.streams ?? []).find((s) => s.codec_type === 'video');
  if (!v) return null;
  const [a, b] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
  return { w: v.width, h: v.height, fps: b ? r3(a / b) : null, duration: r3(Number(j.format?.duration ?? v.duration ?? 0)), codec: v.codec_name, audio: (j.streams ?? []).some((s) => s.codec_type === 'audio') };
}

const tc = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// Scene changes: pts_time of the frames whose scene score passes the threshold.
export function parseShowinfo(stderr) {
  return [...String(stderr).matchAll(/pts_time:\s*([0-9.]+)/g)].map((m) => r3(Number(m[1])));
}

// Motion energy: the mean of |frame - previous| per frame (ffmpeg tblend difference + signalstats YAVG).
export function parseYavg(stdout) {
  const out = [];
  let t = null;
  for (const line of String(stdout).split(/\r?\n/)) {
    const pts = /pts_time:([0-9.]+)/.exec(line);
    if (pts) t = Number(pts[1]);
    const y = /lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(line);
    if (y && t !== null) out.push({ t: r3(t), e: r3(Number(y[1])) });
  }
  return out;
}

// Spans where the energy stays above a threshold (a share of the peak): the moves and how long they last.
// Cuts are not motion: the frames at a cut (within 1.5 frames) are left out first.
export function motionSpans(all, { share = 0.25, minGap = 2, cuts = [], fps = 25 } = {}) {
  const curve = all.filter((p) => !cuts.some((c) => Math.abs(p.t - c) <= 1.5 / fps));
  const peak = Math.max(0, ...curve.map((p) => p.e));
  if (!peak) return [];
  const th = peak * share;
  const spans = [];
  let cur = null;
  let gap = 0;
  for (const p of curve) {
    if (p.e >= th) {
      if (!cur) cur = { start: p.t, end: p.t, peak: p.e, peakAt: p.t };
      cur.end = p.t;
      if (p.e > cur.peak) Object.assign(cur, { peak: p.e, peakAt: p.t });
      gap = 0;
    } else if (cur) {
      gap += 1;
      if (gap > minGap) {
        spans.push(cur);
        cur = null;
        gap = 0;
      }
    }
  }
  if (cur) spans.push(cur);
  return spans.map((s) => ({ ...s, dur: r3(s.end - s.start) }));
}

const font = () => (process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : '');

export function analyze(file, outDir, { every = null, strips = [] } = {}) {
  mkdirSync(outDir, { recursive: true });
  const info = probe(file);
  if (!info) throw new Error(`не видео: ${file}`);
  writeFileSync(path.join(outDir, 'probe.json'), JSON.stringify(info, null, 1) + '\n');
  const step = every ?? Math.max(info.duration / 16, 1 / (info.fps || 25));
  const label = `drawtext=${font()}text='%{pts\\:hms}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6`;
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `fps=1/${step},scale=320:-2,${label},tile=4x4:padding=4`, '-frames:v', '1', '-q:v', '3', path.join(outDir, 'sheet.jpg')]);
  const sc = run('ffmpeg', ['-hide_banner', '-i', file, '-vf', "select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-']);
  const cuts = parseShowinfo(sc.stderr);
  writeFileSync(path.join(outDir, 'cuts.json'), JSON.stringify(cuts, null, 1) + '\n');
  if (cuts.length) {
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `select='gt(scene,0.3)',scale=320:-2,${label},tile=4x4:padding=4`, '-frames:v', '1', '-vsync', 'vfr', '-q:v', '3', path.join(outDir, 'cuts.jpg')]);
  }
  const me = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'scale=480:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:file=-', '-an', '-f', 'null', '-']);
  const curve = parseYavg(me.stdout);
  const spans = motionSpans(curve, { cuts, fps: info.fps || 25 });
  writeFileSync(path.join(outDir, 'motion.json'), JSON.stringify({ fps: info.fps, spans, curve }, null, 0) + '\n');
  const made = [];
  for (const [start, dur] of strips) {
    const name = `strip-${String(start).replace('.', '_')}.jpg`;
    const n = Math.ceil(dur * (info.fps || 25));
    const cols = Math.min(8, n);
    run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(dur), '-i', file, '-vf', `scale=240:-2,drawtext=${font()}text='%{n}':x=4:y=4:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${Math.ceil(n / cols)}:padding=2`, '-frames:v', '1', '-q:v', '3', path.join(outDir, name)]);
    made.push(name);
  }
  const notes = path.join(outDir, 'notes.md');
  if (!existsSync(notes)) {
    writeFileSync(notes, [`# ${path.basename(outDir)}`, '', `Видео: ${info.w}×${info.h}, ${info.fps} к/с, ${info.duration} с${info.audio ? ', со звуком' : ''}.`, '',
      `Склейки: ${cuts.map(tc).join(', ') || 'нет'}.`, '', `Движения (энергия выше четверти пика): ${spans.map((s) => `${tc(s.start)}–${tc(s.end)} (${s.dur} с)`).join('; ') || 'нет'}.`, '',
      '## Что нравится', '', '## Что движется и как', '', '## Как повторить (AE / Premiere / панель)', ''].join('\n'));
  }
  return { info, cuts, spans, strips: made };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...argv] = process.argv.slice(2);
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const dir = workPath('refs');
  const list = readList();
  const pick = opt('--slug') ? list.refs.filter((r) => r.slug === opt('--slug')) : list.refs;
  if (cmd === 'add') {
    addRef(list, { source: argv[0], slug: opt('--slug'), note: opt('--note') ?? '' });
    mkdirSync(path.dirname(LIST), { recursive: true });
    writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n', 'utf8');
    console.log(`added ${opt('--slug')}`);
  } else if (cmd === 'fetch') {
    mkdirSync(dir, { recursive: true });
    for (const r of pick.filter((x) => x.url)) {
      if (videoOf(r, dir)) { console.log(`have ${r.slug}`); continue; }
      const y = spawnSync('yt-dlp', ['-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4', '-o', path.join(dir, `${r.slug}.%(ext)s`), r.url], { stdio: 'inherit' });
      console.log(`${y.status === 0 ? 'fetched' : 'FAILED'} ${r.slug}`);
    }
  } else if (cmd === 'analyze') {
    const strips = (opt('--strip') ? [opt('--strip')] : []).map((s) => s.split(',').map(Number));
    for (const r of pick) {
      const v = videoOf(r, dir);
      if (!v) { console.log(`no video for ${r.slug}: run fetch, or add a file`); continue; }
      const res = analyze(v, path.join(REPO, 'docs', 'research', 'refs', r.slug), { every: opt('--every') ? Number(opt('--every')) : null, strips });
      console.log(`${r.slug}: ${res.info.w}x${res.info.h} ${res.info.fps} fps ${res.info.duration} s, ${res.cuts.length} cuts, ${res.spans.length} moves${res.strips.length ? `, ${res.strips.join(', ')}` : ''}`);
    }
  } else {
    console.error('usage: node tools/refs/refs.mjs add <url|file> --slug <slug> [--note ...] | fetch [--slug s] | analyze [--slug s] [--strip start,dur] [--every sec]');
    process.exit(2);
  }
}
